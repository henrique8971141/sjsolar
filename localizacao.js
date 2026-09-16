// localizacao.js
// Integrações externas de localização: busca de endereço por CEP (ViaCEP)
// e lista de municípios por UF (API do IBGE). Cache em memória por sessão
// para não repetir requisições de município da mesma UF.

const municipiosPorUfCache = {};

// Consulta o ViaCEP. Retorna null em qualquer falha (CEP inválido, não
// encontrado, erro de rede) — nunca lança, para nunca travar o formulário.
export async function buscarEnderecoPorCep(cepBruto) {
    const cep = String(cepBruto || '').replace(/\D/g, '');
    if (cep.length !== 8) return null;
    try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.erro) return null;
        return {
            logradouro: data.logradouro || '',
            bairro: data.bairro || '',
            cidade: data.localidade || '',
            uf: data.uf || ''
        };
    } catch (err) {
        console.warn('Falha ao consultar ViaCEP:', err.message);
        return null;
    }
}

// Lista de UFs (fixa — não muda e não justifica chamada de API).
export const UFS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
    'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// Busca (e cacheia em memória) os municípios de uma UF via API do IBGE.
export async function getMunicipiosPorUf(uf) {
    const ufNormalizada = String(uf || '').trim().toUpperCase();
    if (!ufNormalizada) return [];
    if (municipiosPorUfCache[ufNormalizada]) return municipiosPorUfCache[ufNormalizada];

    try {
        const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufNormalizada}/municipios`);
        if (!resp.ok) return [];
        const data = await resp.json();
        const nomes = (data || []).map(m => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        municipiosPorUfCache[ufNormalizada] = nomes;
        return nomes;
    } catch (err) {
        console.warn('Falha ao consultar municípios do IBGE:', err.message);
        return [];
    }
}

// Filtra os municípios já carregados de uma UF por um texto de busca.
// Não dispara rede: assume que getMunicipiosPorUf já populou o cache
// (chamar getMunicipiosPorUf antes, ou deixar essa função disparar a carga).
export async function buscarMunicipios(uf, texto) {
    const municipios = await getMunicipiosPorUf(uf);
    const termo = String(texto || '').trim().toLowerCase();
    if (!termo) return municipios.slice(0, 8);
    return municipios.filter(m => m.toLowerCase().includes(termo)).slice(0, 8);
}

// ------------------------------------------------------------------
// Distribuidoras de energia (Etapa 2.3.2 do editor de orçamento)
// ------------------------------------------------------------------
// Regras conhecidas de distribuidora por localização, da mais específica
// para a mais genérica. Cada regra pode ser por UF (aplica ao estado
// inteiro) ou por UF+cidade (uma exceção dentro do estado). Isso permite
// cadastrar, no futuro, regras por região/área de atendimento sem mudar a
// função que consulta — só adicionar entradas aqui.
//
// IMPORTANTE: não assumir que todo estado tem uma única distribuidora.
// Um estado só entra aqui como regra "cobre o estado inteiro" quando isso
// for realmente verdade (ex: MG é praticamente só CEMIG); estados com
// mais de uma distribuidora relevante (ex: SP) devem ser listados por
// cidade, e a UF sozinha não deve aparecer na tabela — assim a função
// devolve null e o campo fica para preenchimento manual, em vez de
// arriscar uma distribuidora errada.
const REGRAS_DISTRIBUIDORA_POR_CIDADE = {
    // SP: só cidades específicas com regra conhecida (ENEL SP, área
    // metropolitana). SP não tem uma distribuidora única no estado todo
    // (também há CPFL, EDP, Elektro em outras regiões), então SP não
    // aparece em REGRAS_DISTRIBUIDORA_POR_UF — só as cidades abaixo.
    'SP|sao paulo': 'ENEL SP',
    'SP|guarulhos': 'ENEL SP',
    'SP|osasco': 'ENEL SP',
    'SP|santo andre': 'ENEL SP',
    'SP|sao bernardo do campo': 'ENEL SP',
    'SP|diadema': 'ENEL SP',
    'SP|maua': 'ENEL SP',
    'SP|guarujá': 'ENEL SP',
    'SP|guaruja': 'ENEL SP',
};

const REGRAS_DISTRIBUIDORA_POR_UF = {
    'MG': 'CEMIG',
};

// Remove acentos e normaliza para comparar nomes de cidade com segurança
// (o cadastro do cliente pode vir com ou sem acento, dependendo da fonte).
function normalizarTexto(txt) {
    return String(txt || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// Tenta determinar a distribuidora a partir de UF (+ cidade, quando
// disponível). Devolve a string da distribuidora quando há uma regra
// conhecida e segura, ou null quando não é possível determinar com
// segurança — nesse caso o campo deve ficar disponível para seleção/ajuste
// manual (nunca "chutar" uma distribuidora).
export function determinarDistribuidora(estado, cidade) {
    const uf = String(estado || '').trim().toUpperCase();
    if (!uf) return null;

    const cidadeChave = `${uf}|${normalizarTexto(cidade)}`;
    if (cidade && REGRAS_DISTRIBUIDORA_POR_CIDADE[cidadeChave]) {
        return REGRAS_DISTRIBUIDORA_POR_CIDADE[cidadeChave];
    }

    if (REGRAS_DISTRIBUIDORA_POR_UF[uf]) {
        return REGRAS_DISTRIBUIDORA_POR_UF[uf];
    }

    return null;
}

// Lista fixa de distribuidoras para o <select> manual (usada tanto como
// opções do campo quanto para garantir que uma distribuidora determinada
// automaticamente sempre tenha uma option correspondente).
export const DISTRIBUIDORAS_CONHECIDAS = [
    'CEMIG', 'ENEL SP', 'ENEL RJ', 'ENEL CE', 'ENEL GO', 'CPFL', 'EDP', 'Elektro',
    'Light', 'Coelba', 'Celpe', 'Equatorial', 'Copel', 'CELESC', 'RGE', 'Neoenergia'
];
