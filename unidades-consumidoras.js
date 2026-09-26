// unidades-consumidoras.js
// Etapa 2.3.3 da TELA PRÓPRIA da Proposta: Unidades Consumidoras (UCs).
// Módulo completamente independente do editor de Orçamento
// (orcamentos.js / orcamento-editor-tab) e da lógica de Orçamento Avulso —
// não é lido nem chamado por nenhum dos dois.
//
// Cada UC pertence exclusivamente a uma Proposta (proposta_id -> a linha
// da Proposta na tabela "orcamentos"), nunca ao Cliente diretamente.
// Persistência na tabela nova "unidades_consumidoras" (ver
// sql/002_unidades_consumidoras.sql) — não reaproveita nenhuma tabela
// existente.
//
// Regra central: a primeira UC cadastrada em cada Proposta é sempre a
// UC 01 — GERADORA, e nunca pode virar beneficiária; todas as demais são
// sempre BENEFICIÁRIA. Por isso o tipo nunca é uma escolha do usuário —
// é decidido automaticamente pela posição de cadastro, o que já garante,
// por construção, as regras "só uma GERADORA" e "UC 01 nunca beneficiária".
// A tabela tem ainda um índice único (proposta_id) where tipo='GERADORA'
// como segunda camada de proteção.

import { state } from './state.js';
import { UFS, buscarEnderecoPorCep, getMunicipiosPorUf, buscarMunicipios } from './localizacao.js';

let propostaIdAtual = null;
let ucsAtual = [];
let editingUcId = null;
let listenersModalLigados = false;

// ------------------------------------------------------------------
// Carregamento / renderização da lista de UCs da Proposta atual
// ------------------------------------------------------------------
export async function carregarUnidadesConsumidoras(propostaId) {
    propostaIdAtual = propostaId;
    ucsAtual = [];

    const container = document.getElementById('proposta-uc-lista');
    if (container) container.innerHTML = '<div class="text-sm text-slate-400 text-center py-10">Carregando unidades consumidoras…</div>';

    if (!propostaId) {
        renderUnidadesConsumidorasLista();
        return;
    }

    try {
        const { data, error } = await state.supabaseClient
            .from('unidades_consumidoras')
            .select('*')
            .eq('proposta_id', propostaId)
            .order('ordem', { ascending: true });
        if (error) throw error;
        ucsAtual = data || [];
    } catch (err) {
        console.error('Erro ao carregar unidades consumidoras:', err.message);
        if (container) {
            container.innerHTML = `<div class="text-sm text-red-500 text-center py-10">Erro ao carregar unidades consumidoras: ${err.message}</div>`;
        }
        return;
    }

    renderUnidadesConsumidorasLista();
}

function renderUnidadesConsumidorasLista() {
    const container = document.getElementById('proposta-uc-lista');
    if (!container) return;

    if (!ucsAtual.length) {
        container.innerHTML = `
            <div class="text-sm text-slate-400 text-center py-10 border border-dashed border-slate-200 rounded-xl">
                Nenhuma unidade consumidora cadastrada ainda.
            </div>`;
        return;
    }

    container.innerHTML = ucsAtual.map((uc, idx) => {
        const numeroLabel = String(idx + 1).padStart(2, '0');
        const badge = uc.tipo === 'GERADORA'
            ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">Geradora</span>'
            : '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">Beneficiária</span>';
        const enderecoResumo = [uc.endereco, uc.numero_endereco, uc.cidade, uc.uf].filter(Boolean).join(', ');
        const consumo = (uc.consumo_medio_mensal !== null && uc.consumo_medio_mensal !== undefined && uc.consumo_medio_mensal !== '')
            ? `${uc.consumo_medio_mensal} kWh/mês`
            : '—';

        return `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-start justify-between gap-4 flex-wrap">
                <div class="space-y-1 min-w-[220px]">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="font-bold text-slate-900 text-sm">UC ${numeroLabel}${uc.numero_uc ? ' — ' + uc.numero_uc : ''}</h4>
                        ${badge}
                    </div>
                    <p class="text-xs text-slate-500">Consumo médio: ${consumo}</p>
                    <p class="text-xs text-slate-500">Fase: ${uc.fase || '—'} · Tensão: ${uc.tensao || '—'} · Categoria: ${uc.categoria || '—'}</p>
                    <p class="text-xs text-slate-500">Endereço: ${enderecoResumo || '—'}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button type="button" onclick="abrirModalUC(${uc.id})" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
                        <i class="fa-solid fa-pen mr-1"></i>Editar
                    </button>
                    <button type="button" onclick="excluirUC(${uc.id})" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 transition-colors">
                        <i class="fa-solid fa-trash mr-1"></i>Excluir
                    </button>
                </div>
            </div>`;
    }).join('');
}

