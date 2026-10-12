// contrato.js
// Card "Contrato de Serviço e Instalação" + lista de DOCUMENTOS do projeto.
// - Dados técnicos e preço: vêm da proposta selecionada (prepararProposta).
// - Modelos: /templates/documento_1.docx ... documento_4.docx (Docxtemplater).
// - DOCX: preenche o modelo no navegador. PDF: /api/docx-para-pdf (igual à proposta).
// - Arquivos gerados e anexos ficam no Supabase Storage (bucket "projeto-documentos")
//   e na tabela "projeto_documentos" (veja contrato.sql).
// Scripts globais necessários: PizZip, docxtemplater e saveAs.

import { state } from './state.js';
import { calcularTotalOrcamento } from './utils.js';
import { valorPorExtenso } from './extenso.js';
import { prepararProposta, gerarDocxBlob } from './propostaTemplate.js';

const BUCKET = 'projeto-documentos';

// >>> AJUSTE AQUI: os 4 modelos (nome = o que aparece no seletor)
export const MODELOS_CONTRATO = [
    { id: 'documento_1', nome: 'Contrato 1', arquivo: 'documento_1.docx' },
    { id: 'documento_2', nome: 'Contrato 2', arquivo: 'documento_2.docx' },
    { id: 'documento_3', nome: 'Contrato 3', arquivo: 'documento_3.docx' },
    { id: 'documento_4', nome: 'Contrato 4', arquivo: 'documento_4.docx' }
];

// ------------------------------------------------------------
// Utilitários
// ------------------------------------------------------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
const dataExtensoHoje = () => {
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const d = new Date();
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
};

const getProjeto = () => state.localProjetos.find(p => String(p.id) === String(state.projetoAtualId)) || null;
const getCliente = () => {
    const p = getProjeto();
    return p ? state.localClientes.find(c => String(c.id) === String(p.cliente_id)) || null : null;
};
const propostasDoProjeto = () => state.localOrcamentos.filter(o => String(o.projeto_id) === String(state.projetoAtualId));

// CPF (11 dígitos) ou CNPJ (14) a partir do cadastro do cliente.
const tipoDocDoCliente = c => {
    const n = String(c?.cpf_cnpj || '').replace(/\D/g, '').length;
    return n === 14 ? 'CNPJ' : n === 11 ? 'CPF' : '';
};

// ------------------------------------------------------------
// Dados do contratante e da contratada
// ------------------------------------------------------------
// Nomes das variáveis = os usados nos 4 modelos (documento_1 a documento_4).
// >>> AJUSTE AQUI se o nome dos campos do cadastro de clientes for outro.
function dadosContratante(c) {
    return {
        cliente_nome: c.nome || '',
        cliente_cnpj_cpf: c.cpf_cnpj || '',
        cliente_endereco: c.endereco_completo || '',
        cliente_numero: c.numero || '',
        cliente_complemento: c.complemento || '',
        cliente_bairro: c.bairro || '',
        cliente_cidade: c.cidade || '',
        cliente_estado: c.estado || '',
        cliente_cep: c.cep || ''
    };
}

// Só o documento_1 usa estas duas (foro da comarca).
// >>> AJUSTE AQUI: de onde vêm cidade/estado da SJ Solar. "state.empresa" é provisório.
function dadosContratada() {
    const e = state.empresa || {};
    return {
        empresa_cidade: e.cidade || '',
        empresa_estado: e.estado || ''
    };
}

// Potência do(s) inversor(es) em W. Se houver mais de um modelo: "5000 / 3000".
// >>> AJUSTE AQUI se a potência do inversor não estiver em "potencia_unitaria" (em W).
function potenciaInversores(equipamentos) {
    const lista = equipamentos.filter(e => e.tipo === 'INVERSOR' || e.tipo === 'MICROINVERSOR')
        .map(e => Number(e.potencia_unitaria) || 0).filter(Boolean);
    return [...new Set(lista)].map(n => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })).join(' / ');
}

