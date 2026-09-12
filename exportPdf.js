// exportPdf.js
// Geração do PDF da proposta a partir do template oculto (#pdf-export-root),
// que é preenchido dinamicamente com os dados do orçamento e depois
// capturado página por página (html2canvas + jsPDF).

import { state } from './state.js';
import { calcularTotalOrcamento } from './utils.js';
import { formatarPagamentosTexto } from './pagamentos.js';

// Reduz dinamicamente o espaçador e, se necessário, a fonte dos campos
// de texto livre (observações / condições de pagamento) para que o
// conteúdo caiba dentro do limite físico de 297mm da página. Isso evita
// que textos longos "estourem" a caixa e apareçam cortados/soltos no PDF.
export function ajustarConteudoOrcamentoPDF() {
    const wrappers = document.querySelectorAll('#pdf-export-root .pdf-page-wrapper');
    wrappers.forEach(wrapper => {
        const box = wrapper.querySelector('.orcamento-pdf');
        if (!box) return;

        const spacer = box.querySelector('.area-equipamentos');
        const maxHeight = wrapper.clientHeight;

        // 1) Encolhe o espaçador da seção de equipamentos até o mínimo
        let tentativas = 0;
        while (spacer && box.scrollHeight > maxHeight && tentativas < 80) {
            const atual = parseFloat(spacer.style.height) || 0;
            if (atual <= 0) break;
            spacer.style.height = Math.max(0, atual - 4) + 'px';
            tentativas++;
        }

        // 2) Se ainda não coube, reduz a fonte dos textos livres
        const camposLivres = [
            box.querySelector('#pdf-outros-desc'),
            box.querySelector('#pdf-condicoes-pag')
        ].filter(Boolean);

        let fonte = 11;
        tentativas = 0;
        while (box.scrollHeight > maxHeight && fonte > 7 && tentativas < 20) {
            fonte -= 0.5;
            camposLivres.forEach(el => { el.style.fontSize = fonte + 'px'; });
            tentativas++;
        }
    });
}

