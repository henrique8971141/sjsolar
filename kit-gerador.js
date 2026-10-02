// kit-gerador.js
// Etapa 2.3.4 da TELA PRÓPRIA da Proposta: Kit Gerador / Equipamentos.
// Módulo independente do editor de Orçamento (orcamentos.js /
// equipamentos.js) e do Orçamento Avulso — não usa
// "orcamentos.equipamentos_json".
//
// Cada equipamento pertence a uma Proposta (proposta_id -> linha da
// Proposta na tabela "orcamentos") e é escolhido no CATÁLOGO FOTOVOLTAICO:
//   MODULO        -> tabela modulos      (potencia_wp, em Wp)
//   INVERSOR      -> tabela inversores   (tipo = TRADICIONAL,    potencia em W)
//   MICROINVERSOR -> tabela inversores   (tipo = MICRO INVERSOR, potencia em W)
//   OTIMIZADOR    -> tabela inversores   (tipo = OTIMIZADOR,     potencia em W)
// Persistência em "proposta_equipamentos" e "proposta_kit_gerador".
//
// Regra central: a potência do sistema é SEMPRE calculada a partir dos
// módulos selecionados (potência unitária × quantidade) — nunca digitada e
// nunca gravada em projetos.potencia_kwp.

import { state } from './state.js';

const TIPOS = ['MODULO', 'INVERSOR', 'MICROINVERSOR', 'OTIMIZADOR'];

const TIPO_LABEL = {
    MODULO: 'Módulo Fotovoltaico',
    INVERSOR: 'Inversor',
    MICROINVERSOR: 'Microinversor',
    OTIMIZADOR: 'Otimizador'
};
const TIPO_PLURAL = {
    MODULO: 'módulos',
    INVERSOR: 'inversores',
    MICROINVERSOR: 'microinversores',
    OTIMIZADOR: 'otimizadores'
};

// De onde cada tipo de equipamento é buscado no Catálogo Fotovoltaico.
const FONTE = {
    MODULO:        { tabela: 'modulos',    campoPotencia: 'potencia_wp', filtroTipo: null,             unidade: 'Wp' },
    INVERSOR:      { tabela: 'inversores', campoPotencia: 'potencia',    filtroTipo: 'TRADICIONAL',    unidade: 'W' },
    MICROINVERSOR: { tabela: 'inversores', campoPotencia: 'potencia',    filtroTipo: 'MICRO INVERSOR', unidade: 'W' },
    OTIMIZADOR:    { tabela: 'inversores', campoPotencia: 'potencia',    filtroTipo: 'OTIMIZADOR',     unidade: 'W' }
};

// Quais blocos fazem sentido em cada topologia. Bloco fora da topologia só
// aparece se já tiver equipamento (nada cadastrado some da tela).
const TOPOLOGIA_TIPOS = {
    'Tradicional':   ['MODULO', 'INVERSOR'],
    'Microinversor': ['MODULO', 'MICROINVERSOR'],
    'Otimizadores':  ['MODULO', 'INVERSOR', 'OTIMIZADOR']
};

let propostaIdAtual = null;
let equipamentosAtual = []; // linhas de proposta_equipamentos desta Proposta
let kitAtual = null;        // linha de proposta_kit_gerador (ou null)
const resultadosBusca = {}; // tipo -> { [id]: item do catálogo } (último resultado exibido)
const timersBusca = {};
const tokenBusca = {};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const el = id => document.getElementById(id);

