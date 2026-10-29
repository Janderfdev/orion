/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.0 — módulo Multitarefa (pages/js/orion-v5.js)
   Carregado depois do app.js. Usa o OrbFrame. Multitarefa ainda não existe no backend:
   o painel só informa isso, sem tarefas de exemplo.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const btn = document.getElementById('taskBtn');
  if (!btn || !window.OrbFrame) return;
  const TXT = {
    pt: { name: 'Multitarefa', soon: 'Em breve', desc: 'Acompanhe várias tarefas em um só lugar, com estado, progresso e resultado. Ainda não está disponível.', note: 'Ainda não está disponível. Versões e datas podem mudar.', close: 'Fechar' },
    en: { name: 'Multitasking', soon: 'Coming soon', desc: 'Follow several tasks in one place, with status, progress and results. Not available yet.', note: 'Not available yet. Versions and dates may change.', close: 'Close' },
  };
  const L = () => (/^en/i.test(document.documentElement.lang) ? TXT.en : TXT.pt);
  const ICON = btn.querySelector('svg').outerHTML;

  const panel = OrbFrame.create({
    id: 'taskPanel', icon: ICON, opener: btn,
    title: () => L().name, closeLabel: () => L().close,
    // só um painel por vez: fecha Configurações / ORION CODE pelo mesmo caminho do Esc do app.js
    beforeOpen: () => { if (document.querySelector('#settingsPanel.open, #codePanel.open')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
    body: () => '<div class="code-grid" style="grid-template-columns:1fr"><div class="code-card"><span class="code-badge">' + L().soon + '</span><h3>' + L().name + '</h3><p>' + L().desc + '</p></div></div><p class="code-note">' + L().note + '</p>',
  });

  // o rótulo do botão acompanha o idioma da interface
  const label = () => { const n = L().name; btn.setAttribute('aria-label', n); btn.title = n; };
  label();
  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.ORION_TASK_PANEL = panel;
})();
