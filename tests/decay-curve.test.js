import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inatividadeDias, decayAdjusted, decayAdjustText } from '../web/src/decay-curve.js';

test('inatividadeDias: 1/jan a 1/abr de 2026 = 90 dias', () => {
  assert.equal(inatividadeDias(20260401, 20260101), 90);
});
test('inatividadeDias: sem lastDate (null ou 0) devolve null', () => {
  assert.equal(inatividadeDias(20260401, null), null);
  assert.equal(inatividadeDias(20260401, 0), null);
  assert.equal(inatividadeDias(null, 20260101), null);
});

test('decayAdjusted: A volta de 6 meses (oponente fresco) PERDE probabilidade (ATP)', () => {
  const r = decayAdjusted(0.5, 180, 0, 'ATP'); // f(180)=90/365=0,2466; termo=-0,2466
  assert.equal(r.adjusted, true);
  assert.ok(r.prob < 0.5, `esperava < 0,5, veio ${r.prob}`);
  assert.ok(Math.abs(r.prob - 0.4692) < 0.002, `esperava ~0,469, veio ${r.prob}`);
  assert.equal(r.base, 0.5);
});

test('decayAdjusted: ANTISSIMETRIA — p(A,B) + p(B,A) = 1', () => {
  for (const [p, ia, ib] of [[0.5, 180, 0], [0.7, 300, 40], [0.35, 0, 500]]) {
    const ab = decayAdjusted(p, ia, ib, 'ATP');
    const ba = decayAdjusted(1 - p, ib, ia, 'ATP');
    assert.ok(Math.abs(ab.prob + ba.prob - 1) < 1e-9, `soma ${ab.prob + ba.prob}`);
  }
});

test('decayAdjusted: inatividade < 90 dias não mexe (rampa começa em 90)', () => {
  const r = decayAdjusted(0.6, 80, 10, 'ATP');
  assert.equal(r.adjusted, false);
  assert.equal(r.prob, 0.6);
});

test('decayAdjusted: mesma inatividade nos dois lados não mexe', () => {
  const r = decayAdjusted(0.6, 200, 200, 'ATP');
  assert.equal(r.adjusted, false);
});

test('decayAdjusted: WTA não é ajustada (coef 0)', () => {
  const r = decayAdjusted(0.5, 300, 0, 'WTA');
  assert.equal(r.adjusted, false);
  assert.equal(r.prob, 0.5);
});

test('decayAdjusted: inatividade nula/ausente não estoura', () => {
  const r = decayAdjusted(0.5, null, null, 'ATP');
  assert.equal(r.adjusted, false);
});

test('decayAdjusted: probabilidade inválida devolve null', () => {
  assert.equal(decayAdjusted(null, 200, 0, 'ATP'), null);
});

test('decayAdjustText: nomeia quem volta, os meses e a prob sem o ajuste', () => {
  const r = decayAdjusted(0.5, 240, 0, 'ATP'); // A parado 8 meses; A é o mais parado
  const t = decayAdjustText(r, 'Fonseca J.');
  assert.ok(t.includes('Fonseca J.'), t);
  assert.ok(t.includes('8 meses'), t);       // 240/30 = 8
  assert.ok(t.includes('50,0%'), t);         // base do mais parado (A) = 0,5
  assert.ok(/inatividade/i.test(t), t);
});
test('decayAdjustText: sem ajuste não gera linha', () => {
  assert.equal(decayAdjustText(decayAdjusted(0.5, 200, 200, 'ATP'), 'A'), null);
  assert.equal(decayAdjustText(null, 'A'), null);
});
