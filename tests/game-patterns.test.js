import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore } from '../pipeline/game-patterns.js';

test('parseScore: placar normal de 3 sets, vencedor primeiro', () => {
  const r = parseScore('6-4 3-6 7-5');
  assert.equal(r.walkover, false);
  assert.equal(r.incomplete, false);
  assert.deepEqual(r.sets, [
    { w: 6, l: 4, tb: null },
    { w: 3, l: 6, tb: null },
    { w: 7, l: 5, tb: null },
  ]);
});

test('parseScore: tie-break guarda o placar do TB', () => {
  const r = parseScore('7-6(5) 6-3');
  assert.equal(r.sets[0].tb, 5);
  assert.equal(r.sets[1].tb, null);
});

test('parseScore: walkover', () => {
  const r = parseScore('W/O');
  assert.equal(r.walkover, true);
  assert.equal(r.incomplete, true);
  assert.deepEqual(r.sets, []);
});

test('parseScore: abandono (RET) marca incompleto mas mantém os sets jogados', () => {
  const r = parseScore('6-3 1-2 RET');
  assert.equal(r.incomplete, true);
  assert.equal(r.walkover, false);
  assert.deepEqual(r.sets, [{ w: 6, l: 3, tb: null }, { w: 1, l: 2, tb: null }]);
});

test('parseScore: vazio devolve estrutura segura', () => {
  const r = parseScore('');
  assert.deepEqual(r, { sets: [], walkover: false, incomplete: false });
});

import { firstSetWonByPlayer, isComeback } from '../pipeline/game-patterns.js';

test('firstSetWonByPlayer: vencedor da partida que ganhou o 1º set', () => {
  const p = parseScore('6-4 6-3');
  assert.equal(firstSetWonByPlayer(p, true), true);
});

test('firstSetWonByPlayer: perdedor da partida enxerga o 1º set invertido', () => {
  const p = parseScore('6-4 6-3');
  assert.equal(firstSetWonByPlayer(p, false), false);
});

test('firstSetWonByPlayer: perdedor que tinha levado o 1º set', () => {
  const p = parseScore('4-6 6-3 6-2');
  assert.equal(firstSetWonByPlayer(p, false), true);
});

test('isComeback: vencedor que perdeu o 1º set virou o jogo', () => {
  assert.equal(isComeback(parseScore('4-6 6-3 6-2'), true), true);
  assert.equal(isComeback(parseScore('6-4 6-3'), true), false);
});

test('isComeback: perdedor nunca conta como virada', () => {
  assert.equal(isComeback(parseScore('4-6 6-3 6-2'), false), false);
});
