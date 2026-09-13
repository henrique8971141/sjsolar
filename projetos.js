// projetos.js
// Projetos (vinculados a um cliente, e por sua vez a orçamentos — exibidos
// como grupo expansível na listagem de orçamentos). CRUD e mini-formulário
// inline usado dentro do editor de orçamento.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { initClienteAutocomplete } from './cliente-autocomplete.js';

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

export function renderProjetosPage() {
    const body = document.getElementById('projetos-page-list-body');
    if (!body) return;
    body.innerHTML = '';
    state.localProjetos.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="px-6 py-4 font-bold text-slate-900">${p.nome}</td>
            <td class="px-6 py-4">${p.cliente_nome || 'Sem cliente'}</td>
            <td class="px-6 py-4">${p.responsavel || '-'}</td>
            <td class="px-6 py-4">${p.status || 'Rascunho'}</td>
            <td class="px-6 py-4 text-xs text-slate-500">${formatarDataCriacao(p.created_at)}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="editProjetoPage('${p.id}')" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteProjetoPage('${p.id}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
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