// ------------------------------------------------------------
// Variáveis do modelo
// ------------------------------------------------------------
// Reaproveita as variáveis da proposta (potencia_sistema, modulos, inversores,
// preco...). O preço NÃO é recalculado: é o valor final da proposta.
export async function montarVariaveisContrato(propostaId, campos) {
    const p = await prepararProposta(propostaId);
    if (!p) throw new Error('Proposta não encontrada.');
    if (!p.ehFv) throw new Error('A proposta selecionada não tem módulos no Kit Gerador.');
    const cliente = getCliente();
    if (!cliente) throw new Error('Cliente do projeto não encontrado.');

    return {
        ...p.vars,                       // potencia_sistema, modulo_*, inversor_*, preco...
        ...dadosContratante(cliente),
        ...dadosContratada(),
        modulo_fabricante: p.vars.modulo_marca,
        inversor_potencia: potenciaInversores(p.equipamentos),
        // >>> AJUSTE AQUI: onde o tipo de telhado está salvo
        tipo_telhado: p.kit?.tipo_telhado ?? p.o.tipo_telhado ?? '',
        preco_por_extenso: campos.valorExtenso,
        doc_tipo: campos.docTipo,
        doc_pagamento: campos.formaPagamento,
        doc_prazo_dias: campos.prazoDias,
        doc_garantia_contratada: campos.garantiaMeses,
        doc_garantia_estrutura: campos.garantiaAnos,
        // Contrato: "Cidade, 12 de outubro de 2026" (substitui a data de emissão da proposta)
        data_emissao: dataExtensoHoje()
    };
}

// ------------------------------------------------------------
// Geração
// ------------------------------------------------------------
async function gerarArquivo(modelo, vars, formato) {
    const docx = await gerarDocxBlob({ modelo, vars });
    if (formato === 'docx') return docx;
    const r = await fetch('/api/docx-para-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: docx
    });
    if (!r.ok) throw new Error(await r.text());
    return r.blob();
}

// ------------------------------------------------------------
// Armazenamento (Storage + tabela projeto_documentos)
// ------------------------------------------------------------
async function salvarDocumento({ blob, nome, tipo, formato, propostaId = null }) {
    const db = state.supabaseClient;
    const path = `${state.projetoAtualId}/${Date.now()}_${nome.replace(/[^\w.\-]+/g, '_')}`;
    const up = await db.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || undefined });
    if (up.error) throw up.error;
    const ins = await db.from('projeto_documentos').insert({
        projeto_id: String(state.projetoAtualId),
        proposta_id: propostaId ? String(propostaId) : null,
        tipo, nome, formato, arquivo_path: path
    });
    if (ins.error) {
        await db.storage.from(BUCKET).remove([path]);
        throw ins.error;
    }
}

