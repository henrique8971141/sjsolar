// precificacao.js
// CONFIGURAÇÕES DE PRECIFICAÇÃO DO PROJETO — módulo independente.
// Não usa nem altera o Orçamento Avulso, as etapas da Proposta (2.3.1 a
// 2.3.4) nem o Catálogo Fotovoltaico.
//
// A configuração pertence ao PROJETO (uma linha por projeto na tabela
// projeto_precificacao; ver sql/009_projeto_precificacao.sql). Não existe
// configuração global: cada projeto tem a sua. Enquanto o projeto não
// tiver linha salva, valem os padrões abaixo (6% de imposto, 30% de
// margem, mão de obra por módulo e homologação por faixa de kWp).
//
// Este módulo também exporta os cálculos das faixas, para a futura etapa
// de Formação de Preço da Proposta usar:
//   obterPrecificacaoProjeto(projetoId)
//   calcularMaoDeObra(cfg, qtdModulos)
//   calcularHomologacao(cfg, kwp, valorKit)
// A potência (kWp) e a quantidade de módulos NUNCA são digitadas aqui:
// vêm sempre do Kit Gerador da proposta.

import { state } from './state.js';
import { navegarPara } from './router.js';
import { switchTab } from './ui.js';

const TABELA = 'projeto_precificacao';

// ------------------------------------------------------------------
// Padrões
// ------------------------------------------------------------------
function padrao() {
    return {
        imposto_tipo: 'PERCENTUAL',
        imposto_valor: 6,
        margem_tipo: 'PERCENTUAL',
        margem_valor: 30,
        mao_obra_unidade: 'MODULO', // estrutura pronta para outras unidades no futuro
        mao_obra_faixas: [
            { de: 0, ate: 4, valor: 200, tipo: 'POR_MODULO' },
            { de: 5, ate: null, valor: 150, tipo: 'POR_MODULO' }
        ],
        homologacao_unidade: 'KWP',
        homologacao_faixas: [
            { de: 0, ate: 3, valor: 600, tipo: 'FIXO' },
            { de: 3.01, ate: null, valor: 800, tipo: 'FIXO' }
        ],
        outros_custos: []
    };
}

const CAMPOS = Object.keys(padrao());

