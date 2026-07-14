import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logLoss, brier, accuracy, calibrationBins } from '../pipeline/metrics.js';

const approx = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

test('logLoss: prob 0.5 → ln(2) ≈ 0.693', () => {
  approx(logLoss([{ p: 0.5, outcome: 1 }]), Math.LN2);
});
test('logLoss: previsão perfeita → ~0 (com clamp evitando log(0))', () => {
  approx(logLoss([{ p: 1, outcome: 1 }]), 0, 1e-10);
});
test('logLoss: previsão confiante e errada é fortemente punida', () => {
  assert.ok(logLoss([{ p: 0.01, outcome: 1 }]) > 4);
});

test('brier: 0.5 → 0.25; perfeito → 0; errado extremo → 1', () => {
  approx(brier([{ p: 0.5, outcome: 1 }]), 0.25);
  approx(brier([{ p: 1, outcome: 1 }]), 0);
  approx(brier([{ p: 0, outcome: 1 }]), 1);
});

test('accuracy: acerto usando 0.5 como corte', () => {
  approx(accuracy([{ p: 0.6, outcome: 1 }, { p: 0.4, outcome: 1 }]), 0.5);
});

test('calibrationBins: agrupa por faixa de probabilidade', () => {
  const bins = calibrationBins(
    [{ p: 0.05, outcome: 0 }, { p: 0.95, outcome: 1 }, { p: 0.92, outcome: 1 }],
    10
  );
  assert.equal(bins[0].count, 1); // faixa 0.0–0.1
  assert.equal(bins[9].count, 2); // faixa 0.9–1.0
  approx(bins[9].avgOutcome, 1);
});
