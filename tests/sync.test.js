import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowKey, rowStamp, rowsToPush, toCloudRow, mergeRemote, syncResumo } from '../web/src/sync.js';

const obs = (extra = {}) => ({ at: '2026-07-19T18:00:00Z', a: 'Kuzmanov D.', b: 'Janvier M.', ma: 1.5, ...extra });

test('a identidade é o instante mais o confronto', () => {
  assert.equal(rowKey(obs()), '2026-07-19T18:00:00Z|Kuzmanov D.|Janvier M.');
  assert.notEqual(rowKey(obs()), rowKey(obs({ at: '2026-07-19T18:00:01Z' })));
});

test('o desfecho entra na impressão digital — senão a linha nunca reenviaria', () => {
  assert.notEqual(rowStamp(obs()), rowStamp(obs({ won: 'a' })));
});

test('só sobe o que a nuvem ainda não tem', () => {
  const a = obs();
  const b = obs({ at: '2026-07-19T18:05:00Z' });
  const fila = rowsToPush([a, b], [rowStamp(a)]);
  assert.deepEqual(fila.map(rowKey), [rowKey(b)]);
});

test('a linha que ganhou desfecho volta pra fila', () => {
  const antes = obs();
  const enviadas = [rowStamp(antes)];
  const depois = obs({ won: 'a' });
  assert.equal(rowsToPush([depois], enviadas).length, 1);
});

test('linha sem instante ou sem jogador não sobe (não teria chave)', () => {
  assert.equal(rowsToPush([{ a: 'X', b: 'Y' }, { at: 'x', a: 'X' }, null], []).length, 0);
});

test('formato da nuvem leva a chave exposta e a captura inteira', () => {
  const r = obs({ won: 'b', ev: 0.2 });
  const linha = toCloudRow(r);
  assert.equal(linha.at, r.at);
  assert.equal(linha.a, 'Kuzmanov D.');
  assert.deepEqual(linha.data, r);
});

test('aparelho vazio recupera tudo da nuvem', () => {
  const remotas = [obs(), obs({ at: '2026-07-19T18:05:00Z' })];
  const { rows, novas } = mergeRemote([], remotas);
  assert.equal(novas, 2);
  assert.equal(rows.length, 2);
});

test('a nuvem completa o desfecho que faltava no aparelho', () => {
  const local = obs();
  const { rows, novas, desfechos } = mergeRemote([local], [obs({ won: 'a' })]);
  assert.equal(novas, 0);
  assert.equal(desfechos, 1);
  assert.equal(rows[0].won, 'a');
});

test('a nuvem NUNCA sobrescreve um desfecho local nem apaga observação', () => {
  const local = obs({ won: 'a', ma: 1.5 });
  const { rows, desfechos } = mergeRemote([local], [obs({ won: 'b', ma: 9.99 })]);
  assert.equal(desfechos, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].won, 'a', 'o desfecho local prevalece');
  assert.equal(rows[0].ma, 1.5, 'o preço lido no aparelho não é reescrito');
});

test('a junção sai em ordem de tempo', () => {
  const { rows } = mergeRemote(
    [obs({ at: '2026-07-19T18:10:00Z' })],
    [obs({ at: '2026-07-19T18:00:00Z' }), obs({ at: '2026-07-19T18:05:00Z' })]
  );
  assert.deepEqual(rows.map((r) => r.at), [
    '2026-07-19T18:00:00Z',
    '2026-07-19T18:05:00Z',
    '2026-07-19T18:10:00Z',
  ]);
});

test('juntar duas vezes não duplica (a sincronia repetida é inofensiva)', () => {
  const remotas = [obs(), obs({ at: '2026-07-19T18:05:00Z' })];
  const um = mergeRemote([], remotas);
  const dois = mergeRemote(um.rows, remotas);
  assert.equal(dois.rows.length, 2);
  assert.equal(dois.novas, 0);
});

test('lixo vindo da nuvem é ignorado em vez de entrar na base', () => {
  const { rows, novas } = mergeRemote([obs()], [null, {}, { at: 'x' }]);
  assert.equal(novas, 0);
  assert.equal(rows.length, 1);
});

test('o resumo diz a verdade em cada estado', () => {
  assert.match(syncResumo({ conectado: false, pendentes: 0 }), /só neste aparelho/);
  assert.match(syncResumo({ conectado: true, pendentes: 3 }), /3 observações esperando/);
  assert.match(syncResumo({ conectado: true, pendentes: 1 }), /1 observação esperando/);
  assert.equal(syncResumo({ conectado: true, pendentes: 0, ultimaEm: '14:02' }), 'tudo na nuvem · 14:02');
});
