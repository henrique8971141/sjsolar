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

export async function deleteProjeto(id) {
    if (!confirm("Isso removerá o vínculo dos orçamentos com este projeto (eles não serão apagados). Confirmar?")) return;
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
            <div class="col-span-full bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
                Nenhum projeto cadastrado ainda.
            </div>
        `;
        return;
    }

    state.localProjetos.forEach(p => {
        const card = document.createElement('div');
        card.dataset.projetoId = p.id;
        card.className = "bg-white rounded-xl border border-slate-200 shadow-xs p-5 cursor-pointer hover:border-amber-400 hover:shadow-md transition-all";
        card.onclick = () => abrirProjetoInterno(p.id);
        card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <h4 class="font-bold text-slate-900 leading-snug">${p.nome}</h4>
                <span class="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">${p.status || 'Rascunho'}</span>
            </div>
            <p class="text-sm text-slate-500 mt-1">${p.cliente_nome || 'Sem cliente'}</p>
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
    document.getElementById('proj-page-status').value = 'Rascunho';
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
    document.getElementById('proj-page-status').value = p.status || 'Rascunho';
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

    if (!nome || !cliente_id) {
        alert("Nome do projeto e Cliente são obrigatórios.");
        return;
    }

    try {
        if (state.editingProjetoPageId) {
            const { error } = await state.supabaseClient
                .from('projetos')
                .update({ nome, cliente_id, responsavel, status, observacoes, updated_at: new Date().toISOString() })
                .eq('id', state.editingProjetoPageId);
            if (error) throw error;
        } else {
            const { error } = await state.supabaseClient
                .from('projetos')
                .insert({ nome, cliente_id, responsavel, status, observacoes });
            if (error) throw error;
        }

        closeProjetoPageModal();
        await syncFromSupabase();
    } catch (err) {
        alert("Erro ao salvar projeto: " + err.message);
    }
}

export async function deleteProjetoPage(id) {
    if (!confirm("Isso removerá o vínculo dos orçamentos com este projeto (eles não serão apagados). Confirmar exclusão?")) return;
    try {
        const { error } = await state.supabaseClient.from('projetos').delete().eq('id', id);
        if (error) throw error;
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}
