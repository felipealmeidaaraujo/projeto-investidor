import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oddTick, opKey, saveOp, loadOp, clearOp, OP_KEY } from '../web/src/operar.js';

function fakeStorage(inicial) {
  const map = new Map(inicial ? [[OP_KEY, inicial]] : []);
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}
const LIVE = { setsA: 0, setsB: 1, gamesA: 3, gamesB: 2, serverIsA: true, bestOf: 3, preA: 3.5, preB: 1.35 };

// --- degraus da odd ---
test('sobe e desce um degrau dentro da faixa', () => {
  assert.equal(oddTick(1.85, 1), 1.86);
  assert.equal(oddTick(1.85, -1), 1.84);
  assert.equal(oddTick(2.50, 1), 2.52, 'entre 2 e 3 o degrau é 0,02');
  assert.equal(oddTick(3.50, 1), 3.55, 'entre 3 e 4 o degrau é 0,05');
  assert.equal(oddTick(8.00, 1), 8.2, 'entre 6 e 10 o degrau é 0,2');
});

test('na borda da faixa, descer usa o degrau de baixo', () => {
  assert.equal(oddTick(2.00, -1), 1.99, 'abaixo de 2 o degrau volta a ser 0,01');
  assert.equal(oddTick(3.00, -1), 2.98);
  assert.equal(oddTick(2.00, 1), 2.02);
});

test('respeita os limites da escada', () => {
  assert.equal(oddTick(1.01, -1), 1.01);
  assert.equal(oddTick(1000, 1), 1000);
});

test('entrada inválida devolve null', () => {
  assert.equal(oddTick(null, 1), null);
  assert.equal(oddTick(1.85, 0), null);
  assert.equal(oddTick(0.5, 1), null);
  assert.equal(oddTick(NaN, -1), null);
});

// --- persistência por partida ---
test('guarda e recupera o estado da partida', () => {
  const st = fakeStorage();
  const k = opKey('Muller A.', 'Navone M.');
  assert.equal(loadOp(st, k), null);
  saveOp(st, k, LIVE, 1);
  const v = loadOp(st, k);
  assert.equal(v.gamesA, 3);
  assert.equal(v.preA, 3.5);
});

test('partidas diferentes não se misturam', () => {
  const st = fakeStorage();
  saveOp(st, opKey('A', 'B'), { ...LIVE, gamesA: 1 }, 1);
  saveOp(st, opKey('C', 'D'), { ...LIVE, gamesA: 5 }, 2);
  assert.equal(loadOp(st, opKey('A', 'B')).gamesA, 1);
  assert.equal(loadOp(st, opKey('C', 'D')).gamesA, 5);
});

test('apagar remove só a partida pedida', () => {
  const st = fakeStorage();
  saveOp(st, opKey('A', 'B'), LIVE, 1);
  saveOp(st, opKey('C', 'D'), LIVE, 2);
  clearOp(st, opKey('A', 'B'));
  assert.equal(loadOp(st, opKey('A', 'B')), null);
  assert.ok(loadOp(st, opKey('C', 'D')));
});

test('descarta as partidas mais antigas além do teto', () => {
  const st = fakeStorage();
  for (let i = 0; i < 14; i++) saveOp(st, opKey('J' + i, 'X'), { ...LIVE, gamesA: i }, i);
  assert.equal(loadOp(st, opKey('J0', 'X')), null, 'a mais antiga saiu');
  assert.ok(loadOp(st, opKey('J13', 'X')), 'a mais nova ficou');
});

test('storage corrompido ou ausente não derruba nada', () => {
  assert.equal(loadOp(fakeStorage('{lixo'), 'k'), null);
  assert.equal(loadOp(fakeStorage('[1,2]'), 'k'), null);
  assert.equal(loadOp(null, 'k'), null);
  assert.doesNotThrow(() => saveOp({ getItem: () => null, setItem: () => { throw new Error('cheio'); } }, 'k', LIVE));
});

test('chave da partida é estável e distingue os jogadores', () => {
  assert.equal(opKey(' Muller A. ', 'Navone M.'), 'Muller A.|Navone M.');
  assert.notEqual(opKey('A', 'B'), opKey('B', 'A'));
});
