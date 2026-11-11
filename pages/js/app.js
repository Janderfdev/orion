/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.0 — Interaction Layer (Cosmic Indigo · Dark Blue · Deep Purple)  (pages/js/app.js)

   Frontend = interação, eventos, estados visuais e comunicação com a API.
   Backend  = autenticação, contexto, orquestração, modelos, ferramentas, segurança.
   O app.js NÃO substitui o ORION Core.

   V4.5.0: tela Voice & Speech, Orb com anéis ondulados e áudio reativo, 4 vozes, "Hey ORION".
   V4.5.5: boot mais rápido, nome maior no topo, respostas mais rápidas (backend).
   V5.0:   foto de perfil escolhida pelo usuário (só neste navegador), plano/uso nas configurações, botão "+" (imagem ou
           arquivo de texto), campo "agent" do /ask registrado no log.
   V5.0.2: Orb como no original; resposta sempre escrita no painel; menus redesenhados.
   V5.0 (esta revisão): interface em 6 idiomas (js/i18n.js); Voz e Fala = Orb + dois arcos reais (intensidade e ritmo da voz)
           + dock com 4 vozes; Sons e "Hey ORION" como interruptores nas configurações; temas Cosmic Indigo / Dark Blue /
           Deep Purple (só em orion.html).
   ═══════════════════════════════════════════════════════════════ */

/* Durante o standby (standby.js) o app NÃO inicia: sem microfone, sem "Hey ORION", sem chamadas ao servidor. Quando a janela acaba,
   o standby.js recarrega a página e tudo abre normalmente. */
if (!(window.ORION_STANDBY && window.ORION_STANDBY.active())) {

/* Endereço do backend (Render). Se um dia mudar, troque aqui (sem barra no final). */
const ORION_CONFIG = { API_URL: 'https://orion-backend-9qk5.onrender.com' };

/* ═══ i18n — textos da interface (6 idiomas, definidos em js/i18n.js) ═══
   O idioma é UM só: interface, reconhecimento de fala e prévia de voz. Marcas (ORION AI, ORION Core, Hey ORION) nunca são traduzidas. */
const I18N = (() => {
  const D = window.ORION_I18N || {};
  const LANGS = D.langs || ['pt', 'en'];
  const LOCALES = D.locales || { pt: 'pt-BR', en: 'en-US' };
  let cur = 'pt';
  const t = (k, v) => {
    let s = (D[cur] && D[cur][k]) || (D.en && D.en[k]) || k;
    if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]);
    return s;
  };
  function apply() {
    document.documentElement.lang = LOCALES[cur];
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { const s = t(el.dataset.i18nAria); el.setAttribute('aria-label', s); if (el.tagName === 'BUTTON') el.title = s; });
  }
  return { t, apply, langs: LANGS, get: () => cur, locale: () => LOCALES[cur], set: l => { cur = LANGS.includes(l) ? l : 'pt'; } };
})();
const t = I18N.t;

/* V5.2.0 — ponte para js/orion-v52.js. Este arquivo roda dentro de um bloco (o do standby): ORION_CONFIG e I18N NÃO são globais,
   então o módulo dos painéis (Planos, ORION API, Resumo do Dia) só enxerga o que for exposto aqui. */
window.ORION_APP = { t: (k, v) => I18N.t(k, v), lang: () => I18N.get(), locale: () => I18N.locale(), apiUrl: () => ORION_CONFIG.API_URL };

/* ═══ visual-state.js — máquina de estados visuais da Orb ═══
   STANDBY (cor do tema) → LISTENING (branco escuro) → PROCESSING (cor do tema, mais atividade) → SPEAKING (cor do tema, mais intensa) → STANDBY
   (qualquer) → ERROR (cinza muito escuro: "não entendi" / falhas). Todos os estados vêm de eventos reais (fala, API, áudio, erros). */
const VISUAL_STATE = (() => {
  /* Cor-base de cada tema. A Orb é sempre preta; a nebulosa por dentro muda conforme o estado real.
     "color" é a nebulosa desenhada dentro da Orb; "ring" é a cor do arco, do contorno e do halo (a forma original não muda). */
  const THEME_ORB = {
    indigo:   { a: '#3A3678', b: '#1C1A40', c: '#6A63B0' },
    midnight: { a: '#1E3A6E', b: '#0E1F40', c: '#4A7AB8' },
    purple:   { a: '#4A2E7A', b: '#241446', c: '#7E5FB0' },
  };
  const hx = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const toHex = v => '#' + v.map(n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('');
  const lighter = (hex, k) => toHex(hx(hex).map(n => n + (255 - n) * k));
  const pal = (f, p) => ({ a: f(p.a), b: f(p.b), c: f(p.c) });
  let BASE = THEME_ORB.indigo;
  const CFG = {
    standby:    { amp: 1.00, rot: 1.00, bright: 0.82, cls: '',             color: BASE, ring: BASE },
    listening:  { amp: 1.18, rot: 1.50, bright: 0.66, cls: 'st-listening', color: BASE, ring: BASE },
    processing: { amp: 1.12, rot: 1.80, bright: 0.86, cls: 'st-thinking',  color: BASE, ring: BASE },
    speaking:   { amp: 1.24, rot: 1.65, bright: 1.00, cls: 'st-speaking',  color: BASE, ring: BASE },
    error:      { amp: 0.82, rot: 0.50, bright: 0.60, cls: 'st-error',     color: BASE, ring: BASE },
  };
  const ALIAS = { idle: 'standby', standby: 'standby', listening: 'listening', processing: 'processing', thinking: 'processing',
                  speaking: 'speaking', responding: 'speaking', error: 'error' };
  let current = 'standby';
  const blend = (h1, h2, k) => toHex(hx(h1).map((n, i) => n + (hx(h2)[i] - n) * k));
  function setTheme(name) {
    BASE = THEME_ORB[name] || THEME_ORB.indigo;
    CFG.standby.color = BASE;    CFG.standby.ring = BASE;                    // normal: a cor do tema selecionado
    CFG.processing.color = BASE; CFG.processing.ring = BASE;
    CFG.error.color = { a: '#34343E', b: '#1C1C24', c: '#4A4A56' };       // não entendi: cinza muito escuro
    CFG.error.ring = BASE;
    // ouvindo: branco escuro (neutro, 80%) com um leve reflexo da cor do tema (20%)
    CFG.listening.color = { a: blend('#9A9AA8', BASE.c, .20), b: blend('#4A4A58', BASE.b, .20), c: blend('#C2C2D0', BASE.c, .20) };
    CFG.listening.ring = { a: lighter(BASE.a, .12), b: BASE.b, c: lighter(BASE.c, .22) };
    CFG.speaking.color = { a: lighter(BASE.a, .10), b: lighter(BASE.b, .08), c: lighter(BASE.c, .14) };
    CFG.speaking.ring = pal(c => lighter(c, .12), BASE);
  }
  setTheme('indigo');
  const apply = name => { current = ALIAS[name] || 'standby'; return CFG[current]; };
  return { apply, setTheme, base: () => BASE, get: () => current, config: name => CFG[ALIAS[name] || current] };
})();

/* ═══ logger.js — diagnóstico leve (nunca grava texto bruto fora de dev) ═══ */
const LOGGER = (() => {
  const DEV = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname) || location.protocol === 'file:';
  const sessionId = 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  function base(level, event, data) {
    const entry = { t: new Date().toISOString(), level, event, sessionId, ...data };
    if (!DEV) delete entry.rawText;
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)('[ORION]', entry);
    return entry;
  }
  return {
    sessionId,
    info: (e, d = {}) => base('info', e, d),
    warn: (e, d = {}) => base('warn', e, d),
    error: (e, d = {}) => base('error', e, d),
    isDev: () => DEV,
  };
})();

/* ═══ error-handler.js — categorização única de falhas ═══ */
const ERROR_HANDLER = (() => {
  const CODES = ['mic_unavailable', 'stt_unavailable', 'model_unavailable', 'timeout', 'api_error', 'invalid_response', 'tool_unavailable',
    'offline', 'tts_unavailable', 'unexpected_input', 'forbidden', 'rate_limited', 'quota_exceeded', 'core_unavailable', 'voice_disabled',
    'voice_unavailable', 'attachment_invalid', 'unknown'];
  function classify(err) {
    if (!navigator.onLine) return 'offline';
    if (!err) return 'unknown';
    if (err.code && CODES.includes(err.code)) return err.code;
    const msg = (err.message || String(err)).toLowerCase();
    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('not-allowed') || msg.includes('mic')) return 'mic_unavailable';
    if (msg.includes('rede') || msg.includes('network')) return 'offline';
    return 'unknown';
  }
  function handle(err, stage) {
    const code = classify(err);
    LOGGER.error('error_handled', { stage, code, message: err && err.message });
    return { code, message: t('err.' + code), recoverable: true };
  }
  return { handle, classify };
})();

/* ═══ audio.js (analisador) — nível REAL do áudio da fala, para a Orb pulsar com a voz ═══
   Só o áudio do ElevenLabs passa por um AnalyserNode. A voz do navegador (speechSynthesis) não expõe dados de
   áudio: nesse caso a pulsação da Orb é SIMULADA (e só enquanto a fala acontece) e os arcos da tela Voz e Fala ficam parados.
   Métricas REAIS (expostas em window.ORION_AUDIO para os arcos):
     level()  → intensidade da voz agora (0–1)
     rate()   → ritmo da fala: início de sílabas/palavras por segundo nos últimos 2,5 s, normalizado (0–1; 7/s = 1)
     real()   → true só quando as duas vêm do áudio de verdade (analisador ligado e tocando) */
const AUDIO = (() => {
  const el = new Audio();            // único <audio> da fala (reaproveitado)
  let ctx = null, an = null, buf = null, ok = false, sim = false, real = false, envUp = false;
  const onsets = [];
  function ensure() {                // chamar dentro de um gesto do usuário (toque/tecla)
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.55;
        buf = new Uint8Array(an.fftSize);
        const src = ctx.createMediaElementSource(el);
        src.connect(an); an.connect(ctx.destination);
        ok = true;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (_) { ok = false; }
    return ok;
  }
  const wave = () => { const n = performance.now(); return 0.30 + 0.32 * Math.abs(Math.sin(n / 140)) * (0.65 + 0.35 * Math.sin(n / 410)); };
  function track(v) {                // detecta o início de cada sílaba/palavra (subida do volume) para medir o ritmo
    const now = performance.now();
    if (!envUp && v > 0.2) { envUp = true; onsets.push(now); }
    else if (envUp && v < 0.1) envUp = false;
    while (onsets.length && onsets[0] < now - 2500) onsets.shift();
  }
  function level() {
    const playing = !el.paused && !el.ended && el.currentTime > 0;
    if (sim) { real = false; return wave(); }
    if (!playing) { real = false; return 0; }
    if (!ok || !an) { real = false; return wave(); }   // sem analisador: pulsação simulada, só durante a reprodução real
    an.getByteTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    const v = Math.min(1, Math.sqrt(s / buf.length) * 4);
    real = true; track(v);
    return v;
  }
  function rate() {
    const now = performance.now();
    while (onsets.length && onsets[0] < now - 2500) onsets.shift();
    return Math.min(1, (onsets.length / 2.5) / 7);
  }
  return { el, ensure, level, rate, real: () => real, setSim: v => { sim = !!v; } };
})();
window.ORION_AUDIO = { level: () => AUDIO.level(), rate: () => AUDIO.rate(), real: () => AUDIO.real() };

/* ═══ orb.js — motor visual: blobs de luz na Orb + dois arcos orbitais + anéis ondulados e partículas ═══
   Cor interpolada quadro a quadro; brilho e anéis reagem ao nível real do áudio durante a fala.
   Arco interno (#halo) e arco externo (#halo2): dois círculos concêntricos; o externo é maior, mais fino e gira devagar no sentido oposto. */
