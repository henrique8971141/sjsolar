// cliente-autocomplete.js
// Componente global de "campo de cliente com busca": substitui o <select>
// tradicional em qualquer tela (Orçamento, Projetos, etc). Renderiza um
// input de texto + dropdown de resultados + opção "Criar novo cliente" que
// expande um mini-formulário completo (com CEP/IBGE) no próprio lugar.
//
// Uso: chamar initClienteAutocomplete(containerId, options) uma vez por
// instância. Cada instância guarda seu próprio estado num Map interno,
// indexado pelo id do container.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';
import { buscarEnderecoPorCep, getMunicipiosPorUf, buscarMunicipios, UFS } from './localizacao.js';

const instancias = new Map();

function fecharTodosOsDropdownsMenosEste(exceto) {
    instancias.forEach((inst, id) => {
        if (id !== exceto) {
            const dd = document.getElementById(inst.ids.dropdown);
            if (dd) dd.classList.add('hidden');
        }
    });
}

// options:
//   getClienteAtualId: () => id atualmente selecionado (ou '')
//   onSelect: (clienteId) => void  — chamado quando um cliente é escolhido/criado
export function initClienteAutocomplete(containerId, options) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const ids = {
        input: `${containerId}-input`,
        dropdown: `${containerId}-dropdown`,
        novoForm: `${containerId}-novo-form`,
        hiddenId: `${containerId}-hidden-id`
    };

    container.innerHTML = `
        <div class="relative">
            <input type="text" id="${ids.input}" autocomplete="off"
                placeholder="Digite o nome do cliente..."
                class="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-sm">
            <input type="hidden" id="${ids.hiddenId}">
            <div id="${ids.dropdown}" class="hidden absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"></div>
        </div>
        <div id="${ids.novoForm}" class="hidden mt-3 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase text-slate-600">Novo cliente</span>
                <button type="button" data-action="fechar-novo" class="text-slate-400 hover:text-slate-700"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" data-field="nome" placeholder="Nome / Razão Social *" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <input type="text" data-field="cpf_cnpj" placeholder="CPF / CNPJ" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <input type="text" data-field="telefone" placeholder="Telefone / WhatsApp" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <input type="email" data-field="email" placeholder="E-mail" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <input type="text" data-field="cep" placeholder="CEP *" maxlength="9" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <input type="text" data-field="endereco_completo" placeholder="Endereço *" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <input type="text" data-field="numero" placeholder="Número" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <input type="text" data-field="complemento" placeholder="Complemento" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <input type="text" data-field="bairro" placeholder="Bairro" class="px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <select data-field="estado" class="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                    <option value="">UF *</option>
                    ${UFS.map(uf => `<option value="${uf}">${uf}</option>`).join('')}
                </select>
                <div class="relative sm:col-span-2">
                    <input type="text" data-field="cidade" placeholder="Cidade *" autocomplete="off" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                    <div data-role="cidade-dropdown" class="hidden absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>
                </div>
                <textarea data-field="observacoes" placeholder="Observações" rows="2" class="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-sm"></textarea>
            </div>
            <p class="text-[11px] text-slate-400">* Campos essenciais.</p>
            <button type="button" data-action="salvar-novo" class="w-full py-2 bg-slate-900 text-white rounded-lg font-bold text-xs uppercase hover:bg-slate-800 transition-colors">Cadastrar e Selecionar</button>
        </div>
    `;

    const inst = { ids, options };
    instancias.set(containerId, inst);

    const input = document.getElementById(ids.input);
    const dropdown = document.getElementById(ids.dropdown);
    const novoForm = document.getElementById(ids.novoForm);

    input.addEventListener('focus', () => renderDropdown(containerId));
    input.addEventListener('input', () => renderDropdown(containerId));
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.classList.add('hidden');
            const cidadeDropdown = novoForm.querySelector('[data-role="cidade-dropdown"]');
            const cidadeField = novoForm.querySelector('[data-field="cidade"]');
            if (cidadeDropdown && !cidadeField.contains(e.target) && !cidadeDropdown.contains(e.target)) {
                cidadeDropdown.classList.add('hidden');
            }
        }
    });

    novoForm.querySelector('[data-action="fechar-novo"]').addEventListener('click', () => {
        novoForm.classList.add('hidden');
    });
    novoForm.querySelector('[data-action="salvar-novo"]').addEventListener('click', () => salvarNovoCliente(containerId));

    const cepField = novoForm.querySelector('[data-field="cep"]');
    cepField.addEventListener('blur', () => aplicarCep(containerId));

    const estadoField = novoForm.querySelector('[data-field="estado"]');
    const cidadeField = novoForm.querySelector('[data-field="cidade"]');
    estadoField.addEventListener('change', () => {
        cidadeField.value = '';
        if (estadoField.value) getMunicipiosPorUf(estadoField.value);
    });
    cidadeField.addEventListener('input', () => renderCidadeDropdown(containerId));
    cidadeField.addEventListener('focus', () => renderCidadeDropdown(containerId));

    // Estado inicial: se já existe um cliente selecionado (ex: editando), refletir no label
    refletirSelecaoAtual(containerId);

    return {
        refresh: () => refletirSelecaoAtual(containerId),
        getId: () => document.getElementById(ids.hiddenId).value
    };
}

