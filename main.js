// main.js
// Ponto de entrada do SJ SOLAR. Importa todos os módulos, inicializa o
// Supabase ao carregar a página, e expõe em `window` todas as funções que
// são chamadas via onclick="..."/onchange="..."/oninput=".../onsubmit="..."
// no HTML (o próprio HTML é gerado como string em vários pontos, então o
// browser só consegue resolver esses nomes através do objeto global window).

// ---- router.js ----
import { navegarPara, irParaSubTabProjeto, initRouter } from './router.js';

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
    initClientesTabUfSelect
} from './clientes.js';

// ---- projetos.js ----
import {
    openInlineProjetoForm,
    closeInlineProjetoForm,
    saveInlineProjeto,
    deleteProjeto,
    openProjetoPageModal,
    closeProjetoPageModal,
    editProjetoPage,
    saveProjetoPage,
    deleteProjetoPage,
    abrirProjetoInterno,
    voltarParaProjetos,
    renderProjetosPage
} from './projetos.js';

// ---- projeto-interno.js (área interna do projeto — Etapa 2) ----
import {
    switchProjetoSubTab,
    criarPropostaDoProjetoAtual,
    criarDocumentoDoProjetoAtual,
    editarClienteDoProjetoAtual,
    excluirProjetoAtual
} from './projeto-interno.js';

// ---- proposta.js (TELA PRÓPRIA da Proposta — separada do Orçamento) ----
import {
    switchPropostaStep,
    avancarPropostaStep,
    editarProposta,
    closePropostaEditor,
    salvarProposta
} from './proposta.js';

// ---- unidades-consumidoras.js (Etapa 2.3.3 da TELA PRÓPRIA da Proposta) ----
import {
    abrirModalUC,
    fecharModalUC,
    salvarUC,
    excluirUC
} from './unidades-consumidoras.js';

// ---- kit-gerador.js (Etapa 2.3.4 da TELA PRÓPRIA da Proposta) ----
import {
    alterarTopologia,
    buscarEquipamentoCatalogo,
    selecionarEquipamentoCatalogo,
    atualizarQuantidadeEquipamento,
    removerEquipamento,
    salvarCamposKit
} from './kit-gerador.js';

// ---- catalogo-fotovoltaico.js (Catálogo Fotovoltaico: módulos/inversores) ----
import {
    switchFvSubAba,
    renderFotovoltaico,
    salvarItemFv,
    excluirItemFv,
    baixarModeloFv,
    exportarFv,
    importarCsvFv
} from './catalogo-fotovoltaico.js';

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

// Inicializa a conexão com o Supabase assim que o DOM estiver pronto.
//
// IMPORTANTE: initRouter() liga o listener de popstate e, na sequência,
// handleRota() é chamado de forma síncrona (dentro do próprio initRouter)
// ANTES do initSupabase() ser disparado. Isso garante que a tela correta
// seja escolhida imediatamente a partir de window.location.pathname — sem
// esperar nenhuma resposta de rede — cobrindo F5, link direto e abertura
// em nova aba. Os dados que dependem do Supabase chegam depois e apenas
// preenchem a tela já correta (handleRota() roda de novo ao final da
// sincronização, dentro de supabase.js, para refletir os dados carregados).
window.addEventListener('DOMContentLoaded', () => {
    initRouter();
    initClientesTabUfSelect();
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

// projetos.js
window.openInlineProjetoForm = openInlineProjetoForm;
window.closeInlineProjetoForm = closeInlineProjetoForm;
window.saveInlineProjeto = saveInlineProjeto;
window.deleteProjeto = deleteProjeto;
window.openProjetoPageModal = openProjetoPageModal;
window.closeProjetoPageModal = closeProjetoPageModal;
window.editProjetoPage = editProjetoPage;
window.saveProjetoPage = saveProjetoPage;
window.deleteProjetoPage = deleteProjetoPage;
window.abrirProjetoInterno = abrirProjetoInterno;
window.voltarParaProjetos = voltarParaProjetos;
window.renderProjetosPage = renderProjetosPage;

// router.js
window.navegarPara = navegarPara;
window.irParaSubTabProjeto = irParaSubTabProjeto;

// projeto-interno.js
window.switchProjetoSubTab = switchProjetoSubTab;
window.criarPropostaDoProjetoAtual = criarPropostaDoProjetoAtual;
window.criarDocumentoDoProjetoAtual = criarDocumentoDoProjetoAtual;
window.editarClienteDoProjetoAtual = editarClienteDoProjetoAtual;
window.excluirProjetoAtual = excluirProjetoAtual;

// proposta.js (TELA PRÓPRIA da Proposta)
window.switchPropostaStep = switchPropostaStep;
window.avancarPropostaStep = avancarPropostaStep;
window.editarProposta = editarProposta;
window.closePropostaEditor = closePropostaEditor;
window.salvarProposta = salvarProposta;

// unidades-consumidoras.js (Etapa 2.3.3 da TELA PRÓPRIA da Proposta)
window.abrirModalUC = abrirModalUC;
window.fecharModalUC = fecharModalUC;
window.salvarUC = salvarUC;
window.excluirUC = excluirUC;

// kit-gerador.js (Etapa 2.3.4 da TELA PRÓPRIA da Proposta)
window.alterarTopologia = alterarTopologia;
window.buscarEquipamentoCatalogo = buscarEquipamentoCatalogo;
window.selecionarEquipamentoCatalogo = selecionarEquipamentoCatalogo;
window.atualizarQuantidadeEquipamento = atualizarQuantidadeEquipamento;
window.removerEquipamento = removerEquipamento;
window.salvarCamposKit = salvarCamposKit;

// catalogo-fotovoltaico.js
window.switchFvSubAba = switchFvSubAba;
window.renderFotovoltaico = renderFotovoltaico;
window.salvarItemFv = salvarItemFv;
window.excluirItemFv = excluirItemFv;
window.baixarModeloFv = baixarModeloFv;
window.exportarFv = exportarFv;
window.importarCsvFv = importarCsvFv;

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
