import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdProb, winProbFromState, impliedServeProbs, liveFairOdds, overreaction } from '../web/src/inplay.js';

const approx = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

const START = { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true };

// --- hold (manter o saque) ---
test('holdProb: saque 50% no ponto → 50% de manter', () => {
  approx(holdProb(0.5), 0.5);
});
test('holdProb: saque 60% no ponto → ~73,6% de manter', () => {
  approx(holdProb(0.6), 0.7357, 2e-3);
});
test('holdProb: saque perfeito mantém sempre; nulo nunca', () => {
  approx(holdProb(1), 1);
  approx(holdProb(0), 0);
});

// --- partida (simetria, limites, monotonicidade) ---
test('winProbFromState: jogadores iguais no início → 50%', () => {
  approx(winProbFromState(START, 0.64, 0.64, 3), 0.5, 5e-3);
});
test('winProbFromState: partida já decidida → 1 (ou 0)', () => {
  assert.equal(winProbFromState({ ...START, setsA: 2 }, 0.6, 0.6, 3), 1);
  assert.equal(winProbFromState({ ...START, setsB: 2 }, 0.6, 0.6, 3), 0);
});
test('winProbFromState: saque melhor → mais chance', () => {
  assert.ok(winProbFromState(START, 0.7, 0.6, 3) > 0.5);
});

// --- a quebra vale (dinâmica ao vivo) ---
test('winProbFromState: quebrado à frente (1-0 sacando) favorece, mesmo entre iguais', () => {
  const upBreak = { setsA: 0, setsB: 0, gamesA: 1, gamesB: 0, serverIsA: true };
  assert.ok(winProbFromState(upBreak, 0.64, 0.64, 3) > 0.52);
});

// --- deriva a força de saque a partir da prob pré-jogo (consistência) ---
test('impliedServeProbs: recupera a probabilidade alvo no início do jogo', () => {
  const { pA, pB } = impliedServeProbs(0.75, { base: 0.64, bestOf: 3 });
  approx(winProbFromState(START, pA, pB, 3), 0.75, 6e-3);
});

test('liveFairOdds: no início ≈ odd justa pré-jogo', () => {
  const r = liveFairOdds(0.5, START, { base: 0.64, bestOf: 3 });
  approx(r.probA, 0.5, 5e-3);
  approx(r.fairOddA, 2.0, 3e-2);
  approx(r.probA + r.probB, 1);
});

test('liveFairOdds: placar favorável baixa a odd do líder', () => {
  const led = liveFairOdds(0.5, { setsA: 1, setsB: 0, gamesA: 3, gamesB: 0, serverIsA: true }, { base: 0.64, bestOf: 3 });
  assert.ok(led.probA > 0.5);       // A na frente → mais provável
  assert.ok(led.fairOddA < 2.0);    // odd justa de A cai
});

test('overreaction: mercado paga mais que o justo → back; níveis conservadores', () => {
  const r = overreaction(2.0, 2.4); // +20% → leve, back
  approx(r.divPct, 20); assert.equal(r.level, 'leve'); assert.equal(r.back, true);
  assert.equal(overreaction(2.0, 2.6).level, 'moderada'); // +30%
  assert.equal(overreaction(2.0, 3.0).level, 'forte'); // +50%
});

test('overreaction: mercado paga menos → lay; abaixo de 15% → em linha (level null)', () => {
  const r = overreaction(2.0, 1.5); // -25% → moderada, lay
  assert.equal(r.back, false); assert.equal(r.level, 'moderada');
  assert.equal(overreaction(2.0, 2.2).level, null); // +10% → em linha
});

test('overreaction: entradas inválidas → null', () => {
  assert.equal(overreaction(1, 2.0), null);
  assert.equal(overreaction(2.0, null), null);
  assert.equal(overreaction(2.0, 0.9), null);
  assert.equal(overreaction(Infinity, 2.0), null);
});
