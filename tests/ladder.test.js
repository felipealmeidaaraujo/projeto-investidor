import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickSize, ticksBetween, stepGame, nextGameStates, matchOver, isTiebreak } from '../web/src/ladder.js';

const S = (sa, sb, ga, gb, serverIsA = true) => ({ setsA: sa, setsB: sb, gamesA: ga, gamesB: gb, serverIsA });

// --- escada de ticks da Betfair ---
test('tamanho do degrau muda por faixa', () => {
  assert.equal(tickSize(1.50), 0.01);
  assert.equal(tickSize(2.50), 0.02);
  assert.equal(tickSize(3.50), 0.05);
  assert.equal(tickSize(5.00), 0.1);
  assert.equal(tickSize(8.00), 0.2);
  assert.equal(tickSize(15.0), 0.5);
});

test('conta os degraus dentro da mesma faixa', () => {
  assert.equal(ticksBetween(1.50, 1.60), 10);
  assert.equal(ticksBetween(2.00, 2.20), 10);
});

test('conta degraus atravessando faixas', () => {
  // 1.90→2.00 são 10 degraus de 0,01; 2.00→2.20 são 10 de 0,02
  assert.equal(ticksBetween(1.90, 2.20), 20);
});

test('degraus têm sinal (direção do movimento)', () => {
  assert.equal(ticksBetween(2.00, 1.90), -10);
  assert.equal(ticksBetween(2.00, 2.00), 0);
});

test('odds inválidas não quebram', () => {
  assert.equal(tickSize(1.0), null);
  assert.equal(ticksBetween(null, 2), null);
  assert.equal(ticksBetween(2, NaN), null);
});

// --- avanço de game ---
test('sacador segura: ganha o game dele', () => {
  const r = stepGame(S(0, 0, 3, 2, true), true);
  assert.deepEqual([r.gamesA, r.gamesB], [4, 2]);
  assert.equal(r.serverIsA, false, 'o saque alterna');
});

test('sacador é quebrado: o game vai pro adversário', () => {
  const r = stepGame(S(0, 0, 3, 2, true), false);
  assert.deepEqual([r.gamesA, r.gamesB], [3, 3]);
});

test('segurar em 5-4 fecha o set e zera os games', () => {
  const r = stepGame(S(0, 0, 5, 4, true), true);
  assert.equal(r.setsA, 1);
  assert.deepEqual([r.gamesA, r.gamesB], [0, 0]);
});

test('ser quebrado em 4-5 entrega o set ao adversário', () => {
  const r = stepGame(S(0, 0, 4, 5, true), false);
  assert.equal(r.setsB, 1);
  assert.deepEqual([r.gamesA, r.gamesB], [0, 0]);
});

test('7-5 fecha o set; 6-5 não fecha', () => {
  const naoFecha = stepGame(S(0, 0, 5, 5, true), true); // 6-5
  assert.equal(naoFecha.setsA, 0);
  assert.deepEqual([naoFecha.gamesA, naoFecha.gamesB], [6, 5]);
  const fecha = stepGame(S(0, 0, 6, 5, true), true); // 7-5
  assert.equal(fecha.setsA, 1);
});

test('6-6 é tie-break, e vencê-lo fecha o set em 7-6', () => {
  const st = S(0, 0, 6, 6, true);
  assert.equal(isTiebreak(st), true);
  const r = stepGame(st, true);
  assert.equal(r.setsA, 1);
  assert.deepEqual([r.gamesA, r.gamesB], [0, 0]);
});

// --- estados seguintes ---
test('devolve os dois caminhos do próximo game', () => {
  const r = nextGameStates(S(0, 1, 3, 2, true), 3);
  assert.deepEqual([r.hold.gamesA, r.hold.gamesB], [4, 2]);
  assert.deepEqual([r.broken.gamesA, r.broken.gamesB], [3, 3]);
  assert.equal(r.tiebreak, false);
});

test('marca quando o próximo game é o tie-break', () => {
  assert.equal(nextGameStates(S(0, 0, 6, 6, true), 3).tiebreak, true);
});

test('partida encerrada não tem próximo game', () => {
  assert.equal(matchOver(S(2, 0, 0, 0), 3), true);
  assert.equal(matchOver(S(2, 0, 0, 0), 5), false, 'em melhor-de-5, 2 sets não fecham');
  assert.equal(nextGameStates(S(2, 0, 0, 0), 3), null);
  assert.equal(nextGameStates(S(0, 3, 0, 0), 5), null);
});

test('estado inválido não quebra', () => {
  assert.equal(nextGameStates(null, 3), null);
});
