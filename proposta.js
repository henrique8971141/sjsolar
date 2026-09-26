// proposta.js
// TELA PRÓPRIA DA PROPOSTA — completamente separada do editor de Orçamento
// (orcamentos.js / orcamento-editor-tab). Não reutiliza nada da lógica de
// Orçamento Avulso: tem seu próprio estado de edição, suas próprias
// funções de abrir/salvar/fechar e sua própria seção no HTML
// (proposta-editor-tab).
//
// A Proposta só existe vinculada a um Projeto (é o fluxo
// Projeto -> Propostas -> "Clique aqui para criar"). Por enquanto grava na
// mesma tabela Supabase "orcamentos" (para continuar aparecendo na
// listagem geral, no dashboard e usando a exportação PDF/DOCX já
// existentes), mas a TELA de edição é inteiramente própria.
//
// Etapas implementadas nesta primeira versão: 2.3.1 Cliente e Serviço e
// 2.3.2 Localização. As demais (2.3.3 Unidades Consumidoras em diante)
// ainda não existem — não implementar aqui até serem pedidas.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { switchTab } from './ui.js';
import { determinarDistribuidora, DISTRIBUIDORAS_CONHECIDAS } from './localizacao.js';
import { irParaSubTabProjeto } from './router.js';

const STEPS = ['cliente-servico', 'localizacao'];

const STEP_ATIVO = "proposta-step-link border-amber-500 text-slate-900";
const STEP_INATIVO = "proposta-step-link border-transparent text-slate-400 hover:text-slate-700";

// ------------------------------------------------------------------
// Navegação entre as etapas da Proposta
// ------------------------------------------------------------------
export function switchPropostaStep(step) {
    STEPS.forEach(s => {
        const painel = document.getElementById(`proposta-step-${s}`);
        const link = document.querySelector(`[data-proposta-step="${s}"]`);
        if (painel) painel.classList.toggle('hidden', s !== step);
        if (link) link.className = s === step ? STEP_ATIVO : STEP_INATIVO;
    });
}

function popularSelectDistribuidoraProposta() {
    const select = document.getElementById('proposta-loc-distribuidora');
    if (!select || select.dataset.populado) return;
    select.innerHTML = '<option value="">Selecione</option>' +
        DISTRIBUIDORAS_CONHECIDAS.map(d => `<option value="${d}">${d}</option>`).join('');
    select.dataset.populado = '1';
}

// Mostra/esconde o campo de descrição livre quando "Outro" é selecionado
// no Tipo de Telhado. Exposta em window porque é chamada via onchange
// inline no HTML (mesmo padrão usado no restante do arquivo).
function toggleTipoTelhadoOutroProposta() {
    const select = document.getElementById('proposta-loc-tipo-telhado');
    const wrap = document.getElementById('proposta-loc-tipo-telhado-outro-wrap');
    if (!select || !wrap) return;
    wrap.classList.toggle('hidden', select.value !== 'Outro');
}
window.__toggleTipoTelhadoOutroProposta = toggleTipoTelhadoOutroProposta;

// Carrega a Localização (2.3.2) a partir da localização de instalação do
// Projeto — nunca do endereço cadastral do Cliente, que é um conceito
// diferente. Fonte: state.localProjetos, campos instalacao_*.
function preencherLocalizacaoDaProposta(projeto) {
    popularSelectDistribuidoraProposta();

    document.getElementById('proposta-loc-cep').value = projeto.instalacao_cep || '';
    document.getElementById('proposta-loc-endereco').value = projeto.instalacao_endereco_completo || '';
    document.getElementById('proposta-loc-numero').value = projeto.instalacao_numero || '';
    document.getElementById('proposta-loc-complemento').value = projeto.instalacao_complemento || '';
    document.getElementById('proposta-loc-bairro').value = projeto.instalacao_bairro || '';
    document.getElementById('proposta-loc-cidade').value = projeto.instalacao_cidade || '';
    document.getElementById('proposta-loc-uf').value = projeto.instalacao_estado || '';

    // Tipo de telhado é campo próprio da Proposta (não vem do Projeto).
    // Reseta a cada abertura; editarProposta() preenche por cima se já
    // houver valor salvo.
    document.getElementById('proposta-loc-tipo-telhado').value = '';
    document.getElementById('proposta-loc-tipo-telhado-outro').value = '';
    toggleTipoTelhadoOutroProposta();

    const distribuidoraSelect = document.getElementById('proposta-loc-distribuidora');
    const badge = document.getElementById('proposta-loc-distribuidora-auto-badge');
    const distribuidoraAuto = determinarDistribuidora(projeto.instalacao_estado, projeto.instalacao_cidade);
    if (distribuidoraAuto) {
        distribuidoraSelect.value = distribuidoraAuto;
        badge.classList.remove('hidden');
    } else {
        distribuidoraSelect.value = '';
        badge.classList.add('hidden');
    }
}

function getClienteDaProposta(clienteId) {
    return state.localClientes.find(c => String(c.id) === String(clienteId)) || null;
}

// ------------------------------------------------------------------
// Abrir a tela própria da Proposta
// ------------------------------------------------------------------

