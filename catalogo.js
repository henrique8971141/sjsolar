// catalogo.js
// Catálogo de produtos e serviços (tabela produtos_servicos): listagem,
// cadastro rápido, exclusão, datalist para o autocomplete de equipamentos,
// e importação/exportação em CSV.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';

export function renderCatalog() {
    const body = document.getElementById('catalog-list-body');
    body.innerHTML = '';
    document.getElementById('catalog-count-badge').textContent = `${state.localCatalog.length} itens`;

    state.localCatalog.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="px-6 py-4 font-mono font-bold text-slate-500">${p.codigo || '-'}</td>
            <td class="px-6 py-4 font-semibold text-slate-900">${p.descricao}</td>
            <td class="px-6 py-4 text-xs font-bold text-slate-600">${p.categoria || ''}</td>
            <td class="px-6 py-4 text-xs text-slate-500">${p.marca || ''}</td>
            <td class="px-6 py-4 text-right font-bold text-emerald-700">${parseFloat(p.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="deleteCatalogItem('${p.id}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export async function saveQuickItem() {
    const descricao = document.getElementById('prod-nome').value.trim();
    const categoria = document.getElementById('prod-categoria').value.trim();
    const marca = document.getElementById('prod-marca').value.trim();
    const codigo = document.getElementById('prod-codigo').value.trim();
    const preco = parseFloat(document.getElementById('prod-valor').value) || 0;

    if (!descricao) {
        alert("A descrição do produto ou serviço é obrigatória.");
        return;
    }

    try {
        const { error } = await state.supabaseClient
            .from('produtos_servicos')
            .insert({ descricao, categoria, marca, codigo, preco });
        if (error) throw error;

        document.getElementById('prod-nome').value = '';
        document.getElementById('prod-categoria').value = '';
        document.getElementById('prod-marca').value = '';
        document.getElementById('prod-codigo').value = '';
        document.getElementById('prod-valor').value = '';
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}

export async function deleteCatalogItem(id) {
    if (!confirm("Deseja remover este item do catálogo?")) return;
    try {
        const { error } = await state.supabaseClient.from('produtos_servicos').delete().eq('id', id);
        if (error) throw error;
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}

export function updateDatalist() {
    const dl = document.getElementById('produtos-datalist');
    dl.innerHTML = '';
    state.localCatalog.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.descricao;
        dl.appendChild(opt);
    });
}

// DOWNLOAD DO MODELO DE PLANILHA CSV
export function downloadTemplateCSV() {
    const csvContent = "\ufeffDESCRIÇÃO*,PREÇO,CATEGORIA*,MARCA*,CODIGO*\n" +
                       "ABRIGO PARA AQUECEDOR A GÁS,,AQUECEDOR,OUTROS,\n" +
                       "SISTEMA ACOPLADO 24 TUBOS AÇO INOX 316 - IDEAL PARA ÁGUA NÃO TRATADA,,AQUECEDOR,OUTROS,\n" +
                       "ÂNODO DE SACRIFÍCIO PARA RESERVATÓRIO TUMA INDUSTRIAL,150.00,AQUECEDOR / HIDRAULICO,TUMA INDUSTRIAL,\n" +
                       "MOTOBOMBA CENTRÍFUGA 1/2 CV MARCA LEOPONO,450.00,ELETRICO / HIDRAULICO,LEPONO,";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_importacao_sj_solar.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// PARSER DE PLANILHA CSV
export async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const text = e.target.result;
        const lines = text.split("\n");
        const itemsToInsert = [];

        if (lines.length <= 1) {
            alert("A planilha parece estar vazia.");
            return;
        }

        const firstLine = lines[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const cols = line.split(delimiter);
            if (cols.length >= 1) {
                const descricao = cols[0] ? cols[0].replace(/"/g, '').trim() : '';
                const precoStr = cols[1] ? cols[1].replace(/"/g, '').trim() : '';
                const categoria = cols[2] ? cols[2].replace(/"/g, '').trim() : 'Outros';
                const marca = cols[3] ? cols[3].replace(/"/g, '').trim() : 'Outros';
                const codigo = cols[4] ? cols[4].replace(/"/g, '').trim() : '';

                const preco = parseFloat(precoStr.replace(/[^\d.]/g, '')) || 0.00;

                if (descricao) {
                    itemsToInsert.push({ descricao, preco, categoria, marca, codigo });
                }
            }
        }

        if (itemsToInsert.length > 0 && state.supabaseClient) {
            try {
                const { error } = await state.supabaseClient.from('produtos_servicos').insert(itemsToInsert);
                if (error) throw error;
                alert(`${itemsToInsert.length} itens da planilha importados com sucesso!`);
                await syncFromSupabase();
            } catch (err) {
                alert("Erro ao realizar importação de lote: " + err.message);
            }
        } else {
            alert("Formato incompatível ou nenhum item localizado.");
        }
    };
    reader.readAsText(file, "UTF-8");
}