const ORB = (() => {
  const $ = id => document.getElementById(id);
  const canvas = $('orbCanvas'), ctx = canvas.getContext('2d');
  const orbEl = $('orb'), haloEl = $('halo'), halo2El = $('haloOuter');
  const root = document.documentElement;
  let vs = null;   // elementos da Orb da tela Voz e Fala (réplica da Orb principal)
  const orbZone = $('orbZone');

  let amp = 1, targetAmp = 1, rotSpeed = 1, targetRot = 1, bright = 0.82, targetBright = 0.82;
  let hovered = false, calm = false, flow = 0, lastTs = 0, lvl = 0;
  let breathPeriod = 6, breathT = 0, floatT = 0, press = 0, orbS = 1, orbY = 0, haloAng = 0, haloAng2 = 40, haloV = 360 / 28, fastHalo = false;

  const BLOBS = [
    { fx: 0.31, fy: 0.43, px: 0.0, py: 1.3, ox: 0.34, oy: 0.30, r: 0.62, col: 'a', al: 0.55 },
    { fx: 0.47, fy: 0.29, px: 2.1, py: 0.4, ox: 0.38, oy: 0.34, r: 0.56, col: 'c', al: 0.30 },
    { fx: 0.23, fy: 0.37, px: 4.0, py: 2.7, ox: 0.30, oy: 0.38, r: 0.66, col: 'b', al: 0.65 },
    { fx: 0.53, fy: 0.19, px: 5.2, py: 3.9, ox: 0.36, oy: 0.28, r: 0.50, col: 'a', al: 0.40 },
    { fx: 0.17, fy: 0.51, px: 1.1, py: 5.0, ox: 0.28, oy: 0.32, r: 0.58, col: 'c', al: 0.24 },
  ];
  const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
    a: Math.random() * Math.PI * 2, r: 0.28 + Math.random() * 0.62, spd: 0.05 + Math.random() * 0.08,
    size: 0.5 + Math.random() * 1.0, phase: Math.random() * Math.PI * 2, dir: i % 2 === 0 ? 1 : -1,
  }));

  const hexToRgb = hex => { const h = hex.replace('#', ''); return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) }; };
  const triple = c => ({ a: hexToRgb(c.a), b: hexToRgb(c.b), c: hexToRgb(c.c) });
  const rgbToHex = o => { const h = n => Math.round(n).toString(16).padStart(2, '0'); return `#${h(o.r)}${h(o.g)}${h(o.b)}`; };
  const lerpRgb = (f, to, k) => ({ r: f.r + (to.r - f.r) * k, g: f.g + (to.g - f.g) * k, b: f.b + (to.b - f.b) * k });
  const rgba = (o, a) => `rgba(${Math.round(o.r)},${Math.round(o.g)},${Math.round(o.b)},${Math.max(0, Math.min(1, a))})`;
  const lighten = (o, k) => ({ r: o.r + (255 - o.r) * k, g: o.g + (255 - o.g) * k, b: o.b + (255 - o.b) * k });

  let rings = [], vsRings = [], lastSpawn = 0, prevTarget = 0, clock = 0;
  let colorNow = triple(VISUAL_STATE.config('standby').color);
  let colorTarget = triple(VISUAL_STATE.config('standby').color);
  let ringNow = triple(VISUAL_STATE.config('standby').ring), ringTarget = triple(VISUAL_STATE.config('standby').ring);

  const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);
  function fitSquare(c) {   // canvas quadrado em alta resolução; devolve o lado em px CSS
    const s = c.clientWidth | 0, d = dprOf();
    if (!s) return 0;
    if (c.width !== Math.round(s * d)) { c.width = c.height = Math.round(s * d); }
    return s;
  }
  function resize() { const s = orbEl.offsetWidth; canvas.width = s; canvas.height = s; }

  function makeRings(zone) {
    const els = [...zone.querySelectorAll('.wave-ring')];
    while (els.length < 6) { const c = els[0].cloneNode(false); zone.insertBefore(c, els[0]); els.push(c); }
    return els.map(el => ({ el, age: -1, str: 1 }));
  }
  const STATE_CLASSES = ['st-listening', 'st-thinking', 'st-speaking', 'st-error'];
  // aplica o estado atual às duas Orbs (principal e a da tela Voz e Fala): classe, arcos rápidos e anéis de energia
  function decorate() {
    const cur = VISUAL_STATE.get(), cls = VISUAL_STATE.config(cur).cls;
    fastHalo = ['listening', 'speaking', 'processing'].includes(cur);
    breathPeriod = ({ listening: 3.4, processing: 2.2, speaking: 2.6 })[cur] || 6;   // idle: respira devagar, como sempre
    orbZone.dataset.state = cur; orbEl.dataset.state = cur;
    [[orbEl, haloEl, orbZone, halo2El], vs && [vs.orb, vs.halo, vs.zone, vs.halo2]].forEach(set => {
      if (!set) return;
      const [o, h, z, h2] = set;
      o.classList.remove(...STATE_CLASSES);
      if (cls) o.classList.add(cls);
      h.classList.toggle('fast', fastHalo);
      if (h2) h2.classList.toggle('fast', fastHalo);
      z.classList.toggle('speaking', cur === 'speaking');   // anéis de energia só enquanto o ORION fala
    });
  }
  function setState(name) {
    const cfg = VISUAL_STATE.apply(name);
    targetAmp = cfg.amp; targetRot = cfg.rot; targetBright = cfg.bright;
    colorTarget = triple(cfg.color); ringTarget = triple(cfg.ring);
    decorate();
  }

  /* o disco da Orb (blobs de luz + partículas + brilho central) dentro de um quadrado [0,S]² */
  function drawDisc(c, S, b, col = colorNow) {
    const R = S / 2;
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.clip();
    const bg = c.createRadialGradient(R * 0.8, R * 0.6, 0, R, R, R);
    bg.addColorStop(0, rgba(col.b, 0.55 * b));
    bg.addColorStop(1, 'rgba(0,0,0,0.96)');   // base da Orb: #05080F
    c.fillStyle = bg; c.fillRect(0, 0, S, S);

    c.globalCompositeOperation = 'lighter';
    BLOBS.forEach(bl => {
      const x = R + Math.sin(flow * bl.fx + bl.px) * R * bl.ox;
      const y = R + Math.cos(flow * bl.fy + bl.py) * R * bl.oy;
      const rad = R * bl.r * amp * (1 + 0.10 * Math.sin(flow * bl.fx * 1.7 + bl.py)) * (1 + 0.35 * lvl);
      const tone = col[bl.col];
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, rgba(tone, bl.al * b));
      g.addColorStop(1, rgba(tone, 0));
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    });
    PARTICLES.forEach(p => {
      const ang = p.a + flow * p.spd * p.dir;
      const tw = 0.35 + 0.45 * Math.sin(flow * 0.9 + p.phase);
      c.fillStyle = rgba(col.c, 0.45 * tw * b);
      c.beginPath(); c.arc(R + Math.cos(ang) * R * p.r, R + Math.sin(ang) * R * p.r, p.size, 0, Math.PI * 2); c.fill();
    });
    // brilho central: apagado em repouso, acende com o volume da fala
    const core = c.createRadialGradient(R, R, 0, R, R, R * 0.62);
    const cl = lighten(col.c, 0.55);
    core.addColorStop(0, rgba(cl, 0.85 * lvl * b));   // só brilha com o volume da fala
    core.addColorStop(1, rgba(cl, 0));
    c.fillStyle = core; c.fillRect(0, 0, S, S);

    c.globalCompositeOperation = 'source-over';
    const vig = c.createRadialGradient(R, R, R * 0.30, R, R, R);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.82)');
    c.fillStyle = vig;
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    const k = rate => 1 - Math.exp(-dt * rate);   // suavização independente do FPS

    amp += (targetAmp - amp) * k(2.2);
    rotSpeed += (targetRot - rotSpeed) * k(2.2);
    bright += (targetBright - bright) * k(2.6);
    const kn = k(2.6), kr = k(3.4);   // transições suaves: a nebulosa leva ~1 s para assentar; os arcos, um pouco menos
    colorNow.a = lerpRgb(colorNow.a, colorTarget.a, kn);
    colorNow.b = lerpRgb(colorNow.b, colorTarget.b, kn);
    colorNow.c = lerpRgb(colorNow.c, colorTarget.c, kn);
    ringNow.a = lerpRgb(ringNow.a, ringTarget.a, kr);
    ringNow.b = lerpRgb(ringNow.b, ringTarget.b, kr);
    ringNow.c = lerpRgb(ringNow.c, ringTarget.c, kr);
    root.style.setProperty('--core-a', rgbToHex(ringNow.a));   // arcos, contorno, brilho externo e anéis de energia
    root.style.setProperty('--core-b', rgbToHex(ringNow.b));
    root.style.setProperty('--core-c', rgbToHex(ringNow.c));

    breathT += dt * Math.PI * 2 / breathPeriod;
    floatT += dt * Math.PI * 2 / 10;
    press -= press * k(7);

    const target = calm ? 0 : AUDIO.level();                              // nível real (ou simulado) do áudio
    lvl += (target - lvl) * k(target > lvl ? 18 : 9);
    flow += dt * rotSpeed * (hovered ? 1.12 : 1) * (calm ? 0.15 : 1);
    const b = bright * (hovered ? 1.06 : 1) * (1 + 0.4 * lvl);

    // movimento da própria Orb (respiração, flutuação, pulso do áudio, toque) — igual ao de sempre, mas contínuo entre estados
    const live = calm ? 0 : 1, inPanel = orbEl.classList.contains('panel');
    const sT = inPanel ? 1 : 1 + live * (0.05 * (0.5 - 0.5 * Math.cos(breathT)) + 0.09 * lvl + 0.08 * press);
    const yT = 0;   // a Orb nunca sobe nem desce: só vai para frente e para trás (escala). Os arcos não acompanham esse movimento.
    orbS += (sT - orbS) * k(16); orbY += (yT - orbY) * k(10);
    root.style.setProperty('--orb-s', orbS.toFixed(4));
    root.style.setProperty('--orb-y', orbY.toFixed(2) + 'px');
    // ondas de energia: nascem nas batidas do áudio e seguem até o fim mesmo depois que a voz para
    clock += dt;
    if (!calm && target > 0.16 && ((target - prevTarget > 0.07 && clock - lastSpawn > 0.30) || clock - lastSpawn > 0.9)) {
      const r = (vs ? vsRings : rings).find(x => x.age < 0);
      if (r) { r.age = 0; r.str = Math.min(1, 0.4 + target); lastSpawn = clock; }
    }
    prevTarget = target;
    [rings, vsRings].forEach(list => list.forEach(r => {
      if (r.age < 0) return;
      r.age += dt;
      const q = r.age / 1.9;
      if (q >= 1) { r.age = -1; r.el.style.opacity = '0'; return; }
      const e = 1 - Math.pow(1 - q, 2.2);
      r.el.style.opacity = (0.55 * r.str * Math.pow(1 - q, 1.6)).toFixed(3);
      r.el.style.transform = 'translate(-50%,-50%) translateY(' + orbY.toFixed(1) + 'px) scale(' + (orbS + 0.6 * e).toFixed(3) + ')';
    }));
    const haloT = calm ? 0 : (fastHalo ? 360 / 14 : (hovered ? 360 / 20 : 360 / 28));   // arcos: 28 s em repouso, 14 s em atividade
    haloV += (haloT - haloV) * k(2);
    haloAng = (haloAng + dt * haloV) % 360;
    haloAng2 = (haloAng2 - dt * haloV * 0.55) % 360;   // o segundo arco gira mais devagar e no sentido oposto
    const rot = 'translateY(' + orbY.toFixed(2) + 'px) rotate(' + haloAng.toFixed(2) + 'deg)';   // o arco sobe e desce junto com a Orb
    // arco externo: circular e concêntrico, gira devagar no sentido oposto
    const rot2 = 'translateY(' + orbY.toFixed(2) + 'px) rotate(' + haloAng2.toFixed(2) + 'deg)';
    haloEl.style.transform = rot;
    if (halo2El) halo2El.style.transform = rot2;

    if (vs) {                                             // tela Voz e Fala aberta: só a Orb dela é desenhada
      vs.halo.style.transform = rot;
      if (vs.halo2) vs.halo2.style.transform = rot2;
      vs.zone.style.setProperty('--vs-a', rgbToHex(ringNow.a));
      vs.zone.style.setProperty('--vs-b', rgbToHex(ringNow.b));
      vs.zone.style.setProperty('--vs-c', rgbToHex(ringNow.c));
      const D = fitSquare(vs.disc), d = dprOf();
      if (D) { vs.ctx.setTransform(d, 0, 0, d, 0, 0); drawDisc(vs.ctx, D, b, colorNow); }
      return;
    }
    if (inPanel) return;                                  // Orb virou painel de resposta: nada a desenhar
    if (canvas.width) drawDisc(ctx, canvas.width, b);     // tela principal: a Orb de sempre
  }

  function init() { rings = makeRings(orbZone); resize(); window.addEventListener('resize', resize); requestAnimationFrame(frame); }
  return {
    init, setState,
    setHover: on => { hovered = on; },
    setCalm: on => { calm = !!on; },
    setVoiceScreen: els => { vs = els ? { zone: els.zone, orb: els.orb, halo: els.halo, halo2: els.halo2, disc: els.disc, ctx: els.disc.getContext('2d') } : null; vsRings = vs ? makeRings(vs.zone) : []; if (vs) decorate(); },
    setTheme: (name, snap) => {
      VISUAL_STATE.setTheme(name);
      const cfg = VISUAL_STATE.config(VISUAL_STATE.get());
      colorTarget = triple(cfg.color); ringTarget = triple(cfg.ring);
      if (snap) { colorNow = triple(cfg.color); ringNow = triple(cfg.ring); }
    },
    pressEffect: () => { press = 1; },
  };
})();