const TIPOS_MAO_OBRA = [
    { v: 'POR_MODULO', l: 'R$ / módulo' },
    { v: 'FIXO', l: 'R$ fixo' }
];
const TIPOS_HOMOLOGACAO = [
    { v: 'FIXO', l: 'R$ fixo' },
    { v: 'POR_KWP', l: 'R$ / kWp' },
    { v: 'PERCENTUAL', l: '% do kit' }
];
const TIPOS_OUTROS = [
    { v: 'FIXO', l: 'R$' },
    { v: 'PERCENTUAL', l: '%' }
];

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const fmt2 = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// "1.234,56" / "5,4" / "7500.50" -> número
function parseNum(v) {
    let t = String(v ?? '').replace(/[^\d.,-]/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------
// Cálculos (para a futura etapa de Formação de Preço)
// ------------------------------------------------------------------

// Faixa que vale para o valor x. Faixas ordenadas por "de"; vale a primeira
// cujo limite superior alcança x (ate vazio = sem limite). Isso também cobre
// valores que caem entre duas faixas (ex.: 3,005 kWp entre 3,00 e 3,01).
export function faixaAplicavel(faixas, x) {
    const ordenadas = [...(faixas || [])].sort((a, b) => (Number(a.de) || 0) - (Number(b.de) || 0));
    // se passou do limite da última faixa, vale a última (nunca fica sem preço)
    return ordenadas.find(f => f.ate === null || f.ate === undefined || Number(x) <= Number(f.ate)) || ordenadas[ordenadas.length - 1] || null;
}

export function calcularMaoDeObra(cfg, qtdModulos) {
    const faixa = faixaAplicavel(cfg?.mao_obra_faixas, qtdModulos);
    if (!faixa) return { faixa: null, valor: 0 };
    const valor = faixa.tipo === 'POR_MODULO' ? Number(faixa.valor) * Number(qtdModulos || 0) : Number(faixa.valor);
    return { faixa, valor: valor || 0 };
}

export function calcularHomologacao(cfg, kwp, valorKit = 0) {
    const faixa = faixaAplicavel(cfg?.homologacao_faixas, kwp);
    if (!faixa) return { faixa: null, valor: 0 };
    let valor = Number(faixa.valor);
    if (faixa.tipo === 'POR_KWP') valor = Number(faixa.valor) * Number(kwp || 0);
    else if (faixa.tipo === 'PERCENTUAL') valor = (Number(faixa.valor) / 100) * Number(valorKit || 0);
    return { faixa, valor: valor || 0 };
}

// Junta a linha do banco com os padrões (campos ausentes usam o padrão).
function normalizar(row) {
    const base = padrao();
    if (!row) return base;
    CAMPOS.forEach(c => { if (row[c] !== null && row[c] !== undefined) base[c] = row[c]; });
    base.imposto_valor = Number(base.imposto_valor);
    base.margem_valor = Number(base.margem_valor);
    return base;
}

// Configuração de precificação de um projeto (salva ou padrão).
export async function obterPrecificacaoProjeto(projetoId) {
    const { data, error } = await state.supabaseClient.from(TABELA).select('*').eq('projeto_id', String(projetoId)).maybeSingle();
    if (error) throw error;
    return normalizar(data);
}

// ------------------------------------------------------------------
// Estado da tela
// ------------------------------------------------------------------
let projetoId = null;   // projeto aberto
let cfg = null;         // cópia em edição
let snapshot = '';      // JSON da última versão salva (para saber se há alterações)
let tabelaOk = true;    // false quando a tabela ainda não existe no Supabase
let tokenCarga = 0;

const sujo = () => !!cfg && JSON.stringify(cfg) !== snapshot;

// Chamado pelo botão ⚙ do card do projeto
export function abrirPrecificacaoProjeto(id) {
    navegarPara(`/projeto/${id}/precificacao`);
}

export function voltarDaPrecificacao() {
    if (sujo() && !confirm('Há alterações não salvas. Deseja sair mesmo assim?')) return;
    navegarPara('/projetos');
}

// Chamado pelo Router (router.js) quando a URL é /projeto/:id/precificacao
export async function renderPrecificacaoNaRota(id) {
    const projeto = state.localProjetos.find(p => String(p.id) === String(id));
    if (!projeto) return;

    switchTab('precificacao-tab');
    // mantém "Projetos" destacado na sidebar
    const nav = document.getElementById('nav-projetos-tab');
    if (nav) nav.className = 'sidebar-link flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-bold bg-amber-400 text-slate-950';

    const sub = el('prec-subtitulo');
    if (sub) sub.textContent = `${projeto.nome}${projeto.cliente_nome ? ' · ' + projeto.cliente_nome : ''}`;

    ligarEventos();

    // O Router chama esta função de novo a cada sincronização: não perde o que está sendo editado.
    if (String(projetoId) === String(id) && cfg) {
        renderForm();
        return;
    }
    if (!state.supabaseClient) {
        el('precificacao-conteudo').innerHTML = '<p class="text-sm text-slate-400">Carregando…</p>';
        return;
    }

    projetoId = id;
    cfg = null;
    const token = ++tokenCarga;
    el('prec-erro').classList.add('hidden');
    el('precificacao-conteudo').innerHTML = '<p class="text-sm text-slate-400">Carregando configurações…</p>';

    let dados = null;
    tabelaOk = true;
    try {
        const { data, error } = await state.supabaseClient.from(TABELA).select('*').eq('projeto_id', String(id)).maybeSingle();
        if (error) throw error;
        dados = data;
    } catch (err) {
        tabelaOk = false;
        const erro = el('prec-erro');
        erro.textContent = /does not exist|relation|schema cache|42P01|PGRST205/i.test(err.message)
            ? 'A tabela projeto_precificacao ainda não existe no Supabase. Rode o SQL 009 e recarregue a página. Enquanto isso, só dá para ver os valores padrão.'
            : `Erro ao carregar as configurações: ${err.message}`;
        erro.classList.remove('hidden');
    }
    if (token !== tokenCarga) return; // outra carga mais nova assumiu

    cfg = normalizar(dados);
    snapshot = dados ? JSON.stringify(cfg) : JSON.stringify(padrao()); // sem linha salva: padrão = "salvo"
    renderForm();
}

// ------------------------------------------------------------------
// Renderização
// ------------------------------------------------------------------
const BASE_CAMPO = 'flex items-center rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-amber-400 focus-within:border-amber-400 transition-shadow';
const BASE_INPUT = 'w-full min-w-0 py-2.5 px-3 text-sm font-semibold text-slate-900 tabular-nums bg-transparent outline-none placeholder:text-slate-300';

// Campo numérico. kind: moeda (máscara que anda os dígitos) | percent | int | dec
function campo(kind, valor, attrs, opts = {}) {
    let value = '';
    let extra = '';
    let inputmode = 'decimal';
    if (kind === 'moeda') {
        const cent = Math.round((Number(valor) || 0) * 100);
        value = fmt2((Number(valor) || 0));
        extra = ` data-d="${cent > 0 ? cent : ''}"`;
        inputmode = 'numeric';
    } else if (kind === 'percent') {
        value = valor === null || valor === undefined ? '' : fmtP(valor);
    } else if (kind === 'int') {
        value = valor === null || valor === undefined ? '' : String(valor);
        inputmode = 'numeric';
    } else if (kind === 'dec') {
        value = valor === null || valor === undefined ? '' : fmt2(valor);
    }
    const pre = kind === 'moeda' ? '<span class="pl-3 text-sm font-semibold text-slate-400 select-none">R$</span>' : '';
    const suf = kind === 'percent' ? '<span class="pr-3 text-sm font-semibold text-slate-400 select-none">%</span>' : '';
    const alinhamento = kind === 'moeda' ? 'text-right' : '';
    return `
        <div class="${BASE_CAMPO}">
            ${pre}
            <input type="text" inputmode="${inputmode}" autocomplete="off" data-t="${kind}" ${attrs}${extra} value="${esc(value)}" placeholder="${esc(opts.placeholder || '')}"
                class="${BASE_INPUT} ${alinhamento}">
            ${suf}
        </div>`;
}

function seletor(opcoes, atual, attrs) {
    return `<select data-t="select" ${attrs} class="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400">
        ${opcoes.map(o => `<option value="${o.v}" ${o.v === atual ? 'selected' : ''}>${o.l}</option>`).join('')}
    </select>`;
}

// Botões "%" | "R$"
function alternador(chave, atual) {
    const btn = (v, rotulo) => `<button type="button" data-acao="tipo-simples" data-k="${chave}" data-valor="${v}"
        class="px-3.5 py-2 text-sm font-bold transition-colors ${atual === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}">${rotulo}</button>`;
    return `<div class="inline-flex rounded-lg border border-slate-200 overflow-hidden">${btn('PERCENTUAL', '%')}${btn('FIXO', 'R$')}</div>`;
}

function blocoValorSimples(titulo, icone, chave, hint) {
    const tipo = cfg[`${chave}_tipo`];
    return `
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <h3 class="font-bold text-slate-700 text-xs uppercase tracking-wider"><i class="fa-solid ${icone} mr-1 text-amber-500"></i> ${titulo}</h3>
            <div class="flex items-center gap-3 flex-wrap">
                <div class="w-44">${campo(tipo === 'PERCENTUAL' ? 'percent' : 'moeda', cfg[`${chave}_valor`], `data-k="${chave}_valor"`)}</div>
                ${alternador(`${chave}_tipo`, tipo)}
            </div>
            <p class="text-xs text-slate-400">${hint}</p>
        </div>`;
}

function tabelaFaixas({ lista, unidadeKind, unidadeRotulo, tipos }) {
    const linhas = cfg[lista];
    const grade = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_2.25rem] gap-2 items-center';
    const cab = `<div class="${grade} px-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
        <span>De (${unidadeRotulo})</span><span>Até (${unidadeRotulo})</span><span>Valor</span><span>Tipo</span><span></span></div>`;
    const corpo = linhas.length === 0
        ? '<div class="text-xs text-slate-400 text-center py-5 border border-dashed border-slate-200 rounded-xl">Nenhuma faixa. Use “Adicionar faixa”.</div>'
        : linhas.map((f, i) => {
            const at = `data-lista="${lista}" data-i="${i}"`;
            return `<div class="${grade}">
                ${campo(unidadeKind, f.de, `${at} data-k="de"`)}
                ${campo(unidadeKind, f.ate, `${at} data-k="ate"`, { placeholder: 'sem limite' })}
                ${campo(f.tipo === 'PERCENTUAL' ? 'percent' : 'moeda', f.valor, `${at} data-k="valor"`)}
                ${seletor(tipos, f.tipo, `${at} data-k="tipo"`)}
                <button type="button" data-acao="del-faixa" data-lista="${lista}" data-i="${i}" title="Excluir faixa"
                    class="w-9 h-9 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
        }).join('');
    return `<div class="space-y-2">${linhas.length ? cab : ''}${corpo}
        <button type="button" data-acao="add-faixa" data-lista="${lista}"
            class="mt-1 px-4 py-2 rounded-lg border border-dashed border-slate-300 text-xs font-bold uppercase tracking-wider text-slate-600 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-colors">
            <i class="fa-solid fa-plus mr-1"></i> Adicionar faixa</button></div>`;
}

function blocoMaoDeObra() {
    return `
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 class="font-bold text-slate-700 text-xs uppercase tracking-wider"><i class="fa-solid fa-helmet-safety mr-1 text-amber-500"></i> Mão de obra</h3>
            <div class="max-w-xs">
                <label class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Tipo</label>
                ${seletor([{ v: 'MODULO', l: 'R$ / Módulo' }], cfg.mao_obra_unidade, 'data-k="mao_obra_unidade"')}
            </div>
            <div>
                <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Faixas</p>
                ${tabelaFaixas({ lista: 'mao_obra_faixas', unidadeKind: 'int', unidadeRotulo: 'módulos', tipos: TIPOS_MAO_OBRA })}
            </div>
            <p class="text-xs text-slate-400">A quantidade de módulos vem do Kit Gerador da proposta. Deixe “Até” vazio na última faixa (sem limite).</p>
        </div>`;
}

function blocoHomologacao() {
    return `
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 class="font-bold text-slate-700 text-xs uppercase tracking-wider"><i class="fa-solid fa-file-circle-check mr-1 text-amber-500"></i> Homologação</h3>
            <div class="max-w-xs">
                <label class="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Tipo</label>
                ${seletor([{ v: 'KWP', l: 'R$ / kWp' }], cfg.homologacao_unidade, 'data-k="homologacao_unidade"')}
            </div>
            <div>
                <p class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Faixas</p>
                ${tabelaFaixas({ lista: 'homologacao_faixas', unidadeKind: 'dec', unidadeRotulo: 'kWp', tipos: TIPOS_HOMOLOGACAO })}
            </div>
            <p class="text-xs text-slate-400">A faixa é escolhida pela potência <b>real</b> do Kit Gerador da proposta (calculada pelos módulos). Essa potência nunca é digitada.</p>
        </div>`;
}

function blocoOutrosCustos() {
    const linhas = cfg.outros_custos;
    const grade = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_2.25rem] gap-2 items-center';
    const corpo = linhas.length === 0
        ? '<div class="text-xs text-slate-400 text-center py-5 border border-dashed border-slate-200 rounded-xl">Nenhum outro custo cadastrado.</div>'
        : `<div class="${grade} px-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400"><span>Descrição</span><span>Valor</span><span>Tipo</span><span></span></div>` +
          linhas.map((c, i) => {
            const at = `data-lista="outros_custos" data-i="${i}"`;
            return `<div class="${grade}">
                <div class="${BASE_CAMPO}"><input type="text" data-t="texto" ${at} data-k="descricao" value="${esc(c.descricao)}" placeholder="Ex.: Deslocamento" class="${BASE_INPUT}"></div>
                ${campo(c.tipo === 'PERCENTUAL' ? 'percent' : 'moeda', c.valor, `${at} data-k="valor"`)}
                ${seletor(TIPOS_OUTROS, c.tipo, `${at} data-k="tipo"`)}
                <button type="button" data-acao="del-outro" data-i="${i}" title="Excluir custo" class="w-9 h-9 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
        }).join('');
    return `
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <h3 class="font-bold text-slate-700 text-xs uppercase tracking-wider"><i class="fa-solid fa-layer-group mr-1 text-amber-500"></i> Outros custos</h3>
            <div class="space-y-2">${corpo}
                <button type="button" data-acao="add-outro"
                    class="mt-1 px-4 py-2 rounded-lg border border-dashed border-slate-300 text-xs font-bold uppercase tracking-wider text-slate-600 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-colors">
                    <i class="fa-solid fa-plus mr-1"></i> Adicionar custo</button>
            </div>
        </div>`;
}

function renderForm() {
    const box = el('precificacao-conteudo');
    if (!box || !cfg) return;
    box.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            ${blocoValorSimples('Impostos', 'fa-percent', 'imposto', 'Padrão: 6%. Escolha se o imposto é uma porcentagem ou um valor fixo.')}
            ${blocoValorSimples('Margem de lucro', 'fa-chart-line', 'margem', 'Padrão: 30%. Escolha se a margem é uma porcentagem ou um valor fixo.')}
        </div>
        ${blocoMaoDeObra()}
        ${blocoHomologacao()}
        ${blocoOutrosCustos()}`;
    atualizarBarra();
}

function atualizarBarra() {
    const btn = el('btn-salvar-prec');
    const status = el('prec-status');
    const alterado = sujo();
    if (btn) {
        btn.disabled = !tabelaOk || !alterado;
        btn.classList.toggle('opacity-40', btn.disabled);
        btn.classList.toggle('cursor-not-allowed', btn.disabled);
    }
    if (status) {
        status.textContent = !tabelaOk ? '' : (alterado ? 'Alterações não salvas' : (status.dataset.salvo || ''));
        status.className = 'text-xs font-semibold ' + (alterado ? 'text-amber-600' : 'text-slate-400');
    }
}

// ------------------------------------------------------------------
// Eventos (delegação no contêiner — os campos são redesenhados com frequência)
// ------------------------------------------------------------------
function ligarEventos() {
    const box = el('precificacao-conteudo');
    if (!box || box.dataset.ligado) return;
    box.dataset.ligado = '1';

    // seleção total do campo de moeda (digitar/apagar substitui tudo)
    box.addEventListener('beforeinput', ev => {
        const t = ev.target;
        if (t.dataset?.t !== 'moeda') return;
        t.dataset.all = t.value.length > 0 && t.selectionStart === 0 && t.selectionEnd >= t.value.length ? '1' : '';
    });

    // cursor sempre no fim do campo de moeda
    box.addEventListener('focusin', ev => {
        const t = ev.target;
        if (t.dataset?.t === 'moeda') setTimeout(() => t.setSelectionRange(t.value.length, t.value.length));
        else if (t.dataset?.t && t.tagName === 'INPUT') setTimeout(() => t.select());
    });

    box.addEventListener('input', ev => {
        const t = ev.target;
        const kind = t.dataset?.t;
        if (!kind || t.tagName !== 'INPUT') return;
        let valor;
        if (kind === 'moeda') {
            mascaraMoeda(t, ev);
            valor = Number(t.dataset.d || 0) / 100;
        } else if (kind === 'int') {
            t.value = t.value.replace(/\D/g, '');
            valor = t.value === '' ? null : parseInt(t.value, 10);
        } else if (kind === 'percent' || kind === 'dec') {
            t.value = t.value.replace(/[^\d.,]/g, '');
            valor = parseNum(t.value);
        } else {
            valor = t.value; // texto
        }
        gravarCampo(t, valor);
        atualizarBarra();
    });

    // ao sair do campo, mostra formatado (ex.: 3 -> 3,00)
    box.addEventListener('change', ev => {
        const t = ev.target;
        const kind = t.dataset?.t;
        if (!kind) return;
        if (kind === 'select') {
            gravarCampo(t, t.value);
            renderForm(); // o tipo muda o formato do valor (R$ <-> %)
            return;
        }
        if (kind === 'dec') t.value = t.value === '' ? '' : fmt2(parseNum(t.value));
        if (kind === 'percent') t.value = t.value === '' ? '' : fmtP(parseNum(t.value));
    });

    box.addEventListener('click', ev => {
        const b = ev.target.closest('[data-acao]');
        if (!b || !cfg) return;
        const acao = b.dataset.acao;
        const i = Number(b.dataset.i);

        if (acao === 'tipo-simples') {
            cfg[b.dataset.k] = b.dataset.valor;
        } else if (acao === 'add-faixa') {
            adicionarFaixa(b.dataset.lista);
        } else if (acao === 'del-faixa') {
            const faixas = cfg[b.dataset.lista];
            const eraUltima = i === faixas.length - 1;
            faixas.splice(i, 1);
            // apagou a última: a anterior passa a valer "sem limite"
            if (eraUltima && faixas.length) faixas[faixas.length - 1].ate = null;
        } else if (acao === 'add-outro') {
            cfg.outros_custos.push({ descricao: '', valor: 0, tipo: 'FIXO' });
        } else if (acao === 'del-outro') {
            cfg.outros_custos.splice(i, 1);
        } else {
            return;
        }
        renderForm();
    });
}

function gravarCampo(t, valor) {
    const k = t.dataset.k;
    if (t.dataset.lista) {
        const item = cfg[t.dataset.lista]?.[Number(t.dataset.i)];
        if (item) item[k] = valor;
    } else {
        cfg[k] = valor;
    }
}

// Nova faixa começa logo depois da última (e fecha a última, se estava sem limite).
function adicionarFaixa(lista) {
    const faixas = cfg[lista];
    const ehKwp = lista === 'homologacao_faixas';
    const passo = ehKwp ? 0.01 : 1;
    const tipo = ehKwp ? 'FIXO' : 'POR_MODULO';
    const ultima = faixas[faixas.length - 1];
    let de = 0;
    if (ultima) {
        if (ultima.ate === null || ultima.ate === undefined) {
            ultima.ate = Math.round(((Number(ultima.de) || 0) + (ehKwp ? 1 : 4)) * 100) / 100;
        }
        de = Math.round((Number(ultima.ate) + passo) * 100) / 100;
    }
    faixas.push({ de, ate: null, valor: 0, tipo });
}

// Máscara de moeda: só dígitos, os 2 últimos são os centavos, e os números
// "andam" conforme você digita (0,00 -> 0,01 -> 0,12 -> 1,23 ...).
// Não depende da posição do cursor.
function mascaraMoeda(input, ev) {
    const tipo = ev?.inputType || '';
    const tudo = input.dataset.all === '1';
    let d = input.dataset.d ?? input.value.replace(/\D/g, '');
    if (tipo === 'insertText' || tipo === 'insertCompositionText') {
        if (/^\d$/.test(ev.data || '')) d = (tudo ? '' : d) + ev.data;
    } else if (tipo.startsWith('delete')) {
        d = tudo ? '' : d.slice(0, -1);
    } else {
        d = input.value.replace(/\D/g, '');
    }
    input.dataset.all = '';
    d = d.replace(/^0+/, '').slice(0, 13);
    input.dataset.d = d;
    const p = d.padStart(3, '0');
    input.value = `${p.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${p.slice(-2)}`;
    input.setSelectionRange(input.value.length, input.value.length);
}

// ------------------------------------------------------------------
// Validação e salvamento
// ------------------------------------------------------------------
function validarFaixas(faixas, nome, unidade) {
    const erros = [];
    const ord = [...faixas].sort((a, b) => (Number(a.de) || 0) - (Number(b.de) || 0));
    ord.forEach((f, i) => {
        const n = `${nome}, faixa ${i + 1}`;
        if (f.de === null || f.de === undefined || f.de < 0) erros.push(`${n}: informe o “De” (${unidade}).`);
        if (f.ate !== null && f.ate !== undefined && f.ate < f.de) erros.push(`${n}: o “Até” não pode ser menor que o “De”.`);
        if (f.valor === null || f.valor === undefined || f.valor < 0) erros.push(`${n}: informe o valor.`);
        if ((f.ate === null || f.ate === undefined) && i < ord.length - 1) erros.push(`${n}: só a última faixa pode ficar sem limite (“Até” vazio).`);
        const prox = ord[i + 1];
        if (prox && f.ate !== null && f.ate !== undefined && prox.de <= f.ate) erros.push(`${n}: sobrepõe a faixa seguinte.`);
    });
    return erros;
}

function validar() {
    const erros = [];
    if (cfg.imposto_valor === null || cfg.imposto_valor < 0) erros.push('Impostos: informe um valor válido.');
    if (cfg.imposto_tipo === 'PERCENTUAL' && cfg.imposto_valor > 100) erros.push('Impostos: a porcentagem não pode passar de 100%.');
    if (cfg.margem_valor === null || cfg.margem_valor < 0) erros.push('Margem de lucro: informe um valor válido.');
    erros.push(...validarFaixas(cfg.mao_obra_faixas, 'Mão de obra', 'módulos'));
    erros.push(...validarFaixas(cfg.homologacao_faixas, 'Homologação', 'kWp'));
    cfg.outros_custos.forEach((c, i) => {
        if (!String(c.descricao || '').trim()) erros.push(`Outros custos, linha ${i + 1}: informe a descrição.`);
        if (c.valor === null || c.valor < 0) erros.push(`Outros custos, linha ${i + 1}: informe o valor.`);
    });
    return erros;
}

export async function salvarPrecificacao() {
    if (!cfg || !projetoId || !tabelaOk) return;
    const erros = validar();
    if (erros.length) {
        alert('Corrija antes de salvar:\n\n• ' + erros.join('\n• '));
        return;
    }
    const linha = {
        projeto_id: String(projetoId),
        ...clone(cfg),
        updated_at: new Date().toISOString()
    };
    try {
        const { error } = await state.supabaseClient.from(TABELA).upsert(linha, { onConflict: 'projeto_id' });
        if (error) throw error;
    } catch (err) {
        alert('Erro ao salvar as configurações: ' + err.message);
        return;
    }
    snapshot = JSON.stringify(cfg);
    const status = el('prec-status');
    if (status) status.dataset.salvo = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    atualizarBarra();
}

export function restaurarPrecificacaoPadrao() {
    if (!cfg) return;
    if (!confirm('Restaurar os valores padrão (imposto 6%, margem 30%, faixas de mão de obra e homologação)? As alterações só valem depois de salvar.')) return;
    cfg = padrao();
    renderForm();
}
