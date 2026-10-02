// catalogo-fotovoltaico.js
// Catálogo Fotovoltaico (tabelas modulos e inversores): sub-abas Módulos /
// Inversores, listagem com filtros, cadastro rápido, exclusão e
// importação/exportação em CSV. Separado do Catálogo Geral (catalogo.js).

import { state } from './state.js';

let subAba = 'modulos';
let pagina = 1;
let porPagina = 50; // 0 = todos
const dados = { modulos: [], inversores: [] };

const TIPOS_INVERSOR = ['TRADICIONAL', 'MICRO INVERSOR', 'OTIMIZADOR'];

const CONFIG = {
    modulos: {
        tabela: 'modulos',
        rotulo: 'Módulos',
        colunasCsv: ['DESCRICAO*', 'MARCA*', 'POTENCIA_WP*', 'PRECO', 'CODIGO'],
        exemplo: ['MÓDULO 550W MONOCRISTALINO HALF CELL', 'CANADIAN', '550', '650.00', 'CS7N-550']
    },
    inversores: {
        tabela: 'inversores',
        rotulo: 'Inversores',
        colunasCsv: ['DESCRICAO*', 'MARCA*', 'TIPO*', 'POTENCIA_W*', 'PRECO', 'CODIGO'],
        exemplo: ['INVERSOR STRING 5KW MONOFÁSICO', 'GROWATT', 'TRADICIONAL', '5000', '4200.00', 'MIN5000TL-X']
    }
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = id => document.getElementById(id);
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// "1.234,56" -> 1234.56 | "1234.56" -> 1234.56
function num(v) {
    let s = String(v ?? '').replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s) || 0;
}

function normalizarTipo(v) {
    const s = String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (s.includes('MICRO')) return 'MICRO INVERSOR';
    if (s.includes('OTIM')) return 'OTIMIZADOR';
    return 'TRADICIONAL';
}

// ---------- carga / navegação ----------
// O Supabase devolve no máximo 1000 linhas por consulta. Busca em blocos
// de 1000 até acabar, para trazer a tabela inteira.
async function buscarTudo(tabela) {
    const TAM = 1000;
    let todos = [];
    for (let ini = 0; ; ini += TAM) {
        const { data, error } = await state.supabaseClient
            .from(tabela).select('*')
            .order('marca').order('descricao').order('id')
            .range(ini, ini + TAM - 1);
        if (error) { console.error(tabela + ':', error.message); alert(`Erro ao carregar ${tabela}: ${error.message}`); break; }
        todos = todos.concat(data || []);
        if (!data || data.length < TAM) break;
    }
    return todos;
}

export async function carregarCatalogoFotovoltaico() {
    if (!state.supabaseClient) return;
    const [m, i] = await Promise.all([buscarTudo('modulos'), buscarTudo('inversores')]);
    dados.modulos = m;
    dados.inversores = i;
    renderFotovoltaico();
}

export function mudarPaginaFv(n) {
    pagina = n;
    renderFotovoltaico(true);
}

export function mudarPorPaginaFv(v) {
    porPagina = parseInt(v, 10) || 0;
    pagina = 1;
    renderFotovoltaico(true);
}

export function switchFvSubAba(aba) {
    subAba = aba;
    pagina = 1;
    renderFotovoltaico();
}

// ---------- render ----------
function filtrar() {
    const q = (el('fv-busca')?.value || '').trim().toLowerCase();
    const marca = el('fv-filtro-marca')?.value || '';
    const tipo = el('fv-filtro-tipo')?.value || '';
    return dados[subAba].filter(p =>
        (!q || `${p.descricao || ''} ${p.marca || ''} ${p.codigo || ''}`.toLowerCase().includes(q)) &&
        (!marca || p.marca === marca) &&
        (subAba !== 'inversores' || !tipo || p.tipo === tipo)
    );
}

