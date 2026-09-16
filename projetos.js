// projetos.js
// Projetos (vinculados a um cliente, e por sua vez a orçamentos — exibidos
// como grupo expansível na listagem de orçamentos). CRUD e mini-formulário
// inline usado dentro do editor de orçamento.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { initClienteAutocomplete } from './cliente-autocomplete.js';
import { switchTab } from './ui.js';
import { switchProjetoSubTab, renderProjetoInternoHeader } from './projeto-interno.js';
import { navegarPara } from './router.js';

// Filtra o select de projeto do orçamento pelos projetos do cliente selecionado
export function atualizarProjetosDoCliente(clienteId) {
    const select = document.getElementById('form-projeto-id');
    if (!select) return;
    const atual = select.value;
    const projetosDoCliente = state.localProjetos.filter(p => String(p.cliente_id) === String(clienteId));
    select.innerHTML = '<option value="">Sem projeto</option>' +
        projetosDoCliente.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
    select.value = projetosDoCliente.some(p => String(p.id) === String(atual)) ? atual : '';
}

export function populateProjetoDropdowns() {
    const clienteAtualId = document.getElementById('form-cliente-id')?.value || '';
    atualizarProjetosDoCliente(clienteAtualId);
}

// Abre o mini-formulário de criação rápida de projeto, vinculado ao cliente já selecionado
let clienteAutocompleteProjetoPage = null;

export function openInlineProjetoForm() {
    const clienteId = document.getElementById('form-cliente-id').value;
    if (!clienteId) {
        alert("Selecione o cliente antes de criar um projeto.");
        return;
    }
    document.getElementById('inline-projeto-form').classList.remove('hidden');
    document.getElementById('inline-proj-nome').focus();
}

export function closeInlineProjetoForm() {
    document.getElementById('inline-projeto-form').classList.add('hidden');
    document.getElementById('inline-proj-nome').value = '';
    document.getElementById('inline-proj-descricao').value = '';
}

export async function saveInlineProjeto() {
    const cliente_id = document.getElementById('form-cliente-id').value;
    const nome = document.getElementById('inline-proj-nome').value.trim();
    const descricao = document.getElementById('inline-proj-descricao').value.trim();

    if (!cliente_id || !nome) {
        alert("Cliente e nome do projeto são obrigatórios.");
        return;
    }

    try {
        const { data, error } = await state.supabaseClient
            .from('projetos')
            .insert({ cliente_id, nome, descricao })
            .select()
            .single();
        if (error) throw error;

        await syncFromSupabase();
        atualizarProjetosDoCliente(cliente_id);
        document.getElementById('form-projeto-id').value = data.id;
        closeInlineProjetoForm();
    } catch (err) {
        alert("Erro ao criar projeto: " + err.message);
    }
}

// Um projeto com orçamentos vinculados não pode ser excluído nesta etapa
// (evita apagar/desvincular orçamentos sem controle). state.localOrcamentos
// já traz projeto_id mapeado (ver supabase.js), então a checagem é só local.
function possuiOrcamentosVinculados(projetoId) {
    return state.localOrcamentos.some(o => String(o.projeto_id) === String(projetoId));
}

