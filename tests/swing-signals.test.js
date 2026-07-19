import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SwingStats } from '../pipeline/swing-signals.js';

test('acumula devolução e 1º set, ponto a ponto', () => {
  const s = new SwingStats();
  assert.equal(s.ready('A', 1), false);
  s.update('A', { svpt: 80, spWon: 55, retPts: 70, retWon: 28, wonFirstSet: true });
  s.update('A', { svpt: 90, spWon: 60, retPts: 80, retWon: 24, wonFirstSet: false });
  assert.equal(s.ready('A', 2), true);
  assert.equal(s.ready('A', 3), false);
  assert.ok(Math.abs(s.returnWonPct('A') - (52 / 150)) < 1e-9);
  assert.ok(Math.abs(s.serveWonPct('A') - (115 / 170)) < 1e-9);
  assert.ok(Math.abs(s.firstSetPct('A') - 0.5) < 1e-9);
});

test('sem dados de saque → pct null, mas conta a partida e o 1º set', () => {
  const s = new SwingStats();
  s.update('B', { svpt: 0, spWon: 0, retPts: 0, retWon: 0, wonFirstSet: true });
  assert.equal(s.returnWonPct('B'), null);
  assert.equal(s.serveWonPct('B'), null);
  assert.equal(s.firstSetPct('B'), 1);
  assert.equal(s.ready('B', 1), true);
});

test('jogador desconhecido → leituras nulas/seguras', () => {
  const s = new SwingStats();
  assert.equal(s.ready('Z', 1), false);
  assert.equal(s.returnWonPct('Z'), null);
  assert.equal(s.firstSetPct('Z'), null);
});
