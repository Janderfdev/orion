// Rodar na raiz do site:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../seasonal-logo.js');
const at = iso => Date.parse(iso);

test('Páscoa: datas conhecidas (gregoriano)', () => {
  const known = { 2024: [2, 31], 2025: [3, 20], 2026: [3, 5], 2027: [2, 28], 2028: [3, 16], 2029: [3, 1], 2030: [3, 21], 2038: [3, 25] };
  for (const [y, [m, d]] of Object.entries(known)) assert.deepEqual(S.easterDate(+y), { m, d }, 'ano ' + y);
});

test('Natal: fronteiras exatas em Brasília', () => {
  assert.equal(S.currentTheme(at('2026-11-30T23:59:59-03:00')), 'original');
  assert.equal(S.currentTheme(at('2026-12-01T00:00:00-03:00')), 'christmas');
  assert.equal(S.currentTheme(at('2026-12-31T23:59:59-03:00')), 'christmas');
  assert.equal(S.currentTheme(at('2027-01-01T00:00:00-03:00')), 'original');
});

test('Páscoa 2027: Ramos 21/03 00:00 até segunda 29/03 00:00', () => {
  assert.equal(S.currentTheme(at('2027-03-20T23:59:59-03:00')), 'original');
  assert.equal(S.currentTheme(at('2027-03-21T00:00:00-03:00')), 'easter');   // Domingo de Ramos
  assert.equal(S.currentTheme(at('2027-03-28T23:59:59-03:00')), 'easter');   // Domingo de Páscoa, inclusive
  assert.equal(S.currentTheme(at('2027-03-29T00:00:00-03:00')), 'original'); // segunda-feira
});

test('não depende do fuso do aparelho', () => {
  assert.equal(S.currentTheme(at('2026-11-30T22:30:00-05:00')), 'christmas');   // = 01/12 00:30 em Brasília
  assert.equal(S.currentTheme(at('2026-11-30T21:30:00-05:00')), 'original');    // = 30/11 23:30 em Brasília
  assert.equal(S.currentTheme(at('2027-01-01T02:30:00Z')), 'christmas');        // = 31/12 23:30 em Brasília
});

test('virada de ano em UTC não antecipa o fim do Natal', () => {
  assert.equal(S.currentTheme(at('2027-01-01T00:00:00Z')), 'christmas');   // ainda 31/12 21:00 em Brasília
  assert.equal(S.currentTheme(at('2027-01-01T03:00:00Z')), 'original');    // 00:00 em Brasília
});

test('períodos nunca se sobrepõem; Ramos é domingo e o fim é segunda (2024–2100)', () => {
  for (let y = 2024; y <= 2100; y++) {
    const p = S.periods(y);
    assert.ok(p.easter.end <= p.christmas.start, 'Páscoa termina antes do Natal em ' + y);
    assert.ok(p.easter.start < p.easter.end);
    assert.equal(new Date(p.easter.start - 3 * 3600000).getUTCDay(), 0, 'Ramos é domingo em ' + y);
    assert.equal(new Date(p.easter.end - 3 * 3600000).getUTCDay(), 1, 'fim é segunda em ' + y);
  }
});

test('nextChange aponta a próxima fronteira', () => {
  assert.equal(S.nextChange(at('2026-11-09T12:00:00-03:00')), at('2026-12-01T00:00:00-03:00'));
  assert.equal(S.nextChange(at('2026-12-15T12:00:00-03:00')), at('2027-01-01T00:00:00-03:00'));
  assert.equal(S.nextChange(at('2027-01-05T12:00:00-03:00')), at('2027-03-21T00:00:00-03:00'));
});

test('arquivos', () => {
  assert.equal(S.logoFile('christmas'), 'orion_ai_christmas.png');
  assert.equal(S.logoFile('easter'), 'orion_ai_easter.png');
  assert.equal(S.logoFile('qualquer'), 'orion_ai_logo.png');
});