export function renderFotovoltaico(manterPagina = false) {
    if (!el('fv-lista-body')) return;
    if (!manterPagina) pagina = 1; // filtro/busca mudou -> volta p/ página 1
    const ehMod = subAba === 'modulos';

    ['modulos', 'inversores'].forEach(a => {
        el(`fv-sub-${a}`).className = a === subAba
            ? 'px-4 py-2 rounded-lg text-xs font-bold uppercase bg-slate-900 text-white'
            : 'px-4 py-2 rounded-lg text-xs font-bold uppercase bg-white border border-slate-200 text-slate-600 hover:bg-slate-50';
    });
    el('fv-form-modulos').classList.toggle('hidden', !ehMod);
    el('fv-form-inversores').classList.toggle('hidden', ehMod);
    el('fv-filtro-tipo').classList.toggle('hidden', ehMod);
    el('fv-csv-colunas').textContent = CONFIG[subAba].colunasCsv.join(' | ');

    // marcas para o filtro (mantém seleção atual se ainda existir)
    const selMarca = el('fv-filtro-marca');
    const atual = selMarca.value;
    const marcas = [...new Set(dados[subAba].map(p => p.marca).filter(Boolean))].sort();
    selMarca.innerHTML = '<option value="">Todas as marcas</option>' +
        marcas.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    selMarca.value = marcas.includes(atual) ? atual : '';

    el('fv-thead').innerHTML = ehMod
        ? '<th class="px-6 py-4">Código</th><th class="px-6 py-4">Descrição</th><th class="px-6 py-4">Marca</th><th class="px-6 py-4 text-right">Potência</th><th class="px-6 py-4 text-right">Preço</th><th class="px-6 py-4 text-center">Remover</th>'
        : '<th class="px-6 py-4">Código</th><th class="px-6 py-4">Descrição</th><th class="px-6 py-4">Marca</th><th class="px-6 py-4">Tipo</th><th class="px-6 py-4 text-right">Potência</th><th class="px-6 py-4 text-right">Preço</th><th class="px-6 py-4 text-center">Remover</th>';

    const lista = filtrar();
    el('fv-count-badge').textContent = `${lista.length} de ${dados[subAba].length} ${CONFIG[subAba].rotulo.toLowerCase()}`;

    const totalPaginas = porPagina ? Math.max(1, Math.ceil(lista.length / porPagina)) : 1;
    if (pagina > totalPaginas) pagina = totalPaginas;
    const ini = porPagina ? (pagina - 1) * porPagina : 0;
    const visiveis = porPagina ? lista.slice(ini, ini + porPagina) : lista;
    renderPaginador(lista.length, ini, visiveis.length, totalPaginas);

    el('fv-lista-body').innerHTML = visiveis.map(p => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4 font-mono font-bold text-slate-500">${esc(p.codigo) || '-'}</td>
            <td class="px-6 py-4 font-semibold text-slate-900">${esc(p.descricao)}</td>
            <td class="px-6 py-4 text-xs text-slate-500">${esc(p.marca)}</td>
            ${ehMod ? '' : `<td class="px-6 py-4 text-xs font-bold text-slate-600">${esc(p.tipo)}</td>`}
            <td class="px-6 py-4 text-right font-bold text-slate-700">${ehMod
                ? Number(p.potencia_wp || 0).toLocaleString('pt-BR') + ' Wp'
                : Number(p.potencia || 0).toLocaleString('pt-BR') + ' W'}</td>
            <td class="px-6 py-4 text-right font-bold text-emerald-700">${brl(p.preco)}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="excluirItemFv('${esc(p.id)}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>`).join('') ||
        `<tr><td colspan="7" class="px-6 py-8 text-center text-xs text-slate-400 font-semibold">Nenhum item encontrado.</td></tr>`;
}

function renderPaginador(total, ini, qtd, totalPaginas) {
    el('fv-por-pagina').value = String(porPagina);
    el('fv-pag-info').textContent = total
        ? `Mostrando ${ini + 1}–${ini + qtd} de ${total}`
        : 'Nenhum resultado';

    // janela de páginas: 1 ... 4 5 [6] 7 8 ... 20
    const nums = new Set([1, totalPaginas]);
    for (let i = pagina - 2; i <= pagina + 2; i++) if (i >= 1 && i <= totalPaginas) nums.add(i);
    const ordenadas = [...nums].sort((a, b) => a - b);

    const base = 'min-w-8 px-2.5 py-1.5 rounded-lg text-xs font-bold border ';
    const btn = (rotulo, alvo, ativo, desab) =>
        `<button ${desab ? 'disabled' : `onclick="mudarPaginaFv(${alvo})"`} class="${base}${ativo
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}${desab ? ' opacity-40 cursor-not-allowed' : ''}">${rotulo}</button>`;

    let html = btn('<i class="fa-solid fa-chevron-left"></i>', pagina - 1, false, pagina <= 1);
    let anterior = 0;
    ordenadas.forEach(n => {
        if (n - anterior > 1) html += '<span class="px-1 text-slate-400">…</span>';
        html += btn(n, n, n === pagina, false);
        anterior = n;
    });
    html += btn('<i class="fa-solid fa-chevron-right"></i>', pagina + 1, false, pagina >= totalPaginas);
    el('fv-pager').innerHTML = totalPaginas > 1 ? html : '';
}

// ---------- cadastro rápido ----------
export async function salvarItemFv() {
    const ehMod = subAba === 'modulos';
    const p = ehMod ? 'fvm' : 'fvi';
    const v = k => el(`${p}-${k}`).value.trim();

    const item = {
        descricao: v('descricao'),
        marca: v('marca'),
        codigo: v('codigo'),
        preco: num(v('preco'))
    };
    if (ehMod) item.potencia_wp = num(v('potencia'));
    else { item.potencia = num(v('potencia')); item.tipo = normalizarTipo(v('tipo')); }

    const pot = ehMod ? item.potencia_wp : item.potencia;
    if (!item.descricao || !item.marca || !pot) {
        alert('Descrição, marca e potência são obrigatórias.');
        return;
    }
    try {
        const { error } = await state.supabaseClient.from(CONFIG[subAba].tabela).insert(item);
        if (error) throw error;
        ['descricao', 'marca', 'codigo', 'preco', 'potencia'].forEach(k => { el(`${p}-${k}`).value = ''; });
        await carregarCatalogoFotovoltaico();
    } catch (err) {
        alert(err.message);
    }
}

export async function excluirItemFv(id) {
    if (!confirm('Deseja remover este item do catálogo fotovoltaico?')) return;
    try {
        const { error } = await state.supabaseClient.from(CONFIG[subAba].tabela).delete().eq('id', id);
        if (error) throw error;
        await carregarCatalogoFotovoltaico();
    } catch (err) {
        alert(err.message);
    }
}

// ---------- CSV ----------
// Parser que respeita aspas (campos com vírgula/;/quebra de linha dentro de "...").
function parseCSV(texto, delim) {
    const linhas = [];
    let campo = '', linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (aspas) {
            if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') aspas = false;
            else campo += c;
        } else if (c === '"') aspas = true;
        else if (c === delim) { linha.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && texto[i + 1] === '\n') i++;
            linha.push(campo); campo = '';
            if (linha.some(x => x.trim())) linhas.push(linha);
            linha = [];
        } else campo += c;
    }
    linha.push(campo);
    if (linha.some(x => x.trim())) linhas.push(linha);
    return linhas;
}

