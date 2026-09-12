// dashboard.js
// Renderiza os cards de métricas e os gráficos (Chart.js) da aba Dashboard.

import { state } from './state.js';
import { syncFromSupabase } from './supabase.js';

// Retorna 1 orçamento por cliente/projeto (o marcado como principal, ou o mais recente) para não duplicar contagem no dashboard
export function getOrcamentosDashboard() {
    const grupos = {};
    state.localOrcamentos.forEach(o => {
        const chave = o.projeto_id ? `p_${o.projeto_id}` : `c_${o.cliente_id}`;
        if (!grupos[chave]) grupos[chave] = [];
        grupos[chave].push(o);
    });
    return Object.values(grupos).map(lista => {
        if (lista.length === 1) return lista[0];
        const marcado = lista.find(o => o.principal);
        return marcado || lista[0];
    });
}

export function renderDashboard() {
    const orcamentosParaMetrica = getOrcamentosDashboard();
    const totalCount = orcamentosParaMetrica.length;
    const totalValue = orcamentosParaMetrica.reduce((acc, curr) => acc + (curr.valor_equipamentos + curr.valor_mao_de_obra + curr.valor_outros), 0);
    const approved = orcamentosParaMetrica.filter(o => o.status_comercial === 'Aprovado');
    const inProgress = orcamentosParaMetrica.filter(o => o.status_execucao === 'Em andamento').length;
    const conversionRate = totalCount > 0 ? Math.round((approved.length / totalCount) * 100) : 0;

    document.getElementById('metric-total-count').textContent = totalCount;
    document.getElementById('metric-total-value').textContent = totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('metric-conversion-rate').textContent = `${conversionRate}%`;
    document.getElementById('metric-in-progress').textContent = inProgress;

    const comercialCounts = { 'Em Negociação': 0, 'Aprovado': 0, 'Reprovado': 0, 'Expirado': 0 };
    const execucaoCounts = { 'A iniciar': 0, 'Em andamento': 0, 'Finalizado': 0 };

    orcamentosParaMetrica.forEach(o => {
        if (comercialCounts[o.status_comercial] !== undefined) comercialCounts[o.status_comercial]++;
        if (execucaoCounts[o.status_execucao] !== undefined) execucaoCounts[o.status_execucao]++;
    });

    if (state.chartInstanceComercial) state.chartInstanceComercial.destroy();
    if (state.chartInstanceExecucao) state.chartInstanceExecucao.destroy();

    const ctxComercial = document.getElementById('chartComercial').getContext('2d');
    state.chartInstanceComercial = new Chart(ctxComercial, {
        type: 'doughnut',
        data: {
            labels: Object.keys(comercialCounts),
            datasets: [{
                data: Object.values(comercialCounts),
                backgroundColor: ['#cbd5e1', '#10b981', '#ef4444', '#f59e0b'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    const ctxExecucao = document.getElementById('chartExecucao').getContext('2d');
    state.chartInstanceExecucao = new Chart(ctxExecucao, {
        type: 'bar',
        data: {
            labels: Object.keys(execucaoCounts),
            datasets: [{
                label: 'Obras',
                data: Object.values(execucaoCounts),
                backgroundColor: ['#64748b', '#f59e0b', '#10b981'],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

export async function marcarOrcamentoPrincipal(id) {
    const o = state.localOrcamentos.find(x => x.id === id);
    if (!o) return;
    const chaveGrupo = o.projeto_id ? `p_${o.projeto_id}` : `c_${o.cliente_id}`;
    const grupo = state.localOrcamentos.filter(x => (x.projeto_id ? `p_${x.projeto_id}` : `c_${x.cliente_id}`) === chaveGrupo);

    try {
        const idsParaDesmarcar = grupo.filter(x => x.id !== id && x.principal).map(x => x.id);
        if (idsParaDesmarcar.length > 0) {
            const { error: errDesmarcar } = await state.supabaseClient.from('orcamentos').update({ principal: false }).in('id', idsParaDesmarcar);
            if (errDesmarcar) throw errDesmarcar;
        }
        const { error } = await state.supabaseClient.from('orcamentos').update({ principal: true }).eq('id', id);
        if (error) throw error;
        await syncFromSupabase();
    } catch (err) {
        alert(err.message);
    }
}
