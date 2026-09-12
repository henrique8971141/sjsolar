// utils.js
// Funções auxiliares puras (sem efeitos colaterais de DOM/Supabase) usadas
// por vários módulos: dashboard, orçamentos, exportação PDF/DOCX.

// Calcula o total de um orçamento já salvo (state.localOrcamentos), aplicando o desconto
export function calcularTotalOrcamento(o) {
    const subtotal = (o.valor_equipamentos || 0) + (o.valor_mao_de_obra || 0) + (o.valor_outros || 0);
    const descontoValor = o.desconto_valor || 0;
    let desconto = 0;
    if (o.desconto_tipo === 'percentual') {
        desconto = subtotal * (descontoValor / 100);
    } else {
        desconto = descontoValor;
    }
    desconto = Math.min(desconto, subtotal);
    return { subtotal, desconto, total: subtotal - desconto };
}
