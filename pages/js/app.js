/* ═══════════════════════════════════════════════════════════════
   ORION AI V4.2.0 — Interaction Layer  (pages/js/app.js)

   Frontend = interação, eventos, estados visuais e comunicação com a API.
   Backend  = autenticação, contexto, orquestração, modelos, ferramentas, segurança.
   O app.js NÃO substitui o ORION Core.

   Fluxo:  campo de texto/voz → app.js → API → ORION Core → Model Provider
           → ORION Core → API → app.js → Orb
   ═══════════════════════════════════════════════════════════════ */

/* Endereço do backend (Render). Cole aqui, ex.: 'https://orion-xxxx.onrender.com' */
const ORION_CONFIG = { API_URL: '' };

/* ═══ visual-state.js — máquina de estados visuais da Orb ═══
   STANDBY → LISTENING → THINKING → SPEAKING → STANDBY ; (qualquer) → ERROR → STANDBY */
const VISUAL_STATE = (() => {
  const CFG = {
    standby: {
      amp: 1.00, rot: 1.00, bright: 1.00, cls: '',
      color: { a: '#6d28d9', b: '#4c1d95', c: '#a78bfa' }, // Roxo Neon Escuro
    },
    listening: {
      amp: 1.20, rot: 1.55, bright: 1.18, cls: 'st-listening',
      color: { a: '#1d4ed8', b: '#1e3a8a', c: '#60a5fa' }, // Azul Neon Escuro
    },
    thinking: {
      // reaproveita o roxo do STANDBY, com mais atividade interna
      amp: 1.14, rot: 1.75, bright: 1.05, cls: 'st-thinking',
      color: { a: '#6d28d9', b: '#4c1d95', c: '#a78bfa' },
    },
    speaking: {
      amp: 1.26, rot: 1.70, bright: 1.30, cls: 'st-speaking',
      color: { a: '#15803d', b: '#14532d', c: '#4ade80' }, // Verde Neon Escuro
    },
    error: {
      amp: 0.80, rot: 0.50, bright: 0.62, cls: 'st-error',
      color: { a: '#b91c1c', b: '#7f1d1d', c: '#f87171' }, // Vermelho Neon Escuro
    },
  };

  const ALIAS = {
    idle: 'standby', standby: 'standby',
    listening: 'listening', thinking: 'thinking',
    speaking: 'speaking', error: 'error',
    processing: 'thinking', responding: 'speaking',
  };

  let current = 'standby';

  function apply(name) {
    current = ALIAS[name] || 'standby';
    return CFG[current];
  }
  function get() { return current; }
  function config(name) { return CFG[ALIAS[name] || current]; }

  return { apply, get, config };
})();

/* ═══ logger.js — diagnóstico leve (nunca grava texto bruto fora de dev) ═══ */
const LOGGER = (() => {
  const DEV = /^(localhost|127\.0\.0\.1|)$/.test(location.hostname) || location.protocol === 'file:';
  const sessionId = 'sess_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  let seq = 0;

  function newRequestId() {
    return 'req_' + (++seq) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function base(level, event, data) {
    const entry = { t: new Date().toISOString(), level, event, sessionId, ...data };
    if (!DEV) delete entry.rawText;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn('[ORION]', entry);
    return entry;
  }

  return {
    sessionId,
    newRequestId,
    info: (event, data = {}) => base('info', event, data),
    warn: (event, data = {}) => base('warn', event, data),
    error: (event, data = {}) => base('error', event, data),
    isDev: () => DEV,
  };
})();

/* ═══ error-handler.js — categorização única de falhas ═══ */
const ERROR_HANDLER = (() => {
  const MESSAGES = {
    mic_unavailable: 'Microfone indisponível.',
    stt_unavailable: 'Reconhecimento de voz indisponível neste navegador.',
    model_unavailable: 'Não consegui acessar o modelo.',
    timeout: 'A resposta demorou demais.',
    api_error: 'Falha ao comunicar com o serviço.',
    invalid_response: 'Recebi uma resposta inválida.',
    tool_unavailable: 'Essa ferramenta ainda não está disponível.',
    offline: 'Sem conexão com a internet.',
    tts_unavailable: 'Não consigo falar a resposta agora.',
    unexpected_input: 'Não entendi o que foi dito.',
    forbidden: 'Esta conta não tem acesso ao ORION.',
    rate_limited: 'Muitas solicitações. Aguarde um instante.',
    core_unavailable: 'Não consegui falar com o núcleo do ORION.',
    voice_disabled: 'Voz desativada nas configurações.',
    unknown: 'Não consegui processar.',
  };

  function classify(err) {
    if (!navigator.onLine) return 'offline';
    if (!err) return 'unknown';
    if (err.code && MESSAGES[err.code]) return err.code;
    const msg = (err.message || String(err)).toLowerCase();
    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('not-allowed') || msg.includes('mic')) return 'mic_unavailable';
    if (msg.includes('rede') || msg.includes('network')) return 'offline';
    return 'unknown';
  }

  function handle(err, stage) {
    const code = classify(err);
    LOGGER.error('error_handled', { stage, code, message: err && err.message });
    return { code, message: MESSAGES[code] || MESSAGES.unknown, recoverable: true };
  }

  return { handle, classify, MESSAGES };
})();

