import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evFraction,
  minValueOdd,
  kellyFraction,
  stakeKelly,
  impliedProb,
  deMarginTwoWay,
  clvPct,
  beatClose,
} from '../web/src/finance.js';

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

// EV por unidade de stake = p*odds - 1
test('evFraction: EV positivo quando prob supera a odd implícita', () => {
  approx(evFraction(0.6, 2.0), 0.2);
});

test('evFraction: EV negativo quando não há valor', () => {
  approx(evFraction(0.4, 2.0), -0.2);
});

// Odd-alvo mínima para atingir um EV mínimo (limiar de valor)
test('minValueOdd: odd mínima para EV >= limiar', () => {
  // (1 + 0.05) / 0.5 = 2.1
  approx(minValueOdd(0.5, 0.05), 2.1);
});

// Fração de Kelly = (p*odds - 1) / (odds - 1)
test('kellyFraction: calcula a fração ótima com edge', () => {
  // (0.6*2 - 1) / (2 - 1) = 0.2
  approx(kellyFraction(0.6, 2.0), 0.2);
});

test('kellyFraction: retorna 0 quando não há edge (nunca aposta no negativo)', () => {
  approx(kellyFraction(0.5, 2.0), 0);
  approx(kellyFraction(0.4, 2.0), 0);
});

// Stake sugerido = banca * kelly * fração, com teto e piso 0
test('stakeKelly: aplica fração de Kelly sobre a banca', () => {
  // kelly 0.2 * fração 0.25 = 0.05 → 1000 * 0.05 = 50
  approx(stakeKelly({ bankroll: 1000, p: 0.6, odds: 2.0, fraction: 0.25 }), 50);
});

test('stakeKelly: respeita o teto (% máx por operação)', () => {
  // sem teto daria 50; com teto de 3% (=30) trava em 30
  approx(stakeKelly({ bankroll: 1000, p: 0.6, odds: 2.0, fraction: 0.25, capFraction: 0.03 }), 30);
});

test('stakeKelly: nunca sugere stake negativo', () => {
  approx(stakeKelly({ bankroll: 1000, p: 0.4, odds: 2.0, fraction: 0.25 }), 0);
});

// Probabilidade implícita bruta (com margem)
test('impliedProb: 1/odds', () => {
  approx(impliedProb(2.0), 0.5);
  approx(impliedProb(4.0), 0.25);
});

// Remove a margem (overround) de um mercado de 2 vias → probabilidades justas
test('deMarginTwoWay: normaliza para somar 1', () => {
  const [pa, pb] = deMarginTwoWay(1.5, 2.5);
  // 1/1.5=0.6667, 1/2.5=0.4, soma 1.0667 → 0.625 / 0.375
  approx(pa, 0.625, 1e-6);
  approx(pb, 0.375, 1e-6);
  approx(pa + pb, 1, 1e-9);
});

// CLV: peguei preço melhor que o fechamento? (back)
test('clvPct: positivo quando a odd pega é maior que a de fechamento', () => {
  approx(clvPct(2.1, 2.0), 5, 1e-9); // 5%
});

test('clvPct: negativo quando a odd pega é pior que a de fechamento', () => {
  approx(clvPct(1.9, 2.0), -5, 1e-9);
});

test('beatClose: verdadeiro só quando bateu o fechamento', () => {
  assert.equal(beatClose(2.1, 2.0), true);
  assert.equal(beatClose(1.9, 2.0), false);
  assert.equal(beatClose(2.0, 2.0), false);
});