// ------------------------------------------------------------------
// Modal de cadastro/edição de UC
// ------------------------------------------------------------------
function popularSelectUfUC() {
    const select = document.getElementById('uc-modal-uf');
    if (!select || select.dataset.populado) return;
    select.innerHTML = '<option value="">Selecione</option>' +
        UFS.map(uf => `<option value="${uf}">${uf}</option>`).join('');
    select.dataset.populado = '1';
}

function ligarListenersModalUC() {
    if (listenersModalLigados) return;
    listenersModalLigados = true;

    const ufSelect = document.getElementById('uc-modal-uf');
    const cepField = document.getElementById('uc-modal-cep');
    const cidadeField = document.getElementById('uc-modal-cidade');
    const cidadeDropdown = document.getElementById('uc-modal-cidade-dropdown');

    ufSelect.addEventListener('change', () => {
        if (ufSelect.value) getMunicipiosPorUf(ufSelect.value);
    });

    cepField.addEventListener('blur', async () => {
        const endereco = await buscarEnderecoPorCep(cepField.value);
        if (!endereco) return;
        if (endereco.logradouro) document.getElementById('uc-modal-endereco').value = endereco.logradouro;
        if (endereco.bairro) document.getElementById('uc-modal-bairro').value = endereco.bairro;
        if (endereco.uf) {
            ufSelect.value = endereco.uf;
            await getMunicipiosPorUf(endereco.uf);
        }
        if (endereco.cidade) cidadeField.value = endereco.cidade;
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
            : resultados.map(nome => `<button type="button" data-cidade-uc="${nome}" class="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">${nome}</button>`).join('');
        cidadeDropdown.querySelectorAll('[data-cidade-uc]').forEach(btn => {
            btn.addEventListener('click', () => {
                cidadeField.value = btn.dataset.cidadeUc;
                cidadeDropdown.classList.add('hidden');
            });
        });
        cidadeDropdown.classList.remove('hidden');
    };
    cidadeField.addEventListener('focus', renderCidades);
    cidadeField.addEventListener('input', renderCidades);
    document.addEventListener('click', (e) => {
        if (!cidadeField.contains(e.target) && !cidadeDropdown.contains(e.target)) {
            cidadeDropdown.classList.add('hidden');
        }
    });
}

// Endereço da instalação da Proposta (etapa 2.3.2), usado só como sugestão
// inicial ao cadastrar a UC 01 — nunca lido/gravado de volta na Proposta.
function pegarEnderecoInstalacaoProposta() {
    const val = (id) => document.getElementById(id)?.value || '';
    return {
        cep: val('proposta-loc-cep'),
        endereco: val('proposta-loc-endereco'),
        numero: val('proposta-loc-numero'),
        complemento: val('proposta-loc-complemento'),
        bairro: val('proposta-loc-bairro'),
        uf: val('proposta-loc-uf'),
        cidade: val('proposta-loc-cidade')
    };
}

export function abrirModalUC(id) {
    popularSelectUfUC();
    ligarListenersModalUC();

    editingUcId = id || null;
    const uc = id ? ucsAtual.find(u => u.id === id) : null;
    const seraGeradora = !uc && ucsAtual.length === 0;
    const tipo = uc ? uc.tipo : (seraGeradora ? 'GERADORA' : 'BENEFICIARIA');

    document.getElementById('uc-modal-id').value = uc ? uc.id : '';
    document.getElementById('uc-modal-tipo').value = tipo;
    document.getElementById('uc-modal-title').textContent = uc
        ? `Editar Unidade Consumidora`
        : (seraGeradora ? 'Nova Unidade Consumidora — UC 01' : 'Nova Unidade Consumidora');

    const badge = document.getElementById('uc-modal-tipo-badge');
    badge.textContent = tipo === 'GERADORA' ? 'GERADORA' : 'BENEFICIÁRIA';
    badge.className = tipo === 'GERADORA'
        ? 'inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold uppercase tracking-wider'
        : 'inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold uppercase tracking-wider';

    document.getElementById('uc-modal-numero-uc').value = uc?.numero_uc || '';
    document.getElementById('uc-modal-consumo').value = uc?.consumo_medio_mensal ?? '';
    document.getElementById('uc-modal-fase').value = uc?.fase || '';
    document.getElementById('uc-modal-tensao').value = uc?.tensao || '';
    document.getElementById('uc-modal-categoria').value = uc?.categoria || '';

    if (uc) {
        document.getElementById('uc-modal-cep').value = uc.cep || '';
        document.getElementById('uc-modal-endereco').value = uc.endereco || '';
        document.getElementById('uc-modal-numero').value = uc.numero_endereco || '';
        document.getElementById('uc-modal-complemento').value = uc.complemento || '';
        document.getElementById('uc-modal-bairro').value = uc.bairro || '';
        document.getElementById('uc-modal-uf').value = uc.uf || '';
        document.getElementById('uc-modal-cidade').value = uc.cidade || '';
        if (uc.uf) getMunicipiosPorUf(uc.uf);
    } else if (seraGeradora) {
        // UC 01: sugestão inicial = endereço da instalação da Proposta.
        const loc = pegarEnderecoInstalacaoProposta();
        document.getElementById('uc-modal-cep').value = loc.cep;
        document.getElementById('uc-modal-endereco').value = loc.endereco;
        document.getElementById('uc-modal-numero').value = loc.numero;
        document.getElementById('uc-modal-complemento').value = loc.complemento;
        document.getElementById('uc-modal-bairro').value = loc.bairro;
        document.getElementById('uc-modal-uf').value = loc.uf;
        document.getElementById('uc-modal-cidade').value = loc.cidade;
        if (loc.uf) getMunicipiosPorUf(loc.uf);
    } else {
        ['uc-modal-cep', 'uc-modal-endereco', 'uc-modal-numero', 'uc-modal-complemento', 'uc-modal-bairro', 'uc-modal-uf', 'uc-modal-cidade']
            .forEach(elId => { document.getElementById(elId).value = ''; });
    }

    document.getElementById('uc-modal-overlay').classList.remove('hidden');
}

export function fecharModalUC() {
    document.getElementById('uc-modal-overlay').classList.add('hidden');
    editingUcId = null;
}

export async function salvarUC() {
    if (!propostaIdAtual) {
        alert("Não foi possível identificar a Proposta desta Unidade Consumidora. Feche e reabra a etapa.");
        return;
    }

    const consumoBruto = document.getElementById('uc-modal-consumo').value;
    const consumo = consumoBruto === '' ? null : parseFloat(consumoBruto.toString().replace(',', '.'));
    if (consumoBruto !== '' && (isNaN(consumo) || consumo < 0)) {
        alert("Informe o consumo médio mensal em kWh/mês como um número válido (maior ou igual a zero).");
        return;
    }

    const tipo = document.getElementById('uc-modal-tipo').value;
    const id = document.getElementById('uc-modal-id').value;

    const payload = {
        proposta_id: propostaIdAtual,
        tipo,
        numero_uc: document.getElementById('uc-modal-numero-uc').value || null,
        consumo_medio_mensal: consumo,
        fase: document.getElementById('uc-modal-fase').value || null,
        tensao: document.getElementById('uc-modal-tensao').value || null,
        categoria: document.getElementById('uc-modal-categoria').value || null,
        cep: document.getElementById('uc-modal-cep').value || null,
        endereco: document.getElementById('uc-modal-endereco').value || null,
        numero_endereco: document.getElementById('uc-modal-numero').value || null,
        complemento: document.getElementById('uc-modal-complemento').value || null,
        bairro: document.getElementById('uc-modal-bairro').value || null,
        cidade: document.getElementById('uc-modal-cidade').value || null,
        uf: document.getElementById('uc-modal-uf').value || null
    };

    try {
        if (id) {
            const { error } = await state.supabaseClient.from('unidades_consumidoras').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            payload.ordem = ucsAtual.length + 1;
            const { error } = await state.supabaseClient.from('unidades_consumidoras').insert(payload);
            if (error) throw error;
        }
    } catch (err) {
        alert("Erro ao gravar a unidade consumidora: " + err.message);
        return;
    }

    fecharModalUC();
    await carregarUnidadesConsumidoras(propostaIdAtual);
}

export async function excluirUC(id) {
    const uc = ucsAtual.find(u => u.id === id);
    if (!uc) return;

    if (uc.tipo === 'GERADORA' && ucsAtual.length > 1) {
        alert("A UC 01 — GERADORA não pode ser excluída enquanto existirem outras Unidades Consumidoras cadastradas nesta Proposta. Exclua as demais primeiro.");
        return;
    }

    if (!confirm(`Excluir esta unidade consumidora${uc.numero_uc ? ' (' + uc.numero_uc + ')' : ''}? Esta ação não pode ser desfeita.`)) return;

    try {
        const { error } = await state.supabaseClient.from('unidades_consumidoras').delete().eq('id', id);
        if (error) throw error;
    } catch (err) {
        alert("Erro ao excluir a unidade consumidora: " + err.message);
        return;
    }

    await carregarUnidadesConsumidoras(propostaIdAtual);
}
