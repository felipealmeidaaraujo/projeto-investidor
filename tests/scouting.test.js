import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentForm, restDays, headToHead } from '../web/src/scouting.js';

const M = [
  { date: 20260701, surface: 'clay', tour: 'ATP', winner: 'Alcaraz C.', loser: 'Sinner J.' },
  { date: 20260610, surface: 'clay', tour: 'ATP', winner: 'Alcaraz C.', loser: 'Zverev A.' },
  { date: 20260520, surface: 'hard', tour: 'ATP', winner: 'Sinner J.', loser: 'Alcaraz C.' },
  { date: 20260410, surface: 'grass', tour: 'ATP', winner: 'Zverev A.', loser: 'Alcaraz C.' },
];

test('recentForm: últimas partidas do jogador, mais recente primeiro', () => {
  const f = recentForm(M, 'Alcaraz C.', 10);
  assert.equal(f.wins, 2);
  assert.equal(f.losses, 2);
  assert.equal(f.results.length, 4);
  assert.equal(f.results[0].date, 20260701);
  assert.equal(f.results[0].won, true);
  assert.equal(f.results[0].opp, 'Sinner J.');
  assert.equal(f.results[2].won, false); // 20260520 perdeu pro Sinner
});

test('recentForm: respeita o limite n', () => {
  assert.equal(recentForm(M, 'Alcaraz C.', 2).results.length, 2);
  assert.equal(recentForm(M, 'Ninguém X.', 10).results.length, 0);
});

test('restDays: dias desde a última partida', () => {
  assert.equal(restDays(M, 'Alcaraz C.', 20260705), 4); // última em 20260701
  assert.equal(restDays(M, 'Ninguém X.', 20260705), null);
});

test('headToHead: placar geral, por superfície e último', () => {
  const h = headToHead(M, 'Alcaraz C.', 'Sinner J.');
  assert.equal(h.total, 2);
  assert.equal(h.aWins, 1);
  assert.equal(h.bWins, 1);
  assert.equal(h.bySurface.clay.a, 1);
  assert.equal(h.bySurface.hard.b, 1);
  assert.equal(h.last.date, 20260701);
  assert.equal(h.last.winner, 'Alcaraz C.');
});

test('headToHead: sem confrontos → total 0', () => {
  assert.equal(headToHead(M, 'Alcaraz C.', 'Fulano Y.').total, 0);
});
