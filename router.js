// router.js
// Router simples em JavaScript vanilla para o SJSolar, baseado na History
// API (history.pushState/replaceState + evento popstate). Sem framework,
// sem biblioteca externa — só o necessário para as telas terem URL própria
// e sobreviverem a F5/voltar/avançar/link direto.
//
// Rotas suportadas:
//   /                            -> Dashboard (Início)
//   /clientes                    -> Listagem de clientes
//   /projetos                    -> Listagem de projetos
//   /orcamentos                  -> Listagem de orçamentos
//   /catalogo                    -> Catálogo de produtos/serviços
//   /projeto/:id                 -> Área do projeto (sub-aba padrão: Orçamentos)
//   /projeto/:id/orcamentos      -> Orçamentos do projeto
//   /projeto/:id/documentos      -> Documentos do projeto
//   /projeto/:id/informacoes     -> Informações do cliente do projeto
//
// Qualquer outra URL cai em "Página não encontrada". Um :id que não
// corresponda a nenhum projeto carregado cai em "Projeto não encontrado".
//
// Observação sobre imports: este módulo importa renderProjetoNaRota de
// projetos.js, que por sua vez importa navegarPara/irParaSubTabProjeto
// daqui — é um import circular intencional (o mesmo padrão já usado entre
// projetos.js e projeto-interno.js), seguro porque os dois lados só usam o
// que importam dentro de funções, nunca no topo do módulo.

import { state } from './state.js';
import { switchTab } from './ui.js';
import { renderProjetoNaRota } from './projetos.js';

// Rotas de 1 segmento que apenas trocam de aba (mesmo padrão de switchTab
// já usado por essas telas antes do Router existir).
const ROTAS_SIMPLES = {
    projetos: { nome: 'projetos', tabId: 'projetos-tab' },
    clientes: { nome: 'clientes', tabId: 'clientes-tab' },
    orcamentos: { nome: 'orcamentos', tabId: 'orcamentos-tab' },
    catalogo: { nome: 'catalogo', tabId: 'produtos-tab' }
};

// Nome da sub-aba na URL -> nome interno usado pela área do projeto.
// A 3ª sub-aba se chama "cliente" internamente (mesmo nome do painel já
// existente), mas "informacoes" na URL, que é mais claro para quem usa.
const SUBTAB_URL_PARA_INTERNO = { orcamentos: 'orcamentos', documentos: 'documentos', informacoes: 'cliente' };
const SUBTAB_INTERNO_PARA_URL = { orcamentos: 'orcamentos', documentos: 'documentos', cliente: 'informacoes' };

function parseRota(pathname) {
    const partes = pathname.split('/').filter(Boolean);

    if (partes.length === 0) {
        return { nome: 'dashboard' };
    }
    if (partes.length === 1 && ROTAS_SIMPLES[partes[0]]) {
        return ROTAS_SIMPLES[partes[0]];
    }
    if (partes[0] === 'projeto' && partes[1]) {
        const projetoId = decodeURIComponent(partes[1]);
        if (partes.length === 2) {
            return { nome: 'projeto', projetoId, subTabUrl: 'orcamentos' };
        }
        if (partes.length === 3 && SUBTAB_URL_PARA_INTERNO[partes[2]]) {
            return { nome: 'projeto', projetoId, subTabUrl: partes[2] };
        }
    }
    return { nome: 'nao-encontrada' };
}

function renderProjetoNaoEncontrado(projetoId) {
    switchTab('projeto-nao-encontrado-tab');
    const el = document.getElementById('projeto-nao-encontrado-id');
    if (el) el.textContent = projetoId;
}

function renderPaginaNaoEncontrada() {
    switchTab('pagina-nao-encontrada-tab');
}

// Lê a URL atual e renderiza a tela correspondente. Não mexe no histórico
// do navegador — isso é responsabilidade de navegarPara() e do popstate.
// Chamada: (1) uma vez no carregamento inicial, após a primeira sincronização
// com o Supabase (para já abrir direto na rota certa em caso de F5/link
// direto); (2) a cada nova sincronização, para manter a tela atual
// atualizada; (3) a cada evento popstate (botão Voltar/Avançar).
export function handleRota() {
    const rota = parseRota(window.location.pathname);

    if (rota.nome === 'dashboard') {
        switchTab('dashboard-tab');
        return;
    }

    if (rota.nome === 'projetos') {
        state.projetoAtualId = null;
        switchTab('projetos-tab');
        return;
    }

    if (rota.nome === 'clientes' || rota.nome === 'orcamentos' || rota.nome === 'catalogo') {
        switchTab(rota.tabId);
        return;
    }

    if (rota.nome === 'projeto') {
        const existe = state.localProjetos.some(p => String(p.id) === String(rota.projetoId));
        if (!existe) {
            renderProjetoNaoEncontrado(rota.projetoId);
            return;
        }
        renderProjetoNaRota(rota.projetoId, SUBTAB_URL_PARA_INTERNO[rota.subTabUrl]);
        return;
    }

    renderPaginaNaoEncontrada();
}

// Muda a URL (via History API, sem recarregar a página) e renderiza a tela
// correspondente. Todo clique que deveria "trocar de tela" no sistema deve
// chamar esta função — nunca esconder/mostrar telas na mão sem atualizar a
// URL, para não gerar um sistema de navegação paralelo ao Router.
export function navegarPara(caminho, { substituir = false } = {}) {
    if (window.location.pathname !== caminho) {
        if (substituir) history.replaceState({}, '', caminho);
        else history.pushState({}, '', caminho);
    }
    handleRota();
}

// Atalho usado pela sub-navegação (Orçamentos/Documentos/Informações do
// Cliente) dentro de um projeto já aberto.
export function irParaSubTabProjeto(subTabInterno) {
    if (!state.projetoAtualId) return;
    const subTabUrl = SUBTAB_INTERNO_PARA_URL[subTabInterno] || 'orcamentos';
    navegarPara(`/projeto/${state.projetoAtualId}/${subTabUrl}`);
}

// Liga o botão Voltar/Avançar do navegador ao Router.
export function initRouter() {
    window.addEventListener('popstate', handleRota);
}
