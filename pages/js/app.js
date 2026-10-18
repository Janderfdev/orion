/* ═══════════════════════════════════════════════════════════════
   ORION AI V4.5.0 — Interaction Layer  (pages/js/app.js)

   Frontend = interação, eventos, estados visuais e comunicação com a API.
   Backend  = autenticação, contexto, orquestração, modelos, ferramentas, segurança.
   O app.js NÃO substitui o ORION Core.

   V4.5.0: interface em inglês (I18N en/pt), tela Voice & Speech, Orb com anéis ondulados e áudio reativo,
           4 vozes + Pace/Expressivity, "Hey ORION".
   ═══════════════════════════════════════════════════════════════ */

/* Endereço do backend (Render). Se um dia mudar, troque aqui (sem barra no final). */
const ORION_CONFIG = { API_URL: 'https://orion-backend-9qk5.onrender.com' };

/* ═══ i18n.js — textos da interface (en = padrão · pt = opção) ═══
   O idioma da INTERFACE é separado do idioma da CONVERSA (voz): ver prefs.ui e prefs.lang.
   Marcas (ORION AI, ORION Core, ORION Voice) nunca são traduzidas. */
const I18N = (() => {
  const D = {
    en: {
      'boot.init': 'initializing', 'boot.core': 'connecting to core', 'boot.online': 'systems online',
      'online': 'ORION ONLINE', 'version': 'VERSION V4.5.0',
      'status.listening': 'Listening…', 'status.processing': 'Processing…', 'status.responding': 'Responding…', 'status.unheard': 'Didn’t catch that',
      'hint.base': 'tap the orb to speak · or use the chat button',
      'hint.wake': 'say “hey orion” · tap the orb · or use the chat button',
      'ask.ph': 'Ask or give ORION a command', 'ask.aria': 'Question for ORION',
      'mic.aria': 'Speak', 'send.aria': 'Send', 'chat.aria': 'Ask ORION', 'gear.aria': 'Settings',
      'err.mic_unavailable': 'Microphone unavailable.', 'err.stt_unavailable': 'Speech recognition isn’t available in this browser.',
      'err.model_unavailable': 'I couldn’t reach the model.', 'err.timeout': 'The response took too long.',
      'err.api_error': 'Couldn’t reach the service.', 'err.invalid_response': 'I received an invalid response.',
      'err.tool_unavailable': 'That tool isn’t available yet.', 'err.offline': 'No internet connection.',
      'err.tts_unavailable': 'I can’t speak the answer right now.', 'err.unexpected_input': 'I didn’t understand that.',
      'err.forbidden': 'This account doesn’t have access to ORION.', 'err.rate_limited': 'Too many requests. Please wait a moment.',
      'err.quota_exceeded': 'You’ve reached your question limit. Upgrade to keep using the AI soon.',
      'err.core_unavailable': 'I couldn’t reach the ORION core.', 'err.voice_disabled': 'Voice is turned off in settings.',
      'err.voice_unavailable': 'That voice isn’t available.', 'err.unknown': 'I couldn’t process that.',
      'wiki.read': 'Read on Wikipedia ↗', 'wiki.search': 'Search Wikipedia ↗', 'wiki.title': 'Search “{q}” on Wikipedia',
      'set.title': 'Settings', 'set.account': 'Account', 'set.model': 'Model', 'set.voice': 'Voice & Speech', 'set.open': 'Open',
      'set.sound': 'Sounds', 'set.calm': 'Reduce motion', 'set.ui': 'Language', 'set.wake': 'Hey ORION', 'set.history': 'History', 'set.clear': 'Clear',
      'set.cleared': 'Cleared', 'set.failed': 'Failed', 'set.core': 'Core', 'set.signout': 'Sign out', 'set.none': 'Not signed in',
      'on': 'On', 'off': 'Off', 'set.nomodel': 'No model', 'set.unavail': 'Unavailable', 'toast.model': 'Model: {m}',
      'core.none': 'Backend not configured', 'core.connecting': 'Connecting…', 'core.ok': 'Connected', 'core.nomodel': 'No model key on the server',
      'core.forbidden': 'E-mail without access', 'core.timeout': 'Server took too long', 'core.unreach': 'Server not responding',
      'core.err': 'Server error', 'core.down': 'Server unavailable',
      'lang.en': 'English (US)', 'lang.pt': 'Português (Brasil)',
      'vs.title': 'Voice & Speech', 'vs.back': 'Back to settings', 'vs.voice': 'Voice', 'vs.language': 'Language', 'vs.pace': 'Pace',
      'vs.expr': 'Expressivity', 'vs.slow': 'Slower', 'vs.fast': 'Faster', 'vs.calm': 'Calm', 'vs.expressive': 'Expressive',
      'vs.preview': 'Preview voice', 'vs.loading': 'Loading…', 'vs.stop': 'Stop', 'vs.orbAria': 'Preview voice',
      'vs.speak': 'Speak replies', 'vs.wake': 'Wake word — “Hey ORION”',
      'vs.wakeInfo': 'Off by default. It listens only while this tab is open and visible. While it’s on, your browser’s speech recognition runs (in Chrome, audio is sent to Google’s speech service). ORION doesn’t store audio or transcripts.',
      'vs.mic': 'Microphone on', 'vs.eleven': 'ElevenLabs', 'vs.browser': 'Browser voice', 'vs.checking': 'Checking…',
      'vs.test': 'Test voice', 'vs.run': 'Run', 'vs.testing': 'Testing…', 'vs.testOk': 'OK ✓', 'vs.testNoKey': 'No key/ID', 'vs.testErr': 'Error {n}', 'vs.testFail': 'Failed',
      'vs.noVoices': 'Server voices aren’t available — the browser voice is used instead.',
      'vs.exprNote': 'Expressivity only applies to ElevenLabs voices.',
      'vs.previewFail': 'Preview failed. Check your connection or try another voice.', 'vs.limit': 'Daily voice limit reached.',
      'pv.quota': 'ElevenLabs credits ran out.', 'pv.plan': 'This voice needs a paid ElevenLabs plan.',
      'pv.voice': 'Voice {n} doesn’t exist in the ElevenLabs account (check its ID).', 'pv.key': 'The ElevenLabs API key was rejected.',
      'pv.unusual': 'ElevenLabs blocked the free plan from this server.', 'pv.busy': 'ElevenLabs is limiting usage right now. Try again in a moment.',
      'pv.eleven': 'ElevenLabs refused the request (error {s}).', 'pv.timeout': 'The server took too long (it may be waking up). Try again.',
      'pv.core': 'No response from the server.', 'pv.audio': 'The browser couldn’t play the audio.', 'pv.off': 'The server voice is turned off.',
      'vs.slotOff': 'Voice {n} isn’t configured on the server.', 'vs.apply': 'Changes apply to the next spoken reply.',
      'vs.unavailWake': 'Unavailable', 'vs.wakeMic': 'No microphone', 'vs.wakeNeed': 'Turn on Speak replies',
      'wake.say': 'Say “Hey ORION” to talk', 'wake.mic': 'Microphone blocked: wake word turned off', 'wake.unstable': 'Wake word unstable: turned off',
    },
    pt: {
      'boot.init': 'inicializando', 'boot.core': 'conectando ao núcleo', 'boot.online': 'sistemas online',
      'online': 'ORION ONLINE', 'version': 'VERSÃO V4.5.0',
      'status.listening': 'Ouvindo…', 'status.processing': 'Processando…', 'status.responding': 'Respondendo…', 'status.unheard': 'Não entendi',
      'hint.base': 'toque na orb para falar · ou use o botão de chat',
      'hint.wake': 'diga “hey orion” · toque na orb · ou use o botão de chat',
      'ask.ph': 'Pergunte ou dê um comando ao ORION', 'ask.aria': 'Pergunta ao ORION',
      'mic.aria': 'Falar', 'send.aria': 'Enviar', 'chat.aria': 'Perguntar ao ORION', 'gear.aria': 'Configurações',
      'err.mic_unavailable': 'Microfone indisponível.', 'err.stt_unavailable': 'Reconhecimento de voz indisponível neste navegador.',
      'err.model_unavailable': 'Não consegui acessar o modelo.', 'err.timeout': 'A resposta demorou demais.',
      'err.api_error': 'Falha ao comunicar com o serviço.', 'err.invalid_response': 'Recebi uma resposta inválida.',
      'err.tool_unavailable': 'Essa ferramenta ainda não está disponível.', 'err.offline': 'Sem conexão com a internet.',
      'err.tts_unavailable': 'Não consigo falar a resposta agora.', 'err.unexpected_input': 'Não entendi o que foi dito.',
      'err.forbidden': 'Esta conta não tem acesso ao ORION.', 'err.rate_limited': 'Muitas solicitações. Aguarde um instante.',
      'err.quota_exceeded': 'Você atingiu o limite de perguntas. Faça upgrade para continuar usando a IA em breve.',
      'err.core_unavailable': 'Não consegui falar com o núcleo do ORION.', 'err.voice_disabled': 'Voz desativada nas configurações.',
      'err.voice_unavailable': 'Essa voz não está disponível.', 'err.unknown': 'Não consegui processar.',
      'wiki.read': 'Ler na Wikipédia ↗', 'wiki.search': 'Pesquisar na Wikipédia ↗', 'wiki.title': 'Pesquisar “{q}” na Wikipédia',
      'set.title': 'Configurações', 'set.account': 'Conta', 'set.model': 'Modelo', 'set.voice': 'Voice & Speech', 'set.open': 'Abrir',
      'set.sound': 'Sons', 'set.calm': 'Reduzir movimento', 'set.ui': 'Idioma', 'set.wake': 'Hey ORION', 'set.history': 'Histórico', 'set.clear': 'Limpar',
      'set.cleared': 'Limpo', 'set.failed': 'Falhou', 'set.core': 'Núcleo', 'set.signout': 'Sair da conta', 'set.none': 'Não conectada',
      'on': 'Ativado', 'off': 'Desativado', 'set.nomodel': 'Sem modelo', 'set.unavail': 'Indisponível', 'toast.model': 'Modelo: {m}',
      'core.none': 'Backend não configurado', 'core.connecting': 'Conectando…', 'core.ok': 'Conectado', 'core.nomodel': 'Sem chave de modelo no servidor',
      'core.forbidden': 'E-mail sem acesso', 'core.timeout': 'Servidor demorou a responder', 'core.unreach': 'Sem resposta do servidor',
      'core.err': 'Erro no servidor', 'core.down': 'Servidor indisponível',
      'lang.en': 'English (US)', 'lang.pt': 'Português (Brasil)',
      'vs.title': 'Voice & Speech', 'vs.back': 'Voltar às configurações', 'vs.voice': 'Voz', 'vs.language': 'Idioma', 'vs.pace': 'Ritmo',
      'vs.expr': 'Expressividade', 'vs.slow': 'Mais lenta', 'vs.fast': 'Mais rápida', 'vs.calm': 'Calma', 'vs.expressive': 'Expressiva',
      'vs.preview': 'Ouvir prévia', 'vs.loading': 'Carregando…', 'vs.stop': 'Parar', 'vs.orbAria': 'Ouvir prévia da voz',
      'vs.speak': 'Falar as respostas', 'vs.wake': 'Palavra de ativação — “Hey ORION”',
      'vs.wakeInfo': 'Desativada por padrão. Só escuta com esta aba aberta e visível. Enquanto estiver ligada, o reconhecimento de fala do navegador funciona (no Chrome, o áudio vai para o serviço de fala do Google). O ORION não guarda áudio nem transcrições.',
      'vs.mic': 'Microfone ligado', 'vs.eleven': 'ElevenLabs', 'vs.browser': 'Voz do navegador', 'vs.checking': 'Verificando…',
      'vs.test': 'Testar voz', 'vs.run': 'Executar', 'vs.testing': 'Testando…', 'vs.testOk': 'OK ✓', 'vs.testNoKey': 'Sem chave/ID', 'vs.testErr': 'Erro {n}', 'vs.testFail': 'Falhou',
      'vs.noVoices': 'As vozes do servidor não estão disponíveis — usando a voz do navegador.',
      'vs.exprNote': 'A expressividade só vale para as vozes da ElevenLabs.',
      'vs.previewFail': 'A prévia falhou. Verifique a conexão ou tente outra voz.', 'vs.limit': 'Limite diário de voz atingido.',
      'pv.quota': 'Os créditos da ElevenLabs acabaram.', 'pv.plan': 'Essa voz exige plano pago da ElevenLabs.',
      'pv.voice': 'A voz {n} não existe na conta da ElevenLabs (confira o ID).', 'pv.key': 'A chave da ElevenLabs foi recusada.',
      'pv.unusual': 'A ElevenLabs bloqueou o plano gratuito neste servidor.', 'pv.busy': 'A ElevenLabs está limitando o uso agora. Tente em instantes.',
      'pv.eleven': 'A ElevenLabs recusou o pedido (erro {s}).', 'pv.timeout': 'O servidor demorou demais (pode estar acordando). Tente de novo.',
      'pv.core': 'Sem resposta do servidor.', 'pv.audio': 'O navegador não conseguiu tocar o áudio.', 'pv.off': 'A voz do servidor está desligada.',
      'vs.slotOff': 'A Voz {n} não está configurada no servidor.', 'vs.apply': 'As mudanças valem para a próxima resposta falada.',
      'vs.unavailWake': 'Indisponível', 'vs.wakeMic': 'Sem microfone', 'vs.wakeNeed': 'Ative Falar as respostas',
      'wake.say': 'Diga “Hey ORION” para falar', 'wake.mic': 'Microfone bloqueado: “Hey ORION” desligado', 'wake.unstable': '“Hey ORION” instável: desligado',
    },
  };
  let cur = 'pt';
  const t = (k, v) => {
    let s = (D[cur] && D[cur][k]) || D.en[k] || k;
    if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]);
    return s;
  };
  function apply() {
    document.documentElement.lang = cur === 'pt' ? 'pt-BR' : 'en-US';
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { const s = t(el.dataset.i18nAria); el.setAttribute('aria-label', s); if (el.tagName === 'BUTTON') el.title = s; });
  }
  return { t, apply, get: () => cur, set: l => { cur = l === 'pt' ? 'pt' : 'en'; } };
})();
const t = I18N.t;

