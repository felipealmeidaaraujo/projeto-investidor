import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blendedRating,
  matchProbability,
  marginLabel,
  surfaceRead,
  confidenceLevel,
  analyzeMatch,
  buildReadingExplanation,
  serveBand,
} from '../web/src/analysis.js';
import { ageAdjusted } from '../web/src/age-curve.js';

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

// Fixtures para a explicação da leitura
const alcaraz = { name: 'Alcaraz', elo: 2085, clay: 2145, hard: 2085, grass: 2085, matches: 300, matchesBySurface: { clay: 120, hard: 120, grass: 60 } };
const sinner = { name: 'Sinner', elo: 2110, clay: 2065, hard: 2130, grass: 2100, matches: 300, matchesBySurface: { clay: 100, hard: 130, grass: 70 } };
const clayKing = { name: 'ClayKing', elo: 2100, clay: 2160, hard: 2050, grass: 2040, matches: 300, matchesBySurface: { clay: 150, hard: 100, grass: 50 } };
const rival = { name: 'Rival', elo: 2000, clay: 1990, hard: 2010, grass: 2005, matches: 300, matchesBySurface: { clay: 90, hard: 120, grass: 60 } };
const novato = { name: 'Novato', elo: 1900, hard: 1900, grass: 1900, matches: 40, matchesBySurface: { hard: 30, grass: 10 } };

test('buildReadingExplanation: inversão — Sinner tem Elo geral maior mas Alcaraz vence no saibro', () => {
  const ex = buildReadingExplanation(analyzeMatch(alcaraz, sinner, 'clay', model));
  assert.equal(ex.flipped, true);
  assert.ok(ex.elo.includes('Sinner') && ex.elo.includes('2110') && ex.elo.includes('vem à frente'));
  assert.ok(ex.piso.includes('a mão vira') && ex.piso.includes('Alcaraz 2145'));
  assert.ok(ex.forca.includes('favorito é Alcaraz') && ex.forca.includes('53%') && ex.forca.includes('mesmo tendo Elo geral menor'));
  assert.ok(ex.delta.includes('Alcaraz (+60) forte') && ex.delta.includes('Sinner (−45) fraco'));
});

test('buildReadingExplanation: sem inversão + neutro — piso reforça o favorito', () => {
  const ex = buildReadingExplanation(analyzeMatch(clayKing, rival, 'clay', model));
  assert.equal(ex.flipped, false);
  assert.ok(ex.piso.includes('reforça o favorito'));
  assert.ok(ex.delta.includes('ClayKing (+60) forte'));
  assert.ok(ex.delta.includes('Rival joga em linha com o próprio nível'));
});

test('buildReadingExplanation: azarão tem piso maior mas não vira a mão', () => {
  const bigElo = { name: 'BigElo', elo: 2300, clay: 2150, hard: 2320, grass: 2300, matches: 400, matchesBySurface: { clay: 100, hard: 200, grass: 100 } };
  const clayLover = { name: 'ClayLover', elo: 2180, clay: 2185, hard: 2170, grass: 2170, matches: 400, matchesBySurface: { clay: 200, hard: 120, grass: 80 } };
  const ex = buildReadingExplanation(analyzeMatch(bigElo, clayLover, 'clay', model));
  assert.equal(ex.flipped, false);
  assert.ok(ex.forca.includes('favorito é BigElo'));
  assert.ok(ex.piso.includes('ClayLover 2185') && ex.piso.includes('o piso favorece o azarão, mas não vira a mão'));
});

test('buildReadingExplanation: piso ausente cai no Elo geral', () => {
  const ex = buildReadingExplanation(analyzeMatch(clayKing, novato, 'clay', model));
  assert.ok(ex.piso.includes('Novato') && ex.piso.includes('não há um Elo de piso confiável'));
  assert.ok(ex.delta.includes('Novato tem poucos jogos no saibro'));
});

