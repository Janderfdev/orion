/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.0 — Interaction Layer  (pages/js/app.js)

   Frontend = interação, eventos, estados visuais e comunicação com a API.
   Backend  = autenticação, contexto, orquestração, modelos, ferramentas, segurança.
   O app.js NÃO substitui o ORION Core.

   V4.5.0: interface em inglês (I18N en/pt), tela Voice & Speech, Orb com anéis ondulados e áudio reativo,
           4 vozes + Pace/Expressivity, "Hey ORION".
   V4.5.5: boot mais rápido, nome maior no topo (orion.html), respostas mais rápidas (backend).
   V5.0:   foto de perfil escolhida pelo usuário (só neste navegador), linha de plano/uso nas configurações,
           tema claro/escuro, botão "+" (imagem ou arquivo de texto), campo "agent" do /ask (Agent Engine) registrado no log.
   V5.0.1: identidade preto + azul escuro (sem roxo); segundo arco orbital na Orb; 4 estados visuais ligados aos eventos reais:
           idle (preto/azul escuro) · listening (azul escuro) · responding (verde: gerando OU falando) · not understood (vermelho).
   ═══════════════════════════════════════════════════════════════ */

/* Durante o standby (standby.js) o app NÃO inicia: sem microfone, sem "Hey ORION", sem chamadas ao servidor. Quando a janela acaba,
   o standby.js recarrega a página e tudo abre normalmente. */
