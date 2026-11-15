/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.2.0 — Duas abas lado a lado (pages/js/orion-split.js)

   Qualquer módulo aberto (Configurações, Multitarefa, ORION API, Resumo do Dia, Planos) ganha, no cabeçalho, o botão "Abrir ao lado".
   Ele lista os outros módulos; o escolhido abre ao lado do atual, cada um num cartão igual ao de uma aba normal
   (o primeiro à esquerda, o segundo à direita). Fechar um deles devolve o outro à tela cheia. Esc fecha os dois.
   Com duas abas abertas: arrastar o divisor (ou usar as setas) ajusta o tamanho de cada uma (30% a 70%, lembrado neste aparelho;
   clique duplo volta a 50%), e o botão "Trocar de lado" inverte a posição.

   Este arquivo NÃO reescreve os módulos: só (1) impede, durante a abertura "ao lado", o "só um painel por vez" que cada módulo faz,
   (2) marca os dois painéis abertos com data-split="a|b" (o CSS em orion.html faz o layout) e (3) avisa o dock quantas abas há
   (ORION_DOCK.setTabs). Carregar ANTES do orb-frame.js: o bloqueio do Esc sintético precisa ser o primeiro ouvinte.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const S = window.ORION_SPLIT = { opening: false };

  /* Os módulos fecham os outros disparando um Esc "de mentirinha" (isTrusted = false). Enquanto abrimos ao lado, ele é ignorado. */
  document.addEventListener('keydown', e => { if (S.opening && !e.isTrusted) e.stopImmediatePropagation(); }, true);

  const MODS = { settings: '#settingsPanel', tasks: '#taskPanel', api: '#apiPanel', news: '#newsPanel', plans: '#planPanel', code: '#codePanel' };
  const LABEL = { settings: 'set.title', tasks: 'task.name', api: 'api.title', news: 'news.title', plans: 'plans.title' };
  const click = id => { const b = document.getElementById(id); if (b) b.click(); };
  const OPEN = {
    settings: () => click('gearBtn'),
    tasks: () => click('taskBtn'),
    api: () => window.ORION_API_PANEL && window.ORION_API_PANEL.open(),
    news: () => window.ORION_NEWS && window.ORION_NEWS.open(),
    plans: () => window.ORION_PLANS && window.ORION_PLANS.open(),
  };
  const T = k => {
    if (window.ORION_APP && window.ORION_APP.t) return window.ORION_APP.t(k);
    const D = window.ORION_I18N || {};
    return (D.pt && D.pt[k]) || (D.en && D.en[k]) || k;
  };
  const ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M12 5v14"/></svg>';
  const MIN_WIDTH = 900;                       // abaixo disso duas abas não cabem: o botão fica escondido (CSS)
  const SWAP_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h12l-3-3M17 16H5l3 3"/></svg>';
  const R_MIN = 0.3, R_MAX = 0.7, R_KEY = 'orion.split.r';
  let ratio = 0.5, handle = null;
  try { const v = parseFloat(localStorage.getItem(R_KEY)); if (v >= R_MIN && v <= R_MAX) ratio = v; } catch (e) { /* sem armazenamento: vale só nesta sessão */ }

  let order = [];                              // módulos abertos, na ordem em que abriram (o primeiro vai à esquerda)
  let splitOn = false, armed = 0, menu = null;

  const openKeys = () => Object.keys(MODS).filter(k => document.querySelector(MODS[k] + '.open'));

  function closeMenu(refocus) {
    if (!menu) return;
    const { el, anchor } = menu;
    menu = null; el.remove();
    anchor.setAttribute('aria-expanded', 'false');
    if (refocus && anchor.isConnected) anchor.focus();
  }

  function openMenu(anchor, from) {
    closeMenu();
    const keys = Object.keys(OPEN).filter(k => k !== from && !document.querySelector(MODS[k] + '.open'));
    if (!keys.length) return;
    const el = document.createElement('div');
    el.className = 'split-menu'; el.setAttribute('role', 'menu');
    keys.forEach(k => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'split-item'; b.setAttribute('role', 'menuitem'); b.textContent = T(LABEL[k]);
      b.addEventListener('click', () => { closeMenu(); openBeside(k); });
      el.appendChild(b);
    });
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    el.style.top = Math.round(r.bottom + 8) + 'px';
    el.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    menu = { el, anchor };
    const first = el.querySelector('button'); if (first) first.focus();
  }

  function openBeside(key) {
    const opener = OPEN[key];
    if (!opener) return;
    armed = performance.now() + 1500;          // dá tempo de o segundo painel aparecer (alguns abrem no próximo quadro)
    S.opening = true;
    try { opener(); } finally { S.opening = false; }
    schedule();
  }

  function setRatio(r, persist) {
    ratio = Math.min(R_MAX, Math.max(R_MIN, r));
    document.body.style.setProperty('--r', ratio.toFixed(4));
    if (handle) handle.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    if (persist) { try { localStorage.setItem(R_KEY, ratio.toFixed(4)); } catch (e) { /* ok */ } }
  }

  function swapSides() { order.reverse(); sync(); }

  function ensureHandle(on) {
    if (!on) { if (handle) { handle.remove(); handle = null; } return; }
    if (handle) return;
    const h = handle = document.createElement('button');
    h.type = 'button'; h.className = 'split-handle'; h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical');
    h.setAttribute('aria-valuemin', String(R_MIN * 100)); h.setAttribute('aria-valuemax', String(R_MAX * 100));
    h.setAttribute('aria-label', T('split.resize')); h.title = T('split.resize');
    h.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    const rFromX = x => {
      const mod = parseFloat(getComputedStyle(document.body).getPropertyValue('--mod-s')) || 28, gap = 14;
      return (x - mod - gap / 2) / (window.innerWidth - 2 * mod - gap);
    };
    h.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); h.setPointerCapture(e.pointerId);
      document.body.classList.add('split-drag');
      const move = ev => setRatio(rFromX(ev.clientX), false);
      const up = () => {
        h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        document.body.classList.remove('split-drag'); setRatio(ratio, true);
      };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    h.addEventListener('dblclick', () => setRatio(0.5, true));
    h.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.05 : 0.02;
      if (e.key === 'ArrowLeft') setRatio(ratio - step, true);
      else if (e.key === 'ArrowRight') setRatio(ratio + step, true);
      else if (e.key === 'Home') setRatio(R_MIN, true);
      else if (e.key === 'End') setRatio(R_MAX, true);
      else if (e.key === 'Enter') setRatio(0.5, true);
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    document.body.appendChild(h);
    setRatio(ratio, false);
  }

  function decorate(keys, split) {
    keys.forEach(k => {
      const head = document.querySelector(MODS[k] + '.open .set-head');
      if (!head) return;
      const mine = head.querySelector('[data-split-btn]'), swap = head.querySelector('[data-swap-btn]');
      if (window.innerWidth < MIN_WIDTH) { if (mine) mine.remove(); if (swap) swap.remove(); return; }
      const btns = [...head.querySelectorAll('.icon-btn:not([data-split-btn]):not([data-swap-btn])')];
      const closeBtn = btns[btns.length - 1];
      if (!closeBtn) return;
      if (split) {                               // duas abas: em vez de "abrir ao lado", "trocar de lado"
        if (mine) mine.remove();
        if (swap) return;
        const s = document.createElement('button');
        s.type = 'button'; s.className = 'icon-btn'; s.setAttribute('data-swap-btn', '');
        s.setAttribute('aria-label', T('split.swap')); s.title = T('split.swap'); s.innerHTML = SWAP_ICON;
        s.addEventListener('click', e => { e.stopPropagation(); swapSides(); });
        closeBtn.before(s);
        return;
      }
      if (swap) swap.remove();
      if (mine) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'icon-btn'; b.setAttribute('data-split-btn', '');
      b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-label', T('split.open')); b.title = T('split.open');
      b.innerHTML = ICON;
      b.addEventListener('click', e => { e.stopPropagation(); if (menu && menu.anchor === b) closeMenu(true); else openMenu(b, k); });
      closeBtn.before(b);
    });
  }

  function sync() {
    const now = openKeys();
    order = order.filter(k => now.includes(k));
    now.forEach(k => { if (!order.includes(k)) order.push(k); });
    if (order.length === 2 && armed) { splitOn = true; armed = 0; }
    else if (order.length !== 2 && !(armed && performance.now() < armed)) { splitOn = false; armed = 0; }
    const split = splitOn && order.length === 2;
    document.body.classList.toggle('split-view', split);
    Object.keys(MODS).forEach(k => {
      const el = document.querySelector(MODS[k]);
      if (!el) return;
      const i = split ? order.indexOf(k) : -1;
      if (i === 0) el.dataset.split = 'a'; else if (i === 1) el.dataset.split = 'b'; else delete el.dataset.split;
    });
    if (!split || !menu) { if (!now.length || split) closeMenu(); }
    if (window.ORION_DOCK) window.ORION_DOCK.setTabs(now.length);   // 1-2 abas: círculo compacto; 3+: dock fino
    ensureHandle(split);
    decorate(now, split);
  }

  let queued = false;
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sync(); }); }

  new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('pointerdown', e => { if (menu && !menu.el.contains(e.target) && e.target !== menu.anchor && !menu.anchor.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', e => {
    if (menu && e.key === 'Escape' && e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault(); closeMenu(true); }
  }, true);
  window.addEventListener('resize', () => { closeMenu(); schedule(); });
  setRatio(ratio, false);
  schedule();
})();