test('buildReadingExplanation: empate no Elo geral', () => {
  const gemeoA = { name: 'GA', elo: 2000, clay: 2050, hard: 2000, grass: 2000, matches: 200, matchesBySurface: { clay: 80, hard: 80, grass: 40 } };
  const gemeoB = { name: 'GB', elo: 2000, clay: 1980, hard: 2000, grass: 2000, matches: 200, matchesBySurface: { clay: 80, hard: 80, grass: 40 } };
  const ex = buildReadingExplanation(analyzeMatch(gemeoA, gemeoB, 'clay', model));
  assert.ok(ex.elo.includes('empatados no Elo geral (2000)'));
});

test('serveBand: mesma devolução, banda diferente por circuito', () => {
  // 0.42 de devolução: no ATP é elite (limiar 0.40); na WTA é só "na média" (mediana 0.431)
  assert.deepEqual(serveBand('ATP', 'returnPtsWonPct', 0.42), { band: 'elite', label: 'elite' });
  assert.deepEqual(serveBand('WTA', 'returnPtsWonPct', 0.42), { band: 'mid', label: 'na média' });
  assert.deepEqual(serveBand('WTA', 'returnPtsWonPct', 0.46), { band: 'elite', label: 'elite' });
});
test('serveBand: bandas high/low e casos nulos', () => {
  assert.deepEqual(serveBand('ATP', 'acePct', 0.12), { band: 'elite', label: 'elite' });
  assert.deepEqual(serveBand('WTA', 'servePtsWonPct', 0.50), { band: 'low', label: 'abaixo da média' });
  assert.deepEqual(serveBand('ATP', 'servePtsWonPct', 0.65), { band: 'high', label: 'acima da média' });
  assert.equal(serveBand('ATP', 'servePtsWonPct', 0), null);
  assert.equal(serveBand('ATP', 'chaveInexistente', 0.5), null);
  assert.equal(serveBand('XYZ', 'acePct', 0.1), null);
});

// Curva de idade ligada ao confronto (Task 2)
const jovem = { name: 'Jovem A.', elo: 2000, hard: 2000, clay: 2000, grass: 2000, matches: 100, bio: { age: 20 } };
const veterano = { name: 'Veterano B.', elo: 2000, hard: 2000, clay: 2000, grass: 2000, matches: 100, bio: { age: 33 } };

test('analyzeMatch: aplica a curva de idade e conta que aplicou (ATP)', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  // Elos iguais -> 50% cru. Com 13 anos de gap, o mais novo sobe.
  assert.ok(r.probA > 0.5, `esperava > 0,5, veio ${r.probA}`);
  assert.equal(r.ageAdjust.adjusted, true);
  assert.equal(r.ageAdjust.gap, 13);
  assert.ok(r.ageAdjust.base < r.probA, 'a base tem que ser menor que a ajustada');
});

test('analyzeMatch: probA + probB continua 1 depois do ajuste', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  assert.ok(Math.abs(r.probA + r.probB - 1) < 1e-9, `soma deu ${r.probA + r.probB}`);
});

test('analyzeMatch: a odd justa acompanha a probabilidade ajustada', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  assert.ok(Math.abs(r.fairOddA - 1 / r.probA) < 1e-9);
  assert.ok(Math.abs(r.fairOddB - 1 / r.probB) < 1e-9);
});

test('analyzeMatch: o favorito é decidido DEPOIS do ajuste', () => {
  // Elos iguais: sem ajuste ninguém é favorito (50/50). Com o ajuste, o mais novo é.
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  assert.equal(r.favorite, 'Jovem A.');
});

test('analyzeMatch: WTA não é ajustada', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.25, tour: 'WTA' });
  assert.equal(r.ageAdjust.adjusted, false);
  assert.ok(Math.abs(r.probA - 0.5) < 1e-9, `WTA não devia mexer, veio ${r.probA}`);
});

test('analyzeMatch: jogador sem bio não estoura e não ajusta', () => {
  const semBio = { name: 'Sem Bio C.', elo: 2000, hard: 2000, clay: 2000, grass: 2000, matches: 100 };
  const r = analyzeMatch(semBio, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  assert.equal(r.ageAdjust.adjusted, false);
  assert.ok(Number.isFinite(r.probA));
});

test('analyzeMatch: model sem tour não ajusta (não assume ATP)', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15 });
  assert.equal(r.ageAdjust.adjusted, false);
});
