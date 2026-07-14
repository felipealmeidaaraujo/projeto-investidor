import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePL, makeTrade } from '../web/src/trade.js';

test('resolvePL: green vira lucro positivo', () => {
  assert.equal(resolvePL('green', 50), 50);
});
test('resolvePL: red vira prejuízo negativo (usa o módulo do valor)', () => {
  assert.equal(resolvePL('red', 50), -50);
  assert.equal(resolvePL('red', -50), -50);
});
test('resolvePL: zerei é sempre 0', () => {
  assert.equal(resolvePL('zero', 50), 0);
});

test('makeTrade: guarda o confronto quando os dois jogadores existem', () => {
  const base = { market: 'Match Odds', surface: 'clay', oddEntry: 1.9, stake: 50, result: 'green', plAmount: 45, emotion: 'calmo' };
  const t1 = makeTrade({ ...base, players: { a: 'Carlos Alcaraz', b: 'Jannik Sinner', tour: 'ATP' } }, { id: 'x', date: 'd' });
  assert.deepEqual(t1.players, { a: 'Carlos Alcaraz', b: 'Jannik Sinner', tour: 'ATP' });
  const t2 = makeTrade({ ...base, players: { a: 'Só um' } }, { id: 'y', date: 'd' });
  assert.equal(t2.players, undefined);
  const t3 = makeTrade(base, { id: 'z', date: 'd' });
  assert.equal(t3.players, undefined);
});

test('makeTrade: grava side/dir/entryType e o valor ao vivo', () => {
  const t = makeTrade({
    market: 'Match Odds', surface: 'hard', oddEntry: 2.5, stake: 50, result: 'green', plAmount: 40,
    players: { a: 'A A', b: 'B B', tour: 'ATP' }, side: 'a', dir: 'back',
    entryType: 'live', liveState: { setsA: 0, setsB: 1, gamesA: 2, gamesB: 3, serverIsA: true, bestOf: 3 }, liveFairOdd: 2.0,
  }, { id: 'x', date: 'd' });
  assert.equal(t.side, 'a');
  assert.equal(t.dir, 'back');
  assert.equal(t.entryType, 'live');
  assert.deepEqual(t.liveState, { setsA: 0, setsB: 1, gamesA: 2, gamesB: 3, serverIsA: true, bestOf: 3 });
  assert.equal(Math.round(t.liveValue), 25); // clvPct(2.5, 2.0, 'back') = +25%
});

test('makeTrade: CLV pré-jogo manual usa a direção (lay inverte)', () => {
  const t = makeTrade({
    market: 'Match Odds', surface: 'clay', oddEntry: 2.0, oddClose: 2.1, stake: 10, result: 'zero', plAmount: 0,
    side: 'b', dir: 'lay',
  }, { id: 'y', date: 'd' });
  assert.equal(Math.round(t.clv), 5); // lay: clvPct(2.0, 2.1, 'lay') = (2.1/2.0-1)*100 = +5%
});
