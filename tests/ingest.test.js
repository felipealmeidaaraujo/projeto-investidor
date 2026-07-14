import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvLine, parseCsv, toMatch, sortMatches } from '../pipeline/ingest.js';

test('parseCsvLine: separa campos simples', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
});

test('parseCsvLine: respeita vírgula dentro de aspas', () => {
  assert.deepEqual(parseCsvLine('"Silva, João",BRA,"1,90"'), ['Silva, João', 'BRA', '1,90']);
});

test('parseCsv: usa o cabeçalho como chaves', () => {
  const rows = parseCsv('winner_name,surface\nAlcaraz,Clay\nSinner,Hard');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].winner_name, 'Alcaraz');
  assert.equal(rows[1].surface, 'Hard');
});

test('toMatch: normaliza superfície e campos', () => {
  const m = toMatch({
    tourney_date: '20240101', match_num: '1', surface: 'Hard', indoor: 'O',
    best_of: '3', round: 'R32', winner_name: 'A', loser_name: 'B',
    winner_rank: '14', loser_rank: '42',
  });
  assert.equal(m.surface, 'hard');
  assert.equal(m.indoor, false);
  assert.equal(m.bestOf, 3);
  assert.equal(m.winner, 'A');
  assert.equal(m.winnerRank, 14);
  assert.equal(m.dateInt, 20240101);
});

test('sortMatches: ordena por data e depois por rodada', () => {
  const ms = sortMatches([
    { dateInt: 20240108, roundOrder: 1, matchNum: 1 },
    { dateInt: 20240101, roundOrder: 7, matchNum: 1 },
    { dateInt: 20240101, roundOrder: 1, matchNum: 1 },
  ]);
  assert.deepEqual(ms.map((m) => [m.dateInt, m.roundOrder]), [
    [20240101, 1], [20240101, 7], [20240108, 1],
  ]);
});
