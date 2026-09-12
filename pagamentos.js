// pagamentos.js
// Linhas dinâmicas de forma de pagamento (PIX, Cartão em Nx, Dinheiro,
// Boleto, Outro) dentro do editor de orçamento. Não depende de state.js
// nem do Supabase — trabalha só com o DOM da própria seção do formulário.

export function addPagamentoRow(tipo = 'PIX', valor = '', parcelas = '') {
    const container = document.getElementById('pagamentos-list-container');
    const rowId = 'pag-row-' + Date.now() + Math.floor(Math.random() * 1000);
    const div = document.createElement('div');
    div.id = rowId;
    div.className = "flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200";
    div.innerHTML = `
        <select class="pag-tipo px-2 py-1 rounded border border-slate-300 text-sm bg-white" onchange="togglePagamentoParcelas('${rowId}')">
            <option value="PIX" ${tipo === 'PIX' ? 'selected' : ''}>PIX</option>
            <option value="Cartão" ${tipo === 'Cartão' ? 'selected' : ''}>Cartão</option>
            <option value="Dinheiro" ${tipo === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
            <option value="Boleto" ${tipo === 'Boleto' ? 'selected' : ''}>Boleto</option>
            <option value="Outro" ${tipo === 'Outro' ? 'selected' : ''}>Outro</option>
        </select>
        <input type="text" placeholder="Valor (ex: R$ 500,00 ou 50%)" value="${valor}" class="pag-valor flex-grow px-2 py-1 rounded border border-slate-300 text-sm">
        <input type="number" min="1" placeholder="Nx" value="${parcelas}" title="Número de parcelas" class="pag-parcelas w-16 px-2 py-1 rounded border border-slate-300 text-sm ${tipo === 'Cartão' ? '' : 'hidden'}">
        <button type="button" onclick="removePagamentoRow('${rowId}')" class="text-red-500 hover:text-red-700 px-2"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
}

export function togglePagamentoParcelas(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const tipo = row.querySelector('.pag-tipo').value;
    const parcelasInput = row.querySelector('.pag-parcelas');
    parcelasInput.classList.toggle('hidden', tipo !== 'Cartão');
}

export function removePagamentoRow(rowId) {
    const el = document.getElementById(rowId);
    if (el) el.remove();
}

export function getPagamentosList() {
    const container = document.getElementById('pagamentos-list-container');
    const rows = container.children;
    const list = [];
    for (let r of rows) {
        const tipo = r.querySelector('.pag-tipo').value;
        const valor = r.querySelector('.pag-valor').value.trim();
        const parcelas = r.querySelector('.pag-parcelas').value;
        if (valor) list.push({ tipo, valor, parcelas: tipo === 'Cartão' ? (parcelas || '1') : '' });
    }
    return list;
}

// Gera o texto formatado a partir da lista estruturada de pagamentos
export function formatarPagamentosTexto(lista) {
    return lista.map(p => {
        if (p.tipo === 'Cartão' && p.parcelas) {
            return `${p.tipo.toUpperCase()} em até ${p.parcelas}x: ${p.valor}`;
        }
        return `${p.tipo.toUpperCase()}: ${p.valor}`;
    }).join('\n');
}
