// main.js
// Ponto de entrada do SJ SOLAR. Importa todos os módulos, inicializa o
// Supabase ao carregar a página, e expõe em `window` todas as funções que
// são chamadas via onclick="..."/onchange="..."/oninput=".../onsubmit="..."
// no HTML (o próprio HTML é gerado como string em vários pontos, então o
// browser só consegue resolver esses nomes através do objeto global window).

import { initSupabase } from './supabase.js';

// ---- ui.js ----
import { switchTab, toggleSidebar } from './ui.js';

// ---- orcamentos.js (editor/formulário do orçamento) ----
import {
    handleValidadeChange,
    updateFormTotal,
    aplicarArredondamento,
    openOrcamentoModal,
    closeOrcamentoEditor,
    openInlineClienteForm,
    closeInlineClienteForm,
    saveInlineCliente,
    handleFormSubmit,
    viewOrcamento,
    habilitarEdicaoOrcamento,
    editOrcamento,
    deleteOrcamento,
    insertSnippet,
    formatObservacoes
} from './orcamentos.js';

// ---- orcamentos-list.js (listagem/filtro da aba Orçamentos) ----
import { setFiltroOrcamento, renderOrcamentos } from './orcamentos-list.js';

// ---- clientes.js ----
import {
    cancelEditCliente,
    saveQuickCliente,
    editCliente,
    deleteCliente,
    openClienteSelectorCard,
    closeClienteSelectorCard,
    renderClienteSelectorList,
    selecionarClienteCard
} from './clientes.js';

// ---- projetos.js ----
import {
    openInlineProjetoForm,
    closeInlineProjetoForm,
    saveInlineProjeto,
    deleteProjeto
} from './projetos.js';

// ---- catalogo.js ----
import {
    saveQuickItem,
    deleteCatalogItem,
    downloadTemplateCSV,
    handleCSVUpload
} from './catalogo.js';

// ---- equipamentos.js ----
import {
    addEquipmentRow,
    removeEquipmentRow,
    updateEquipmentsSuggestedTotal,
    aplicarSomaSugeridaEquipamentos,
    checkNovoItemRow,
    cadastrarItemRapido,
    openCatalogSelectorCard,
    closeCatalogSelectorCard,
    renderCatalogSelectorGrid,
    selecionarItemCatalogo
} from './equipamentos.js';

// ---- pagamentos.js ----
import { addPagamentoRow, removePagamentoRow, togglePagamentoParcelas } from './pagamentos.js';

// ---- dashboard.js ----
import { marcarOrcamentoPrincipal } from './dashboard.js';

// ---- exportPdf.js ----
import { exportToPDF } from './exportPdf.js';

// ---- exportDocx.js ----
import { exportToDOCX } from './exportDocx.js';

// Inicializa a conexão com o Supabase assim que o DOM estiver pronto
window.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});

// ============================================================
// Exposição em window: TODAS as funções abaixo são referenciadas dentro de
// atributos onclick="..."/onchange="..."/oninput=".../onsubmit="..." no HTML
// gerado (seja estático no index.html, seja como string de template em
// renderOrcamentos, renderClientes, renderCatalog, addEquipmentRow, etc).
// Sem essa exposição, os botões e campos da interface param de funcionar.
// ============================================================

// ui.js
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;

// orcamentos.js
window.handleValidadeChange = handleValidadeChange;
window.updateFormTotal = updateFormTotal;
window.aplicarArredondamento = aplicarArredondamento;
window.openOrcamentoModal = openOrcamentoModal;
window.closeOrcamentoEditor = closeOrcamentoEditor;
window.openInlineClienteForm = openInlineClienteForm;
window.closeInlineClienteForm = closeInlineClienteForm;
window.saveInlineCliente = saveInlineCliente;
window.handleFormSubmit = handleFormSubmit;
window.viewOrcamento = viewOrcamento;
window.habilitarEdicaoOrcamento = habilitarEdicaoOrcamento;
window.editOrcamento = editOrcamento;
window.deleteOrcamento = deleteOrcamento;
window.insertSnippet = insertSnippet;
window.formatObservacoes = formatObservacoes;

// orcamentos-list.js
window.setFiltroOrcamento = setFiltroOrcamento;
window.renderOrcamentos = renderOrcamentos;

// clientes.js
window.cancelEditCliente = cancelEditCliente;
window.saveQuickCliente = saveQuickCliente;
window.editCliente = editCliente;
window.deleteCliente = deleteCliente;
window.openClienteSelectorCard = openClienteSelectorCard;
window.closeClienteSelectorCard = closeClienteSelectorCard;
window.renderClienteSelectorList = renderClienteSelectorList;
window.selecionarClienteCard = selecionarClienteCard;

// projetos.js
window.openInlineProjetoForm = openInlineProjetoForm;
window.closeInlineProjetoForm = closeInlineProjetoForm;
window.saveInlineProjeto = saveInlineProjeto;
window.deleteProjeto = deleteProjeto;

// catalogo.js
window.saveQuickItem = saveQuickItem;
window.deleteCatalogItem = deleteCatalogItem;
window.downloadTemplateCSV = downloadTemplateCSV;
window.handleCSVUpload = handleCSVUpload;

// equipamentos.js
window.addEquipmentRow = addEquipmentRow;
window.removeEquipmentRow = removeEquipmentRow;
window.updateEquipmentsSuggestedTotal = updateEquipmentsSuggestedTotal;
window.aplicarSomaSugeridaEquipamentos = aplicarSomaSugeridaEquipamentos;
window.checkNovoItemRow = checkNovoItemRow;
window.cadastrarItemRapido = cadastrarItemRapido;
window.openCatalogSelectorCard = openCatalogSelectorCard;
window.closeCatalogSelectorCard = closeCatalogSelectorCard;
window.renderCatalogSelectorGrid = renderCatalogSelectorGrid;
window.selecionarItemCatalogo = selecionarItemCatalogo;

// pagamentos.js
window.addPagamentoRow = addPagamentoRow;
window.removePagamentoRow = removePagamentoRow;
window.togglePagamentoParcelas = togglePagamentoParcelas;

// dashboard.js
window.marcarOrcamentoPrincipal = marcarOrcamentoPrincipal;

// exportPdf.js
window.exportToPDF = exportToPDF;

// exportDocx.js
window.exportToDOCX = exportToDOCX;
