// orcamentos.js
// Editor de orçamento (formulário completo): cálculo de totais, validade,
// abrir/fechar o editor, cadastro inline de cliente, salvar (criar/editar),
// visualizar, excluir, e os snippets/formatação do campo de observações.
//
// Observação sobre o import circular com equipamentos.js: este arquivo usa
// addEquipmentRow/updateEquipmentsSuggestedTotal (importados de
// equipamentos.js), e equipamentos.js usa updateFormTotal (importado daqui).
// Isso é seguro em ES Modules porque nenhuma das duas pontas usa o valor
// importado no escopo top-level do módulo — só dentro de funções, que só
// rodam depois que ambos os módulos já terminaram de carregar.

import { state, SNIPPETS } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { switchTab } from './ui.js';
import { atualizarProjetosDoCliente } from './projetos.js';
import { initClienteAutocomplete } from './cliente-autocomplete.js';
import { addEquipmentRow, updateEquipmentsSuggestedTotal, getEquipmentsList } from './equipamentos.js';
import { addPagamentoRow, getPagamentosList } from './pagamentos.js';
import { determinarDistribuidora, DISTRIBUIDORAS_CONHECIDAS } from './localizacao.js';

export function handleValidadeChange() {
    const valSelect = document.getElementById('form-validade-select').value;
    const customContainer = document.getElementById('validade-custom-container');
    if (valSelect === 'custom') {
        customContainer.classList.remove('hidden');
    } else {
        customContainer.classList.add('hidden');
    }
}

export function getValidadeDias() {
    const valSelect = document.getElementById('form-validade-select').value;
    if (valSelect === 'custom') {
        const customVal = parseInt(document.getElementById('form-validade-custom').value);
        return isNaN(customVal) || customVal <= 0 ? 15 : customVal;
    }
    return parseInt(valSelect);
}

// Calcula subtotal, aplica desconto e devolve o total final
export function calcularTotais() {
    const valEquip = parseFloat(document.getElementById('form-val-equip').value) || 0;
    const valMao = parseFloat(document.getElementById('form-val-mao').value) || 0;
    const valOutros = parseFloat(document.getElementById('form-val-outros').value) || 0;
    const subtotal = valEquip + valMao + valOutros;

    const descontoValor = parseFloat(document.getElementById('form-desconto-valor').value) || 0;
    const descontoTipo = document.getElementById('form-desconto-tipo').value;
    let desconto = 0;
    if (descontoTipo === 'percentual') {
        desconto = subtotal * (descontoValor / 100);
    } else {
        desconto = descontoValor;
    }
    desconto = Math.min(desconto, subtotal);

    const total = subtotal - desconto;
    return { valEquip, valMao, valOutros, subtotal, desconto, descontoTipo, descontoValor, total };
}

