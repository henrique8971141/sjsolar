// kit-gerador.js
// Etapa 2.3.4 da TELA PRÓPRIA da Proposta: Kit Gerador / Equipamentos.
// Módulo completamente independente do editor de Orçamento
// (orcamentos.js / equipamentos.js / orcamento-editor-tab) e da lógica de
// Orçamento Avulso — não é lido nem chamado por nenhum dos dois, e não usa
// a coluna "orcamentos.equipamentos_json" (essa é exclusiva do Orçamento
// Avulso: lista solta de qtd/descrição/preço, sem estrutura de potência).
//
// Cada equipamento pertence exclusivamente a uma Proposta
// (proposta_id -> a linha da Proposta na tabela "orcamentos"), e é sempre
// selecionado a partir do Catálogo existente (produtos_servicos) — não há
// cadastro de equipamentos separado dentro da Proposta. Persistência nas
// tabelas novas "proposta_equipamentos" e "proposta_kit_gerador" (ver
// sql/003_kit_gerador_equipamentos.sql).
//
// Regra central: a potência do sistema é SEMPRE derivada dos equipamentos
// selecionados (potência unitária × quantidade, somada por tipo) — nunca
// digitada manualmente e nunca gravada em projetos.potencia_kwp. Módulos
// somam a potência do sistema (kWp); inversores/microinversores/
// otimizadores são mostrados com sua própria potência somada (kW), mas não
// entram na conta da potência do sistema (que é sempre a dos módulos).

import { state } from './state.js';

const TIPOS = ['MODULO', 'INVERSOR', 'MICROINVERSOR', 'OTIMIZADOR'];

const TIPO_LABEL = {
    MODULO: 'Módulo Fotovoltaico',
    INVERSOR: 'Inversor',
    MICROINVERSOR: 'Microinversor',
    OTIMIZADOR: 'Otimizador'
};

// Container no HTML onde as linhas de cada tipo são renderizadas.
const TIPO_CONTAINER_ID = {
    MODULO: 'kit-lista-modulos',
    INVERSOR: 'kit-lista-inversores',
    MICROINVERSOR: 'kit-lista-microinversores',
    OTIMIZADOR: 'kit-lista-otimizadores'
};

let propostaIdAtual = null;
let equipamentosAtual = []; // linhas de proposta_equipamentos já salvas nesta Proposta
let kitAtual = null;        // linha de proposta_kit_gerador (ou null se ainda não existe)
let buscaSelectorTipoAtual = null;
let buscaSelectorTargetRowId = null; // linha temporária (ainda não salva) que está aguardando seleção do catálogo

// ------------------------------------------------------------------
// Carregamento inicial da etapa (chamado pela navegação da Proposta,
// igual ao padrão de carregarUnidadesConsumidoras).
// ------------------------------------------------------------------
export async function carregarKitGerador(propostaId) {
    propostaIdAtual = propostaId;
    equipamentosAtual = [];
    kitAtual = null;

    if (!propostaId) {
        renderTudo();
        return;
    }

    try {
        const [{ data: eqData, error: eqError }, { data: kitData, error: kitError }] = await Promise.all([
            state.supabaseClient
                .from('proposta_equipamentos')
                .select('*')
                .eq('proposta_id', propostaId)
                .order('ordem', { ascending: true }),
            state.supabaseClient
                .from('proposta_kit_gerador')
                .select('*')
                .eq('proposta_id', propostaId)
                .maybeSingle()
        ]);
        if (eqError) throw eqError;
        if (kitError) throw kitError;

        equipamentosAtual = eqData || [];
        kitAtual = kitData || null;
    } catch (err) {
        console.error('Erro ao carregar Kit Gerador:', err.message);
        const container = document.getElementById('kit-gerador-erro');
        if (container) {
            container.textContent = `Erro ao carregar equipamentos: ${err.message}`;
            container.classList.remove('hidden');
        }
        return;
    }

    renderTudo();
}

function renderTudo() {
    popularTopologiaESelects();
    renderTodasListas();
    renderKitForm();
    renderPotenciaSistema();
}

// ------------------------------------------------------------------
// Topologia
// ------------------------------------------------------------------
function popularTopologiaESelects() {
    const select = document.getElementById('kit-topologia');
    if (!select) return;
    select.value = kitAtual?.topologia || 'Tradicional';
}

// Chamado pelo onchange do select de topologia. Só grava a mudança — nunca
// apaga equipamentos já cadastrados sem confirmação explícita do usuário.
export async function alterarTopologia() {
    const select = document.getElementById('kit-topologia');
    if (!select || !propostaIdAtual) return;
    await salvarKit({ topologia: select.value });
}

