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
