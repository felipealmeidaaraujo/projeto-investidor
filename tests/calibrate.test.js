import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sigmoid, logit, calibrate, fitTemperature } from '../pipeline/calibrate.js';
import { logLoss } from '../pipeline/metrics.js';

const approx = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

test('sigmoid e logit são inversos', () => {
  approx(sigmoid(0), 0.5);
  approx(sigmoid(logit(0.73)), 0.73);
});

test('calibrate com T=1 é identidade', () => {
  approx(calibrate(0.8, 1), 0.8);
});

test('calibrate: T>1 suaviza (aproxima de 50%); T<1 acentua', () => {
  assert.ok(calibrate(0.9, 1.5) < 0.9);
  assert.ok(calibrate(0.9, 0.7) > 0.9);
});

test('fitTemperature: dataset superconfiante → T>1 e melhora o log-loss', () => {
  const preds = [];
  for (let i = 0; i < 100; i++) preds.push({ p: 0.9, outcome: i < 70 ? 1 : 0 }); // diz 90%, acontece 70%
  for (let i = 0; i < 100; i++) preds.push({ p: 0.1, outcome: i < 30 ? 1 : 0 });

  const T = fitTemperature(preds);
  assert.ok(T > 1, `esperava T>1, veio ${T}`);

  const antes = logLoss(preds);
  const depois = logLoss(preds.map(({ p, outcome }) => ({ p: calibrate(p, T), outcome })));
  assert.ok(depois < antes, `log-loss deveria melhorar (${depois} < ${antes})`);
});