async function baixarDocumento(doc) {
    const { data, error } = await state.supabaseClient.storage.from(BUCKET)
        .createSignedUrl(doc.arquivo_path, 60, { download: doc.nome });
    if (error) throw error;
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = doc.nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function excluirDocumento(doc) {
    const db = state.supabaseClient;
    const rm = await db.storage.from(BUCKET).remove([doc.arquivo_path]);
    if (rm.error) throw rm.error;
    const del = await db.from('projeto_documentos').delete().eq('id', doc.id);
    if (del.error) throw del.error;
}

// ------------------------------------------------------------
// Lista de documentos
// ------------------------------------------------------------
let docsCache = [];

async function renderLista(container) {
    const { data, error } = await state.supabaseClient
        .from('projeto_documentos')
        .select('*')
        .eq('projeto_id', String(state.projetoAtualId))
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = `<p class="text-sm text-red-600">Erro ao carregar documentos: ${esc(error.message)}</p>`;
        return;
    }
    docsCache = data || [];

    if (docsCache.length === 0) {
        container.innerHTML = `
            <div class="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
                <p class="font-bold text-slate-500 uppercase tracking-wider text-sm">Nenhum documento criado</p>
            </div>`;
        return;
    }

    const linhas = docsCache.map(d => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-3 text-slate-700">${esc(d.nome)}</td>
            <td class="px-6 py-3 text-xs font-bold uppercase text-slate-500">${d.tipo === 'contrato' ? 'Contrato' : 'Anexo'}</td>
            <td class="px-6 py-3 text-xs font-bold uppercase text-slate-500">${esc(d.formato || '')}</td>
            <td class="px-6 py-3 text-slate-500">${new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
            <td class="px-6 py-3 text-center whitespace-nowrap">
                <button type="button" data-acao="baixar" data-id="${esc(d.id)}" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Baixar"><i class="fa-solid fa-download"></i></button>
                <button type="button" data-acao="excluir" data-id="${esc(d.id)}" class="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>`).join('');

    container.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table class="w-full text-left border-collapse text-sm">
                <thead>
                    <tr class="bg-slate-100 border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                        <th class="px-6 py-3">Arquivo</th>
                        <th class="px-6 py-3">Tipo</th>
                        <th class="px-6 py-3">Formato</th>
                        <th class="px-6 py-3">Data</th>
                        <th class="px-6 py-3 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>`;

    container.onclick = async (e) => {
        const btn = e.target.closest('[data-acao]');
        if (!btn) return;
        const doc = docsCache.find(d => String(d.id) === btn.dataset.id);
        if (!doc) return;
        try {
            if (btn.dataset.acao === 'baixar') await baixarDocumento(doc);
            if (btn.dataset.acao === 'excluir') {
                if (!confirm('Excluir este documento?')) return;
                await excluirDocumento(doc);
                await renderLista(container);
            }
        } catch (err) {
            alert('Erro: ' + err.message);
        }
    };
}

// ------------------------------------------------------------
// Card do contrato
// ------------------------------------------------------------
const INPUT = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400';
const LABEL = 'block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1';

function htmlCard() {
    const props = propostasDoProjeto();
    const optProps = props.map(o => `<option value="${esc(o.id)}">${esc(o.numero_orcamento || 'S/N')} — ${esc(o.tipo_servico_detalhado || '')} — ${brl(calcularTotalOrcamento(o).total)}</option>`).join('');
    const optModelos = MODELOS_CONTRATO.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');

    return `
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
            <div>
                <h3 class="font-bold text-slate-900 uppercase tracking-wider text-sm">Contrato de Serviço e Instalação</h3>
                <p class="text-xs text-slate-500">Preencha os dados e gere o documento.</p>
            </div>

            <div>
                <label class="${LABEL}">Proposta selecionada *</label>
                <select id="ct-proposta" class="${INPUT}">
                    <option value="">Selecione...</option>${optProps}
                </select>
                <p id="ct-valor" class="mt-1 text-xs text-slate-500"></p>
                ${props.length === 0 ? '<p class="mt-1 text-xs text-red-600">Este projeto ainda não tem proposta.</p>' : ''}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="${LABEL}">Modelo de contrato *</label>
                    <select id="ct-modelo" class="${INPUT}"><option value="">Selecione...</option>${optModelos}</select>
                </div>
                <div>
                    <label class="${LABEL}">Tipo de cliente *</label>
                    <select id="ct-doc-tipo" class="${INPUT}">
                        <option value="">Selecione...</option>
                        <option value="CPF">CPF</option>
                        <option value="CNPJ">CNPJ</option>
                    </select>
                </div>
                <div class="md:col-span-2">
                    <label class="${LABEL}">Valor por extenso * (confira)</label>
                    <input id="ct-extenso" type="text" class="${INPUT}">
                </div>
                <div class="md:col-span-2">
                    <label class="${LABEL}">Forma de pagamento *</label>
                    <input id="ct-pagamento" type="text" class="${INPUT}">
                </div>
                <div>
                    <label class="${LABEL}">Prazo de instalação (dias) *</label>
                    <input id="ct-prazo" type="number" min="1" class="${INPUT}">
                </div>
                <div>
                    <label class="${LABEL}">Garantia contratada (meses) *</label>
                    <input id="ct-garantia-servico" type="number" min="1" class="${INPUT}">
                </div>
                <div>
                    <label class="${LABEL}">Garantia da estrutura (anos) *</label>
                    <input id="ct-garantia-equip" type="number" min="1" class="${INPUT}">
                </div>
            </div>

            <div class="flex flex-wrap gap-2 items-center">
                <button type="button" id="ct-btn-docx" class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-indigo-700 transition-colors">
                    <i class="fa-solid fa-file-word mr-1"></i> Gerar DOCX
                </button>
                <button type="button" id="ct-btn-pdf" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase hover:bg-blue-700 transition-colors">
                    <i class="fa-solid fa-file-pdf mr-1"></i> Gerar PDF
                </button>
                <span id="ct-status" class="text-xs text-slate-500"></span>
            </div>
        </div>`;
}

function ligarCard(card, listaEl) {
    const $ = id => card.querySelector('#' + id);

    // Ao escolher a proposta: mostra o valor, sugere o extenso e o tipo de cliente.
    $('ct-proposta').addEventListener('change', () => {
        const o = propostasDoProjeto().find(x => String(x.id) === $('ct-proposta').value);
        if (!o) { $('ct-valor').textContent = ''; $('ct-extenso').value = ''; return; }
        const { total } = calcularTotalOrcamento(o);
        $('ct-valor').textContent = `Valor final da proposta: ${brl(total)}`;
        $('ct-extenso').value = valorPorExtenso(total);
        const tipo = tipoDocDoCliente(getCliente());
        if (tipo && !$('ct-doc-tipo').value) $('ct-doc-tipo').value = tipo;
    });

    const gerar = async (formato) => {
        const campos = {
            propostaId: $('ct-proposta').value,
            modeloId: $('ct-modelo').value,
            docTipo: $('ct-doc-tipo').value,
            valorExtenso: $('ct-extenso').value.trim(),
            formaPagamento: $('ct-pagamento').value.trim(),
            prazoDias: $('ct-prazo').value,
            garantiaMeses: $('ct-garantia-servico').value,
            garantiaAnos: $('ct-garantia-equip').value
        };
        const faltando = [];
        if (!campos.propostaId) faltando.push('Proposta');
        if (!campos.modeloId) faltando.push('Modelo de contrato');
        if (!campos.docTipo) faltando.push('Tipo de cliente');
        if (!campos.valorExtenso) faltando.push('Valor por extenso');
        if (!campos.formaPagamento) faltando.push('Forma de pagamento');
        if (!(Number(campos.prazoDias) > 0)) faltando.push('Prazo de instalação');
        if (!(Number(campos.garantiaMeses) > 0)) faltando.push('Garantia contratada');
        if (!(Number(campos.garantiaAnos) > 0)) faltando.push('Garantia da estrutura');
        if (faltando.length) {
            alert('Preencha:\n\n• ' + faltando.join('\n• '));
            return;
        }

        const botoes = [$('ct-btn-docx'), $('ct-btn-pdf')];
        botoes.forEach(b => b.disabled = true);
        $('ct-status').textContent = 'Gerando...';
        try {
            const modelo = MODELOS_CONTRATO.find(m => m.id === campos.modeloId);
            const vars = await montarVariaveisContrato(campos.propostaId, campos);
            const blob = await gerarArquivo(modelo, vars, formato);
            const o = propostasDoProjeto().find(x => String(x.id) === String(campos.propostaId));
            const nome = `Contrato_SJ_Solar_${o?.numero_orcamento || 'sem_numero'}_${slug(vars.cliente_nome)}.${formato}`;
            saveAs(blob, nome);
            try {
                await salvarDocumento({ blob, nome, tipo: 'contrato', formato, propostaId: campos.propostaId });
                await renderLista(listaEl);
                $('ct-status').textContent = 'Pronto. Arquivo salvo em Documentos.';
            } catch (e) {
                $('ct-status').textContent = '';
                alert('O arquivo foi baixado, mas não foi salvo em Documentos: ' + e.message);
            }
        } catch (e) {
            $('ct-status').textContent = '';
            alert(`Erro ao gerar ${formato.toUpperCase()}: ` + e.message);
        } finally {
            botoes.forEach(b => b.disabled = false);
        }
    };

    $('ct-btn-docx').addEventListener('click', () => gerar('docx'));
    $('ct-btn-pdf').addEventListener('click', () => gerar('pdf'));
}

// ------------------------------------------------------------
// Ponto de entrada: monta o conteúdo da sub-aba DOCUMENTOS
// ------------------------------------------------------------
export function renderDocumentosDoProjeto(container) {
    container.innerHTML = `
        <div id="ct-card"></div>
        <div class="flex items-center justify-between mt-6 mb-2">
            <h3 class="font-bold text-slate-900 uppercase tracking-wider text-sm">Documentos do projeto</h3>
            <button type="button" id="ct-btn-anexar" class="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold text-xs uppercase hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-paperclip mr-1"></i> Anexar arquivo
            </button>
            <input type="file" id="ct-input-anexo" class="hidden" multiple>
        </div>
        <div id="ct-lista"></div>`;

    const card = container.querySelector('#ct-card');
    const lista = container.querySelector('#ct-lista');
    card.innerHTML = htmlCard();
    ligarCard(card, lista);

    const input = container.querySelector('#ct-input-anexo');
    container.querySelector('#ct-btn-anexar').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
        const arquivos = Array.from(input.files || []);
        try {
            for (const f of arquivos) {
                const ext = (f.name.split('.').pop() || '').toLowerCase();
                await salvarDocumento({ blob: f, nome: f.name, tipo: 'anexo', formato: ext });
            }
            await renderLista(lista);
        } catch (e) {
            alert('Erro ao anexar: ' + e.message);
        } finally {
            input.value = '';
        }
    });

    renderLista(lista);
}
