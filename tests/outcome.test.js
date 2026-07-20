import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureDay, daysApart, resolveCaptures, outcomeStats } from '../web/src/outcome.js';

const obs = (extra = {}) => ({ at: '2026-07-19T18:00:00Z', tour: 'ATP', a: 'Kuzmanov D.', b: 'Janvier M.', ...extra });
const jogo = (extra = {}) => ({ date: 20260719, tour: 'ATP', winner: 'Kuzmanov D.', loser: 'Janvier M.', ...extra });

test('data da captura sai do instante ISO', () => {
  assert.equal(captureDay('2026-07-19T18:00:00Z'), 20260719);
  assert.equal(captureDay('lixo'), null);
  assert.equal(captureDay(undefined), null);
});

test('distância em dias atravessa a virada do mês', () => {
  assert.equal(daysApart(20260801, 20260731), 1);
  assert.equal(daysApart(20260719, 20260721), -2);
  assert.equal(daysApart(20260719, 'x'), null);
});

test('carimba o vencedor no lado certo da observação', () => {
  const rows = [obs(), obs({ a: 'Janvier M.', b: 'Kuzmanov D.' })];
  assert.equal(resolveCaptures(rows, [jogo()]), 2);
  assert.equal(rows[0].won, 'a'); // Kuzmanov é o A na primeira
  assert.equal(rows[1].won, 'b'); // e o B na segunda
});

test('aceita a defasagem de um dia entre fuso e fonte', () => {
  const rows = [obs({ at: '2026-07-20T01:30:00Z' })]; // jogo da noite, já é outro dia em UTC
  assert.equal(resolveCaptures(rows, [jogo({ date: 20260719 })]), 1);
  assert.equal(rows[0].won, 'a');
});

test('não casa jogo de outra semana', () => {
  const rows = [obs()];
  assert.equal(resolveCaptures(rows, [jogo({ date: 20260726 })]), 0);
  assert.equal(rows[0].won, undefined);
});

test('não casa a mesma dupla em circuito diferente', () => {
  const rows = [obs()];
  assert.equal(resolveCaptures(rows, [jogo({ tour: 'WTA' })]), 0);
});

test('duplicata das duas fontes (mesmo vencedor, um dia de diferença) resolve', () => {
  const rows = [obs()];
  const n = resolveCaptures(rows, [jogo({ date: 20260719 }), jogo({ date: 20260720 })]);
  assert.equal(n, 1);
  assert.equal(rows[0].won, 'a');
});

test('fontes discordando do vencedor NÃO viram desfecho — errado é pior que ausente', () => {
  const rows = [obs()];
  const conflito = [jogo(), jogo({ winner: 'Janvier M.', loser: 'Kuzmanov D.' })];
  assert.equal(resolveCaptures(rows, conflito), 0);
  assert.equal(rows[0].won, undefined);
});

test('não reprocessa o que já tem desfecho', () => {
  const rows = [obs({ won: 'b' })];
  assert.equal(resolveCaptures(rows, [jogo()]), 0);
  assert.equal(rows[0].won, 'b', 'o desfecho gravado não é sobrescrito');
});

test('sem resultados, ou sem observações, não quebra', () => {
  assert.equal(resolveCaptures([obs()], []), 0);
  assert.equal(resolveCaptures([obs()], null), 0);
  assert.equal(resolveCaptures([], [jogo()]), 0);
  assert.equal(resolveCaptures(null, [jogo()]), 0);
});

test('linha corrompida é ignorada em vez de derrubar a resolução', () => {
  const rows = [null, { a: 'X' }, obs()];
  assert.equal(resolveCaptures(rows, [jogo()]), 1);
  assert.equal(rows[2].won, 'a');
});

test('varre o histórico uma vez só, mesmo com muitas observações', () => {
  // 500 observações da mesma partida (o laço de um jogo inteiro) contra um histórico
  // grande: tem que resolver todas sem custo quadrático perceptível.
  const rows = Array.from({ length: 500 }, (_, i) => obs({ ga: i }));
  const hist = Array.from({ length: 40000 }, (_, i) => jogo({ winner: `Fulano ${i}`, loser: `Sicrano ${i}` }));
  hist.push(jogo());
  assert.equal(resolveCaptures(rows, hist), 500);
});

test('contagem separa o que tem desfecho do que ainda espera', () => {
  assert.deepEqual(outcomeStats([obs({ won: 'a' }), obs(), obs()]), { total: 3, comDesfecho: 1, semDesfecho: 2 });
  assert.deepEqual(outcomeStats([]), { total: 0, comDesfecho: 0, semDesfecho: 0 });
});