/* ═══ visual-state.js — máquina de estados visuais da Orb ═══
   STANDBY (roxo) → LISTENING (azul) → PROCESSING (roxo) → SPEAKING (verde + pulsação do áudio) → STANDBY ; (qualquer) → ERROR (vermelho) */
const VISUAL_STATE = (() => {
  const PURPLE = { a: '#5b21b6', b: '#2e1065', c: '#8b5cf6' };
  const CFG = {
    standby:    { amp: 1.00, rot: 1.00, bright: 0.82, cls: '',             color: PURPLE },                                         // roxo
    listening:  { amp: 1.18, rot: 1.50, bright: 0.95, cls: 'st-listening', color: { a: '#1e40af', b: '#172554', c: '#3b82f6' } },   // azul
    processing: { amp: 1.12, rot: 1.80, bright: 0.88, cls: 'st-thinking',  color: PURPLE },                                         // roxo, mais atividade
    speaking:   { amp: 1.24, rot: 1.65, bright: 1.00, cls: 'st-speaking',  color: { a: '#166534', b: '#052e16', c: '#22c55e' } },   // verde (pulsa com o áudio)
    error:      { amp: 0.82, rot: 0.50, bright: 0.60, cls: 'st-error',     color: { a: '#991b1b', b: '#450a0a', c: '#ef4444' } },   // vermelho
  };
  const ALIAS = { idle: 'standby', standby: 'standby', listening: 'listening', processing: 'processing', thinking: 'processing',
                  speaking: 'speaking', responding: 'speaking', error: 'error' };
  let current = 'standby';
  const apply = name => { current = ALIAS[name] || 'standby'; return CFG[current]; };
  return { apply, get: () => current, config: name => CFG[ALIAS[name] || current] };
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
    'voice_unavailable', 'unknown'];
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
   áudio: nesse caso a pulsação é SIMULADA (e só enquanto a fala acontece). */
const AUDIO = (() => {
  const el = new Audio();            // único <audio> da fala (reaproveitado)
  let ctx = null, an = null, buf = null, ok = false, sim = false;
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
  function level() {
    const playing = !el.paused && !el.ended && el.currentTime > 0;
    if (sim) return wave();
    if (!playing) return 0;
    if (!ok || !an) return wave();   // sem analisador: pulsação simulada, só durante a reprodução real
    an.getByteTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    return Math.min(1, Math.sqrt(s / buf.length) * 4);
  }
  return { el, ensure, level, setSim: v => { sim = !!v; } };
})();

/* ═══ orb.js — motor visual: blobs de luz na Orb + anéis ondulados e partículas ao redor ═══
   Cor interpolada quadro a quadro; brilho e anéis reagem ao nível real do áudio durante a fala. */
const ORB = (() => {
  const $ = id => document.getElementById(id);
  const canvas = $('orbCanvas'), ctx = canvas.getContext('2d');
  const orbEl = $('orb'), haloEl = $('halo');
  const root = document.documentElement;
  let vs = null;   // elementos da Orb da tela Voice & Speech (réplica da Orb principal)
  const orbZone = $('orbZone');

  let amp = 1, targetAmp = 1, rotSpeed = 1, targetRot = 1, bright = 0.82, targetBright = 0.82;
  let hovered = false, calm = false, flow = 0, lastTs = 0, lvl = 0;
  let breathPeriod = 6, breathT = 0, floatT = 0, press = 0, orbS = 1, orbY = 0, haloAng = 0, haloV = 360 / 28, fastHalo = false;

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

  const VOICE_PALETTE = {   // cor da Orb da tela Voice & Speech conforme a voz escolhida (a Orb principal NÃO usa isto)
    1: { a: '#5b21b6', b: '#2e1065', c: '#8b5cf6' },   // roxo
    2: { a: '#1e40af', b: '#172554', c: '#3b82f6' },   // azul
    3: { a: '#166534', b: '#052e16', c: '#22c55e' },   // verde
    4: { a: '#991b1b', b: '#450a0a', c: '#ef4444' },   // vermelho
  };
  let vsColor = triple(VOICE_PALETTE[1]), vsTarget = triple(VOICE_PALETTE[1]);
  let rings = [], vsRings = [], lastSpawn = 0, prevTarget = 0, clock = 0;
  let colorNow = triple(VISUAL_STATE.config('standby').color);
  let colorTarget = triple(VISUAL_STATE.config('standby').color);

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
  // aplica o estado atual às duas Orbs (principal e a da tela Voice & Speech): classe, halo rápido e anéis de energia
  function decorate() {
    const cur = VISUAL_STATE.get(), cls = VISUAL_STATE.config(cur).cls;
    fastHalo = ['listening', 'speaking', 'processing'].includes(cur);
    breathPeriod = ({ listening: 3.4, processing: 2.2, speaking: 2.6 })[cur] || 6;   // standby: respira devagar, como sempre
    [[orbEl, haloEl, orbZone], vs && [vs.orb, vs.halo, vs.zone]].forEach(set => {
      if (!set) return;
      const [o, h, z] = set;
      o.classList.remove(...STATE_CLASSES);
      if (cls) o.classList.add(cls);
      h.classList.toggle('fast', fastHalo);
      z.classList.toggle('speaking', cur === 'speaking');   // anéis de energia só enquanto o ORION fala
    });
  }
  function setState(name) {
    const cfg = VISUAL_STATE.apply(name);
    targetAmp = cfg.amp; targetRot = cfg.rot; targetBright = cfg.bright;
    colorTarget = triple(cfg.color);
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
    bg.addColorStop(1, 'rgba(0,0,3,0.96)');
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
    vig.addColorStop(0, 'rgba(0,0,4,0)');
    vig.addColorStop(1, 'rgba(0,0,4,0.80)');
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
    const kc = k(2.8);
    colorNow.a = lerpRgb(colorNow.a, colorTarget.a, kc);
    colorNow.b = lerpRgb(colorNow.b, colorTarget.b, kc);
    colorNow.c = lerpRgb(colorNow.c, colorTarget.c, kc);
    root.style.setProperty('--core-a', rgbToHex(colorNow.a));
    root.style.setProperty('--core-b', rgbToHex(colorNow.b));
    root.style.setProperty('--core-c', rgbToHex(colorNow.c));

    breathT += dt * Math.PI * 2 / breathPeriod;
    floatT += dt * Math.PI * 2 / 10;
    press -= press * k(7);

    const target = calm ? 0 : AUDIO.level();                              // nível real (ou simulado) do áudio
    lvl += (target - lvl) * k(target > lvl ? 18 : 9);
    flow += dt * rotSpeed * (hovered ? 1.12 : 1) * (calm ? 0.15 : 1);
    const b = bright * (hovered ? 1.06 : 1) * (1 + 0.4 * lvl);

    // movimento da própria Orb (respiração, flutuação, pulso do áudio, toque) — igual ao de sempre, mas contínuo entre estados
    const live = calm ? 0 : 1, inPanel = orbEl.classList.contains('panel');
    const sT = inPanel ? 1 : 1 + live * (0.035 * (0.5 - 0.5 * Math.cos(breathT)) + 0.09 * lvl + 0.08 * press);
    const yT = inPanel ? 0 : -14 * live * (0.5 - 0.5 * Math.cos(floatT));
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
    const haloT = calm ? 0 : (fastHalo ? 360 / 14 : (hovered ? 360 / 20 : 360 / 28));   // halo: 28 s em repouso, 14 s em atividade
    haloV += (haloT - haloV) * k(2);
    haloAng = (haloAng + dt * haloV) % 360;
    const rot = 'translateY(' + orbY.toFixed(2) + 'px) rotate(' + haloAng.toFixed(2) + 'deg)';   // o arco sobe e desce junto com a Orb
    haloEl.style.transform = rot;

    if (vs) {                                             // tela Voice & Speech aberta: só a Orb dela é desenhada
      vs.halo.style.transform = rot;
      vsColor.a = lerpRgb(vsColor.a, vsTarget.a, kc); vsColor.b = lerpRgb(vsColor.b, vsTarget.b, kc); vsColor.c = lerpRgb(vsColor.c, vsTarget.c, kc);
      vs.zone.style.setProperty('--vs-a', rgbToHex(vsColor.a));
      vs.zone.style.setProperty('--vs-b', rgbToHex(vsColor.b));
      vs.zone.style.setProperty('--vs-c', rgbToHex(vsColor.c));
      const D = fitSquare(vs.disc), d = dprOf();
      if (D) { vs.ctx.setTransform(d, 0, 0, d, 0, 0); drawDisc(vs.ctx, D, b, vsColor); }
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
    setVoiceScreen: els => { vs = els ? { zone: els.zone, orb: els.orb, halo: els.halo, disc: els.disc, ctx: els.disc.getContext('2d') } : null; vsRings = vs ? makeRings(vs.zone) : []; if (vs) decorate(); },
    setVoiceColor: (slot, snap) => { vsTarget = triple(VOICE_PALETTE[slot] || VOICE_PALETTE[1]); if (snap) vsColor = triple(VOICE_PALETTE[slot] || VOICE_PALETTE[1]); },
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
   O idioma do reconhecimento/da voz de reserva é o da CONVERSA (prefs.lang), não o da interface. */
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
    // 'aborted' acontece quando o usuário para a escuta: não é erro
    rec.onerror = e => { isRec = false; onSt(e.error === 'no-speech' || e.error === 'aborted' ? 'standby' : 'error', e.error); };
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
    u.rate = 1.08 * pace; u.pitch = 0.55; u.volume = 1.0;   // Pace também vale para a voz do navegador
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
   Só funciona com a página aberta e visível. Fica desligado até a pessoa ativar em Voice & Speech.
   A detecção é do próprio navegador (Web Speech API) — não tem relação com a ElevenLabs. */
const WAKE = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // normaliza SEM mudar o tamanho do texto: assim a posição achada vale no texto original
  const flat = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
  // "hey orion", "hi orion", "olá orion", "oi orion", "ei orion", "e aí orion" (e variações que o reconhecedor costuma escrever)
  const RE = /\b(?:hey|hei|hay|hi|ola|oi|ei|e ai)\s+(?:o\s+)?(?:horion|orion|oriom|orian|oryon|oreon|orio)\b/;
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
    let tts = null;   // motivo da falha da voz vindo do servidor ("tts:<status>:<palavra-chave>")
    if (!res.ok && path.startsWith('/speak')) {
      try { const j = await res.clone().json(); const mm = /^tts:(\d+):([a-z_]*)$/.exec(j && j.detail); if (mm) tts = { status: +mm[1], kw: mm[2] }; } catch (_) {}
    }
    const failT = (msg, code) => { const e = fail(msg, code); if (tts) e.tts = tts; return e; };
    if (res.status === 401) { if (window.ORION_SIGNOUT) window.ORION_SIGNOUT(); throw fail('Session expired.', 'api_error'); }
    if (res.status === 403) throw failT('No access.', 'forbidden');
    if (res.status === 429) throw failT('Rate limited.', 'rate_limited');
    if (res.status === 402) throw failT('Daily limit.', 'quota_exceeded');   // cota do plano esgotada
    if (res.status === 400 && path.startsWith('/speak')) throw failT('Voice unavailable.', 'voice_unavailable');   // slot sem ID no servidor
    if (res.status === 503 || res.status === 400) throw failT('Model unavailable.', 'model_unavailable');
    if (!res.ok) throw failT('Failure ' + res.status, 'api_error');
    try { return blob ? await res.blob() : await res.json(); } catch (_) { throw fail('Unreadable response.', 'invalid_response'); }
  }
  return {
    configured: () => !!base(),
    models: () => call('/models', { timeoutMs: 60000 }),   // 60 s: o servidor gratuito pode estar "dormindo"
    ask: (text, model) => call('/ask', { method: 'POST', body: { text, model } }),
    clearMemory: () => call('/memory/clear', { method: 'POST' }),
    speak: (text, o) => call('/speak', { method: 'POST', body: { text, voice: o.voice, pace: o.pace, expressivity: o.expressivity }, timeoutMs: 20000, blob: true }),
    preview: o => call('/speak/preview', { method: 'POST', body: { voice: o.voice, pace: o.pace, expressivity: o.expressivity, lang: o.lang }, timeoutMs: 20000, blob: true }),
    speakDiag: slot => call('/speak/diag?voice=' + encodeURIComponent(slot || 1), { timeoutMs: 30000 }),
  };
})();

/* ═══ interação — V4.5.0 ═══
   Fluxo: botão de chat (ou voz) → a própria Orb cresce e vira o painel → API → ORION Core → resposta DENTRO do painel.
   Estados da Orb: standby (roxo) · listening (verde) · processing (azul) · speaking (roxo + áudio) · error (vermelho). */
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
    ui: 'pt',               // idioma ÚNICO (interface + reconhecimento de fala + prévia): 'pt' (padrão) ou 'en'
    slot: 1, pace: 1, expr: 0.5,
  }, stored);
  if (stored.v !== 2 && stored.v !== 3) prefs.ui = 'pt';   // preferências da beta antiga: volta ao português
  if (stored.v !== 3) prefs.wake = true;                    // V4.5.0: "Hey ORION" ligado por padrão (depois disso vale a escolha da pessoa)
  prefs.v = 3;
  delete prefs.lang;
  prefs.ui = prefs.ui === 'en' ? 'en' : 'pt';
  prefs.voice = true;                       // as respostas sempre são faladas (a opção saiu das configurações)
  delete prefs.calm;
  prefs.slot = [1, 2, 3, 4].includes(prefs.slot) ? prefs.slot : 1;
  prefs.pace = clamp(Number.isFinite(+prefs.pace) ? +prefs.pace : 1, 0.8, 1.2);
  prefs.expr = clamp(Number.isFinite(+prefs.expr) ? +prefs.expr : 0.5, 0, 1);
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} };
  savePrefs();

  I18N.set(prefs.ui); I18N.apply();
  try { ORB.init(); } catch (err) { console.error('[ORION] ORB.init failed:', err); }

  const bootEl = $('boot'), bootStatus = $('bootStatus'), appEl = $('app'), orbZone = $('orbZone'), orbEl = $('orb');
  const statusText = $('statusText'), hintEl = $('hintText');
  const respText = $('responseText'), answerScroll = $('answerScroll'), answerSrc = $('answerSource'), answerGallery = $('answerGallery');
  const askForm = $('askForm'), askInput = $('askInput'), askSend = $('askSend'), micBtn = $('micBtn');
  const chatBtn = $('chatBtn'), siri = $('siri');

  let curState = 'standby', stateGen = 0, processing = false;
  let panelOpen = false, chatOpen = false, hasAnswer = false, speaking = false, holdTimer = null, flashTimer = null;
  let wakeFault = null, wakeBlockUntil = 0;
  // ttsOn: null = ainda não sei (servidor acordando) · true = ElevenLabs ligado · false = servidor sem voz
  let models = [], voices = [], online = false, loading = false, coreErr = null, ttsOn = null;

  const sfx = name => { if (prefs.sound) { try { SOUND[name](); } catch (_) {} } };
  const finePointer = () => matchMedia('(pointer: fine)').matches;

  /* ── movimento reduzido: sistema operacional OU opção "Reduce motion" ── */
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => mq.matches;   // só o sistema operacional (prefers-reduced-motion)
  function applyCalm() { document.body.classList.toggle('calm', calm()); ORB.setCalm(calm()); }
  if (mq.addEventListener) mq.addEventListener('change', applyCalm);
  applyCalm();

  /* ── idioma da conversa: reconhecimento de fala (e voz de reserva) ── */
  const speechLang = () => (prefs.ui === 'pt' ? 'pt' : 'en');
  function applyLang() { const l = prefs.ui === 'pt' ? 'pt-BR' : 'en-US'; VOICE.setLang(l); WAKE.setLang(l); }
  const voiceOpts = () => ({ voice: prefs.slot, pace: prefs.pace, expressivity: prefs.expr });
  const previewOpts = () => Object.assign(voiceOpts(), { lang: speechLang() });

  /* ── boot ── */
  ['boot.init', 'boot.core', 'boot.online'].forEach((key, i) => {
    if (i === 0) return;
    setTimeout(() => {
      bootStatus.style.opacity = '0';
      setTimeout(() => { bootStatus.textContent = t(key); bootStatus.style.opacity = '1'; }, 170);
    }, i * 730);
  });
  setTimeout(() => {
    bootEl.classList.add('out');
    try { SOUND.init(); } catch (err) { console.error('[ORION] SOUND.init failed:', err); }
    setTimeout(() => { bootEl.style.display = 'none'; appEl.classList.add('on'); flash(t('online'), 3200); }, 670);
  }, 2400);

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
    const STATUS = { listening: t('status.listening'), processing: t('status.processing') };
    const m = msg !== undefined ? msg : (STATUS[name] || '');
    clearTimeout(flashTimer);
    if (m) { statusText.textContent = m; requestAnimationFrame(() => statusText.classList.add('show')); }
    else statusText.classList.remove('show');
    return stateGen;
  }
  function lock(on) { askInput.disabled = on; askSend.disabled = on; micBtn.disabled = on; }

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
    const started = () => { if (my.over || my.started) return; my.started = true; if (o.onStart) o.onStart(); };
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
      console.warn('[ORION] ElevenLabs failed. Reason:', err && (err.code || err.message), '— run "Test voice" in Voice & Speech for the exact error.');
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
    orbEl.classList.add('panel'); orbZone.classList.add('panel-open'); document.body.classList.add('panel-on');
  }
  function closePanel() {
    clearTimeout(holdTimer);
    if (!panelOpen) return;
    panelOpen = false;
    stopSpeech(false);
    orbEl.classList.remove('panel'); orbZone.classList.remove('panel-open'); document.body.classList.remove('panel-on');
    if (curState === 'speaking' || curState === 'error') setState('standby');
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
      .replace(/^(who\s+(is|was|were|are)|what\s+(is|are|was|were|does)|when\s+(was|did|is)|where\s+(is|was|are)|how\s+(does|did|do)|tell\s+me\s+about|explain|quem\s+(foi|é|era|são)|o\s+que\s+(é|são|foi|significa)|qual\s+(é|foi|era)|quais\s+(são|foram)|quando\s+(foi|nasceu|morreu)|onde\s+(fica|é|nasceu)|como\s+(funciona|surgiu)|me\s+(fale|conte|explique)\s+(sobre|de|do|da))\s+/i, '')
      .replace(/^(the|an?|o|a|os|as|um|uma)\s+/i, '').trim();
    return (t0 || String(q || '').trim()).slice(0, 200);
  }

  const updateScrolls = () => answerScroll.classList.toggle('scrolls', answerScroll.scrollHeight > answerScroll.clientHeight + 4);
  function clearAnswer() {
    respText.textContent = ''; answerSrc.hidden = true; answerScroll.classList.remove('scrolls');
    answerGallery.hidden = true; answerGallery.textContent = '';
    orbEl.classList.remove('answer-error'); hasAnswer = false;
  }

  // a resposta aparece palavra por palavra dentro do painel, com a galeria e o link da Wikipédia quando houver
  function showAnswer(text, { error = false, sources = [], query = '' } = {}) {
    orbEl.classList.toggle('answer-error', error);
    respText.textContent = '';
    const words = text.split(/\s+/).filter(Boolean);
    const step = Math.min(18, 700 / Math.max(words.length, 1));
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
      answerSrc.href = 'https://' + speechLang() + '.wikipedia.org/w/index.php?search=' + encodeURIComponent(topic);
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

  /* ── ciclo principal: pergunta → Processing (azul) → resposta ──
     Escrita no chat → a Orb vira o painel.  Por voz → a Orb responde sozinha (roxo pulsando com o áudio). */
  async function submit(text, source) {
    text = (text || '').trim();
    if (!text || processing) return;
    processing = true; lock(true);
    stopSpeech(false);
    closePanel(); clearAnswer();
    askInput.value = text;
    setState('processing');
    LOGGER.info('ask_started', { source, model: prefs.model });   // nunca registra o texto
    try {
      const data = await API.ask(text, prefs.model);
      const reply = data && typeof data.reply === 'string' ? data.reply.trim() : '';
      if (!reply) { const e = new Error('Empty response.'); e.code = 'invalid_response'; throw e; }
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

  // Voz: a Orb continua azul até o áudio realmente começar; aí fica roxa e pulsa com o volume
  function respondByVoice(reply, understood, sources, query) {
    sfx(understood ? 'answer' : 'error');
    if (!canSpeak()) { setState('standby'); respondInPanel(reply, understood, sources || [], query || ''); return; }
    const short = reply.length <= 46;
    const toRest = () => { if (curState === 'speaking' || curState === 'processing') setState('standby'); };
    if (!understood) {
      const gen = setState('error', short ? reply : t('status.unheard'));
      startSpeech(reply, () => { if (stateGen === gen) setState('standby'); });
      return;
    }
    startSpeech(reply, toRest, { onStart: () => setState('speaking', short ? reply : t('status.responding')) });
  }

  // Chat (pergunta escrita): a Orb vira o painel; a resposta também é falada
  function respondInPanel(reply, understood, sources, query) {
    setState(understood ? 'standby' : 'error', '');
    openPanel();
    showAnswer(reply, { sources, query, error: !understood });
    sfx(understood ? 'answer' : 'error');
    scheduleHold(Math.min(90000, Math.max(9000, 7000 + reply.split(/\s+/).length * 400)));
    if (understood && canSpeak()) {
      startSpeech(reply, () => { if (curState === 'speaking') setState('standby'); if (panelOpen && hasAnswer) scheduleHold(5000); },
        { onStart: () => setState('speaking', '') });
    }
  }

  /* ── campo de pergunta (botão de chat) ── */
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

  document.addEventListener('pointerdown', e => {
    if (panelOpen && !e.target.closest('#orb, #askForm, #chatBtn, #gearBtn, #settingsPanel, #voiceScreen')) closePanel();
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
    if (vs.isOpen()) return;
    const sp = $('settingsPanel');
    const settingsOpen = !!(sp && sp.classList.contains('open'));
    if (e.key === 'Escape' && !settingsOpen) { if (panelOpen) closePanel(); else if (chatOpen) setChat(false); }
    else if (e.code === 'Space' && !e.target.matches('input,textarea,button,select')) { e.preventDefault(); activate(); }
    else if (e.key === '/' && !e.target.matches('input,textarea,select') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setChat(true); }
  });

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
      voices = Array.isArray(d.voices) ? d.voices.filter(v => v && Number.isInteger(v.slot) && v.slot >= 1 && v.slot <= 4) : [];
      if (ttsOn && voices.length && !voices.some(v => v.slot === prefs.slot)) { prefs.slot = voices[0].slot; savePrefs(); }
      online = true; coreErr = null;
    } catch (err) {
      online = false; coreErr = err.code || 'api_error';
      LOGGER.warn('models_unavailable', { code: coreErr });
      if (retry < 3 && coreErr !== 'forbidden') setTimeout(() => loadModels(retry + 1), 8000);
    }
    loading = false; settings.sync();
  }

  /* ── Voice & Speech (tela dedicada) ── */
  const vs = (() => {
    const el = $('voiceScreen');
    const dots = [...el.querySelectorAll('.vs-dot')];
    const pace = $('vsPace'), expr = $('vsExpr'), paceVal = $('vsPaceVal'), exprVal = $('vsExprVal');
    const msgEl = $('vsMsg'), engine = $('vsEngine'), wakeBtn = $('vsWake');
    let open = false, previewing = false, transient = false;

    const fill = inp => inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%');
    function msg(text, isErr) { transient = !!text; msgEl.textContent = text || ''; msgEl.classList.toggle('err', !!isErr); }

    function paintSliders() {
      fill(pace); fill(expr);
      paceVal.textContent = prefs.pace.toFixed(2) + '×';
      exprVal.textContent = Math.round(prefs.expr * 100) + '%';
    }
    function sync() {
      const eleven = ttsOn === true;
      dots.forEach(d => {
        const s = +d.dataset.slot, v = voices.find(x => x.slot === s);
        d.disabled = !(eleven && v);
        d.setAttribute('aria-checked', String(prefs.slot === s));
        d.setAttribute('aria-label', v ? v.label : 'Voice ' + s);
        d.title = v ? v.label : '';
      });
      pace.value = prefs.pace; expr.value = prefs.expr; paintSliders();
      expr.disabled = !eleven;
      // botão do Hey ORION: verde (cor "respondendo" da Orb) quando ativo, vermelho (cor "não entendi") quando desativado
      const wakeOn = prefs.wake && prefs.voice && VOICE.isAvailable && !wakeFault;
      wakeBtn.setAttribute('aria-checked', String(wakeOn));
      wakeBtn.disabled = !VOICE.isAvailable;
      wakeBtn.title = !VOICE.isAvailable ? t('vs.unavailWake') : wakeFault ? t('vs.wakeMic') : '';
      ORB.setVoiceColor(prefs.slot);   // a Orb desta tela fica na cor da voz selecionada
      engine.textContent = ttsOn === true ? t('vs.eleven') : ttsOn === false ? t('vs.browser') : t('vs.checking');
      if (!transient) {
        msgEl.textContent = ttsOn === false ? t('vs.noVoices') : (ttsOn === true ? t('vs.apply') : '');
        msgEl.classList.remove('err');
      }
    }

    // por que a prévia falhou? mensagem específica (motivo vem do servidor / do navegador)
    function previewMsg(err) {
      const c = err && err.code, x = err && err.tts, n = prefs.slot;
      if (x) {
        if (x.kw === 'detected_unusual_activity') return t('pv.unusual');
        if (x.kw === 'quota_exceeded') return t('pv.quota');
        if (x.kw === 'paid_plan_required') return t('pv.plan');
        if (x.kw === 'voice_not_found' || x.status === 404) return t('pv.voice', { n });
        if (x.kw === 'invalid_api_key' || x.status === 401) return t('pv.key');
        if (x.status === 429) return t('pv.busy');
        return t('pv.eleven', { s: x.status || '?' });
      }
      if (c === 'rate_limited') return t('vs.limit');
      if (c === 'timeout') return t('pv.timeout');
      if (c === 'core_unavailable') return t('pv.core');
      if (c === 'tts_unavailable') return t('pv.audio');
      if (c === 'voice_unavailable') return t('vs.slotOff', { n });
      if (c === 'model_unavailable') return t('pv.off');
      if (c === 'forbidden') return t('err.forbidden');
      return t('vs.previewFail');
    }

    function preview() {
      if (previewing) { stopSpeech(); return; }                 // o botão vira "Stop" enquanto toca
      if (processing) return;
      if (ttsOn !== true || !voices.some(v => v.slot === prefs.slot)) {
        msg(ttsOn === true ? t('vs.slotOff', { n: prefs.slot }) : t('vs.noVoices'), true);
        return;
      }
      stopSpeech();
      previewing = true; msg('');
      startSpeech('', () => { previewing = false; if (curState === 'speaking') setState('standby'); }, {
        preview: true,
        onStart: () => setState('speaking', ''),
        onCancel: () => { previewing = false; },
        fail: err => msg(previewMsg(err), true),
      });
    }

    function show() {
      open = true; el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
      ORB.setVoiceScreen({ zone: $('vsOrb'), orb: $('vsSphere'), halo: $('vsHalo'), disc: $('vsDisc') });
      ORB.setVoiceColor(prefs.slot, true);
      transient = false; sync();
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
      prefs.slot = +d.dataset.slot; savePrefs(); transient = false; sync();
      if (previewing) stopSpeech();
      preview();                                                // tocar numa voz toca uma prévia
    }));
    pace.addEventListener('input', () => { prefs.pace = Math.round(clamp(+pace.value, 0.8, 1.2) * 100) / 100; if (transient) msg(''); paintSliders(); });
    expr.addEventListener('input', () => { prefs.expr = Math.round(clamp(+expr.value, 0, 1) * 100) / 100; if (transient) msg(''); paintSliders(); });
    [pace, expr].forEach(i => i.addEventListener('change', savePrefs));
    $('vsOrb').addEventListener('click', preview);
    $('vsOrb').addEventListener('mouseenter', () => { try { ORB.setHover(true); } catch (_) {} });
    $('vsOrb').addEventListener('mouseleave', () => { try { ORB.setHover(false); } catch (_) {} });
    wakeBtn.addEventListener('click', () => {
      if (!VOICE.isAvailable) return;
      prefs.wake = !prefs.wake; savePrefs(); wakeFault = null;
      syncWake(); settings.sync();   // o clique é o que permite o navegador pedir o microfone
      if (prefs.wake) flash(t('wake.say'), 3200);
    });
    $('vsOrb').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); preview(); } });
    $('vsBack').addEventListener('click', back);
    document.addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.preventDefault(); back(); } });

    return { show, hide, sync, isOpen: () => open };
  })();

  /* ── settings: painel (⚙ no canto inferior direito ou Ctrl+,) ── */
  const settings = (() => {
    let panel = null, open = false;

    function coreLabel() {
      if (!API.configured()) return t('core.none');
      if (loading) return t('core.connecting');
      if (online) return models.length ? t('core.ok') : t('core.nomodel');
      return t(({ forbidden: 'core.forbidden', timeout: 'core.timeout', core_unavailable: 'core.unreach', api_error: 'core.err' })[coreErr] || 'core.down');
    }
    function sync() {
      vs.sync();
      if (!panel) return;
      const user = window.ORION_USER;
      panel.querySelector('#setEmail').textContent = (user && (user.email || user.displayName)) || t('set.none');
      panel.querySelector('#setCore').textContent = coreLabel();
      panel.querySelector('#toggleSound').textContent = prefs.sound ? t('on') : t('off');
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
        <div class="settings-card">
          <p class="settings-title">${t('set.title')}</p>
          <div class="settings-row"><span>${t('set.account')}</span><span class="settings-email" id="setEmail">—</span></div>
          <div class="settings-row"><span>${t('set.model')}</span><select id="modelSelect" class="settings-select" aria-label="${t('set.model')}"></select></div>
          <div class="settings-row"><span>${t('set.voice')}</span><button id="openVoice" class="settings-toggle has-arrow">${t('set.open')}</button></div>
          <div class="settings-row"><span>${t('set.sound')}</span><button id="toggleSound" class="settings-toggle"></button></div>
          <div class="settings-row"><span>${t('set.ui')}</span><select id="uiSelect" class="settings-select" aria-label="${t('set.ui')}"><option value="pt">${t('lang.pt')}</option><option value="en">${t('lang.en')}</option></select></div>
          <div class="settings-row"><span>${t('set.history')}</span><button id="clearChat" class="settings-toggle">${t('set.clear')}</button></div>
          <div class="settings-row"><span>${t('set.core')}</span><span class="settings-email" id="setCore">—</span></div>
          <button id="signOutBtn" class="settings-out">${t('set.signout')}</button>
          <p class="settings-hint">ORION AI V4.5.0</p>
        </div>`;
      document.body.appendChild(panel);

      panel.addEventListener('click', e => { if (e.target === panel) setOpen(false); });
      panel.querySelector('#openVoice').addEventListener('click', () => { setOpen(false); vs.show(); });
      panel.querySelector('#toggleSound').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); sync(); });
      panel.querySelector('#uiSelect').addEventListener('change', e => {
        prefs.ui = e.target.value === 'en' ? 'en' : 'pt'; savePrefs();
        I18N.set(prefs.ui); I18N.apply(); applyLang(); vs.sync();
        panel.remove(); panel = null; build(); panel.classList.add('open'); sync();   // reconstrói o painel no novo idioma
        syncWake();
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
    }

    function setOpen(on) {
      if (!panel) build();
      open = on;
      if (open) { sync(); if (!online) loadModels(); }
      panel.classList.toggle('open', open);
    }
    $('gearBtn').addEventListener('click', () => { if (!vs.isOpen()) setOpen(!open); });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === ',') { e.preventDefault(); if (vs.isOpen()) return; setOpen(!open); }
      else if (e.key === 'Escape' && open) setOpen(false);
    });
    return { sync, setOpen };
  })();

  /* ── "Hey ORION": ativação por voz (reconhecimento contínuo do navegador; só com a página aberta e visível) ── */
  function wakeShouldRun() {
    return prefs.wake && prefs.voice && VOICE.isAvailable && !wakeFault && !document.hidden
      && appEl.classList.contains('on') && !processing && !speaking && Date.now() > wakeBlockUntil
      && curState === 'standby';
  }
  function syncWake() {
    if (wakeShouldRun()) WAKE.start(); else WAKE.stop();
    const txt = prefs.wake && prefs.voice && VOICE.isAvailable && !wakeFault ? t('hint.wake') : t('hint.base');
    if (hintEl && hintEl.textContent !== txt) hintEl.textContent = txt;
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
