import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScore } from '../pipeline/score.js';

test('sets diretos', () => {
  const r = parseScore('6-4 6-3');
  assert.equal(r.valid, true);
  assert.equal(r.winnerSets, 2);
  assert.equal(r.loserSets, 0);
});

test('perdeu um set no meio', () => {
  const r = parseScore('6-4 3-6 7-5');
  assert.equal(r.winnerSets, 2);
  assert.equal(r.loserSets, 1);
  assert.deepEqual(r.sets[0], [6, 4]);
});

test('tie-break com placar entre parênteses', () => {
  const r = parseScore('7-6(5) 6-7(4) 6-4');
  assert.equal(r.valid, true);
  assert.equal(r.winnerSets, 2);
  assert.equal(r.loserSets, 1);
});

test('tie-break longo (10-8)', () => {
  const r = parseScore('6-4 7-6(10-8)');
  assert.equal(r.valid, true);
  assert.equal(r.winnerSets, 2);
});

test('abandono e W.O. são inválidos', () => {
  assert.equal(parseScore('6-4 2-1 RET').valid, false);
  assert.equal(parseScore('W/O').valid, false);
  assert.equal(parseScore('6-2 DEF').valid, false);
  assert.equal(parseScore('').valid, false);
  assert.equal(parseScore(undefined).valid, false);
});

test('lixo não parseia', () => {
  assert.equal(parseScore('foo bar').valid, false);
});
