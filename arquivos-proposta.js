// arquivos-proposta.js
// ETAPA 6 — ARQUIVOS da PROPOSTA FOTOVOLTAICA.
// À esquerda: data de emissão, validade, modelo e os botões Baixar PDF / DOCX.
// À direita: a pré-visualização do PDF, já na tela (sem botão para gerar).
// A pré-visualização só é gerada depois que as duas datas são preenchidas.
//
// Usa o mesmo núcleo da exportação (propostaTemplate.js): a conversão fica em
// cache, então a pré-visualização e o "Baixar PDF" usam a MESMA conversão.
// Cada mudança de data/modelo gera uma nova conversão (com uma pequena espera
// para não converter a cada tecla).

import { state } from './state.js';
import { MODELOS, setModelo, setDatas, datasSalvas, prepararProposta, pdfEmCache, obterPdf, baixar } from './propostaTemplate.js';
import { sincronizarRevisaoAgora } from './revisao-proposta.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = id => document.getElementById(id);

let atual = null;        // { p, campos:{emissao,validade}, fase, erroMsg }
let tokenCarga = 0;
let timerGerar = null;
let gerando = false;
let ligado = false;

const INPUT = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400';
const BTN = 'w-full px-4 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed';

// ------------------------------------------------------------------
// Carregamento
// ------------------------------------------------------------------
export async function carregarArquivosProposta(id) {
    const box = el('arquivos-conteudo');
    if (!box) return;
    const token = ++tokenCarga;
    clearTimeout(timerGerar);
    ligarEventos(box);
    box.innerHTML = '<p class="text-sm text-slate-400">Carregando arquivos…</p>';

    try {
        // Garante que o valor da proposta (lista/dashboard) está igual ao da Revisão.
        await sincronizarRevisaoAgora();
        await atualizarLinhaNoState(id);
        const p = await prepararProposta(id);
        if (token !== tokenCarga) return;
        if (!p) {
            box.innerHTML = '<div class="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 rounded-xl">Proposta não encontrada.</div>';
            return;
        }
        // Pede as datas: só começam preenchidas se já foram digitadas antes.
        const s = datasSalvas(id);
        atual = { p, campos: { emissao: s.emissao || '', validade: s.validade || '' }, fase: 'espera', erroMsg: '' };
        desenharTudo();
        agendarGeracao(300);
    } catch (e) {
        if (token !== tokenCarga) return;
        box.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">Erro ao carregar os arquivos: ${esc(e.message)}</div>`;
    }
}

// A linha da proposta em state.localOrcamentos pode estar desatualizada
// (proposta nova, valor recém-calculado). Lê do banco e atualiza no lugar.
async function atualizarLinhaNoState(id) {
    const { data, error } = await state.supabaseClient.from('orcamentos').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return;
    if (!Array.isArray(state.localOrcamentos)) state.localOrcamentos = [];
    const existente = state.localOrcamentos.find(x => String(x.id) === String(id));
    if (existente) Object.assign(existente, data);
    else state.localOrcamentos.push(data);
}

// ------------------------------------------------------------------
// Regras
// ------------------------------------------------------------------
function datasOk(c) { return !!(c.emissao && c.validade && c.validade >= c.emissao); }

// Erros que NÃO são de data (a data tem mensagem própria).
function errosGerais(p) {
    return [...p.errosBase, ...(p.modelo ? [] : ['Escolha o modelo da proposta.'])];
}

function podeGerar() {
    if (!atual) return false;
    return datasOk(atual.campos) && errosGerais(atual.p).length === 0;
}

