/* ORION AI — logos sazonais (V5.2.0). Módulo único para todas as páginas (login.html e pages/orion.html).

   Regras (horário de Brasília, America/Fortaleza, UTC-3 fixo, sem horário de verão; NÃO depende do fuso do aparelho):
     Natal   : 1º de dezembro 00:00  →  1º de janeiro do ano seguinte 00:00 (ativa durante todo o mês de dezembro)
     Páscoa  : Domingo de Ramos 00:00 →  segunda-feira após a Páscoa 00:00 (inclui o Domingo de Páscoa)
     Prioridade: Natal → Páscoa → original. A Páscoa é calculada todo ano (calendário gregoriano), nunca fixa.

   Como usar numa página: marque a <img> da marca com data-seasonal-logo e inclua este arquivo:
     <img class="header-mark" src="../assets/orion_ai_logo.png" data-seasonal-logo alt="">
     <script src="../seasonal-logo.js"></script>
   Só troca a imagem da marca. O wordmark e a cor do Orb não são tocados.
   Se a logo sazonal não carregar, a logo que já está na tela continua.

   Teste local (só localhost / file://):  ?simular=2026-12-10T12:00:00-03:00 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // testes em Node
  else { root.ORION_SEASON = api; api.mount(root); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const OFFSET_H = 3;                       // Brasília/Fortaleza = UTC-3 (fixo)
  const DAY = 86400000;
  const FILES = { original: 'orion_ai_logo.png', christmas: 'orion_ai_christmas.png', easter: 'orion_ai_easter.png' };

  /* meia-noite de Brasília de um dia (y, m = 0..11, d) em milissegundos UTC */
  const brMidnight = (y, m, d) => Date.UTC(y, m, d, OFFSET_H, 0, 0, 0);

  /* "Agora" visto em Brasília: desloca -3h e lê com métodos UTC. */
  function brParts(ms) {
    const d = new Date(ms - OFFSET_H * 3600000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  }

  /* Domingo de Páscoa (calendário gregoriano, algoritmo de Meeus/Jones/Butcher). Devolve { m: 0..11, d }. */
  function easterDate(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return { m: month - 1, d: day };
  }

  /* Períodos de um ano: [início, fim) em ms UTC. */
  function periods(year) {
    const e = easterDate(year);
    const easterMs = brMidnight(year, e.m, e.d);
    return {
      easter:    { start: easterMs - 7 * DAY, end: easterMs + 1 * DAY },        // Domingo de Ramos 00:00 → segunda 00:00
      christmas: { start: brMidnight(year, 11, 1), end: brMidnight(year + 1, 0, 1) },
    };
  }

  const inside = (t, p) => t >= p.start && t < p.end;

  /* 'christmas' | 'easter' | 'original' para o instante t (ms). Prioridade: Natal, Páscoa, original. */
  function currentTheme(t) {
    const cur = periods(brParts(t).y);
    if (inside(t, cur.christmas)) return 'christmas';
    if (inside(t, cur.easter)) return 'easter';
    return 'original';
  }

  /* Próxima mudança de estado depois de t (ms UTC), ou null. */
  function nextChange(t) {
    const y = brParts(t).y, out = [];
    for (const yy of [y, y + 1]) {
      const p = periods(yy);
      for (const k of ['christmas', 'easter']) out.push(p[k].start, p[k].end);
    }
    const future = out.filter(x => x > t);
    return future.length ? Math.min.apply(null, future) : null;
  }

  function logoFile(theme) { return FILES[theme] || FILES.original; }

  /* ── parte do navegador ── */
  function mount(win) {
    if (!win.document) return;
    const doc = win.document;
    const me = doc.currentScript || doc.querySelector('script[src*="seasonal-logo.js"]');
    const base = new URL('assets/', (me && me.src) || win.location.href).href;   // assets/ na raiz do site
    const DEV = /^(localhost|127\.0\.0\.1|)$/.test(win.location.hostname) || win.location.protocol === 'file:';
    const sim = DEV ? new URLSearchParams(win.location.search).get('simular') : null;
    const offset = sim && !isNaN(Date.parse(sim)) ? Date.parse(sim) - Date.now() : 0;
    const now = () => Date.now() + offset;
    let applied = null, timer = null;

    function apply() {
      const theme = currentTheme(now());
      if (theme === applied) return;
      const url = base + logoFile(theme);
      const probe = new win.Image();
      probe.onload = () => {                                    // só troca depois de carregar (sem piscar nem imagem quebrada)
        doc.querySelectorAll('img[data-seasonal-logo]').forEach(img => { img.src = url; });
        doc.documentElement.setAttribute('data-season', theme);
        applied = theme;
      };
      probe.onerror = () => { /* mantém a logo que já está na tela */ };
      probe.src = url;
    }

    function schedule() {
      clearTimeout(timer);
      const nx = nextChange(now());
      const wait = nx === null ? 6 * 3600000 : Math.min(nx - now() + 500, 6 * 3600000);   // reconfere ao menos a cada 6 h
      timer = setTimeout(() => { apply(); schedule(); }, Math.max(wait, 1000));
    }

    const start = () => { apply(); schedule(); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true }); else start();
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) { apply(); schedule(); } });   // aba voltou: o aparelho pode ter dormido
    win.addEventListener('pageshow', () => { apply(); schedule(); });
  }

  return { easterDate, periods, currentTheme, nextChange, logoFile, mount, brMidnight, OFFSET_H };
});
