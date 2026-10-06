// propostaTemplate.js
// Núcleo da exportação da PROPOSTA FOTOVOLTAICA a partir de um modelo DOCX
// com variáveis [assim].
// - DOCX: preenche o modelo no navegador (PizZip + docxtemplater).
// - PDF: envia o DOCX já preenchido para /api/docx-para-pdf (ConvertAPI).
//   O PDF fica em cache na memória: a pré-visualização e o download
//   usam a MESMA conversão (não gasta conversão duas vezes).
// Dados lidos de: orcamentos (state.localOrcamentos), proposta_equipamentos,
// proposta_kit_gerador e proposta_revisao. Nada novo no banco.
// Scripts globais necessários: PizZip, docxtemplater e saveAs (FileSaver).

import { state } from './state.js';
import { calcularTotalOrcamento } from './utils.js';

// ============================================================
// >>> AJUSTE AQUI: os modelos disponíveis (arquivos .docx na pasta /templates/)
// id: curto e único | nome: o que aparece no seletor
// ============================================================
export const MODELOS = [
    { id: 'modelo-a', nome: 'Modelo A', arquivo: 'modelo-a.docx' },
    { id: 'modelo-b', nome: 'Modelo B', arquivo: 'modelo-b.docx' }
];

// A escolha do modelo fica salva neste navegador: por proposta, e o último
// usado vira sugestão para as próximas.
const chaveModelo = id => `sjsolar:modelo:${id}`;
const CHAVE_ULTIMO = 'sjsolar:modelo:ultimo';

function lerLocal(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
}
function gravarLocal(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* sem armazenamento: ignora */ }
}

function modeloSalvo(propostaId) {
    const id = lerLocal(chaveModelo(propostaId)) || lerLocal(CHAVE_ULTIMO);
    return MODELOS.find(m => m.id === id) || null;
}

// ------------------------------------------------------------
// Formatação (o modelo já tem as unidades: R$, kWp, kWh/mês, Wp)
// ------------------------------------------------------------
const fmt = (n, min = 2, max = min) =>
    Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const dataBR = iso => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');

const dataExtenso = iso => {
    const d = new Date(iso + 'T00:00:00');
    return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};

const diasEntre = (a, b) =>
    Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

// ------------------------------------------------------------
// Variáveis do modelo
// ------------------------------------------------------------
export function montarVariaveis(o, equipamentos, kit) {
    const modulos = equipamentos.filter(e => e.tipo === 'MODULO');
    const inversores = equipamentos.filter(e => e.tipo === 'INVERSOR' || e.tipo === 'MICROINVERSOR');

    const kwp = modulos.reduce((a, e) => a + (Number(e.potencia_unitaria) || 0) * (Number(e.quantidade) || 0), 0) / 1000;
    const qtd = lista => lista.reduce((a, e) => a + (Number(e.quantidade) || 0), 0);

    const mod = modulos[0] || {};
    const inv = inversores[0] || {};
    const { total } = calcularTotalOrcamento(o);

    return {
        cliente_nome: o.cliente_nome,
        potencia_sistema: fmt(kwp),
        geracao_mensal: fmt(kit?.kit_geracao_kwh, 0, 2),
        // Descrição exatamente como cadastrada (o modelo já pode trazer a marca).
        // A marca vai separada, em [modulo_marca], só para quem quiser usar.
        modulo_descricao: mod.modelo || '',
        modulo_marca: mod.fabricante || '',
        modulo_potencia: fmt(mod.potencia_unitaria, 0, 2),
        modulo_quantidade: qtd(modulos),
        inversor_fabricante: inv.fabricante || '',
        inversor_descricao: inv.modelo || '',
        inversores_utilizados: qtd(inversores),
        // No modelo, [validade] vem depois de "Emissão da Proposta:" -> data de emissão.
        validade: dataBR(o.data_emissao),
        // Dias de validade (emissão até validade_proposta).
        quantidade: diasEntre(o.data_emissao, o.validade_proposta),
        // Campos novos (use no modelo se quiser): data de emissão, data final
        // de validade e dias de validade com nomes claros.
        // As variáveis antigas acima continuam valendo, então os modelos atuais não quebram.
        data_emissao: dataBR(o.data_emissao),
        validade_data: dataBR(o.validade_proposta),
        validade_dias: diasEntre(o.data_emissao, o.validade_proposta),
        preco: fmt(total),
        cidade: o.instalacao_cidade || o.cliente_cidade || '',
        data: dataExtenso(o.data_emissao)
    };
}

