// revisao-proposta.js
// ETAPA 5 — REVISÃO DA PROPOSTA FOTOVOLTAICA.
// (Junta as antigas etapas 2.3.6 e 2.3.7. Não existe etapa separada de
// Condições Comerciais ou Pagamento. Não há mais botão "Finalizar": os
// valores vão para a lista de propostas a cada salvamento automático, e a
// etapa 6 (Arquivos) gera a pré-visualização e os arquivos.)
//
// É um EDITOR COMERCIAL: mostra o Kit Gerador, os custos, permite alterar
// custo e margem de cada item, adicionar custos, ver com/sem margem, fechar o
// total num valor desejado.
//
// Independente do Orçamento Avulso. Só LÊ os dados das etapas anteriores
// (orcamentos, unidades_consumidoras, proposta_equipamentos,
// proposta_kit_gerador) e a Configuração de Precificação; só GRAVA em
// proposta_revisao (sql/010) e, a cada salvamento, nos três campos de valor da
// própria linha da proposta em "orcamentos".
//
// Contas: revisao-calculo.js. Nenhum valor comercial fica fixo na tela.

import { state } from './state.js';
import { obterPrecificacaoProjeto, calcularMaoDeObra, calcularHomologacao } from './precificacao.js';
import { calcularProposta } from './revisao-calculo.js';

const TABELA = 'proposta_revisao';

const TIPO_LABEL = {
    MODULO: 'Módulo', INVERSOR: 'Inversor', MICROINVERSOR: 'Microinversor', OTIMIZADOR: 'Otimizador'
};
const TIPOS_CALCULO = [
    { v: 'FIXO', l: 'R$ fixo' },
    { v: 'POR_MODULO', l: 'R$ / módulo' },
    { v: 'POR_KWP', l: 'R$ / kWp' },
    { v: 'PERCENTUAL_KIT', l: '% do kit' }
];

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = id => document.getElementById(id);
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt2 = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const clone = o => JSON.parse(JSON.stringify(o));

