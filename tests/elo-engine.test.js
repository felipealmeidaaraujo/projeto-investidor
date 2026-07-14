import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EloEngine } from '../pipeline/elo-engine.js';

const approx = (a, b, eps = 0.01) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

test('jogadores novos têm 50% entre si', () => {
  const e = new EloEngine();
  approx(e.predict('A', 'B', 'hard'), 0.5);
});

test('processa uma vitória: vencedor sobe, perdedor desce (geral e superfície)', () => {
  const e = new EloEngine();
  e.processMatch({ winner: 'A', loser: 'B', surface: 'hard' });
  const a = e.getState('A');
  const b = e.getState('B');
  // K(0)=131.32, expected 0.5 → ±65.66
  approx(a.overall, 1565.66, 0.1);
  approx(b.overall, 1434.34, 0.1);
  approx(a.surfaces.hard, 1565.66, 0.1);
  approx(b.surfaces.hard, 1434.34, 0.1);
  assert.equal(a.matches, 1);
});

test('superfícies são independentes: jogo no hard não mexe no saibro', () => {
  const e = new EloEngine();
  e.processMatch({ winner: 'A', loser: 'B', surface: 'hard' });
  const a = e.getState('A');
  assert.ok(a.surfaces.hard > 1500);
  assert.equal(a.surfaces.clay, undefined); // saibro nunca foi atualizado
});

test('após vitória, o favorito tem prob > 50% no confronto', () => {
  const e = new EloEngine();
  e.processMatch({ winner: 'A', loser: 'B', surface: 'hard' });
  assert.ok(e.predict('A', 'B', 'hard') > 0.5);
});

test('K menor após muitas partidas: ratings movem menos', () => {
  const e = new EloEngine();
  // aquece o A com muitas vitórias contra oponentes neutros
  for (let i = 0; i < 50; i++) e.processMatch({ winner: 'A', loser: 'sparring' + i, surface: 'hard' });
  const before = e.getState('A').overall;
  e.processMatch({ winner: 'A', loser: 'novato', surface: 'hard' });
  const delta = e.getState('A').overall - before;
  assert.ok(delta < 20, `movimento deveria ser pequeno, veio ${delta}`);
});
