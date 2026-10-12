// ui-controles.js
// UI própria para <select> e <input type="date">, no estilo do seletor de cidades.
// Vale para o SITE TODO, sem alterar as telas: o elemento nativo continua existindo
// (escondido), então .value, .options, addEventListener('change') e
// dispatchEvent(new Event('change')) seguem funcionando como sempre.
//
// - Selects novos (inclusive os criados depois, via innerHTML) são trocados sozinhos.
// - Para manter o controle nativo em algum campo: data-nativo no elemento.
// - Selects com "multiple" ou "size" > 1 não são trocados.
//
// Uso: import './ui-controles.js';  (uma vez, no main.js)

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const descSelect = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const descInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

const pad = n => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const fromIso = v => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};
const hojeIso = () => { const t = new Date(); return toIso(t.getFullYear(), t.getMonth(), t.getDate()); };

function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
}

// Separa as classes de layout (largura etc.) das de aparência do campo original.
function dividirClasses(classes) {
    const lista = String(classes || '').split(/\s+/).filter(Boolean).filter(c => c !== 'hidden');
    const layout = lista.filter(c => /^(w-|min-w-|max-w-|flex-|grow|shrink|col-span-|row-span-|self-|justify-self-|basis-|order-|m[trblxy]?-)/.test(c));
    const resto = lista.filter(c => !layout.includes(c) && !/^(w-|m[trblxy]?-)/.test(c));
    return { layout: layout.join(' '), campo: resto.join(' ') };
}

// ------------------------------------------------------------
// Controle de popovers: só um aberto por vez, fecha ao clicar fora / Esc
// ------------------------------------------------------------
const abertos = new Set();
function registrar(api) { abertos.add(api); return api; }
document.addEventListener('click', e => {
    abertos.forEach(a => {
        if (!a.wrap.isConnected) { abertos.delete(a); return; }
        if (!a.wrap.contains(e.target)) a.fechar();
    });
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') abertos.forEach(a => a.fechar());
});
const fecharOutros = exceto => abertos.forEach(a => { if (a !== exceto) a.fechar(); });

