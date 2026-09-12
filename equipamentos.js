// equipamentos.js
// Linhas dinâmicas de equipamento dentro do editor de orçamento (estilo PDV:
// busca no catálogo + cadastro rápido de item novo). Cada linha tem:
//   - qtd, desc: quantidade e descrição do item
//   - preco: valor do item específico NESTE orçamento (independe do preço
//     cadastrado no catálogo — pode ser sobrescrito livremente)
//   - mostrarPreco: controla se o preço aparece impresso no orçamento
//     (PDF/DOCX). O preço SEMPRE entra na soma do total de equipamentos,
//     mesmo quando oculto na impressão.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { updateFormTotal } from './orcamentos.js';

export function addEquipmentRow(qtd = 1, desc = "", preco = 0, mostrarPreco = true) {
    const container = document.getElementById('equipments-list-container');
    const rowId = 'eq-row-' + Date.now() + Math.floor(Math.random() * 1000);
    const div = document.createElement('div');
    div.id = rowId;
    div.className = "flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200";
    div.innerHTML = `
        <input type="number" placeholder="QTD" min="1" value="${qtd}" class="eq-qtd w-16 px-2 py-1 rounded border border-slate-300 text-sm font-bold text-center font-mono" onchange="updateEquipmentsSuggestedTotal()">
        <input type="text" list="produtos-datalist" placeholder="Código ou descrição do item" value="${desc}" class="eq-desc flex-grow px-2 py-1 rounded border border-slate-300 text-sm font-mono" oninput="checkNovoItemRow('${rowId}')">
        <span id="${rowId}-marca-badge" class="hidden shrink-0 px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs font-bold uppercase"></span>
        <input type="number" step="0.01" min="0" placeholder="Preço" value="${preco || ''}" class="eq-preco w-28 px-2 py-1 rounded border border-slate-300 text-sm font-mono" onchange="updateEquipmentsSuggestedTotal()">
        <label class="shrink-0 flex items-center gap-1 text-xs text-slate-600 select-none" title="Se marcado, o preço deste item aparece impresso no orçamento">
            <input type="checkbox" class="eq-mostrar-preco" ${mostrarPreco ? 'checked' : ''}>
            Exibir preço
        </label>
        <button type="button" onclick="openCatalogSelectorCard('${rowId}')" title="Buscar no catálogo" class="shrink-0 px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 transition-colors"><i class="fa-solid fa-barcode"></i></button>
        <button type="button" id="${rowId}-btn-novo" onclick="cadastrarItemRapido('${rowId}')" title="Item não cadastrado — adicionar ao catálogo" class="hidden shrink-0 px-2.5 py-1 rounded bg-amber-400 text-slate-950 hover:bg-amber-500 transition-colors"><i class="fa-solid fa-plus"></i></button>
        <button type="button" onclick="removeEquipmentRow('${rowId}')" class="text-red-500 hover:text-red-700 px-2"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
    if (desc) checkNovoItemRow(rowId);
    updateEquipmentsSuggestedTotal();
}

// Soma qtd × preço de todas as linhas de equipamentos e mostra como sugestão
// ao lado do campo de total (que continua editável manualmente).
export function updateEquipmentsSuggestedTotal() {
    const list = getEquipmentsList();
    const soma = list.reduce((acc, eq) => acc + (eq.qtd * eq.preco), 0);
    const el = document.getElementById('equipments-suggested-total');
    if (el) {
        el.textContent = soma > 0
            ? `Soma sugerida dos itens: R$ ${soma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            : '';
    }
}

// Preenche o campo de total de equipamentos com a soma sugerida das linhas.
export function aplicarSomaSugeridaEquipamentos() {
    const list = getEquipmentsList();
    const soma = list.reduce((acc, eq) => acc + (eq.qtd * eq.preco), 0);
    document.getElementById('form-val-equip').value = soma.toFixed(2);
    updateFormTotal();
}