// ------------------------------------------------------------------
// Carregamento da etapa
// ------------------------------------------------------------------
export async function carregarKitGerador(propostaId) {
    propostaIdAtual = propostaId;
    equipamentosAtual = [];
    kitAtual = null;
    const erro = el('kit-gerador-erro');
    if (erro) erro.classList.add('hidden');

    if (!propostaId) {
        renderTudo();
        return;
    }

    try {
        const [{ data: eqData, error: eqError }, { data: kitData, error: kitError }] = await Promise.all([
            state.supabaseClient.from('proposta_equipamentos').select('*')
                .eq('proposta_id', propostaId).order('ordem', { ascending: true }),
            state.supabaseClient.from('proposta_kit_gerador').select('*')
                .eq('proposta_id', propostaId).maybeSingle()
        ]);
        if (eqError) throw eqError;
        if (kitError) throw kitError;
        equipamentosAtual = eqData || [];
        kitAtual = kitData || null;
    } catch (err) {
        console.error('Erro ao carregar Kit Gerador:', err.message);
        if (erro) {
            erro.textContent = `Erro ao carregar equipamentos: ${err.message}`;
            erro.classList.remove('hidden');
        }
        return;
    }
    renderTudo();
}

function renderTudo() {
    renderTopologia();
    renderTodasListas();
    renderKitForm();
    renderPotenciaSistema();
}

// ------------------------------------------------------------------
// Topologia (controle segmentado)
// ------------------------------------------------------------------
function topologiaAtual() {
    return kitAtual?.topologia && TOPOLOGIA_TIPOS[kitAtual.topologia] ? kitAtual.topologia : 'Tradicional';
}

function renderTopologia() {
    const atual = topologiaAtual();
    document.querySelectorAll('[data-kit-topologia]').forEach(btn => {
        const ativo = btn.dataset.kitTopologia === atual;
        btn.className = 'flex-1 min-w-[140px] px-4 py-3 rounded-xl border-2 text-left transition-all ' + (ativo
            ? 'border-amber-400 bg-amber-50 shadow-xs'
            : 'border-slate-200 bg-white hover:border-slate-300');
    });
}

// Só grava a mudança — nunca apaga equipamentos já cadastrados.
export async function alterarTopologia(valor) {
    if (!propostaIdAtual || !TOPOLOGIA_TIPOS[valor]) return;
    await salvarKit({ topologia: valor });
    renderTudo();
}

// ------------------------------------------------------------------
// Listas de equipamentos (uma por tipo)
// ------------------------------------------------------------------
function renderTodasListas() {
    const relevantes = TOPOLOGIA_TIPOS[topologiaAtual()];
    TIPOS.forEach(tipo => {
        const linhas = equipamentosAtual.filter(e => e.tipo === tipo);
        const relevante = relevantes.includes(tipo);

        const bloco = el(`kit-bloco-${tipo}`);
        if (bloco) bloco.classList.toggle('hidden', !relevante && linhas.length === 0);
        const fora = el(`kit-fora-${tipo}`);
        if (fora) fora.classList.toggle('hidden', relevante);

        const count = el(`kit-count-${tipo}`);
        if (count) count.textContent = linhas.reduce((a, e) => a + (Number(e.quantidade) || 0), 0);

        const sub = el(`kit-subtotal-${tipo}`);
        if (sub) {
            const w = somaPotencia(tipo);
            sub.textContent = linhas.length ? `${fmt(w / 1000)} k${FONTE[tipo].unidade}` : '';
        }
        renderListaTipo(tipo, linhas);
    });
}