/* ═══ orb.js — motor visual da Orb (cor interpolada quadro a quadro) ═══ */
const ORB = (() => {
  const canvas = document.getElementById('orbCanvas');
  const ctx = canvas.getContext('2d');
  const orbEl = document.getElementById('orb');
  const haloEl = document.getElementById('halo');
  const root = document.documentElement;

  let amp = 1, targetAmp = 1;
  let rotSpeed = 1, targetRot = 1;
  let bright = 1, targetBright = 1;
  let coreAngle = 0;
  let hovered = false;
  let currentState = 'standby';

  const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
    a: Math.random() * Math.PI * 2,
    r: 0.30 + Math.random() * 0.62,
    spd: 0.06 + Math.random() * 0.10,
    size: 0.5 + Math.random() * 1.1,
    phase: Math.random() * Math.PI * 2,
    dir: i % 2 === 0 ? 1 : -1,
  }));

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }
  function hexToRgbTriple(c) { return { a: hexToRgb(c.a), b: hexToRgb(c.b), c: hexToRgb(c.c) }; }
  function rgbToHex(o) {
    const h = n => Math.round(n).toString(16).padStart(2, '0');
    return `#${h(o.r)}${h(o.g)}${h(o.b)}`;
  }
  function lerpRgb(from, to, t) {
    return { r: from.r + (to.r - from.r) * t, g: from.g + (to.g - from.g) * t, b: from.b + (to.b - from.b) * t };
  }
  function rgba(o, a) {
    return `rgba(${Math.round(o.r)},${Math.round(o.g)},${Math.round(o.b)},${Math.max(0, Math.min(1, a))})`;
  }

  let colorNow = hexToRgbTriple(VISUAL_STATE.config('standby').color);
  let colorTarget = hexToRgbTriple(VISUAL_STATE.config('standby').color);

  function resize() {
    const s = orbEl.offsetWidth;
    canvas.width = s;
    canvas.height = s;
  }

  function applyStateClass(cls) {
    orbEl.classList.remove('st-listening', 'st-thinking', 'st-speaking', 'st-error');
    if (cls) orbEl.classList.add(cls);
  }

  function setState(name) {
    const cfg = VISUAL_STATE.apply(name);
    currentState = VISUAL_STATE.get();
    targetAmp = cfg.amp;
    targetRot = cfg.rot;
    targetBright = cfg.bright;
    colorTarget = hexToRgbTriple(cfg.color);
    applyStateClass(cfg.cls);
    haloEl.classList.toggle('fast', ['listening', 'speaking', 'thinking'].includes(currentState));
    document.getElementById('orbZone').classList.toggle('speaking', currentState === 'speaking');
  }

  function setHover(on) { hovered = on; }

  function pressEffect() {
    orbEl.classList.add('pressed');
    setTimeout(() => orbEl.classList.remove('pressed'), 150);
  }

  function draw(ts) {
    const W = canvas.width, H = canvas.height, R = W / 2;
    if (W === 0) { requestAnimationFrame(draw); return; }
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();

    amp += (targetAmp - amp) * 0.035;
    rotSpeed += (targetRot - rotSpeed) * 0.035;
    bright += (targetBright - bright) * 0.05;
    colorNow.a = lerpRgb(colorNow.a, colorTarget.a, 0.035);
    colorNow.b = lerpRgb(colorNow.b, colorTarget.b, 0.035);
    colorNow.c = lerpRgb(colorNow.c, colorTarget.c, 0.035);

    root.style.setProperty('--core-a', rgbToHex(colorNow.a));
    root.style.setProperty('--core-b', rgbToHex(colorNow.b));
    root.style.setProperty('--core-c', rgbToHex(colorNow.c));

    const hoverBoost = hovered ? 1.08 : 1.0;
    coreAngle += 0.00042 * rotSpeed * (hovered ? 1.12 : 1);
    const b = bright * hoverBoost;

    const bg = ctx.createRadialGradient(R * 0.78, R * 0.58, 0, R, R, R);
    bg.addColorStop(0, rgba(colorNow.a, 0.34 * b));
    bg.addColorStop(0.55, rgba(colorNow.b, 0.42 * b));
    bg.addColorStop(1, 'rgba(0,0,2,0.94)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const t = ts * 0.00016;

    const cx = R + Math.cos(coreAngle) * R * 0.16;
    const cy = R + Math.sin(coreAngle * 1.2) * R * 0.16;
    const coreRad = R * 0.66 * amp;
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRad);
    core.addColorStop(0, rgba(colorNow.c, 0.20 * b));
    core.addColorStop(0.5, rgba(colorNow.a, 0.10 * b));
    core.addColorStop(1, 'transparent');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, coreRad, 0, Math.PI * 2); ctx.fill();

    PARTICLES.forEach(p => {
      const ang = p.a + t * p.spd * 6 * p.dir;
      const rad = R * p.r;
      const px = R + Math.cos(ang) * rad;
      const py = R + Math.sin(ang) * rad;
      const tw = 0.35 + 0.45 * Math.sin(t * 2.6 + p.phase);
      ctx.fillStyle = rgba(colorNow.c, 0.55 * tw * b);
      ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
    });

    const vig = ctx.createRadialGradient(R, R, R * 0.35, R, R, R);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,4,0.72)');
    ctx.fillStyle = vig;
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
    requestAnimationFrame(draw);
  }

  function init() {
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(draw);
  }

  return { init, setState, setHover, pressEffect };
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