// EXPORTAÇÃO EXATA DA SUA TABELA PARA O PDF (DINÂMICA)
export function exportToPDF(id) {
    const o = state.localOrcamentos.find(item => item.id === id);
    if (!o) return;

    // Reseta ajustes de uma exportação anterior (fonte e espaçador)
    document.querySelectorAll('#pdf-export-root .pdf-page-wrapper .orcamento-pdf').forEach(box => {
        const outros = box.querySelector('#pdf-outros-desc');
        const condicoes = box.querySelector('#pdf-condicoes-pag');
        if (outros) outros.style.fontSize = '';
        if (condicoes) condicoes.style.fontSize = '';
    });

    const { subtotal, desconto, total } = calcularTotalOrcamento(o);

    // Vincular campos de texto da tabela do PDF
    document.getElementById('pdf-numero').textContent = o.numero_orcamento || '-';
    document.getElementById('pdf-cliente-nome').textContent = o.cliente_nome;
    document.getElementById('pdf-cliente-end').textContent = `${o.cliente_endereco || ''} ${o.cliente_cidade || ''} - ${o.cliente_estado || ''}`;
    document.getElementById('pdf-servico-tipo').textContent = o.tipo_servico_detalhado || o.tipo_orcamento;

    // Título da Seção 1 fixo como "EQUIPAMENTO(S)", conforme modelo original
    document.getElementById('pdf-secao-titulo-1').textContent = 'EQUIPAMENTO(S)';

    const dataValidade = new Date(o.validade_proposta + 'T00:00:00').toLocaleDateString('pt-BR');
    document.getElementById('pdf-validade').textContent = dataValidade;

    // Renderizar itens dinâmicos do banco dentro da sua tabela
    const tbody = document.getElementById('pdf-equipamentos-dinamicos');
    tbody.innerHTML = '';

    const eqList = o.equipamentos_json || [];

    eqList.forEach((eq) => {
        const tr = document.createElement('tr');
        const produtoCatalogo = state.localCatalog.find(p => p.descricao && p.descricao.toLowerCase() === (eq.desc || '').toLowerCase());
        const marca = produtoCatalogo?.marca?.trim();
        const temMarcaVisivel = marca && marca.toUpperCase() !== 'OUTROS';
        const descComMarca = temMarcaVisivel ? `${eq.desc.toUpperCase()} — ${marca.toUpperCase()}` : eq.desc.toUpperCase();
        // O preço só é exibido na impressão quando "mostrarPreco" estiver marcado.
        // Ele sempre entra na soma do total de equipamentos, mesmo quando oculto aqui.
        const valorTexto = (eq.mostrarPreco !== false && eq.preco)
            ? 'R$ ' + Number(eq.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            : '';
        tr.innerHTML = `
            <td class="centralizado" style="font-weight:bold;">${eq.qtd}</td>
            <td style="font-weight:bold;">${descComMarca}</td>
            <td style="font-weight:bold; text-align:right;">${valorTexto}</td>
        `;
        tbody.appendChild(tr);
    });

    // Altura do spacer baseia-se na quantidade de registros para manter as páginas do PDF constantes
    const spacerRow = document.querySelector('.orcamento-pdf .area-equipamentos');
    if (spacerRow) {
        const computedHeight = Math.max(50, 240 - (eqList.length * 28));
        spacerRow.style.height = `${computedHeight}px`;
    }

    // Estimativas e Garantias (campo livre: label + valor customizáveis)
    const campoExtraLabel = (o.campo_extra_label || 'ESTIMATIVA DE BANHOS/DIA').toUpperCase();
    const campoExtraValor = (o.campo_extra_valor || '').toString().trim();
    const pdfBanhosLabelEl = document.getElementById('pdf-campo-extra-label');
    if (pdfBanhosLabelEl) pdfBanhosLabelEl.textContent = campoExtraLabel;
    document.getElementById('pdf-banhos-val').textContent = campoExtraValor ? campoExtraValor.toUpperCase() : 'N/A';
    document.getElementById('pdf-garantia-equip-val').textContent = o.garantia_equipamento || 'N/A';

    // Bloco de Instalação (modelo original não exibe valores parciais, só o total no final)
    document.getElementById('pdf-instalacao-desc').textContent = (o.tipo_servico_detalhado || 'INSTALAÇÃO DE AQUECEDOR SOLAR').toUpperCase();
    document.getElementById('pdf-garantia-inst-val').textContent = o.garantia_instalacao || 'N/A';

    // Observações adicionais
    document.getElementById('pdf-outros-desc').innerHTML = o.observacoes || 'SEM OBSERVAÇÕES ADICIONAIS.';
    document.getElementById('pdf-val-total-text').textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Exibe subtotal e desconto apenas se houver desconto aplicado
    const linhaSubtotal = document.getElementById('pdf-linha-subtotal');
    const linhaDesconto = document.getElementById('pdf-linha-desconto');
    if (desconto && desconto > 0) {
        document.getElementById('pdf-subtotal-val').textContent = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const descontoTexto = o.desconto_tipo === 'percentual'
            ? `${(o.desconto_valor || 0).toLocaleString('pt-BR')}% (${desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
            : `- ${desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        document.getElementById('pdf-desconto-val').textContent = descontoTexto;
        linhaSubtotal.style.display = '';
        linhaDesconto.style.display = '';
    } else {
        linhaSubtotal.style.display = 'none';
        linhaDesconto.style.display = 'none';
    }

    // Observações financeiras (Forma de pagamento)
    const pagamentosTexto = (o.pagamentos_json && o.pagamentos_json.length > 0) ? formatarPagamentosTexto(o.pagamentos_json) : '';
    const condicoesFinal = [pagamentosTexto, o.condicoes_pagamento].filter(Boolean).join('\n');
    document.getElementById('pdf-condicoes-pag').innerHTML = condicoesFinal ? condicoesFinal.replace(/\n/g, '<br>') : 'A COMBINAR.';

    // Data por extenso
    const dataEmissao = new Date(o.data_emissao + 'T00:00:00');
    const diasSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    document.getElementById('pdf-data-extenso').textContent = `${diasSemana[dataEmissao.getDay()]}, ${dataEmissao.getDate()} de ${meses[dataEmissao.getMonth()]} de ${dataEmissao.getFullYear()}`;

    // Corrige campos livres (observações / condições de pagamento) para caberem
    // dentro do limite de 297mm da página, evitando corte/vazamento no PDF
    const wrapper = document.getElementById('pdf-export-root');
    wrapper.classList.remove('hidden');
    ajustarConteudoOrcamentoPDF();

    // IMPORTANTE: deixar o html2pdf.js decidir sozinho onde quebrar as
    // páginas (mesmo em modo 'css') é frágil: se o conteúdo real de UM
    // .pdf-page-wrapper ficar um pixel mais alto que 297mm (ex: fontes
    // renderizadas de forma levemente diferente, ícones, etc.), o
    // jsPDF divide esse único wrapper em DUAS páginas de PDF, sendo a
    // segunda quase em branco. Por isso, cada .pdf-page-wrapper é
    // renderizado individualmente como UMA imagem e inserido como UMA
    // página do PDF, garantindo sempre 1 wrapper = 1 página, sem
    // duplicar nem gerar páginas em branco.
    gerarPDFPorPaginas(
        Array.from(wrapper.querySelectorAll('.pdf-page-wrapper')),
        `Proposta_SJ_Solar_${o.numero_orcamento}.pdf`
    ).finally(() => {
        wrapper.classList.add('hidden');
    });
}

export async function gerarPDFPorPaginas(paginas, filename) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    for (let i = 0; i < paginas.length; i++) {
        const pagina = paginas[i];
        const canvas = await html2canvas(pagina, {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            // Limita a captura exatamente à altura visível do wrapper
            // (297mm), evitando que um eventual overflow vaze para
            // fora da página capturada.
            height: pagina.clientHeight,
            windowHeight: pagina.clientHeight
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.98);

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }

    pdf.save(filename);
}
