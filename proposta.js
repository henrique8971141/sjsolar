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
// Etapas implementadas até agora: Cliente e Serviço, Localização,
// Unidades Consumidoras (2.3.3), Kit Gerador / Equipamentos (2.3.4),
// Revisão (5, que junta as antigas 2.3.6 e 2.3.7) e Arquivos (6: data,
// pré-visualização do PDF e download de PDF/DOCX).

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { switchTab } from './ui.js';
import { determinarDistribuidora, DISTRIBUIDORAS_CONHECIDAS, UFS, buscarEnderecoPorCep, getMunicipiosPorUf, buscarMunicipios } from './localizacao.js';
import { irParaSubTabProjeto } from './router.js';
import { carregarUnidadesConsumidoras } from './unidades-consumidoras.js';
import { carregarKitGerador } from './kit-gerador.js';
import { carregarRevisaoProposta } from './revisao-proposta.js';
import { carregarArquivosProposta } from './arquivos-proposta.js';

const STEPS = ['cliente-servico', 'localizacao', 'unidades-consumidoras', 'kit-gerador', 'revisao', 'arquivos'];

let passoAtualProposta = 'cliente-servico';
let listenersLocalizacaoLigados = false;

// ------------------------------------------------------------------
// Navegação entre as etapas da Proposta
// ------------------------------------------------------------------
export async function switchPropostaStep(step) {
    passoAtualProposta = step;
    const idxAtual = STEPS.indexOf(step);
    STEPS.forEach((s, i) => {
        const painel = document.getElementById(`proposta-step-${s}`);
        const link = document.querySelector(`[data-proposta-step="${s}"]`);
        if (painel) painel.classList.toggle('hidden', s !== step);
        if (link) {
            // active = etapa atual | done = etapas anteriores (✓) | todo = próximas
            const estado = i === idxAtual ? 'active' : (i < idxAtual ? 'done' : 'todo');
            link.dataset.state = estado;
            link.querySelector('.pstep-circle').innerHTML = estado === 'done' ? '<i class="fa-solid fa-check"></i>' : String(i + 1);
            // a linha que liga esta etapa à próxima fica "preenchida" quando já passou
            const linha = link.nextElementSibling;
            if (linha && linha.classList.contains('pstep-line')) linha.dataset.done = i < idxAtual ? '1' : '0';
        }
    });
    atualizarBotaoRodapeProposta();

    // Unidades Consumidoras (2.3.3) pertencem à Proposta já gravada (tabela
    // "orcamentos"), então, ao entrar nesta etapa, garantimos primeiro que
    // a Proposta já tem um id (gravando/atualizando Cliente e Serviço +
    // Localização) antes de carregar/permitir cadastrar UCs.
    if (step === 'unidades-consumidoras') {
        const ok = await salvarDadosBaseProposta();
        if (!ok) {
            switchPropostaStep('cliente-servico');
            return;
        }
        await carregarUnidadesConsumidoras(document.getElementById('proposta-id').value);
    }

    // Kit Gerador / Equipamentos (2.3.4) também pertence à Proposta já
    // gravada (tabela "orcamentos"), pelo mesmo motivo das Unidades
    // Consumidoras: precisa de um proposta_id antes de gravar equipamentos.
    if (step === 'kit-gerador') {
        const ok = await salvarDadosBaseProposta();
        if (!ok) {
            switchPropostaStep('cliente-servico');
            return;
        }
        await carregarKitGerador(document.getElementById('proposta-id').value);
    }

    // Revisão (5): lê tudo o que já foi gravado nas etapas
    // anteriores, então também precisa da Proposta já gravada.
    if (step === 'revisao') {
        const ok = await salvarDadosBaseProposta();
        if (!ok) {
            switchPropostaStep('cliente-servico');
            return;
        }
        await carregarRevisaoProposta(document.getElementById('proposta-id').value);
    }

    // Arquivos (6): data + pré-visualização do PDF + download. Usa a revisão
    // (valor final) e a proposta já gravada.
    if (step === 'arquivos') {
        const ok = await salvarDadosBaseProposta();
        if (!ok) {
            switchPropostaStep('cliente-servico');
            return;
        }
        const id = document.getElementById('proposta-id').value;
        await carregarRevisaoProposta(id);
        await carregarArquivosProposta(id);
    }
}