// ------------------------------------------------------------------
// Renderização das listas de equipamentos (uma por tipo)
// ------------------------------------------------------------------
function renderTodasListas() {
    TIPOS.forEach(renderListaTipo);
}

function formatarPotenciaUnitaria(tipo, valor) {
    const num = Number(valor) || 0;
    return tipo === 'INVERSOR'
        ? `${num.toLocaleString('pt-BR')} W`
        : `${num.toLocaleString('pt-BR')} Wp`;
}

function renderListaTipo(tipo) {
    const container = document.getElementById(TIPO_CONTAINER_ID[tipo]);
    if (!container) return;

    const linhas = equipamentosAtual.filter(e => e.tipo === tipo);

    if (linhas.length === 0) {
        container.innerHTML = `
            <div class="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg">
                Nenhum ${TIPO_LABEL[tipo].toLowerCase()} adicionado ainda.
            </div>`;
        return;
    }

    container.innerHTML = linhas.map((eq, idx) => {
        const potenciaTotal = (Number(eq.potencia_unitaria) || 0) * (Number(eq.quantidade) || 0);
        return `
            <div class="flex flex-wrap items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div class="flex-grow min-w-[220px]">
                    <p class="text-sm font-bold text-slate-900">${eq.fabricante ? eq.fabricante + ' — ' : ''}${eq.modelo || '(sem descrição)'}</p>
                    <p class="text-xs text-slate-500">${formatarPotenciaUnitaria(tipo, eq.potencia_unitaria)} por unidade</p>
                </div>
                <div class="flex items-center gap-1">
                    <label class="text-[10px] font-bold uppercase text-slate-400">Qtd</label>
                    <input type="number" min="1" value="${eq.quantidade}" data-eq-id="${eq.id}" onchange="atualizarQuantidadeEquipamento('${eq.id}', this.value)" class="w-16 px-2 py-1 rounded border border-slate-300 text-sm font-mono text-center">
                </div>
                <div class="text-xs font-bold text-slate-700 w-28 text-right">
                    ${(potenciaTotal / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} k${tipo === 'INVERSOR' ? 'W' : 'Wp'}
                </div>
                <button type="button" onclick="removerEquipamento('${eq.id}')" class="text-red-500 hover:text-red-700 px-1" title="Remover">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>`;
    }).join('') + linhaBuscaHtml(tipo, `existente-${tipo}`);
}

// Linha de busca/adição — sempre exibida ao final da lista de cada tipo,
// para adicionar mais um equipamento daquele tipo.
function linhaBuscaHtml(tipo, rowKey) {
    const inputId = `kit-busca-${rowKey}`;
    return `
        <div class="flex items-center gap-2 pt-1">
            <div class="relative flex-grow">
                <input type="text" id="${inputId}" placeholder="Pesquisar ${TIPO_LABEL[tipo].toLowerCase()} no catálogo..." autocomplete="off"
                    oninput="buscarEquipamentoCatalogo('${tipo}', '${inputId}')"
                    onfocus="buscarEquipamentoCatalogo('${tipo}', '${inputId}')"
                    class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <div id="${inputId}-dropdown" class="hidden absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto"></div>
            </div>
            <span class="text-xs text-slate-400 whitespace-nowrap"><i class="fa-solid fa-magnifying-glass mr-1"></i>Buscar no Catálogo</span>
        </div>`;
}

