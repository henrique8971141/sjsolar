// supabase.js
// Cria o cliente Supabase e sincroniza as 4 tabelas (clientes, projetos,
// produtos_servicos, orcamentos) para os caches em memória de state.js.
// A biblioteca @supabase/supabase-js é carregada via <script> global no
// index.html, então usamos o objeto global `supabase` normalmente.

import { SUPABASE_URL, SUPABASE_KEY, state } from './state.js';
import { renderDashboard } from './dashboard.js';
import { renderOrcamentos } from './orcamentos-list.js';
import { renderClientes } from './clientes.js';
import { renderCatalog } from './catalogo.js';
import { populateClienteDropdown } from './clientes.js';
import { populateProjetoDropdowns } from './projetos.js';
import { updateDatalist } from './catalogo.js';

export async function initSupabase() {
    try {
        state.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        await syncFromSupabase();
    } catch (err) {
        console.error(err);
        alert("Erro na conexão: falha ao sincronizar com o servidor Supabase.");
    }
}

export async function syncFromSupabase() {
    if (!state.supabaseClient) return;
    try {
        // Sincronizar Clientes
        const { data: clientesData, error: errCli } = await state.supabaseClient.from('clientes').select('*').order('nome');
        if (errCli) throw errCli;
        state.localClientes = clientesData || [];

        // Sincronizar Projetos
        const { data: projetosData, error: errProj } = await state.supabaseClient
            .from('projetos')
            .select(`*, clientes (nome)`)
            .order('created_at', { ascending: false });
        if (errProj) throw errProj;
        state.localProjetos = (projetosData || []).map(p => ({
            id: p.id,
            cliente_id: p.cliente_id,
            cliente_nome: p.clientes?.nome || '',
            nome: p.nome,
            descricao: p.descricao || ''
        }));

        // Sincronizar Catálogo
        const { data: catalogData, error: errCat } = await state.supabaseClient.from('produtos_servicos').select('*').order('descricao');
        if (errCat) throw errCat;
        state.localCatalog = catalogData || [];

        // Sincronizar Orçamentos
        const { data: orcamentosData, error: errOrc } = await state.supabaseClient
            .from('orcamentos')
            .select(`*, clientes (nome, telefone, email, endereco_completo, cidade, estado)`)
            .order('created_at', { ascending: false });
        if (errOrc) throw errOrc;

        state.localOrcamentos = (orcamentosData || []).map(o => ({
            id: o.id,
            numero_orcamento: o.numero_orcamento,
            cliente_id: o.cliente_id,
            cliente_nome: o.clientes?.nome || 'Cliente não identificado',
            cliente_tel: o.clientes?.telefone || '',
            cliente_email: o.clientes?.email || '',
            cliente_endereco: o.clientes?.endereco_completo || '',
            cliente_cidade: o.clientes?.cidade || '',
            cliente_estado: o.clientes?.estado || '',
            projeto_id: o.projeto_id || null,
            principal: !!o.principal,
            tipo_orcamento: o.tipo_orcamento,
            tipo_servico_detalhado: o.tipo_servico_detalhado,
            status_comercial: o.status_comercial,
            status_execucao: o.status_execucao,
            campo_extra_label: o.campo_extra_label || 'Estimativa de banhos/dia',
            campo_extra_valor: o.campo_extra_valor || '',
            garantia_equipamento: o.garantia_equipamento || '',
            garantia_instalacao: o.garantia_instalacao || '',
            valor_equipamentos: parseFloat(o.valor_equipamentos || 0),
            valor_mao_de_obra: parseFloat(o.valor_mao_de_obra || 0),
            valor_outros: parseFloat(o.valor_outros || 0),
            desconto_valor: parseFloat(o.desconto_valor || 0),
            desconto_tipo: o.desconto_tipo || 'valor',
            margem_lucro: parseFloat(o.margem_lucro || 0),
            condicoes_pagamento: o.condicoes_pagamento || '',
            pagamentos_json: o.pagamentos_json || [],
            observacoes: o.observacoes || '',
            data_emissao: o.data_emissao,
            validade_proposta: o.validade_proposta,
            equipamentos_json: o.equipamentos_json || []
        }));

        renderDashboard();
        renderOrcamentos();
        renderClientes();
        renderCatalog();
        populateClienteDropdown();
        populateProjetoDropdowns();
        updateDatalist();
    } catch (err) {
        console.error("Erro na leitura das tabelas:", err.message);
    }
}
