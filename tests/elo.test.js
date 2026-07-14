import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedScore, kFactor, updateRating, blendSurface } from '../pipeline/elo.js';

const approx = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

// Probabilidade de vitória pela diferença de Elo (logística base 10, escala 400)
test('expectedScore: mesma força → 50%', () => {
  approx(expectedScore(1500, 1500), 0.5);
});
test('expectedScore: +256 de Elo ≈ 81,4% (best-of-3)', () => {
  approx(expectedScore(1756, 1500), 0.814, 2e-3);
});
test('expectedScore: é simétrico (soma 1)', () => {
  approx(expectedScore(1756, 1500) + expectedScore(1500, 1756), 1);
});

// K-factor decrescente (FiveThirtyEight): 250/(m+5)^0.4
test('kFactor: valor para jogador novato (m=0) ≈ 131,3', () => {
  approx(kFactor(0), 131.32, 0.1);
});
test('kFactor: diminui conforme o jogador acumula partidas', () => {
  assert.ok(kFactor(100) < kFactor(10));
  assert.ok(kFactor(10) < kFactor(0));
});

// Atualização de rating: novo = antigo + K*(resultado - esperado)
test('updateRating: vencedor sobe, perdedor desce simetricamente', () => {
  approx(updateRating(1500, 1, 0.5, 32), 1516);
  approx(updateRating(1500, 0, 0.5, 32), 1484);
});
test('updateRating: bater um favorito rende mais pontos', () => {
  const zebra = updateRating(1500, 1, 0.2, 32); // esperava 20%, ganhou
  approx(zebra, 1500 + 32 * 0.8);
});

// Blend geral + superfície (default 50/50)
test('blendSurface: 50/50 é a média', () => {
  approx(blendSurface(1500, 1600, 0.5), 1550);
});
test('blendSurface: peso configurável (ex.: 0.29 na superfície, estilo 538 para dura)', () => {
  approx(blendSurface(1500, 1600, 0.29), 1529);
});
