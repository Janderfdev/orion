// Rodar na raiz do site:  node --test tests/gestures.test.js
// O detector é lógica pura: aqui ele recebe áudio SINTÉTICO (palmas, voz, música, batidas graves, ruído de sala).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClapDetector } = require('../pages/js/gestures.js');

const SR = 48000, FRAME = 1024, FRAME_MS = (FRAME / SR) * 1000;

// gerador pseudo-aleatório com semente (testes repetíveis)
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

function silence(sec, sigma = 0.01, seed = 1) {
  const r = rng(seed), out = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < out.length; i++) out[i] = r() * sigma * 1.7;
  return out;
}
/** soma uma palma (rajada de ruído que decai em ~6 ms) no instante tMs */
function addClap(sig, tMs, amp = 0.8, seed = 7) {
  const r = rng(seed + Math.round(tMs)), start = Math.round((tMs / 1000) * SR), tau = 0.006 * SR;
  for (let k = 0; k < tau * 6 && start + k < sig.length; k++) sig[start + k] += amp * Math.exp(-k / tau) * r();
}
function addTone(sig, f, amp, fromMs, toMs) {
  for (let i = Math.round(fromMs / 1000 * SR); i < Math.min(sig.length, Math.round(toMs / 1000 * SR)); i++) sig[i] += amp * Math.sin(2 * Math.PI * f * i / SR);
}
function addThump(sig, tMs, amp = 0.8) {                       // batida grave de mesa: 60 Hz que decai
  const start = Math.round(tMs / 1000 * SR);
  for (let k = 0; k < 0.08 * SR && start + k < sig.length; k++) sig[start + k] += amp * Math.exp(-k / (0.02 * SR)) * Math.sin(2 * Math.PI * 60 * k / SR);
}
function addSpeechLike(sig, fromMs, toMs, amp = 0.5, seed = 3) {  // sílabas ~150 ms: ruído modulado por envelope lento
  const r = rng(seed);
  for (let i = Math.round(fromMs / 1000 * SR); i < Math.min(sig.length, Math.round(toMs / 1000 * SR)); i++) {
    const t = i / SR, env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 6.5 * t);
    sig[i] += amp * env * (0.6 * r() + 0.4 * Math.sin(2 * Math.PI * 180 * t));
  }
}
function addNoise(sig, sigma, fromMs = 0, toMs = Infinity, seed = 9) {
  const r = rng(seed);
  for (let i = Math.round(fromMs / 1000 * SR); i < Math.min(sig.length, Math.round(toMs / 1000 * SR)); i++) sig[i] += r() * sigma * 1.7;
}

/** passa o sinal pelo detector em quadros de 1024 amostras. offset desloca o sinal (para testar palmas "no meio" de dois quadros). */
function run(sig, opts, offset = 0) {
  const det = createClapDetector(opts), events = [];
  for (let i = offset, n = 0; i + FRAME <= sig.length; i += FRAME, n++) {
    const r = det.push(sig.subarray(i, i + FRAME), n * FRAME_MS);
    if (r) events.push({ r, t: n * FRAME_MS });
  }
  return events;
}
const doubles = ev => ev.filter(e => e.r === 'double').length;

test('duas palmas (300 ms) acordam, uma vez só', () => {
  const s = silence(4); addClap(s, 1000); addClap(s, 1300);
  assert.equal(doubles(run(s)), 1);
});

test('funciona não importa onde a palma cai em relação aos quadros (varredura de 0 a 1023 amostras)', () => {
  for (let off = 0; off < FRAME; off += 61) {
    const s = silence(4); addClap(s, 1000); addClap(s, 1320);
    assert.equal(doubles(run(s, undefined, off)), 1, 'offset ' + off);
  }
});

test('uma palma sozinha não acorda', () => {
  const s = silence(4); addClap(s, 1000);
  assert.equal(doubles(run(s)), 0);
});