function parseNum(v) {
    let t = String(v ?? '').replace(/[^\d.,-]/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
}

// Máscara de moeda: os dígitos "andam" (0,00 -> 0,01 -> 0,12 -> 1,23 ...).
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

const inputBase = 'w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 tabular-nums focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none';

function campoMoeda(attrs, valor) {
    const v = Number(valor) || 0;
    return `<input type="text" inputmode="numeric" data-t="moeda" ${attrs} data-d="${Math.round(v * 100)}" value="${fmt2(v)}" class="${inputBase} text-right">`;
}
function campoPercent(attrs, valor) {
    return `<input type="text" inputmode="decimal" data-t="percent" ${attrs} value="${valor === null || valor === undefined ? '' : fmtP(valor)}" class="${inputBase} text-right">`;
}

// ------------------------------------------------------------------
// Estado
// ------------------------------------------------------------------
let propostaId = null;
let cfg = null;             // Configuração de Precificação (única do sistema)
let kit = null;             // dados do Kit Gerador lidos do banco
let proposta = null;        // linha de orcamentos
let ucsCount = 0;
let rev = null;             // { itens, geral:{tipo,valor}|null, desejado, finalizada, finalizada_em }
let visao = 'COM';          // COM | SEM margem (só visualização)
let novoAberto = false;
let novo = null;            // rascunho de "+ Adicionar custo"
let tabelaOk = true;
let statusTxt = '';
let timerSalvar = null;
let tokenCarga = 0;
let ligado = false;

// ------------------------------------------------------------------
// Carregamento
// ------------------------------------------------------------------
export async function carregarRevisaoProposta(id) {
    propostaId = String(id);
    const token = ++tokenCarga;
    const box = el('revisao-conteudo');
    if (!box) return;
    ligarEventos();
    box.innerHTML = '<p class="text-sm text-slate-400">Carregando revisão…</p>';

    const db = state.supabaseClient;
    let erroTabela = null;
    try {
        const [orc, eq, kg, ucs, pc, rv] = await Promise.all([
            db.from('orcamentos').select('*').eq('id', id).maybeSingle(),
            db.from('proposta_equipamentos').select('*').eq('proposta_id', id).order('ordem', { ascending: true }),
            db.from('proposta_kit_gerador').select('*').eq('proposta_id', id).maybeSingle(),
            db.from('unidades_consumidoras').select('id', { count: 'exact', head: true }).eq('proposta_id', id),
            obterPrecificacaoProjeto().catch(() => null),
            db.from(TABELA).select('*').eq('proposta_id', propostaId).maybeSingle()
        ]);
        if (orc.error) throw orc.error;
        if (eq.error) throw eq.error;
        if (kg.error) throw kg.error;
        if (ucs.error) throw ucs.error;
        if (rv.error) erroTabela = rv.error;

        if (token !== tokenCarga) return;
        proposta = orc.data;
        kit = montarKit(eq.data || [], kg.data);
        ucsCount = ucs.count || 0;
        cfg = pc;
        tabelaOk = !erroTabela;
        rev = normalizarRev(rv.data);
    } catch (err) {
        if (token !== tokenCarga) return;
        box.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg">Erro ao carregar a revisão: ${esc(err.message)}</div>`;
        return;
    }

    visao = 'COM';
    novoAberto = false;
    statusTxt = '';
    renderTudo();
    sincronizarValoresOrcamento();
}

function montarKit(equipamentos, kitRow) {
    const soma = tipo => equipamentos.filter(e => e.tipo === tipo)
        .reduce((a, e) => a + (Number(e.potencia_unitaria) || 0) * (Number(e.quantidade) || 0), 0);
    const qtd = tipo => equipamentos.filter(e => e.tipo === tipo).reduce((a, e) => a + (Number(e.quantidade) || 0), 0);
    return {
        equipamentos,
        topologia: kitRow?.topologia || 'Tradicional',
        valorKit: Number(kitRow?.kit_valor) || 0,
        geracao: Number(kitRow?.kit_geracao_kwh) || 0,
        kwp: soma('MODULO') / 1000,              // sempre calculada a partir dos módulos
        kwCA: (soma('INVERSOR') + soma('MICROINVERSOR')) / 1000,
        qtdModulos: qtd('MODULO'),
        qtdInversores: qtd('INVERSOR') + qtd('MICROINVERSOR')
    };
}

function normalizarRev(row) {
    return {
        itens: Array.isArray(row?.itens) ? clone(row.itens) : [],
        geral: row?.margem_geral_tipo && row.margem_geral_valor !== null && row.margem_geral_valor !== undefined
            ? { tipo: row.margem_geral_tipo, valor: Number(row.margem_geral_valor) } : null,
        desejado: row?.valor_desejado !== null && row?.valor_desejado !== undefined ? Number(row.valor_desejado) : null,
        finalizada: !!row?.finalizada,
        finalizada_em: row?.finalizada_em || null
    };
}

// ------------------------------------------------------------------
// Itens de custo
// ------------------------------------------------------------------
// Custos automáticos: vêm do Kit Gerador + Configuração de Precificação.
function definicoesAuto() {
    const c = cfg;
    const defs = [
        { key: 'equipamentos', descricao: 'Equipamentos (Kit Gerador)', custo: kit.valorKit, nota: 'Valor do kit' },
        {
            key: 'mao-de-obra', descricao: 'Mão de obra', custo: c ? calcularMaoDeObra(c, kit.qtdModulos).valor : 0,
            nota: `${kit.qtdModulos} módulo(s)`
        },
        {
            key: 'homologacao', descricao: 'Homologação', custo: c ? calcularHomologacao(c, kit.kwp, kit.valorKit).valor : 0,
            nota: `${fmt2(kit.kwp)} kWp`
        }
    ];
    (c?.outros_custos || []).forEach((o, i) => {
        const valor = o.tipo === 'PERCENTUAL' ? (Number(o.valor) / 100) * kit.valorKit : Number(o.valor);
        defs.push({ key: `outro-${i}`, descricao: o.descricao || `Outro custo ${i + 1}`, custo: valor || 0, nota: o.tipo === 'PERCENTUAL' ? `${fmtP(o.valor)}% do kit` : '' });
    });
    return defs;
}

function custoExtra(it) {
    const v = Number(it.valor_unit) || 0;
    switch (it.tipo_calculo) {
        case 'POR_MODULO': return v * kit.qtdModulos;
        case 'POR_KWP': return v * kit.kwp;
        case 'PERCENTUAL_KIT': return (v / 100) * kit.valorKit;
        default: return v;
    }
}

// Lista final de itens (automáticos + extras), já com custo resolvido.
function itensResolvidos() {
    const salvos = new Map(rev.itens.map(i => [i.key, i]));
    const out = [];
    definicoesAuto().forEach(d => {
        const s = salvos.get(d.key) || {};
        out.push({
            key: d.key, extra: false, descricao: d.descricao, nota: d.nota,
            custoAuto: d.custo,
            custo_manual: s.custo_manual ?? null,
            margem_tipo: s.margem_tipo ?? null, margem_valor: s.margem_valor ?? null,
            custo: s.custo_manual ?? d.custo
        });
    });
    rev.itens.filter(i => i.extra).forEach(s => {
        const auto = custoExtra(s);
        out.push({
            key: s.key, extra: true, descricao: s.descricao || 'Custo adicional',
            nota: TIPOS_CALCULO.find(t => t.v === s.tipo_calculo)?.l || '',
            tipo_calculo: s.tipo_calculo, valor_unit: s.valor_unit,
            custoAuto: auto, custo_manual: s.custo_manual ?? null,
            margem_tipo: s.margem_tipo ?? null, margem_valor: s.margem_valor ?? null,
            custo: s.custo_manual ?? auto
        });
    });
    return out;
}

// Registro editável (grava só o que o usuário mexeu, para os automáticos)
function registro(key) {
    let r = rev.itens.find(i => i.key === key);
    if (!r) { r = { key, extra: false }; rev.itens.push(r); }
    return r;
}

function margemPadrao() {
    if (rev.geral) return rev.geral;
    return { tipo: cfg?.margem_tipo || 'PERCENTUAL', valor: cfg ? Number(cfg.margem_valor) : 30 };
}
function impostoCfg() {
    return { tipo: cfg?.imposto_tipo || 'PERCENTUAL', valor: cfg ? Number(cfg.imposto_valor) : 6 };
}

function calcular(comAlvo = true) {
    const itens = itensResolvidos();
    const r = calcularProposta({
        itens: itens.map(i => ({ key: i.key, custo: i.custo, margem_tipo: i.margem_tipo, margem_valor: i.margem_valor })),
        padrao: margemPadrao(),
        imposto: impostoCfg(),
        valorDesejado: comAlvo ? rev.desejado : null
    });
    return { itens, r };
}

// ------------------------------------------------------------------
// Render
// ------------------------------------------------------------------
function renderTudo() {
    const box = el('revisao-conteudo');
    if (!box || !rev) return;
    const { r } = calcular();

    // pedido de valor impossível (abaixo de custo + imposto): descarta e avisa
    if (rev.desejado !== null && !r.alvo.viavel) {
        rev.desejado = null;
        statusTxt = `Valor desejado abaixo do mínimo (${brl(r.alvo.minimo)}): voltou ao cálculo automático.`;
        agendarSalvar();
        return renderTudo();
    }

    box.innerHTML = `
        ${avisosHtml()}
        ${kitHtml()}
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs">
            <div class="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-slate-100">
                <div>
                    <h3 class="font-black text-slate-800 text-sm uppercase tracking-wider">Custos da proposta</h3>
                    <p class="text-[11px] text-slate-400 font-semibold mt-0.5">Altere o custo ou a margem de cada item. Os custos automáticos vêm do Kit Gerador e da Precificação.</p>
                </div>
                <div class="flex items-center gap-2">
                    <div class="inline-flex rounded-lg border border-slate-200 overflow-hidden text-xs font-bold" id="rev-visao">
                        ${['COM', 'SEM'].map(v => `<button type="button" data-acao="visao" data-v="${v}" class="px-3 py-2 ${visao === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}">${v === 'COM' ? 'COM MARGEM' : 'SEM MARGEM'}</button>`).join('')}
                    </div>
                    <button type="button" data-acao="novo-custo" class="px-3.5 py-2 rounded-lg font-bold text-xs bg-amber-400 hover:bg-amber-500 text-slate-950 flex items-center gap-1.5"><i class="fa-solid fa-plus"></i> Adicionar custo</button>
                </div>
            </div>
            <div id="rev-novo">${novoHtml()}</div>
            <div id="rev-linhas" class="p-3 sm:p-4">${linhasHtml()}</div>
            ${geralHtml()}
        </div>
        <div id="rev-total-box">${totalHtml()}</div>
        <div id="rev-totais">${totaisHtml()}</div>
        <div id="rev-final">${finalHtml()}</div>
        <div id="rev-status" class="text-[11px] font-semibold text-slate-400 text-right"></div>
    `;
    atualizarSaidas();
}

function avisosHtml() {
    const out = [];
    if (!tabelaOk) out.push('A tabela proposta_revisao ainda não existe no Supabase. Rode o SQL 010 e recarregue. Enquanto isso você vê o cálculo, mas nada é gravado.');
    if (!cfg) out.push('Não foi possível ler a Configuração de Precificação; usando os padrões (imposto 6%, margem 30%).');
    const avisos = out.map(t => `<div class="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-lg">${esc(t)}</div>`).join('');
    return avisos;
}

// ----- 1. Resumo do Kit Gerador -----
function potTxt(w) {
    const n = Number(w) || 0;
    return n >= 1000 ? `${fmtP(n / 1000)} kW` : `${fmtP(n)} W`;
}
function kitHtml() {
    const linhas = kit.equipamentos.length
        ? kit.equipamentos.map(e => `
            <div class="flex items-baseline gap-2 text-sm">
                <span class="font-black text-amber-400 tabular-nums">${Number(e.quantidade) || 0} ×</span>
                <span class="font-semibold text-white">${esc(TIPO_LABEL[e.tipo] || e.tipo)} ${esc(e.fabricante || '')} ${esc(e.modelo || '')}</span>
                <span class="text-slate-400 text-xs">${potTxt(e.potencia_unitaria)}</span>
            </div>`).join('')
        : '<p class="text-sm text-slate-400">Nenhum equipamento no Kit Gerador.</p>';
    return `
        <div class="bg-slate-900 text-white rounded-xl shadow-md p-6">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <p class="text-xs font-bold uppercase tracking-wider text-amber-400">Kit Gerador</p>
                    <p class="text-4xl font-black mt-1 tabular-nums">${fmt2(kit.kwp)} kWp</p>
                    <p class="text-[11px] text-slate-400 mt-1">Potência total, calculada a partir dos módulos.</p>
                </div>
                <button type="button" data-acao="ver-kit" class="px-4 py-2.5 rounded-lg font-bold text-xs bg-white/10 hover:bg-white/20 text-white flex items-center gap-2"><i class="fa-solid fa-magnifying-glass text-amber-400"></i> Ver detalhes do Kit</button>
            </div>
            <div class="mt-4 space-y-1.5">${linhas}</div>
        </div>`;
}

// ----- 2. Custos -----
function colunas() {
    return visao === 'COM'
        ? 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_64px]'
        : 'grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_64px]';
}

