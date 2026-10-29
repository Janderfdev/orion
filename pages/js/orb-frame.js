/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.0 — OrbFrame (pages/js/orb-frame.js)

   Painel adaptativo reutilizável: a esfera vira um bloco de cantos amplos, com o arco acompanhando a curva.
   Visual: pages/css/orion-v5.css (.orb-frame). Este arquivo cuida só de montar, abrir, fechar e do teclado.

   Uso:
     const code = OrbFrame.create({
       id: 'codePanel', icon: '<svg…/>', opener: document.getElementById('codeBtn'),
       title: () => t('code.title'), body: () => '<div class="code-grid">…</div>', closeLabel: () => t('code.close'),
       beforeOpen: () => settings.close(),
     });
     code.setOpen(true);
   Todos os textos são funções: o painel é reconstruído a cada abertura e já nasce no idioma atual.
   ═══════════════════════════════════════════════════════════════ */
window.OrbFrame = (() => {
  'use strict';
  const X = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const registry = new Set();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function create(o) {
    let panel = null, isOpen = false;
    const val = f => (typeof f === 'function' ? f() : (f || ''));

    function build() {
      panel = document.createElement('div');
      panel.id = o.id;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', o.id + 'Title');
      // título e textos vêm do i18n do projeto (fixos); por segurança, passam por esc()
      panel.innerHTML =
        '<div class="settings-card orb-frame">' +
          '<header class="set-head"><span class="ico">' + (o.icon || '') + '</span>' +
            '<div><h2 id="' + o.id + 'Title">' + esc(val(o.title)) + '</h2>' + (o.sub ? '<p>' + esc(val(o.sub)) + '</p>' : '') + '</div>' +
            '<button class="icon-btn" type="button" data-close aria-label="' + esc(val(o.closeLabel)) + '" title="' + esc(val(o.closeLabel)) + '">' + X + '</button></header>' +
          '<div class="orb-frame-body">' + val(o.body) + '</div>' +
          '<div class="code-foot"><button class="pill-btn primary block" type="button" data-close>' + esc(val(o.closeLabel)) + '</button></div>' +
        '</div>';
      document.body.appendChild(panel);
      panel.addEventListener('click', e => { if (e.target === panel || e.target.closest('[data-close]')) setOpen(false); });
    }

    function setOpen(on) {
      if (on === isOpen) return;
      if (on) {
        registry.forEach(f => { if (f !== api) f.setOpen(false); });
        if (o.beforeOpen) o.beforeOpen();
        if (panel) panel.remove();
        build();
        isOpen = true;
        requestAnimationFrame(() => {
          if (!panel || !isOpen) return;
          panel.classList.add('open');
          const first = panel.querySelector('[data-close].pill-btn') || panel.querySelector(FOCUSABLE);
          if (first) first.focus();
        });
      } else {
        isOpen = false;
        if (panel) panel.classList.remove('open');
        if (o.opener) o.opener.focus();
      }
      if (o.opener) o.opener.setAttribute('aria-pressed', String(isOpen));
      if (o.opener) o.opener.classList.toggle('on', isOpen);
    }

    // Esc fecha; Tab fica preso dentro do painel enquanto ele está aberto
    document.addEventListener('keydown', e => {
      if (!isOpen || !panel) return;
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
      // com o painel aberto, os atalhos da tela principal (Espaço = microfone, / = chat, Ctrl+, = configurações) ficam parados
      if ((e.code === 'Space' && !e.target.matches('input,textarea,select')) || e.key === '/' || (e.ctrlKey && e.key === ',')) { e.stopImmediatePropagation(); if (e.code === 'Space' && e.target.matches('button')) return; e.preventDefault(); }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });

    const api = { setOpen, isOpen: () => isOpen };
    registry.add(api);
    if (o.opener) o.opener.addEventListener('click', () => { if (!(o.blocked && o.blocked())) setOpen(!isOpen); });
    return api;
  }

  return { create, closeAll: () => registry.forEach(f => f.setOpen(false)) };
})();
