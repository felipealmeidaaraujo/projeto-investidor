import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymd, matchClosing, closingPatches } from '../web/src/closings.js';

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

const closings = [
  { date: 20260712, surface: 'clay', tour: 'ATP', winner: 'Alcaraz C.', loser: 'Sinner J.', bfew: 1.80, bfel: 2.05, avgw: 1.78, avgl: 2.02, maxw: 1.85, maxl: 2.10 },
  { date: 20260710, surface: 'hard', tour: 'ATP', winner: 'Zverev A.', loser: 'Ruud C.', bfew: null, bfel: null, avgw: 1.50, avgl: 2.60, maxw: 1.52, maxl: 2.65 },
];

test('ymd: extrai YYYYMMDD de uma data ISO', () => {
  assert.equal(ymd('2026-07-12T14:30'), 20260712);
  assert.equal(ymd('2026-07-12'), 20260712);
  assert.equal(ymd(''), null);
});

test('matchClosing: casa por nomes (qualquer ordem) e escolhe a odd do lado', () => {
  const t = { market: 'Match Odds', entryType: 'pre', date: '2026-07-12T10:00', oddEntry: 2.0, dir: 'back',
    players: { a: 'Carlos Alcaraz', b: 'Jannik Sinner' }, side: 'a' };
  approx(matchClosing(t, closings).oddClose, 1.80); // Alcaraz venceu → BFE do vencedor
  approx(matchClosing({ ...t, side: 'b' }, closings).oddClose, 2.05); // Sinner perdeu → BFE do perdedor
});

test('matchClosing: fallback para a média quando Betfair Exchange ausente', () => {
  const t = { market: 'Match Odds', entryType: 'pre', date: '2026-07-10', oddEntry: 1.5, dir: 'back',
    players: { a: 'Alexander Zverev', b: 'Casper Ruud' }, side: 'a' };
  approx(matchClosing(t, closings).oddClose, 1.50); // bfew null → avgw
});

test('matchClosing: ignora ao vivo, já-com-oddClose, fora da janela e sem casar', () => {
  const base = { market: 'Match Odds', entryType: 'pre', date: '2026-07-12', oddEntry: 2.0, dir: 'back',
    players: { a: 'Carlos Alcaraz', b: 'Jannik Sinner' }, side: 'a' };
  assert.equal(matchClosing({ ...base, entryType: 'live' }, closings), null);
  assert.equal(matchClosing({ ...base, oddClose: 1.9 }, closings), null);
  assert.equal(matchClosing({ ...base, date: '2026-06-01' }, closings), null);
  assert.equal(matchClosing({ ...base, players: { a: 'Novak Djokovic', b: 'Jannik Sinner' } }, closings), null);
});

test('closingPatches: calcula clv com a direção (lay invertido)', () => {
  const back = { id: 'x', market: 'Match Odds', entryType: 'pre', date: '2026-07-12', oddEntry: 2.0, dir: 'back',
    players: { a: 'Carlos Alcaraz', b: 'Jannik Sinner' }, side: 'a' };
  const [pBack] = closingPatches([back], closings);
  assert.equal(pBack.id, 'x');
  approx(pBack.oddClose, 1.80);
  approx(pBack.clv, (2.0 / 1.80 - 1) * 100);
  const [pLay] = closingPatches([{ ...back, id: 'y', dir: 'lay' }], closings);
  approx(pLay.clv, (1.80 / 2.0 - 1) * 100);
});
