// clientes.js
// CRUD de clientes (listagem, edição inline com CEP/IBGE). O antigo
// card de seleção de cliente (modal separado) foi substituído pelo
// componente global de autocomplete em cliente-autocomplete.js — este
// arquivo cuida só da aba "Clientes".

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { buscarEnderecoPorCep, getMunicipiosPorUf, buscarMunicipios, UFS } from './localizacao.js';

// Filtra os clientes pelo texto digitado na busca (nome, CPF/CNPJ,
// telefone ou e-mail) — mesmo critério já usado pelo autocomplete global
// em cliente-autocomplete.js, para manter os dois consistentes.
function filtrarClientes(query) {
    const termo = String(query || '').trim().toLowerCase();
    if (!termo) return state.localClientes;
    return state.localClientes.filter(c =>
        (c.nome && c.nome.toLowerCase().includes(termo)) ||
        (c.cpf_cnpj && c.cpf_cnpj.toLowerCase().includes(termo)) ||
        (c.telefone && c.telefone.toLowerCase().includes(termo)) ||
        (c.email && c.email.toLowerCase().includes(termo))
    );
}

export function renderClientes() {
    const grid = document.getElementById('clientes-cards-grid');
    if (!grid) return;

    const buscaField = document.getElementById('cli-busca');
    const clientesFiltrados = filtrarClientes(buscaField ? buscaField.value : '');

    grid.innerHTML = '';

    if (state.localClientes.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
                Nenhum cliente cadastrado ainda.
            </div>
        `;
        return;
    }

    if (clientesFiltrados.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
                Nenhum cliente encontrado para essa busca.
            </div>
        `;
        return;
    }

    clientesFiltrados.forEach(c => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-xl border border-slate-200 shadow-xs p-5 hover:border-amber-400 hover:shadow-md transition-all";
        card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <h4 class="font-bold text-slate-900 leading-snug">${c.nome}</h4>
                <div class="shrink-0 flex gap-1">
                    <button onclick="editCliente('${c.id}')" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteCliente('${c.id}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
            <p class="text-xs text-slate-400 mt-1">${c.cpf_cnpj || 'Sem CPF/CNPJ cadastrado'}</p>
            <div class="mt-3 pt-3 border-t border-slate-100 space-y-1 text-sm">
                <p class="text-slate-600"><i class="fa-solid fa-phone w-4 text-slate-400"></i> ${c.telefone || 'Sem telefone'}</p>
                <p class="text-slate-600"><i class="fa-solid fa-envelope w-4 text-slate-400"></i> ${c.email || 'Sem e-mail'}</p>
                <p class="text-xs text-slate-400 mt-1">${c.cidade || ''}${c.cidade && c.estado ? '-' : ''}${c.estado || ''}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Popula o <select> de UF da aba Clientes e liga CEP/IBGE (roda uma vez)
export function initClientesTabUfSelect() {
    const select = document.getElementById('cli-estado');
    if (!select || select.dataset.populated) return;
    UFS.forEach(uf => {
        const opt = document.createElement('option');
        opt.value = uf;
        opt.textContent = uf;
        select.appendChild(opt);
    });
    select.dataset.populated = '1';

    select.addEventListener('change', () => {
        document.getElementById('cli-cidade').value = '';
        if (select.value) getMunicipiosPorUf(select.value);
    });

    const cepField = document.getElementById('cli-cep');
    cepField.addEventListener('blur', async () => {
        const endereco = await buscarEnderecoPorCep(cepField.value);
        if (!endereco) return;
        if (endereco.logradouro) document.getElementById('cli-endereco').value = endereco.logradouro;
        if (endereco.bairro) document.getElementById('cli-bairro').value = endereco.bairro;
        if (endereco.uf) {
            select.value = endereco.uf;
            await getMunicipiosPorUf(endereco.uf);
        }
        if (endereco.cidade) document.getElementById('cli-cidade').value = endereco.cidade;
    });

    const cidadeField = document.getElementById('cli-cidade');
    const cidadeDropdown = document.getElementById('cli-cidade-dropdown');
    const renderCidades = async () => {
        if (!select.value) {
            cidadeDropdown.innerHTML = '<div class="text-xs text-slate-400 px-3 py-2">Selecione a UF primeiro.</div>';
            cidadeDropdown.classList.remove('hidden');
            return;
        }
        const resultados = await buscarMunicipios(select.value, cidadeField.value);
        cidadeDropdown.innerHTML = resultados.length === 0
            ? '<div class="text-xs text-slate-400 px-3 py-2">Nenhuma cidade encontrada.</div>'
            : resultados.map(nome => `<button type="button" data-cidade="${nome}" class="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">${nome}</button>`).join('');
        cidadeDropdown.querySelectorAll('[data-cidade]').forEach(btn => {
            btn.addEventListener('click', () => {
                cidadeField.value = btn.dataset.cidade;
                cidadeDropdown.classList.add('hidden');
            });
        });
        cidadeDropdown.classList.remove('hidden');
    };
    cidadeField.addEventListener('focus', renderCidades);
    cidadeField.addEventListener('input', renderCidades);
    document.addEventListener('click', (e) => {
        if (!cidadeField.contains(e.target) && !cidadeDropdown.contains(e.target)) {
            cidadeDropdown.classList.add('hidden');
        }
    });

    // Busca por texto na listagem de clientes (Etapa 2.1). Basta re-renderizar
    // os cards a cada tecla — a lista já vem inteira do cache local em state.
    const buscaField = document.getElementById('cli-busca');
    if (buscaField) {
        buscaField.addEventListener('input', renderClientes);
    }
}

export function editCliente(id) {
    const c = state.localClientes.find(x => String(x.id) === String(id));
    if (!c) return;
    state.editingClienteId = id;
    document.getElementById('cli-nome').value = c.nome || '';
    document.getElementById('cli-cpf-cnpj').value = c.cpf_cnpj || '';
    document.getElementById('cli-telefone').value = c.telefone || '';
    document.getElementById('cli-email').value = c.email || '';
    document.getElementById('cli-cep').value = c.cep || '';
    document.getElementById('cli-endereco').value = c.endereco_completo || '';
    document.getElementById('cli-numero').value = c.numero || '';
    document.getElementById('cli-complemento').value = c.complemento || '';
    document.getElementById('cli-bairro').value = c.bairro || '';
    document.getElementById('cli-estado').value = c.estado || '';
    document.getElementById('cli-cidade').value = c.cidade || '';
    document.getElementById('cli-observacoes').value = c.observacoes || '';

    document.getElementById('btn-save-cliente').textContent = 'Salvar Alterações';
    document.getElementById('btn-cancel-cliente').classList.remove('hidden');
    document.getElementById('cli-nome').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function cancelEditCliente() {
    state.editingClienteId = null;
    ['cli-nome', 'cli-cpf-cnpj', 'cli-telefone', 'cli-email', 'cli-cep', 'cli-endereco',
        'cli-numero', 'cli-complemento', 'cli-bairro', 'cli-estado', 'cli-cidade', 'cli-observacoes'
    ].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('btn-save-cliente').textContent = 'Cadastrar Novo Cliente';
    document.getElementById('btn-cancel-cliente').classList.add('hidden');
}

export async function saveQuickCliente() {
    const nome = document.getElementById('cli-nome').value.trim();
    const cep = document.getElementById('cli-cep').value.trim();
    const endereco_completo = document.getElementById('cli-endereco').value.trim();
    const estado = document.getElementById('cli-estado').value.trim();
    const cidade = document.getElementById('cli-cidade').value.trim();

    if (!nome) { alert("Nome / Razão Social é obrigatório."); return; }
    if (!estado) { alert("UF é obrigatória."); return; }
    if (!cidade) { alert("Cidade é obrigatória."); return; }

    const payload = {
        nome,
        cpf_cnpj: document.getElementById('cli-cpf-cnpj').value.trim(),
        telefone: document.getElementById('cli-telefone').value.trim(),
        email: document.getElementById('cli-email').value.trim(),
        cep,
        endereco_completo,
        numero: document.getElementById('cli-numero').value.trim(),
        complemento: document.getElementById('cli-complemento').value.trim(),
        bairro: document.getElementById('cli-bairro').value.trim(),
        estado,
        cidade,
        observacoes: document.getElementById('cli-observacoes').value.trim()
    };

    try {
        if (state.editingClienteId) {
            const { error } = await state.supabaseClient
                .from('clientes')
                .update(payload)
                .eq('id', state.editingClienteId);
            if (error) throw error;
        } else {
            const { error } = await state.supabaseClient
                .from('clientes')
                .insert(payload);
            if (error) throw error;
        }

        cancelEditCliente();
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}

export async function deleteCliente(id) {
    // O banco já garante isso via ON DELETE CASCADE nas FKs de projetos e
    // orçamentos para clientes — o aviso abaixo só informa o usuário do que
    // vai acontecer, a exclusão em si não precisa de checagem manual aqui.
    if (!confirm("Isso removerá também todos os projetos e orçamentos vinculados a este cliente. Confirmar?")) return;
    try {
        const { error } = await state.supabaseClient.from('clientes').delete().eq('id', id);
        if (error) throw error;
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}