/* ═══ voice.js — SpeechRecognition + SpeechSynthesis nativos do navegador ═══ */
const VOICE = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  let rec = null, isRec = false, onRes = null, onSt = null, cachedV = null, vReady = false;
  const MALE_KNOWN = ['antonio', 'antônio', 'daniel', 'fabio', 'fábio', 'felipe', 'diego', 'ricardo', 'thiago', 'tiago', 'rodrigo', 'bruno', 'gustavo', 'lucas', 'miguel', 'paulo', 'joão', 'joao', 'pedro', 'fred', 'george', 'guy', 'david', 'mark', 'alex', 'matthew'];
  const MALE_H = ['male', 'masculin', ...MALE_KNOWN];
  const FEMALE_H = ['female', 'feminin', 'francisca', 'luciana', 'maria', 'fernanda', 'joana', 'helena', 'camila', 'raquel', 'vitória', 'vitoria', 'catarina', 'ines', 'inês', 'google português do brasil', 'google portuguese'];
  const PREM_H = ['neural', 'premium', 'enhanced', 'natural', 'wavenet', 'online'];

  function scoreVoice(v) {
    const n = v.name.toLowerCase(); let s = 0;
    const isPTBR = v.lang?.toLowerCase() === 'pt-br', isPT = v.lang?.toLowerCase().startsWith('pt'), isEN = v.lang?.toLowerCase().startsWith('en');
    if (isPTBR) s += 50; else if (isPT) s += 30; else if (isEN) s += 10; else return -1;
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
    if (best && FEMALE_H.some(h => best.name.toLowerCase().includes(h))) {
      console.warn('[ORION] Nenhuma voz masculina em pt encontrada neste navegador/SO. Usando', best.name, 'como única opção disponível.');
    }
    return best || vs.find(v => v.lang?.toLowerCase().startsWith('pt')) || vs[0];
  }
  function refreshCache() { const v = pickVoice(); if (v) { cachedV = v; vReady = true; } }

  function init(cbs) {
    onRes = cbs.onResult; onSt = cbs.onStateChange;
    if (synth) { refreshCache(); if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = refreshCache; }
    if (!SR) return;
    rec = new SR();
    rec.lang = 'pt-BR'; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onstart = () => { isRec = true; onSt('listening'); };
    rec.onerror = e => { isRec = false; onSt(e.error === 'no-speech' ? 'standby' : 'error', e.error); };
    rec.onend = () => { if (isRec) { isRec = false; onSt('standby'); } };
    rec.onresult = e => {
      let fin = ''; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) fin += e.results[i][0].transcript;
      if (fin.trim()) { isRec = false; onRes(fin.trim()); }
    };
  }
  function startListening() { if (!rec || isRec) return false; try { rec.start(); return true; } catch (e) { return false; } }
  function stopListening() { if (rec && isRec) { rec.stop(); isRec = false; } }

  function speak(text, onStart, onEnd) {
    if (!synth) { if (onEnd) onEnd(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (!vReady) refreshCache();
    if (cachedV) { u.voice = cachedV; u.lang = cachedV.lang; } else u.lang = 'pt-BR';
    u.rate = 1.08; u.pitch = 0.55; u.volume = 1.0;
    u.onstart = () => { if (onStart) onStart(); };
    u.onend = () => { if (onEnd) onEnd(); };
    u.onerror = () => { if (onEnd) onEnd(); };
    synth.speak(u);
  }
  function stopSpeaking() { if (synth) synth.cancel(); }

  return { init, startListening, stopListening, speak, stopSpeaking, isAvailable: !!SR };
})();

