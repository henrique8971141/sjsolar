// clientes.js
// CRUD de clientes (listagem, edição inline, exclusão) e o card de seleção
// de cliente usado dentro do editor de orçamento.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { atualizarProjetosDoCliente } from './projetos.js';

export function renderClientes() {
    const body = document.getElementById('clientes-list-body');
    body.innerHTML = '';
    state.localClientes.forEach(c => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="px-6 py-4 font-bold text-slate-900">${c.nome}</td>
            <td class="px-6 py-4">${c.telefone || 'Sem telefone'}</td>
            <td class="px-6 py-4 text-slate-600">${c.email || 'N/A'}</td>
            <td class="px-6 py-4 text-xs text-slate-500">${c.endereco_completo || ''}, ${c.cidade || ''}-${c.estado || ''}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="editCliente('${c.id}')" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"><i class="fa-solid fa-pen"></i></button>
                <button onclick="deleteCliente('${c.id}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        `;
        body.appendChild(tr);
    });
}

export function editCliente(id) {
    const c = state.localClientes.find(x => String(x.id) === String(id));
    if (!c) return;
    state.editingClienteId = id;
    document.getElementById('cli-nome').value = c.nome || '';
    document.getElementById('cli-telefone').value = c.telefone || '';
    document.getElementById('cli-email').value = c.email || '';
    document.getElementById('cli-endereco').value = c.endereco_completo || '';
    document.getElementById('cli-cidade').value = c.cidade || '';
    document.getElementById('cli-estado').value = c.estado || '';

    document.getElementById('btn-save-cliente').textContent = 'Salvar Alterações';
    document.getElementById('btn-cancel-cliente').classList.remove('hidden');
    document.getElementById('cli-nome').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function cancelEditCliente() {
    state.editingClienteId = null;
    document.getElementById('cli-nome').value = '';
    document.getElementById('cli-telefone').value = '';
    document.getElementById('cli-email').value = '';
    document.getElementById('cli-endereco').value = '';
    document.getElementById('cli-cidade').value = '';
    document.getElementById('cli-estado').value = '';
    document.getElementById('btn-save-cliente').textContent = 'Cadastrar Novo Cliente';
    document.getElementById('btn-cancel-cliente').classList.add('hidden');
}

export async function saveQuickCliente() {
    const nome = document.getElementById('cli-nome').value.trim();
    const telefone = document.getElementById('cli-telefone').value.trim();
    const email = document.getElementById('cli-email').value.trim();
    const endereco_completo = document.getElementById('cli-endereco').value.trim();
    const cidade = document.getElementById('cli-cidade').value.trim();
    const estado = document.getElementById('cli-estado').value.trim();

    if (!nome) {
        alert("Nome é obrigatório.");
        return;
    }

    try {
        if (state.editingClienteId) {
            const { error } = await state.supabaseClient
                .from('clientes')
                .update({ nome, telefone, email, endereco_completo, cidade, estado })
                .eq('id', state.editingClienteId);
            if (error) throw error;
        } else {
            const { error } = await state.supabaseClient
                .from('clientes')
                .insert({ nome, telefone, email, endereco_completo, cidade, estado });
            if (error) throw error;
        }

        cancelEditCliente();
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}

export async function deleteCliente(id) {
    if (!confirm("Isso removerá também todos os orçamentos vinculados a este cliente. Confirmar?")) return;
    try {
        const { error } = await state.supabaseClient.from('clientes').delete().eq('id', id);
        if (error) throw error;
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}

// CARD DE SELEÇÃO DE CLIENTE (usado no editor de orçamento)
export function openClienteSelectorCard() {
    document.getElementById('cliente-selector-overlay').classList.remove('hidden');
    document.getElementById('cliente-selector-search').value = '';
    renderClienteSelectorList();
    document.getElementById('cliente-selector-search').focus();
}

export function closeClienteSelectorCard() {
    document.getElementById('cliente-selector-overlay').classList.add('hidden');
}

export function renderClienteSelectorList() {
    const query = document.getElementById('cliente-selector-search').value.toLowerCase();
    const container = document.getElementById('cliente-selector-list');
    const selecionadoId = document.getElementById('form-cliente-id').value;
    const filtrados = state.localClientes.filter(c =>
        !query ||
        (c.nome && c.nome.toLowerCase().includes(query)) ||
        (c.cidade && c.cidade.toLowerCase().includes(query))
    );

    if (filtrados.length === 0) {
        container.innerHTML = '<div class="text-sm text-slate-400 text-center py-6">Nenhum cliente encontrado.</div>';
        return;
    }

    container.innerHTML = filtrados.map(c => `
        <button type="button" onclick="selecionarClienteCard('${c.id}')"
            class="w-full text-left p-3 rounded-lg border ${String(c.id) === String(selecionadoId) ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'} transition-colors">
            <div class="font-bold text-slate-900 text-sm">${c.nome}</div>
            <div class="text-xs text-slate-500">${c.cidade || 'Sem cidade'}${c.telefone ? ' · ' + c.telefone : ''}</div>
        </button>
    `).join('');
}

export function selecionarClienteCard(id) {
    document.getElementById('form-cliente-id').value = id;
    atualizarBotaoClienteSelecionado();
    atualizarProjetosDoCliente(id);
    closeClienteSelectorCard();
}

// Atualiza o texto do botão de seleção de cliente conforme o select oculto
export function atualizarBotaoClienteSelecionado() {
    const id = document.getElementById('form-cliente-id').value;
    const label = document.getElementById('btn-selecionar-cliente-label');
    const c = state.localClientes.find(x => String(x.id) === String(id));
    if (c) {
        label.textContent = `${c.nome}${c.cidade ? ' (' + c.cidade + ')' : ''}`;
        label.classList.remove('text-slate-400');
        label.classList.add('text-slate-900', 'font-semibold');
    } else {
        label.textContent = 'Selecionar cliente...';
        label.classList.add('text-slate-400');
        label.classList.remove('text-slate-900', 'font-semibold');
    }
}

export function populateClienteDropdown() {
    const select = document.getElementById('form-cliente-id');
    select.innerHTML = '';
    state.localClientes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.nome} (${c.cidade || 'Sem Cidade'})`;
        select.appendChild(opt);
    });
    if (!select.dataset.projetoListenerAttached) {
        select.addEventListener('change', () => atualizarProjetosDoCliente(select.value));
        select.dataset.projetoListenerAttached = '1';
    }
}
