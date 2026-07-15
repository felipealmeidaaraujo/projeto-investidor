import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPlayers } from '../web/src/player-search.js';

const PLAYERS = [
  { name: 'Sinner J.', fullName: 'Jannik Sinner', elo: 2548, active: true },
  { name: 'Alcaraz C.', fullName: 'Carlos Alcaraz', elo: 2500, active: true },
  { name: 'Velho X.', elo: 1800, active: false },
];

test('searchPlayers: só ativos, mantém a ordem do modelo (por Elo)', () => {
  const r = searchPlayers(PLAYERS, '');
  assert.equal(r.length, 2);
  assert.equal(r[0].name, 'Sinner J.');
});

test('searchPlayers: filtra por nome do modelo ou nome completo', () => {
  assert.equal(searchPlayers(PLAYERS, 'alcaraz')[0].name, 'Alcaraz C.');
  assert.equal(searchPlayers(PLAYERS, 'jannik')[0].name, 'Sinner J.');
});

test('searchPlayers: respeita o limite', () => {
  assert.equal(searchPlayers(PLAYERS, '', 1).length, 1);
});
