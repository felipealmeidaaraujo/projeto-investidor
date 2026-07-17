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
  assert.equal(restDays(M, 'Alcaraz C.', 20260701), 0); // mesma data
  assert.equal(restDays(M, 'Alcaraz C.', 20260620), 0); // asOf antes da última → 0, não negativo
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

// Dentro de um torneio de Challenger, TODAS as partidas têm a mesma data (`tourney_date`
// é a data de início). Sem desempate, a ordem exibida seria a ordem do array — e o card
// diz "recente à esquerda". Até 2024 isso funcionava por acidente (o Sackmann listava a
// final primeiro); quando o pipeline passou a ordenar cronologicamente para consertar o
// Elo, o acidente virou bug: o card mostraria a 1ª rodada como a partida mais recente.
test('recentForm: no mesmo torneio, a partida mais avançada aparece primeiro', () => {
  // o array chega em ordem cronológica (como o matches.json grava): R32 → QF → SF → F
  const m = [
    { date: 20240101, num: 270, surface: 'hard', winner: 'Sinner J.', loser: 'A B' },   // R32: venceu
    { date: 20240101, num: 294, surface: 'hard', winner: 'Sinner J.', loser: 'C D' },   // QF: venceu
    { date: 20240101, num: 298, surface: 'hard', winner: 'Sinner J.', loser: 'E F' },   // SF: venceu
    { date: 20240101, num: 300, surface: 'hard', winner: 'G H', loser: 'Sinner J.' },   // F: PERDEU (a mais recente)
  ];
  const f = recentForm(m, 'Sinner J.', 10);
  // "recente à esquerda": a derrota na final vem primeiro, depois as vitórias que o levaram lá
  assert.deepEqual(f.results.map((r) => (r.won ? 'V' : 'D')), ['D', 'V', 'V', 'V']);
  assert.equal(f.wins, 3);
  assert.equal(f.losses, 1);
});

test('recentForm: sem num (partidas de tour) continua ordenando pela data', () => {
  const m = [
    { date: 20240101, surface: 'hard', winner: 'Sinner J.', loser: 'A B' },
    { date: 20240115, surface: 'hard', winner: 'C D', loser: 'Sinner J.' },
  ];
  const f = recentForm(m, 'Sinner J.', 10);
  assert.deepEqual(f.results.map((r) => r.date), [20240115, 20240101]);
});
