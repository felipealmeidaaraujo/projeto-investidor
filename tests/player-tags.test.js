import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerTags } from '../web/src/analysis.js';

const has = (tags, t) => tags.some((x) => x.t === t);

test('playerTags: saque forte + devolvedor forte viram forças', () => {
  const p = { elo: 2100, hard: 2100, clay: 2100, grass: 2100, serve: { servePtsWonPct: 0.71, acePct: 0.12, returnPtsWonPct: 0.42, bpSavedPct: 0.7, firstInPct: 0.6, firstWonPct: 0.78, secondWonPct: 0.57 } };
  const tags = playerTags(p);
  assert.ok(has(tags, 'Saque forte'));
  assert.ok(has(tags, 'Muitos aces'));
  assert.ok(has(tags, 'Devolvedor forte'));
  assert.ok(tags.every((x) => x.kind));
});

test('playerTags: especialista de saibro e rende menos na grama (relativo ao próprio nível)', () => {
  // amostra suficiente nas duas superfícies (>= 15 jogos) para o selo ser sinal, não ruído
  const p = { elo: 2000, clay: 2080, hard: 2000, grass: 1900, matchesBySurface: { clay: 40, hard: 60, grass: 20 } };
  const tags = playerTags(p);
  assert.ok(has(tags, 'Especialista no saibro'));
  assert.ok(has(tags, 'Rende menos na grama'));
});

test('playerTags: superfície com poucos jogos (<15) não vira selo — amostra é ruído', () => {
  // caso real (tipo Blockx): Elo de grama despencado (delta -700) mas só 4 jogos de grama.
  // O Elo cru fica preso perto do prior; sem amostra o selo não pode cravar "rende menos".
  const p = { elo: 2100, clay: 2100, hard: 2100, grass: 1400, matchesBySurface: { clay: 50, hard: 50, grass: 4 } };
  const tags = playerTags(p).map((t) => t.t);
  assert.ok(!tags.includes('Rende menos na grama'));
  // controle: com jogos suficientes, o mesmo delta VIRA selo (a trava é só de amostra)
  const q = { ...p, matchesBySurface: { clay: 50, hard: 50, grass: 20 } };
  assert.ok(playerTags(q).map((t) => t.t).includes('Rende menos na grama'));
});

test('playerTags: sem dados de saque → só tags de superfície (não quebra)', () => {
  const tags = playerTags({ elo: 1800 });
  assert.ok(Array.isArray(tags));
});

test('playerTags: limiar de devolução é por circuito', () => {
  // Devolução 0.45: forte no ATP (limiar 0.40), NÃO forte na WTA (limiar 0.454)
  const p = { elo: 2000, serve: { servePtsWonPct: 0.56, returnPtsWonPct: 0.45, acePct: 0.03, bpSavedPct: 0.55, firstInPct: 0.62 } };
  const atp = playerTags(p, 'ATP').map((t) => t.t);
  const wta = playerTags(p, 'WTA').map((t) => t.t);
  assert.ok(atp.includes('Devolvedor forte'));
  assert.ok(!wta.includes('Devolvedor forte'));
});