function linhasHtml() {
    const { itens, r } = calcular();
    const c = colunas();
    const cab = visao === 'COM'
        ? '<span>Descrição</span><span class="text-right">Custo</span><span class="text-right">Margem</span><span class="text-right">Preço</span><span></span>'
        : '<span>Descrição</span><span class="text-right">Custo</span><span></span>';
    const linhas = itens.map((it, i) => {
        const editado = it.custo_manual !== null || it.margem_tipo !== null;
        const acoes = `
            <div class="flex items-center justify-end gap-1">
                ${!it.extra && editado ? `<button type="button" data-acao="restaurar" data-k="${esc(it.key)}" title="Voltar ao automático" class="w-7 h-7 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50"><i class="fa-solid fa-rotate-left text-xs"></i></button>` : ''}
                ${it.extra ? `<button type="button" data-acao="remover" data-k="${esc(it.key)}" title="Excluir custo" class="w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"><i class="fa-solid fa-trash text-xs"></i></button>` : ''}
            </div>`;
        const margemCell = visao === 'COM' ? `
            <div class="flex gap-1.5 items-center">
                <div class="flex-1 min-w-0" data-cell="margem" data-i="${i}">${margemInput(it, i, r)}</div>
                <select data-t="select" data-f="margem_tipo" data-k="${esc(it.key)}" class="${inputBase} !w-[58px] !px-1.5 shrink-0">
                    <option value="PERCENTUAL" ${margemTipoEfetivo(it) === 'PERCENTUAL' ? 'selected' : ''}>%</option>
                    <option value="FIXO" ${margemTipoEfetivo(it) === 'FIXO' ? 'selected' : ''}>R$</option>
                </select>
            </div>
            <div class="text-right font-black text-slate-900 tabular-nums" data-out="preco" data-k="${esc(it.key)}">${brl(r.itens[i].preco)}</div>` : '';
        return `
            <div class="grid ${c} gap-2 items-center py-2 border-b border-slate-100 last:border-0">
                <div class="min-w-0">
                    ${it.extra
                        ? `<input type="text" data-t="texto" data-f="desc" data-k="${esc(it.key)}" value="${esc(it.descricao)}" class="${inputBase}">`
                        : `<p class="font-bold text-slate-800 text-sm truncate">${esc(it.descricao)}</p>`}
                    <p class="text-[11px] text-slate-400 truncate">${esc(it.nota)}${it.custo_manual !== null ? ' · <span class="text-amber-600 font-bold">custo editado</span>' : ''}</p>
                </div>
                ${campoMoeda(`data-f="custo" data-k="${esc(it.key)}"`, it.custo)}
                ${margemCell}
                ${acoes}
            </div>`;
    }).join('');
    return `
        <div class="hidden md:grid ${c} gap-2 px-0 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">${cab}</div>
        ${linhas || '<p class="text-sm text-slate-400 text-center py-6">Nenhum custo.</p>'}`;
}

