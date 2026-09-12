// projetos.js
// Projetos (vinculados a um cliente, e por sua vez a orçamentos — exibidos
// como grupo expansível na listagem de orçamentos). CRUD e mini-formulário
// inline usado dentro do editor de orçamento.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';

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
