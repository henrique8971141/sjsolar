// extenso.js
// Valor em reais por extenso. Ex.: 1500.5 -> "mil e quinhentos reais e cinquenta centavos"

const U = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const D = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const C = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];

function ate999(n) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100), r = n % 100, p = [];
    if (c) p.push(C[c]);
    if (r) {
        if (r < 20) p.push(U[r]);
        else {
            const d = Math.floor(r / 10), u = r % 10;
            p.push(u ? `${D[d]} e ${U[u]}` : D[d]);
        }
    }
    return p.join(' e ');
}

function inteiroPorExtenso(n) {
    if (n === 0) return 'zero';
    const mi = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1e3), resto = n % 1e3;
    const partes = [];
    if (mi) partes.push({ v: mi, t: ate999(mi) + (mi === 1 ? ' milhão' : ' milhões') });
    if (mil) partes.push({ v: mil, t: mil === 1 ? 'mil' : ate999(mil) + ' mil' });
    if (resto) partes.push({ v: resto, t: ate999(resto) });
    return partes.map((p, i) => {
        if (i === 0) return p.t;
        return ((p.v < 100 || p.v % 100 === 0) ? ' e ' : ' ') + p.t;
    }).join('');
}

export function valorPorExtenso(valor) {
    const total = Math.round(Number(valor || 0) * 100);
    const reais = Math.floor(total / 100), cent = total % 100;
    const deMilhao = reais >= 1e6 && reais % 1e6 === 0;
    let txt = '';
    if (reais > 0) {
        txt = inteiroPorExtenso(reais) + (deMilhao ? ' de' : '') + (reais === 1 ? ' real' : ' reais');
    }
    if (cent > 0) {
        const c = inteiroPorExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos');
        txt = txt ? `${txt} e ${c}` : c;
    }
    return txt || 'zero reais';
}