function refletirSelecaoAtual(containerId) {
    const inst = instancias.get(containerId);
    if (!inst) return;
    const idAtual = inst.options.getClienteAtualId ? inst.options.getClienteAtualId() : '';
    const input = document.getElementById(inst.ids.input);
    const hidden = document.getElementById(inst.ids.hiddenId);
    if (!input || !hidden) return;
    hidden.value = idAtual || '';
    const c = state.localClientes.find(x => String(x.id) === String(idAtual));
    input.value = c ? c.nome : '';
}

function renderDropdown(containerId) {
    const inst = instancias.get(containerId);
    if (!inst) return;
    fecharTodosOsDropdownsMenosEste(containerId);

    const input = document.getElementById(inst.ids.input);
    const dropdown = document.getElementById(inst.ids.dropdown);
    const query = input.value.trim().toLowerCase();

    const filtrados = query
        ? state.localClientes.filter(c =>
            (c.nome && c.nome.toLowerCase().includes(query)) ||
            (c.cpf_cnpj && c.cpf_cnpj.toLowerCase().includes(query)) ||
            (c.telefone && c.telefone.toLowerCase().includes(query)))
        : state.localClientes;

    const itensHtml = filtrados.slice(0, 30).map(c => `
        <button type="button" data-cliente-id="${c.id}"
            class="w-full text-left px-3 py-2 hover:bg-amber-50 border-b border-slate-100 last:border-0 transition-colors">
            <div class="font-bold text-slate-900 text-sm">${c.nome}</div>
            <div class="text-xs text-slate-500">${c.cpf_cnpj || 'Sem documento'}${c.telefone ? ' • ' + c.telefone : ''}</div>
        </button>
    `).join('');

    const criarNovoHtml = `
        <button type="button" data-action="abrir-novo"
            class="w-full text-left px-3 py-2.5 text-amber-600 font-bold text-sm hover:bg-amber-50 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-user-plus"></i> Criar novo cliente
        </button>
    `;

    dropdown.innerHTML = (filtrados.length === 0
        ? `<div class="text-sm text-slate-400 text-center py-4">Nenhum cliente encontrado.</div>`
        : itensHtml) + criarNovoHtml;

    dropdown.querySelectorAll('[data-cliente-id]').forEach(btn => {
        btn.addEventListener('click', () => selecionarCliente(containerId, btn.dataset.clienteId));
    });
    dropdown.querySelector('[data-action="abrir-novo"]').addEventListener('click', () => {
        dropdown.classList.add('hidden');
        const novoForm = document.getElementById(inst.ids.novoForm);
        novoForm.classList.remove('hidden');
        novoForm.querySelector('[data-field="nome"]').value = input.value.trim();
        novoForm.querySelector('[data-field="nome"]').focus();
    });

    dropdown.classList.remove('hidden');
}

