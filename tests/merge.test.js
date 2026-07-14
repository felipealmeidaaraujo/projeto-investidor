import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrades, shouldMigrate } from '../web/src/merge.js';

test('mergeTrades: une por id, o "incoming" vence em conflito', () => {
  const base = [{ id: 'a', pl: 1 }, { id: 'b', pl: 2 }];
  const incoming = [{ id: 'b', pl: 20 }, { id: 'c', pl: 3 }];
  const out = mergeTrades(base, incoming);
  const byId = Object.fromEntries(out.map((t) => [t.id, t.pl]));
  assert.deepEqual(byId, { a: 1, b: 20, c: 3 });
  assert.equal(out.length, 3);
});

test('mergeTrades: sem duplicar ids', () => {
  const out = mergeTrades([{ id: 'x' }], [{ id: 'x' }]);
  assert.equal(out.length, 1);
});

test('shouldMigrate: só quando a nuvem está vazia e há dados locais', () => {
  assert.equal(shouldMigrate([], [{ id: '1' }]), true);
  assert.equal(shouldMigrate([{ id: '1' }], [{ id: '2' }]), false);
  assert.equal(shouldMigrate([], []), false);
});