if (!(window.ORION_STANDBY && window.ORION_STANDBY.active())) {

/* Endereço do backend (Render). Se um dia mudar, troque aqui (sem barra no final). */
const ORION_CONFIG = { API_URL: 'https://orion-backend-9qk5.onrender.com' };

/* ═══ i18n.js — textos da interface (en = padrão · pt = opção) ═══
   O idioma da INTERFACE é separado do idioma da CONVERSA (voz): ver prefs.ui e prefs.lang.
   Marcas (ORION AI, ORION Core, ORION Voice) nunca são traduzidas. */
const I18N = (() => {
  const D = {
    en: {
      'boot.init': 'initializing', 'boot.core': 'connecting to core', 'boot.online': 'systems online',
      'online': 'ORION ONLINE', 'version': 'VERSION V5.0',
      'status.listening': 'Listening…', 'status.processing': 'Responding…', 'status.responding': 'Responding…', 'status.unheard': 'I didn’t understand. Please try again.',
      'hint.base': 'tap the orb to speak · or use the chat button',
      'hint.wake': 'say “hey orion” · tap the orb · or use the chat button',
      'ask.ph': 'Ask or give ORION a command', 'ask.aria': 'Question for ORION',
      'mic.aria': 'Speak', 'send.aria': 'Send', 'chat.aria': 'Ask ORION', 'gear.aria': 'Settings',
      'err.mic_unavailable': 'Microphone unavailable.', 'err.stt_unavailable': 'Speech recognition isn’t available in this browser.',
      'err.model_unavailable': 'I couldn’t reach the model.', 'err.timeout': 'The response took too long.',
      'err.api_error': 'Couldn’t reach the service.', 'err.invalid_response': 'I received an invalid response.',
      'err.tool_unavailable': 'That tool isn’t available yet.', 'err.offline': 'No internet connection.',
      'err.tts_unavailable': 'I can’t speak the answer right now.', 'err.unexpected_input': 'I didn’t understand. Please try again.',
      'err.forbidden': 'This account doesn’t have access to ORION.', 'err.rate_limited': 'Too many requests. Please wait a moment.',
      'err.quota_exceeded': 'You’ve reached your question limit. Upgrade to keep using the AI soon.',
      'err.core_unavailable': 'I couldn’t reach the ORION core.', 'err.voice_disabled': 'Voice is turned off in settings.',
      'err.voice_unavailable': 'That voice isn’t available.', 'err.unknown': 'I couldn’t process that.',
      'wiki.read': 'Read on Wikipedia ↗', 'wiki.search': 'Search Wikipedia ↗', 'wiki.title': 'Search “{q}” on Wikipedia',
      'set.title': 'Settings', 'set.account': 'Account', 'set.model': 'Model', 'set.voice': 'Voice & Speech', 'set.open': 'Open',
      'set.sound': 'Sounds', 'set.calm': 'Reduce motion', 'set.ui': 'Language', 'set.wake': 'Hey ORION', 'set.history': 'History', 'set.clear': 'Clear',
      'set.cleared': 'Cleared', 'set.failed': 'Failed',
      'set.photo': 'Profile photo', 'set.photoPick': 'Choose', 'set.photoDel': 'Remove',
      'set.photoNote': 'Your photo stays on this device only.', 'set.photoType': 'Use a JPG, PNG or WebP image.',
      'set.photoBig': 'That image is too large (max 8 MB).', 'set.photoSave': 'Couldn’t save the photo.', 'set.plan': 'Plan',
      'set.upgrade': 'Upgrade', 'set.upgradeSoon': 'You’ll be able to upgrade soon.',
      'code.aria': 'ORION CODE and ORION API', 'code.title': 'ORION CODE · ORION API', 'code.soon': 'Coming soon',
      'code.codeDesc': 'A programming assistant: it reads your project, proposes changes and only applies what you approve.',
      'code.apiDesc': 'Use ORION’s intelligence in your own apps, with an API key and limits per plan.',
      'code.planned': 'Planned: {v}', 'code.note': 'Not available yet. Versions and dates may change.', 'code.close': 'Close',
      'set.theme': 'Theme', 'theme.preto': 'Black', 'theme.nebulosa': 'Nebula',
      'attach.aria': 'Attach an image or file', 'attach.default': 'Describe this attachment.', 'attach.remove': 'Remove attachment',
      'attach.errType': 'Use a JPG, PNG or WebP image, or a text file (.txt, .md, .csv, .json, code).', 'attach.errSize': 'That file is too large.',
      'attach.errRead': 'I couldn’t read that file.', 'err.attachment_invalid': 'I couldn’t use that attachment.',
      'set.core': 'Core', 'set.signout': 'Sign out', 'set.none': 'Not signed in',
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
      'pv.voice': 'Voice {n} doesn’t exist in the ElevenLabs account (check its ID).', 'pv.key': 'The ElevenLabs API key was rejected.', 'pv.perm': 'The ElevenLabs key has no Text to Speech permission.',
      'pv.auth': 'ElevenLabs refused access (error {s}{k}). Check the key and its permissions.',
      'pv.unusual': 'ElevenLabs blocked the free plan from this server.', 'pv.busy': 'ElevenLabs is limiting usage right now. Try again in a moment.',
      'pv.eleven': 'ElevenLabs refused the request (error {s}).', 'pv.timeout': 'The server took too long (it may be waking up). Try again.',
      'pv.core': 'No response from the server.', 'pv.audio': 'The browser couldn’t play the audio.', 'pv.off': 'The server voice is turned off.',
      'vs.slotOff': 'Voice {n} isn’t configured on the server.', 'vs.apply': 'Changes apply to the next spoken reply.',
      'vs.unavailWake': 'Unavailable', 'vs.wakeMic': 'No microphone', 'vs.wakeNeed': 'Turn on Speak replies',
      'wake.say': 'Say “Hey ORION” to talk', 'wake.mic': 'Microphone blocked: wake word turned off', 'wake.unstable': 'Wake word unstable: turned off',
    },
    pt: {
      'boot.init': 'inicializando', 'boot.core': 'conectando ao núcleo', 'boot.online': 'sistemas online',
      'online': 'ORION ONLINE', 'version': 'VERSÃO V5.0',
      'status.listening': 'Ouvindo…', 'status.processing': 'Respondendo…', 'status.responding': 'Respondendo…', 'status.unheard': 'Não entendi. Tente de novo.',
      'hint.base': 'toque na orb para falar · ou use o botão de chat',
      'hint.wake': 'diga “hey orion” · toque na orb · ou use o botão de chat',
      'ask.ph': 'Pergunte ou dê um comando ao ORION', 'ask.aria': 'Pergunta ao ORION',
      'mic.aria': 'Falar', 'send.aria': 'Enviar', 'chat.aria': 'Perguntar ao ORION', 'gear.aria': 'Configurações',
      'err.mic_unavailable': 'Microfone indisponível.', 'err.stt_unavailable': 'Reconhecimento de voz indisponível neste navegador.',
      'err.model_unavailable': 'Não consegui acessar o modelo.', 'err.timeout': 'A resposta demorou demais.',
      'err.api_error': 'Falha ao comunicar com o serviço.', 'err.invalid_response': 'Recebi uma resposta inválida.',
      'err.tool_unavailable': 'Essa ferramenta ainda não está disponível.', 'err.offline': 'Sem conexão com a internet.',
      'err.tts_unavailable': 'Não consigo falar a resposta agora.', 'err.unexpected_input': 'Não entendi. Tente de novo.',
      'err.forbidden': 'Esta conta não tem acesso ao ORION.', 'err.rate_limited': 'Muitas solicitações. Aguarde um instante.',
      'err.quota_exceeded': 'Você atingiu o limite de perguntas. Faça upgrade para continuar usando a IA em breve.',
      'err.core_unavailable': 'Não consegui falar com o núcleo do ORION.', 'err.voice_disabled': 'Voz desativada nas configurações.',
      'err.voice_unavailable': 'Essa voz não está disponível.', 'err.unknown': 'Não consegui processar.',
      'wiki.read': 'Ler na Wikipédia ↗', 'wiki.search': 'Pesquisar na Wikipédia ↗', 'wiki.title': 'Pesquisar “{q}” na Wikipédia',
      'set.title': 'Configurações', 'set.account': 'Conta', 'set.model': 'Modelo', 'set.voice': 'Voice & Speech', 'set.open': 'Abrir',
      'set.sound': 'Sons', 'set.calm': 'Reduzir movimento', 'set.ui': 'Idioma', 'set.wake': 'Hey ORION', 'set.history': 'Histórico', 'set.clear': 'Limpar',
      'set.cleared': 'Limpo', 'set.failed': 'Falhou',
      'set.photo': 'Foto de perfil', 'set.photoPick': 'Escolher', 'set.photoDel': 'Remover',
      'set.photoNote': 'Sua foto fica só neste aparelho.', 'set.photoType': 'Use uma imagem JPG, PNG ou WebP.',
      'set.photoBig': 'Essa imagem é grande demais (máx. 8 MB).', 'set.photoSave': 'Não consegui salvar a foto.', 'set.plan': 'Plano',
      'set.upgrade': 'Upgrade', 'set.upgradeSoon': 'Em breve você poderá fazer upgrade.',
      'code.aria': 'ORION CODE e ORION API', 'code.title': 'ORION CODE · ORION API', 'code.soon': 'Em breve',
      'code.codeDesc': 'Um assistente de programação: lê o seu projeto, propõe mudanças e só aplica o que você aprovar.',
      'code.apiDesc': 'Use a inteligência do ORION nos seus próprios apps, com chave de API e limites por plano.',
      'code.planned': 'Previsto: {v}', 'code.note': 'Ainda não está disponível. Versões e datas podem mudar.', 'code.close': 'Fechar',
      'set.theme': 'Tema', 'theme.preto': 'Preto', 'theme.nebulosa': 'Nebulosa',
      'attach.aria': 'Anexar imagem ou arquivo', 'attach.default': 'Descreva este anexo.', 'attach.remove': 'Remover anexo',
      'attach.errType': 'Use uma imagem JPG, PNG ou WebP, ou um arquivo de texto (.txt, .md, .csv, .json, código).', 'attach.errSize': 'Esse arquivo é grande demais.',
      'attach.errRead': 'Não consegui ler esse arquivo.', 'err.attachment_invalid': 'Não consegui usar esse anexo.',
      'set.core': 'Núcleo', 'set.signout': 'Sair da conta', 'set.none': 'Não conectada',
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
      'pv.voice': 'A voz {n} não existe na conta da ElevenLabs (confira o ID).', 'pv.key': 'A chave da ElevenLabs foi recusada.', 'pv.perm': 'A chave da ElevenLabs não tem permissão de Text to Speech.',
      'pv.auth': 'A ElevenLabs recusou o acesso (erro {s}{k}). Confira a chave e as permissões.',
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

/* ═══ visual-state.js — máquina de estados visuais da Orb (V5.0.1) ═══
   Os 4 estados visíveis:
     IDLE        (standby)  → preto / azul escuro
     LISTENING              → azul escuro (#102B5C) + realce azul discreto
     RESPONDING             → verde (#22C55E): "processing" (gerando a resposta) E "speaking" (falando) compartilham a mesma cor;
                              "speaking" ainda pulsa com o áudio real
     NOT UNDERSTOOD (error) → vermelho (#EF4444)
   "processing" continua existindo internamente (a pergunta está em andamento no servidor), mas a aparência é a de "responding". */
const VISUAL_STATE = (() => {
  const IDLE  = { a: '#0B1630', b: '#05080F', c: '#1B3A6B' };
  const GREEN = { a: '#15803D', b: '#052E16', c: '#22C55E' };
  const CFG = {
    standby:    { amp: 1.00, rot: 1.00, bright: 0.82, cls: '',             color: IDLE },
    listening:  { amp: 1.18, rot: 1.50, bright: 0.95, cls: 'st-listening', color: { a: '#102B5C', b: '#0B1630', c: '#2F5DA8' } },
    processing: { amp: 1.12, rot: 1.80, bright: 0.88, cls: 'st-thinking',  color: GREEN },
    speaking:   { amp: 1.24, rot: 1.65, bright: 1.00, cls: 'st-speaking',  color: GREEN },   // pulsa com o áudio
    error:      { amp: 0.82, rot: 0.50, bright: 0.60, cls: 'st-error',     color: { a: '#B91C1C', b: '#450A0A', c: '#EF4444' } },
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

/* ═══ orb.js — motor visual: blobs de luz na Orb + dois arcos orbitais + anéis ondulados e partículas ═══
   Cor interpolada quadro a quadro; brilho e anéis reagem ao nível real do áudio durante a fala.
   Arco principal (#halo): o original. Segundo arco (#halo2): mais fino, raio menor, inclinado e girando devagar no sentido oposto. */
const ORB = (() => {
  const $ = id => document.getElementById(id);
  const canvas = $('orbCanvas'), ctx = canvas.getContext('2d');
  const orbEl = $('orb'), haloEl = $('halo'), halo2El = $('halo2');
  const root = document.documentElement;
  let vs = null;   // elementos da Orb da tela Voice & Speech (réplica da Orb principal)
  const orbZone = $('orbZone');

  const TILT2 = -24, SQUASH2 = 0.8;   // inclinação (graus) e achatamento do segundo arco
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

  /* cor da Orb da tela Voice & Speech conforme a voz escolhida (a Orb principal NÃO usa isto).
     Só tons de azul e cinza: verde e vermelho ficam reservados aos estados "respondendo" e "não entendi". */
  const VOICE_PALETTE = {
    1: { a: '#102B5C', b: '#0B1630', c: '#2F5DA8' },
    2: { a: '#1D4380', b: '#0B1630', c: '#5E8FE0' },
    3: { a: '#2A3A55', b: '#0B1630', c: '#7C8FB0' },
    4: { a: '#3A3F4A', b: '#14171D', c: '#929BAA' },
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
  // aplica o estado atual às duas Orbs (principal e a da tela Voice & Speech): classe, arcos rápidos e anéis de energia
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
    bg.addColorStop(1, 'rgba(5,8,15,0.96)');   // base da Orb: #05080F
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
    vig.addColorStop(0, 'rgba(5,8,15,0)');
    vig.addColorStop(1, 'rgba(5,8,15,0.82)');
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
    const kc = k(5.5);   // transição de cor ≈ 300–400 ms
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
    const haloT = calm ? 0 : (fastHalo ? 360 / 14 : (hovered ? 360 / 20 : 360 / 28));   // arcos: 28 s em repouso, 14 s em atividade
    haloV += (haloT - haloV) * k(2);
    haloAng = (haloAng + dt * haloV) % 360;
    haloAng2 = (haloAng2 - dt * haloV * 0.55) % 360;   // o segundo arco gira mais devagar e no sentido oposto
    const rot = 'translateY(' + orbY.toFixed(2) + 'px) rotate(' + haloAng.toFixed(2) + 'deg)';   // o arco sobe e desce junto com a Orb
    // segundo arco: gira no próprio plano, depois é achatado e inclinado (a ordem da transformação importa)
    const rot2 = 'translateY(' + orbY.toFixed(2) + 'px) rotate(' + TILT2 + 'deg) scaleY(' + SQUASH2 + ') rotate(' + haloAng2.toFixed(2) + 'deg)';
    haloEl.style.transform = rot;
    halo2El.style.transform = rot2;

    if (vs) {                                             // tela Voice & Speech aberta: só a Orb dela é desenhada
      vs.halo.style.transform = rot;
      if (vs.halo2) vs.halo2.style.transform = rot2;
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
    setVoiceScreen: els => { vs = els ? { zone: els.zone, orb: els.orb, halo: els.halo, halo2: els.halo2, disc: els.disc, ctx: els.disc.getContext('2d') } : null; vsRings = vs ? makeRings(vs.zone) : []; if (vs) decorate(); },
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
    let tts = null;   // motivo da falha da voz vindo do servidor ("tts:<status>:<palavra-chave>")
    if (!res.ok && path.startsWith('/speak')) {
      try { const j = await res.clone().json(); const mm = /^tts:(\d+):([a-z_]*)$/.exec(j && j.detail); if (mm) tts = { status: +mm[1], kw: mm[2] }; } catch (_) {}
    }
    const failT = (msg, code) => { const e = fail(msg, code); if (tts) e.tts = tts; return e; };
    if (res.status === 401) { if (window.ORION_SIGNOUT) window.ORION_SIGNOUT(); throw fail('Session expired.', 'api_error'); }
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
    ask: (text, model, lang, att) => call('/ask', { method: 'POST', body: Object.assign({ text, model, lang }, att || {}) }),   // lang: idioma da conversa · att: {image} ou {file}
    clearMemory: () => call('/memory/clear', { method: 'POST' }),
    speak: (text, o) => call('/speak', { method: 'POST', body: { text, voice: o.voice, pace: o.pace, expressivity: o.expressivity }, timeoutMs: 20000, blob: true }),
    preview: o => call('/speak/preview', { method: 'POST', body: { voice: o.voice, pace: o.pace, expressivity: o.expressivity, lang: o.lang }, timeoutMs: 20000, blob: true }),
    speakDiag: slot => call('/speak/diag?voice=' + encodeURIComponent(slot || 1), { timeoutMs: 30000 }),
  };
})();

/* ═══ interação — V5.0.1 ═══
   Fluxo: botão de chat (ou voz) → a própria Orb cresce e vira o painel → API → ORION Core → resposta DENTRO do painel.
   Estados da Orb (todos disparados por eventos reais: reconhecimento de fala, resposta da API, início/fim do áudio, erros):
   idle (preto/azul escuro) · listening (azul escuro) · processing/speaking (verde; speaking pulsa com o áudio) · error (vermelho). */
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
  prefs.theme = prefs.theme === 'nebulosa' ? 'nebulosa' : 'preto';   // padrão: preto 100% (valores antigos viram preto)
  const savePrefs = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} };
  savePrefs();

  I18N.set(prefs.ui); I18N.apply();
  try { ORB.init(); } catch (err) { console.error('[ORION] ORB.init failed:', err); }

  const bootEl = $('boot'), appEl = $('app'), orbZone = $('orbZone'), orbEl = $('orb');
  const statusText = $('statusText'), statusBox = $('statusBox'), hintEl = $('hintText');
  const respText = $('responseText'), answerScroll = $('answerScroll'), answerSrc = $('answerSource'), answerGallery = $('answerGallery');
  const askForm = $('askForm'), askInput = $('askInput'), askSend = $('askSend'), micBtn = $('micBtn');
  const chatBtn = $('chatBtn'), siri = $('siri');
  const attachBtn = $('attachBtn'), attachFile = $('attachFile'), attachChip = $('attachChip'), attachThumb = $('attachThumb'), attachName = $('attachName'), attachDel = $('attachDel');

  let curState = 'standby', stateGen = 0, processing = false;
  let panelOpen = false, chatOpen = false, hasAnswer = false, speaking = false, holdTimer = null, flashTimer = null;
  let wakeFault = null, wakeBlockUntil = 0;
  // ttsOn: null = ainda não sei (servidor acordando) · true = ElevenLabs ligado · false = servidor sem voz
  let models = [], voices = [], online = false, loading = false, coreErr = null, ttsOn = null;
  let quota = null;   // {used, limit, plan} do último /ask

  const sfx = name => { if (prefs.sound) { try { SOUND[name](); } catch (_) {} } };
  const finePointer = () => matchMedia('(pointer: fine)').matches;

  /* ── movimento reduzido: sistema operacional (prefers-reduced-motion) ── */
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => mq.matches;
  function applyCalm() { document.body.classList.toggle('calm', calm()); ORB.setCalm(calm()); }
  if (mq.addEventListener) mq.addEventListener('change', applyCalm);
  applyCalm();

  /* ── temas (V5.0): PRETO (padrão) e NEBULOSA (o mesmo preto, com estrelas e nuvens azul-escuras ao fundo) ──
     A Orb e as cores da interface são idênticas nos dois. A escolha fica salva neste navegador. */
  const THEMES = ['preto', 'nebulosa'];
  function applyTheme(animate) {
    const next = prefs.theme, root = document.documentElement;
    if (!animate || calm() || root.dataset.theme === next) { root.dataset.theme = next; return; }
    root.classList.add('theme-swap');   // a página some por um instante, troca e volta
    setTimeout(() => { root.dataset.theme = next; root.classList.remove('theme-swap'); }, 230);
  }
  applyTheme(false);


  /* ── idioma da conversa: reconhecimento de fala (e voz de reserva) ── */
  const speechLang = () => (prefs.ui === 'pt' ? 'pt' : 'en');
  function applyLang() { const l = prefs.ui === 'pt' ? 'pt-BR' : 'en-US'; VOICE.setLang(l); WAKE.setLang(l); }
  const voiceOpts = () => ({ voice: prefs.slot, pace: prefs.pace, expressivity: prefs.expr });
  const previewOpts = () => Object.assign(voiceOpts(), { lang: speechLang() });

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
    statusBox.dataset.state = name;                          // reforço de cor do texto de estado
    micBtn.classList.toggle('live', name === 'listening');   // o microfone do campo de pergunta acende só quando está realmente ouvindo
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

  /* ── ciclo principal: pergunta → Responding (verde, enquanto o servidor gera) → resposta ──
     Escrita no chat → a Orb vira o painel.  Por voz → a Orb responde sozinha (verde pulsando com o áudio). */
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
    try {
      const data = await API.ask(text, prefs.model, speechLang(), att && att.payload);
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
      if (source === 'voice') respondByVoice(reply, understood, data.sources, text);
      else respondInPanel(reply, understood, data.sources, text);
    } catch (err) {
      processing = false; lock(false);   // o texto fica no campo para tentar de novo
      fail(err, 'ask', source !== 'voice');
    }
    if (source === 'text' && chatOpen && finePointer()) askInput.focus();
  }

  // Voz: a Orb fica verde (responding) desde que a pergunta é enviada; quando o áudio começa de verdade, passa a pulsar com o volume
  function respondByVoice(reply, understood, sources, query) {
    sfx(understood ? 'answer' : 'error');
    if (!canSpeak()) { setState('standby'); respondInPanel(reply, understood, sources || [], query || ''); return; }
    const short = reply.length <= 46;
    const toRest = () => { if (curState === 'speaking' || curState === 'processing') setState('standby'); };
    if (!understood) {
      const gen = setState('error', t('status.unheard'));
      startSpeech(reply, () => { if (stateGen === gen) setState('standby'); });
      return;
    }
    startSpeech(reply, toRest, { onStart: () => setState('speaking', short ? reply : t('status.responding')) });
  }

  // Chat (pergunta escrita): a Orb vira o painel; a resposta também é falada.
  // Se vai falar, a Orb continua verde (responding) até o áudio começar — sem piscar de volta ao idle no meio do caminho.
  function respondInPanel(reply, understood, sources, query) {
    const willSpeak = understood && canSpeak();
    if (!understood) setState('error', t('status.unheard'));
    else if (willSpeak) setState('processing');
    else setState('standby', '');
    openPanel();
    showAnswer(reply, { sources, query, error: !understood });
    sfx(understood ? 'answer' : 'error');
    scheduleHold(Math.min(90000, Math.max(9000, 7000 + reply.split(/\s+/).length * 400)));
    if (willSpeak) {
      startSpeech(reply, () => { if (curState === 'speaking' || curState === 'processing') setState('standby'); if (panelOpen && hasAnswer) scheduleHold(5000); },
        { onStart: () => setState('speaking', t('status.responding')) });
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
    if (panelOpen && !e.target.closest('#orb, #askForm, #chatBtn, #codeBtn, #gearBtn, #settingsPanel, #codePanel, #voiceScreen')) closePanel();
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
    const settingsOpen = !!document.querySelector('#settingsPanel.open, #codePanel.open');
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
      // botão do Hey ORION: azul ativo quando ligado, cinza quando desligado (verde e vermelho são reservados aos estados da Orb)
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
        if (x.kw === 'missing_permissions') return t('pv.perm');
        if (x.kw === 'invalid_api_key') return t('pv.key');
        if (x.status === 401) return t('pv.auth', { s: x.status, k: x.kw ? ' · ' + x.kw : '' });
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
      ORB.setVoiceScreen({ zone: $('vsOrb'), orb: $('vsSphere'), halo: $('vsHalo'), halo2: $('vsHalo2'), disc: $('vsDisc') });
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

  /* ── botão </> : aviso sobre ORION CODE e ORION API (ainda não existem); mesmo tamanho do painel de configurações ── */
  const codeInfo = (() => {
    let panel = null, open = false;
    function build() {
      panel = document.createElement('div');
      panel.id = 'codePanel';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'codeTitle');
      panel.innerHTML = `
        <div class="settings-card">
          <p class="settings-title" id="codeTitle">${t('code.title')}</p>
          <div class="code-grid">
            <div class="code-card">
              <span class="code-badge">${t('code.soon')}</span>
              <h3>ORION CODE</h3>
              <p>${t('code.codeDesc')}</p>
              <span class="code-ver">${t('code.planned', { v: 'V5.5.0' })}</span>
            </div>
            <div class="code-card">
              <span class="code-badge">${t('code.soon')}</span>
              <h3>ORION API</h3>
              <p>${t('code.apiDesc')}</p>
              <span class="code-ver">${t('code.planned', { v: 'V5.2.0' })}</span>
            </div>
          </div>
          <p class="code-note">${t('code.note')}</p>
          <div class="settings-actions"><button id="codeClose" class="settings-upgrade" type="button">${t('code.close')}</button></div>
        </div>`;
      document.body.appendChild(panel);
      panel.addEventListener('click', e => { if (e.target === panel) setOpen(false); });
      panel.querySelector('#codeClose').addEventListener('click', () => setOpen(false));
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
      // V5.0: foto de perfil (escolhida pelo usuário, só neste navegador) e plano/uso do dia
      const avBtn = panel.querySelector('#avatarBtn'), av = AVATAR.get();
      avBtn.textContent = '';
      if (av) { const im = document.createElement('img'); im.src = av; im.alt = ''; avBtn.appendChild(im); }
      else avBtn.textContent = (((user && (user.displayName || user.email)) || '?').trim().charAt(0) || '?').toUpperCase();
      panel.querySelector('#avatarDel').hidden = !av;
      panel.querySelector('#setPlan').textContent = quota ? quota.plan.toUpperCase() + ' · ' + quota.used + '/' + quota.limit : '—';
      panel.querySelector('#toggleSound').textContent = prefs.sound ? t('on') : t('off');
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
        <div class="settings-card">
          <p class="settings-title">${t('set.title')}</p>
          <div class="settings-grid">
            <div class="settings-side">
              <div class="avatar-block">
                <button id="avatarBtn" class="avatar-btn" type="button" aria-label="${t('set.photo')}" title="${t('set.photo')}"></button>
                <div class="avatar-actions">
                  <button id="avatarPick" class="settings-toggle" type="button">${t('set.photoPick')}</button>
                  <button id="avatarDel" class="settings-toggle" type="button">${t('set.photoDel')}</button>
                </div>
                <input id="avatarFile" type="file" accept="image/jpeg,image/png,image/webp" hidden>
                <p class="settings-note warn" id="avatarMsg" role="status" hidden></p>
              </div>
              <div class="side-info">
                <span class="settings-email" id="setEmail">—</span>
                <span class="plan-chip" id="setPlan" title="${t('set.plan')}">—</span>
                <div class="mini-row"><span>${t('set.history')}</span><button id="clearChat" class="settings-toggle">${t('set.clear')}</button></div>
                <div class="mini-row"><span>${t('set.core')}</span><span class="settings-email" id="setCore">—</span></div>
                <p class="settings-note side-note">${t('set.photoNote')}</p>
              </div>
            </div>
            <div class="settings-main">
              <div class="settings-row"><span>${t('set.model')}</span><select id="modelSelect" class="settings-select" aria-label="${t('set.model')}"></select></div>
              <div class="settings-row"><span>${t('set.voice')}</span><button id="openVoice" class="settings-toggle has-arrow">${t('set.open')}</button></div>
              <div class="settings-row"><span>${t('set.sound')}</span><button id="toggleSound" class="settings-toggle"></button></div>
              <div class="settings-row"><span>${t('set.theme')}</span><div class="theme-swatches" id="themeSwatches" role="radiogroup" aria-label="${t('set.theme')}">${['preto', 'nebulosa'].map(k => `<button type="button" class="sw sw-${k}" role="radio" aria-checked="false" data-k="${k}" aria-label="${t('theme.' + k)}" title="${t('theme.' + k)}"></button>`).join('')}</div></div>
              <div class="settings-row"><span>${t('set.ui')}</span><select id="uiSelect" class="settings-select" aria-label="${t('set.ui')}"><option value="pt">${t('lang.pt')}</option><option value="en">${t('lang.en')}</option></select></div>
            </div>
          </div>
          <div class="settings-actions">
            <button id="signOutBtn" class="settings-out" type="button">${t('set.signout')}</button>
            <button id="upgradeBtn" class="settings-upgrade" type="button">${t('set.upgrade')}</button>
          </div>
          <p class="settings-hint" id="settingsHint">ORION AI V5.0</p>
          <p class="settings-note upgrade-note" id="upgradeNote" role="status" hidden></p>
        </div>`;
      document.body.appendChild(panel);

      panel.addEventListener('click', e => { if (e.target === panel) setOpen(false); });
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
      panel.querySelector('#toggleSound').addEventListener('click', () => { prefs.sound = !prefs.sound; savePrefs(); sync(); });
      panel.querySelector('#themeSwatches').addEventListener('click', e => {
        const b = e.target.closest('.sw'); if (!b) return;
        prefs.theme = THEMES.includes(b.dataset.k) ? b.dataset.k : 'preto'; savePrefs(); applyTheme(true); sync();
      });
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
      const upNote = panel.querySelector('#upgradeNote'), upHint = panel.querySelector('#settingsHint'); let upTimer = null;
      panel.querySelector('#upgradeBtn').addEventListener('click', () => {   // planos PLUS/PRO chegam na V5.2.0: por enquanto, só um aviso (no lugar da versão)
        upNote.textContent = t('set.upgradeSoon'); upNote.hidden = false; upHint.hidden = true;
        clearTimeout(upTimer); upTimer = setTimeout(() => { upNote.hidden = true; upHint.hidden = false; }, 4500);
      });
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

}   // fim do guard do standby
