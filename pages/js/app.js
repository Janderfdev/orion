/* ═══════════════════════════════════════════════════════════════
   ORION AI V4.2.5 — Interaction Layer  (pages/js/app.js)

   Frontend = interação, eventos, estados visuais e comunicação com a API.
   Backend  = autenticação, contexto, orquestração, modelos, ferramentas, segurança.
   O app.js NÃO substitui o ORION Core.

   Fluxo:  campo de texto/voz → app.js → API → ORION Core → Model Provider
           → ORION Core → API → app.js → Orb
   ═══════════════════════════════════════════════════════════════ */

/* Endereço do backend (Render). Se um dia mudar, troque aqui (sem barra no final). */
const ORION_CONFIG = { API_URL: 'https://orion-backend-9qk5.onrender.com' };

/* ═══ visual-state.js — máquina de estados visuais da Orb ═══
   STANDBY → LISTENING → THINKING → SPEAKING → STANDBY ; (qualquer) → ERROR → STANDBY */
const VISUAL_STATE = (() => {
  const CFG = {
    standby: {
      amp: 1.00, rot: 1.00, bright: 0.82, cls: '',
      color: { a: '#5b21b6', b: '#2e1065', c: '#8b5cf6' }, // Roxo profundo
    },
    listening: {
      amp: 1.18, rot: 1.50, bright: 0.95, cls: 'st-listening',
      color: { a: '#1e40af', b: '#172554', c: '#3b82f6' }, // Azul profundo
    },
    thinking: {
      // reaproveita o roxo do STANDBY, com mais atividade interna
      amp: 1.12, rot: 1.80, bright: 0.88, cls: 'st-thinking',
      color: { a: '#5b21b6', b: '#2e1065', c: '#8b5cf6' },
    },
    speaking: {
      amp: 1.24, rot: 1.65, bright: 1.00, cls: 'st-speaking',
      color: { a: '#166534', b: '#052e16', c: '#22c55e' }, // Verde profundo
    },
    error: {
      amp: 0.82, rot: 0.50, bright: 0.60, cls: 'st-error',
      color: { a: '#991b1b', b: '#450a0a', c: '#ef4444' }, // Vermelho profundo
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
    quota_exceeded: 'Você atingiu o limite de perguntas. Faça upgrade para continuar usando a IA em breve.',
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

/* ═══ orb.js — motor visual da Orb (blobs de luz fluidos, cor interpolada quadro a quadro) ═══ */
const ORB = (() => {
  const canvas = document.getElementById('orbCanvas');
  const ctx = canvas.getContext('2d');
  const orbEl = document.getElementById('orb');
  const haloEl = document.getElementById('halo');
  const root = document.documentElement;

  let amp = 1, targetAmp = 1;
  let rotSpeed = 1, targetRot = 1;
  let bright = 0.82, targetBright = 0.82;
  let hovered = false, currentState = 'standby';
  let flow = 0, lastTs = 0;

  // blobs de luz que flutuam em órbitas lentas e se misturam (efeito líquido)
  const BLOBS = [
    { fx: 0.31, fy: 0.43, px: 0.0, py: 1.3, ox: 0.34, oy: 0.30, r: 0.62, col: 'a', al: 0.55 },
    { fx: 0.47, fy: 0.29, px: 2.1, py: 0.4, ox: 0.38, oy: 0.34, r: 0.56, col: 'c', al: 0.30 },
    { fx: 0.23, fy: 0.37, px: 4.0, py: 2.7, ox: 0.30, oy: 0.38, r: 0.66, col: 'b', al: 0.65 },
    { fx: 0.53, fy: 0.19, px: 5.2, py: 3.9, ox: 0.36, oy: 0.28, r: 0.50, col: 'a', al: 0.40 },
    { fx: 0.17, fy: 0.51, px: 1.1, py: 5.0, ox: 0.28, oy: 0.32, r: 0.58, col: 'c', al: 0.24 },
  ];

  const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
    a: Math.random() * Math.PI * 2,
    r: 0.28 + Math.random() * 0.62,
    spd: 0.05 + Math.random() * 0.08,
    size: 0.5 + Math.random() * 1.0,
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
    requestAnimationFrame(draw);
    const W = canvas.width, H = canvas.height, R = W / 2;
    if (!W) return;

    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    const k = rate => 1 - Math.exp(-dt * rate);   // suavização independente do FPS

    amp += (targetAmp - amp) * k(1.8);
    rotSpeed += (targetRot - rotSpeed) * k(1.8);
    bright += (targetBright - bright) * k(2.2);
    colorNow.a = lerpRgb(colorNow.a, colorTarget.a, k(1.7));
    colorNow.b = lerpRgb(colorNow.b, colorTarget.b, k(1.7));
    colorNow.c = lerpRgb(colorNow.c, colorTarget.c, k(1.7));

    root.style.setProperty('--core-a', rgbToHex(colorNow.a));
    root.style.setProperty('--core-b', rgbToHex(colorNow.b));
    root.style.setProperty('--core-c', rgbToHex(colorNow.c));

    flow += dt * rotSpeed * (hovered ? 1.12 : 1);
    const b = bright * (hovered ? 1.06 : 1);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();

    // fundo escuro
    const bg = ctx.createRadialGradient(R * 0.8, R * 0.6, 0, R, R, R);
    bg.addColorStop(0, rgba(colorNow.b, 0.55 * b));
    bg.addColorStop(1, 'rgba(0,0,3,0.96)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // blobs de luz (mistura aditiva = visual líquido)
    ctx.globalCompositeOperation = 'lighter';
    BLOBS.forEach(bl => {
      const x = R + Math.sin(flow * bl.fx + bl.px) * R * bl.ox;
      const y = R + Math.cos(flow * bl.fy + bl.py) * R * bl.oy;
      const rad = R * bl.r * amp * (1 + 0.10 * Math.sin(flow * bl.fx * 1.7 + bl.py));
      const col = colorNow[bl.col];
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, rgba(col, bl.al * b));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });

    // partículas discretas
    PARTICLES.forEach(p => {
      const ang = p.a + flow * p.spd * p.dir;
      const px = R + Math.cos(ang) * R * p.r;
      const py = R + Math.sin(ang) * R * p.r;
      const tw = 0.35 + 0.45 * Math.sin(flow * 0.9 + p.phase);
      ctx.fillStyle = rgba(colorNow.c, 0.45 * tw * b);
      ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
    });

    // vinheta escura nas bordas
    ctx.globalCompositeOperation = 'source-over';
    const vig = ctx.createRadialGradient(R, R, R * 0.30, R, R, R);
    vig.addColorStop(0, 'rgba(0,0,4,0)');
    vig.addColorStop(1, 'rgba(0,0,4,0.80)');
    ctx.fillStyle = vig;
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
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
    // 'aborted' acontece quando o usuário para a escuta: não é erro
    rec.onerror = e => { isRec = false; onSt(e.error === 'no-speech' || e.error === 'aborted' ? 'standby' : 'error', e.error); };
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
    // o Chrome às vezes não dispara onend em falas longas: um limite de tempo garante que a Orb não fique presa
    let finished = false, guard = null;
    const finish = () => { if (finished) return; finished = true; clearTimeout(guard); if (onEnd) onEnd(); };
    guard = setTimeout(() => { synth.cancel(); finish(); }, Math.max(8000, text.length * 110));
    u.onstart = () => { if (onStart) onStart(); };
    u.onend = finish; u.onerror = finish;
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

  async function call(path, { method = 'GET', body, timeoutMs = 45000, blob = false } = {}) {
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
    if (res.status === 402) throw fail('Limite diário.', 'quota_exceeded');   // cota do plano esgotada
    if (res.status === 503 || res.status === 400) throw fail('Modelo indisponível.', 'model_unavailable');
    if (!res.ok) throw fail('Falha ' + res.status, 'api_error');
    try { return blob ? await res.blob() : await res.json(); } catch (_) { throw fail('Resposta ilegível.', 'invalid_response'); }
  }

  return {
    configured: () => !!base(),
    models: () => call('/models', { timeoutMs: 60000 }),   // 60 s: o servidor gratuito pode estar "dormindo"
    ask: (text, model) => call('/ask', { method: 'POST', body: { text, model } }),   // → { reply, model, sources }
    clearMemory: () => call('/memory/clear', { method: 'POST' }),
    speak: text => call('/speak', { method: 'POST', body: { text }, timeoutMs: 20000, blob: true }),   // áudio da voz do ElevenLabs
    speakDiag: () => call('/speak/diag', { timeoutMs: 30000 }),   // diagnóstico da voz (ver configurações → Fala)
  };
})();

/* ═══ interação — V4.2.5 ═══
   Fluxo: botão de chat (ou voz) → a própria Orb cresce e vira o painel de pesquisa → API → ORION Core
          → "Processando…" abaixo do painel → a resposta aparece DENTRO do painel.
   Estados da Orb: standby · listening · processing · responding · error. */
(function () {
  'use strict';
  try { ORB.init(); } catch (err) { console.error('[ORION] ORB.init falhou:', err); }
  const $ = id => document.getElementById(id);
  const bootEl = $('boot'), bootStatus = $('bootStatus'), appEl = $('app'), orbZone = $('orbZone'), orbEl = $('orb');
  const statusText = $('statusText');
  const respText = $('responseText'), answerScroll = $('answerScroll'), answerSrc = $('answerSource'), answerGallery = $('answerGallery');
  const askForm = $('askForm'), askInput = $('askInput'), askSend = $('askSend'), micBtn = $('micBtn');
  const chatBtn = $('chatBtn'), siri = $('siri');

  /* ── preferências (salvas neste navegador) ── */
  const KEY = 'orion_settings';
  const prefs = Object.assign({ voice: true, sound: true, model: null },
    (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } })());
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} };

  let curState = 'standby', stateGen = 0, processing = false;
  let panelOpen = false, chatOpen = false, hasAnswer = false, speaking = false, holdTimer = null;
  let flashTimer = null;
  // ttsOn: null = ainda não sei (servidor acordando) · true = ElevenLabs ligado · false = servidor sem voz
  let models = [], online = false, loading = false, coreErr = null, ttsOn = null;

  const sfx = name => { if (prefs.sound) { try { SOUND[name](); } catch (_) {} } };
  const finePointer = () => matchMedia('(pointer: fine)').matches;

  /* ── boot: inicializando → conectando ao núcleo → sistemas online ── */
  const bootLines = ['inicializando', 'conectando ao núcleo', 'sistemas online'];
  bootLines.forEach((line, i) => {
    if (i === 0) return;
    setTimeout(() => {
      bootStatus.style.opacity = '0';
      setTimeout(() => { bootStatus.textContent = line; bootStatus.style.opacity = '1'; }, 170);
    }, i * 730);
  });
  setTimeout(() => {
    bootEl.classList.add('out');
    try { SOUND.init(); } catch (err) { console.error('[ORION] SOUND.init falhou:', err); }
    setTimeout(() => {
      bootEl.style.display = 'none';
      appEl.classList.add('on');
      flash('ORION ONLINE', 3200);
    }, 670);
  }, 2400);

  /* ── status (linha pequena sob a Orb / sob o painel) ── */
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
  // estado de repouso: com resposta na tela a Orb continua "respondendo"; sem resposta, standby
  const restState = () => (panelOpen && hasAnswer ? 'responding' : 'standby');

  function lock(on) { askInput.disabled = on; askSend.disabled = on; micBtn.disabled = on; }

  /* ── fala: ElevenLabs (via backend) quando disponível; senão — ou se falhar — a voz do navegador ──
     Um único <audio> reaproveitado e "destravado" no primeiro toque: sem isso o Safari/iOS e alguns Chromes
     bloqueiam o play() que acontece depois da espera de rede (NotAllowedError). */
  const ttsAudio = new Audio();
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    ttsAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const p = ttsAudio.play();
    if (p && p.catch) p.catch(() => { audioUnlocked = false; });
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));

  let speech = null;   // fala em andamento: { over, audio, url, end, done }
  function startSpeech(text, done) {
    stopSpeech(false);                                   // se já havia uma fala, para sem avisar
    const my = speech = { over: false, audio: null, url: null, done };
    my.end = () => {
      if (my.over) return;
      my.over = true;
      if (my.url) { URL.revokeObjectURL(my.url); my.url = null; }
      if (speech === my) speech = null;
      speaking = false;
      my.done();
    };
    speaking = true;
    const browserVoice = () => { if (!my.over) VOICE.speak(text, () => {}, my.end); };
    if (ttsOn === false) { browserVoice(); return; }     // só pula o ElevenLabs se o servidor disse que não tem voz
    API.speak(text).then(blob => {
      if (my.over) return;                               // foi cancelada enquanto o áudio chegava
      my.url = URL.createObjectURL(blob);
      my.audio = ttsAudio;
      ttsAudio.onended = my.end;
      ttsAudio.onerror = () => { console.warn('[ORION] Áudio do ElevenLabs não pôde ser tocado; usando a voz do navegador.'); my.audio = null; browserVoice(); };
      ttsAudio.src = my.url;
      const p = ttsAudio.play();
      if (p && p.catch) p.catch(e => { console.warn('[ORION] O navegador bloqueou o áudio:', e && e.name); my.audio = null; browserVoice(); });
    }).catch(err => {                                    // limite de créditos, chave inválida, sem rede...: plano B
      if (err && err.code === 'model_unavailable') ttsOn = false;   // 503: servidor sem voz configurada
      console.warn('[ORION] ElevenLabs falhou, usando a voz do navegador. Motivo:', err && (err.code || err.message), '— rode "Testar voz" em Configurações para ver o erro exato.');
      browserVoice();
    });
  }
  function stopSpeech(notify = true) {
    const my = speech;
    VOICE.stopSpeaking();
    if (!my) { speaking = false; return; }
    if (my.audio) { ttsAudio.onended = ttsAudio.onerror = null; try { ttsAudio.pause(); } catch (_) {} }
    if (notify) my.end();
    else { my.over = true; if (my.url) URL.revokeObjectURL(my.url); speech = null; speaking = false; }
  }

  /* ── painel de resposta: na hora de responder, a própria Orb cresce no lugar (o anel em volta some) ── */
  function openPanel() {
    if (panelOpen) return;
    panelOpen = true;
    orbEl.classList.add('panel'); orbZone.classList.add('panel-open'); document.body.classList.add('panel-on');
  }
  function closePanel() {
    clearTimeout(holdTimer);
    if (!panelOpen) return;
    panelOpen = false;
    stopSpeech(false);
    orbEl.classList.remove('panel'); orbZone.classList.remove('panel-open'); document.body.classList.remove('panel-on');
    if (curState === 'responding' || curState === 'error') setState('standby');   // a Orb nunca fica em "respondendo" sem resposta na tela
  }
  // o painel não fecha sozinho enquanto o ORION ainda está falando
  const scheduleHold = ms => { clearTimeout(holdTimer); holdTimer = setTimeout(() => (speaking ? scheduleHold(1500) : closePanel()), ms); };

  // aceita só links da Wikipédia e imagens da Wikimedia (Wikipédia ou Commons) vindos do servidor; até 3 imagens
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

  // tema para a busca na Wikipédia: tira o início da pergunta ("quem foi…", "o que é…") e a pontuação final
  function topicOf(q) {
    const t = String(q || '').trim().replace(/[?!.…\s]+$/, '')
      .replace(/^(quem\s+(foi|é|era|são)|o\s+que\s+(é|são|foi|significa)|qual\s+(é|foi|era)|quais\s+(são|foram)|quando\s+(foi|nasceu|morreu)|onde\s+(fica|é|nasceu)|como\s+(funciona|surgiu)|me\s+(fale|conte|explique)\s+(sobre|de|do|da))\s+/i, '')
      .replace(/^(o|a|os|as|um|uma)\s+/i, '').trim();
    return (t || String(q || '').trim()).slice(0, 200);
  }

  const updateScrolls = () => answerScroll.classList.toggle('scrolls', answerScroll.scrollHeight > answerScroll.clientHeight + 4);

  function clearAnswer() {
    respText.textContent = ''; answerSrc.hidden = true; answerScroll.classList.remove('scrolls');
    answerGallery.hidden = true; answerGallery.textContent = '';
    orbEl.classList.remove('answer-error'); hasAnswer = false;
  }

  // a resposta aparece palavra por palavra, dentro do painel, com a galeria e o link da Wikipédia quando houver; se for longa, rola
  function showAnswer(text, { error = false, sources = [], query = '' } = {}) {
    orbEl.classList.toggle('answer-error', error);
    respText.textContent = '';
    const words = text.split(/\s+/).filter(Boolean);
    const step = Math.min(18, 700 / Math.max(words.length, 1));
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    words.forEach((w, i) => {
      const sp = document.createElement('span');
      sp.className = 'w'; sp.textContent = w;
      if (!still) sp.style.animationDelay = Math.round(i * step) + 'ms';
      respText.appendChild(sp);
      respText.appendChild(document.createTextNode(' '));
    });
    // toda resposta tem um botão da Wikipédia: o artigo consultado, ou (se nenhum foi usado) uma busca pelo assunto
    const src = error ? null : pickSource(sources);
    const topic = topicOf(query);
    if (src && src.href) { answerSrc.href = src.href; answerSrc.title = src.title; answerSrc.textContent = 'Ler na Wikipédia ↗'; answerSrc.hidden = false; }
    else if (!error && topic) {
      answerSrc.href = 'https://pt.wikipedia.org/w/index.php?search=' + encodeURIComponent(topic);
      answerSrc.title = 'Pesquisar "' + topic + '" na Wikipédia';
      answerSrc.textContent = 'Pesquisar na Wikipédia ↗';
      answerSrc.hidden = false;
    } else answerSrc.hidden = true;

    // galeria: até 3 imagens; as que falharem ao carregar somem sozinhas
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
    hasAnswer = !error;   // mensagem de erro não conta como resposta (a Orb volta ao standby)
  }

  // o ORION respondeu "não entendi" (aviso padrão do backend)
  const isFallback = r => /^desculpe,?\s+n[ãa]o entendi[.…\s]*$/i.test(String(r).trim());

  const canSpeak = () => prefs.voice && (ttsOn !== false || !!window.speechSynthesis);

  /* ── erros: mensagem curta e clara; nada técnico; a Orb volta ao estado seguro ──
     Pergunta ESCRITA (chat): o erro aparece no painel. Voz: a Orb fica vermelha e a mensagem aparece abaixo dela. */
  function fail(err, stage, inPanel = false) {
    const handled = ERROR_HANDLER.handle(err, stage);   // só registra código/estágio no console
    sfx('error');
    if (inPanel) {
      setState('error', '');
      openPanel();
      showAnswer(handled.message, { error: true });
      scheduleHold(handled.code === 'quota_exceeded' ? 7000 : 3400);   // fecha sozinho; closePanel devolve a Orb ao standby
    } else {
      const gen = setState('error', handled.message);
      setTimeout(() => { if (stateGen === gen && curState === 'error') setState('standby'); }, 2600);
    }
  }

  /* ── ciclo principal: pergunta → "Processando…" abaixo da Orb → resposta ──
     Escrita no chat → a Orb vira o painel com a resposta.  Por voz → a Orb responde sozinha, com ondas na cor do estado. */
  async function submit(text, source) {
    text = (text || '').trim();
    if (!text || processing) return;
    processing = true; lock(true);
    stopSpeech(false);   // corta a fala da resposta anterior
    closePanel(); clearAnswer();   // a resposta anterior volta a ser Orb; a nova só aparece quando terminar
    askInput.value = text;         // mostra o que foi perguntado enquanto processa
    setState('processing');
    LOGGER.info('ask_started', { source, model: prefs.model });   // nunca registra o texto
    try {
      const data = await API.ask(text, prefs.model);
      const reply = data && typeof data.reply === 'string' ? data.reply.trim() : '';
      if (!reply) { const e = new Error('Resposta vazia.'); e.code = 'invalid_response'; throw e; }
      processing = false; lock(false);
      askInput.value = '';
      const understood = !(data.understood === false || isFallback(reply));
      if (source === 'voice') respondByVoice(reply, understood, data.sources, text);
      else respondInPanel(reply, understood, data.sources, text);
    } catch (err) {
      processing = false; lock(false);   // o texto fica no campo para tentar de novo
      fail(err, 'ask', source !== 'voice');
    }
    if (source === 'text' && chatOpen && finePointer()) askInput.focus();
  }

  // Voz: a Orb se mexe e solta ondas na cor do estado: verde = respondendo, vermelho = não entendeu
  function respondByVoice(reply, understood, sources, query) {
    const gen = setState(understood ? 'responding' : 'error', reply.length > 46 ? (understood ? 'Respondendo…' : 'Não entendi') : reply);
    sfx(understood ? 'answer' : 'error');
    if (!canSpeak()) {   // sem nenhuma voz disponível: mostra a resposta no painel para não se perder
      setState('standby');
      respondInPanel(reply, understood, sources || [], query || '');
      return;
    }
    if (!understood) orbZone.classList.add('speaking');   // o estado "erro" não solta ondas sozinho; aqui solta, em vermelho
    startSpeech(reply, () => { if (stateGen === gen) setState('standby'); });
  }

  // Chat (pergunta escrita): a Orb vira o painel e a resposta aparece dentro dele (e também é falada)
  function respondInPanel(reply, understood, sources, query) {
    setState(understood ? 'responding' : 'error', '');   // a cor do contorno acompanha: verde = respondeu, vermelho = não entendeu
    openPanel();
    showAnswer(reply, { sources, query, error: !understood });
    sfx(understood ? 'answer' : 'error');
    // tempo de leitura proporcional ao tamanho; não fecha enquanto você lê (mouse em cima) ou rola
    scheduleHold(Math.min(90000, Math.max(9000, 7000 + reply.split(/\s+/).length * 400)));
    // respostas escritas também são faladas (ElevenLabs, ou a voz do navegador como plano B)
    if (understood && canSpeak()) {
      startSpeech(reply, () => { if (panelOpen && curState === 'responding') scheduleHold(5000); });
    }
  }

  /* ── campo de pergunta (botão de chat): sobe da base da tela; a Orb diminui um pouco ── */
  function setChat(open) {
    chatOpen = open;
    document.body.classList.toggle('chat-open', open);
    askForm.classList.toggle('open', open);
    askForm.setAttribute('aria-hidden', String(!open));
    askInput.tabIndex = micBtn.tabIndex = askSend.tabIndex = open ? 0 : -1;
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

  // tocar fora do painel fecha (Orb/painel, campo de pergunta, botões e configurações não contam como "fora")
  document.addEventListener('pointerdown', e => {
    if (panelOpen && !e.target.closest('#orb, #askForm, #chatBtn, #gearBtn, #settingsPanel')) closePanel();
  });
  // enquanto você lê (mouse em cima, rolando ou tocando) o painel não fecha sozinho
  orbEl.addEventListener('pointerenter', () => { if (panelOpen) clearTimeout(holdTimer); });
  orbEl.addEventListener('pointerleave', () => { if (panelOpen && !speaking && curState === 'responding') scheduleHold(5000); });
  orbEl.addEventListener('touchstart', () => { if (panelOpen) clearTimeout(holdTimer); }, { passive: true });
  orbEl.addEventListener('touchend', () => { if (panelOpen && !speaking && curState === 'responding') scheduleHold(6000); }, { passive: true });

  /* ── voz (já existente): clicar na Orb fechada, no microfone do painel ou Espaço ── */
  try {
    VOICE.init({
      onResult: text => submit(text, 'voice'),
      onStateChange: (s, sttCode) => {
        if (s === 'listening') { setState('listening'); sfx('listen'); }
        else if (s === 'error') fail({ code: ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(sttCode) ? 'mic_unavailable' : 'stt_unavailable', message: sttCode }, 'voice');
        else if (curState === 'listening') setState(restState());
      },
    });
  } catch (err) { console.error('[ORION] VOICE.init falhou:', err); }

  function activate() {
    if (curState === 'listening') { VOICE.stopListening(); setState(restState()); return; }
    if (speaking) { stopSpeech(); return; }
    if (processing || curState === 'error') return;
    if (!prefs.voice) return fail({ code: 'voice_disabled' }, 'voice');
    if (!VOICE.isAvailable) return fail({ code: 'stt_unavailable' }, 'voice');
    ORB.pressEffect();
    sfx('activate');
    if (!VOICE.startListening()) fail({ code: 'mic_unavailable' }, 'voice');
  }
  // Orb fechada: clicar fala. Painel aberto: tocar nele fecha (link e texto selecionado não contam)
  orbZone.addEventListener('click', e => {
    if (panelOpen) {
      if (e.target.closest('a') || String(window.getSelection && window.getSelection())) return;
      closePanel();
      return;
    }
    activate();
  });
  orbZone.addEventListener('touchstart', e => { if (panelOpen) return; e.preventDefault(); activate(); }, { passive: false });
  micBtn.addEventListener('click', () => { closePanel(); activate(); });
  orbZone.addEventListener('mouseenter', () => { try { ORB.setHover(true); } catch (_) {} });
  orbZone.addEventListener('mouseleave', () => { try { ORB.setHover(false); } catch (_) {} });
  document.addEventListener('keydown', e => {
    const sp = document.getElementById('settingsPanel');
    const settingsOpen = !!(sp && sp.classList.contains('open'));
    if (e.key === 'Escape' && !settingsOpen) { if (panelOpen) closePanel(); else if (chatOpen) setChat(false); }
    else if (e.code === 'Space' && !e.target.matches('input,textarea,button,select')) { e.preventDefault(); activate(); }
    else if (e.key === '/' && !e.target.matches('input,textarea,select') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setChat(true); }
  });

  /* ── modelos (lista vem do backend; o site só guarda o id escolhido) ── */
  async function loadModels(retry = 0) {
    if (loading) return;
    if (!API.configured()) { online = false; settings.sync(); return; }
    loading = true; settings.sync();
    try {
      const d = await API.models();
      models = Array.isArray(d.models) ? d.models : [];
      if (!models.some(m => m.id === prefs.model)) { prefs.model = d.default || (models[0] && models[0].id) || null; savePrefs(); }
      ttsOn = !!d.tts;   // o servidor tem a voz do ElevenLabs configurada?
      online = true; coreErr = null;
    } catch (err) {
      online = false; coreErr = err.code || 'api_error';
      LOGGER.warn('models_unavailable', { code: coreErr });
      // servidor gratuito "acordando" ou reiniciando: tenta de novo sozinho (exceto se a conta não tem acesso)
      if (retry < 3 && coreErr !== 'forbidden') setTimeout(() => loadModels(retry + 1), 8000);
    }
    loading = false; settings.sync();
  }

  /* ── settings: painel (⚙ no canto inferior direito ou Ctrl+,) ── */
  const settings = (() => {
    let panel = null, open = false;
    const label = (key, on) => key === 'voice' ? (on ? 'Ativada' : 'Desativada') : (on ? 'Ativados' : 'Desativados');

    function coreLabel() {
      if (!API.configured()) return 'Backend não configurado';
      if (loading) return 'Conectando…';
      if (online) return models.length ? 'Conectado' : 'Sem chave de modelo no servidor';
      return ({ forbidden: 'E-mail sem acesso', timeout: 'Servidor demorou a responder',
                core_unavailable: 'Sem resposta do servidor', api_error: 'Erro no servidor' }[coreErr]) || 'Servidor indisponível';
    }

    function sync() {
      if (!panel) return;
      const user = window.ORION_USER;
      panel.querySelector('#setEmail').textContent = (user && (user.email || user.displayName)) || 'Não conectada';
      panel.querySelector('#setCore').textContent = coreLabel();
      panel.querySelector('#toggleVoice').textContent = label('voice', prefs.voice);
      panel.querySelector('#setTts').textContent = ttsOn === true ? 'ElevenLabs' : (ttsOn === false ? 'Navegador' : 'Verificando…');
      panel.querySelector('#toggleSound').textContent = label('sound', prefs.sound);
      const sel = panel.querySelector('#modelSelect');
      sel.textContent = '';
      if (!models.length) {
        const o = document.createElement('option'); o.textContent = loading ? 'Conectando…' : (online ? 'Sem modelo' : 'Indisponível'); sel.appendChild(o); sel.disabled = true;
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
          <div class="settings-row"><span>Fala</span><span class="settings-email" id="setTts">—</span></div>
          <div class="settings-row"><span>Testar voz</span><button id="testTts" class="settings-toggle">Testar</button></div>
          <p class="settings-hint" id="ttsTip" style="margin:4px 0 0;letter-spacing:.03em;text-transform:none;color:#fca5a5"></p>
          <div class="settings-row"><span>Sons</span><button id="toggleSound" class="settings-toggle"></button></div>
          <div class="settings-row"><span>Histórico</span><button id="clearChat" class="settings-toggle">Limpar</button></div>
          <div class="settings-row"><span>Núcleo</span><span class="settings-email" id="setCore">—</span></div>
          <button id="signOutBtn" class="settings-out">Sair da conta</button>
          <p class="settings-hint">ORION AI V4.2.5</p>
        </div>`;
      document.body.appendChild(panel);

      panel.addEventListener('click', e => { if (e.target === panel) toggle(); });
      panel.querySelector('#toggleVoice').addEventListener('click', () => {
        prefs.voice = !prefs.voice; savePrefs(); sync();
        if (!prefs.voice) { stopSpeech(); if (curState === 'listening') { VOICE.stopListening(); setState(restState()); } }
      });
      panel.querySelector('#toggleSound').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); sync(); });
      panel.querySelector('#modelSelect').addEventListener('change', e => {
        prefs.model = e.target.value; savePrefs();
        const m = models.find(x => x.id === prefs.model);
        if (m) flash('Modelo: ' + m.label, 2400);
      });
      // diagnóstico da voz do ElevenLabs: mostra no próprio botão o resultado e o motivo completo no console
      panel.querySelector('#testTts').addEventListener('click', async e => {
        const btn = e.target;
        btn.textContent = 'Testando…';
        let txt;
        try {
          const d = await API.speakDiag();
          console.log('[ORION] Diagnóstico da voz:', d);
          if (d.ok) txt = 'OK ✓';
          else if (d.motivo) txt = 'Sem chave/ID';
          else txt = 'Erro ' + (d.status || '?');
          if (!d.ok) console.warn('[ORION] Voz do ElevenLabs com problema:', d.motivo || d.detalhe);
          panel.querySelector('#ttsTip').textContent = d.ok ? '' : (d.dica || d.motivo || '');
        } catch (err) { txt = 'Falhou'; console.warn('[ORION] Não consegui rodar o diagnóstico da voz:', err && err.code); }
        btn.textContent = txt;
        setTimeout(() => { btn.textContent = 'Testar'; }, 5000);
      });
      panel.querySelector('#clearChat').addEventListener('click', async e => {
        const btn = e.target;
        closePanel(); clearAnswer();
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

  LOGGER.info('session_started', { sessionId: LOGGER.sessionId, apiConfigured: API.configured(), sttAvailable: VOICE.isAvailable });
  loadModels();   // já durante o boot: também acorda o servidor gratuito
  // o plano gratuito dorme após ~15 min sem uso (e acordar demora): enquanto a página está aberta e visível, avisa que ainda estamos aqui
  if (API.configured()) setInterval(() => {
    if (!document.hidden) { try { fetch(ORION_CONFIG.API_URL.replace(/\/$/, '') + '/health', { mode: 'no-cors' }).catch(() => {}); } catch (_) {} }
  }, 9 * 60 * 1000);
})();