// Normaliza cabeçalho: sem acento, sem símbolos/espaços/_ (ex.: "POTÊNCIA (Wp)*" -> "POTENCIAWP")
const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export function baixarModeloFv() {
    const cfg = CONFIG[subAba];
    const csv = '\ufeff' + cfg.colunasCsv.join(';') + '\n' + cfg.exemplo.join(';') + '\n';
    baixar(csv, `modelo_${cfg.tabela}_sj_solar.csv`);
}

export function exportarFv() {
    const cfg = CONFIG[subAba];
    const aspas = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = dados[subAba].map(p => subAba === 'modulos'
        ? [p.descricao, p.marca, p.potencia_wp, p.preco, p.codigo]
        : [p.descricao, p.marca, p.tipo, p.potencia, p.preco, p.codigo]);
    const csv = '\ufeff' + cfg.colunasCsv.join(';') + '\n' + linhas.map(l => l.map(aspas).join(';')).join('\n');
    baixar(csv, `${cfg.tabela}_sj_solar.csv`);
}

function baixar(conteudo, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8;' }));
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

export function importarCsvFv(event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;
    const tabela = subAba; // trava a sub-aba do momento da seleção
    const reader = new FileReader();
    reader.onload = async e => {
        event.target.value = '';
        let texto = e.target.result.replace(/^\ufeff/, '');
        const primeira = texto.split(/\r?\n/)[0] || '';
        const delim = primeira.includes(';') ? ';' : ',';
        const linhas = parseCSV(texto, delim);
        if (linhas.length < 2) { alert('A planilha parece estar vazia.'); return; }

        // mapeia colunas pelo cabeçalho (ordem livre)
        const cab = linhas[0].map(semAcento);
        const idx = (...nomes) => cab.findIndex(c => nomes.includes(c));
        const col = {
            descricao: idx('DESCRICAO', 'NOME', 'PRODUTO'),
            marca: idx('MARCA', 'FABRICANTE'),
            codigo: idx('CODIGO', 'COD', 'MODELO'),
            preco: idx('PRECO', 'VALOR'),
            potencia: tabela === 'modulos'
                ? idx('POTENCIAWP', 'POTENCIA', 'WP')
                : idx('POTENCIAW', 'POTENCIA', 'W', 'POTENCIAKW'),
            tipo: idx('TIPO')
        };
        const faltando = [];
        if (col.descricao < 0) faltando.push('DESCRICAO');
        if (col.marca < 0) faltando.push('MARCA');
        if (col.potencia < 0) faltando.push(tabela === 'modulos' ? 'POTENCIA_WP' : 'POTENCIA_W');
        if (faltando.length) {
            alert(`Cabeçalho inválido. Faltando: ${faltando.join(', ')}.\n\nLido na planilha: ${linhas[0].join(' | ')}\n\nConfira se está na aba certa (${CONFIG[tabela].rotulo}) e baixe o modelo.`);
            return;
        }
        const get = (l, i) => (i >= 0 && l[i] != null ? l[i].trim() : '');

        const itens = [], ignoradas = [];
        linhas.slice(1).forEach((l, n) => {
            const item = { descricao: get(l, col.descricao), marca: get(l, col.marca), codigo: get(l, col.codigo), preco: num(get(l, col.preco)) };
            const pot = num(get(l, col.potencia));
            if (tabela === 'modulos') item.potencia_wp = pot;
            else { item.potencia = pot; item.tipo = normalizarTipo(get(l, col.tipo)); }
            if (item.descricao && item.marca && pot > 0) itens.push(item);
            else ignoradas.push(n + 2);
        });

        if (!itens.length) { alert('Nenhuma linha válida encontrada.'); return; }
        try {
            const { error } = await state.supabaseClient.from(tabela).insert(itens);
            if (error) throw error;
            alert(`${itens.length} itens importados.` + (ignoradas.length ? `\nLinhas ignoradas (dados obrigatórios faltando): ${ignoradas.slice(0, 20).join(', ')}` : ''));
            await carregarCatalogoFotovoltaico();
        } catch (err) {
            alert('Erro ao importar: ' + err.message);
        }
    };
    reader.readAsText(arquivo, 'UTF-8');
}
