import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFingerprint, hashStr } from '../pipeline/engine-fingerprint.js';

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