// ------------------------------------------------------------
// Carrega e confere uma proposta. Devolve null se não achar.
// { o, vars, equipamentos, kit, finalizada, ehFv, modelo, erros[], avisos[] }
// erros  = impedem exportar | avisos = só alertam
// ------------------------------------------------------------
export async function prepararProposta(id) {
    const o = state.localOrcamentos?.find(item => String(item.id) === String(id));
    if (!o) return null;

    const db = state.supabaseClient;
    const [eq, kitRes, rev] = await Promise.all([
        db.from('proposta_equipamentos').select('*').eq('proposta_id', o.id).order('ordem', { ascending: true }),
        db.from('proposta_kit_gerador').select('*').eq('proposta_id', o.id).maybeSingle(),
        db.from('proposta_revisao').select('finalizada').eq('proposta_id', o.id).maybeSingle()
    ]);
    if (eq.error) throw eq.error;
    if (kitRes.error) throw kitRes.error;

    const equipamentos = eq.data || [];
    const kit = kitRes.data || null;
    const finalizada = !rev.error && !!rev.data?.finalizada; // se a tabela não existir, ignora
    const vars = montarVariaveis(o, equipamentos, kit);
    const ehFv = equipamentos.some(e => e.tipo === 'MODULO');

    const erros = [];
    const avisos = [];
    if (!ehFv) erros.push('Esta proposta não tem módulos no Kit Gerador.');
    if (!o.data_emissao || !o.validade_proposta) erros.push('Faltam as datas de emissão e validade.');

    if (ehFv) {
        if (!equipamentos.some(e => e.tipo === 'INVERSOR' || e.tipo === 'MICROINVERSOR')) avisos.push('Nenhum inversor ou microinversor no Kit Gerador.');
        if (!(Number(kit?.kit_geracao_kwh) > 0)) avisos.push('A geração estimada (kWh/mês) está vazia.');
        if (!(calcularTotalOrcamento(o).total > 0)) avisos.push('O valor da proposta está zerado.');
        if (!finalizada) avisos.push('A proposta ainda não foi finalizada: o valor pode estar desatualizado.');
        const distintos = tipo => new Set(equipamentos.filter(e => tipo.includes(e.tipo)).map(e => String(e.produto_id ?? e.modelo))).size;
        if (distintos(['MODULO']) > 1) avisos.push('Há mais de um modelo de módulo. O modelo mostra só o primeiro (a quantidade é a soma).');
        if (distintos(['INVERSOR', 'MICROINVERSOR']) > 1) avisos.push('Há mais de um modelo de inversor. O modelo mostra só o primeiro (a quantidade é a soma).');
    }

    const p = { o, vars, equipamentos, kit, finalizada, ehFv, errosBase: erros, erros: [], avisos, modelo: modeloSalvo(o.id) };
    reconferir(p);
    return p;
}

// Erros = os da proposta + "escolha o modelo" quando nenhum está selecionado.
export function reconferir(p) {
    p.erros = [...p.errosBase, ...(p.modelo ? [] : ['Escolha o modelo da proposta.'])];
}

// Define o modelo (id) e lembra a escolha.
export function setModelo(p, id) {
    p.modelo = MODELOS.find(m => m.id === id) || null;
    if (p.modelo) {
        gravarLocal(chaveModelo(p.o.id), p.modelo.id);
        gravarLocal(CHAVE_ULTIMO, p.modelo.id);
    }
    reconferir(p);
}

// ------------------------------------------------------------
// DOCX
// ------------------------------------------------------------
export async function gerarDocxBlob(p) {
    if (!p.modelo) throw new Error('Escolha o modelo da proposta.');
    const resp = await fetch(`/templates/${p.modelo.arquivo}`);
    if (!resp.ok) throw new Error(`Modelo não encontrado: /templates/${p.modelo.arquivo}`);

    const doc = new window.docxtemplater(new window.PizZip(await resp.arrayBuffer()), {
        delimiters: { start: '[', end: ']' },
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => ''
    });
    doc.render(p.vars);

    return doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
}

// ------------------------------------------------------------
// PDF (com cache em memória, por proposta)
// ------------------------------------------------------------
const cachePdf = new Map();      // id -> { chave, blob, url }
const emAndamento = new Map();   // id -> { chave, promessa }

const chaveCache = p => JSON.stringify([p.vars, p.modelo?.id]);

export function pdfEmCache(p) {
    const c = cachePdf.get(String(p.o.id));
    return c && c.chave === chaveCache(p) ? c : null;
}

export function obterPdf(p) {
    const hit = pdfEmCache(p);
    if (hit) return Promise.resolve(hit);

    const id = String(p.o.id);
    const chave = chaveCache(p);
    const rodando = emAndamento.get(id);
    if (rodando && rodando.chave === chave) return rodando.promessa;

    const promessa = (async () => {
        const docx = await gerarDocxBlob(p);
        const r = await fetch('/api/docx-para-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: docx
        });
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const antigo = cachePdf.get(id);
        if (antigo) URL.revokeObjectURL(antigo.url);
        const novo = { chave, blob, url: URL.createObjectURL(blob) };
        cachePdf.set(id, novo);
        return novo;
    })().finally(() => emAndamento.delete(id));

    emAndamento.set(id, { chave, promessa });
    return promessa;
}

// ------------------------------------------------------------
// Download
// ------------------------------------------------------------
const nomeBase = o => `Proposta_SJ_Solar_${o.numero_orcamento || 'sem_numero'}`;

export async function baixar(p, formato) {
    if (formato === 'pdf') {
        saveAs((await obterPdf(p)).blob, `${nomeBase(p.o)}.pdf`);
    } else {
        saveAs(await gerarDocxBlob(p), `${nomeBase(p.o)}.docx`);
    }
}

// ------------------------------------------------------------
// Ponto de entrada usado por exportDocx.js / exportPdf.js (botões antigos).
// Devolve true se tratou o pedido (é proposta fotovoltaica, mesmo que
// tenha dado erro). Devolve false se NÃO é fotovoltaica -> o código
// antigo (orçamento avulso) continua a rodar.
// ------------------------------------------------------------
export async function exportarPropostaFv(id, formato) {
    let p;
    try {
        p = await prepararProposta(id);
    } catch (e) {
        console.error('Erro ao ler a proposta:', e.message);
        return false;
    }
    if (!p || !p.ehFv) return false;

    if (!p.modelo) {
        alert('Escolha o modelo da proposta na tela Exportar.');
        if (window.navegarPara) window.navegarPara(`/proposta/${p.o.id}/exportar`);
        return true;
    }
    if (p.erros.length) {
        alert('Não dá para exportar ainda:\n\n• ' + p.erros.join('\n• '));
        return true;
    }
    try {
        await baixar(p, formato);
    } catch (e) {
        alert(`Erro ao gerar ${formato.toUpperCase()}: ` + e.message);
    }
    return true;
}