function margemTipoEfetivo(it) {
    if (it.margem_tipo) return it.margem_tipo;
    return margemPadrao().tipo;
}

// Campo da margem do item. Com valor desejado ativo, mostra o % resultante.
function margemInput(it, i, r) {
    const alvo = r.alvo.ativo;
    const tipo = alvo ? 'PERCENTUAL' : margemTipoEfetivo(it);
    const attrs = `data-f="margem" data-k="${esc(it.key)}"`;
    if (tipo === 'FIXO') return campoMoeda(attrs, it.margem_tipo ? it.margem_valor : r.itens[i].margem);
    const v = alvo ? r.itens[i].pct : (it.margem_tipo ? it.margem_valor : margemPadrao().valor);
    return campoPercent(attrs, Math.round(v * 100) / 100);
}

function geralHtml() {
    const g = margemPadrao();
    const { r } = calcular();
    const efetiva = r.custoTotal > 0 ? (r.margemTotal / r.custoTotal) * 100 : 0;
    return `
        <div class="px-5 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-xl flex items-end gap-3 flex-wrap">
            <div>
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Margem geral</p>
                <div class="flex gap-1.5">
                    <div class="w-32" id="rev-geral-campo">${g.tipo === 'FIXO' ? campoMoeda('data-f="geral"', g.valor) : campoPercent('data-f="geral"', g.valor)}</div>
                    <select data-t="select" data-f="geral_tipo" class="${inputBase} !w-[64px]">
                        <option value="PERCENTUAL" ${g.tipo === 'PERCENTUAL' ? 'selected' : ''}>%</option>
                        <option value="FIXO" ${g.tipo === 'FIXO' ? 'selected' : ''}>R$</option>
                    </select>
                </div>
            </div>
            <p class="text-[11px] text-slate-400 font-semibold max-w-md pb-2">Vale para todos os custos${rev.geral ? '' : ' (hoje segue a Configuração de Precificação)'}. Alterar aqui substitui as margens individuais. Margem efetiva da proposta: <b id="rev-efetiva" class="text-slate-600">${fmtP(efetiva)}%</b>.</p>
        </div>`;
}

// ----- + Adicionar custo -----
function novoHtml() {
    if (!novoAberto || !novo) return '';
    const g = margemPadrao();
    const moeda = novo.tipo_calculo !== 'PERCENTUAL_KIT';
    return `
        <div class="px-5 py-4 bg-amber-50/50 border-b border-amber-100">
            <p class="text-xs font-bold uppercase tracking-wider text-amber-700 mb-3">Novo custo</p>
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div class="sm:col-span-4"><label class="block text-[11px] font-bold text-slate-500 mb-1">Descrição</label>
                    <input type="text" data-t="texto" data-f="novo_desc" value="${esc(novo.descricao)}" placeholder="Ex.: Estrutura adicional" class="${inputBase}"></div>
                <div class="sm:col-span-2"><label class="block text-[11px] font-bold text-slate-500 mb-1">Tipo de cálculo</label>
                    <select data-t="select" data-f="novo_tipo" class="${inputBase}">${TIPOS_CALCULO.map(t => `<option value="${t.v}" ${novo.tipo_calculo === t.v ? 'selected' : ''}>${t.l}</option>`).join('')}</select></div>
                <div class="sm:col-span-2"><label class="block text-[11px] font-bold text-slate-500 mb-1">${moeda ? 'Valor (R$)' : 'Valor (%)'}</label>
                    ${moeda ? campoMoeda('data-f="novo_valor"', novo.valor) : campoPercent('data-f="novo_valor"', novo.valor)}</div>
                <div class="sm:col-span-2"><label class="block text-[11px] font-bold text-slate-500 mb-1">Margem</label>
                    <div class="flex gap-1.5"><div class="flex-1 min-w-0">${novo.margem_tipo === 'FIXO' ? campoMoeda('data-f="novo_margem"', novo.margem_valor) : campoPercent('data-f="novo_margem"', novo.margem_valor)}</div>
                    <select data-t="select" data-f="novo_margem_tipo" class="${inputBase} !w-[58px] !px-1.5"><option value="PERCENTUAL" ${novo.margem_tipo === 'PERCENTUAL' ? 'selected' : ''}>%</option><option value="FIXO" ${novo.margem_tipo === 'FIXO' ? 'selected' : ''}>R$</option></select></div></div>
                <div class="sm:col-span-2 flex gap-2">
                    <button type="button" data-acao="novo-salvar" class="flex-1 px-3 py-2 rounded-lg font-bold text-xs bg-slate-900 hover:bg-slate-800 text-white">Adicionar</button>
                    <button type="button" data-acao="novo-cancelar" class="px-3 py-2 rounded-lg font-bold text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-100">Cancelar</button>
                </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">Margem padrão atual: ${g.tipo === 'FIXO' ? brl(g.valor) : fmtP(g.valor) + '%'}.</p>
        </div>`;
}

