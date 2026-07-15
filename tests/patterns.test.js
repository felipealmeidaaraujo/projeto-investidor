import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toEnrichedMatch } from '../pipeline/patterns.js';

const ROW = {
  tourney_date: '20260105', tourney_level: 'A', surface: 'Hard', score: '6-3 3-6 6-3', minutes: '114', best_of: '3',
  winner_name: 'Hubert Hurkacz', winner_id: '128034', winner_hand: 'R', winner_ht: '196', winner_age: '28.8',
  winner_ioc: 'POL', winner_rank: '83', winner_seed: '9', w_SvGms: '14', w_bpSaved: '8', w_bpFaced: '9',
  loser_name: 'Jannik Sinner', loser_id: '207989', loser_hand: 'R', loser_ht: '188', loser_age: '24.4',
  loser_ioc: 'ITA', loser_rank: '1', loser_seed: '1', l_SvGms: '13', l_bpSaved: '5', l_bpFaced: '7',
};

test('toEnrichedMatch: campos do jogo e superfície em minúsculo', () => {
  const m = toEnrichedMatch(ROW);
  assert.equal(m.dateInt, 20260105);
  assert.equal(m.level, 'A');
  assert.equal(m.surface, 'hard');
  assert.equal(m.score, '6-3 3-6 6-3');
  assert.equal(m.minutes, 114);
  assert.equal(m.bestOf, 3);
});

test('toEnrichedMatch: bio e stats do vencedor', () => {
  const m = toEnrichedMatch(ROW);
  assert.equal(m.winner.name, 'Hubert Hurkacz');
  assert.equal(m.winner.hand, 'R');
  assert.equal(m.winner.ht, 196);
  assert.equal(m.winner.age, 28.8);
  assert.equal(m.winner.ioc, 'POL');
  assert.equal(m.winner.rank, 83);
  assert.equal(m.winner.svGms, 14);
  assert.equal(m.winner.bpSaved, 8);
  assert.equal(m.winner.bpFaced, 9);
});

test('toEnrichedMatch: bio do perdedor usa o prefixo loser_/l_', () => {
  const m = toEnrichedMatch(ROW);
  assert.equal(m.loser.name, 'Jannik Sinner');
  assert.equal(m.loser.rank, 1);
  assert.equal(m.loser.bpFaced, 7);
});

test('toEnrichedMatch: campos ausentes viram null/0 sem quebrar', () => {
  const m = toEnrichedMatch({ tourney_date: '20260105', winner_name: 'A', loser_name: 'B' });
  assert.equal(m.minutes, null);
  assert.equal(m.winner.ht, null);
  assert.equal(m.winner.bpFaced, 0);
  assert.equal(m.bestOf, 3);
});

import { playerSideGame } from '../pipeline/patterns.js';

test('playerSideGame: perspectiva do vencedor', () => {
  const m = toEnrichedMatch(ROW);
  const g = playerSideGame(m, 'winner');
  assert.equal(g.won, true);
  assert.equal(g.score, '6-3 3-6 6-3');
  assert.equal(g.bpFaced, 9);
  assert.equal(g.oppBpFaced, 7);
});

test('playerSideGame: perspectiva do perdedor inverte os lados', () => {
  const m = toEnrichedMatch(ROW);
  const g = playerSideGame(m, 'loser');
  assert.equal(g.won, false);
  assert.equal(g.bpFaced, 7);
  assert.equal(g.oppBpSaved, 8);
});

import { groupByPlayer } from '../pipeline/patterns.js';

test('groupByPlayer: cada jogo entra para os dois jogadores, na perspectiva certa', () => {
  const m = toEnrichedMatch(ROW);
  const g = groupByPlayer([m]);
  assert.equal(g.get('Hubert Hurkacz').length, 1);
  assert.equal(g.get('Hubert Hurkacz')[0].game.won, true);
  assert.equal(g.get('Jannik Sinner')[0].game.won, false);
  assert.equal(g.get('Jannik Sinner')[0].bio.rank, 1);
});

test('groupByPlayer: ignora jogos sem placar', () => {
  const m = toEnrichedMatch({ ...ROW, score: '' });
  const g = groupByPlayer([m]);
  assert.equal(g.size, 0);
});

import { buildProfile } from '../pipeline/patterns.js';

test('buildProfile: agrega padrões e usa o bio do jogo mais recente', () => {
  const entries = [
    { game: { won: true, score: '6-4 6-3', minutes: 90, bpFaced: 2, bpSaved: 2, svGms: 10, oppBpFaced: 4, oppBpSaved: 1 },
      bio: { rank: 50, hand: 'R' }, dateInt: 20250101 },
    { game: { won: false, score: '4-6 6-3 6-2', minutes: 150, bpFaced: 5, bpSaved: 3, svGms: 12, oppBpFaced: 3, oppBpSaved: 2 },
      bio: { rank: 30, hand: 'R' }, dateInt: 20260101 },
  ];
  const p = buildProfile(entries);
  assert.equal(p.games, 2);
  assert.equal(p.bio.rank, 30);
  assert.equal(p.style.firstSet.n, 2);
  assert.equal(typeof p.pressure.bpSavedPct, 'number');
});

test('buildProfile: lista vazia devolve bio null', () => {
  const p = buildProfile([]);
  assert.equal(p.games, 0);
  assert.equal(p.bio, null);
});
