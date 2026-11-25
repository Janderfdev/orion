/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   ORION AI V5.5.0 — Espaço de Trabalho Multitarefa (pages/js/orion-wm.js)

   Janelas de verdade para as ferramentas do ORION: ORION Code, ORION API, Mercado e Multitarefa.
   O conteúdo é o MESMO dos painéis existentes (registro window.ORION_PANELS, em orion-v52.js, e window.ORION_TASK_APP, em orion-v5.js): aqui só
   mudamos o contêiner. Nada é duplicado e nenhum recurso foi removido.

   • até 4 janelas VISÍVEIS ao mesmo tempo (as minimizadas não contam)
   • arrastar pela barra de título · redimensionar por 8 bordas/cantos · minimizar · restaurar · fechar
   • clicar numa janela a traz para a frente · as janelas nunca saem da área útil
   • "Organizar" distribui as janelas visíveis sem sobreposição (1, 2, 3 ou 4)
   • posição e tamanho de cada janela ficam salvos neste navegador
   • teclado: com a barra de título em foco, as setas movem a janela e Shift + setas redimensiona
   • a barra do espaço de trabalho mostra o estado REAL da ORION (pronta, ouvindo, pensando, falando, erro), lido da própria Orb
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const U = window.ORION_UI, REG = window.ORION_PANELS;
  if (!U || !REG) return;
  const { h, svg, ICON, T } = U;

  const MAX_VISIBLE = 4, MIN_W = 320, MIN_H = 240, GAP = 12, STEP = 16, KEY = 'orion_wm_v1';
  const APPS = {
    code: { panel: 'idePanel' },
    api: { panel: 'apiPanel' },
    market: { panel: 'marketPanel', btn: 'marketBtn' },
    tasks: { custom: true },
  };
  const ORDER = ['code', 'api', 'market', 'tasks'];
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const $ = id => document.getElementById(id);

  /* ── textos (a interface troca de idioma sem recarregar) ── */
  const L = {
    pt: { min: 'Minimizar', restore: 'Restaurar', close: 'Fechar', arrange: 'Organizar janelas', limit: 'Há 4 janelas visíveis. Minimize ou feche uma para abrir outra.',
      move: 'Mover a janela com as setas. Shift e setas redimensionam.', count: '{n}/4 visíveis', bar: 'Espaço de trabalho', err: 'Não foi possível abrir esta janela.',
      st: { standby: 'Pronta', listening: 'Ouvindo', processing: 'Pensando', speaking: 'Falando', error: 'Erro' }, ctl: 'Controles da janela' },
    en: { min: 'Minimize', restore: 'Restore', close: 'Close', arrange: 'Arrange windows', limit: 'Four windows are visible. Minimize or close one to open another.',
      move: 'Move the window with the arrow keys. Shift and arrows resize it.', count: '{n}/4 visible', bar: 'Workspace', err: 'Couldn’t open this window.',
      st: { standby: 'Ready', listening: 'Listening', processing: 'Thinking', speaking: 'Speaking', error: 'Error' }, ctl: 'Window controls' },
  };
  const lang = () => (document.documentElement.lang || 'en').slice(0, 2) === 'pt' ? 'pt' : 'en';
  const t = k => L[lang()][k];

  /* ── ícones próprios (mesma linguagem de traço dos demais) ── */
  const IC = {
    min: '<path d="M6 17h12"/>', restore: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
  };

  /* ── camada das janelas e barra do espaço de trabalho ── */
  const layer = h('div', { id: 'wmLayer', 'aria-label': 'ORION' });
  const stateDot = h('span', { class: 'wm-dot', 'data-state': 'standby' });
  const stateTxt = h('span', { class: 'wm-statetxt' });
  const chips = h('div', { class: 'wm-chips' });
  const countEl = h('span', { class: 'wm-count' });
  const msgEl = h('span', { class: 'wm-msg', role: 'status', 'aria-live': 'polite' });
  const arrangeBtn = h('button', { class: 'wm-tool', type: 'button', onclick: () => arrange() }, svg(IC.grid, 16));
  const bar = h('div', { id: 'wmBar', role: 'toolbar', hidden: true }, h('div', { class: 'wm-state' }, stateDot, stateTxt), chips, arrangeBtn, countEl, msgEl);
  document.body.append(layer, bar);

  const wins = new Map();            // id -> { id, el, bar, content, sub, titleEl, min, closed, g:{x,y,w,h} }
  let zTop = 10, activeId = null, msgTimer = 0;

  /* ── geometria ── */
  const bounds = () => ({ w: Math.max(0, layer.clientWidth || (window.innerWidth - 32)), h: Math.max(0, layer.clientHeight || (window.innerHeight - 152)) });
  const fit = (g, B) => {
    const minW = Math.min(MIN_W, B.w), minH = Math.min(MIN_H, B.h);
    g.w = clamp(Math.round(g.w), minW, B.w); g.h = clamp(Math.round(g.h), minH, B.h);
    g.x = clamp(Math.round(g.x), 0, B.w - g.w); g.y = clamp(Math.round(g.y), 0, B.h - g.h);
    return g;
  };
  const paint = w => { const s = w.el.style; s.left = w.g.x + 'px'; s.top = w.g.y + 'px'; s.width = w.g.w + 'px'; s.height = w.g.h + 'px'; };
  const store = (() => { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } })();
  const save = () => {
    wins.forEach(w => { store[w.id] = { x: w.g.x, y: w.g.y, w: w.g.w, h: w.g.h }; });
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (_) { }
  };
  const saved = id => { const s = store[id]; return s && [s.x, s.y, s.w, s.h].every(Number.isFinite) ? { x: s.x, y: s.y, w: s.w, h: s.h } : null; };
  const visible = () => [...wins.values()].filter(w => !w.min);

  function firstGeometry(id) {
    const B = bounds(), n = visible().length;
    const g = saved(id) || (() => {
      const w = Math.min(Math.round(B.w * 0.62), 920), hh = Math.min(Math.round(B.h * 0.8), 640), off = (n % 4) * 28 - 42;
      return { w, h: hh, x: Math.round((B.w - w) / 2) + off, y: Math.round((B.h - hh) / 2) + off };
    })();
    return fit(g, B);
  }

  /* ── organizar: 1 = tela cheia, 2 = lado a lado, 3 = uma grande + duas, 4 = 2×2 (em telas estreitas, empilha) ── */
  function layout(n, B) {
    const wide = B.w >= 760, cols = (c) => (B.w - GAP * (c - 1)) / c, rows = (r) => (B.h - GAP * (r - 1)) / r;
    const R = (x, y, w, hh) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) });
    if (n <= 1) return [R(0, 0, B.w, B.h)];
    if (!wide) { const hh = rows(n); return Array.from({ length: n }, (_, i) => R(0, i * (hh + GAP), B.w, hh)); }
    if (n === 2) { const w = cols(2); return [R(0, 0, w, B.h), R(w + GAP, 0, w, B.h)]; }
    if (n === 3) { const w = cols(2), hh = rows(2); return [R(0, 0, w, B.h), R(w + GAP, 0, w, hh), R(w + GAP, hh + GAP, w, hh)]; }
    const w = cols(2), hh = rows(2);
    return [R(0, 0, w, hh), R(w + GAP, 0, w, hh), R(0, hh + GAP, w, hh), R(w + GAP, hh + GAP, w, hh)];
  }
  function arrange() {
    const vis = visible().sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    if (!vis.length) return;
    const B = bounds(), rects = layout(vis.length, B);
    layer.classList.add('anim');
    vis.forEach((w, i) => { w.g = fit(rects[i], B); paint(w); });
    setTimeout(() => layer.classList.remove('anim'), 420);
    save();
  }

  /* ── foco, estado e barra ── */
  function focus(id) {
    const w = wins.get(id); if (!w || w.min) return;
    activeId = id; w.el.style.zIndex = ++zTop;
    wins.forEach(o => o.el.classList.toggle('focus', o === w));
    renderBar();
  }
  const titleOf = id => APPS[id].custom ? window.ORION_TASK_APP.title() : REG[APPS[id].panel].title();
  const iconNode = id => {
    if (APPS[id].custom) { const s = document.createElement('span'); s.className = 'wm-svg'; s.innerHTML = window.ORION_TASK_APP.iconHtml; return s; }
    return svg(REG[APPS[id].panel].icon, 17);
  };
  function note(text) { msgEl.textContent = text || ''; clearTimeout(msgTimer); if (text) msgTimer = setTimeout(() => { msgEl.textContent = ''; }, 4200); }
  function renderBar() {
    bar.hidden = wins.size === 0;
    document.body.classList.toggle('wm-active', visible().length > 0);
    chips.replaceChildren(...ORDER.filter(id => wins.has(id)).map(id => {
      const w = wins.get(id);
      return h('button', { class: 'wm-chip' + (w.min ? ' min' : '') + (id === activeId && !w.min ? ' on' : ''), type: 'button', 'aria-pressed': String(!w.min), title: (w.min ? t('restore') + ': ' : '') + titleOf(id),
        onclick: () => { if (w.min) restore(id); else if (id !== activeId) focus(id); else minimize(id); } }, iconNode(id), h('span', {}, titleOf(id)));
    }));
    arrangeBtn.setAttribute('aria-label', t('arrange')); arrangeBtn.title = t('arrange'); arrangeBtn.disabled = visible().length < 1;
    countEl.textContent = t('count').replace('{n}', visible().length);
    const mb = $('marketBtn'); if (mb) mb.setAttribute('aria-pressed', String(!!(wins.get('market') && !wins.get('market').min)));
  }

  /* ── ações ── */
  function minimize(id) {
    const w = wins.get(id); if (!w || w.min) return;
    w.min = true; w.el.classList.add('min'); w.el.setAttribute('aria-hidden', 'true');
    if (activeId === id) { activeId = null; const next = visible().sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0]; if (next) focus(next.id); }
    renderBar();
  }
  function restore(id) {
    const w = wins.get(id); if (!w) return;
    if (w.min && visible().length >= MAX_VISIBLE) { note(t('limit')); return; }
    w.min = false; w.el.classList.remove('min'); w.el.removeAttribute('aria-hidden');
    w.g = fit(w.g, bounds()); paint(w); focus(id);
  }
  function close(id) {
    const w = wins.get(id); if (!w) return;
    w.closed = true; save();
    const opts = !APPS[id].custom && REG[APPS[id].panel]; if (opts && opts.onClose) { try { opts.onClose(); } catch (_) { } }
    w.el.remove(); wins.delete(id);
    if (activeId === id) { activeId = null; const next = visible().sort((a, b) => b.el.style.zIndex - a.el.style.zIndex)[0]; if (next) focus(next.id); }
    renderBar();
  }

  /* ── arrastar e redimensionar (Pointer Events: mouse, toque e caneta) ── */
  function drag(e, w, mode) {
    if (e.button > 0) return;
    e.preventDefault(); focus(w.id);
    const B = bounds(), s = { ...w.g }, sx = e.clientX, sy = e.clientY;
    layer.classList.add('dragging');
    const move = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy, g = { ...s };
      if (mode === 'move') { g.x = s.x + dx; g.y = s.y + dy; }
      else {
        const minW = Math.min(MIN_W, B.w), minH = Math.min(MIN_H, B.h);
        if (mode.includes('e')) g.w = clamp(s.w + dx, minW, B.w - s.x);
        if (mode.includes('s')) g.h = clamp(s.h + dy, minH, B.h - s.y);
        if (mode.includes('w')) { const nx = clamp(s.x + dx, 0, s.x + s.w - minW); g.w = s.w + (s.x - nx); g.x = nx; }
        if (mode.includes('n')) { const ny = clamp(s.y + dy, 0, s.y + s.h - minH); g.h = s.h + (s.y - ny); g.y = ny; }
      }
      w.g = fit(g, B); paint(w);
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); layer.classList.remove('dragging'); save(); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
  function keys(e, w) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const g = { ...w.g };
    if (e.shiftKey) { g.w += d[0] * STEP; g.h += d[1] * STEP; } else { g.x += d[0] * STEP; g.y += d[1] * STEP; }
    w.g = fit(g, bounds()); paint(w); save();
  }

  /* ── abrir ── */
  function create(id) {
    const app = APPS[id];
    const opts = app.custom ? window.ORION_TASK_APP : REG[app.panel];
    if (!opts) return null;
    const titleEl = h('b', {}, titleOf(id)), sub = h('small', {});
    const content = h('div', { class: 'v52-body wm-content' });
    const minBtn = h('button', { class: 'wm-btn', type: 'button', 'aria-label': t('min'), title: t('min'), onclick: () => minimize(id) }, svg(IC.min, 15));
    const closeBtn = h('button', { class: 'wm-btn x', type: 'button', 'aria-label': t('close'), title: t('close'), onclick: () => close(id) }, svg(IC.x, 15));
    const barEl = h('header', { class: 'wm-bar', tabindex: '0', 'aria-label': titleOf(id) + '. ' + t('move') },
      h('span', { class: 'wm-ico' }, iconNode(id)), h('div', { class: 'wm-ttl' }, titleEl, sub), h('div', { class: 'wm-ctl', role: 'group', 'aria-label': t('ctl') }, minBtn, closeBtn));
    const el = h('section', { class: 'wm-win', role: 'group', 'aria-label': titleOf(id), 'data-app': id }, barEl, h('div', { class: 'wm-body' }, content),
      ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(dir => h('i', { class: 'wm-rz wm-rz-' + dir, 'data-dir': dir, 'aria-hidden': 'true' })));
    const w = { id, el, bar: barEl, content, sub, titleEl, min: false, closed: false, g: firstGeometry(id) };
    wins.set(id, w);
    layer.appendChild(el); paint(w);
    el.addEventListener('pointerdown', () => { if (activeId !== id) focus(id); }, true);
    barEl.addEventListener('pointerdown', e => { if (!e.target.closest('.wm-ctl')) drag(e, w, 'move'); });
    barEl.addEventListener('dblclick', e => { if (!e.target.closest('.wm-ctl')) arrange(); });
    barEl.addEventListener('keydown', e => keys(e, w));
    el.querySelectorAll('.wm-rz').forEach(r => r.addEventListener('pointerdown', e => drag(e, w, r.dataset.dir)));
    // conteúdo: o MESMO build do painel (corpo, subtítulo, "ainda está aberta?")
    const ctx = { body: content, sub: s => { sub.textContent = s || ''; }, alive: () => !w.closed };
    try {
      if (app.custom) {
        const card = h('div', { class: 'wm-taskcard' }, h('header', { class: 'set-head' }, h('span', { class: 'ico' }), h('div', {}, h('h2', {}), h('p', {})), h('button', { class: 'icon-btn', type: 'button', hidden: true })), h('div', { class: 'orb-frame-body' }));
        content.append(card); content.classList.add('wm-task'); window.ORION_TASK_APP.mount(card);
      } else {
        const r = opts.build(ctx);
        if (r && typeof r.catch === 'function') r.catch(() => { if (!w.closed) content.replaceChildren(h('p', { class: 'v52-msg', 'data-kind': 'err' }, t('err'))); });
      }
    } catch (_) { content.replaceChildren(h('p', { class: 'v52-msg', 'data-kind': 'err' }, t('err'))); }
    return w;
  }
  function open(id) {
    if (!APPS[id]) return false;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));   // fecha qualquer painel cheio aberto (um por vez), como os demais painéis
    let w = wins.get(id);
    if (w) { if (w.min) restore(id); else focus(id); return true; }
    if (visible().length >= MAX_VISIBLE) { note(t('limit')); renderBar(); return false; }
    w = create(id);
    if (!w) return false;
    focus(id); renderBar();
    return true;
  }
  function toggle(id) {
    const w = wins.get(id);
    if (!w) return open(id);
    if (w.min) return restore(id);
    if (activeId !== id) return focus(id);
    minimize(id);
  }

  /* ── estado real da ORION (a Orb já publica data-state) ── */
  const zone = $('orbZone');
  const showState = () => {
    const s = (zone && zone.dataset.state) || 'standby', key = ['standby', 'listening', 'processing', 'speaking', 'error'].includes(s) ? s : 'standby';
    stateDot.dataset.state = key; stateTxt.textContent = t('st')[key]; bar.dataset.state = key;
  };
  if (zone) new MutationObserver(showState).observe(zone, { attributes: true, attributeFilter: ['data-state'] });
  showState();

  /* ── idioma e tamanho da tela ── */
  new MutationObserver(() => {
    wins.forEach(w => { const ttl = titleOf(w.id); w.titleEl.textContent = ttl; w.el.setAttribute('aria-label', ttl); w.bar.setAttribute('aria-label', ttl + '. ' + t('move')); });
    showState(); renderBar();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { const B = bounds(); wins.forEach(w => { w.g = fit(w.g, B); paint(w); }); }); });
  window.addEventListener('pagehide', save);

  window.ORION_WM = { open, close, toggle, minimize, restore, arrange, focus, isOpen: id => wins.has(id), isVisible: id => !!wins.get(id) && !wins.get(id).min, list: () => [...wins.keys()], MAX_VISIBLE };
})();