// ----- 3. Valor total desejado -----
function totalHtml() {
    const auto = calcular(false).r.total;
    const { r } = calcular();
    const ativo = r.alvo.ativo;
    return `
        <div class="rounded-xl border-2 ${ativo ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'} shadow-xs p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                <div>
                    <p class="text-xs font-bold uppercase tracking-wider text-slate-500">Valor total da proposta</p>
                    <p class="text-4xl font-black text-slate-900 mt-1 tabular-nums" data-out="total">${brl(r.total)}</p>
                    <p class="text-[11px] font-semibold text-slate-500 mt-1">${ativo
                        ? `Fechado no valor desejado. Cálculo automático seria <b data-out="total-auto">${brl(auto)}</b>.`
                        : 'Cálculo automático (custos + margens + imposto).'}</p>
                </div>
                <div>
                    <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Valor desejado</label>
                    <div class="flex gap-2 flex-wrap">
                        <div class="flex-1 min-w-[160px]">${campoMoeda('data-f="desejado"', rev.desejado ?? r.total)}</div>
                        <button type="button" data-acao="aplicar-alvo" class="px-4 py-2 rounded-lg font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white">Aplicar</button>
                        ${ativo ? '<button type="button" data-acao="limpar-alvo" class="px-4 py-2 rounded-lg font-bold text-sm bg-white border border-slate-300 text-slate-700 hover:bg-slate-100">Voltar ao cálculo automático</button>' : ''}
                    </div>
                    <p class="text-[11px] text-slate-400 mt-1.5">Só as margens mudam. Custos, kit e potência ficam intactos. Mínimo possível: <b data-out="minimo">${brl(r.alvo.minimo)}</b> (custo + imposto).</p>
                </div>
            </div>
        </div>`;
}

// ----- 4. Totais -----
function totaisHtml() {
    const { r } = calcular();
    const imp = r.imposto;
    const impTxt = imp.tipo === 'FIXO' ? 'valor fixo' : `${fmtP(imp.percentual)}% sobre ${brl(imp.base)}`;
    const linha = (rot, out, val, forte) => `
        <div class="flex items-baseline justify-between gap-3 py-2.5 ${forte ? '' : 'border-b border-slate-100'}">
            <span class="${forte ? 'font-black text-slate-900' : 'font-semibold text-slate-600'} text-sm">${rot}</span>
            <span class="${forte ? 'text-2xl font-black text-slate-900' : 'font-bold text-slate-800'} tabular-nums" data-out="${out}">${val}</span>
        </div>`;
    if (visao === 'SEM') {
        return `<div class="bg-white rounded-xl border border-slate-200 shadow-xs px-5 py-3">
            ${linha('Custo total', 't-custo', brl(r.custoTotal), true)}
            <p class="text-[11px] text-slate-400 pb-1">Visualização SEM margem: mostra só o custo-base. Os valores com margem continuam guardados.</p></div>`;
    }
    return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs px-5 py-3">
            ${linha('Custo total', 't-custo', brl(r.custoTotal))}
            ${linha('Margem total', 't-margem', brl(r.margemTotal))}
            ${linha('Subtotal (custo + margem)', 't-sub', brl(r.precoSemImposto))}
            <div class="flex items-baseline justify-between gap-3 py-2.5 border-b border-slate-100">
                <span class="font-semibold text-slate-600 text-sm">Imposto <span class="text-[11px] text-slate-400" data-out="t-imp-det">(${esc(impTxt)})</span></span>
                <span class="font-bold text-slate-800 tabular-nums" data-out="t-imposto">${brl(imp.valor)}</span>
            </div>
            ${linha('Preço final', 't-final', brl(r.total), true)}
        </div>`;
}

// ----- 5. Conferência (só informa; não bloqueia nada) -----
function checklist() {
    const { itens, r } = calcular();
    const p = proposta || {};
    const cliente = state.localClientes?.find(c => String(c.id) === String(p.cliente_id));
    const projeto = state.localProjetos?.find(x => String(x.id) === String(p.projeto_id));
    const margNeg = r.itens.some(i => i.margem < 0);
    const itemNeg = itens.some(i => i.custo < 0);
    return [
        { ok: !!cliente, rot: 'Cliente', erro: 'Proposta sem cliente vinculado.' },
        { ok: !!projeto, rot: 'Projeto', erro: 'Proposta sem projeto vinculado.' },
        { ok: !!(p.instalacao_cidade && p.instalacao_uf), rot: 'Localização', erro: 'Preencha cidade e UF na etapa Localização.' },
        { ok: ucsCount > 0, rot: 'Unidades Consumidoras', erro: 'Cadastre ao menos uma Unidade Consumidora.' },
        { ok: kit.qtdModulos > 0 && kit.kwp > 0 && kit.qtdInversores > 0, rot: 'Kit Gerador', erro: 'O Kit precisa de ao menos um módulo e um inversor/microinversor.' },
        { ok: itens.length > 0 && r.custoTotal > 0 && !itemNeg, rot: 'Custos', erro: 'O custo total precisa ser maior que zero (sem custos negativos).' },
        { ok: !margNeg, rot: 'Margem', erro: 'Há margem negativa em algum custo.' },
        { ok: impostoCfg().valor >= 0, rot: 'Imposto', erro: 'Imposto inválido na Configuração de Precificação.' },
        { ok: r.total > 0, rot: 'Valor final', erro: 'O valor final precisa ser maior que zero.' }
    ];
}

function finalHtml() {
    const itens = checklist();
    const falhas = itens.filter(i => !i.ok);
    return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
            <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Conferência da proposta</p>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 mb-4">
                ${itens.map(i => `<div class="flex items-center gap-2 text-sm ${i.ok ? 'text-slate-600' : 'text-red-600 font-bold'}"><i class="fa-solid ${i.ok ? 'fa-circle-check text-emerald-500' : 'fa-circle-xmark'}"></i>${esc(i.rot)}</div>`).join('')}
            </div>
            ${falhas.length ? `<ul class="text-xs text-red-600 mb-4 list-disc pl-5 space-y-0.5">${falhas.map(f => `<li>${esc(f.erro)}</li>`).join('')}</ul>` : ''}
        </div>`;
}