// Atualiza o badge de marca ao lado do item, quando houver marca cadastrada (diferente de "Outros")
export function atualizarBadgeMarca(rowId) {
    const row = document.getElementById(rowId);
    const badge = document.getElementById(rowId + '-marca-badge');
    if (!row || !badge) return;
    const desc = row.querySelector('.eq-desc').value.trim();
    const produto = state.localCatalog.find(p => p.descricao && p.descricao.toLowerCase() === desc.toLowerCase());
    const marca = produto?.marca?.trim();
    if (marca && marca.toUpperCase() !== 'OUTROS') {
        badge.textContent = marca;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Mostra o botão "+" quando o texto digitado não corresponde a nenhum item do catálogo
export function checkNovoItemRow(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const desc = row.querySelector('.eq-desc').value.trim();
    const btnNovo = document.getElementById(rowId + '-btn-novo');
    const existe = state.localCatalog.some(p => p.descricao.toLowerCase() === desc.toLowerCase());
    btnNovo.classList.toggle('hidden', !desc || existe);
    atualizarBadgeMarca(rowId);
}

// Cadastra rapidamente o item digitado no catálogo (PDV-style: cadastro em 1 clique)
export async function cadastrarItemRapido(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const desc = row.querySelector('.eq-desc').value.trim();
    if (!desc) return;
    try {
        const { error } = await state.supabaseClient.from('produtos_servicos').insert({ descricao: desc, categoria: '', marca: '', codigo: '', preco: 0 });
        if (error) throw error;
        await syncFromSupabase();
        document.getElementById(rowId + '-btn-novo').classList.add('hidden');
    } catch (err) {
        alert("Erro ao cadastrar item: " + err.message);
    }
}

export function removeEquipmentRow(rowId) {
    const el = document.getElementById(rowId);
    if (el) el.remove();
}

// CATÁLOGO PDV: modal de seleção de produto (grid clicável)
export function openCatalogSelectorCard(rowId) {
    state.catalogSelectorTargetRow = rowId;
    document.getElementById('catalog-selector-overlay').classList.remove('hidden');
    document.getElementById('catalog-selector-search').value = '';
    renderCatalogSelectorGrid();
    document.getElementById('catalog-selector-search').focus();
}

export function closeCatalogSelectorCard() {
    document.getElementById('catalog-selector-overlay').classList.add('hidden');
    state.catalogSelectorTargetRow = null;
}

export function renderCatalogSelectorGrid() {
    const query = document.getElementById('catalog-selector-search').value.toLowerCase();
    const grid = document.getElementById('catalog-selector-grid');
    const filtrados = state.localCatalog.filter(p => !query || p.descricao.toLowerCase().includes(query));

    if (filtrados.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-sm text-slate-400 text-center py-8">Nenhum item encontrado no catálogo.</div>';
        return;
    }

    grid.innerHTML = filtrados.map(p => `
        <button type="button" onclick="selecionarItemCatalogo('${p.id}')"
            class="text-left p-3 rounded-lg border border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition-colors bg-white">
            <div class="font-bold text-slate-900 text-xs font-mono">${p.descricao}</div>
            <div class="text-xs text-slate-500 mt-1">${p.categoria || 'Item'}${p.preco ? ' · R$ ' + Number(p.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}</div>
        </button>
    `).join('');
}

export function selecionarItemCatalogo(id) {
    const p = state.localCatalog.find(x => String(x.id) === String(id));
    if (!p || !state.catalogSelectorTargetRow) return;
    const row = document.getElementById(state.catalogSelectorTargetRow);
    if (row) {
        row.querySelector('.eq-desc').value = p.descricao;
        // Sugere o preço cadastrado no catálogo, mas o valor continua editável
        // e vale só para este orçamento — não altera o preço do catálogo.
        const precoInput = row.querySelector('.eq-preco');
        if (precoInput && !precoInput.value && p.preco) {
            precoInput.value = Number(p.preco).toFixed(2);
        }
        checkNovoItemRow(state.catalogSelectorTargetRow);
        updateEquipmentsSuggestedTotal();
    }
    closeCatalogSelectorCard();
}

export function getEquipmentsList() {
    const container = document.getElementById('equipments-list-container');
    const rows = container.children;
    const list = [];
    for (let r of rows) {
        const qtd = parseInt(r.querySelector('.eq-qtd').value) || 1;
        const desc = r.querySelector('.eq-desc').value.trim();
        const preco = parseFloat(r.querySelector('.eq-preco').value) || 0;
        const mostrarPreco = r.querySelector('.eq-mostrar-preco').checked;
        if (desc) list.push({ qtd, desc, preco, mostrarPreco });
    }
    return list;
}