export function updateFormTotal() {
    const { subtotal, total } = calcularTotais();
    document.getElementById('form-subtotal-display').textContent = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('form-val-total').value = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Arredondamento automático (#13): ajusta "Outros valores" para que o total feche no valor desejado
export function aplicarArredondamento() {
    const alvo = parseFloat(document.getElementById('form-arredondar-para').value);
    if (!alvo || alvo <= 0) {
        alert("Informe um valor válido para arredondar.");
        return;
    }
    const { valEquip, valMao, desconto } = calcularTotais();
    // total = valEquip + valMao + valOutrosNovo - desconto  =>  valOutrosNovo = alvo + desconto - valEquip - valMao
    const novoOutros = alvo + desconto - valEquip - valMao;
    if (novoOutros < 0) {
        alert("Não é possível arredondar para esse valor: equipamentos + mão de obra já ultrapassam o alvo. Ajuste manualmente.");
        return;
    }
    document.getElementById('form-val-outros').value = novoOutros.toFixed(2);
    updateFormTotal();
}

// Abre a página do editor de orçamento (em vez de modal)
export function openOrcamentoModal() {
    openOrcamentoEditor();
}

let clienteAutocompleteOrcamento = null;

// Preenche o <select> de distribuidora com as opções conhecidas. Chamado
// uma vez (o conteúdo é fixo) — reaproveita a mesma lista de
// localizacao.js usada para validar/permitir o ajuste manual.
function popularSelectDistribuidora() {
    const select = document.getElementById('form-loc-distribuidora');
    if (!select || select.dataset.populado) return;
    select.innerHTML = '<option value="">Selecione</option>' +
        DISTRIBUIDORAS_CONHECIDAS.map(d => `<option value="${d}">${d}</option>`).join('');
    select.dataset.populado = '1';
}

// Limpa a seção Localização (usado ao abrir um orçamento novo ou quando o
// cliente selecionado não tem dados de endereço).
function limparLocalizacao() {
    document.getElementById('form-loc-cep').value = '';
    document.getElementById('form-loc-endereco').value = '';
    document.getElementById('form-loc-numero').value = '';
    document.getElementById('form-loc-complemento').value = '';
    document.getElementById('form-loc-bairro').value = '';
    document.getElementById('form-loc-cidade').value = '';
    document.getElementById('form-loc-uf').value = '';
    document.getElementById('form-loc-distribuidora').value = '';
    document.getElementById('form-loc-distribuidora-auto-badge').classList.add('hidden');
}

// Copia o endereço do cliente selecionado para os campos (somente leitura)
// de Localização e tenta determinar a distribuidora pela UF/cidade do
// cliente. Não duplica o cadastro do cliente: os campos aqui são apenas
// uma cópia de exibição/consulta, a fonte continua sendo state.localClientes
// via cliente_id.
function preencherLocalizacaoDoCliente(clienteId) {
    popularSelectDistribuidora();
    const cliente = state.localClientes.find(c => String(c.id) === String(clienteId));
    if (!cliente) {
        limparLocalizacao();
        return;
    }

    document.getElementById('form-loc-cep').value = cliente.cep || '';
    document.getElementById('form-loc-endereco').value = cliente.endereco_completo || '';
    document.getElementById('form-loc-numero').value = cliente.numero || '';
    document.getElementById('form-loc-complemento').value = cliente.complemento || '';
    document.getElementById('form-loc-bairro').value = cliente.bairro || '';
    document.getElementById('form-loc-cidade').value = cliente.cidade || '';
    document.getElementById('form-loc-uf').value = cliente.estado || '';

    // Distribuidora: tenta determinar automaticamente pela localização do
    // cliente. Quando não há regra conhecida e segura, o campo fica em
    // branco para seleção manual (nunca "chuta" uma distribuidora).
    const distribuidoraSelect = document.getElementById('form-loc-distribuidora');
    const badge = document.getElementById('form-loc-distribuidora-auto-badge');
    const distribuidoraAuto = determinarDistribuidora(cliente.estado, cliente.cidade);
    if (distribuidoraAuto) {
        distribuidoraSelect.value = distribuidoraAuto;
        badge.classList.remove('hidden');
    } else {
        distribuidoraSelect.value = '';
        badge.classList.add('hidden');
    }
}

function ensureOrcamentoClienteAutocomplete() {
    if (!clienteAutocompleteOrcamento) {
        clienteAutocompleteOrcamento = initClienteAutocomplete('form-cliente-autocomplete', {
            getClienteAtualId: () => document.getElementById('form-cliente-id').value,
            onSelect: (clienteId) => {
                document.getElementById('form-cliente-id').value = clienteId;
                atualizarProjetosDoCliente(clienteId);
                // Troca de cliente: atualiza a Localização e recalcula a
                // distribuidora — nunca mantém os dados do cliente anterior.
                preencherLocalizacaoDoCliente(clienteId);
            }
        });
    }
    return clienteAutocompleteOrcamento;
}

export function openOrcamentoEditor() {
    if (state.localClientes.length === 0) {
        alert("Por favor, cadastre ao menos um cliente antes de gerar uma proposta.");
        switchTab('clientes-tab');
        return;
    }
    document.getElementById('orcamento-form').reset();
    document.getElementById('form-observacoes').innerHTML = '';
    ensureOrcamentoClienteAutocomplete();
    document.getElementById('form-orcamento-id').value = '';
    document.getElementById('form-cliente-id').value = '';
    clienteAutocompleteOrcamento.refresh();
    atualizarProjetosDoCliente('');
    popularSelectDistribuidora();
    limparLocalizacao();
    document.getElementById('form-loc-tipo-telhado').value = '';
    document.getElementById('editor-title').textContent = "Novo Orçamento";
    document.getElementById('editor-subtitle').textContent = "Preencha os dados da proposta";
    document.getElementById('form-campo-extra-label').value = 'Estimativa de banhos/dia';
    document.getElementById('form-campo-extra-valor').value = '';
    document.getElementById('form-desconto-valor').value = '';
    document.getElementById('form-desconto-tipo').value = 'valor';
    document.getElementById('form-margem-lucro').value = '';
    document.getElementById('form-arredondar-para').value = '';
    document.getElementById('form-subtotal-display').textContent = 'R$ 0,00';
    document.getElementById('form-val-total').value = "R$ 0,00";
    document.getElementById('form-data-emissao').value = new Date().toISOString().split('T')[0];
    document.getElementById('validade-custom-container').classList.add('hidden');
    document.getElementById('equipments-list-container').innerHTML = '';
    document.getElementById('pagamentos-list-container').innerHTML = '';
    addEquipmentRow(1, "");
    addEquipmentRow(1, "");
    addPagamentoRow();
    setFormReadOnly(false);
    switchTab('orcamento-editor-tab');
}

export function closeOrcamentoModal() {
    closeOrcamentoEditor();
}

export function closeOrcamentoEditor() {
    switchTab('orcamentos-tab');
}

export async function handleFormSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const id = document.getElementById('form-orcamento-id').value;
    const dataEmissao = document.getElementById('form-data-emissao').value || new Date().toISOString().split('T')[0];
    const validadeDias = getValidadeDias();
    const validadeData = new Date(dataEmissao + 'T00:00:00');
    validadeData.setDate(validadeData.getDate() + validadeDias);
    const validadeStr = validadeData.toISOString().split('T')[0];

    const { desconto, descontoTipo, descontoValor } = calcularTotais();

    const orcamentoPayload = {
        cliente_id: document.getElementById('form-cliente-id').value,
        projeto_id: document.getElementById('form-projeto-id').value || null,
        tipo_orcamento: document.getElementById('form-tipo-orcamento').value,
        tipo_servico_detalhado: document.getElementById('form-tipo-detalhado').value,
        tipo_telhado: document.getElementById('form-loc-tipo-telhado').value || null,
        distribuidora: document.getElementById('form-loc-distribuidora').value || null,
        campo_extra_label: document.getElementById('form-campo-extra-label').value.trim() || 'Estimativa de banhos/dia',
        campo_extra_valor: document.getElementById('form-campo-extra-valor').value.trim(),
        garantia_equipamento: document.getElementById('form-garantia-equip').value,
        garantia_instalacao: document.getElementById('form-garantia-inst').value,
        valor_equipamentos: parseFloat(document.getElementById('form-val-equip').value) || 0,
        valor_mao_de_obra: parseFloat(document.getElementById('form-val-mao').value) || 0,
        valor_outros: parseFloat(document.getElementById('form-val-outros').value) || 0,
        desconto_valor: descontoValor,
        desconto_tipo: descontoTipo,
        margem_lucro: parseFloat(document.getElementById('form-margem-lucro').value) || 0,
        status_comercial: document.getElementById('form-status-comercial').value,
        status_execucao: document.getElementById('form-status-execucao').value,
        condicoes_pagamento: document.getElementById('form-condicoes').value,
        pagamentos_json: getPagamentosList(),
        observacoes: document.getElementById('form-observacoes').innerHTML.trim(),
        data_emissao: dataEmissao,
        validade_proposta: validadeStr,
        equipamentos_json: getEquipmentsList()
    };

    try {
        if (id) {
            const { error } = await state.supabaseClient.from('orcamentos').update(orcamentoPayload).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await state.supabaseClient.from('orcamentos').insert(orcamentoPayload);
            if (error) throw error;
        }
        await syncFromSupabase();
    } catch (err) {
        alert("Erro ao gravar dados: " + err.message);
    }
    closeOrcamentoEditor();
}

export function viewOrcamento(id) {
    editOrcamento(id);
    setFormReadOnly(true);
}

export function habilitarEdicaoOrcamento() {
    setFormReadOnly(false);
}

export function setFormReadOnly(readOnly) {
    const form = document.getElementById('orcamento-form');
    form.querySelectorAll('input, select, textarea, button').forEach(el => {
        if (el.type === 'button' && (el.getAttribute('onclick') || '').includes('closeOrcamentoEditor')) return;
        if (readOnly) {
            el.setAttribute('disabled', 'disabled');
        } else {
            el.removeAttribute('disabled');
        }
    });
    document.getElementById('badge-somente-leitura').classList.toggle('hidden', !readOnly);
    document.getElementById('btn-habilitar-edicao').classList.toggle('hidden', !readOnly);
    document.getElementById('btn-salvar-orcamento').classList.toggle('hidden', readOnly);
}

export function editOrcamento(id) {
    const o = state.localOrcamentos.find(item => item.id === id);
    if (!o) return;

    ensureOrcamentoClienteAutocomplete();
    document.getElementById('form-orcamento-id').value = o.id;
    document.getElementById('form-cliente-id').value = o.cliente_id;
    clienteAutocompleteOrcamento.refresh();
    atualizarProjetosDoCliente(o.cliente_id);
    // Localização: recarrega a partir do cadastro atual do cliente (não do
    // que foi salvo antes — se o endereço do cliente mudou, reflete aqui).
    preencherLocalizacaoDoCliente(o.cliente_id);
    document.getElementById('form-loc-tipo-telhado').value = o.tipo_telhado || '';
    // Distribuidora: se o orçamento já tem uma distribuidora salva (seja a
    // automática de quando foi criado, seja um ajuste manual), ela prevalece
    // sobre o que preencherLocalizacaoDoCliente acabou de calcular.
    if (o.distribuidora) {
        document.getElementById('form-loc-distribuidora').value = o.distribuidora;
        document.getElementById('form-loc-distribuidora-auto-badge').classList.add('hidden');
    }
    document.getElementById('form-projeto-id').value = o.projeto_id || '';
    document.getElementById('form-tipo-orcamento').value = o.tipo_orcamento;
    document.getElementById('form-tipo-detalhado').value = o.tipo_servico_detalhado;
    document.getElementById('form-campo-extra-label').value = o.campo_extra_label || 'Estimativa de banhos/dia';
    document.getElementById('form-campo-extra-valor').value = o.campo_extra_valor || '';
    document.getElementById('form-garantia-equip').value = o.garantia_equipamento || '';
    document.getElementById('form-garantia-inst').value = o.garantia_instalacao || '';
    document.getElementById('form-val-equip').value = o.valor_equipamentos;
    document.getElementById('form-val-mao').value = o.valor_mao_de_obra;
    document.getElementById('form-val-outros').value = o.valor_outros;
    document.getElementById('form-desconto-valor').value = o.desconto_valor || '';
    document.getElementById('form-desconto-tipo').value = o.desconto_tipo || 'valor';
    document.getElementById('form-margem-lucro').value = o.margem_lucro || '';
    document.getElementById('form-arredondar-para').value = '';
    document.getElementById('form-status-comercial').value = o.status_comercial;
    document.getElementById('form-status-execucao').value = o.status_execucao;
    document.getElementById('form-condicoes').value = o.condicoes_pagamento || '';
    document.getElementById('form-observacoes').innerHTML = o.observacoes || '';
    document.getElementById('form-data-emissao').value = o.data_emissao || new Date().toISOString().split('T')[0];

    document.getElementById('pagamentos-list-container').innerHTML = '';
    if (o.pagamentos_json && o.pagamentos_json.length > 0) {
        o.pagamentos_json.forEach(p => addPagamentoRow(p.tipo, p.valor, p.parcelas));
    } else {
        addPagamentoRow();
    }

    document.getElementById('equipments-list-container').innerHTML = '';
    if (o.equipamentos_json && o.equipamentos_json.length > 0) {
        o.equipamentos_json.forEach(eq => {
            addEquipmentRow(eq.qtd, eq.desc, eq.preco || 0, eq.mostrarPreco !== false);
        });
    } else {
        addEquipmentRow(1, "");
    }
    updateEquipmentsSuggestedTotal();

    document.getElementById('form-validade-select').value = 'custom';
    document.getElementById('validade-custom-container').classList.remove('hidden');

    const dEmissao = new Date(o.data_emissao);
    const dValidade = new Date(o.validade_proposta);
    const diffTime = Math.abs(dValidade - dEmissao);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 15;
    document.getElementById('form-validade-custom').value = diffDays;

    document.getElementById('editor-title').textContent = `Editar Orçamento #${o.numero_orcamento}`;
    document.getElementById('editor-subtitle').textContent = o.cliente_nome || '';
    updateFormTotal();
    setFormReadOnly(false);
    switchTab('orcamento-editor-tab');
}

export async function deleteOrcamento(id) {
    if (!confirm("Confirmar a remoção permanente?")) return;
    if (state.supabaseClient) {
        try {
            const { error } = await state.supabaseClient.from('orcamentos').delete().eq('id', id);
            if (error) throw error;
            await syncFromSupabase();
        } catch (err) {
            alert("Erro ao excluir do Supabase: " + err.message);
        }
    }
}

export function insertSnippet(key) {
    const editor = document.getElementById('form-observacoes');
    const snippetText = SNIPPETS[key];
    if (editor && snippetText) {
        const p = document.createElement('div');
        p.textContent = snippetText;
        editor.appendChild(p);
    }
}

export function formatObservacoes(command) {
    document.getElementById('form-observacoes').focus();
    document.execCommand(command, false, null);
}