// ------------------------------------------------------------------
// Atualização leve (sem recriar campos que estão sendo digitados)
// ------------------------------------------------------------------
function setOut(nome, valor, k) {
    const sel = k ? `[data-out="${nome}"][data-k="${CSS.escape(k)}"]` : `[data-out="${nome}"]`;
    document.querySelectorAll(sel).forEach(e => { e.textContent = valor; });
}

function atualizarSaidas() {
    const { itens, r } = calcular();
    if (rev.desejado !== null && !r.alvo.viavel) { renderTudo(); return; }
    itens.forEach((it, i) => {
        setOut('preco', brl(r.itens[i].preco), it.key);
        // campo de margem reflete o resultado (não mexe no que está com foco)
        const cell = document.querySelector(`[data-cell="margem"][data-i="${i}"] input`);
        if (cell && document.activeElement !== cell) {
            const tipo = r.alvo.ativo ? 'PERCENTUAL' : margemTipoEfetivo(it);
            const v = tipo === 'FIXO'
                ? (it.margem_tipo ? it.margem_valor : r.itens[i].margem)
                : (r.alvo.ativo ? r.itens[i].pct : (it.margem_tipo ? it.margem_valor : margemPadrao().valor));
            if (tipo === 'FIXO') { cell.dataset.d = String(Math.round(v * 100)); cell.value = fmt2(v); }
            else cell.value = fmtP(Math.round(v * 100) / 100);
        }
    });
    setOut('total', brl(r.total));
    setOut('minimo', brl(r.alvo.minimo));
    setOut('t-custo', brl(r.custoTotal));
    setOut('t-margem', brl(r.margemTotal));
    setOut('t-sub', brl(r.precoSemImposto));
    setOut('t-imposto', brl(r.imposto.valor));
    setOut('t-final', brl(r.total));
    const ef = el('rev-efetiva');
    if (ef) ef.textContent = fmtP(r.custoTotal > 0 ? (r.margemTotal / r.custoTotal) * 100 : 0) + '%';
    const fin = el('rev-final');
    if (fin && !fin.contains(document.activeElement)) fin.innerHTML = finalHtml();
    const st = el('rev-status');
    if (st) st.textContent = statusTxt;
}

// Recria só os blocos que dependem da estrutura (linhas, total, totais, final)
function renderBlocos() {
    el('rev-linhas').innerHTML = linhasHtml();
    el('rev-total-box').innerHTML = totalHtml();
    el('rev-totais').innerHTML = totaisHtml();
    el('rev-novo').innerHTML = novoHtml();
    atualizarSaidas();
}


// Mantém os valores da proposta na lista de Propostas/dashboard (colunas que
// já existem em "orcamentos": valor_equipamentos, valor_mao_de_obra e
// valor_outros) iguais ao TOTAL desta tela. Equipamentos e mão de obra levam o
// preço com margem; homologação, custos extras e imposto entram em "outros".
async function sincronizarValoresOrcamento() {
    if (!rev || !propostaId || !kit) return true;
    const { itens, r } = calcular();
    if (!(r.total > 0)) return true;
    const preco = key => r.itens[itens.findIndex(i => i.key === key)]?.preco || 0;
    const equip = preco('equipamentos');
    const mao = preco('mao-de-obra');
    const outros = Math.round((r.total - equip - mao) * 100) / 100;
    const o = state.localOrcamentos?.find(x => String(x.id) === propostaId);
    if (o && o.valor_equipamentos === equip && o.valor_mao_de_obra === mao && o.valor_outros === outros) return true;
    try {
        const { error } = await state.supabaseClient.from('orcamentos')
            .update({ valor_equipamentos: equip, valor_mao_de_obra: mao, valor_outros: outros })
            .eq('id', propostaId);
        if (error) throw error;
        if (o) { o.valor_equipamentos = equip; o.valor_mao_de_obra = mao; o.valor_outros = outros; }
        return true;
    } catch (err) {
        console.error('Erro ao atualizar o valor da proposta:', err.message);
        return false;
    }
}

// ------------------------------------------------------------------
// Persistência (grava sozinho, com pequena espera)
// ------------------------------------------------------------------
function agendarSalvar() {
    statusTxt = tabelaOk ? 'Salvando…' : '';
    const st = el('rev-status'); if (st) st.textContent = statusTxt;
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(salvarAgora, 700);
}

function linhaParaSalvar() {
    return {
        proposta_id: propostaId,
        itens: clone(rev.itens),
        margem_geral_tipo: rev.geral ? rev.geral.tipo : null,
        margem_geral_valor: rev.geral ? rev.geral.valor : null,
        valor_desejado: rev.desejado,
        finalizada: rev.finalizada,
        finalizada_em: rev.finalizada_em,
        updated_at: new Date().toISOString()
    };
}

