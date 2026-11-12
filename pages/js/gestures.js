/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.2.0 — Gestos: duas palmas acordam o ORION   (pages/js/gestures.js)

   Carregar ANTES do app.js. Duas partes:
     createClapDetector()  lógica pura (sem microfone): recebe quadros de áudio e diz quando houve "duas palmas".
                           Por ser pura, é testada com sinais sintéticos (ver tests/gestures.test.js).
     createMicClap()       liga o microfone do navegador ao detector.

   Privacidade (importante):
     - O áudio é analisado SÓ NO APARELHO, em memória, a cada ~20 ms. Nada é gravado, guardado nem enviado.
     - A saída do microfone NÃO é ligada aos alto-falantes (sem eco) e o microfone só fica aberto enquanto o gesto está
       ligado, a página está visível e o ORION está em repouso. O navegador mostra o ícone de microfone em uso.

   Como uma palma é reconhecida (palma = estalo curto, forte e "chiado", diferente de voz, música e batidas):
     1. pico bem acima do ruído de fundo (que o detector aprende sozinho) e acima de um mínimo;
     2. começo súbito (o quadro anterior era bem mais baixo);
     3. formato de impulso, medido no quadro mais forte do evento: pico muito maior que a energia média (crest) e muito
        "chiado" (taxa de cruzamento por zero alta: batida grave de mesa e voz têm pouco);
     4. o som some logo (em até 2 quadros): fala e música sustentam, palma não.
   Duas palmas com 130 a 750 ms entre elas = gesto. Depois do gesto há 2,5 s de pausa para não repetir.
   ═══════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // testes em Node
  else root.ORION_GESTURES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DEFAULTS = {
    minPeak: 0.22,        // pico mínimo (0..1) com sensibilidade 1
    floorMult: 7,         // o pico também precisa ser N vezes o ruído de fundo aprendido
    minCrest: 3.2,        // pico / RMS do quadro
    minZcr: 0.12,         // fração de cruzamentos por zero (palma é "chiada"; batida grave e voz, não)
    onsetRatio: 0.55,     // o quadro anterior precisa ter pico < 55% do atual (começo súbito)
    decayRatio: 0.6,      // em até 2 quadros o pico precisa cair abaixo de 60% (impulso, não som sustentado)
    refractoryMs: 90,     // depois de uma palma candidata, ignora o resto da mesma palma
    gapMinMs: 130, gapMaxMs: 750,   // intervalo entre as duas palmas
    cooldownMs: 2500,     // pausa depois do gesto
    floorAlpha: 0.03, floorInit: 0.006,
  };

  function createClapDetector(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const sens = o.sensitivity > 0 ? o.sensitivity : 1;      // > 1 = mais sensível
    const minPeak = o.minPeak / sens;
    let floor = o.floorInit, prevPeak = 0, pend = null, lastCand = -1e9, firstClap = null, coolUntil = -1e9;

    function accept(tClap) {
      if (firstClap !== null && tClap - firstClap >= o.gapMinMs && tClap - firstClap <= o.gapMaxMs) {
        firstClap = null; coolUntil = tClap + o.cooldownMs;
        return 'double';
      }
      firstClap = tClap;
      return 'clap';
    }

    /** samples: Float32Array/Array (-1..1) de UM quadro; t: instante do quadro em ms. Devolve 'double', 'clap' ou null. */
    function push(samples, t) {
      const n = samples ? samples.length : 0;
      if (!n || !Number.isFinite(t)) return null;
      let peak = 0, sum = 0, zc = 0, prevS = 0;
      for (let i = 0; i < n; i++) {
        const x = +samples[i] || 0, a = x < 0 ? -x : x;
        if (a > peak) peak = a;
        sum += x * x;
        if (i && ((x >= 0) !== (prevS >= 0))) zc++;
        prevS = x;
      }
      const rms = Math.sqrt(sum / n), crest = peak / (rms + 1e-9), zcr = zc / n;
      let result = null;

      if (pend) {                                           // confirma a candidata: o som precisa sumir logo
        if (peak > pend.best.peak) pend.best = { peak, crest, zcr };   // o formato vale no quadro MAIS FORTE do evento (o 1º pode ser só o começo)
        if (peak < pend.ref * o.decayRatio) {
          const ok = pend.best.crest >= o.minCrest && pend.best.zcr >= o.minZcr;   // impulso "chiado"; batida grave e voz ficam de fora
          if (ok) result = accept(pend.t); else lastCand = t;
          pend = null;
        } else {
          pend.ref = Math.max(pend.ref, peak);              // palma que "atravessa" dois quadros: o pico real é o maior deles
          if (++pend.frames >= 2) { lastCand = t; pend = null; }   // sustentado (voz/música): não é palma
        }
      }
      const thresh = Math.max(minPeak, floor * o.floorMult);
      if (!pend && !result && peak >= thresh && prevPeak < peak * o.onsetRatio && t - lastCand > o.refractoryMs && t >= coolUntil) {
        pend = { t, ref: peak, frames: 0, best: { peak, crest, zcr } };
        lastCand = t;
      }
      if (peak < thresh * 0.5) floor += (rms - floor) * o.floorAlpha;   // aprende o ruído de fundo só em quadros calmos
      prevPeak = peak;
      return result;
    }
    return { push, get floor() { return floor; } };
  }

  /* ── microfone → detector (só no navegador) ── */
  function createMicClap(o) {
    const opt = o || {};
    let ctx = null, stream = null, timer = 0, active = false, starting = false, cancelled = false;
    const debug = () => { try { return localStorage.getItem('orion_clap_debug') === '1'; } catch (_) { return false; } };

    function cleanup() {
      active = false;
      clearInterval(timer); timer = 0;
      if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch (_) {} stream = null; }
      if (ctx) { try { ctx.close(); } catch (_) {} ctx = null; }
    }

    async function start() {
      if (active || starting) return active;
      starting = true; cancelled = false;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
        // sem cancelamento de eco, supressão de ruído nem ganho automático: eles "achatam" o estalo da palma
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (cancelled) { cleanup(); return false; }
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (_) {} }
        const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
        let size = 32; while (size < ctx.sampleRate * 0.02 && size < 2048) size *= 2;   // quadro de ~20 ms
        an.fftSize = size; an.smoothingTimeConstant = 0;
        src.connect(an);                                      // NÃO conecta a ctx.destination: o microfone nunca sai nos alto-falantes
        const buf = new Float32Array(an.fftSize), det = createClapDetector({ sensitivity: opt.sensitivity });
        const every = Math.max(10, Math.floor((1000 * an.fftSize) / ctx.sampleRate * 0.95));
        timer = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          const r = det.push(buf, performance.now());
          if (debug() && r) console.log('[ORION] palma:', r);
          if (r === 'double' && opt.onDouble) opt.onDouble();
        }, every);
        stream.getAudioTracks().forEach(tr => tr.addEventListener('ended', () => { cleanup(); if (opt.onFault) opt.onFault('mic'); }));
        active = true;
        return true;
      } catch (e) {
        cleanup();
        if (opt.onFault) opt.onFault(e && e.name === 'NotAllowedError' ? 'denied' : 'mic');
        return false;
      } finally { starting = false; }
    }
    function stop() { cancelled = true; starting = false; cleanup(); }
    return { start, stop, isActive: () => active };
  }

  return { createClapDetector, createMicClap, DEFAULTS };
});
