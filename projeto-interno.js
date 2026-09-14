// projeto-interno.js
// Área interna do projeto (Etapa 2). Reúne as 3 sub-telas de um projeto já
// aberto (identificado por state.projetoAtualId): Orçamentos, Documentos e
// Informações do Cliente. Nesta etapa, criação de orçamento/proposta,
// criação de documento e edição completa do cliente/exclusão de projeto
// ficam apenas com a ESTRUTURA preparada — a lógica completa é da Etapa 3.

import { state } from './state.js';
import { calcularTotalOrcamento } from './utils.js';
import { isOrcamentoExpirado } from './orcamentos-list.js';
import { switchTab } from './ui.js';
import { editCliente } from './clientes.js';
import { deleteProjeto, voltarParaProjetos } from './projetos.js';

// ------------------------------------------------------------------
// Cabeçalho: qual projeto está aberto
// ------------------------------------------------------------------
export function renderProjetoInternoHeader() {
    const projeto = getProjetoAtual();
    if (!projeto) return;
    document.getElementById('projeto-interno-nome').textContent = `Projeto: ${projeto.nome}`;
    document.getElementById('projeto-interno-cliente').textContent = `Cliente: ${projeto.cliente_nome || 'Sem cliente'}`;
}

function getProjetoAtual() {
    return state.localProjetos.find(p => String(p.id) === String(state.projetoAtualId)) || null;
}

function getClienteDoProjetoAtual() {
    const projeto = getProjetoAtual();
    if (!projeto) return null;
    return state.localClientes.find(c => String(c.id) === String(projeto.cliente_id)) || null;
}

// ------------------------------------------------------------------
// Navegação interna: ORÇAMENTOS | DOCUMENTOS | INFORMAÇÕES DO CLIENTE
// ------------------------------------------------------------------
const SUBNAV_ATIVO = "projeto-subnav-link px-4 py-2.5 font-bold text-xs uppercase tracking-wider border-b-2 -mb-px border-amber-500 text-slate-900 transition-colors";
const SUBNAV_INATIVO = "projeto-subnav-link px-4 py-2.5 font-bold text-xs uppercase tracking-wider border-b-2 -mb-px border-transparent text-slate-400 hover:text-slate-700 transition-colors";

export function switchProjetoSubTab(tab) {
    state.projetoInternoSubTab = tab;

    const paineis = {
        orcamentos: document.getElementById('projeto-sub-orcamentos'),
        documentos: document.getElementById('projeto-sub-documentos'),
        cliente: document.getElementById('projeto-sub-cliente')
    };
    const botoes = {
        orcamentos: document.getElementById('subnav-orcamentos'),
        documentos: document.getElementById('subnav-documentos'),
        cliente: document.getElementById('subnav-cliente')
    };

    Object.keys(paineis).forEach(key => {
        paineis[key].classList.toggle('hidden', key !== tab);
        botoes[key].className = key === tab ? SUBNAV_ATIVO : SUBNAV_INATIVO;
    });

    if (tab === 'orcamentos') renderProjetoSubOrcamentos();
    if (tab === 'documentos') renderProjetoSubDocumentos();
    if (tab === 'cliente') renderProjetoSubCliente();
}

// Chamado após uma sincronização com o Supabase, para manter a área interna
// atualizada caso o usuário esteja com um projeto aberto no momento.
export function refreshProjetoInternoSeAberto() {
    if (!state.projetoAtualId) return;
    renderProjetoInternoHeader();
    switchProjetoSubTab(state.projetoInternoSubTab);
}

// ------------------------------------------------------------------
// Bloco de "estado vazio" reutilizado por Orçamentos e Documentos
// ------------------------------------------------------------------
function estadoVazioHtml(titulo, onclickAction) {
    return `
        <div class="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <p class="font-bold text-slate-500 uppercase tracking-wider text-sm">${titulo}</p>
            <p onclick="${onclickAction}" class="mt-2 inline-block text-amber-600 hover:text-amber-700 font-bold uppercase tracking-wider text-sm cursor-pointer underline underline-offset-2">
                Clique aqui para criar
            </p>
        </div>
    `;
}