// Grava agora o que estiver pendente e atualiza o valor na lista de propostas.
// A etapa Arquivos chama isto antes de montar o documento, para o preço sair certo.
export async function sincronizarRevisaoAgora() {
    clearTimeout(timerSalvar);
    if (!rev || !propostaId) return true;
    if (!tabelaOk) return sincronizarValoresOrcamento();
    return salvarAgora();
}

async function salvarAgora() {
    if (!tabelaOk || !rev || !propostaId) return true;
    try {
        const { error } = await state.supabaseClient.from(TABELA).upsert(linhaParaSalvar(), { onConflict: 'proposta_id' });
        if (error) throw error;
        await sincronizarValoresOrcamento();
        statusTxt = `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        return true;
    } catch (err) {
        statusTxt = 'Erro ao salvar: ' + err.message;
        return false;
    } finally {
        const st = el('rev-status'); if (st) st.textContent = statusTxt;
    }
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
function ligarEventos() {
    const box = el('revisao-conteudo');
    if (!box || ligado) return;
    ligado = true;

    box.addEventListener('beforeinput', ev => {
        const t = ev.target;
        if (t.dataset?.t !== 'moeda') return;
        t.dataset.all = t.value.length > 0 && t.selectionStart === 0 && t.selectionEnd >= t.value.length ? '1' : '';
    });
    box.addEventListener('focusin', ev => {
        const t = ev.target;
        if (t.dataset?.t === 'moeda') setTimeout(() => t.setSelectionRange(t.value.length, t.value.length));
        else if (t.dataset?.t && t.tagName === 'INPUT' && t.dataset.t !== 'texto') setTimeout(() => t.select());
    });

    box.addEventListener('input', ev => {
        const t = ev.target;
        const kind = t.dataset?.t;
        if (!kind || t.tagName !== 'INPUT' || !rev) return;
        let valor;
        if (kind === 'moeda') { mascaraMoeda(t, ev); valor = Number(t.dataset.d || 0) / 100; }
        else if (kind === 'percent') { t.value = t.value.replace(/[^\d.,]/g, ''); valor = parseNum(t.value); }
        else valor = t.value;
        gravarCampo(t, valor);
    });

    box.addEventListener('change', ev => {
        const t = ev.target;
        const kind = t.dataset?.t;
        if (!kind || !rev) return;
        if (kind === 'select') { gravarSelect(t); return; }
        if (kind === 'percent' && t.value !== '') t.value = fmtP(parseNum(t.value));
    });

    box.addEventListener('click', ev => {
        const b = ev.target.closest('[data-acao]');
        if (!b || !rev) return;
        acao(b.dataset.acao, b.dataset);
    });
}

function mudou() { agendarSalvar(); atualizarSaidas(); }

function gravarCampo(t, valor) {
    const f = t.dataset.f;
    const k = t.dataset.k;
    switch (f) {
        case 'custo': {
            const r = registro(k);
            const auto = itensResolvidos().find(i => i.key === k)?.custoAuto;
            r.custo_manual = valor;
            // voltou exatamente ao valor automático = sem edição
            if (!r.extra && Math.round((auto || 0) * 100) === Math.round(valor * 100)) r.custo_manual = null;
            mudou();
            break;
        }
        case 'margem': {
            const r = registro(k);
            const tipo = t.closest('.grid')?.querySelector('select[data-f="margem_tipo"]')?.value || 'PERCENTUAL';
            if (valor === null) { r.margem_tipo = null; r.margem_valor = null; }
            else { r.margem_tipo = tipo; r.margem_valor = valor; }
            if (rev.desejado !== null) { rev.desejado = null; statusTxt = 'Margem individual alterada: valor desejado desativado.'; renderTudo(); agendarSalvar(); return; }
            mudou();
            break;
        }
        case 'desc': { registro(k).descricao = valor; agendarSalvar(); break; }
        case 'geral': {
            const tipo = el('revisao-conteudo').querySelector('select[data-f="geral_tipo"]').value;
            rev.geral = { tipo, valor: valor ?? 0 };
            // a margem geral vale para todos os custos
            rev.itens.forEach(i => { i.margem_tipo = null; i.margem_valor = null; });
            mudou();
            break;
        }
        case 'desejado': { rev._desejadoDigitado = valor; break; }
        case 'novo_desc': novo.descricao = valor; break;
        case 'novo_valor': novo.valor = valor ?? 0; break;
        case 'novo_margem': novo.margem_valor = valor ?? 0; break;
        default: break;
    }
}

function gravarSelect(t) {
    const f = t.dataset.f;
    if (f === 'margem_tipo') {
        const r = registro(t.dataset.k);
        const atual = itensResolvidos().find(i => i.key === t.dataset.k);
        r.margem_tipo = t.value;
        // mantém o valor numérico já mostrado
        r.margem_valor = atual?.margem_valor ?? (t.value === 'PERCENTUAL' ? margemPadrao().valor : 0);
        if (rev.desejado !== null) { rev.desejado = null; statusTxt = 'Margem individual alterada: valor desejado desativado.'; }
        agendarSalvar(); renderTudo();
    } else if (f === 'geral_tipo') {
        const g = margemPadrao();
        rev.geral = { tipo: t.value, valor: g.tipo === t.value ? g.valor : 0 };
        rev.itens.forEach(i => { i.margem_tipo = null; i.margem_valor = null; });
        agendarSalvar(); renderTudo();
    } else if (f === 'novo_tipo') { novo.tipo_calculo = t.value; novo.valor = 0; renderBlocos(); }
    else if (f === 'novo_margem_tipo') { novo.margem_tipo = t.value; novo.margem_valor = 0; renderBlocos(); }
}

function acao(nome, d) {
    if (nome === 'visao') { visao = d.v; renderTudo(); return; }
    if (nome === 'ver-kit') { abrirModalKit(); return; }
    if (nome === 'novo-custo') {
        const g = margemPadrao();
        novo = { descricao: '', tipo_calculo: 'FIXO', valor: 0, margem_tipo: g.tipo, margem_valor: g.valor };
        novoAberto = true; renderBlocos(); return;
    }
    if (nome === 'novo-cancelar') { novoAberto = false; novo = null; renderBlocos(); return; }
    if (nome === 'novo-salvar') {
        if (!novo.descricao.trim()) { alert('Informe a descrição do custo.'); return; }
        if (!(novo.valor > 0)) { alert('Informe o valor do custo.'); return; }
        rev.itens.push({
            key: `extra-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, extra: true,
            descricao: novo.descricao.trim(), tipo_calculo: novo.tipo_calculo, valor_unit: novo.valor,
            custo_manual: null, margem_tipo: novo.margem_tipo, margem_valor: novo.margem_valor
        });
        novoAberto = false; novo = null;
        agendarSalvar(); renderTudo(); return;
    }
    if (nome === 'remover') {
        const it = rev.itens.find(i => i.key === d.k);
        if (!it || !confirm(`Excluir o custo “${it.descricao}”?`)) return;
        rev.itens = rev.itens.filter(i => i.key !== d.k);
        agendarSalvar(); renderTudo(); return;
    }
    if (nome === 'restaurar') {
        const it = rev.itens.find(i => i.key === d.k);
        if (it) { it.custo_manual = null; it.margem_tipo = null; it.margem_valor = null; }
        agendarSalvar(); renderTudo(); return;
    }
    if (nome === 'aplicar-alvo') {
        const campo = el('revisao-conteudo').querySelector('input[data-f="desejado"]');
        const v = Number(campo.dataset.d || 0) / 100;
        const { r } = calcular(false);
        const minimo = r.custoTotal + r.imposto.valor;
        if (!(v > 0)) { alert('Informe o valor desejado.'); return; }
        if (Math.round(v * 100) < Math.round(minimo * 100)) {
            alert(`Esse valor fica abaixo do custo + imposto (${brl(minimo)}). Informe um valor igual ou maior.`);
            return;
        }
        rev.desejado = v; statusTxt = '';
        agendarSalvar(); renderTudo(); return;
    }
    if (nome === 'limpar-alvo') { rev.desejado = null; agendarSalvar(); renderTudo(); return; }
}