function renderListaTipo(tipo, linhas) {
    const container = el(`kit-lista-${tipo}`);
    if (!container) return;

    if (linhas.length === 0) {
        container.innerHTML = `
            <div class="text-xs text-slate-400 text-center py-5 border border-dashed border-slate-200 rounded-xl">
                Nenhum ${TIPO_LABEL[tipo].toLowerCase()} adicionado. Use a busca abaixo.
            </div>`;
        return;
    }

    const un = FONTE[tipo].unidade;
    container.innerHTML = linhas.map(eq => {
        const qtd = Number(eq.quantidade) || 1;
        const total = (Number(eq.potencia_unitaria) || 0) * qtd;
        return `
            <div class="flex flex-wrap items-center gap-x-5 gap-y-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:border-amber-300 transition-colors">
                <div class="flex-1 min-w-[220px]">
                    ${eq.fabricante ? `<p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">${esc(eq.fabricante)}</p>` : ''}
                    <p class="text-sm font-bold text-slate-900 leading-snug">${esc(eq.modelo) || '(sem descrição)'}</p>
                    <span class="inline-block mt-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-bold text-slate-600">${fmt(eq.potencia_unitaria, 0)} ${un} / un.</span>
                </div>

                <div class="flex items-center rounded-lg border border-slate-200 overflow-hidden">
                    <button type="button" ${qtd <= 1 ? 'disabled' : ''} onclick="atualizarQuantidadeEquipamento('${esc(eq.id)}', ${qtd - 1})"
                        class="w-9 h-9 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed" title="Diminuir"><i class="fa-solid fa-minus text-xs"></i></button>
                    <input type="number" min="1" value="${qtd}" onchange="atualizarQuantidadeEquipamento('${esc(eq.id)}', this.value)"
                        class="w-14 h-9 text-center text-sm font-bold font-mono border-x border-slate-200 focus:outline-none focus:bg-amber-50">
                    <button type="button" onclick="atualizarQuantidadeEquipamento('${esc(eq.id)}', ${qtd + 1})"
                        class="w-9 h-9 text-slate-600 hover:bg-slate-100" title="Aumentar"><i class="fa-solid fa-plus text-xs"></i></button>
                </div>

                <div class="w-28 text-right">
                    <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</p>
                    <p class="text-sm font-black text-slate-900">${fmt(total / 1000)} k${un}</p>
                </div>

                <button type="button" onclick="removerEquipamento('${esc(eq.id)}')" class="w-9 h-9 rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Remover">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>`;
    }).join('');
}

// ------------------------------------------------------------------
// Busca no Catálogo Fotovoltaico (consulta o banco com ilike; não
// depende de carregar as ~1.300 linhas na memória, e não sofre o limite
// de 1000 linhas do Supabase)
// ------------------------------------------------------------------
export function buscarEquipamentoCatalogo(tipo, inputId) {
    clearTimeout(timersBusca[tipo]);
    timersBusca[tipo] = setTimeout(() => executarBusca(tipo, inputId), 220);
}

async function executarBusca(tipo, inputId) {
    const input = el(inputId);
    const dropdown = el(inputId + '-dropdown');
    if (!input || !dropdown) return;

    ligarFechamentoFora(input, dropdown);
    const fonte = FONTE[tipo];
    const token = (tokenBusca[tipo] = (tokenBusca[tipo] || 0) + 1);

    dropdown.innerHTML = '<div class="text-xs text-slate-400 px-3 py-3"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Buscando...</div>';
    dropdown.classList.remove('hidden');

    // cada palavra digitada vira um filtro (todas precisam bater em
    // descrição, marca ou código). Remove caracteres que quebram o filtro.
    const palavras = input.value.trim().split(/\s+/).map(p => p.replace(/[,()%*\\"]/g, '')).filter(Boolean);

    let q = state.supabaseClient.from(fonte.tabela).select('*');
    if (fonte.filtroTipo) q = q.eq('tipo', fonte.filtroTipo);
    palavras.forEach(p => { q = q.or(`descricao.ilike.%${p}%,marca.ilike.%${p}%,codigo.ilike.%${p}%`); });
    q = q.order('marca').order('descricao').limit(30);

    const { data, error } = await q;
    if (token !== tokenBusca[tipo]) return; // chegou uma busca mais nova

    if (error) {
        dropdown.innerHTML = `<div class="text-xs text-red-500 px-3 py-3">Erro na busca: ${esc(error.message)}</div>`;
        return;
    }

    resultadosBusca[tipo] = {};
    (data || []).forEach(p => { resultadosBusca[tipo][p.id] = p; });

    if (!data || data.length === 0) {
        dropdown.innerHTML = `<div class="text-xs text-slate-400 px-3 py-3">${palavras.length
            ? `Nenhum ${TIPO_LABEL[tipo].toLowerCase()} encontrado para "${esc(input.value.trim())}".`
            : `Nenhum ${TIPO_LABEL[tipo].toLowerCase()} cadastrado. Cadastre em <b>Catálogo Fotovoltaico</b>.`}</div>`;
        return;
    }

    dropdown.innerHTML = data.map(p => `
        <button type="button" onclick="selecionarEquipamentoCatalogo('${tipo}', '${inputId}', '${esc(p.id)}')"
            class="w-full text-left px-3.5 py-2.5 hover:bg-amber-50 transition-colors border-b border-slate-100 last:border-0 flex items-center justify-between gap-3">
            <div class="min-w-0">
                <p class="text-sm font-bold text-slate-900 truncate">${p.marca ? esc(p.marca) + ' — ' : ''}${esc(p.descricao)}</p>
                <p class="text-xs text-slate-500">${p.codigo ? esc(p.codigo) + ' · ' : ''}${fmt(p[fonte.campoPotencia], 0)} ${fonte.unidade}</p>
            </div>
            <span class="text-xs font-bold text-emerald-700 whitespace-nowrap">${Number(p.preco) ? brl(p.preco) : ''}</span>
        </button>`).join('') +
        (data.length === 30 ? '<div class="text-[11px] text-slate-400 px-3.5 py-2 bg-slate-50">Mostrando os 30 primeiros — digite mais para refinar.</div>' : '');
}

function ligarFechamentoFora(input, dropdown) {
    if (input.dataset.foraLigado) return;
    input.dataset.foraLigado = '1';
    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.add('hidden');
    });
}

// Ao escolher um item: cria a linha na Proposta (qtd 1) ou, se o mesmo item
// já está na Proposta, soma 1 na quantidade.
export async function selecionarEquipamentoCatalogo(tipo, inputId, itemId) {
    if (!propostaIdAtual) {
        alert('Não foi possível identificar a Proposta deste equipamento. Feche e reabra a etapa.');
        return;
    }
    const item = resultadosBusca[tipo]?.[itemId];
    if (!item) return;

    const fonte = FONTE[tipo];
    const potencia = Number(item[fonte.campoPotencia]) || 0;
    if (!potencia) {
        alert(`Este item não tem potência cadastrada. Corrija no Catálogo Fotovoltaico antes de usar.`);
        return;
    }

    const dropdown = el(inputId + '-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    const input = el(inputId);
    if (input) input.value = '';

    const existente = equipamentosAtual.find(e => e.tipo === tipo && String(e.produto_id) === String(item.id));
    if (existente) {
        await atualizarQuantidadeEquipamento(existente.id, (Number(existente.quantidade) || 1) + 1);
        return;
    }

    const payload = {
        proposta_id: propostaIdAtual,
        tipo,
        produto_id: item.id,
        fabricante: item.marca || null,
        modelo: item.descricao,
        potencia_unitaria: potencia,
        quantidade: 1,
        ordem: equipamentosAtual.filter(e => e.tipo === tipo).length + 1
    };

    try {
        const { error } = await state.supabaseClient.from('proposta_equipamentos').insert(payload);
        if (error) throw error;
    } catch (err) {
        const dica = /foreign key|violates/i.test(err.message)
            ? '\n\nRode o SQL 005 no Supabase (remove a ligação antiga com o Catálogo Geral).'
            : '';
        alert('Erro ao adicionar equipamento: ' + err.message + dica);
        return;
    }
    await carregarKitGerador(propostaIdAtual);
}

// ------------------------------------------------------------------
// Quantidade / remover
// ------------------------------------------------------------------
export async function atualizarQuantidadeEquipamento(id, novaQuantidade) {
    const qtd = parseInt(novaQuantidade, 10);
    if (!qtd || qtd < 1) {
        alert('A quantidade deve ser maior que zero.');
        renderTudo();
        return;
    }
    // otimista: atualiza a tela na hora e confirma no banco
    const linha = equipamentosAtual.find(e => String(e.id) === String(id));
    if (linha) { linha.quantidade = qtd; renderTudo(); }
    try {
        const { error } = await state.supabaseClient.from('proposta_equipamentos').update({ quantidade: qtd }).eq('id', id);
        if (error) throw error;
    } catch (err) {
        alert('Erro ao atualizar quantidade: ' + err.message);
        await carregarKitGerador(propostaIdAtual);
    }
}

export async function removerEquipamento(id) {
    if (!confirm('Remover este equipamento da Proposta?')) return;
    try {
        const { error } = await state.supabaseClient.from('proposta_equipamentos').delete().eq('id', id);
        if (error) throw error;
    } catch (err) {
        alert('Erro ao remover equipamento: ' + err.message);
        return;
    }
    await carregarKitGerador(propostaIdAtual);
}

// ------------------------------------------------------------------
// Identificação do Kit (nome, código, observação)
// ------------------------------------------------------------------
function renderKitForm() {
    const set = (id, v) => { const e = el(id); if (e) e.value = v || ''; };
    set('kit-nome', kitAtual?.kit_nome);
    set('kit-codigo', kitAtual?.kit_codigo);
    set('kit-observacao', kitAtual?.kit_observacao);
}

// onblur dos campos — grava ao sair do campo
export async function salvarCamposKit() {
    if (!propostaIdAtual) return;
    await salvarKit({
        kit_nome: el('kit-nome')?.value || null,
        kit_codigo: el('kit-codigo')?.value || null,
        kit_observacao: el('kit-observacao')?.value || null
    });
}

// Upsert em proposta_kit_gerador (uma linha por Proposta)
async function salvarKit(campos) {
    try {
        if (kitAtual) {
            const { error } = await state.supabaseClient.from('proposta_kit_gerador')
                .update({ ...campos, updated_at: new Date().toISOString() }).eq('id', kitAtual.id);
            if (error) throw error;
            kitAtual = { ...kitAtual, ...campos };
        } else {
            const { data, error } = await state.supabaseClient.from('proposta_kit_gerador')
                .insert({ proposta_id: propostaIdAtual, topologia: 'Tradicional', ...campos })
                .select('*').single();
            if (error) throw error;
            kitAtual = data;
        }
    } catch (err) {
        alert('Erro ao gravar dados do Kit Gerador: ' + err.message);
    }
}

// ------------------------------------------------------------------
// Potência do sistema — SEMPRE calculada
// ------------------------------------------------------------------
function somaPotencia(tipo) {
    return equipamentosAtual
        .filter(e => e.tipo === tipo)
        .reduce((acc, e) => acc + (Number(e.potencia_unitaria) || 0) * (Number(e.quantidade) || 0), 0);
}

function somaQuantidade(tipo) {
    return equipamentosAtual.filter(e => e.tipo === tipo).reduce((acc, e) => acc + (Number(e.quantidade) || 0), 0);
}

function renderPotenciaSistema() {
    const kwp = somaPotencia('MODULO') / 1000;
    const kwCA = (somaPotencia('INVERSOR') + somaPotencia('MICROINVERSOR')) / 1000;

    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('kit-potencia-sistema', `${fmt(kwp)} kWp`);
    set('kit-resumo-modulos', String(somaQuantidade('MODULO')));
    set('kit-resumo-inversao', kwCA > 0 ? `${fmt(kwCA)} kW` : '—');
    // relação CC/CA: potência dos módulos ÷ potência de inversores/microinversores
    set('kit-resumo-relacao', kwCA > 0 && kwp > 0 ? fmt(kwp / kwCA) : '—');
}

// Permite que outras etapas leiam a potência já calculada.
export function getPotenciaSistemaKwp() {
    return somaPotencia('MODULO') / 1000;
}
