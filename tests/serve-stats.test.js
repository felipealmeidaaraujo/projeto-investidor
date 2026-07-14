import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serveProfile, accumulate, applyServe } from '../pipeline/serve-stats.js';

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

test('accumulate: soma saque do vencedor e devolução do perdedor', () => {
  const m = new Map();
  accumulate(m, {
    winner_name: 'A', loser_name: 'B',
    w_ace: '5', w_svpt: '80', w_1stIn: '50', w_1stWon: '40', w_2ndWon: '18', w_bpSaved: '3', w_bpFaced: '5',
    l_ace: '2', l_svpt: '70', l_1stWon: '38', l_2ndWon: '15', l_1stIn: '45', l_bpSaved: '4', l_bpFaced: '8',
  });
  const a = m.get('A');
  assert.equal(a.ace, 5);
  assert.equal(a.svpt, 80);
  // devolução de A = pontos de saque de B menos os que B ganhou
  assert.equal(a.retPts, 70);
  assert.equal(a.retWon, 70 - (38 + 15));
});

test('applyServe: enriquece quem passa do mínimo de saques e ignora quem não', () => {
  const model = { players: [{ name: 'AAA', elo: 2000 }, { name: 'BBB', elo: 1900 }] };
  const big = { ace: 60, svpt: 600, firstIn: 380, firstWon: 300, secondWon: 130, bpSaved: 30, bpFaced: 45, retWon: 200, retPts: 550 };
  const small = { ace: 20, svpt: 300, firstIn: 190, firstWon: 150, secondWon: 60, bpSaved: 10, bpFaced: 18, retWon: 90, retPts: 280 };
  const byFull = new Map([['Full A', big], ['Full B', small]]);
  const match = (full, players) => players.find((p) => full.endsWith(p.name[0])) || null; // 'Full A'→AAA, 'Full B'→BBB
  const enriched = applyServe(model, byFull, { match });
  assert.equal(enriched, 1);
  assert.ok(model.players[0].serve && typeof model.players[0].serve.servePtsWonPct === 'number');
  assert.equal(model.players[0].fullName, 'Full A');
  assert.equal(model.players[1].serve, undefined);
});