// ------------------------------------------------------------------
// Busca no Catálogo (autocomplete simples, sem modal — a lista aparece
// como dropdown abaixo do campo de busca de cada bloco de equipamento).
// Reaproveita state.localCatalog (mesmo cache usado pelo resto do app),
// nunca cria uma fonte de dados própria dentro da Proposta.
// ------------------------------------------------------------------
export function buscarEquipamentoCatalogo(tipo, inputId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(inputId + '-dropdown');
    if (!input || !dropdown) return;

    const query = input.value.trim().toLowerCase();

    // Prioriza itens do catálogo já marcados com a categoria de equipamento
    // correspondente; mas não exclui os demais, pois o Catálogo é genérico
    // e pode ter itens ainda não categorizados.
    const candidatos = state.localCatalog.filter(p => {
        const combina = !query || p.descricao.toLowerCase().includes(query) || (p.marca || '').toLowerCase().includes(query);
        return combina;
    });
    candidatos.sort((a, b) => {
        const aMatch = a.categoria_equipamento === tipo ? 0 : 1;
        const bMatch = b.categoria_equipamento === tipo ? 0 : 1;
        return aMatch - bMatch;
    });
    const resultados = candidatos.slice(0, 20);

    if (resultados.length === 0) {
        dropdown.innerHTML = `<div class="text-xs text-slate-400 px-3 py-2">Nenhum item encontrado no Catálogo${query ? ' para "' + input.value + '"' : ''}.</div>`;
    } else {
        dropdown.innerHTML = resultados.map(p => {
            const potenciaCadastrada = tipo === 'INVERSOR' ? p.potencia_w_inversor : p.potencia_wp;
            const potenciaTxt = potenciaCadastrada ? ` · ${Number(potenciaCadastrada).toLocaleString('pt-BR')} ${tipo === 'INVERSOR' ? 'W' : 'Wp'}` : ' · potência não cadastrada no catálogo';
            return `
                <button type="button" data-produto-id="${p.id}" onclick="selecionarEquipamentoCatalogo('${tipo}', '${inputId}', '${p.id}')"
                    class="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors border-b border-slate-100 last:border-0">
                    <div class="font-bold text-slate-900">${p.marca ? p.marca + ' — ' : ''}${p.descricao}</div>
                    <div class="text-xs text-slate-500">${p.categoria || 'Item do catálogo'}${potenciaTxt}</div>
                </button>`;
        }).join('');
    }
    dropdown.classList.remove('hidden');

    // Fecha ao clicar fora (uma única vez por input, marcado via dataset).
    if (!input.dataset.blurLigado) {
        input.dataset.blurLigado = '1';
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }
}

