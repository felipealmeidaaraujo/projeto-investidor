import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serveProfile } from '../pipeline/serve-stats.js';

const approx = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

test('serveProfile: calcula os percentuais de saque e devolução', () => {
  const s = serveProfile({
    ace: 10, svpt: 100, firstIn: 60, firstWon: 45, secondWon: 25,
    bpSaved: 8, bpFaced: 10, retWon: 40, retPts: 100,
  });
  approx(s.acePct, 0.1);
  approx(s.firstInPct, 0.6);
  approx(s.firstWonPct, 0.75); // 45/60
  approx(s.secondWonPct, 0.625); // 25/40
  approx(s.servePtsWonPct, 0.7); // 70/100
  approx(s.bpSavedPct, 0.8); // 8/10
  approx(s.returnPtsWonPct, 0.4);
});

test('serveProfile: divisão por zero não quebra', () => {
  const s = serveProfile({ ace: 0, svpt: 0, firstIn: 0, firstWon: 0, secondWon: 0, bpSaved: 0, bpFaced: 0, retWon: 0, retPts: 0 });
  approx(s.acePct, 0);
  approx(s.bpSavedPct, 0);
});
