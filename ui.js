// ui.js
// Controles de interface que não pertencem a nenhum domínio específico:
// alternância de abas e recolhimento da sidebar.

import { state } from './state.js';

export function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');

    const tabs = ['dashboard-tab', 'orcamentos-tab', 'clientes-tab', 'produtos-tab'];
    tabs.forEach(t => {
        const btn = document.getElementById(`nav-${t}`);
        if (t === tabId) {
            btn.className = "sidebar-link flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-bold bg-amber-400 text-slate-950";
        } else {
            btn.className = "sidebar-link flex items-center gap-2.5 px-2.5 py-2 rounded-lg font-bold text-slate-300 hover:text-white hover:bg-slate-800";
        }
    });
}

// Colapsa/expande a sidebar (estilo ERP), lembrando a preferência na sessão
export function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    const aside = document.getElementById('app-sidebar');
    const icon = document.getElementById('sidebar-toggle-icon');
    const brandText = document.getElementById('sidebar-brand-text');
    const labels = document.querySelectorAll('.sidebar-label');

    if (state.sidebarCollapsed) {
        aside.classList.remove('w-56');
        aside.classList.add('w-14');
        icon.classList.remove('fa-angles-left');
        icon.classList.add('fa-angles-right');
        brandText.classList.add('hidden');
        labels.forEach(l => l.classList.add('hidden'));
    } else {
        aside.classList.remove('w-14');
        aside.classList.add('w-56');
        icon.classList.remove('fa-angles-right');
        icon.classList.add('fa-angles-left');
        brandText.classList.remove('hidden');
        labels.forEach(l => l.classList.remove('hidden'));
    }
}
