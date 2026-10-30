/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.0 — OrbFrame (pages/js/orb-frame.js)

   Conteúdo de um módulo (Código/API, Multitarefa...) que aparece sobre a Orb quando ela se transforma em painel.
   O formato da Orb e o arco em volta ficam em orion.html (.orb.module / .orb-arc) e em js/orion-v5.js (Morph).
   Este arquivo só monta o painel, abre, fecha e cuida do teclado.

   OrbFrame.create({
     id, icon, opener,                 // id do painel, ícone SVG (string) e botão da dock
     title, sub, closeLabel,           // textos: string ou função (o painel nasce no idioma atual)
     body,                             // HTML do corpo (opcional)
     foot: true|false,                 // botão "Fechar" no rodapé (padrão: true)
     mount(card, api),                 // chamado a cada abertura, com o cartão pronto para receber conteúdo
     beforeOpen(), blocked()
   })
   ═══════════════════════════════════════════════════════════════ */
window.OrbFrame = (() => {
  'use strict';
  const X = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
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
      panel.innerHTML =
        '<div class="settings-card orb-frame">' +
          '<header class="set-head"><span class="ico">' + (o.icon || '') + '</span>' +
            '<div><h2 id="' + o.id + 'Title">' + esc(val(o.title)) + '</h2>' + (o.sub ? '<p>' + esc(val(o.sub)) + '</p>' : '') + '</div>' +
            '<button class="icon-btn" type="button" data-close aria-label="' + esc(val(o.closeLabel)) + '" title="' + esc(val(o.closeLabel)) + '">' + X + '</button></header>' +
          '<div class="orb-frame-body">' + val(o.body) + '</div>' +
          (o.foot === false ? '' : '<div class="code-foot"><button class="pill-btn primary block" type="button" data-close>' + esc(val(o.closeLabel)) + '</button></div>') +
        '</div>';
      document.body.appendChild(panel);
      panel.addEventListener('click', e => { if (e.target === panel || e.target.closest('[data-close]')) setOpen(false); });
      if (o.mount) o.mount(panel.querySelector('.settings-card'), api);
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
          setTimeout(() => { const c = panel && panel.querySelector('[data-close]'); if (c && isOpen) c.focus(); }, 380);
        });
      } else {
        isOpen = false;
        if (panel) { const p = panel; p.classList.remove('open'); setTimeout(() => { if (!isOpen && p.parentNode) p.remove(); }, 700); }
        if (o.opener) o.opener.focus();
      }
      if (o.opener) { o.opener.setAttribute('aria-pressed', String(isOpen)); o.opener.classList.toggle('on', isOpen); }
    }

    // Esc fecha; Tab fica preso dentro do painel; os atalhos da tela principal (Espaço, /, Ctrl+,) ficam parados enquanto ele está aberto
    document.addEventListener('keydown', e => {
      if (!isOpen || !panel) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); return; }
      const typing = e.target.matches('input,textarea,select');
      if ((e.code === 'Space' && !typing) || (e.key === '/' && !typing) || (e.ctrlKey && e.key === ',')) {
        e.stopImmediatePropagation();
        if (e.code === 'Space' && e.target.matches('button')) return;   // Espaço em botão continua ativando o botão
        e.preventDefault();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });

    const api = { setOpen, isOpen: () => isOpen, panel: () => panel };
    registry.add(api);
    if (o.opener) o.opener.addEventListener('click', () => { if (!(o.blocked && o.blocked())) setOpen(!isOpen); });
    return api;
  }

  return { create, closeAll: () => registry.forEach(f => f.setOpen(false)) };
})();
