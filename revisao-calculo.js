// revisao-calculo.js
// Cálculo da Revisão + Finalização da Proposta (etapa 2.3.6).
// Funções puras (sem tela, sem banco): recebem números e devolvem números.
// Tudo é calculado em CENTAVOS inteiros para o total fechar exato.
//
// REGRA (definida pelo dono):
//   margem  de cada custo = custo x margem%      (padrão 30%)
//   imposto = custo total x imposto%             (padrão 6%, sobre o custo, não sobre a margem)
//   preço do item = custo + margem
//   TOTAL = custo total + margem total + imposto
//
// "Valor desejado": se informado, só as MARGENS mudam (custos e imposto ficam
// intactos) para o total fechar exatamente. A diferença é distribuída entre os
// itens na proporção da margem que cada um já tinha (se todas forem zero, na
// proporção do custo).

const cent = n => Math.round((Number(n) || 0) * 100);
export const reais = c => c / 100;

// Distribui `total` centavos conforme os pesos, sem sobrar nem faltar centavo.
function distribuir(total, pesos) {
    const soma = pesos.reduce((a, b) => a + b, 0);
    const n = pesos.length;
    if (n === 0) return [];
    const exatos = pesos.map(p => (soma > 0 ? (total * p) / soma : total / n));
    const base = exatos.map(Math.floor);
    let resto = total - base.reduce((a, b) => a + b, 0);
    exatos
        .map((e, i) => ({ i, frac: e - Math.floor(e) }))
        .sort((a, b) => b.frac - a.frac)
        .forEach(({ i }) => { if (resto > 0) { base[i] += 1; resto -= 1; } });
    return base;
}

// itens: [{ key, custo, margem_tipo|null, margem_valor|null }]  (null = usa a margem padrão)
// padrao: { tipo: 'PERCENTUAL'|'FIXO', valor }       margem padrão (geral ou da configuração)
// imposto: { tipo: 'PERCENTUAL'|'FIXO', valor }      FIXO = valor total da proposta
// valorDesejado: número ou null
export function calcularProposta({ itens, padrao, imposto, valorDesejado = null }) {
    const custos = itens.map(i => cent(i.custo));
    const custoTotal = custos.reduce((a, b) => a + b, 0);

    // margem natural (sem ajuste de total)
    const herdam = itens.map(i => i.margem_tipo === null || i.margem_tipo === undefined);
    const somaHerdam = custos.reduce((a, c, k) => a + (herdam[k] ? c : 0), 0);
    const naturais = itens.map((i, k) => {
        const tipo = herdam[k] ? padrao.tipo : i.margem_tipo;
        const valor = Number(herdam[k] ? padrao.valor : i.margem_valor) || 0;
        if (tipo === 'FIXO') {
            // R$ próprio do item; ou, se vem do padrão, valor total repartido pelo custo
            if (!herdam[k]) return cent(valor);
            return somaHerdam > 0 ? Math.round((cent(valor) * custos[k]) / somaHerdam) : 0;
        }
        return Math.round((custos[k] * valor) / 100);
    });

    const impostoC = imposto.tipo === 'FIXO'
        ? cent(imposto.valor)
        : Math.round((custoTotal * (Number(imposto.valor) || 0)) / 100);

    let margens = naturais;
    const alvo = { pedido: valorDesejado !== null && valorDesejado !== undefined, ativo: false, viavel: true, minimo: reais(custoTotal + impostoC) };
    if (alvo.pedido) {
        const M = cent(valorDesejado) - custoTotal - impostoC;
        if (M < 0) {
            alvo.viavel = false; // abaixo de custo + imposto: ignora o pedido
        } else {
            const somaNat = naturais.reduce((a, b) => a + b, 0);
            const pesos = somaNat > 0 ? naturais.map(m => Math.max(m, 0)) : custos;
            margens = distribuir(M, pesos);
            alvo.ativo = true;
        }
    }

    const margemTotal = margens.reduce((a, b) => a + b, 0);
    return {
        itens: itens.map((i, k) => ({
            key: i.key,
            custo: reais(custos[k]),
            margem: reais(margens[k]),
            preco: reais(custos[k] + margens[k]),
            pct: custos[k] > 0 ? (margens[k] / custos[k]) * 100 : 0
        })),
        custoTotal: reais(custoTotal),
        margemTotal: reais(margemTotal),
        imposto: {
            tipo: imposto.tipo,
            percentual: imposto.tipo === 'FIXO' ? null : Number(imposto.valor) || 0,
            base: reais(custoTotal),
            valor: reais(impostoC)
        },
        precoSemImposto: reais(custoTotal + margemTotal),
        total: reais(custoTotal + margemTotal + impostoC),
        alvo
    };
}
