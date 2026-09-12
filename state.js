// state.js
// Estado compartilhado entre todos os módulos do SJ SOLAR.
// Nenhum dado aqui é persistido em localStorage/sessionStorage —
// a fonte de verdade é sempre o Supabase; isto é só um cache em memória
// da sessão atual, recarregado via syncFromSupabase().

export const SUPABASE_URL = "https://giixtvzunzrqbablocur.supabase.co";
export const SUPABASE_KEY = "sb_publishable_FSgrmY8FWAE_QOYDvKcw3w_IqXJd2j_";

export const SNIPPETS = {
    offgrid: "FAVOR NÃO LIGAR NADA QUE CONTÉM RESISTÊNCIA, COMO: FERRO DE PASSAR ROUPA; AIR FRYER; SECADOR DE CABELO; CHUVEIRO ELÉTRICO; MÁQUINA DE SOLDA; ETC. CASO LIGUE, A GARANTIA SERÁ ANULADA.",
    material: "O MATERIAL HIDRÁULICO (CANOS, CONEXÕES) É POR CONTA DO CLIENTE.",
    prazo: "ESTA PROPOSTA TEM VALIDADE PELO PRAZO DEFINIDO NA DATA DE EMISSÃO."
};

// Objeto único mutável para o cliente Supabase, os caches locais e pequenos
// estados de UI que precisam ser lidos/alterados por vários módulos.
// Usar um objeto (em vez de "let" exportado) evita o problema de módulos ES
// não poderem reatribuir um "let" importado de outro arquivo.
export const state = {
    supabaseClient: null,
    localOrcamentos: [],
    localClientes: [],
    localProjetos: [],
    localCatalog: [],
    chartInstanceComercial: null,
    chartInstanceExecucao: null,
    sidebarCollapsed: false,
    filtroOrcamentoAtivo: 'todos',
    projetosExpandidos: new Set(),
    editingClienteId: null,
    catalogSelectorTargetRow: null
};