/* ═══ audio.js — sons discretos via Web Audio nativa ═══ */
const SOUND = (() => {
  let actx = null;
  function ctxRef() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type, gainPeak, delay = 0, glideTo = null) {
    const c = ctxRef();
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + delay);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, c.currentTime + delay + dur);
    gain.gain.setValueAtTime(0.0001, c.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(gainPeak, c.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(c.currentTime + delay); osc.stop(c.currentTime + delay + dur + 0.02);
  }
  return {
    init: () => tone(520, 0.10, 'sine', 0.035, 0, 700),
    activate: () => tone(560, 0.10, 'sine', 0.045, 0, 780),
    listen: () => tone(700, 0.09, 'sine', 0.04, 0, 920),
    answer: () => tone(480, 0.11, 'sine', 0.045, 0, 340),
    error: () => tone(300, 0.16, 'triangle', 0.05, 0, 160),
  };
})();

/* ═══ voice.js — SpeechRecognition + SpeechSynthesis nativos do navegador ═══
   O idioma do reconhecimento/da voz de reserva é o idioma escolhido nas configurações (pt-BR, en-US, es-ES, fr-FR, de-DE, it-IT). */
const VOICE = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let rec = null, isRec = false, onRes = null, onSt = null, cachedV = null, vReady = false, want = 'pt-BR';
  const MALE_KNOWN = ['antonio', 'antônio', 'daniel', 'fabio', 'fábio', 'felipe', 'diego', 'ricardo', 'thiago', 'tiago', 'rodrigo', 'bruno', 'gustavo', 'lucas', 'miguel', 'paulo', 'joão', 'joao', 'pedro', 'fred', 'george', 'guy', 'david', 'mark', 'alex', 'matthew'];
  const MALE_H = ['male', 'masculin', ...MALE_KNOWN];
  const FEMALE_H = ['female', 'feminin', 'francisca', 'luciana', 'maria', 'fernanda', 'joana', 'helena', 'camila', 'raquel', 'vitória', 'vitoria', 'catarina', 'ines', 'inês', 'google português do brasil', 'google portuguese'];
  const PREM_H = ['neural', 'premium', 'enhanced', 'natural', 'wavenet', 'online'];

  function scoreVoice(v) {
    const n = v.name.toLowerCase(); let s = 0;
    const vl = (v.lang || '').toLowerCase(), w = want.toLowerCase(), wl = w.slice(0, 2);
    if (vl === w) s += 50; else if (vl.startsWith(wl)) s += 30; else if (vl.startsWith('en') || vl.startsWith('pt')) s += 10; else return -1;
    if (FEMALE_H.some(h => n.includes(h))) s -= 500;
    const maleIdx = MALE_KNOWN.findIndex(h => n.includes(h));
    if (maleIdx !== -1) s += 100 - maleIdx;
    if (MALE_H.some(h => n.includes(h))) s += 40;
    if (PREM_H.some(h => n.includes(h))) s += 20;
    if (v.localService) s += 8;
    return s;
  }
  function pickVoice() {
    const vs = synth.getVoices(); if (!vs.length) return null;
    let best = null, bS = -Infinity; vs.forEach(v => { const s = scoreVoice(v); if (s > bS) { bS = s; best = v; } });
    return best || vs.find(v => (v.lang || '').toLowerCase().startsWith(want.slice(0, 2).toLowerCase())) || vs[0];
  }
  function refreshCache() { if (!synth) return; const v = pickVoice(); if (v) { cachedV = v; vReady = true; } }

  function init(cbs) {
    onRes = cbs.onResult; onSt = cbs.onStateChange;
    if (synth) { refreshCache(); if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = refreshCache; }
    if (!SR) return;
    rec = new SR();
    rec.lang = want; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onstart = () => { isRec = true; onSt('listening'); };
    // 'aborted' acontece quando o usuário para a escuta: não é erro.
    // 'no-speech' = o reconhecedor não captou fala: vira o estado "não entendi" (vermelho + convite para tentar de novo).
    rec.onerror = e => {
      isRec = false;
      if (e.error === 'aborted') onSt('standby', e.error);
      else if (e.error === 'no-speech') onSt('unheard', e.error);
      else onSt('error', e.error);
    };
    rec.onend = () => { if (isRec) { isRec = false; onSt('standby'); } };
    rec.onresult = e => {
      let fin = ''; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) fin += e.results[i][0].transcript;
      if (fin.trim()) { isRec = false; onRes(fin.trim()); }
    };
  }
  function setLang(l) { want = l; if (rec) rec.lang = l; vReady = false; refreshCache(); }
  function startListening() { if (!rec || isRec) return false; try { rec.start(); return true; } catch (e) { return false; } }
  function stopListening() { if (rec && isRec) { rec.stop(); isRec = false; } }

  function speak(text, onStart, onEnd, pace = 1) {
    if (!synth) { if (onEnd) onEnd(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!vReady) refreshCache();
    if (cachedV) { u.voice = cachedV; u.lang = cachedV.lang; } else u.lang = want;
    pace = Math.max(0.3, Math.min(1.5, pace || 1));
    u.rate = 1.08 * pace; u.pitch = 0.55; u.volume = 1.0;   // Pace também vale para a voz do navegador (faixa toda, mínimo 0.3×)
    // o Chrome às vezes não dispara onend em falas longas: um limite de tempo garante que a Orb não fique presa
    let finished = false, guard = null;
    const finish = () => { if (finished) return; finished = true; clearTimeout(guard); if (onEnd) onEnd(); };
    guard = setTimeout(() => { synth.cancel(); finish(); }, Math.max(8000, text.length * 110 / pace));
    u.onstart = () => { if (onStart) onStart(); };
    u.onend = finish; u.onerror = finish;
    synth.speak(u);
  }
  function stopSpeaking() { if (synth) synth.cancel(); }

  return { init, setLang, startListening, stopListening, speak, stopSpeaking, isAvailable: !!SR };
})();

/* ═══ wake.js — ativação por voz ("Hey ORION"): reconhecimento contínuo do navegador ═══
   Só funciona com a página aberta e visível. Fica desligado até a pessoa ativar nas Configurações.
   A detecção é do próprio navegador (Web Speech API) — não tem relação com a ElevenLabs. */
const WAKE = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // normaliza SEM mudar o tamanho do texto: assim a posição achada vale no texto original
  const flat = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
  // "hey orion", "hi orion", "olá orion", "oi orion", "ei orion", "e aí orion", "hola orion", "salut orion", "hallo orion", "ciao orion"
  // (e variações que o reconhecedor costuma escrever)
  const RE = /\b(?:hey|hei|hay|hi|ola|oi|ei|e ai|hola|salut|bonjour|hallo|ciao)\s+(?:o\s+)?(?:horion|orion|oriom|orian|oryon|oreon|orio)\b/;
  const DEBUG = () => { try { return localStorage.getItem('orion_wake_debug') === '1'; } catch (_) { return false; } };

  let rec = null, wanted = false, state = 'idle', want = 'pt-BR';   // idle | starting | running
  let handled = false, hitTimer = null, restartTimer = null, retryDelay = 350;
  let cb = { onHit() {}, onFault() {} };
  const starts = [];

  function fire(after) {
    if (handled) return;
    handled = true; clearTimeout(hitTimer); hitTimer = null;
    cb.onHit(after);
  }
  function build() {
    rec = new SR();
    rec.lang = want; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
    rec.onstart = () => { state = 'running'; };
    rec.onresult = e => {
      if (handled) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        for (let j = 0; j < r.length; j++) {
          const orig = r[j].transcript || '';
          if (DEBUG()) console.debug('[ORION] heard:', orig, r.isFinal ? '(final)' : '');
          const m = RE.exec(flat(orig));
          if (!m) continue;
          // o que veio depois de "hey orion" na mesma frase vira a pergunta ("hey orion, what time is it?")
          const after = orig.slice(m.index + m[0].length).replace(/^[\s,.:;!?-]+/, '').trim();
          if (r.isFinal) fire(after);
          else { clearTimeout(hitTimer); hitTimer = setTimeout(() => fire(after), after ? 2500 : 800); }
          return;
        }
      }
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') { wanted = false; cb.onFault('mic'); }
      else if (e.error === 'network') retryDelay = 4000;
    };
    rec.onend = () => {
      state = 'idle';
      if (!wanted) return;
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => { restartTimer = null; tryStart(); }, retryDelay);
      retryDelay = 350;
    };
  }
  function tryStart() {
    if (!wanted || state !== 'idle') return;
    const now = Date.now();
    while (starts.length && starts[0] < now - 20000) starts.shift();
    if (starts.length >= 8) { wanted = false; cb.onFault('loop'); return; }   // reiniciando sem parar: algo está errado
    starts.push(now);
    handled = false;
    try { if (!rec) build(); state = 'starting'; rec.start(); } catch (_) { state = 'idle'; }
  }
  function start() { wanted = true; if (state === 'idle' && !restartTimer) tryStart(); }
  function stop() {
    wanted = false;
    clearTimeout(restartTimer); restartTimer = null;
    clearTimeout(hitTimer); hitTimer = null;
    if (rec && state !== 'idle') { try { rec.abort(); } catch (_) {} }
  }
  function setLang(l) { want = l; if (rec) { rec.lang = l; if (state !== 'idle') { try { rec.abort(); } catch (_) {} } } }   // reinicia sozinho com o novo idioma
  return { init: c => { cb = c; }, start, stop, setLang, isAvailable: !!SR, isRunning: () => state === 'running' };
})();

/* ═══ avatar.js — foto de perfil ESCOLHIDA pelo usuário (V5.0) ═══
   Fica só neste navegador (localStorage, uma chave por conta). Nada é enviado ao servidor.
   A imagem é recortada em quadrado, reduzida e regravada como JPEG pelo canvas: isso remove metadados (EXIF/GPS)
   e impede SVG/HTML disfarçado de imagem. O que volta para a tela é sempre um data:image/jpeg gerado por nós. */