// Nova Proposta a partir de um Projeto (único fluxo de criação por
// enquanto): cliente e projeto vêm do Projeto e não são escolhidos aqui.
export function abrirNovaProposta(projeto) {
    if (!projeto) return;
    const cliente = getClienteDaProposta(projeto.cliente_id);

    document.getElementById('proposta-id').value = '';
    document.getElementById('proposta-projeto-id').value = projeto.id;
    document.getElementById('proposta-cliente-id').value = projeto.cliente_id;
    document.getElementById('proposta-cliente-nome').value = cliente ? cliente.nome : '';
    document.getElementById('proposta-projeto-nome').value = projeto.nome;
    document.getElementById('proposta-tipo').value = 'Energia Fotovoltaica On-Grid';
    document.getElementById('proposta-tipo-detalhado').value = '';

    preencherLocalizacaoDaProposta(projeto);

    document.getElementById('proposta-editor-title').textContent = 'Nova Proposta';
    document.getElementById('proposta-editor-subtitle').textContent = `Projeto: ${projeto.nome}`;

    switchPropostaStep('cliente-servico');
    switchTab('proposta-editor-tab');
}

// Reabre uma Proposta já existente (registro salvo na tabela orcamentos)
// na tela própria de Proposta — nunca no editor de Orçamento.
export function editarProposta(id) {
    const o = state.localOrcamentos.find(item => item.id === id);
    if (!o) return;
    const projeto = state.localProjetos.find(p => String(p.id) === String(o.projeto_id));
    if (!projeto) return;
    const cliente = getClienteDaProposta(o.cliente_id);

    document.getElementById('proposta-id').value = o.id;
    document.getElementById('proposta-projeto-id').value = projeto.id;
    document.getElementById('proposta-cliente-id').value = o.cliente_id;
    document.getElementById('proposta-cliente-nome').value = cliente ? cliente.nome : '';
    document.getElementById('proposta-projeto-nome').value = projeto.nome;
    document.getElementById('proposta-tipo').value = o.tipo_orcamento;
    document.getElementById('proposta-tipo-detalhado').value = o.tipo_servico_detalhado || '';

    // Localização: sempre a partir do Projeto (não do que foi salvo no
    // orçamento antes), para refletir qualquer edição feita no Projeto.
    preencherLocalizacaoDaProposta(projeto);
    if (o.distribuidora) {
        document.getElementById('proposta-loc-distribuidora').value = o.distribuidora;
        document.getElementById('proposta-loc-distribuidora-auto-badge').classList.add('hidden');
    }
    if (o.tipo_telhado) {
        document.getElementById('proposta-loc-tipo-telhado').value = o.tipo_telhado;
        // Se o valor salvo não bate com nenhuma opção fixa, é uma descrição
        // livre de "Outro" (comportamento igual ao já usado pelo Orçamento).
        if (!document.getElementById('proposta-loc-tipo-telhado').value) {
            document.getElementById('proposta-loc-tipo-telhado').value = 'Outro';
            document.getElementById('proposta-loc-tipo-telhado-outro').value = o.tipo_telhado;
        }
        toggleTipoTelhadoOutroProposta();
    }

    document.getElementById('proposta-editor-title').textContent = 'Editar Proposta';
    document.getElementById('proposta-editor-subtitle').textContent = `Projeto: ${projeto.nome}`;

    switchPropostaStep('cliente-servico');
    switchTab('proposta-editor-tab');
}

// Fecha a Proposta e volta para a sub-aba de Propostas dentro do Projeto,
// usando o Router já existente (mantém a URL /projeto/:id/orcamentos
// coerente, sem duplicar navegação).
export function closePropostaEditor() {
    irParaSubTabProjeto('orcamentos');
}

// ------------------------------------------------------------------
// Salvar (grava na tabela "orcamentos" para manter compatibilidade com a
// listagem geral, o dashboard e a exportação PDF/DOCX já existentes)
// ------------------------------------------------------------------
export async function salvarProposta() {
    const id = document.getElementById('proposta-id').value;
    const projeto_id = document.getElementById('proposta-projeto-id').value;
    const cliente_id = document.getElementById('proposta-cliente-id').value;

    if (!projeto_id || !cliente_id) {
        alert("Proposta sem Projeto/Cliente vinculado — reabra a partir do Projeto.");
        return;
    }

    const hoje = new Date().toISOString().split('T')[0];
    const validade = new Date();
    validade.setDate(validade.getDate() + 15);

    const tipoTelhadoSelecionado = document.getElementById('proposta-loc-tipo-telhado').value;
    const tipoTelhado = tipoTelhadoSelecionado === 'Outro'
        ? (document.getElementById('proposta-loc-tipo-telhado-outro').value || null)
        : (tipoTelhadoSelecionado || null);

    // Campos das etapas ainda não implementadas (2.3.3 em diante) recebem
    // valores neutros só para satisfazer colunas obrigatórias da mesma
    // tabela "orcamentos" usada pelo Orçamento — nada disso é editável
    // nesta tela ainda, e será substituído quando essas etapas existirem.
    const payload = {
        cliente_id,
        projeto_id,
        tipo_orcamento: document.getElementById('proposta-tipo').value,
        tipo_servico_detalhado: document.getElementById('proposta-tipo-detalhado').value,
        distribuidora: document.getElementById('proposta-loc-distribuidora').value || null,
        tipo_telhado: tipoTelhado,
        valor_equipamentos: 0,
        valor_mao_de_obra: 0,
        valor_outros: 0,
        status_comercial: 'Em Negociação',
        status_execucao: 'A iniciar',
        data_emissao: hoje,
        validade_proposta: validade.toISOString().split('T')[0]
    };

    try {
        if (id) {
            const { error } = await state.supabaseClient.from('orcamentos').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await state.supabaseClient.from('orcamentos').insert(payload);
            if (error) throw error;
        }
        await syncFromSupabase();
    } catch (err) {
        alert("Erro ao gravar a proposta: " + err.message);
        return;
    }
    closePropostaEditor();
}
