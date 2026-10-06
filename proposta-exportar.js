// proposta-exportar.js
// Duas telas da PROPOSTA FOTOVOLTAICA, com URL própria (ver router.js):
//   /proposta/:id/previa    -> Pré-visualização (PDF na tela)
//   /proposta/:id/exportar  -> Conferência dos dados + baixar DOCX/PDF
// A conversão para PDF só acontece quando o usuário clica (nunca ao abrir a
// tela), e o resultado fica em cache: pré-visualizar e baixar PDF usam a
// mesma conversão.

import { state } from './state.js';
import { switchTab } from './ui.js';
import { navegarPara } from './router.js';
import { MODELOS, setModelo, prepararProposta, pdfEmCache, obterPdf, baixar } from './propostaTemplate.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = id => document.getElementById(id);
const ultimo = {}; // tela -> proposta preparada

export function renderPropostaPreviaNaRota(id) { return render('previa', id); }
export function renderPropostaExportarNaRota(id) { return render('exportar', id); }

async function render(tela, id) {
    switchTab(`proposta-${tela}-tab`);
    const cont = el(`proposta-${tela}-conteudo`);
    if (!cont) return;
    ligarCliques(cont, tela);

    // F5 / link direto: os dados do Supabase ainda não chegaram. O router
    // chama esta função de novo quando a sincronização termina.
    if (!state.localOrcamentos || state.localOrcamentos.length === 0) {
        cont.innerHTML = caixa('slate', '<i class="fa-solid fa-spinner fa-spin"></i> Carregando proposta…');
        return;
    }
    let p;
    try {
        p = await prepararProposta(id);
    } catch (e) {
        cont.innerHTML = caixa('red', 'Erro ao ler a proposta: ' + esc(e.message));
        return;
    }
    if (!p) {
        cont.innerHTML = caixa('amber', 'Proposta não encontrada.') + botaoVoltarSolto();
        return;
    }
    ultimo[tela] = p;
    desenhar(tela, p);
}

// ------------------------------------------------------------------
// Blocos de HTML
// ------------------------------------------------------------------
const CORES = {
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800'
};
const caixa = (cor, html) => `<div class="${CORES[cor]} border text-sm p-4 rounded-xl">${html}</div>`;
const lista = (cor, itens) => itens.length
    ? `<div class="${CORES[cor]} border text-sm p-4 rounded-xl"><ul class="list-disc pl-5 space-y-1">${itens.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`
    : '';

const botaoVoltarSolto = () => `<button type="button" data-acao="voltar" class="mt-4 text-xs font-bold text-slate-500 hover:text-slate-800 uppercase tracking-wider inline-flex items-center gap-1.5"><i class="fa-solid fa-arrow-left"></i> Voltar</button>`;