// O rodapé mostra "Próximo" em toda etapa que não seja a última já
// implementada, e "Salvar Proposta" só na última (por enquanto,
// Localização). Quando novas etapas forem criadas,
// basta adicioná-las a STEPS — este código não precisa mudar.
function atualizarBotaoRodapeProposta() {
    const isUltimaEtapa = passoAtualProposta === STEPS[STEPS.length - 1];
    document.getElementById('btn-proposta-avancar').classList.toggle('hidden', isUltimaEtapa);
    document.getElementById('btn-salvar-proposta').classList.toggle('hidden', !isUltimaEtapa);
}

// Chamado pelo botão "Próximo": avança para a etapa seguinte da lista.
export async function avancarPropostaStep() {
    const idx = STEPS.indexOf(passoAtualProposta);
    if (idx === -1 || idx === STEPS.length - 1) return;
    await switchPropostaStep(STEPS[idx + 1]);
}

function popularSelectDistribuidoraProposta() {
    const select = document.getElementById('proposta-loc-distribuidora');
    if (!select || select.dataset.populado) return;
    select.innerHTML = '<option value="">Selecione</option>' +
        DISTRIBUIDORAS_CONHECIDAS.map(d => `<option value="${d}">${d}</option>`).join('');
    select.dataset.populado = '1';
}