const AVATAR = (() => {
  const key = () => 'orion_avatar_' + ((window.ORION_USER && window.ORION_USER.uid) || 'anon');
  const get = () => {
    try { const v = localStorage.getItem(key()); return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v || '') ? v : null; }
    catch (_) { return null; }
  };
  const clear = () => { try { localStorage.removeItem(key()); } catch (_) {} };
  const bad = code => { const e = new Error(code); e.code = code; return e; };
  function set(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(bad('type'));
      if (file.size > 8 * 1024 * 1024) return reject(bad('size'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        try {
          const S = 160, side = Math.min(img.naturalWidth, img.naturalHeight);
          if (!side) throw new Error('empty');
          const c = document.createElement('canvas'); c.width = c.height = S;
          c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
          const data = c.toDataURL('image/jpeg', 0.85);
          localStorage.setItem(key(), data);
          resolve(data);
        } catch (_) { reject(bad('save')); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(bad('type')); };
      img.src = url;
    });
  }
  return { get, set, clear };
})();

/* ═══ attach.js — anexos da pergunta (V5.0): UMA imagem OU UM arquivo de texto ═══
   O navegador prepara o anexo (a imagem é reduzida e regravada como JPEG, o que remove EXIF); o servidor valida tudo de novo.
   Nada é guardado: o anexo vai ao modelo junto com a pergunta e só. */
const ATTACH = (() => {
  const TEXT_EXT = ['.txt', '.md', '.csv', '.json', '.log', '.xml', '.yml', '.yaml', '.html', '.css', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.php', '.sql', '.sh'];
  const MAX_IMG_ORIGINAL = 12 * 1024 * 1024, MAX_FILE_BYTES = 200 * 1024, MAX_FILE_CHARS = 30000, MAX_B64 = 1300000;
  const bad = code => { const e = new Error(code); e.code = code; return e; };
  const extOf = n => { const s = String(n || ''), i = s.lastIndexOf('.'); return i < 0 ? '' : s.slice(i).toLowerCase(); };
  const isImage = f => /^image\/(jpeg|png|webp)$/.test(f.type);
  function image(file) {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_IMG_ORIGINAL) return reject(bad('size'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        try {
          const w0 = img.naturalWidth, h0 = img.naturalHeight;
          if (!w0 || !h0) throw bad('read');
          let data = '', dataUrl = '';
          for (const [maxSide, q] of [[1024, 0.85], [800, 0.75], [640, 0.65]]) {   // tenta menor até caber no limite do servidor
            const k = Math.min(1, maxSide / Math.max(w0, h0));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            dataUrl = c.toDataURL('image/jpeg', q);
            data = dataUrl.split(',')[1] || '';
            if (data.length <= MAX_B64) break;
          }
          if (!data || data.length > MAX_B64) throw bad('size');
          resolve({ kind: 'image', name: file.name, preview: dataUrl, payload: { image: { mime: 'image/jpeg', data } } });
        } catch (e) { reject(e.code ? e : bad('read')); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(bad('read')); };
      img.src = url;
    });
  }
  function textFile(file) {
    return new Promise((resolve, reject) => {
      if (!TEXT_EXT.includes(extOf(file.name))) return reject(bad('type'));
      if (file.size > MAX_FILE_BYTES) return reject(bad('size'));
      const r = new FileReader();
      r.onerror = () => reject(bad('read'));
      r.onload = () => {
        const text = String(r.result || '');
        if (text.indexOf('\u0000') !== -1) return reject(bad('type'));   // binário disfarçado
        if (!text.trim()) return reject(bad('read'));
        if (text.length > MAX_FILE_CHARS) return reject(bad('size'));
        resolve({ kind: 'file', name: file.name.slice(0, 80), preview: null, payload: { file: { name: file.name.slice(0, 120), text } } });
      };
      r.readAsText(file);
    });
  }
  return { prepare: file => (!file ? Promise.reject(bad('type')) : isImage(file) ? image(file) : textFile(file)) };
})();

/* ═══ api — comunicação com o backend (ORION Core) ═══
   O frontend NÃO tem lógica de modelo: só envia a pergunta e mostra a resposta.
   Autenticação: o token do Firebase vem de window.ORION_GET_TOKEN (definido em orion.html).
   Voice IDs nunca chegam aqui: o site só conhece o "slot" da voz (1 a 4). */
