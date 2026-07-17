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

import { parseFeed } from '../pipeline/flashscore.js';

const FEED = [
  '~ZA÷CHALLENGER MEN - SINGLES: Bunschoten (Netherlands), clay',
  '~AA÷id1', 'AD÷1784106600', 'AB÷1', 'AE÷Borges N.', 'AF÷Dimitrov G.',
  '~AA÷id2', 'AD÷1784110000', 'AB÷3', 'AE÷Encerrado A.', 'AF÷Encerrado B.',
  '~ZA÷WTA - DOUBLES: Prague (Czechia), hard',
  '~AA÷id3', 'AD÷1784106600', 'AB÷1', 'AE÷Dupla A.', 'AF÷Dupla B.',
  '~ZA÷WTA - SINGLES: Prague (Czechia), hard',
  '~AA÷id4', 'AD÷1784106600', 'AB÷2', 'AE÷Swiatek I.', 'AF÷Gauff C.',
].join('¬');

test('parseFeed: só simples não-encerrados (exclui duplas, encerrado)', () => {
  const jogos = parseFeed(FEED);
  assert.equal(jogos.length, 2);
  assert.deepEqual(jogos.map((j) => `${j.a} vs ${j.b}`), ['Borges N. vs Dimitrov G.', 'Swiatek I. vs Gauff C.']);
});

test('parseFeed: preenche tour, superfície, status e horário ISO', () => {
  const [g] = parseFeed(FEED);
  assert.equal(g.tour, 'ATP');
  assert.equal(g.surface, 'clay');
  assert.equal(g.status, 'SCHEDULED');
  assert.equal(g.tournament, 'Bunschoten (Netherlands)');
  assert.equal(g.commence, new Date(1784106600 * 1000).toISOString());
});

test('parseFeed: o jogo ao vivo vem com status IN_PROGRESS e tour WTA', () => {
  const jogos = parseFeed(FEED);
  const g = jogos.find((x) => x.a === 'Swiatek I.');
  assert.equal(g.status, 'IN_PROGRESS');
  assert.equal(g.tour, 'WTA');
});

test('parseTournamentHeader: nível — challenger, itf, tour e outros', () => {
  assert.equal(parseTournamentHeader('CHALLENGER MEN - SINGLES: Granby (Canada), hard').level, 'challenger');
  assert.equal(parseTournamentHeader('ATP - SINGLES: Gstaad (Switzerland), clay').level, 'tour');
  assert.equal(parseTournamentHeader('WTA - SINGLES: Athens (Greece), hard').level, 'tour');
  assert.equal(parseTournamentHeader('ITF MEN - SINGLES: M15 Gubbio (Italy), clay').level, 'itf');
  assert.equal(parseTournamentHeader('EXHIBITION - MEN: UTS Championship (World), clay').level, 'other');
});

test('parseTournamentHeader: o nível não atrapalha o gênero (Challenger/ITF WOMEN = WTA)', () => {
  const ch = parseTournamentHeader('CHALLENGER WOMEN - SINGLES: Rome (Italy), clay');
  assert.equal(ch.tour, 'WTA');
  assert.equal(ch.level, 'challenger');
  const itf = parseTournamentHeader('ITF MEN - SINGLES: M15 Gubbio (Italy), clay');
  assert.equal(itf.tour, 'ATP');
  assert.equal(itf.level, 'itf');
});
