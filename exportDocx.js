// exportDocx.js
// Exportação da proposta em DOCX (Word) editável, usando a biblioteca
// docx.js (window.docx) e FileSaver.js (window.saveAs), ambas carregadas
// via <script> global no index.html.

import { state } from './state.js';
import { calcularTotalOrcamento } from './utils.js';
import { formatarPagamentosTexto } from './pagamentos.js';

// ============================================================
// Converte o HTML simples gerado pelo editor de Observações
// (negrito/itálico/sublinhado/listas/quebras de linha) em uma
// lista de Paragraph do docx.js, preservando a formatação.
// ============================================================
export function htmlObservacoesParaParagrafosDocx(html) {
    const { Paragraph, TextRun } = window.docx;
    const container = document.createElement('div');
    container.innerHTML = html || '';

    const paragrafos = [];

    function runsDoNode(node, estilo) {
        let runs = [];
        node.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                const texto = child.textContent;
                if (texto) runs.push(new TextRun({ text: texto, bold: estilo.bold, italics: estilo.italics, underline: estilo.underline ? {} : undefined }));
                return;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) return;
            const tag = child.tagName.toLowerCase();
            const novoEstilo = {
                bold: estilo.bold || tag === 'b' || tag === 'strong',
                italics: estilo.italics || tag === 'i' || tag === 'em',
                underline: estilo.underline || tag === 'u'
            };
            if (tag === 'br') {
                runs.push(new TextRun({ text: '', break: 1 }));
                return;
            }
            runs = runs.concat(runsDoNode(child, novoEstilo));
        });
        return runs;
    }

    function processarBloco(node) {
        const tag = node.tagName ? node.tagName.toLowerCase() : '';
        if (tag === 'ul' || tag === 'ol') {
            Array.from(node.children).forEach((li) => {
                const runs = runsDoNode(li, {});
                paragrafos.push(new Paragraph({
                    children: runs.length ? runs : [new TextRun('')],
                    bullet: tag === 'ul' ? { level: 0 } : undefined,
                    numbering: tag === 'ol' ? { reference: 'observacoes-numeracao', level: 0 } : undefined
                }));
            });
            return;
        }
        const runs = runsDoNode(node, {});
        paragrafos.push(new Paragraph({ children: runs.length ? runs : [new TextRun('')] }));
    }

    const blocosDeNivelSuperior = Array.from(container.childNodes).filter(n =>
        n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && n.textContent.trim())
    );

    if (blocosDeNivelSuperior.length === 0) {
        paragrafos.push(new Paragraph({ text: 'SEM OBSERVAÇÕES ADICIONAIS.' }));
    } else {
        blocosDeNivelSuperior.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                paragrafos.push(new Paragraph({ children: [new TextRun(node.textContent)] }));
                return;
            }
            processarBloco(node);
        });
    }

    return paragrafos;
}