function popularSelectUfProposta() {
    const select = document.getElementById('proposta-loc-uf');
    if (!select || select.dataset.populado) return;
    select.innerHTML = '<option value="">Selecione</option>' +
        UFS.map(uf => `<option value="${uf}">${uf}</option>`).join('');
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

// Liga (uma única vez) os listeners de CEP e autocomplete de cidade dos
// campos de localização da Proposta. Igual ao padrão já usado em
// clientes.js, mas gravando só nos campos da Proposta — nunca no Cliente.
function ligarListenersLocalizacaoProposta() {
    if (listenersLocalizacaoLigados) return;
    listenersLocalizacaoLigados = true;

    const ufSelect = document.getElementById('proposta-loc-uf');
    const cepField = document.getElementById('proposta-loc-cep');
    const cidadeField = document.getElementById('proposta-loc-cidade');
    const cidadeDropdown = document.getElementById('proposta-loc-cidade-dropdown');

    ufSelect.addEventListener('change', () => {
        if (ufSelect.value) getMunicipiosPorUf(ufSelect.value);
        atualizarDistribuidoraAutomaticaProposta();
    });

    cepField.addEventListener('blur', async () => {
        const endereco = await buscarEnderecoPorCep(cepField.value);
        if (!endereco) return;
        if (endereco.logradouro) document.getElementById('proposta-loc-endereco').value = endereco.logradouro;
        if (endereco.bairro) document.getElementById('proposta-loc-bairro').value = endereco.bairro;
        if (endereco.uf) {
            ufSelect.value = endereco.uf;
            await getMunicipiosPorUf(endereco.uf);
        }
        if (endereco.cidade) cidadeField.value = endereco.cidade;
        atualizarDistribuidoraAutomaticaProposta();
    });

    const renderCidades = async () => {
        if (!ufSelect.value) {
            cidadeDropdown.innerHTML = '<div class="text-xs text-slate-400 px-3 py-2">Selecione a UF primeiro.</div>';
            cidadeDropdown.classList.remove('hidden');
            return;
        }
        const resultados = await buscarMunicipios(ufSelect.value, cidadeField.value);
        cidadeDropdown.innerHTML = resultados.length === 0
            ? '<div class="text-xs text-slate-400 px-3 py-2">Nenhuma cidade encontrada.</div>'
            : resultados.map(nome => `<button type="button" data-cidade="${nome}" class="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">${nome}</button>`).join('');
        cidadeDropdown.querySelectorAll('[data-cidade]').forEach(btn => {
            btn.addEventListener('click', () => {
                cidadeField.value = btn.dataset.cidade;
                cidadeDropdown.classList.add('hidden');
                atualizarDistribuidoraAutomaticaProposta();
            });
        });
        cidadeDropdown.classList.remove('hidden');
    };
    cidadeField.addEventListener('focus', renderCidades);
    cidadeField.addEventListener('input', renderCidades);
    cidadeField.addEventListener('blur', () => atualizarDistribuidoraAutomaticaProposta());
    document.addEventListener('click', (e) => {
        if (!cidadeField.contains(e.target) && !cidadeDropdown.contains(e.target)) {
            cidadeDropdown.classList.add('hidden');
        }
    });
}

// Recalcula a distribuidora automática a partir do que está preenchido
// nos campos de UF/cidade da Proposta neste momento (não sobrescreve se
// o usuário já tiver escolhido manualmente e o badge estiver escondido).
function atualizarDistribuidoraAutomaticaProposta() {
    const badge = document.getElementById('proposta-loc-distribuidora-auto-badge');
    if (badge.classList.contains('hidden') && document.getElementById('proposta-loc-distribuidora').dataset.manual === '1') return;

    const uf = document.getElementById('proposta-loc-uf').value;
    const cidade = document.getElementById('proposta-loc-cidade').value;
    const distribuidoraSelect = document.getElementById('proposta-loc-distribuidora');
    const distribuidoraAuto = determinarDistribuidora(uf, cidade);
    if (distribuidoraAuto) {
        distribuidoraSelect.value = distribuidoraAuto;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Preenche a Localização (endereço da instalação) a partir do endereço
// cadastrado do Cliente, quando existir — mas os campos ficam editáveis
// e nada aqui é regravado no Cliente. Usada apenas ao criar uma Proposta
// nova; ao reabrir uma existente, os valores salvos na própria Proposta
// prevalecem (ver editarProposta).
function preencherLocalizacaoDaProposta(cliente) {
    popularSelectUfProposta();
    popularSelectDistribuidoraProposta();
    ligarListenersLocalizacaoProposta();

    document.getElementById('proposta-loc-cep').value = cliente?.cep || '';
    document.getElementById('proposta-loc-endereco').value = cliente?.endereco_completo || '';
    document.getElementById('proposta-loc-numero').value = cliente?.numero || '';
    document.getElementById('proposta-loc-complemento').value = cliente?.complemento || '';
    document.getElementById('proposta-loc-bairro').value = cliente?.bairro || '';
    document.getElementById('proposta-loc-uf').value = cliente?.estado || '';
    document.getElementById('proposta-loc-cidade').value = cliente?.cidade || '';
    if (cliente?.estado) getMunicipiosPorUf(cliente.estado);

    document.getElementById('proposta-loc-tipo-telhado').value = '';
    document.getElementById('proposta-loc-tipo-telhado-outro').value = '';
    toggleTipoTelhadoOutroProposta();

    document.getElementById('proposta-loc-distribuidora').dataset.manual = '';
    atualizarDistribuidoraAutomaticaProposta();
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

    preencherLocalizacaoDaProposta(cliente);

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

    // Localização: começa a partir do Cliente (mesmo comportamento de
    // abrirNovaProposta) e, na sequência, sobrescreve com o que já foi
    // salvo especificamente nesta Proposta, se houver.
    preencherLocalizacaoDaProposta(cliente);

    if (o.instalacao_cep) document.getElementById('proposta-loc-cep').value = o.instalacao_cep;
    if (o.instalacao_endereco) document.getElementById('proposta-loc-endereco').value = o.instalacao_endereco;
    if (o.instalacao_numero) document.getElementById('proposta-loc-numero').value = o.instalacao_numero;
    if (o.instalacao_complemento) document.getElementById('proposta-loc-complemento').value = o.instalacao_complemento;
    if (o.instalacao_bairro) document.getElementById('proposta-loc-bairro').value = o.instalacao_bairro;
    if (o.instalacao_uf) document.getElementById('proposta-loc-uf').value = o.instalacao_uf;
    if (o.instalacao_cidade) document.getElementById('proposta-loc-cidade').value = o.instalacao_cidade;
    if (o.instalacao_uf) getMunicipiosPorUf(o.instalacao_uf);

    if (o.distribuidora) {
        document.getElementById('proposta-loc-distribuidora').value = o.distribuidora;
        document.getElementById('proposta-loc-distribuidora').dataset.manual = '1';
        document.getElementById('proposta-loc-distribuidora-auto-badge').classList.add('hidden');
    } else {
        atualizarDistribuidoraAutomaticaProposta();
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
// Gravar Cliente e Serviço + Localização (grava na tabela "orcamentos"
// para manter compatibilidade com a listagem geral, o dashboard e a
// exportação PDF/DOCX já existentes). Reaproveitada tanto ao avançar da
// Localização para Unidades Consumidoras (para a Proposta já existir e
// ter um id antes de cadastrar UCs) quanto no botão final "Salvar
// Proposta". Nunca mexe em Unidades Consumidoras nem em nenhuma etapa
// futura — cada etapa grava só os seus próprios dados.
// ------------------------------------------------------------------
async function salvarDadosBaseProposta() {
    const id = document.getElementById('proposta-id').value;
    const projeto_id = document.getElementById('proposta-projeto-id').value;
    const cliente_id = document.getElementById('proposta-cliente-id').value;

    if (!projeto_id || !cliente_id) {
        alert("Proposta sem Projeto/Cliente vinculado — reabra a partir do Projeto.");
        return false;
    }

    const tipoTelhadoSelecionado = document.getElementById('proposta-loc-tipo-telhado').value;
    const tipoTelhado = tipoTelhadoSelecionado === 'Outro'
        ? (document.getElementById('proposta-loc-tipo-telhado-outro').value || null)
        : (tipoTelhadoSelecionado || null);

    const payloadBase = {
        cliente_id,
        projeto_id,
        tipo_orcamento: document.getElementById('proposta-tipo').value,
        tipo_servico_detalhado: document.getElementById('proposta-tipo-detalhado').value,
        instalacao_cep: document.getElementById('proposta-loc-cep').value || null,
        instalacao_endereco: document.getElementById('proposta-loc-endereco').value || null,
        instalacao_numero: document.getElementById('proposta-loc-numero').value || null,
        instalacao_complemento: document.getElementById('proposta-loc-complemento').value || null,
        instalacao_bairro: document.getElementById('proposta-loc-bairro').value || null,
        instalacao_cidade: document.getElementById('proposta-loc-cidade').value || null,
        instalacao_uf: document.getElementById('proposta-loc-uf').value || null,
        distribuidora: document.getElementById('proposta-loc-distribuidora').value || null,
        tipo_telhado: tipoTelhado
    };

    try {
        if (id) {
            const { error } = await state.supabaseClient.from('orcamentos').update(payloadBase).eq('id', id);
            if (error) throw error;
            return true;
        }

        // Primeira gravação desta Proposta: além dos campos acima, precisa
        // preencher colunas obrigatórias da tabela "orcamentos" (mesma
        // tabela do Orçamento) com valores neutros — nada disso é editável
        // nesta tela ainda, e será substituído quando as etapas de Kit
        // Gerador/preço existirem.
        const hoje = new Date().toISOString().split('T')[0];
        const validade = new Date();
        validade.setDate(validade.getDate() + 15);

        const { data, error } = await state.supabaseClient
            .from('orcamentos')
            .insert({
                ...payloadBase,
                valor_equipamentos: 0,
                valor_mao_de_obra: 0,
                valor_outros: 0,
                status_comercial: 'Em Negociação',
                status_execucao: 'A iniciar',
                data_emissao: hoje,
                validade_proposta: validade.toISOString().split('T')[0]
            })
            .select('id')
            .single();
        if (error) throw error;

        document.getElementById('proposta-id').value = data.id;
        return true;
    } catch (err) {
        alert("Erro ao gravar a proposta: " + err.message);
        return false;
    }
}

export async function salvarProposta() {
    const ok = await salvarDadosBaseProposta();
    if (!ok) return;
    await syncFromSupabase();
    closePropostaEditor();
}