export async function deleteProjeto(id) {
    if (possuiOrcamentosVinculados(id)) {
        alert("NÃO É POSSÍVEL EXCLUIR ESTE PROJETO.\n\nExistem orçamentos vinculados a este projeto.");
        return;
    }
    if (!confirm("Confirmar exclusão deste projeto?")) return;
    try {
        const { error } = await state.supabaseClient.from('projetos').delete().eq('id', id);
        if (error) throw error;
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}

// ============================================================
// ABA "PROJETOS" — CRUD completo (listagem, modal criar/editar, exclusão)
// ============================================================

function formatarDataCriacao(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
}

// Formata uma data "YYYY-MM-DD" (coluna date do Postgres) para pt-BR sem
// passar por new Date(), que aplicaria fuso horário e poderia voltar um dia.
function formatarDataProjeto(dataIso) {
    if (!dataIso) return '';
    const partes = String(dataIso).split('-');
    if (partes.length !== 3) return '';
    const [ano, mes, dia] = partes;
    return `${dia}/${mes}/${ano}`;
}



// Filtra os projetos pelo texto digitado na busca (nome do projeto, nome do
// cliente, CPF/CNPJ do cliente ou status). Usa somente o cache local em
// state.localProjetos — sem nova consulta ao Supabase a cada tecla.
function filtrarProjetos(query) {
    const termo = String(query || '').trim().toLowerCase();
    if (!termo) return state.localProjetos;
    return state.localProjetos.filter(p =>
        (p.nome && p.nome.toLowerCase().includes(termo)) ||
        (p.cliente_nome && p.cliente_nome.toLowerCase().includes(termo)) ||
        (p.cliente_cpf_cnpj && p.cliente_cpf_cnpj.toLowerCase().includes(termo)) ||
        (p.status && p.status.toLowerCase().includes(termo))
    );
}

// Etapa 2: listagem de Projetos em cards. Cada card é inteiramente clicável
// e abre a área interna do projeto (Orçamentos / Documentos / Informações do
// Cliente). Sem botões de "Entrar", "Editar" ou "Excluir" no card — essas
// ações administrativas ficam dentro da própria área interna do projeto.
export function renderProjetosPage() {
    const grid = document.getElementById('projetos-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (state.localProjetos.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                <p class="font-bold text-slate-500 uppercase tracking-wider text-sm">Nenhum projeto criado</p>
                <p onclick="openProjetoPageModal()" class="mt-2 inline-block text-amber-600 hover:text-amber-700 font-bold uppercase tracking-wider text-sm cursor-pointer underline underline-offset-2">
                    Clique aqui para criar
                </p>
            </div>
        `;
        return;
    }

    const buscaField = document.getElementById('proj-busca');
    const projetosFiltrados = filtrarProjetos(buscaField ? buscaField.value : '');

    if (projetosFiltrados.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
                Nenhum projeto encontrado para essa busca.
            </div>
        `;
        return;
    }

    projetosFiltrados.forEach(p => {
        const card = document.createElement('div');
        card.dataset.projetoId = p.id;
        card.className = "bg-white rounded-xl border border-slate-200 shadow-xs p-5 cursor-pointer hover:border-amber-400 hover:shadow-md transition-all";
        card.onclick = () => abrirProjetoInterno(p.id);

        const detalhes = [formatarDataProjeto(p.data_projeto)]
            .filter(Boolean)
            .map(txt => `<span>${txt}</span>`)
            .join('<span class="text-slate-300">•</span>');

        card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <h4 class="font-bold text-slate-900 leading-snug">${p.nome}</h4>
                <span class="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">${p.status || 'Rascunho'}</span>
            </div>
            <p class="text-sm text-slate-500 mt-1">${p.cliente_nome || 'Sem cliente'}</p>
            ${detalhes ? `<div class="flex items-center gap-1.5 mt-2 text-xs text-slate-500">${detalhes}</div>` : ''}
            <div class="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
                <span>${p.responsavel ? 'Resp.: ' + p.responsavel : ''}</span>
                <span>${formatarDataCriacao(p.created_at)}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ============================================================
// ÁREA INTERNA DO PROJETO (Etapa 2)
// ============================================================

// Chamada pelo card de projeto (onclick já definido em renderProjetosPage) e
// por qualquer outro ponto que precise "entrar" num projeto. Apenas muda a
// URL — quem de fato renderiza a tela é renderProjetoNaRota(), chamada pelo
// Router a partir da URL.
export function abrirProjetoInterno(id) {
    navegarPara(`/projeto/${id}`);
}

// Render "puro" da área interna do projeto: recebe o ID e a sub-aba já
// resolvidos pelo Router (router.js) e apenas atualiza o estado/DOM — não
// mexe na URL. Quem decide a URL é sempre o Router.
export function renderProjetoNaRota(id, subTabInterno) {
    const projeto = state.localProjetos.find(p => String(p.id) === String(id));
    if (!projeto) return;

    state.projetoAtualId = id;

    switchTab('projeto-interno-tab');
    // Mantém "Projetos" destacado na sidebar, já que continuamos dentro dessa área
    const navProjetos = document.getElementById('nav-projetos-tab');
    if (navProjetos) navProjetos.className = "sidebar-link flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-bold bg-amber-400 text-slate-950";

    renderProjetoInternoHeader();
    switchProjetoSubTab(subTabInterno || 'orcamentos');
}

// Volta para a listagem de projetos, sem perder o cadastro (o projeto
// simplesmente deixa de ser o "projeto atual"). Apenas muda a URL — a
// limpeza de state.projetoAtualId e a troca de tela acontecem no Router.
export function voltarParaProjetos() {
    navegarPara('/projetos');
}

// Os 5 status que a interface nova utiliza. O DEFAULT do banco continua
// 'Rascunho' e projetos antigos podem ter outros valores (ex.: "Em
// orçamento") — esses valores não são convertidos automaticamente (ver
// regra em editProjetoPage/saveProjetoPage).
const STATUS_PROJETO = ['Orçamento', 'Em Andamento', 'Aprovado', 'Concluído', 'Cancelado'];

function ensureProjetoPageClienteAutocomplete() {
    if (!clienteAutocompleteProjetoPage) {
        clienteAutocompleteProjetoPage = initClienteAutocomplete('proj-page-cliente-autocomplete', {
            getClienteAtualId: () => document.getElementById('proj-page-cliente-id').value,
            onSelect: (clienteId) => {
                document.getElementById('proj-page-cliente-id').value = clienteId;
            }
        });
    }
    return clienteAutocompleteProjetoPage;
}

export function openProjetoPageModal() {
    state.editingProjetoPageId = null;
    ensureProjetoPageClienteAutocomplete();
    document.getElementById('projeto-page-modal-title').textContent = 'Novo Projeto';
    document.getElementById('proj-page-btn-save').textContent = 'Salvar';
    document.getElementById('proj-page-nome').value = '';
    document.getElementById('proj-page-cliente-id').value = '';
    document.getElementById('proj-page-responsavel').value = '';
    // Novo projeto: começa no primeiro dos 5 status da interface nova (o
    // DEFAULT do banco continua 'Rascunho' até o usuário escolher outro).
    document.getElementById('proj-page-status').value = STATUS_PROJETO[0];
    document.getElementById('proj-page-data').value = '';
    document.getElementById('proj-page-observacoes').value = '';
    clienteAutocompleteProjetoPage.refresh();
    document.getElementById('projeto-page-modal-overlay').classList.remove('hidden');
}

export function closeProjetoPageModal() {
    document.getElementById('projeto-page-modal-overlay').classList.add('hidden');
    state.editingProjetoPageId = null;
}

export function editProjetoPage(id) {
    const p = state.localProjetos.find(x => String(x.id) === String(id));
    if (!p) return;
    state.editingProjetoPageId = id;
    ensureProjetoPageClienteAutocomplete();
    document.getElementById('projeto-page-modal-title').textContent = 'Editar Projeto';
    document.getElementById('proj-page-btn-save').textContent = 'Salvar Alterações';
    document.getElementById('proj-page-nome').value = p.nome || '';
    document.getElementById('proj-page-cliente-id').value = p.cliente_id || '';
    document.getElementById('proj-page-responsavel').value = p.responsavel || '';

    // Projeto antigo pode ter um status fora dos 5 da interface nova (ex.:
    // "Rascunho", "Em orçamento"). Não sobrescrever automaticamente: se o
    // valor atual não está entre os 5, adiciona-o como opção temporária no
    // <select> para que o valor original seja preservado até o usuário
    // escolher explicitamente um novo status.
    const statusSelect = document.getElementById('proj-page-status');
    const statusExtraOption = statusSelect.querySelector('option[data-status-legado]');
    if (statusExtraOption) statusExtraOption.remove();
    const statusAtual = p.status || 'Rascunho';
    if (!STATUS_PROJETO.includes(statusAtual)) {
        const opt = document.createElement('option');
        opt.value = statusAtual;
        opt.textContent = `${statusAtual} (status anterior)`;
        opt.setAttribute('data-status-legado', '1');
        statusSelect.insertBefore(opt, statusSelect.firstChild);
    }
    statusSelect.value = statusAtual;

    document.getElementById('proj-page-data').value = p.data_projeto || '';
    document.getElementById('proj-page-observacoes').value = p.observacoes || '';
    clienteAutocompleteProjetoPage.refresh();
    document.getElementById('projeto-page-modal-overlay').classList.remove('hidden');
}

export async function saveProjetoPage() {
    const nome = document.getElementById('proj-page-nome').value.trim();
    const cliente_id = document.getElementById('proj-page-cliente-id').value;
    const responsavel = document.getElementById('proj-page-responsavel').value.trim();
    const status = document.getElementById('proj-page-status').value;
    const observacoes = document.getElementById('proj-page-observacoes').value.trim();

    const dataProjetoRaw = document.getElementById('proj-page-data').value;
    const data_projeto = dataProjetoRaw || null;

    if (!nome || !cliente_id) {
        alert("Nome do projeto e Cliente são obrigatórios.");
        return;
    }

    try {
        if (state.editingProjetoPageId) {
            const { error } = await state.supabaseClient
                .from('projetos')
                .update({ nome, cliente_id, responsavel, status, observacoes, data_projeto, updated_at: new Date().toISOString() })
                .eq('id', state.editingProjetoPageId);
            if (error) throw error;
        } else {
            const { error } = await state.supabaseClient
                .from('projetos')
                .insert({ nome, cliente_id, responsavel, status, observacoes, data_projeto });
            if (error) throw error;
        }

        closeProjetoPageModal();
        await syncFromSupabase();
    } catch (err) {
        alert("Erro ao salvar projeto: " + err.message);
    }
}

export async function deleteProjetoPage(id) {
    if (possuiOrcamentosVinculados(id)) {
        alert("NÃO É POSSÍVEL EXCLUIR ESTE PROJETO.\n\nExistem orçamentos vinculados a este projeto.");
        return;
    }
    if (!confirm("Confirmar exclusão deste projeto?")) return;
    try {
        const { error } = await state.supabaseClient.from('projetos').delete().eq('id', id);
        if (error) throw error;
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}