function selecionarCliente(containerId, clienteId) {
    const inst = instancias.get(containerId);
    if (!inst) return;
    document.getElementById(inst.ids.hiddenId).value = clienteId;
    refletirSelecaoAtual(containerId);
    document.getElementById(inst.ids.dropdown).classList.add('hidden');
    if (inst.options.onSelect) inst.options.onSelect(clienteId);
}

async function aplicarCep(containerId) {
    const inst = instancias.get(containerId);
    if (!inst) return;
    const novoForm = document.getElementById(inst.ids.novoForm);
    const cepField = novoForm.querySelector('[data-field="cep"]');
    const endereco = await buscarEnderecoPorCep(cepField.value);
    if (!endereco) return; // CEP inválido/não encontrado: segue com preenchimento manual

    if (endereco.logradouro) novoForm.querySelector('[data-field="endereco_completo"]').value = endereco.logradouro;
    if (endereco.bairro) novoForm.querySelector('[data-field="bairro"]').value = endereco.bairro;
    if (endereco.uf) {
        const estadoField = novoForm.querySelector('[data-field="estado"]');
        estadoField.value = endereco.uf;
        await getMunicipiosPorUf(endereco.uf);
    }
    if (endereco.cidade) novoForm.querySelector('[data-field="cidade"]').value = endereco.cidade;
}

async function renderCidadeDropdown(containerId) {
    const inst = instancias.get(containerId);
    if (!inst) return;
    const novoForm = document.getElementById(inst.ids.novoForm);
    const estadoField = novoForm.querySelector('[data-field="estado"]');
    const cidadeField = novoForm.querySelector('[data-field="cidade"]');
    const cidadeDropdown = novoForm.querySelector('[data-role="cidade-dropdown"]');

    if (!estadoField.value) {
        cidadeDropdown.innerHTML = '<div class="text-xs text-slate-400 px-3 py-2">Selecione a UF primeiro.</div>';
        cidadeDropdown.classList.remove('hidden');
        return;
    }

    const resultados = await buscarMunicipios(estadoField.value, cidadeField.value);
    if (resultados.length === 0) {
        cidadeDropdown.innerHTML = '<div class="text-xs text-slate-400 px-3 py-2">Nenhuma cidade encontrada.</div>';
    } else {
        cidadeDropdown.innerHTML = resultados.map(nome => `
            <button type="button" data-cidade="${nome}" class="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors">${nome}</button>
        `).join('');
        cidadeDropdown.querySelectorAll('[data-cidade]').forEach(btn => {
            btn.addEventListener('click', () => {
                cidadeField.value = btn.dataset.cidade;
                cidadeDropdown.classList.add('hidden');
            });
        });
    }
    cidadeDropdown.classList.remove('hidden');
}

async function salvarNovoCliente(containerId) {
    const inst = instancias.get(containerId);
    if (!inst) return;
    const novoForm = document.getElementById(inst.ids.novoForm);

    const campo = (nome) => novoForm.querySelector(`[data-field="${nome}"]`).value.trim();
    const nome = campo('nome');
    const cep = campo('cep');
    const endereco_completo = campo('endereco_completo');
    const estado = campo('estado');
    const cidade = campo('cidade');

    if (!nome) { alert('Nome / Razão Social é obrigatório.'); return; }
    if (!cep) { alert('CEP é obrigatório.'); return; }
    if (!endereco_completo) { alert('Endereço é obrigatório.'); return; }
    if (!estado) { alert('UF é obrigatória.'); return; }
    if (!cidade) { alert('Cidade é obrigatória.'); return; }

    const payload = {
        nome,
        cpf_cnpj: campo('cpf_cnpj'),
        telefone: campo('telefone'),
        email: campo('email'),
        cep,
        endereco_completo,
        numero: campo('numero'),
        complemento: campo('complemento'),
        bairro: campo('bairro'),
        estado,
        cidade,
        observacoes: campo('observacoes')
    };

    try {
        const { data, error } = await state.supabaseClient
            .from('clientes')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;

        await syncFromSupabase();
        novoForm.classList.add('hidden');
        novoForm.querySelectorAll('input, textarea, select').forEach(el => { el.value = ''; });
        selecionarCliente(containerId, data.id);
    } catch (err) {
        alert('Erro ao cadastrar cliente: ' + err.message);
    }
}
