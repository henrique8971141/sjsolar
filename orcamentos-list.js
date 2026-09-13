// orcamentos-list.js
// Listagem e filtro de orçamentos na aba "Orçamentos": busca, filtro por
// status, agrupamento por projeto (expansível). A parte de editor/formulário
// do orçamento fica em orcamentos.js.
//
// Observação sobre imports: funções como viewOrcamento, exportToPDF,
// exportToDOCX, editOrcamento, deleteOrcamento e marcarOrcamentoPrincipal
// são chamadas aqui apenas dentro de atributos onclick="..." do HTML gerado
// como string. O próprio navegador resolve esses nomes em `window` no
// momento do clique — por isso main.js precisa expô-los em window, mas este
// arquivo não precisa importá-los.

import { state } from './state.js';
import { calcularTotalOrcamento } from './utils.js';

// Um orçamento é expirado se a validade já passou e ele não foi finalizado
export function isOrcamentoExpirado(o) {
    if (!o.validade_proposta) return false;
    if (o.status_execucao === 'Finalizado') return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const validade = new Date(o.validade_proposta + 'T00:00:00');
    return validade < hoje;
}

export function setFiltroOrcamento(filtro) {
    state.filtroOrcamentoAtivo = filtro;
    document.querySelectorAll('.filtro-chip').forEach(btn => {
        if (btn.dataset.filtro === filtro) {
            btn.className = "filtro-chip px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-900 text-white transition-colors";
        } else {
            btn.className = "filtro-chip px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors";
        }
    });
    renderOrcamentos();
}

