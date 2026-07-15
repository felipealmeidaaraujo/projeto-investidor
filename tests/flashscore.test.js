import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTournamentHeader } from '../pipeline/flashscore.js';

test('parseTournamentHeader: Challenger masculino no saibro', () => {
  const r = parseTournamentHeader('CHALLENGER MEN - SINGLES: Bunschoten (Netherlands), clay');
  assert.equal(r.tour, 'ATP');
  assert.equal(r.singles, true);
  assert.equal(r.surface, 'clay');
  assert.equal(r.tournament, 'Bunschoten (Netherlands)');
});

test('parseTournamentHeader: WTA na quadra dura', () => {
  const r = parseTournamentHeader('WTA - SINGLES: Prague (Czechia), hard');
  assert.equal(r.tour, 'WTA');
  assert.equal(r.surface, 'hard');
});

test('parseTournamentHeader: duplas marcadas como singles=false', () => {
  const r = parseTournamentHeader('ATP - DOUBLES: Bastad (Sweden), clay');
  assert.equal(r.singles, false);
});

test('parseTournamentHeader: superfície desconhecida cai em hard', () => {
  const r = parseTournamentHeader('ATP - SINGLES: Lugar Estranho');
  assert.equal(r.surface, 'hard');
  assert.equal(r.tournament, 'Lugar Estranho');
});

import { statusFromCode } from '../pipeline/flashscore.js';

test('statusFromCode: 1 agendado, 2 ao vivo, 3 encerrado', () => {
  assert.equal(statusFromCode('1'), 'SCHEDULED');
  assert.equal(statusFromCode('2'), 'IN_PROGRESS');
  assert.equal(statusFromCode('3'), 'FINISHED');
  assert.equal(statusFromCode('99'), 'OTHER');
});
