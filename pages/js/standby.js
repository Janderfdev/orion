/* ORION AI — STANDBY único para todas as páginas (orion/index.html, orion/login.html e orion/pages/orion.html).

   As datas ficam SÓ aqui. Horário de Brasília (UTC-3). Formato: AAAA-MM-DDTHH:MM:SS-03:00
   ATENÇÃO: o standby é VISUAL e usa o relógio do navegador. Ele não é uma trava de segurança: quem sabe mexer no
   navegador consegue ver o site. Para bloquear de verdade, é preciso uma trava no servidor.

   Como cada página usa este arquivo:
     index.html e pages/orion.html:  <script src="standby.js" data-mount></script>  (mostram a tela de standby por cima de tudo)
     login.html:                      <script src="standby.js"></script>             (tem a própria tela de standby e só pergunta a fase)

   Teste local (só localhost / file://):  ?simular=2026-10-25T10:00:00-03:00
   Liberação do dono, só neste navegador:  abra qualquer página com ?liberar=1  (e ?liberar=0 para voltar ao normal). */
(function () {
  'use strict';

  const START = Date.parse('2026-10-25T10:00:00:-03:00');   // começa em 25/10/2026 às 10:00:00
  const END   = Date.parse('2026-10-27T10:00:00-03:00');   // termina em 27/10/2026 às 10:00:00

  /* Se uma das datas estiver inválida, prende no standby. */
  const DATES_OK = Number.isFinite(START) && Number.isFinite(END) && START < END;
  if (!DATES_OK) console.error('[ORION] Datas do standby inválidas — standby desativado.', { START, END });

  const DEV = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname) || location.protocol === 'file:';
  const params = new URLSearchParams(location.search);
  const sim = DEV ? params.get('simular') : null;
  const offset = sim && !isNaN(Date.parse(sim)) ? Date.parse(sim) - Date.now() : 0;
  const nowMs = () => Date.now() + offset;

  const KEY = 'orion_standby_bypass';
  try {
    const l = params.get('liberar');
    if (l === '1') localStorage.setItem(KEY, '1');
    else if (l === '0') localStorage.removeItem(KEY);
  } catch (_) {}
  const bypass = () => { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } };

  /* 'before' (antes) · 'standby' (dentro da janela) · 'released' (depois, ou liberado) */
  function phase(t) {
    if (!DATES_OK || bypass()) return 'released';
    if (t < START) return 'before';
    if (t < END) return 'standby';
    return 'released';
  }
  const active = () => phase(nowMs()) === 'standby';

  const me = document.currentScript || document.querySelector('script[src*="standby.js"]');
  const autoMount = !!(me && me.hasAttribute('data-mount'));
  const IMG = new URL('assets/standby.png', (me && me.src) || location.href).href;   // sempre relativo à raiz do site
  let overlay = null;

  function mount() {
    if (overlay) return;
    const root = document.documentElement;
    root.classList.add('orion-standby');
    const st = document.createElement('style');
    st.textContent =
      'html.orion-standby{overflow:hidden!important;background:#030406!important}' +
      'html.orion-standby body>*:not(#orionStandby){visibility:hidden!important;pointer-events:none!important}' +
      '#orionStandby{position:fixed;inset:0;z-index:2147483000;background:#030406;display:flex;align-items:center;justify-content:center;' +
      'color:rgba(255,255,255,.55);font:500 11px/1.8 system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;text-align:center}' +
      '#orionStandby img{width:min(100vw,100dvh);height:min(100vw,100dvh);object-fit:contain}';
    (document.head || root).appendChild(st);
    overlay = document.createElement('div');
    overlay.id = 'orionStandby';
    overlay.setAttribute('role', 'img');
    overlay.setAttribute('aria-label', 'ORION AI — please stand by');
    const img = new Image();
    img.alt = '';
    img.onerror = () => { overlay.textContent = 'ORION AI · standby'; };   // se a imagem falhar, ainda aparece algo
    img.src = IMG;
    overlay.appendChild(img);
    const attach = () => {
      document.body.appendChild(overlay);
      Array.from(document.body.children).forEach(el => { if (el !== overlay) el.inert = true; });   // teclado e leitor de tela não entram na página
    };
    if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach, { once: true });
  }

  const S = { START, END, DATES_OK, nowMs, phase, active, mount, reload: () => location.reload() };
  window.ORION_STANDBY = S;

  function tick() {
    if (!autoMount) return;
    if (active()) mount();                // entrou na janela: cobre a página
    else if (overlay) S.reload();         // a janela acabou: recarrega para abrir o site normalmente
  }
  if (autoMount) {
    tick();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    addEventListener('focus', tick);
    addEventListener('pageshow', tick);
  }
})();