/* ═══ api — comunicação com o backend (ORION Core) ═══
   O frontend NÃO tem lógica de modelo: só envia a pergunta e mostra a resposta.
   Autenticação: o token do Firebase vem de window.ORION_GET_TOKEN (definido em orion.html). */
const API = (() => {
  const base = () => ORION_CONFIG.API_URL.replace(/\/$/, '');
  const fail = (msg, code) => { const e = new Error(msg); e.code = code; return e; };

  async function token() {
    try { return (window.ORION_GET_TOKEN ? await window.ORION_GET_TOKEN() : '') || ''; } catch (_) { return ''; }
  }

  async function call(path, { method = 'GET', body, timeoutMs = 45000 } = {}) {
    if (!base()) throw fail('API não configurada.', 'core_unavailable');
    const headers = { 'Authorization': 'Bearer ' + await token() };
    if (body) headers['Content-Type'] = 'application/json';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(base() + path, { method, headers, signal: ctl.signal, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw fail('Sem resposta do núcleo.', e.name === 'AbortError' ? 'timeout' : 'core_unavailable');
    } finally { clearTimeout(timer); }
    if (res.status === 401) { if (window.ORION_SIGNOUT) window.ORION_SIGNOUT(); throw fail('Sessão expirada.', 'api_error'); }
    if (res.status === 403) throw fail('Conta sem acesso.', 'forbidden');
    if (res.status === 429) throw fail('Limite de uso.', 'rate_limited');
    if (res.status === 503 || res.status === 400) throw fail('Modelo indisponível.', 'model_unavailable');
    if (!res.ok) throw fail('Falha ' + res.status, 'api_error');
    try { return await res.json(); } catch (_) { throw fail('Resposta ilegível.', 'invalid_response'); }
  }

  return {
    configured: () => !!base(),
    models: () => call('/models', { timeoutMs: 60000 }),   // 60 s: o servidor gratuito pode estar "dormindo"
    ask: (text, model) => call('/ask', { method: 'POST', body: { text, model } }),
    clearMemory: () => call('/memory/clear', { method: 'POST' }),
  };
})();

/* ═══ interação — V4.2.0 ═══
   Fluxo: campo de texto (ou voz) → API → ORION Core → resposta apresentada PELA Orb.
   Estados da Orb: standby · listening · processing · responding · error. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const bootEl = $('boot'), bootStatus = $('bootStatus'), appEl = $('app'), orbZone = $('orbZone');
  const statusText = $('statusText'), hintText = $('hintText');
  const respEl = $('response'), respText = $('responseText');
  const askForm = $('askForm'), askInput = $('askInput'), askSend = $('askSend');
  const chatBtn = $('chatBtn'), siri = $('siri');

  /* ── preferências (salvas neste navegador) ── */
  const KEY = 'orion_settings';
  const prefs = Object.assign({ voice: true, sound: true, model: null },
    (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } })());
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} };

  let curState = 'standby', stateGen = 0, processing = false, hintShown = true, chatOpen = false;
  let flashTimer = null, hideTimer = null;
  let models = [], online = false;

  const sfx = name => { if (prefs.sound) { try { SOUND[name](); } catch (_) {} } };
  const finePointer = () => matchMedia('(pointer: fine)').matches;

  /* ── boot: inicializando → conectando ao núcleo → sistemas online ── */
  const bootLines = ['inicializando', 'conectando ao núcleo', 'sistemas online'];
  bootLines.forEach((line, i) => {
    if (i === 0) return;
    setTimeout(() => {
      bootStatus.style.opacity = '0';
      setTimeout(() => { bootStatus.textContent = line; bootStatus.style.opacity = '1'; }, 250);
    }, i * 1100);
  });
  setTimeout(() => {
    bootEl.classList.add('out');
    try { SOUND.init(); } catch (err) { console.error('[ORION] SOUND.init falhou:', err); }
    setTimeout(() => {
      bootEl.style.display = 'none';
      appEl.classList.add('on');
      flash('ORION ONLINE', 3200);
    }, 1000);
  }, 3600);

  /* ── status (linha pequena sob a Orb) ── */
  function flash(msg, ms = 2600) {
    clearTimeout(flashTimer);
    statusText.textContent = msg;
    requestAnimationFrame(() => statusText.classList.add('show'));
    flashTimer = setTimeout(() => statusText.classList.remove('show'), ms);
  }

  /* ── estados da Orb: ponto único de mudança ── */
  function setState(name, msg) {
    curState = name;
    stateGen++;
    try { ORB.setState(name); } catch (err) { console.error('[ORION] ORB.setState falhou:', err); }
    const STATUS = { listening: 'Ouvindo…', processing: 'Processando…' };
    const m = msg !== undefined ? msg : (STATUS[name] || '');
    clearTimeout(flashTimer);
    if (m) { statusText.textContent = m; requestAnimationFrame(() => statusText.classList.add('show')); }
    else statusText.classList.remove('show');
    return stateGen;
  }

  /* ── a resposta aparece na própria cena, palavra por palavra (nunca vira uma lista de mensagens) ── */
  function showResponse(text, { error = false, holdMs } = {}) {
    clearTimeout(hideTimer);
    respEl.classList.toggle('error', error);
    respText.textContent = '';
    const words = text.split(/\s+/).filter(Boolean);
    const step = Math.min(55, 2600 / Math.max(words.length, 1));
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'w'; s.textContent = w;
      if (!still) s.style.animationDelay = Math.round(i * step) + 'ms';
      respText.appendChild(s);
      respText.appendChild(document.createTextNode(' '));   // espaço real entre palavras (leitores de tela / copiar)
    });
    respEl.scrollTop = 0;
    document.body.classList.add('has-response');
    respEl.classList.add('show');
    hideTimer = setTimeout(hideResponse, holdMs || Math.max(14000, words.length * 600 + 8000));
  }
  function hideResponse() {
    clearTimeout(hideTimer);
    respEl.classList.remove('show');
    document.body.classList.remove('has-response');
  }
  const readMs = t => Math.min(15000, Math.max(2500, t.split(/\s+/).length * 350));

  function hideHint() {
    if (!hintShown) return;
    hintShown = false;
    hintText.style.opacity = '0';
  }
  function lock(on) { askInput.disabled = on; askSend.disabled = on; }

  /* ── erros: mensagem curta e clara; nada técnico; a Orb volta ao estado seguro ── */
  function fail(err, stage) {
    const handled = ERROR_HANDLER.handle(err, stage);   // só registra código/estágio no console
    const gen = setState('error', '');
    sfx('error');
    showResponse(handled.message, { error: true, holdMs: 6000 });
    setTimeout(() => { if (stateGen === gen && curState === 'error') setState('standby'); }, 2200);
  }

  /* ── ciclo principal: pergunta → API → Orb ── */
  async function submit(text, source) {
    text = (text || '').trim();
    if (!text || processing) return;
    processing = true; lock(true);
    hideHint(); VOICE.stopSpeaking(); hideResponse();
    askInput.value = '';
    setState('processing');
    LOGGER.info('ask_started', { source, model: prefs.model });   // nunca registra o texto
    try {
      const data = await API.ask(text, prefs.model);
      const reply = data && typeof data.reply === 'string' ? data.reply.trim() : '';
      if (!reply) { const e = new Error('Resposta vazia.'); e.code = 'invalid_response'; throw e; }
      processing = false; lock(false);
      respond(reply, source);
    } catch (err) {
      processing = false; lock(false);
      if (!askInput.value) askInput.value = text;   // devolve o texto para o usuário tentar de novo
      fail(err, 'ask');
    }
    if (source === 'text' && finePointer()) askInput.focus();
  }

  function respond(reply, source) {
    const gen = setState('responding');
    showResponse(reply);
    sfx('answer');
    const done = () => { if (stateGen === gen) setState('standby'); };
    // só fala em voz alta quando a pergunta foi feita por voz (e a voz está ativada)
    if (source === 'voice' && prefs.voice) VOICE.speak(reply, () => {}, done);
    else setTimeout(done, readMs(reply));
  }

  /* ── botão de chat: o campo sobe da base da tela até abaixo da Orb ── */
  function setChat(open) {
    chatOpen = open;
    document.body.classList.toggle('chat-open', open);
    askForm.classList.toggle('open', open);
    askForm.setAttribute('aria-hidden', String(!open));
    chatBtn.classList.toggle('on', open);
    chatBtn.setAttribute('aria-pressed', String(open));
    askInput.tabIndex = askSend.tabIndex = open ? 0 : -1;
    if (open) {
      hideHint(); sfx('activate');
      siri.classList.remove('play'); void siri.offsetWidth; siri.classList.add('play');
      if (finePointer()) setTimeout(() => { if (chatOpen) askInput.focus(); }, 450);
    } else askInput.blur();
  }
  chatBtn.addEventListener('click', () => setChat(!chatOpen));
  askInput.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); setChat(false); } });

  askForm.addEventListener('submit', e => { e.preventDefault(); submit(askInput.value, 'text'); });
  askInput.addEventListener('focus', hideHint);

  /* ── voz (já existente): clicar na Orb para falar ── */
  try {
    VOICE.init({
      onResult: text => submit(text, 'voice'),
      onStateChange: (s, sttCode) => {
        if (s === 'listening') { setState('listening'); sfx('listen'); }
        else if (s === 'error') fail({ code: 'stt_unavailable', message: sttCode }, 'voice');
        else if (curState === 'listening') setState('standby');
      },
    });
  } catch (err) { console.error('[ORION] VOICE.init falhou:', err); }

  function activate() {
    hideHint();
    if (curState === 'responding') { VOICE.stopSpeaking(); setState('standby'); return; }
    if (curState === 'listening') { VOICE.stopListening(); setState('standby'); return; }
    if (processing || curState !== 'standby') return;
    if (!prefs.voice) return fail({ code: 'voice_disabled' }, 'voice');
    if (!VOICE.isAvailable) return fail({ code: 'stt_unavailable' }, 'voice');
    ORB.pressEffect();
    sfx('activate');
    if (!VOICE.startListening()) fail({ code: 'mic_unavailable' }, 'voice');
  }
  orbZone.addEventListener('click', activate);
  orbZone.addEventListener('touchstart', e => { e.preventDefault(); activate(); }, { passive: false });
  orbZone.addEventListener('mouseenter', () => { try { ORB.setHover(true); } catch (_) {} });
  orbZone.addEventListener('mouseleave', () => { try { ORB.setHover(false); } catch (_) {} });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.target.matches('input,textarea,button,select')) { e.preventDefault(); activate(); }
    else if (e.key === '/' && !e.target.matches('input,textarea,select') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setChat(true); }
  });

  /* ── modelos (lista vem do backend; o site só guarda o id escolhido) ── */
  async function loadModels() {
    if (!API.configured()) { online = false; settings.sync(); return; }
    try {
      const d = await API.models();
      models = Array.isArray(d.models) ? d.models : [];
      if (!models.some(m => m.id === prefs.model)) { prefs.model = d.default || (models[0] && models[0].id) || null; savePrefs(); }
      online = true;
    } catch (err) { online = false; LOGGER.warn('models_unavailable', { code: err.code }); }
    settings.sync();
  }

  /* ── settings: painel (⚙ no canto inferior direito ou Ctrl+,) ── */
  const settings = (() => {
    let panel = null, open = false;
    const label = (key, on) => key === 'voice' ? (on ? 'Ativada' : 'Desativada') : (on ? 'Ativados' : 'Desativados');

    function sync() {
      if (!panel) return;
      const user = window.ORION_USER;
      panel.querySelector('#setEmail').textContent = (user && (user.email || user.displayName)) || 'Não conectada';
      panel.querySelector('#setCore').textContent = online ? 'Conectado' : (API.configured() ? 'Servidor indisponível' : 'Backend não configurado');
      panel.querySelector('#toggleVoice').textContent = label('voice', prefs.voice);
      panel.querySelector('#toggleSound').textContent = label('sound', prefs.sound);
      const sel = panel.querySelector('#modelSelect');
      sel.textContent = '';
      if (!models.length) {
        const o = document.createElement('option'); o.textContent = online ? '—' : 'Indisponível'; sel.appendChild(o); sel.disabled = true;
      } else {
        models.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; sel.appendChild(o); });
        sel.value = prefs.model; sel.disabled = false;
      }
    }

    function build() {
      panel = document.createElement('div');
      panel.id = 'settingsPanel';
      panel.innerHTML = `
        <div class="settings-card">
          <p class="settings-title">Configurações</p>
          <div class="settings-row"><span>Conta</span><span class="settings-email" id="setEmail">—</span></div>
          <div class="settings-row"><span>Modelo</span><select id="modelSelect" class="settings-select" aria-label="Modelo"></select></div>
          <div class="settings-row"><span>Voz</span><button id="toggleVoice" class="settings-toggle"></button></div>
          <div class="settings-row"><span>Sons</span><button id="toggleSound" class="settings-toggle"></button></div>
          <div class="settings-row"><span>Conversa</span><button id="clearChat" class="settings-toggle">Limpar</button></div>
          <div class="settings-row"><span>Núcleo</span><span class="settings-email" id="setCore">—</span></div>
          <button id="signOutBtn" class="settings-out">Sair da conta</button>
          <p class="settings-hint">ORION AI V4.2.0</p>
        </div>`;
      document.body.appendChild(panel);

      panel.addEventListener('click', e => { if (e.target === panel) toggle(); });
      panel.querySelector('#toggleVoice').addEventListener('click', () => {
        prefs.voice = !prefs.voice; savePrefs(); sync();
        if (!prefs.voice) { VOICE.stopSpeaking(); if (curState === 'listening') { VOICE.stopListening(); setState('standby'); } }
      });
      panel.querySelector('#toggleSound').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); sync(); });
      panel.querySelector('#modelSelect').addEventListener('change', e => {
        prefs.model = e.target.value; savePrefs();
        const m = models.find(x => x.id === prefs.model);
        if (m) flash('Modelo: ' + m.label, 2400);
      });
      panel.querySelector('#clearChat').addEventListener('click', async e => {
        const btn = e.target;
        hideResponse();
        try { await API.clearMemory(); btn.textContent = 'Limpo'; } catch (_) { btn.textContent = 'Falhou'; }
        setTimeout(() => { btn.textContent = 'Limpar'; }, 1600);
      });
      panel.querySelector('#signOutBtn').addEventListener('click', () => { if (window.ORION_SIGNOUT) window.ORION_SIGNOUT(); });
    }

    function toggle() {
      if (!panel) build();
      open = !open;
      if (open) { sync(); if (!online) loadModels(); }
      panel.classList.toggle('open', open);
    }

    document.getElementById('gearBtn').addEventListener('click', toggle);
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); toggle(); }
      else if (e.key === 'Escape' && open) toggle();
    });
    return { sync };
  })();

  try { ORB.init(); } catch (err) { console.error('[ORION] ORB.init falhou:', err); }
  LOGGER.info('session_started', { sessionId: LOGGER.sessionId, apiConfigured: API.configured(), sttAvailable: VOICE.isAvailable });
  loadModels();   // já durante o boot: também acorda o servidor gratuito
})();