// ------------------------------------------------------------------
// Modal: detalhes do Kit
// ------------------------------------------------------------------
function abrirModalKit() {
    fecharModalKit();
    const linhas = kit.equipamentos.map(e => {
        const q = Number(e.quantidade) || 0;
        const p = Number(e.potencia_unitaria) || 0;
        return `<tr class="border-b border-slate-100">
            <td class="py-2 pr-3 font-bold text-slate-700">${esc(TIPO_LABEL[e.tipo] || e.tipo)}</td>
            <td class="py-2 pr-3 text-slate-700">${esc(e.fabricante || '—')}</td>
            <td class="py-2 pr-3 text-slate-700">${esc(e.modelo || '—')}</td>
            <td class="py-2 pr-3 text-right tabular-nums">${potTxt(p)}</td>
            <td class="py-2 pr-3 text-right tabular-nums font-bold">${q}</td>
            <td class="py-2 text-right tabular-nums">${potTxt(p * q)}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="py-6 text-center text-slate-400">Nenhum equipamento.</td></tr>';
    const item = (rot, val) => `<div><p class="text-[11px] font-bold uppercase tracking-wider text-slate-400">${rot}</p><p class="font-black text-slate-800 tabular-nums">${val}</p></div>`;
    const m = document.createElement('div');
    m.id = 'rev-modal-kit';
    m.className = 'fixed inset-0 z-[100] bg-slate-900/60 flex items-center justify-center p-4';
    m.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 class="font-black text-slate-900">Detalhes do Kit Gerador</h3>
                <button type="button" data-fechar class="w-9 h-9 rounded-lg text-slate-400 hover:bg-slate-100"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="p-6 space-y-5">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    ${item('Potência total', fmt2(kit.kwp) + ' kWp')}
                    ${item('Topologia', esc(kit.topologia))}
                    ${item('Geração estimada', kit.geracao ? fmtP(kit.geracao) + ' kWh/mês' : '—')}
                    ${item('Relação CC/CA', kit.kwCA > 0 ? fmt2(kit.kwp / kit.kwCA) : '—')}
                    ${item('Módulos', String(kit.qtdModulos))}
                    ${item('Inversores', String(kit.qtdInversores))}
                    ${item('Potência CA', kit.kwCA > 0 ? fmt2(kit.kwCA) + ' kW' : '—')}
                    ${item('Valor do kit', brl(kit.valorKit))}
                </div>
                <div class="overflow-x-auto"><table class="w-full text-sm">
                    <thead><tr class="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                        <th class="text-left py-2 pr-3">Tipo</th><th class="text-left pr-3">Fabricante</th><th class="text-left pr-3">Modelo</th>
                        <th class="text-right pr-3">Potência un.</th><th class="text-right pr-3">Qtd</th><th class="text-right">Potência total</th></tr></thead>
                    <tbody>${linhas}</tbody></table></div>
                <p class="text-[11px] text-slate-400">Somente consulta. Para alterar o kit, volte à etapa Kit Gerador.</p>
            </div>
        </div>`;
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-fechar]')) fecharModalKit(); });
    document.body.appendChild(m);
}
function fecharModalKit() {
    const m = el('rev-modal-kit');
    if (m) m.remove();
}
