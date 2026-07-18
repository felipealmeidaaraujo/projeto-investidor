import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatToWatch } from '../web/src/watch.js';

const P = (name, serve, style) => ({ name, serve, style: style || {} });

test('favorito com saque elite → linha de saque forte, com o %', () => {
  const fav = P('Fav', { bpSavedPct: 0.67, servePtsWonPct: 0.69, returnPtsWonPct: 0.34 });
  const und = P('Und', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.some((l) => l.includes('Fav') && l.includes('segura bem o saque')));
  assert.ok(lines.some((l) => l.includes('67%')));
});

test('os dois devolvem acima da média → linha de jogo quebra-quebra', () => {
  const fav = P('A', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.41 });
  const und = P('B', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.42 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.some((l) => l.includes('devolvem acima da média')));
});

test('comeback alto → "vira de trás"', () => {
  const fav = P('Vira', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 }, { comeback: { pct: 52, n: 30 } });
  const und = P('B', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.some((l) => l.includes('Vira') && l.includes('virar de trás')));
});

test('comeback baixo → "desanda"', () => {
  const fav = P('Cai', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 }, { comeback: { pct: 12, n: 30 } });
  const und = P('B', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.some((l) => l.includes('Cai') && l.includes('desandar')));
});

test('sem sinais fortes → 1 linha neutra honesta', () => {
  const fav = P('A', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const und = P('B', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('equilibrados'));
});

test('Challenger sem serve não quebra e cai no neutro', () => {
  const lines = whatToWatch(P('A'), P('B'), 'ATP');
  assert.equal(lines.length, 1);
});

test('no máximo 3 linhas', () => {
  const fav = P('Fav', { bpSavedPct: 0.67, servePtsWonPct: 0.69, returnPtsWonPct: 0.41 }, { comeback: { pct: 55, n: 30 } });
  const und = P('Und', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.41 }, { comeback: { pct: 10, n: 30 } });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.length <= 3);
});