// ------------------------------------------------------------------
// ORÇAMENTOS (do projeto atual)
// ------------------------------------------------------------------
export function renderProjetoSubOrcamentos() {
    const container = document.getElementById('projeto-sub-orcamentos');
    if (!container) return;

    const orcamentosDoProjeto = state.localOrcamentos.filter(
        o => String(o.projeto_id) === String(state.projetoAtualId)
    );

    if (orcamentosDoProjeto.length === 0) {
        container.innerHTML = estadoVazioHtml('Nenhum orçamento/proposta criado', 'criarOrcamentoDoProjetoAtual()');
        return;
    }

    const linhas = orcamentosDoProjeto.map(o => {
        const { total } = calcularTotalOrcamento(o);
        let badgeExecucao = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">${o.status_execucao}</span>`;
        if (o.status_execucao === 'Em andamento') badgeExecucao = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">${o.status_execucao}</span>`;
        if (o.status_execucao === 'Finalizado') badgeExecucao = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">${o.status_execucao}</span>`;
        if (isOrcamentoExpirado(o)) badgeExecucao = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">Expirado</span>`;

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4 font-mono font-bold text-slate-700">${o.numero_orcamento || 'S/N'}</td>
                <td class="px-6 py-4 text-slate-700">${o.tipo_servico_detalhado || ''}</td>
                <td class="px-6 py-4 text-right font-bold text-slate-950">${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td class="px-6 py-4 text-center">${badgeExecucao}</td>
                <td class="px-6 py-4 text-center space-x-1 whitespace-nowrap">
                    <button onclick="viewOrcamento('${o.id}')" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors" title="Visualizar"><i class="fa-solid fa-eye"></i></button>
                    <button onclick="exportToPDF('${o.id}')" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Exportar PDF"><i class="fa-solid fa-file-pdf text-base"></i></button>
                    <button onclick="exportToDOCX('${o.id}')" class="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Exportar Word (.docx)"><i class="fa-solid fa-file-word text-base"></i></button>
                    <button onclick="editOrcamento('${o.id}')" class="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button onclick="deleteOrcamento('${o.id}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="flex justify-end">
            <button type="button" onclick="criarOrcamentoDoProjetoAtual()" class="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold text-xs uppercase hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-plus mr-1"></i> Criar orçamento/proposta
            </button>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table class="w-full text-left border-collapse text-sm">
                <thead>
                    <tr class="bg-slate-100 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                        <th class="px-6 py-4">Número</th>
                        <th class="px-6 py-4">Serviço</th>
                        <th class="px-6 py-4 text-right">Valor</th>
                        <th class="px-6 py-4 text-center">Status</th>
                        <th class="px-6 py-4 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
    `;
}

// Handler preparado para a Etapa 3 (criação completa de orçamento/proposta
// vinculado ao projeto atual). A lógica de criação ainda não existe.
export function criarOrcamentoDoProjetoAtual() {
    // Etapa 3: abrir o editor de orçamento já vinculado a state.projetoAtualId.
}

// ------------------------------------------------------------------
// DOCUMENTOS (do projeto atual)
// ------------------------------------------------------------------
export function renderProjetoSubDocumentos() {
    const container = document.getElementById('projeto-sub-documentos');
    if (!container) return;

    // Etapa 2: ainda não existe cadastro de documentos — estrutura preparada
    // para a Etapa 3/5, sempre em estado vazio por enquanto.
    container.innerHTML = estadoVazioHtml('Nenhum documento criado', 'criarDocumentoDoProjetoAtual()');
}

// Handler preparado para a Etapa 3/5 (criação de documentos a partir de
// templates com substituição de variáveis). Ainda sem lógica.
export function criarDocumentoDoProjetoAtual() {
    // Etapa 3/5: abrir a criação de documento vinculada a state.projetoAtualId.
}

// ------------------------------------------------------------------
// INFORMAÇÕES DO CLIENTE (do projeto atual)
// ------------------------------------------------------------------
export function renderProjetoSubCliente() {
    const container = document.getElementById('projeto-sub-cliente');
    if (!container) return;

    const projeto = getProjetoAtual();
    const cliente = getClienteDoProjetoAtual();

    if (!cliente) {
        container.innerHTML = `
            <div class="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
                Nenhum cliente vinculado a este projeto.
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
                <h4 class="font-bold text-slate-700 text-xs uppercase tracking-wider mb-3">Resumo</h4>
                <p class="text-lg font-bold text-slate-900">${cliente.nome}</p>
                <p class="text-sm text-slate-500">${projeto ? 'Responsável do projeto: ' + (projeto.responsavel || '-') : ''}</p>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
                <h4 class="font-bold text-slate-700 text-xs uppercase tracking-wider mb-3">Dados Gerais</h4>
                <dl class="space-y-1.5 text-sm">
                    <div class="flex justify-between"><dt class="text-slate-400">Telefone</dt><dd class="text-slate-800 font-medium">${cliente.telefone || '-'}</dd></div>
                    <div class="flex justify-between"><dt class="text-slate-400">E-mail</dt><dd class="text-slate-800 font-medium">${cliente.email || '-'}</dd></div>
                </dl>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 md:col-span-2">
                <h4 class="font-bold text-slate-700 text-xs uppercase tracking-wider mb-3">Localização</h4>
                <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><dt class="text-slate-400 text-xs">Endereço</dt><dd class="text-slate-800 font-medium">${cliente.endereco_completo || '-'}${cliente.numero ? ', ' + cliente.numero : ''}</dd></div>
                    <div><dt class="text-slate-400 text-xs">CEP</dt><dd class="text-slate-800 font-medium">${cliente.cep || '-'}</dd></div>
                    <div><dt class="text-slate-400 text-xs">Cidade</dt><dd class="text-slate-800 font-medium">${cliente.cidade || '-'}</dd></div>
                    <div><dt class="text-slate-400 text-xs">UF</dt><dd class="text-slate-800 font-medium">${cliente.estado || '-'}</dd></div>
                </dl>
            </div>

            <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 md:col-span-2">
                <h4 class="font-bold text-slate-700 text-xs uppercase tracking-wider mb-3">Ações administrativas</h4>
                <div class="flex flex-wrap gap-2">
                    <button type="button" onclick="editProjetoPage('${projeto.id}')" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold text-xs uppercase hover:bg-slate-300 transition-colors">
                        <i class="fa-solid fa-pen mr-1"></i> Editar Projeto
                    </button>
                    <button type="button" onclick="editarClienteDoProjetoAtual()" class="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold text-xs uppercase hover:bg-slate-300 transition-colors">
                        <i class="fa-solid fa-pen mr-1"></i> Editar Informações do Cliente
                    </button>
                    <button type="button" onclick="excluirProjetoAtual()" class="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold text-xs uppercase hover:bg-red-100 transition-colors">
                        <i class="fa-solid fa-trash-can mr-1"></i> Excluir Projeto
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Reaproveita o formulário de edição de cliente já existente na aba
// "Clientes" (Etapa 1): leva o usuário até lá com o cliente já carregado
// para edição, em vez de duplicar um formulário novo aqui.
export function editarClienteDoProjetoAtual() {
    const cliente = getClienteDoProjetoAtual();
    if (!cliente) return;
    switchTab('clientes-tab');
    editCliente(cliente.id);
}

// Reaproveita a exclusão de projeto já existente (Etapa 1), incluindo a
// confirmação e a remoção no Supabase, e volta para a listagem de projetos
// caso a exclusão seja concluída.
export async function excluirProjetoAtual() {
    if (!state.projetoAtualId) return;
    const idAlvo = state.projetoAtualId;
    await deleteProjeto(idAlvo);
    const aindaExiste = state.localProjetos.some(p => String(p.id) === String(idAlvo));
    if (!aindaExiste) {
        voltarParaProjetos();
    }
}
