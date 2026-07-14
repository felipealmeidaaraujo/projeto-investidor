import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blendedRating,
  matchProbability,
  marginLabel,
  surfaceRead,
  confidenceLevel,
  analyzeMatch,
} from '../web/src/analysis.js';

const approx = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

const nadal = { name: 'Rafael Nadal', elo: 2048, hard: 1994, clay: 2135, grass: 1929, matches: 900, matchesBySurface: { hard: 450, clay: 350, grass: 100 } };
const federer = { name: 'Roger Federer', elo: 2111, hard: 2138, clay: 1958, grass: 2046, matches: 900, matchesBySurface: { hard: 500, clay: 250, grass: 150 } };
const model = { calibrationT: 1.22 };

test('blendedRating: média 50/50 entre geral e superfície', () => {
  approx(blendedRating(nadal, 'clay'), 2091.5);
});
test('blendedRating: superfície ausente usa o Elo geral', () => {
  approx(blendedRating({ elo: 2000 }, 'clay'), 2000);
});

test('matchProbability: Nadal favorito no saibro; Federer favorito na grama', () => {
  assert.ok(matchProbability(nadal, federer, 'clay', model.calibrationT) > 0.5);
  assert.ok(matchProbability(nadal, federer, 'grass', model.calibrationT) < 0.5);
});

test('marginLabel: rótulos por faixa de probabilidade do favorito', () => {
  assert.equal(marginLabel(0.52), 'equilibrado');
  assert.equal(marginLabel(0.6), 'leve favorito');
  assert.equal(marginLabel(0.7), 'favorito claro');
  assert.equal(marginLabel(0.85), 'favoritão');
});

test('surfaceRead: forte no saibro, fraco na grama', () => {
  assert.equal(surfaceRead(nadal, 'clay').tag, 'forte');
  assert.equal(surfaceRead(nadal, 'grass').tag, 'fraco');
});
test('surfaceRead: poucos dados quando há poucas partidas na superfície', () => {
  assert.equal(surfaceRead({ elo: 1800, grass: 1600, matchesBySurface: { grass: 5 } }, 'grass').tag, 'poucos dados');
});

test('confidenceLevel: alta com muitos jogos', () => {
  assert.equal(confidenceLevel(nadal, federer, 'clay').level, 'alta');
});
test('confidenceLevel: baixa quando um jogador tem poucos jogos', () => {
  const novato = { elo: 1600, matches: 12, matchesBySurface: { clay: 5 } };
  assert.equal(confidenceLevel(nadal, novato, 'clay').level, 'baixa');
});

test('analyzeMatch: compõe a leitura completa do confronto', () => {
  const r = analyzeMatch(nadal, federer, 'clay', model);
  assert.equal(r.favorite, 'Rafael Nadal');
  assert.ok(r.probA > 0.5);
  approx(r.probA + r.probB, 1);
  assert.equal(r.a.surfaceRead.tag, 'forte');
  assert.equal(r.b.surfaceRead.tag, 'fraco');
  assert.ok(typeof r.marginLabel === 'string');
  approx(r.fairOddA, 1 / r.probA);
});