export function renderOrcamentos() {
    const query = document.getElementById('search-orcamentos').value.toLowerCase();
    const listBody = document.getElementById('orcamentos-list-body');
    listBody.innerHTML = '';

    const filtered = state.localOrcamentos.filter(o => {
        const matchQuery = (o.numero_orcamento && o.numero_orcamento.toLowerCase().includes(query)) ||
            (o.cliente_nome && o.cliente_nome.toLowerCase().includes(query));
        if (!matchQuery) return false;

        if (state.filtroOrcamentoAtivo === 'todos') return true;
        if (state.filtroOrcamentoAtivo === 'expirado') return isOrcamentoExpirado(o);
        if (state.filtroOrcamentoAtivo === 'a_iniciar') return o.status_execucao === 'A iniciar' && !isOrcamentoExpirado(o);
        if (state.filtroOrcamentoAtivo === 'em_andamento') return o.status_execucao === 'Em andamento' && !isOrcamentoExpirado(o);
        if (state.filtroOrcamentoAtivo === 'finalizado') return o.status_execucao === 'Finalizado';
        return true;
    });

    // Separar orçamentos com projeto (agrupados) dos sem projeto (linha normal)
    const comProjeto = {};
    const semProjeto = [];
    filtered.forEach(o => {
        if (o.projeto_id) {
            if (!comProjeto[o.projeto_id]) comProjeto[o.projeto_id] = [];
            comProjeto[o.projeto_id].push(o);
        } else {
            semProjeto.push(o);
        }
    });

    function renderLinhaOrcamento(o, dentroDeGrupo) {
        const { total } = calcularTotalOrcamento(o);
        const chaveGrupo = o.projeto_id ? `p_${o.projeto_id}` : `c_${o.cliente_id}`;
        const grupoCount = state.localOrcamentos.filter(x => (x.projeto_id ? `p_${x.projeto_id}` : `c_${x.cliente_id}`) === chaveGrupo).length;
        const estrelaHtml = grupoCount > 1
            ? `<button onclick="marcarOrcamentoPrincipal('${o.id}')" title="${o.principal ? 'Principal' : 'Marcar como principal'}" class="p-1.5 ${o.principal ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'} transition-colors"><i class="fa-solid fa-star"></i></button>`
            : '';

        let badgeComercial = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">${o.status_comercial}</span>`;
        if (o.status_comercial === 'Aprovado') badgeComercial = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">${o.status_comercial}</span>`;
        if (o.status_comercial === 'Reprovado') badgeComercial = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">${o.status_comercial}</span>`;
        if (o.status_comercial === 'Expirado') badgeComercial = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">${o.status_comercial}</span>`;

        let badgeExecucao = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">${o.status_execucao}</span>`;
        if (o.status_execucao === 'Em andamento') badgeExecucao = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">${o.status_execucao}</span>`;
        if (o.status_execucao === 'Finalizado') badgeExecucao = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">${o.status_execucao}</span>`;
        if (isOrcamentoExpirado(o)) badgeExecucao = `<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">Expirado</span>`;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors" + (dentroDeGrupo ? " bg-slate-50/60" : "");
        tr.innerHTML = `
            <td class="px-6 py-4 font-mono font-bold text-slate-700">${dentroDeGrupo ? '<span class="inline-block w-4"></span>' : ''}${o.numero_orcamento || 'S/N'}</td>
            <td class="px-6 py-4">
                <div class="font-bold text-slate-900">${o.cliente_nome}</div>
                <div class="text-xs text-slate-400">${o.cliente_cidade || ''}-${o.cliente_estado || ''}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-slate-700 font-medium">${o.tipo_servico_detalhado}</div>
                <div class="text-[11px] text-slate-400 font-mono">${o.tipo_orcamento}</div>
            </td>
            <td class="px-6 py-4 text-right font-bold text-slate-950">${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td class="px-6 py-4 text-center">${badgeComercial}</td>
            <td class="px-6 py-4 text-center">${badgeExecucao}</td>
            <td class="px-6 py-4 text-center space-x-1 whitespace-nowrap">
                ${estrelaHtml}
                <button onclick="viewOrcamento('${o.id}')" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors" title="Visualizar"><i class="fa-solid fa-eye"></i></button>
                <button onclick="exportToPDF('${o.id}')" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Exportar PDF"><i class="fa-solid fa-file-pdf text-base"></i></button>
                <button onclick="exportToDOCX('${o.id}')" class="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Exportar Word (.docx)"><i class="fa-solid fa-file-word text-base"></i></button>
                <button onclick="editOrcamento('${o.id}')" class="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"><i class="fa-solid fa-pen-to-square"></i></button>

                <button onclick="deleteOrcamento('${o.id}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        `;
        return tr;
    }

    // Cards de projeto (agrupados, expansíveis via V)
    Object.keys(comProjeto).forEach(projetoId => {
        const orcamentosDoProjeto = comProjeto[projetoId];
        const projeto = state.localProjetos.find(p => String(p.id) === String(projetoId));
        const totalProjeto = orcamentosDoProjeto.reduce((acc, o) => acc + calcularTotalOrcamento(o).total, 0);
        const expandido = state.projetosExpandidos.has(projetoId);

        const trGrupo = document.createElement('tr');
        trGrupo.className = "bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer";
        trGrupo.onclick = () => toggleProjetoExpandido(projetoId);
        trGrupo.innerHTML = `
            <td colspan="3" class="px-6 py-3">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-chevron-${expandido ? 'down' : 'right'} text-slate-400 text-xs transition-transform"></i>
                    <i class="fa-solid fa-diagram-project text-amber-500"></i>
                    <span class="font-bold text-slate-800">${projeto ? projeto.nome : 'Projeto'}</span>
                    <span class="text-xs text-slate-400">${projeto ? projeto.cliente_nome : ''} · ${orcamentosDoProjeto.length} orçamento(s)</span>
                </div>
            </td>
            <td class="px-6 py-3 text-right font-bold text-slate-950">${totalProjeto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td colspan="3" class="px-6 py-3"></td>
        `;
        listBody.appendChild(trGrupo);

        if (expandido) {
            orcamentosDoProjeto.forEach(o => listBody.appendChild(renderLinhaOrcamento(o, true)));
        }
    });

    // Orçamentos sem projeto (linhas normais)
    semProjeto.forEach(o => listBody.appendChild(renderLinhaOrcamento(o, false)));
}

// Controla quais cards de projeto estão expandidos na listagem de orçamentos
export function toggleProjetoExpandido(projetoId) {
    if (state.projetosExpandidos.has(projetoId)) {
        state.projetosExpandidos.delete(projetoId);
    } else {
        state.projetosExpandidos.add(projetoId);
    }
    renderOrcamentos();
}