function cabecalho(p, titulo) {
    return `
        <div>
            <button type="button" data-acao="voltar" class="text-xs font-bold text-slate-500 hover:text-slate-800 uppercase tracking-wider mb-3 inline-flex items-center gap-1.5 transition-colors">
                <i class="fa-solid fa-arrow-left"></i> Voltar ao projeto
            </button>
            <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="text-lg font-bold text-slate-900">${esc(titulo)}</h2>
                    <p class="text-sm text-slate-500 mt-0.5">Proposta nº ${esc(p.o.numero_orcamento || '-')} — ${esc(p.vars.cliente_nome || 'sem cliente')}</p>
                </div>
                <label class="flex items-center gap-2">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Modelo</span>
                    <select data-modelo class="rounded-lg border ${p.modelo ? 'border-slate-300' : 'border-red-400'} bg-white px-3 py-2 text-sm font-bold text-slate-800">
                        <option value="">Selecione…</option>
                        ${MODELOS.map(m => `<option value="${esc(m.id)}" ${p.modelo?.id === m.id ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
                    </select>
                </label>
            </div>
        </div>`;
}

const BTN = 'px-4 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed';
const botao = (acao, icone, texto, estilo, desab) =>
    `<button type="button" data-acao="${acao}" ${desab ? 'disabled' : ''} class="${BTN} ${estilo}"><i class="fa-solid ${icone}"></i> ${texto}</button>`;
const ESTILO_PRIM = 'bg-slate-900 hover:bg-slate-800 text-white shadow-md';
const ESTILO_SEC = 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50';
const ESTILO_AMBAR = 'bg-amber-400 hover:bg-amber-500 text-slate-950';

function desenhar(tela, p) {
    const cont = el(`proposta-${tela}-conteudo`);
    if (!cont) return;
    const bloqueado = p.erros.length > 0;
    const avisos = lista('red', p.erros) + lista('amber', p.avisos);

    if (tela === 'previa') {
        const cache = pdfEmCache(p);
        const corpo = cache
            ? `<div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                   <iframe src="${cache.url}" title="Pré-visualização da proposta" class="w-full border-0" style="height:80vh"></iframe>
               </div>
               <p class="text-xs text-slate-400">Não aparece no celular? <a class="underline font-bold" target="_blank" href="${cache.url}">Abrir o PDF em outra aba</a>.</p>`
            : `<div class="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center space-y-3">
                   <i class="fa-regular fa-file-pdf text-4xl text-slate-300"></i>
                   <p class="text-sm text-slate-500">A pré-visualização é gerada a partir do modelo da cidade e usa uma conversão para PDF.</p>
                   ${botao('gerar', 'fa-eye', 'Gerar pré-visualização', ESTILO_PRIM, bloqueado)}
               </div>`;
        cont.innerHTML = `
            <div class="space-y-4">
                ${cabecalho(p, 'Pré-visualização da proposta')}
                ${avisos}
                ${corpo}
                <div class="flex flex-wrap gap-2">
                    ${botao('pdf', 'fa-file-pdf', 'Baixar PDF', ESTILO_AMBAR, bloqueado)}
                    ${botao('docx', 'fa-file-word', 'Baixar DOCX', ESTILO_SEC, bloqueado)}
                    ${botao('ir-exportar', 'fa-list-check', 'Conferir dados', ESTILO_SEC, false)}
                </div>
            </div>`;
        return;
    }

    // tela === 'exportar'
    const v = p.vars;
    const linhas = [
        ['Cliente', '[cliente_nome]', v.cliente_nome],
        ['Cidade (aparece no documento)', '[cidade]', v.cidade],
        ['Potência do sistema', '[potencia_sistema]', `${v.potencia_sistema} kWp`],
        ['Geração estimada', '[geracao_mensal]', `${v.geracao_mensal} kWh/mês`],
        ['Módulo', '[modulo_descricao]', v.modulo_descricao],
        ['Potência do módulo', '[modulo_potencia]', `${v.modulo_potencia} Wp`],
        ['Quantidade de módulos', '[modulo_quantidade]', v.modulo_quantidade],
        ['Fabricante do inversor', '[inversor_fabricante]', v.inversor_fabricante],
        ['Inversor', '[inversor_descricao]', v.inversor_descricao],
        ['Quantidade de inversores', '[inversores_utilizados]', v.inversores_utilizados],
        ['Emissão da proposta', '[validade]', v.validade],
        ['Validade (dias)', '[quantidade]', `${v.quantidade} dias`],
        ['Investimento', '[preco]', `R$ ${v.preco}`],
        ['Data por extenso', '[data]', v.data]
    ].map(([rot, tag, val]) => `
        <tr class="border-b border-slate-100">
            <td class="py-2 pr-3 font-bold text-slate-700">${esc(rot)}</td>
            <td class="py-2 pr-3 text-[11px] text-slate-400 font-mono">${esc(tag)}</td>
            <td class="py-2 text-slate-900 ${val === '' || val === undefined || val === null ? 'text-red-500 font-bold' : ''}">${esc(val === '' || val === undefined || val === null ? '(vazio)' : val)}</td>
        </tr>`).join('');

    cont.innerHTML = `
        <div class="space-y-4">
            ${cabecalho(p, 'Exportar proposta')}
            ${avisos}
            <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Dados que vão para o documento</p>
                <div class="overflow-x-auto"><table class="w-full text-sm"><tbody>${linhas}</tbody></table></div>
                <p class="text-[11px] text-slate-400 mt-3">Para corrigir algo, volte à proposta e ajuste a etapa correspondente.</p>
            </div>
            <div class="flex flex-wrap gap-2">
                ${botao('docx', 'fa-file-word', 'Baixar DOCX', ESTILO_PRIM, bloqueado)}
                ${botao('pdf', 'fa-file-pdf', 'Baixar PDF', ESTILO_AMBAR, bloqueado)}
                ${botao('ir-previa', 'fa-eye', 'Pré-visualizar', ESTILO_SEC, false)}
            </div>
        </div>`;
}

// ------------------------------------------------------------------
// Cliques (delegação: o conteúdo é recriado a cada desenho)
// ------------------------------------------------------------------
function ligarCliques(cont, tela) {
    if (cont.dataset.ligado) return;
    cont.dataset.ligado = '1';
    cont.addEventListener('change', ev => {
        const sel = ev.target.closest('[data-modelo]');
        const p = ultimo[tela];
        if (!sel || !p) return;
        setModelo(p, sel.value);
        desenhar(tela, p);
    });
    cont.addEventListener('click', async ev => {
        const b = ev.target.closest('[data-acao]');
        if (!b || b.disabled) return;
        const p = ultimo[tela];
        const acao = b.dataset.acao;

        if (acao === 'voltar') {
            navegarPara(p?.o?.projeto_id ? `/projeto/${p.o.projeto_id}/orcamentos` : '/orcamentos');
            return;
        }
        if (!p) return;
        if (acao === 'ir-previa') { navegarPara(`/proposta/${p.o.id}/previa`); return; }
        if (acao === 'ir-exportar') { navegarPara(`/proposta/${p.o.id}/exportar`); return; }

        const original = b.innerHTML;
        b.disabled = true;
        b.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${acao === 'docx' ? 'Gerando…' : 'Convertendo…'}`;
        try {
            if (acao === 'gerar') await obterPdf(p);
            else await baixar(p, acao);
            if (tela === 'previa') { desenhar(tela, p); return; } // mostra o PDF já convertido
        } catch (e) {
            alert('Erro: ' + e.message);
        }
        b.disabled = false;
        b.innerHTML = original;
    });
}