// ============================================================
// SELECT
// ============================================================
function melhorarSelect(sel) {
    if (sel.dataset.cs || sel.multiple || sel.size > 1 || 'nativo' in sel.dataset) return;
    sel.dataset.cs = '1';

    const { layout, campo } = dividirClasses(sel.className);
    const wrap = el('div', `relative ${layout || 'w-full'}`.trim());
    sel.after(wrap);
    sel.style.display = 'none';

    const btn = el('button', `${campo} w-full flex items-center justify-between gap-2 text-left bg-white cursor-pointer`);
    btn.type = 'button';
    const rotulo = el('span', 'flex-1 truncate');
    const seta = el('i', 'fa-solid fa-chevron-down text-xs text-slate-400');
    btn.append(rotulo, seta);

    const menu = el('div', 'hidden absolute left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden');
    const busca = el('input', 'w-full px-3 py-2 text-sm border-b border-slate-200 focus:outline-none');
    busca.type = 'text';
    busca.placeholder = 'Buscar...';
    const lista = el('div', 'max-h-60 overflow-auto');
    menu.append(busca, lista);
    wrap.append(btn, menu);

    let aberto = false;

    function montarLista() {
        const termo = busca.value.trim().toLowerCase();
        lista.replaceChildren();
        let achou = 0;
        Array.from(sel.options).forEach((o, i) => {
            if (o.hidden) return;
            if (termo && !o.textContent.toLowerCase().includes(termo)) return;
            achou++;
            const marcado = i === sel.selectedIndex;
            const b = el('button',
                'w-full text-left px-3 py-2 text-sm transition-colors ' +
                (o.disabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-amber-50 ') +
                (marcado ? 'bg-amber-50 font-bold' : '') +
                (o.value === '' && !marcado ? ' text-slate-400' : ''),
                o.textContent);
            b.type = 'button';
            if (!o.disabled) b.addEventListener('click', () => escolher(i));
            lista.appendChild(b);
        });
        if (!achou) lista.appendChild(el('div', 'text-xs text-slate-400 px-3 py-2', 'Nenhuma opção encontrada.'));
    }

    function atualizar() {
        const o = sel.options[sel.selectedIndex];
        rotulo.textContent = o ? o.textContent : '';
        rotulo.classList.toggle('text-slate-400', !o || o.value === '');
        btn.disabled = sel.disabled;
        btn.classList.toggle('opacity-60', sel.disabled);
        btn.classList.toggle('cursor-not-allowed', sel.disabled);
        wrap.classList.toggle('hidden', sel.classList.contains('hidden'));
        busca.classList.toggle('hidden', sel.options.length <= 8);
        if (aberto) montarLista();
    }

    function abrir() {
        if (sel.disabled) return;
        fecharOutros(api);
        aberto = true;
        busca.value = '';
        menu.classList.remove('hidden');
        montarLista();
        if (!busca.classList.contains('hidden')) busca.focus();
        const m = lista.querySelector('.font-bold');
        m?.scrollIntoView?.({ block: 'nearest' });
    }
    function fechar() { aberto = false; menu.classList.add('hidden'); }

    function escolher(i) {
        const mudou = sel.selectedIndex !== i;
        sel.selectedIndex = i;
        fechar();
        atualizar();
        if (mudou) {
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    const api = registrar({ wrap, fechar });
    btn.addEventListener('click', () => (aberto ? fechar() : abrir()));
    busca.addEventListener('input', montarLista);

    // Mantém a tela em dia quando o código mexe no select nativo.
    Object.defineProperty(sel, 'value', {
        configurable: true,
        get() { return descSelect.get.call(sel); },
        set(v) { descSelect.set.call(sel, v); atualizar(); }
    });
    sel.addEventListener('change', atualizar);
    new MutationObserver(atualizar).observe(sel, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'disabled']
    });

    atualizar();
}

// ============================================================
// DATA
// ============================================================
function melhorarData(inp) {
    if (inp.dataset.cs || 'nativo' in inp.dataset) return;
    inp.dataset.cs = '1';

    const { layout, campo } = dividirClasses(inp.className);
    const wrap = el('div', `relative ${layout || 'w-full'}`.trim());
    inp.after(wrap);
    inp.style.display = 'none';

    const txt = el('input', `${campo} w-full pr-9`);
    txt.type = 'text';
    txt.inputMode = 'numeric';
    txt.placeholder = 'dd/mm/aaaa';
    txt.maxLength = 10;
    txt.autocomplete = 'off';
    const icone = el('button', 'absolute right-2 top-1/2 -translate-y-1/2 px-1 text-slate-400 hover:text-slate-700');
    icone.type = 'button';
    icone.append(el('i', 'fa-regular fa-calendar'));

    const cal = el('div', 'hidden absolute left-0 z-50 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3');
    wrap.append(txt, icone, cal);

    let aberto = false;
    let vista = null; // { y, m }

    const dentroDoLimite = iso => (!inp.min || iso >= inp.min) && (!inp.max || iso <= inp.max);

    function gravar(iso) {
        descInput.set.call(inp, iso);
        atualizar();
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function atualizar() {
        const v = fromIso(descInput.get.call(inp));
        txt.value = v ? `${pad(v.d)}/${pad(v.m + 1)}/${v.y}` : '';
        txt.disabled = inp.disabled;
        icone.disabled = inp.disabled;
        wrap.classList.toggle('hidden', inp.classList.contains('hidden'));
        if (aberto) desenhar();
    }

    function botao(classe, conteudo, aoClicar) {
        const b = el('button', classe);
        b.type = 'button';
        if (typeof conteudo === 'string') b.textContent = conteudo; else b.append(conteudo);
        b.addEventListener('click', aoClicar);
        return b;
    }

    function desenhar() {
        const sel = fromIso(descInput.get.call(inp));
        const hoje = fromIso(hojeIso());
        const mover = (dm, dy) => {
            const total = vista.y * 12 + vista.m + dm + dy * 12;
            vista = { y: Math.floor(total / 12), m: total % 12 };
            desenhar();
        };
        const nav = 'w-7 h-7 rounded hover:bg-amber-50 text-slate-600 text-xs';

        const topo = el('div', 'flex items-center justify-between mb-2');
        topo.append(
            botao(nav, '«', () => mover(0, -1)),
            botao(nav, '‹', () => mover(-1, 0)),
            el('span', 'flex-1 text-center text-sm font-bold text-slate-800', `${MESES[vista.m]} ${vista.y}`),
            botao(nav, '›', () => mover(1, 0)),
            botao(nav, '»', () => mover(0, 1))
        );

        const grade = el('div', 'grid grid-cols-7 gap-0.5 text-center');
        DIAS.forEach(d => grade.appendChild(el('div', 'text-xs font-bold text-slate-400 py-1', d)));
        const primeiro = new Date(vista.y, vista.m, 1).getDay();
        const total = new Date(vista.y, vista.m + 1, 0).getDate();
        for (let i = 0; i < primeiro; i++) grade.appendChild(el('div'));
        for (let d = 1; d <= total; d++) {
            const iso = toIso(vista.y, vista.m, d);
            const ehSel = sel && sel.y === vista.y && sel.m === vista.m && sel.d === d;
            const ehHoje = hoje.y === vista.y && hoje.m === vista.m && hoje.d === d;
            const ok = dentroDoLimite(iso);
            const b = botao(
                'h-8 rounded text-sm transition-colors ' +
                (ehSel ? 'bg-amber-400 font-bold text-slate-950 ' : ok ? 'hover:bg-amber-50 text-slate-700 ' : 'text-slate-300 cursor-not-allowed ') +
                (ehHoje && !ehSel ? 'ring-1 ring-amber-400' : ''),
                String(d),
                () => { if (!ok) return; gravar(iso); fechar(); }
            );
            if (!ok) b.disabled = true;
            grade.appendChild(b);
        }

        const rodape = el('div', 'flex justify-between mt-2 pt-2 border-t border-slate-100');
        const acao = 'text-xs font-bold uppercase tracking-wider text-amber-600 hover:text-amber-700';
        rodape.appendChild(botao(acao, 'Hoje', () => { if (dentroDoLimite(hojeIso())) { gravar(hojeIso()); fechar(); } }));
        if (!inp.required) rodape.appendChild(botao(acao, 'Limpar', () => { gravar(''); fechar(); }));

        cal.replaceChildren(topo, grade, rodape);
    }

    function abrir() {
        if (inp.disabled) return;
        fecharOutros(api);
        const v = fromIso(descInput.get.call(inp)) || fromIso(hojeIso());
        vista = { y: v.y, m: v.m };
        aberto = true;
        cal.classList.remove('hidden');
        desenhar();
    }
    function fechar() { aberto = false; cal.classList.add('hidden'); }

    const api = registrar({ wrap, fechar });
    icone.addEventListener('click', () => (aberto ? fechar() : abrir()));
    txt.addEventListener('focus', abrir);

    // Digitação com máscara dd/mm/aaaa
    txt.addEventListener('input', () => {
        const n = txt.value.replace(/\D/g, '').slice(0, 8);
        txt.value = n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`
            : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
        if (n.length === 0) { gravar(''); return; }
        if (n.length < 8) return;
        const d = +n.slice(0, 2), m = +n.slice(2, 4) - 1, y = +n.slice(4);
        const data = new Date(y, m, d);
        const valida = data.getFullYear() === y && data.getMonth() === m && data.getDate() === d && y >= 1900;
        const iso = toIso(y, m, d);
        if (valida && dentroDoLimite(iso)) {
            vista = { y, m };
            gravar(iso);
        }
    });
    // Se ficou incompleto/inválido, volta ao valor real.
    txt.addEventListener('blur', () => setTimeout(atualizar, 0));
    txt.addEventListener('keydown', e => { if (e.key === 'Enter') { fechar(); txt.blur(); } });

    Object.defineProperty(inp, 'value', {
        configurable: true,
        get() { return descInput.get.call(inp); },
        set(v) { descInput.set.call(inp, v); atualizar(); }
    });
    inp.addEventListener('change', atualizar);
    new MutationObserver(atualizar).observe(inp, { attributes: true, attributeFilter: ['class', 'disabled'] });

    atualizar();
}

// ============================================================
// Aplicação no site todo
// ============================================================
export function melhorarControles(raiz = document) {
    if (raiz.matches?.('select')) melhorarSelect(raiz);
    else if (raiz.matches?.('input[type="date"]')) melhorarData(raiz);
    raiz.querySelectorAll?.('select').forEach(melhorarSelect);
    raiz.querySelectorAll?.('input[type="date"]').forEach(melhorarData);
}

function iniciar() {
    melhorarControles(document);
    new MutationObserver(muts => {
        for (const m of muts) {
            m.addedNodes.forEach(n => { if (n.nodeType === 1) melhorarControles(n); });
        }
    }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