// Ao selecionar um item do catálogo, cria imediatamente a linha do
// equipamento na Proposta (quantidade inicial 1) usando a potência
// cadastrada no catálogo, se houver — senão pede a potência unitária
// antes de gravar, pois a potência do sistema depende dela.
export async function selecionarEquipamentoCatalogo(tipo, inputId, produtoId) {
    if (!propostaIdAtual) {
        alert("Não foi possível identificar a Proposta deste equipamento. Feche e reabra a etapa.");
        return;
    }
    const produto = state.localCatalog.find(p => String(p.id) === String(produtoId));
    if (!produto) return;

    let potenciaUnitaria = tipo === 'INVERSOR' ? produto.potencia_w_inversor : produto.potencia_wp;
    potenciaUnitaria = Number(potenciaUnitaria) || 0;

    if (!potenciaUnitaria) {
        const unidade = tipo === 'INVERSOR' ? 'W' : 'Wp';
        const resposta = prompt(`Este item do Catálogo ainda não tem potência unitária cadastrada.\nInforme a potência unitária (${unidade}) para "${produto.descricao}":`);
        const valor = parseFloat((resposta || '').replace(',', '.'));
        if (!resposta || isNaN(valor) || valor <= 0) {
            alert("Potência unitária é obrigatória para calcular a potência do sistema.");
            return;
        }
        potenciaUnitaria = valor;

        // Grava a potência informada de volta no Catálogo, para que da
        // próxima vez este item já venha com a potência preenchida.
        try {
            const campo = tipo === 'INVERSOR' ? { potencia_w_inversor: potenciaUnitaria } : { potencia_wp: potenciaUnitaria };
            await state.supabaseClient.from('produtos_servicos').update(campo).eq('id', produto.id);
            produto[tipo === 'INVERSOR' ? 'potencia_w_inversor' : 'potencia_wp'] = potenciaUnitaria;
        } catch (err) {
            console.error('Não foi possível salvar a potência no catálogo:', err.message);
        }
    }

    const payload = {
        proposta_id: propostaIdAtual,
        tipo,
        produto_id: produto.id,
        fabricante: produto.marca || null,
        modelo: produto.descricao,
        potencia_unitaria: potenciaUnitaria,
        quantidade: 1,
        ordem: equipamentosAtual.filter(e => e.tipo === tipo).length + 1
    };

    try {
        const { error } = await state.supabaseClient.from('proposta_equipamentos').insert(payload);
        if (error) throw error;
    } catch (err) {
        alert("Erro ao adicionar equipamento: " + err.message);
        return;
    }

    const dropdown = document.getElementById(inputId + '-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    const input = document.getElementById(inputId);
    if (input) input.value = '';

    await carregarKitGerador(propostaIdAtual);
}

// ------------------------------------------------------------------
// Alterar quantidade / remover equipamento
// ------------------------------------------------------------------
export async function atualizarQuantidadeEquipamento(id, novaQuantidade) {
    const qtd = parseInt(novaQuantidade) || 1;
    if (qtd < 1) {
        alert("A quantidade deve ser maior que zero.");
        await carregarKitGerador(propostaIdAtual);
        return;
    }
    try {
        const { error } = await state.supabaseClient.from('proposta_equipamentos').update({ quantidade: qtd }).eq('id', id);
        if (error) throw error;
    } catch (err) {
        alert("Erro ao atualizar quantidade: " + err.message);
    }
    await carregarKitGerador(propostaIdAtual);
}

export async function removerEquipamento(id) {
    if (!confirm("Remover este equipamento da Proposta?")) return;
    try {
        const { error } = await state.supabaseClient.from('proposta_equipamentos').delete().eq('id', id);
        if (error) throw error;
    } catch (err) {
        alert("Erro ao remover equipamento: " + err.message);
        return;
    }
    await carregarKitGerador(propostaIdAtual);
}

// ------------------------------------------------------------------
// Kit Gerador (identificação do conjunto — nome, código, observação)
// ------------------------------------------------------------------
function renderKitForm() {
    const nomeInput = document.getElementById('kit-nome');
    const codigoInput = document.getElementById('kit-codigo');
    const obsInput = document.getElementById('kit-observacao');
    if (nomeInput) nomeInput.value = kitAtual?.kit_nome || '';
    if (codigoInput) codigoInput.value = kitAtual?.kit_codigo || '';
    if (obsInput) obsInput.value = kitAtual?.kit_observacao || '';
}

// Chamado pelo onblur dos campos do Kit — grava assim que o usuário sai do
// campo, sem exigir um botão "Salvar" separado nesta etapa.
export async function salvarCamposKit() {
    if (!propostaIdAtual) return;
    await salvarKit({
        kit_nome: document.getElementById('kit-nome')?.value || null,
        kit_codigo: document.getElementById('kit-codigo')?.value || null,
        kit_observacao: document.getElementById('kit-observacao')?.value || null
    });
}

// Upsert em proposta_kit_gerador (uma linha por Proposta). Usado tanto pela
// troca de topologia quanto pelos campos de identificação do kit.
async function salvarKit(campos) {
    try {
        if (kitAtual) {
            const { error } = await state.supabaseClient
                .from('proposta_kit_gerador')
                .update({ ...campos, updated_at: new Date().toISOString() })
                .eq('id', kitAtual.id);
            if (error) throw error;
            kitAtual = { ...kitAtual, ...campos };
        } else {
            const { data, error } = await state.supabaseClient
                .from('proposta_kit_gerador')
                .insert({ proposta_id: propostaIdAtual, topologia: 'Tradicional', ...campos })
                .select('*')
                .single();
            if (error) throw error;
            kitAtual = data;
        }
    } catch (err) {
        alert("Erro ao gravar dados do Kit Gerador: " + err.message);
    }
}

// ------------------------------------------------------------------
// Potência do sistema — SEMPRE calculada a partir dos módulos
// selecionados (nunca digitada manualmente, nunca gravada em
// projetos.potencia_kwp). Inversores/microinversores/otimizadores são
// exibidos à parte, apenas informativamente.
// ------------------------------------------------------------------
function somaPotencia(tipo) {
    return equipamentosAtual
        .filter(e => e.tipo === tipo)
        .reduce((acc, e) => acc + (Number(e.potencia_unitaria) || 0) * (Number(e.quantidade) || 0), 0);
}

function renderPotenciaSistema() {
    const potenciaModulosW = somaPotencia('MODULO');
    const potenciaKwp = potenciaModulosW / 1000;

    const elPotencia = document.getElementById('kit-potencia-sistema');
    if (elPotencia) {
        elPotencia.textContent = `${potenciaKwp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWp`;
    }

    const resumo = [
        { tipo: 'INVERSOR', label: 'Inversores' },
        { tipo: 'MICROINVERSOR', label: 'Microinversores' },
        { tipo: 'OTIMIZADOR', label: 'Otimizadores' }
    ].map(({ tipo, label }) => {
        const totalW = somaPotencia(tipo);
        const qtd = equipamentosAtual.filter(e => e.tipo === tipo).reduce((acc, e) => acc + (Number(e.quantidade) || 0), 0);
        return qtd > 0 ? `${label}: ${qtd} un. · ${(totalW / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kW` : null;
    }).filter(Boolean);

    const elResumo = document.getElementById('kit-potencia-resumo');
    if (elResumo) {
        elResumo.textContent = resumo.join(' · ') || '';
    }
}

// Exposto para permitir que outras etapas (ex.: uma futura etapa de
// Formação de Preço) leiam a potência já calculada sem duplicar a lógica.
export function getPotenciaSistemaKwp() {
    return somaPotencia('MODULO') / 1000;
}