const API = (() => {
  const base = () => ORION_CONFIG.API_URL.replace(/\/$/, '');
  const fail = (msg, code) => { const e = new Error(msg); e.code = code; return e; };
  async function token() {
    try { return (window.ORION_GET_TOKEN ? await window.ORION_GET_TOKEN() : '') || ''; } catch (_) { return ''; }
  }
  async function call(path, { method = 'GET', body, timeoutMs = 45000, blob = false } = {}) {
    if (!base()) throw fail('API not configured.', 'core_unavailable');
    const headers = { 'Authorization': 'Bearer ' + await token() };
    if (body) headers['Content-Type'] = 'application/json';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(base() + path, { method, headers, signal: ctl.signal, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw fail('No response from core.', e.name === 'AbortError' ? 'timeout' : 'core_unavailable');
    } finally { clearTimeout(timer); }
    let tts = null, voiceLocked = false;   // motivo da falha da voz vindo do servidor ("tts:<status>:<palavra-chave>")
    if (!res.ok && path.startsWith('/speak')) {
      try { const j = await res.clone().json(); const mm = /^tts:(\d+):([a-z_]*)$/.exec(j && j.detail); if (mm) tts = { status: +mm[1], kw: mm[2] }; voiceLocked = !!(j && j.detail === 'plan:voice_locked'); } catch (_) {}
    }
    const failT = (msg, code) => { const e = fail(msg, code); if (tts) e.tts = tts; return e; };
    if (res.status === 401) { if (window.ORION_SIGNOUT) window.ORION_SIGNOUT(); throw fail('Session expired.', 'api_error'); }
    if (res.status === 403 && voiceLocked) throw failT('Voice locked by plan.', 'voice_locked');   // V5.2.0: voz 2 a 4 só nos planos pagos
    if (res.status === 403) throw failT('No access.', 'forbidden');
    if (res.status === 429) throw failT('Rate limited.', 'rate_limited');
    if (res.status === 402) throw failT('Daily limit.', 'quota_exceeded');   // cota do plano esgotada
    if (res.status === 422 && path === '/ask') throw failT('Attachment invalid.', 'attachment_invalid');   // anexo recusado pelo servidor (não gasta cota)
    if (res.status === 400 && path.startsWith('/speak')) throw failT('Voice unavailable.', 'voice_unavailable');   // slot sem ID no servidor
    if (res.status === 503 || res.status === 400) throw failT('Model unavailable.', 'model_unavailable');
    if (!res.ok) throw failT('Failure ' + res.status, 'api_error');
    try { return blob ? await res.blob() : await res.json(); } catch (_) { throw fail('Unreadable response.', 'invalid_response'); }
  }
  return {
    configured: () => !!base(),
    models: () => call('/models', { timeoutMs: 60000 }),   // 60 s: o servidor gratuito pode estar "dormindo"
    ask: (text, model, lang, att) => call('/ask', { method: 'POST', body: Object.assign({ text, model, lang }, att || {}) }),   // lang: 'pt' ou 'en' · att: {image} ou {file}
    clearMemory: () => call('/memory/clear', { method: 'POST' }),
    plan: () => call('/plan', { timeoutMs: 20000 }),   // V5.2.0: plano e uso de hoje (não gasta pergunta)
    speak: (text, o) => call('/speak', { method: 'POST', body: { text, voice: o.voice, pace: o.pace, expressivity: o.expressivity }, timeoutMs: 20000, blob: true }),
    preview: o => call('/speak/preview', { method: 'POST', body: { voice: o.voice, pace: o.pace, expressivity: o.expressivity, lang: o.lang }, timeoutMs: 20000, blob: true }),
    speakDiag: slot => call('/speak/diag?voice=' + encodeURIComponent(slot || 1), { timeoutMs: 30000 }),
  };
})();

/* ═══ interação — V5.0 ═══
   Fluxo: botão de chat (ou voz) → ORION Core → resposta.
   Estados da Orb (todos disparados por eventos reais: reconhecimento de fala, resposta da API, início/fim do áudio, erros):
   idle · listening · processing · speaking · error. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ── preferências (salvas neste navegador — nada sensível aqui: sem chaves, tokens nem Voice IDs) ── */
  const KEY = 'orion_settings';
  const stored = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } })();
  const prefs = Object.assign({
    voice: true,            // falar as respostas
    sound: true, wake: true, model: null,   // wake: "Hey ORION" ligado por padrão na V4.5.0
    ui: 'pt',               // idioma ÚNICO (interface + reconhecimento de fala + prévia): pt · en · es · fr · de · it
    slot: 1, pace: 1, expr: 0.5,
  }, stored);
  if (stored.v !== 2 && stored.v !== 3) prefs.ui = 'pt';   // preferências da beta antiga: volta ao português
  if (stored.v !== 3) prefs.wake = true;                    // V4.5.0: "Hey ORION" ligado por padrão (depois disso vale a escolha da pessoa)
  prefs.v = 3;
  delete prefs.used;
  delete prefs.lang;
  prefs.ui = I18N.langs.includes(prefs.ui) ? prefs.ui : 'pt';
  prefs.voice = true;                       // as respostas sempre são faladas (a opção saiu das configurações)
  delete prefs.calm;
  prefs.slot = [1, 2, 3, 4].includes(prefs.slot) ? prefs.slot : 1;
  prefs.pace = clamp(Number.isFinite(+prefs.pace) ? +prefs.pace : 1, 0, 1.5);   // Ritmo: 0.0× a 1.50×
  prefs.expr = clamp(Number.isFinite(+prefs.expr) ? +prefs.expr : 0.5, 0, 1);
  prefs.theme = ['indigo', 'midnight', 'purple'].includes(prefs.theme) ? prefs.theme : 'indigo';   // 'preto'/'nebulosa' antigos viram índigo
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} };
  savePrefs();

  I18N.set(prefs.ui); I18N.apply();
  try { ORB.init(); } catch (err) { console.error('[ORION] ORB.init failed:', err); }

  const bootEl = $('boot'), appEl = $('app'), orbZone = $('orbZone'), orbEl = $('orb');
  const statusText = $('statusText'), statusBox = $('statusBox'), hintEl = $('hintText');
  const capBox = $('capBox'), respText = $('responseText'), answerScroll = $('answerScroll'), answerSrc = $('answerSource'), answerGallery = $('answerGallery');
  const askForm = $('askForm'), askInput = $('askInput'), askSend = $('askSend'), micBtn = $('micBtn');
  const chatBtn = $('chatBtn'), siri = $('siri');
  const attachBtn = $('attachBtn'), attachFile = $('attachFile'), attachChip = $('attachChip'), attachThumb = $('attachThumb'), attachName = $('attachName'), attachDel = $('attachDel');

  let curState = 'standby', stateGen = 0, processing = false;
  let panelOpen = false, chatOpen = false, hasAnswer = false, speaking = false, holdTimer = null, flashTimer = null;
  let wakeFault = null, wakeBlockUntil = 0;
  // ttsOn: null = ainda não sei (servidor acordando) · true = ElevenLabs ligado · false = servidor sem voz
  let models = [], voices = [], online = false, loading = false, coreErr = null, ttsOn = null;
  let quota = null;   // {used, limit, plan} do último /ask

  // "um login" = usuário + horário do último login do Firebase: sair e entrar de novo muda isso e reinicia a frase
  const sessionMark = () => { const u = window.ORION_USER; return u ? u.uid + '|' + ((u.metadata && u.metadata.lastSignInTime) || '') : null; };
  const usedNow = () => { try { const m = sessionMark(); return !!m && localStorage.getItem('orion_used') === m; } catch (_) { return false; } };
  const markUsed = () => { try { const m = sessionMark(); if (m) localStorage.setItem('orion_used', m); } catch (_) {} };

  const sfx = name => { if (prefs.sound) { try { SOUND[name](); } catch (_) {} } };
  const finePointer = () => matchMedia('(pointer: fine)').matches;

  /* ── movimento reduzido: sistema operacional (prefers-reduced-motion) ── */
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => mq.matches;
  function applyCalm() { document.body.classList.toggle('calm', calm()); ORB.setCalm(calm()); }
  if (mq.addEventListener) mq.addEventListener('change', applyCalm);
  applyCalm();

  /* ── temas (só em orion.html): Cosmic Indigo (padrão) · Dark Blue · Deep Purple ──
     O tema muda as cores de destaque da interface (e a cor da Orb); a estrutura visual é a mesma. Fica salvo neste navegador. */
  const THEMES = ['indigo', 'midnight', 'purple'];
  function applyTheme(animate) {
    const next = prefs.theme, root = document.documentElement;
    try { ORB.setTheme(next, !animate); } catch (_) {}
    if (!animate || calm() || root.dataset.theme === next) { root.dataset.theme = next; return; }
    root.classList.add('theme-swap');
    setTimeout(() => { root.dataset.theme = next; root.classList.remove('theme-swap'); }, 230);
  }
  applyTheme(false);

  /* ── idioma: reconhecimento de fala (e voz de reserva) usam o idioma escolhido; o backend hoje conhece 'pt' e 'en' ── */
  const convLang = () => (prefs.ui === 'pt' ? 'pt' : 'en');   // enviado ao /ask e ao /speak/preview
  function applyLang() { const l = I18N.locale(); VOICE.setLang(l); WAKE.setLang(l); }
  const voiceOpts = () => ({ voice: prefs.slot, pace: clamp(prefs.pace, 0.8, 1.2), expressivity: prefs.expr });   // a ElevenLabs só aceita ritmo de 0.8× a 1.2×
  const previewOpts = () => Object.assign(voiceOpts(), { lang: convLang() });

  /* ── boot (V4.5.5: mais rápido, sem textos de status) ── */
  setTimeout(() => {
    bootEl.classList.add('out');
    try { SOUND.init(); } catch (err) { console.error('[ORION] SOUND.init failed:', err); }
    setTimeout(() => { bootEl.style.display = 'none'; appEl.classList.add('on'); flash(t('online'), 3200); }, 670);
  }, 1200);

  function flash(msg, ms = 2600) {
    clearTimeout(flashTimer);
    statusText.textContent = msg;
    requestAnimationFrame(() => statusText.classList.add('show'));
    flashTimer = setTimeout(() => statusText.classList.remove('show'), ms);
  }

  /* ── estados da Orb: ponto único de mudança (a Orb só reflete o que está realmente acontecendo) ── */
  function setState(name, msg) {
    curState = name;
    stateGen++;
    try { ORB.setState(name); } catch (err) { console.error('[ORION] ORB.setState failed:', err); }
    if (statusBox) statusBox.dataset.state = name;                          // reforço de cor do texto de estado
    if (micBtn) micBtn.classList.toggle('live', name === 'listening');   // o microfone do campo de pergunta acende só quando está realmente ouvindo
    const STATUS = { listening: t('status.listening'), processing: t('status.processing') };
    const m = msg !== undefined ? msg : (STATUS[name] || '');
    clearTimeout(flashTimer);
    if (m) { statusText.textContent = m; requestAnimationFrame(() => statusText.classList.add('show')); }
    else statusText.classList.remove('show');
    return stateGen;
  }
  function lock(on) { askInput.disabled = on; askSend.disabled = on; micBtn.disabled = on; attachBtn.disabled = on; attachDel.disabled = on; }

  /* ── anexo (botão "+"): uma imagem ou um arquivo de texto por pergunta; só vai com perguntas escritas ── */
  const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  let pending = null;
  function paintAttach() {
    attachChip.hidden = !pending;
    attachThumb.textContent = ''; attachName.textContent = '';
    if (!pending) return;
    if (pending.kind === 'image' && pending.preview) { const im = document.createElement('img'); im.src = pending.preview; im.alt = ''; attachThumb.appendChild(im); }
    else attachThumb.innerHTML = FILE_ICON;   // SVG fixo, sem dados do usuário
    attachName.textContent = pending.name || '';
  }
  const clearAttach = () => { pending = null; paintAttach(); };
  attachBtn.addEventListener('click', () => attachFile.click());
  attachDel.addEventListener('click', () => { clearAttach(); if (chatOpen && finePointer()) askInput.focus(); });
  attachFile.addEventListener('change', async () => {
    const f = attachFile.files && attachFile.files[0]; attachFile.value = '';
    if (!f) return;
    try { pending = await ATTACH.prepare(f); paintAttach(); }
    catch (err) { flash(t(err && err.code === 'size' ? 'attach.errSize' : err && err.code === 'type' ? 'attach.errType' : 'attach.errRead'), 3600); }
  });

  /* ── fala: ElevenLabs (via backend) com a voz/pace/expressividade escolhidos; senão — ou se falhar — a voz do navegador ──
     Um único <audio> (AUDIO.el), "destravado" no primeiro toque: sem isso o Safari/iOS e alguns Chromes bloqueiam o play().
     O mesmo <audio> passa pelo analisador (AUDIO) para a Orb pulsar com o volume real. */
  const ttsAudio = AUDIO.el;
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    AUDIO.ensure();
    ttsAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const p = ttsAudio.play();
    if (p && p.catch) p.catch(() => { audioUnlocked = false; });
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));

  let speech = null;   // fala em andamento
  /* o: { onStart (áudio começou de verdade) · preview (usa /speak/preview, sem texto) · fail (em vez da voz do navegador) · onCancel } */
  function startSpeech(text, done, o = {}) {
    stopSpeech(false);                                   // se já havia uma fala, para sem avisar
    const my = speech = { over: false, url: null, started: false, done, cancel: o.onCancel };
    my.end = () => {
      if (my.over) return;
      my.over = true;
      if (my.url) { URL.revokeObjectURL(my.url); my.url = null; }
      if (speech === my) speech = null;
      speaking = false; AUDIO.setSim(false);
      wakeBlockUntil = Date.now() + 1200;                // não escuta o eco do final da fala
      my.done();
    };
    const tSpeech = performance.now();
    const started = () => { if (my.over || my.started) return; my.started = true; LOGGER.info('speech_timing', { ms: Math.round(performance.now() - tSpeech) }); if (o.onStart) o.onStart(); };
    const browserVoice = () => { if (my.over) return; AUDIO.setSim(true); VOICE.speak(text, started, my.end, prefs.pace); };
    const failed = err => {
      if (my.over) return;
      ttsAudio.onplaying = ttsAudio.onended = ttsAudio.onerror = null;
      if (o.fail) { o.fail(err); my.end(); } else browserVoice();
    };
    speaking = true;
    if (!o.preview && ttsOn === false) { browserVoice(); return; }   // só pula o ElevenLabs se o servidor disse que não tem voz
    const req = o.preview ? API.preview(previewOpts()) : API.speak(text, voiceOpts());
    req.then(blob => {
      if (my.over) return;                               // foi cancelada enquanto o áudio chegava
      my.url = URL.createObjectURL(blob);
      ttsAudio.onplaying = started;
      ttsAudio.onended = my.end;
      ttsAudio.onerror = () => { console.warn('[ORION] ElevenLabs audio could not be played.'); failed({ code: 'tts_unavailable' }); };
      ttsAudio.src = my.url;
      const p = ttsAudio.play();
      if (p && p.catch) p.catch(e => { console.warn('[ORION] The browser blocked the audio:', e && e.name); failed({ code: 'tts_unavailable' }); });
    }).catch(err => {                                    // limite de créditos, chave inválida, sem rede...: plano B
      if (err && err.code === 'model_unavailable') ttsOn = false;   // 503: servidor sem voz configurada
      console.warn('[ORION] ElevenLabs failed. Reason:', err && (err.code || err.message), err && err.tts ? err.tts : '');
      failed(err);
    });
  }
  function stopSpeech(notify = true) {
    const my = speech;
    VOICE.stopSpeaking(); AUDIO.setSim(false);
    if (!my) { speaking = false; return; }
    ttsAudio.onplaying = ttsAudio.onended = ttsAudio.onerror = null; try { ttsAudio.pause(); } catch (_) {}
    if (notify) my.end();
    else { my.over = true; if (my.url) URL.revokeObjectURL(my.url); speech = null; speaking = false; if (my.cancel) my.cancel(); }
  }
  const canSpeak = () => prefs.voice && (ttsOn !== false || !!window.speechSynthesis);

  /* ── painel de resposta: na hora de responder, a própria Orb cresce no lugar ── */
  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;
    capBox.classList.add('show');
  }
  function closePanel() {
    clearTimeout(holdTimer);
    if (!panelOpen) return;
    panelOpen = false;
    stopSpeech(false);
    capBox.classList.remove('show');
    if (curState === 'speaking' || curState === 'processing' || curState === 'error') setState('standby');
  }
  // o painel não fecha sozinho enquanto o ORION ainda está falando
  const scheduleHold = ms => { clearTimeout(holdTimer); holdTimer = setTimeout(() => (speaking ? scheduleHold(1500) : closePanel()), ms); };

  // aceita só links da Wikipédia e imagens da Wikimedia vindos do servidor; até 3 imagens
  function pickSource(sources) {
    let link = null, alt = '';
    const images = [];
    for (const x of Array.isArray(sources) ? sources : []) {
      try {
        const u = new URL(x.url);
        if (u.protocol !== 'https:' || !/(^|\.)(wikipedia|wikimedia)\.org$/.test(u.hostname)) continue;
        if (!link && /(^|\.)wikipedia\.org$/.test(u.hostname)) link = { href: u.href, title: String(x.title || '').slice(0, 90) };
        const list = Array.isArray(x.images) && x.images.length ? x.images : (x.image ? [x.image] : []);
        for (const s of list) {
          try {
            const i = new URL(s);
            if (i.protocol === 'https:' && i.hostname === 'upload.wikimedia.org' && !images.includes(i.href) && images.length < 3) {
              images.push(i.href);
              if (!alt) alt = String(x.title || '').slice(0, 90);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
    return (link || images.length) ? { href: link && link.href, title: (link && link.title) || alt, images } : null;
  }

  // tema para a busca na Wikipédia: tira o início da pergunta e a pontuação final (en e pt)
  function topicOf(q) {
    const t0 = String(q || '').trim().replace(/[?!.…\s]+$/, '')
      .replace(/^(who\s+(is|was|were|are)|what\s+(is|are|was|were|does)|when\s+(was|did|is)|where\s+(is|was|are)|how\s+(does|did|do)|tell\s+me\s+about|explain|quem\s+(foi|é|era|são)|o\s+que\s+(é|são|foi|significa)|qual\s+(é|foi|era)|quais\s+(são|foram)|quando\s+(foi|nasceu|morreu)|onde\s+(fica|é|nasceu)|como\s+(funciona|surgiu)|me\s+(fale|conte|explique)\s+(sobre|de|do|da)|qui[eé]n\s+(es|fue)|qu[eé]\s+es|qui\s+(est|était)|qu[’']est-ce\s+que|wer\s+(ist|war)|was\s+ist|chi\s+(è|era)|che\s+cos[’']è)\s+/i, '')
      .replace(/^(the|an?|o|a|os|as|um|uma|el|la|los|las|le|les|der|die|das|il|lo)\s+/i, '').trim();
    return (t0 || String(q || '').trim()).slice(0, 200);
  }

  const updateScrolls = () => answerScroll.classList.toggle('scrolls', answerScroll.scrollHeight > answerScroll.clientHeight + 4);
  function clearAnswer() {
    respText.textContent = ''; answerSrc.hidden = true; answerScroll.classList.remove('scrolls');
    answerGallery.hidden = true; answerGallery.textContent = '';
    capBox.classList.remove('answer-error'); hasAnswer = false;
  }

  // a resposta aparece palavra por palavra dentro do painel, com a galeria e o link da Wikipédia quando houver
  function showAnswer(text, { error = false, sources = [], query = '' } = {}) {
    capBox.classList.toggle('answer-error', error);
    respText.textContent = '';
    const words = text.split(/\s+/).filter(Boolean);
    const step = Math.min(9, 350 / Math.max(words.length, 1));   // a resposta aparece em até ~0,35 s (antes ~0,7 s)
    words.forEach((w, i) => {
      const sp = document.createElement('span');
      sp.className = 'w'; sp.textContent = w;
      if (!calm()) sp.style.animationDelay = Math.round(i * step) + 'ms';
      respText.appendChild(sp);
      respText.appendChild(document.createTextNode(' '));
    });
    const src = error ? null : pickSource(sources);
    const topic = topicOf(query);
    if (src && src.href) { answerSrc.href = src.href; answerSrc.title = src.title; answerSrc.textContent = t('wiki.read'); answerSrc.hidden = false; }
    else if (!error && topic) {
      answerSrc.href = 'https://' + prefs.ui + '.wikipedia.org/w/index.php?search=' + encodeURIComponent(topic);
      answerSrc.title = t('wiki.title', { q: topic });
      answerSrc.textContent = t('wiki.search');
      answerSrc.hidden = false;
    } else answerSrc.hidden = true;

    answerGallery.textContent = '';
    if (src && src.images.length) {
      answerGallery.hidden = false;
      src.images.forEach(url => {
        const im = document.createElement('img');
        im.alt = src.title; im.referrerPolicy = 'no-referrer';
        im.onload = () => { im.classList.add('loaded'); updateScrolls(); };
        im.onerror = () => { im.remove(); if (!answerGallery.children.length) answerGallery.hidden = true; updateScrolls(); };
        im.src = url;
        answerGallery.appendChild(im);
      });
    } else answerGallery.hidden = true;

    answerScroll.scrollTop = 0;
    requestAnimationFrame(updateScrolls);
    hasAnswer = !error;
  }

  // o ORION respondeu "não entendi" (aviso padrão do backend, em pt ou en)
  const isFallback = r => /^(desculpe,?\s+n[ãa]o entendi|sorry,?\s+i\s+(did\s*n[o’']?t|didn[’']?t|do\s*n[o’']?t|don[’']?t)\s+understand)[.…\s]*$/i.test(String(r).trim());

  /* ── erros: mensagem curta e clara; nada técnico; a Orb volta ao estado seguro ── */
  function fail(err, stage, inPanel = false) {
    const handled = ERROR_HANDLER.handle(err, stage);
    sfx('error');
    if (inPanel) {
      setState('error', '');
      openPanel();
      showAnswer(handled.message, { error: true });
      scheduleHold(handled.code === 'quota_exceeded' ? 7000 : 3400);
    } else {
      const gen = setState('error', handled.message);
      setTimeout(() => { if (stateGen === gen && curState === 'error') setState('standby'); }, 2600);
    }
  }

  /* ── ciclo principal: pergunta → Processing (enquanto o servidor gera) → resposta ──
     Escrita no chat → a Orb vira o painel (orion-v5.js).  Por voz → a Orb responde sozinha, falando. */
  async function submit(text, source) {
    text = (text || '').trim();
    const att = source === 'text' ? pending : null;   // só perguntas escritas levam anexo
    if (!text && att) text = t('attach.default');
    if (!text || processing) return;
    processing = true; lock(true);
    stopSpeech(false);
    closePanel(); clearAnswer();
    askInput.value = text;
    setState('processing');
    LOGGER.info('ask_started', { source, model: prefs.model, attach: att ? att.kind : null });   // nunca registra o texto
    const tAsk = performance.now();
    try {
      const data = await API.ask(text, prefs.model, convLang(), att && att.payload);
      LOGGER.info('ask_timing', { ms: Math.round(performance.now() - tAsk) });   // tempo do servidor (modelo + ferramentas)
      const reply = data && typeof data.reply === 'string' ? data.reply.trim() : '';
      if (!reply) { const e = new Error('Empty response.'); e.code = 'invalid_response'; throw e; }
      processing = false; lock(false);
      askInput.value = '';
      if (att) clearAttach();
      const understood = !(data.understood === false || isFallback(reply));
      if (data.quota && Number.isFinite(data.quota.used) && Number.isFinite(data.quota.limit)) {   // plano e uso do dia (vem do servidor)
        quota = { used: data.quota.used, limit: data.quota.limit, plan: String(data.quota.plan || 'free').slice(0, 8) };
        settings.sync();
      }
      if (data.agent && Array.isArray(data.agent.steps)) {   // V5.0: o servidor informa quando o Agent Engine respondeu
        LOGGER.info('agent_used', { state: String(data.agent.state), steps: data.agent.steps.length, degraded: !!data.agent.degraded });
      }
      respondInPanel(reply, understood, data.sources, text, source === 'voice');
    } catch (err) {
      processing = false; lock(false);   // o texto fica no campo para tentar de novo
      fail(err, 'ask', true);   // o erro sempre aparece escrito no painel
    }
    if (source === 'text' && chatOpen && finePointer()) askInput.focus();
  }

  // A resposta é escrita no painel e também falada. (Em pergunta por voz, orion-v5.js esconde o texto: o ORION só fala.)
  // Enquanto o servidor gera: processing. Quando a resposta chega: speaking até a fala terminar. "Não entendi": error.
  function respondInPanel(reply, understood, sources, query, byVoice) {
    markUsed();   // primeira pergunta respondida neste login: a frase embaixo da Orb muda
    const willSpeak = canSpeak() && (understood || byVoice);
    const waitAudio = understood && willSpeak;   // com voz: continua em "processando" até o áudio começar de verdade
    const gen = setState(waitAudio ? 'processing' : (understood ? 'speaking' : 'error'), '');
    openPanel();
    showAnswer(reply, { sources, query, error: !understood });
    sfx(understood ? 'answer' : 'error');
    scheduleHold(Math.min(90000, Math.max(9000, 7000 + reply.split(/\s+/).length * 400)));
    if (willSpeak) {
      startSpeech(reply, () => {
        if (understood ? (curState === 'speaking' || curState === 'processing') : stateGen === gen) setState('standby');
        if (panelOpen && hasAnswer) scheduleHold(5000);
      }, { onStart: () => { if (understood && (curState === 'processing' || curState === 'speaking')) setState('speaking', ''); } });
    } else if (understood) {
      setTimeout(() => { if (stateGen === gen && curState === 'speaking') setState('standby'); }, 2800);   // sem voz: o estado "respondendo" dura só um instante
    }
  }

  /* ── campo de pergunta (botão de chat) ── */
  function setChat(open) {
    chatOpen = open;
    document.body.classList.toggle('chat-open', open);
    askForm.classList.toggle('open', open);
    askForm.setAttribute('aria-hidden', String(!open));
    askInput.tabIndex = micBtn.tabIndex = askSend.tabIndex = attachBtn.tabIndex = attachDel.tabIndex = open ? 0 : -1;
    chatBtn.classList.toggle('on', open);
    chatBtn.setAttribute('aria-pressed', String(open));
    if (open) {
      sfx('activate');
      siri.classList.remove('play'); void siri.offsetWidth; siri.classList.add('play');
      if (finePointer()) setTimeout(() => { if (chatOpen) askInput.focus(); }, 450);
    } else askInput.blur();
  }
  chatBtn.addEventListener('click', () => setChat(!chatOpen));
  askForm.addEventListener('submit', e => { e.preventDefault(); submit(askInput.value, 'text'); });

  document.addEventListener('pointerdown', e => {
    if (panelOpen && !e.target.closest('#orb, #capBox, #askForm, #chatBtn, #codeBtn, #taskBtn, #gearBtn, #newsBtn, #settingsPanel, #codePanel, #taskPanel, #planPanel, #apiPanel, #newsPanel, #voiceScreen')) closePanel();
  });
  orbEl.addEventListener('pointerenter', () => { if (panelOpen) clearTimeout(holdTimer); });
  orbEl.addEventListener('pointerleave', () => { if (panelOpen && !speaking && hasAnswer) scheduleHold(5000); });
  orbEl.addEventListener('touchstart', () => { if (panelOpen) clearTimeout(holdTimer); }, { passive: true });
  orbEl.addEventListener('touchend', () => { if (panelOpen && !speaking && hasAnswer) scheduleHold(6000); }, { passive: true });

  /* ── voz: clicar na Orb fechada, no microfone do painel ou Espaço ── */
  try {
    VOICE.init({
      onResult: text => submit(text, 'voice'),
      onStateChange: (s, sttCode) => {
        if (s === 'listening') { setState('listening'); sfx('listen'); }
        else if (s === 'unheard') fail({ code: 'unexpected_input', message: sttCode }, 'voice');   // nenhuma fala captada → "não entendi"
        else if (s === 'error') fail({ code: ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(sttCode) ? 'mic_unavailable' : 'stt_unavailable', message: sttCode }, 'voice');
        else if (curState === 'listening') setState('standby');
      },
    });
    applyLang();
  } catch (err) { console.error('[ORION] VOICE.init failed:', err); }

  function activate() {
    if (curState === 'listening') { VOICE.stopListening(); setState('standby'); return; }
    if (speaking) { stopSpeech(); return; }
    if (processing || curState === 'error') return;
    if (!prefs.voice) return fail({ code: 'voice_disabled' }, 'voice');
    if (!VOICE.isAvailable) return fail({ code: 'stt_unavailable' }, 'voice');
    ORB.pressEffect();
    sfx('activate');
    wakeBlockUntil = Date.now() + 2500;   // o microfone do comando assume; o "Hey ORION" espera
    if (!VOICE.startListening()) fail({ code: 'mic_unavailable' }, 'voice');
  }
  orbZone.addEventListener('click', e => {
    if (panelOpen) {
      if (e.target.closest('a') || String(window.getSelection && window.getSelection())) return;
      if (speaking) { activate(); return; }   // tocar na Orb enquanto ela fala interrompe a fala
      closePanel();                            // com a legenda aberta, o toque fecha e já começa a ouvir
    }
    activate();
  });
  orbZone.addEventListener('touchstart', e => { if (panelOpen) return; e.preventDefault(); activate(); }, { passive: false });
  micBtn.addEventListener('click', () => { closePanel(); activate(); });
  orbZone.addEventListener('mouseenter', () => { try { ORB.setHover(true); } catch (_) {} });
  orbZone.addEventListener('mouseleave', () => { try { ORB.setHover(false); } catch (_) {} });
  document.addEventListener('keydown', e => {
    if (vs.isOpen()) return;
    const settingsOpen = !!document.querySelector('#settingsPanel.open, #codePanel.open, #taskPanel.open, #planPanel.open, #apiPanel.open, #newsPanel.open');
    if (e.key === 'Escape' && !settingsOpen) { if (panelOpen) closePanel(); else if (chatOpen) setChat(false); }
    else if (e.code === 'Space' && !e.target.matches('input,textarea,button,select')) { e.preventDefault(); activate(); }
    else if (e.key === '/' && !e.target.matches('input,textarea,select') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setChat(true); }
  });

  /* ── aquecimento: o servidor gratuito (Render) dorme e o token do Firebase pode precisar renovar. Ao primeiro sinal de uso
     (toque, tecla, voltar à aba) acordamos os dois, para a pergunta não esperar por isso. No máximo 1 vez a cada 20 s. ── */
  let lastWarm = 0;
  function warm() {
    const now = Date.now();
    if (now - lastWarm < 20000 || !API.configured() || document.hidden) return;
    lastWarm = now;
    try { fetch(ORION_CONFIG.API_URL.replace(/\/$/, '') + '/health', { mode: 'no-cors' }).catch(() => {}); } catch (_) {}
    try { if (window.ORION_GET_TOKEN) window.ORION_GET_TOKEN().catch(() => {}); } catch (_) {}
  }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, warm, { passive: true }));
  document.addEventListener('visibilitychange', warm);

  /* ── modelos e vozes (a lista vem do backend; o site só guarda o id do modelo e o número da voz) ── */
  async function loadModels(retry = 0) {
    if (loading) return;
    if (!API.configured()) { online = false; settings.sync(); return; }
    loading = true; settings.sync();
    try {
      const d = await API.models();
      models = Array.isArray(d.models) ? d.models : [];
      if (!models.some(m => m.id === prefs.model)) { prefs.model = d.default || (models[0] && models[0].id) || null; savePrefs(); }
      ttsOn = !!d.tts;   // o servidor tem a voz do ElevenLabs configurada?
      voices = Array.isArray(d.voices) ? d.voices.filter(v => v && Number.isInteger(v.slot) && v.slot >= 1 && v.slot <= 4).map(v => ({ slot: v.slot, label: v.label, locked: !!v.locked })) : [];
      const usable = voices.filter(v => !v.locked);   // V5.2.0: o plano FREE tem 1 voz; PLUS e PRO, 4 (o servidor também confere)
      if (ttsOn && usable.length && !usable.some(v => v.slot === prefs.slot)) { prefs.slot = usable[0].slot; savePrefs(); }
      online = true; coreErr = null;
      loadPlan();
    } catch (err) {
      online = false; coreErr = err.code || 'api_error';
      LOGGER.warn('models_unavailable', { code: coreErr });
      if (retry < 3 && coreErr !== 'forbidden') setTimeout(() => loadModels(retry + 1), 8000);
    }
    loading = false; settings.sync();
  }

  /* ── V5.2.0: plano e uso de hoje (GET /plan, não gasta pergunta): alimenta o chip do plano e a tela de planos ── */
  async function loadPlan() {
    if (!API.configured()) return;
    try {
      const d = await API.plan();
      if (d && Number.isFinite(d.used) && Number.isFinite(d.limit)) {
        const prev = quota && quota.plan;
        quota = { used: d.used, limit: d.limit, plan: String(d.plan || 'free').slice(0, 8) };
        settings.sync();
        if (prev && prev !== quota.plan) loadModels();   // o plano mudou (assinou/cancelou/venceu): relê quais vozes estão liberadas
      }
    } catch (_) { /* sem plano novo: o chip mostra o último valor conhecido */ }
  }
  window.ORION_PLAN_REFRESH = loadPlan;

  /* ── Voz e Fala (tela dedicada) ──
     Composição: a Orb original, dois arcos concêntricos (interno = intensidade da voz, externo = ritmo da fala; desenhados por
     orion-v5.js a partir do áudio real) e o dock com as 4 vozes. Nada mais: sem textos, sem sliders, sem outros controles.
     Se a prévia falhar, a Orb entra por um instante no estado "erro" (sem mensagens escritas). */
  const vs = (() => {
    const el = $('voiceScreen');
    const dots = [...el.querySelectorAll('.vs-voice')];
    const dock = $('vsDots');
    let open = false, previewing = false;

    function sync() {
      const eleven = ttsOn === true;
      dots.forEach(d => {
        const s = +d.dataset.slot, v = voices.find(x => x.slot === s);
        const name = t('vs.voiceN', { n: s });                 // "Voz 1" … "Voz 4": sem descrições das vozes
        d.querySelector('.vs-vname').textContent = name;
        const locked = !!(v && v.locked);
        d.disabled = !(eleven && v);
        d.dataset.locked = String(locked);
        d.setAttribute('aria-checked', String(prefs.slot === s && !locked));
        d.setAttribute('aria-label', locked ? name + ' — ' + t('vs.locked') : name);
      });
      dock.style.setProperty('--sel', String(prefs.slot - 1));   // o indicador índigo desliza até a voz ativa
    }

    function preview() {
      if (previewing) { stopSpeech(); return; }                 // clicar de novo interrompe a prévia
      if (processing) return;
      const err = () => { const gen = setState('error', ''); setTimeout(() => { if (stateGen === gen && curState === 'error') setState('standby'); }, 1400); };
      if (ttsOn !== true || !voices.some(v => v.slot === prefs.slot && !v.locked)) { err(); return; }
      stopSpeech();
      previewing = true;
      startSpeech('', () => { previewing = false; if (curState === 'speaking') setState('standby'); }, {
        preview: true,
        onStart: () => setState('speaking', ''),
        onCancel: () => { previewing = false; },
        fail: () => err(),
      });
    }

    function show() {
      open = true; el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
      ORB.setVoiceScreen({ zone: $('vsOrb'), orb: $('vsSphere'), halo: $('vsHalo'), halo2: $('vsHalo2'), disc: $('vsDisc') });
      sync();
      if (ttsOn === null && !loading) loadModels();
      setTimeout(() => $('vsBack').focus(), 60);
    }
    function hide() {
      open = false; el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
      ORB.setVoiceScreen(null);
      if (previewing) stopSpeech();
    }
    const back = () => { hide(); settings.setOpen(true); };

    dots.forEach(d => d.addEventListener('click', () => {
      if (d.disabled) return;
      if (d.dataset.locked === 'true') { hide(); if (window.ORION_PLANS) window.ORION_PLANS.open(); return; }   // voz de plano pago: leva à tela de planos
      prefs.slot = +d.dataset.slot; savePrefs(); sync();
      if (previewing) stopSpeech();
      preview();                                                // tocar numa voz toca uma prévia
    }));
    $('vsOrb').addEventListener('click', preview);
    $('vsOrb').addEventListener('mouseenter', () => { try { ORB.setHover(true); } catch (_) {} });
    $('vsOrb').addEventListener('mouseleave', () => { try { ORB.setHover(false); } catch (_) {} });
    $('vsOrb').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); preview(); } });
    $('vsBack').addEventListener('click', back);
    dock.addEventListener('keydown', e => {   // setas movem o foco entre as vozes
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!k) return;
      const on = dots.filter(d => !d.disabled), i = on.indexOf(document.activeElement);
      if (on.length) { e.preventDefault(); on[(i + k + on.length) % on.length].focus(); }
    });
    document.addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.preventDefault(); back(); } });

    return { show, hide, sync, isOpen: () => open };
  })();

  /* Ritmo (0.0× a 1.50×) e Expressividade (0% a 100%): valores reais da voz, ajustados pelos arcos e barras da tela Voz e Fala.
     A Expressividade só vale para as vozes da ElevenLabs; o ritmo, na ElevenLabs, é limitado a 0.8×–1.2× pelo próprio serviço. */
  window.ORION_VOICE = {
    get: () => ({ pace: prefs.pace, expr: prefs.expr }),
    set: (k, v) => {
      if (k === 'pace') prefs.pace = Math.round(clamp(+v, 0, 1.5) * 100) / 100;
      else if (k === 'expr') prefs.expr = Math.round(clamp(+v, 0, 1) * 100) / 100;
    },
    save: savePrefs,
    exprEnabled: () => ttsOn === true,
  };

  /* ── botão </> : aviso sobre ORION CODE e ORION API (ainda não existem); mesmo tamanho do painel de configurações ── */
  const codeInfo = (() => {
    let panel = null, open = false;
    function build() {
      panel = document.createElement('div');
      panel.id = 'codePanel';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'codeTitle');
      panel.innerHTML = `
        <div class="settings-card">
          <header class="set-head"><span class="ico"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 6.5L3 12l5.5 5.5M15.5 6.5L21 12l-5.5 5.5M13.5 4.5l-3 15"/></svg></span><div><h2 id="codeTitle">${t('code.title')}</h2></div></header>
          <div class="code-grid">
            <div class="code-card">
              <span class="code-badge">${t('code.soon')}</span>
              <h3>ORION CODE</h3>
              <p>${t('code.codeDesc')}</p>
              <span class="code-ver">${t('code.planned', { v: 'V5.5.0' })}</span>
            </div>
            <div class="code-card">
              <span class="code-badge ok">${t('code.available')}</span>
              <h3>ORION API</h3>
              <p>${t('code.apiDesc')}</p>
              <button id="apiOpen" class="pill-btn primary block" type="button" style="margin-top:auto">${t('code.apiOpen')}</button>
            </div>
          </div>
          <p class="code-note">${t('code.note')}</p>
          <div class="code-foot"><button id="codeClose" class="pill-btn primary block" type="button">${t('code.close')}</button></div>
        </div>`;
      document.body.appendChild(panel);
      panel.addEventListener('click', e => { if (e.target === panel) setOpen(false); });
      panel.querySelector('#codeClose').addEventListener('click', () => setOpen(false));
      panel.querySelector('#apiOpen').addEventListener('click', () => { if (window.ORION_API_PANEL) window.ORION_API_PANEL.open(); });   // V5.2.0: o painel do ORION API fecha este (Esc) e abre
    }
    function setOpen(on) {
      if (on) {
        settings.close();                                   // só um painel por vez
        if (panel) panel.remove();
        build();                                            // reconstrói a cada abertura: já vem no idioma atual
        open = true;
        requestAnimationFrame(() => { if (panel && open) { panel.classList.add('open'); panel.querySelector('#codeClose').focus(); } });
      } else if (panel && open) {
        open = false; panel.classList.remove('open');
        $('codeBtn').focus();
      }
    }
    $('codeBtn').addEventListener('click', () => { if (!vs.isOpen()) setOpen(true); });
    document.addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.preventDefault(); setOpen(false); } });
    return { setOpen, isOpen: () => open };
  })();

  /* ── settings: painel (⚙ no canto inferior direito ou Ctrl+,) ── */
  const settings = (() => {
    let panel = null, open = false;
    const ic = p => '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
    const IC = {
      gear: ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
      x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
      model: ic('<path d="M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.7 4 4 0 0 0 .6 6.6A4 4 0 1 0 12 18z"/><path d="M12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.7 4 4 0 0 1-.6 6.6A4 4 0 1 1 12 18z"/><path d="M12 5v13"/>'),
      voice: ic('<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/>'),
      wake: ic('<circle cx="12" cy="12" r="9.5"/><path d="M8 10.5v3M10.7 8v8M13.3 9.5v5M16 10.5v3"/>'),
      sound: ic('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>'),
      theme: ic('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" fill-opacity=".35"/>'),
      globe: ic('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>'),
      image: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
      trash: ic('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
      out: ic('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
      star: ic('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    };

    function coreLabel() {
      if (!API.configured()) return t('core.none');
      if (loading) return t('core.connecting');
      if (online) return models.length ? t('core.ok') : t('core.nomodel');
      return t(({ forbidden: 'core.forbidden', timeout: 'core.timeout', core_unavailable: 'core.unreach', api_error: 'core.err' })[coreErr] || 'core.down');
    }
    // "Hey ORION" reflete o estado REAL: ligado só se a pessoa quer, o navegador suporta e o microfone não falhou
    const wakeOn = () => !!(prefs.wake && prefs.voice && VOICE.isAvailable && !wakeFault);
    function sync() {
      vs.sync();
      if (!panel) return;
      const user = window.ORION_USER;
      panel.querySelector('#setEmail').textContent = (user && (user.email || user.displayName)) || t('set.none');
      panel.querySelector('#setCore').textContent = coreLabel();
      // V5.0: foto de perfil (escolhida pelo usuário, só neste navegador) e plano/uso do dia
      const avBtn = panel.querySelector('#avatarBtn'), av = AVATAR.get();
      avBtn.textContent = '';
      if (av) { const im = document.createElement('img'); im.src = av; im.alt = ''; avBtn.appendChild(im); }
      else avBtn.textContent = (((user && (user.displayName || user.email)) || '?').trim().charAt(0) || '?').toUpperCase();
      panel.querySelector('#avatarDel').hidden = !av;
      panel.querySelector('#setPlan').textContent = quota ? quota.plan.toUpperCase() + ' · ' + quota.used + '/' + quota.limit : '—';
      panel.querySelector('#toggleSound').setAttribute('aria-checked', String(!!prefs.sound));
      const tw = panel.querySelector('#toggleWake');
      tw.setAttribute('aria-checked', String(wakeOn()));
      tw.disabled = !VOICE.isAvailable;
      tw.title = !VOICE.isAvailable ? t('vs.unavailWake') : wakeFault ? t('vs.wakeMic') : '';
      panel.querySelector('#setName').textContent = (user && (user.displayName || (user.email || '').split('@')[0])) || '—';
      panel.querySelectorAll('#themeSwatches .sw').forEach(b => b.setAttribute('aria-checked', String(b.dataset.k === prefs.theme)));
      const sel = panel.querySelector('#modelSelect');
      sel.textContent = '';
      if (!models.length) {
        const o = document.createElement('option'); o.textContent = loading ? t('core.connecting') : (online ? t('set.nomodel') : t('set.unavail')); sel.appendChild(o); sel.disabled = true;
      } else {
        models.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; sel.appendChild(o); });
        sel.value = prefs.model; sel.disabled = false;
      }
      panel.querySelector('#uiSelect').value = prefs.ui;
    }

    function build() {
      panel = document.createElement('div');
      panel.id = 'settingsPanel';
      panel.innerHTML = `
        <div class="settings-card" role="dialog" aria-modal="true" aria-labelledby="setTitle">
          <header class="set-head">
            <span class="ico">${IC.gear}</span>
            <div><h2 id="setTitle">${t('set.title')}</h2><p>${t('set.sub')}</p></div>
            <button id="setClose" class="icon-btn" type="button" aria-label="${t('code.close')}" title="${t('code.close')}">${IC.x}</button>
          </header>
          <div class="set-body">
            <aside class="set-side">
              <button id="avatarBtn" class="avatar-btn" type="button" aria-label="${t('set.photo')}" title="${t('set.photo')}"></button>
              <div class="set-name" id="setName">—</div>
              <span class="settings-email" id="setEmail">—</span>
              <div class="avatar-actions">
                <button id="avatarPick" class="pill-btn block" type="button">${IC.image}${t('set.photoPick')}</button>
                <button id="avatarDel" class="pill-btn block" type="button">${IC.trash}${t('set.photoDel')}</button>
              </div>
              <input id="avatarFile" type="file" accept="image/jpeg,image/png,image/webp" hidden>
              <p class="avatar-msg" id="avatarMsg" role="status" hidden></p>
              <div class="side-info">
                <div class="mini-row"><span>${t('set.plan')}</span><span class="plan-chip" id="setPlan">—</span></div>
                <div class="mini-row"><span>${t('set.history')}</span><button id="clearChat" class="pill-btn" type="button">${t('set.clear')}</button></div>
                <div class="mini-row"><span>${t('set.core')}</span><span class="settings-email" id="setCore">—</span></div>
                <p class="side-note">${t('set.photoNote')}</p>
              </div>
            </aside>
            <div class="set-list">
              <div class="set-row"><span class="ico">${IC.model}</span><div><h3>${t('set.model')}</h3><p>${t('set.modelD')}</p></div><select id="modelSelect" class="settings-select" aria-label="${t('set.model')}"></select></div>
              <div class="set-row"><span class="ico">${IC.voice}</span><div><h3>${t('set.voice')}</h3><p>${t('set.voiceD')}</p></div><button id="openVoice" class="pill-btn" type="button">${t('set.open')}</button></div>
              <div class="set-row"><span class="ico">${IC.sound}</span><div><h3>${t('set.sound')}</h3><p>${t('set.soundD')}</p></div><button id="toggleSound" class="pill-switch" type="button" role="switch" aria-checked="true" aria-label="${t('set.sound')}"></button></div>
              <div class="set-row"><span class="ico">${IC.globe}</span><div><h3>${t('set.ui')}</h3><p>${t('set.uiD')}</p></div><select id="uiSelect" class="settings-select" aria-label="${t('set.ui')}">${I18N.langs.map(l => `<option value="${l}">${t('lang.' + l)}</option>`).join('')}</select></div>
              <div class="set-row"><span class="ico">${IC.wake}</span><div><h3>Hey ORION</h3><p>${t('set.wakeD')}</p></div><button id="toggleWake" class="pill-switch" type="button" role="switch" aria-checked="false" aria-label="Hey ORION"></button></div>
              <div class="set-row"><span class="ico">${IC.theme}</span><div><h3>${t('set.theme')}</h3><p>${t('set.themeD')}</p></div><div class="theme-swatches" id="themeSwatches" role="radiogroup" aria-label="${t('set.theme')}">${THEMES.map(k => `<button type="button" class="sw sw-${k}" role="radio" aria-checked="false" data-k="${k}" aria-label="${t('theme.' + k)}" title="${t('theme.' + k)}"></button>`).join('')}</div></div>
            </div>
          </div>
          <div class="set-foot">
            <button id="signOutBtn" class="pill-btn danger grow" type="button">${IC.out}${t('set.signout')}</button>
            <button id="upgradeBtn" class="pill-btn primary grow" type="button">${IC.star}${t('set.upgrade')}</button>
          </div>
          <p class="settings-hint" id="settingsHint">ORION AI V5.2.0</p>
          <p class="settings-note upgrade-note" id="upgradeNote" role="status" hidden></p>
        </div>`;
      document.body.appendChild(panel);

      panel.addEventListener('click', e => { if (e.target === panel) setOpen(false); });
      panel.querySelector('#setClose').addEventListener('click', () => setOpen(false));
      const aMsg = panel.querySelector('#avatarMsg'), aFile = panel.querySelector('#avatarFile');
      const aErr = c => { aMsg.textContent = t(c === 'size' ? 'set.photoBig' : c === 'save' ? 'set.photoSave' : 'set.photoType'); aMsg.hidden = false; };
      panel.querySelector('#avatarBtn').addEventListener('click', () => aFile.click());
      panel.querySelector('#avatarPick').addEventListener('click', () => aFile.click());
      aFile.addEventListener('change', async () => {
        const f = aFile.files && aFile.files[0]; aFile.value = ''; aMsg.hidden = true;
        if (!f) return;
        try { await AVATAR.set(f); sync(); } catch (err) { aErr(err && err.code); }
      });
      panel.querySelector('#avatarDel').addEventListener('click', () => { AVATAR.clear(); aMsg.hidden = true; sync(); });
      panel.querySelector('#openVoice').addEventListener('click', () => { setOpen(false); vs.show(); });
      panel.querySelector('#toggleSound').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); sync(); if (prefs.sound) sfx('activate'); });
      panel.querySelector('#toggleWake').addEventListener('click', () => {
        if (!VOICE.isAvailable) return;
        prefs.wake = !prefs.wake; savePrefs(); wakeFault = null;
        syncWake(); sync();   // o clique é o que permite o navegador pedir o microfone
        if (prefs.wake) flash(t('wake.say'), 3200);
      });
      panel.querySelector('#themeSwatches').addEventListener('click', e => {
        const b = e.target.closest('.sw'); if (!b) return;
        prefs.theme = THEMES.includes(b.dataset.k) ? b.dataset.k : 'indigo'; savePrefs(); applyTheme(true); sync();
      });
      panel.querySelector('#uiSelect').addEventListener('change', e => {
        prefs.ui = I18N.langs.includes(e.target.value) ? e.target.value : 'pt'; savePrefs();
        I18N.set(prefs.ui); I18N.apply(); applyLang(); vs.sync();
        panel.remove(); panel = null; build(); panel.classList.add('open'); sync();   // reconstrói o painel no novo idioma
        syncWake();
        panel.querySelector('#uiSelect').focus();
      });
      panel.querySelector('#modelSelect').addEventListener('change', e => {
        prefs.model = e.target.value; savePrefs();
        const m = models.find(x => x.id === prefs.model);
        if (m) flash(t('toast.model', { m: m.label }), 2400);
      });
      panel.querySelector('#clearChat').addEventListener('click', async e => {
        const btn = e.target;
        closePanel(); clearAnswer();
        try { await API.clearMemory(); btn.textContent = t('set.cleared'); } catch (_) { btn.textContent = t('set.failed'); }
        setTimeout(() => { btn.textContent = t('set.clear'); }, 1600);
      });
      panel.querySelector('#signOutBtn').addEventListener('click', () => { if (window.ORION_SIGNOUT) window.ORION_SIGNOUT(); });
      const upNote = panel.querySelector('#upgradeNote'), upHint = panel.querySelector('#settingsHint'); let upTimer = null;
      panel.querySelector('#upgradeBtn').addEventListener('click', () => {   // V5.2.0: abre Planos e faturamento (orion-v52.js)
        if (window.ORION_PLANS) { window.ORION_PLANS.open(); return; }
        upNote.textContent = t('set.upgradeSoon'); upNote.hidden = false; upHint.hidden = true;
        clearTimeout(upTimer); upTimer = setTimeout(() => { upNote.hidden = true; upHint.hidden = false; }, 4500);
      });
    }

    function setOpen(on) {
      if (!panel) build();
      open = on;
      if (open) { sync(); if (!online) loadModels(); loadPlan(); }
      panel.classList.toggle('open', open);
      if (open) setTimeout(() => { const c = panel && panel.querySelector('#setClose'); if (c && open) c.focus(); }, 80);
    }
    $('gearBtn').addEventListener('click', () => { if (!vs.isOpen()) setOpen(!open); });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); if (vs.isOpen()) return; setOpen(!open); }
      else if (e.key === 'Escape' && open) setOpen(false);
    });
    return { sync, setOpen, close: () => { if (open) setOpen(false); } };
  })();

  /* ── "Hey ORION": ativação por voz (reconhecimento contínuo do navegador; só com a página aberta e visível) ── */
  function wakeShouldRun() {
    return prefs.wake && prefs.voice && VOICE.isAvailable && !wakeFault && !document.hidden
      && appEl.classList.contains('on') && !processing && !speaking && Date.now() > wakeBlockUntil
      && curState === 'standby';
  }
  function syncWake() {
    if (wakeShouldRun()) WAKE.start(); else WAKE.stop();
    // frase embaixo da Orb: em cada login começa com "Olá! Como posso ajudar?"; depois da primeira pergunta respondida, "Qual é o próximo projeto?"
    // (não muda enquanto uma resposta está aberta; só aparece quando o login já foi confirmado)
    if (hintEl && !panelOpen && sessionMark()) {
      const txt = usedNow() ? t('hint.next') : t('hint.first');
      if (hintEl.textContent !== txt) hintEl.textContent = txt;
    }
  }
  let wakeRetried = false;
  try {
    WAKE.init({
      onHit: after => {
        WAKE.stop();
        wakeBlockUntil = Date.now() + 2500;
        setTimeout(() => {   // dá tempo ao reconhecedor do "Hey ORION" de encerrar antes de abrir o do comando
          if (processing || curState === 'listening' || curState === 'error') return;
          if (vs.isOpen()) vs.hide();
          closePanel();
          if (after && after.length > 2) submit(after, 'voice'); else activate();
        }, 300);
      },
      onFault: kind => {
        wakeFault = kind;
        flash(kind === 'mic' ? t('wake.mic') : t('wake.unstable'), 4200);
        settings.sync();
        if (!wakeRetried) {   // no próximo toque na tela tenta mais uma vez (o navegador pode exigir um gesto)
          wakeRetried = true;
          document.addEventListener('pointerdown', () => { wakeFault = null; syncWake(); settings.sync(); }, { once: true });
        }
      },
    });
    applyLang();
  } catch (err) { console.error('[ORION] WAKE.init failed:', err); }
  setInterval(syncWake, 800);
  document.addEventListener('visibilitychange', syncWake);
  syncWake();

  LOGGER.info('session_started', { sessionId: LOGGER.sessionId, apiConfigured: API.configured(), sttAvailable: VOICE.isAvailable });
  loadModels();   // já durante o boot: também acorda o servidor gratuito
  // o plano gratuito dorme após ~15 min sem uso: enquanto a página está aberta e visível, avisa que ainda estamos aqui
  if (API.configured()) setInterval(() => {
    if (!document.hidden) { try { fetch(ORION_CONFIG.API_URL.replace(/\/$/, '') + '/health', { mode: 'no-cors' }).catch(() => {}); } catch (_) {} }
  }, 9 * 60 * 1000);
})();

}   // fim do guard do standby
