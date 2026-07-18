import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFingerprint, hashStr } from '../pipeline/engine-fingerprint.js';
import { ENGINE_FP_MEDIDO as FP_IDADE } from '../web/src/age-curve.js';
import { ENGINE_FP_MEDIDO as FP_DECAY } from '../web/src/decay-curve.js';

test('hashStr: determinístico — mesma entrada, mesmo hash', () => {
  assert.equal(hashStr('teste'), hashStr('teste'));
});
test('hashStr: sensível — entradas diferentes dão hashes diferentes', () => {
  assert.notEqual(hashStr('a'), hashStr('b'));
  assert.notEqual(hashStr('1.5000000000|2.5000000000'), hashStr('1.5000000000|2.6000000000'));
});
test('hashStr: hex de 8 caracteres', () => {
  assert.match(hashStr('qualquer'), /^[0-9a-f]{8}$/);
});
test('engineFingerprint: determinístico (duas chamadas iguais)', () => {
  assert.equal(engineFingerprint(), engineFingerprint());
});
test('engineFingerprint: hex de 8 caracteres não-vazio', () => {
  assert.match(engineFingerprint(), /^[0-9a-f]{8}$/);
});

const fpAtual = engineFingerprint();
const msg = (curva, coef, spec) =>
  `O motor Elo mudou. O ${coef} em web/src/${curva} foi calibrado contra o motor ANTIGO e ` +
  `provavelmente está obsoleto. REFAÇA a medição (docs/superpowers/specs/${spec}) e atualize ` +
  `ENGINE_FP_MEDIDO para '${fpAtual}'.`;

test('guarda-corpo: AGE_COEF foi medido contra o motor Elo atual', () => {
  assert.equal(FP_IDADE, fpAtual, msg('age-curve.js', 'AGE_COEF', '2026-07-17-vies-idade-elo-design.md'));
});
test('guarda-corpo: DECAY_COEF foi medido contra o motor Elo atual', () => {
  assert.equal(FP_DECAY, fpAtual, msg('decay-curve.js', 'DECAY_COEF', '2026-07-18-decay-inatividade-design.md'));
});