// ============================================================
// EXPORTAÇÃO DO ORÇAMENTO EM DOCX (WORD)
// Usa a biblioteca docx.js (window.docx) para montar um documento
// editável com os mesmos dados exibidos no PDF, para os casos em
// que o cliente/vendedor precise editar a proposta manualmente.
// ============================================================
export async function exportToDOCX(id) {
    const o = state.localOrcamentos.find(item => item.id === id);
    if (!o) return;

    const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        WidthType, AlignmentType, ShadingType, HeadingLevel
    } = window.docx;

    const { subtotal, desconto, total } = calcularTotalOrcamento(o);

    const dataValidade = new Date(o.validade_proposta + 'T00:00:00').toLocaleDateString('pt-BR');
    const dataEmissao = new Date(o.data_emissao + 'T00:00:00');
    const diasSemana = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const dataExtenso = `${diasSemana[dataEmissao.getDay()]}, ${dataEmissao.getDate()} de ${meses[dataEmissao.getMonth()]} de ${dataEmissao.getFullYear()}`;

    const eqList = o.equipamentos_json || [];

    // Linhas da tabela de equipamentos
    // O preço só é impresso quando "mostrarPreco" estiver marcado, mas sempre
    // entra na soma do total de equipamentos (valor_equipamentos).
    const linhasEquipamentos = eqList.map((eq) => {
        const produtoCatalogo = state.localCatalog.find(p => p.descricao && p.descricao.toLowerCase() === (eq.desc || '').toLowerCase());
        const marca = produtoCatalogo?.marca?.trim();
        const temMarcaVisivel = marca && marca.toUpperCase() !== 'OUTROS';
        const descComMarca = temMarcaVisivel ? `${eq.desc.toUpperCase()} — ${marca.toUpperCase()}` : (eq.desc || '').toUpperCase();
        const valorTexto = (eq.mostrarPreco !== false && eq.preco)
            ? 'R$ ' + Number(eq.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            : '';
        return new TableRow({
            children: [
                new TableCell({
                    width: { size: 12, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(eq.qtd), bold: true })] })]
                }),
                new TableCell({
                    width: { size: 68, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ children: [new TextRun({ text: descComMarca, bold: true })] })]
                }),
                new TableCell({
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: valorTexto, bold: true })] })]
                })
            ]
        });
    });

    if (linhasEquipamentos.length === 0) {
        linhasEquipamentos.push(new TableRow({
            children: [
                new TableCell({ width: { size: 12, type: WidthType.PERCENTAGE }, children: [new Paragraph('-')] }),
                new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, children: [new Paragraph('SEM EQUIPAMENTOS CADASTRADOS')] }),
                new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph('')] })
            ]
        }));
    }

    const tabelaEquipamentos = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                tableHeader: true,
                children: [
                    new TableCell({
                        width: { size: 12, type: WidthType.PERCENTAGE },
                        shading: { type: ShadingType.CLEAR, fill: "0F172A" },
                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'QTD', bold: true, color: 'FBBF24' })] })]
                    }),
                    new TableCell({
                        width: { size: 68, type: WidthType.PERCENTAGE },
                        shading: { type: ShadingType.CLEAR, fill: "0F172A" },
                        children: [new Paragraph({ children: [new TextRun({ text: 'EQUIPAMENTO(S)', bold: true, color: 'FBBF24' })] })]
                    }),
                    new TableCell({
                        width: { size: 20, type: WidthType.PERCENTAGE },
                        shading: { type: ShadingType.CLEAR, fill: "0F172A" },
                        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'VALOR', bold: true, color: 'FBBF24' })] })]
                    })
                ]
            }),
            ...linhasEquipamentos
        ]
    });

    // Pagamentos / condições
    const pagamentosTexto = (o.pagamentos_json && o.pagamentos_json.length > 0) ? formatarPagamentosTexto(o.pagamentos_json) : '';
    const condicoesFinal = [pagamentosTexto, o.condicoes_pagamento].filter(Boolean).join('\n') || 'A COMBINAR.';

    const campoExtraLabel = (o.campo_extra_label || 'ESTIMATIVA DE BANHOS/DIA').toUpperCase();
    const campoExtraValor = (o.campo_extra_valor || '').toString().trim() || 'N/A';

    const linhaDupla = (label, valor) => new Paragraph({
        spacing: { after: 100 },
        children: [
            new TextRun({ text: `${label}: `, bold: true }),
            new TextRun({ text: valor || 'N/A' })
        ]
    });

    const paragrafosCondicoes = condicoesFinal.split('\n').map(linha => new Paragraph({ children: [new TextRun({ text: linha })] }));

    const doc = new Document({
        numbering: {
            config: [{
                reference: 'observacoes-numeracao',
                levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }]
            }]
        },
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    heading: HeadingLevel.HEADING_1,
                    children: [new TextRun({ text: 'SJ SOLAR', bold: true, size: 36 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 },
                    children: [new TextRun({ text: `Proposta Comercial Nº ${o.numero_orcamento || '-'}`, bold: true, size: 26 })]
                }),

                new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: 'DADOS DO CLIENTE', bold: true, size: 22 })] }),
                linhaDupla('Cliente', o.cliente_nome),
                linhaDupla('Endereço', `${o.cliente_endereco || ''} ${o.cliente_cidade || ''} - ${o.cliente_estado || ''}`),
                linhaDupla('Tipo de Serviço', o.tipo_servico_detalhado || o.tipo_orcamento),
                linhaDupla('Data de Emissão', dataExtenso),

                new Paragraph({
                    spacing: { before: 200, after: 200 },
                    children: [new TextRun({ text: `VALIDADE DA PROPOSTA: ${dataValidade}`, bold: true, color: 'B91C1C' })]
                }),

                new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: 'EQUIPAMENTO(S)', bold: true, size: 22 })] }),
                tabelaEquipamentos,

                new Paragraph({ spacing: { before: 300, after: 100 }, children: [new TextRun({ text: 'GARANTIAS E ESTIMATIVAS', bold: true, size: 22 })] }),
                linhaDupla(campoExtraLabel, campoExtraValor),
                linhaDupla('Garantia do Equipamento', o.garantia_equipamento),
                linhaDupla('Descrição da Instalação', (o.tipo_servico_detalhado || 'INSTALAÇÃO DE AQUECEDOR SOLAR').toUpperCase()),
                linhaDupla('Garantia da Instalação', o.garantia_instalacao),

                new Paragraph({ spacing: { before: 300, after: 100 }, children: [new TextRun({ text: 'OBSERVAÇÕES', bold: true, size: 22 })] }),
                ...htmlObservacoesParaParagrafosDocx(o.observacoes),

                new Paragraph({ spacing: { before: 300, after: 100 }, children: [new TextRun({ text: 'CONDIÇÕES DE PAGAMENTO', bold: true, size: 22 })] }),
                ...paragrafosCondicoes,

                new Paragraph({ spacing: { before: 300 }, children: [
                    new TextRun({ text: 'RESUMO FINANCEIRO', bold: true, size: 22 })
                ] }),
                ...(desconto && desconto > 0 ? [
                    linhaDupla('Subtotal', subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })),
                    linhaDupla('Desconto', o.desconto_tipo === 'percentual'
                        ? `${(o.desconto_valor || 0).toLocaleString('pt-BR')}% (${desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
                        : `- ${desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
                ] : []),
                new Paragraph({
                    spacing: { before: 150 },
                    children: [new TextRun({ text: `VALOR TOTAL: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, bold: true, size: 26 })]
                })
            ]
        }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Proposta_SJ_Solar_${o.numero_orcamento || 'sem_numero'}.docx`);
}