// ------------------------------------------------------------------
// Desenho
// ------------------------------------------------------------------
function desenharTudo() {
    const box = el('arquivos-conteudo');
    if (!box || !atual) return;
    const { p, campos } = atual;
    box.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside class="p-5 space-y-5 border-b lg:border-b-0 lg:border-r border-slate-200">
                <h3 class="text-base font-black text-slate-900">Opções</h3>
                <label class="block">
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Data de emissão</span>
                    <input type="date" data-arq="emissao" value="${esc(campos.emissao)}" class="${INPUT} mt-1.5">
                </label>
                <label class="block">
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Válida até</span>
                    <input type="date" data-arq="validade" value="${esc(campos.validade)}" class="${INPUT} mt-1.5">
                </label>
                <label class="block">
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Modelo</span>
                    <select data-arq="modelo" class="${INPUT} mt-1.5 ${p.modelo ? '' : '!border-red-400'}">
                        <option value="">Selecione…</option>
                        ${MODELOS.map(m => `<option value="${esc(m.id)}" ${p.modelo?.id === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
                    </select>
                </label>
                <div id="arq-estado" class="space-y-4"></div>
            </aside>
            <section id="arq-preview" class="bg-slate-50 min-h-[60vh]"></section>
        </div>`;
    desenharEstado();
    desenharPreview();
}

function desenharEstado() {
    const alvo = el('arq-estado');
    if (!alvo || !atual) return;
    const { p, campos } = atual;
    const erros = errosGerais(p);
    const dataMsg = (campos.emissao && campos.validade && campos.validade < campos.emissao)
        ? 'A validade não pode ser anterior à emissão.' : '';
    const dias = datasOk(campos) ? p.vars.validade_dias : '';
    const bloqueado = !podeGerar();

    alvo.innerHTML = `
        ${dias !== '' ? `<p class="text-xs text-slate-500">Validade de <b class="text-slate-800">${esc(dias)} dias</b> a partir da emissão.</p>` : ''}
        ${dataMsg ? `<p class="text-xs font-bold text-red-600">${esc(dataMsg)}</p>` : ''}
        ${erros.length ? `<ul class="text-xs text-red-600 list-disc pl-4 space-y-0.5">${erros.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        ${p.avisos.length ? `<ul class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 list-disc pl-6 space-y-0.5">${p.avisos.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        <div class="space-y-2 pt-1">
            <button type="button" data-acao="pdf" ${bloqueado ? 'disabled' : ''} class="${BTN} bg-amber-400 hover:bg-amber-500 text-slate-950"><i class="fa-solid fa-file-pdf"></i> Baixar PDF</button>
            <button type="button" data-acao="docx" ${bloqueado ? 'disabled' : ''} class="${BTN} bg-slate-900 hover:bg-slate-800 text-white"><i class="fa-solid fa-file-word"></i> Baixar DOCX</button>
        </div>`;
}

function desenharPreview() {
    const alvo = el('arq-preview');
    if (!alvo || !atual) return;
    const { p, campos } = atual;
    const centro = (icone, titulo, texto, extra = '') => `
        <div class="h-full min-h-[60vh] flex flex-col items-center justify-center gap-3 p-10 text-center">
            <i class="${icone} text-4xl text-slate-300"></i>
            <p class="text-base font-black text-slate-800">${titulo}</p>
            <p class="text-sm text-slate-500 max-w-sm">${texto}</p>
            ${extra}
        </div>`;

    if (!datasOk(campos)) {
        alvo.innerHTML = centro('fa-regular fa-calendar', 'Informe a data primeiro',
            campos.emissao && campos.validade
                ? 'A validade não pode ser anterior à emissão.'
                : 'Preencha a <b>data de emissão</b> e a <b>validade</b> ao lado. A pré-visualização aparece em seguida.');
        return;
    }
    const erros = errosGerais(p);
    if (erros.length) {
        alvo.innerHTML = centro('fa-regular fa-file-pdf', 'Falta um passo',
            erros.map(esc).join('<br>'));
        return;
    }
    const cache = pdfEmCache(p);
    if (cache) {
        alvo.innerHTML = `
            <iframe src="${cache.url}" title="Pré-visualização da proposta" class="w-full border-0 bg-white block" style="height:80vh"></iframe>
            <p class="text-xs text-slate-400 p-3">Não aparece no celular? <a class="underline font-bold" target="_blank" href="${cache.url}">Abrir o PDF em outra aba</a>.</p>`;
        return;
    }
    if (atual.fase === 'erro') {
        alvo.innerHTML = centro('fa-solid fa-triangle-exclamation', 'Não foi possível gerar a pré-visualização',
            esc(atual.erroMsg || 'Erro desconhecido.'),
            `<button type="button" data-acao="tentar" class="mt-1 px-4 py-2.5 rounded-lg font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-2"><i class="fa-solid fa-rotate-right"></i> Tentar de novo</button>`);
        return;
    }
    alvo.innerHTML = centro('fa-solid fa-spinner fa-spin', 'Gerando a pré-visualização…',
        'A conversão para PDF leva alguns segundos.');
}

// ------------------------------------------------------------------
// Geração automática da pré-visualização
// ------------------------------------------------------------------
function agendarGeracao(espera = 900) {
    clearTimeout(timerGerar);
    if (!atual || !podeGerar() || pdfEmCache(atual.p)) return;
    const token = tokenCarga;
    timerGerar = setTimeout(() => gerar(token), espera);
}

async function gerar(token) {
    if (token !== tokenCarga || !atual || !podeGerar() || pdfEmCache(atual.p)) return;
    if (gerando) return; // quando terminar, confere de novo
    gerando = true;
    atual.fase = 'gerando';
    atual.erroMsg = '';
    desenharPreview();
    try {
        await obterPdf(atual.p);
        if (atual) atual.fase = 'ok';
    } catch (e) {
        if (atual) { atual.fase = 'erro'; atual.erroMsg = e.message; }
    } finally {
        gerando = false;
    }
    if (token !== tokenCarga) return;
    desenharPreview();
    // se data/modelo mudaram durante a conversão, converte de novo
    if (atual?.fase === 'ok') agendarGeracao(200);
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
function ligarEventos(box) {
    if (ligado) return;
    ligado = true;

    box.addEventListener('change', ev => {
        const campo = ev.target.closest('[data-arq]');
        if (!campo || !atual) return;
        const tipo = campo.dataset.arq;

        if (tipo === 'modelo') {
            setModelo(atual.p, campo.value);
            campo.classList.toggle('!border-red-400', !atual.p.modelo);
        } else {
            atual.campos[tipo] = campo.value;
            if (datasOk(atual.campos)) setDatas(atual.p, atual.campos.emissao, atual.campos.validade);
        }
        atual.fase = 'espera';
        desenharEstado();
        desenharPreview();
        agendarGeracao();
    });

    box.addEventListener('click', async ev => {
        const b = ev.target.closest('[data-acao]');
        if (!b || b.disabled || !atual) return;
        const acao = b.dataset.acao;

        if (acao === 'tentar') {
            atual.fase = 'espera';
            agendarGeracao(0);
            desenharPreview();
            return;
        }
        if (acao !== 'pdf' && acao !== 'docx') return;

        const original = b.innerHTML;
        b.disabled = true;
        b.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${acao === 'docx' ? 'Gerando…' : 'Convertendo…'}`;
        try {
            await baixar(atual.p, acao);
        } catch (e) {
            alert('Erro: ' + e.message);
        }
        b.disabled = false;
        b.innerHTML = original;
        if (acao === 'pdf') desenharPreview(); // a conversão ficou em cache
    });
}