test('duas palmas com mais de 750 ms entre elas não acordam', () => {
  const s = silence(5); addClap(s, 1000); addClap(s, 2000);
  assert.equal(doubles(run(s)), 0);
});

test('duas palmas coladas (menos de 130 ms) não acordam', () => {
  const s = silence(4); addClap(s, 1000); addClap(s, 1070);
  assert.equal(doubles(run(s)), 0);
});

test('três palmas seguidas disparam UMA vez (pausa depois do gesto)', () => {
  const s = silence(5); addClap(s, 1000); addClap(s, 1300); addClap(s, 1600);
  assert.equal(doubles(run(s)), 1);
});

test('depois da pausa de 2,5 s o gesto vale de novo', () => {
  const s = silence(9); addClap(s, 1000); addClap(s, 1300); addClap(s, 5000); addClap(s, 5300);
  assert.equal(doubles(run(s)), 2);
  const s2 = silence(6); addClap(s2, 1000); addClap(s2, 1300); addClap(s2, 2200); addClap(s2, 2500);   // 2º par ainda dentro da pausa
  assert.equal(doubles(run(s2)), 1);
});

test('funciona em sala barulhenta (ruído de fundo 3x maior)', () => {
  const s = silence(4, 0.03); addClap(s, 1000, 0.9); addClap(s, 1300, 0.9);
  assert.equal(doubles(run(s)), 1);
});

test('palma fraca só é detectada com sensibilidade maior', () => {
  const s = silence(4); addClap(s, 1000, 0.12); addClap(s, 1300, 0.12);
  assert.equal(doubles(run(s)), 0);
  assert.equal(doubles(run(s, { sensitivity: 3 })), 1);
});

// ── o que NÃO pode acordar o ORION ──
test('tom contínuo alto (apito, zumbido) não acorda', () => {
  const s = silence(4); addTone(s, 440, 0.6, 500, 3500);
  assert.equal(doubles(run(s)), 0);
});

test('música/ruído alto contínuo não acorda', () => {
  const s = silence(4); addNoise(s, 0.3, 500, 3500);
  assert.equal(doubles(run(s)), 0);
});

test('fala (sílabas em sequência) não acorda, mesmo alta', () => {
  for (const amp of [0.3, 0.6, 0.9]) {
    const s = silence(5); addSpeechLike(s, 500, 4500, amp);
    assert.equal(doubles(run(s)), 0, 'amp ' + amp);
  }
});

test('batida grave (mesa, porta) duas vezes não acorda', () => {
  const s = silence(4); addThump(s, 1000); addThump(s, 1300);
  assert.equal(doubles(run(s)), 0);
});

test('silêncio e ruído baixo nunca disparam', () => {
  assert.equal(doubles(run(silence(30, 0.02))), 0);
});

test('palma no meio de música alta ainda não vira falso positivo (música sustentada mascara)', () => {
  const s = silence(4); addNoise(s, 0.25, 0, 4000); addClap(s, 1000, 0.6); addClap(s, 1300, 0.6);
  assert.ok(doubles(run(s)) <= 1);     // pode ou não detectar, mas nunca dispara mais de uma vez
});

test('entradas inválidas não quebram', () => {
  const det = createClapDetector();
  assert.equal(det.push([], 0), null);
  assert.equal(det.push(null, 0), null);
  assert.equal(det.push(new Float32Array(1024).fill(NaN), 0), null);
  assert.equal(det.push(new Float32Array(1024), NaN), null);
  assert.equal(det.push(new Float32Array(1024).fill(5), 10), null);   // saturado/constante: sem cruzamentos por zero
});

test('o ruído de fundo é aprendido só em quadros calmos', () => {
  const det = createClapDetector(); const s = silence(3, 0.02);
  for (let i = 0; i + FRAME <= s.length; i += FRAME) det.push(s.subarray(i, i + FRAME), (i / FRAME) * FRAME_MS);
  assert.ok(det.floor > 0.01 && det.floor < 0.04, String(det.floor));
});
