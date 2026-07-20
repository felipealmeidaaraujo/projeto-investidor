import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, snapshotKey, loadCaptures, addCapture, toCSV, CAPTURE_KEY, MAX_CAPTURES } from '../web/src/capture.js';

// Storage falso, no formato do localStorage.
function fakeStorage(initial) {
  const map = new Map(initial ? [[CAPTURE_KEY, initial]] : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

const LIVE = { setsA: 0, setsB: 1, gamesA: 2, gamesB: 3, serverIsA: true, bestOf: 3, mktA: 2.8, mktB: 1.45 };
const FAIR = { fairOddA: 2.93, fairOddB: 1.52 };
const BASE = { at: '2026-07-19T12:00:00Z', tour: 'ATP', surface: 'hard', level: null, a: 'Alcaraz', b: 'Fils', live: LIVE, fair: FAIR, preProbA: 0.8 };

test('monta a observação com placar, justa e mercado', () => {
  const s = buildSnapshot(BASE);
  assert.equal(s.a, 'Alcaraz');
  assert.equal(s.sb, 1);
  assert.equal(s.srv, 'a');
  assert.equal(s.ma, 2.8);
  assert.equal(s.fa, 2.93);
  assert.equal(s.pre, 0.8);
});

test('sem NENHUMA odd de mercado não vira observação (é o preço que dá valor)', () => {
  const s = buildSnapshot({ ...BASE, live: { ...LIVE, mktA: null, mktB: null } });
  assert.equal(s, null);
});

test('basta UMA odd de mercado pra valer', () => {
  const s = buildSnapshot({ ...BASE, live: { ...LIVE, mktB: null } });
  assert.ok(s);
  assert.equal(s.mb, null);
});

test('faltando jogador ou placar, não quebra', () => {
  assert.equal(buildSnapshot({ ...BASE, a: null }), null);
  assert.equal(buildSnapshot({ ...BASE, live: null }), null);
});

test('grava e lê de volta', () => {
  const st = fakeStorage();
  assert.equal(loadCaptures(st).length, 0);
  const total = addCapture(st, buildSnapshot(BASE));
  assert.equal(total, 1);
  assert.equal(loadCaptures(st)[0].a, 'Alcaraz');
});

test('não duplica a mesma observação consecutiva', () => {
  const st = fakeStorage();
  addCapture(st, buildSnapshot(BASE));
  addCapture(st, buildSnapshot(BASE));
  assert.equal(loadCaptures(st).length, 1);
});

test('placar novo com a mesma odd é observação nova', () => {
  const st = fakeStorage();
  addCapture(st, buildSnapshot(BASE));
  addCapture(st, buildSnapshot({ ...BASE, live: { ...LIVE, gamesA: 3 } }));
  assert.equal(loadCaptures(st).length, 2);
});

test('odd nova no mesmo placar é observação nova', () => {
  const st = fakeStorage();
  addCapture(st, buildSnapshot(BASE));
  addCapture(st, buildSnapshot({ ...BASE, live: { ...LIVE, mktA: 3.1 } }));
  assert.equal(loadCaptures(st).length, 2);
});

test('snapshot nulo não grava nada', () => {
  const st = fakeStorage();
  assert.equal(addCapture(st, null), 0);
  assert.equal(loadCaptures(st).length, 0);
});

test('storage corrompido não derruba a leitura', () => {
  assert.deepEqual(loadCaptures(fakeStorage('{lixo')), []);
  assert.deepEqual(loadCaptures(fakeStorage('{"a":1}')), []);
  assert.deepEqual(loadCaptures(null), []);
});

test('respeita o teto descartando as mais antigas', () => {
  // Semeia o storage já cheio (rápido) e grava mais uma: a mais velha tem que sair.
  const cheio = Array.from({ length: MAX_CAPTURES }, (_, i) => ({ ...buildSnapshot(BASE), at: `seed-${i}` }));
  const st = fakeStorage(JSON.stringify(cheio));
  const total = addCapture(st, buildSnapshot({ ...BASE, at: 'nova', live: { ...LIVE, gamesA: 5 } }));
  const rows = loadCaptures(st);
  assert.equal(total, MAX_CAPTURES);
  assert.equal(rows.length, MAX_CAPTURES);
  assert.equal(rows[0].at, 'seed-1', 'a observação mais antiga foi descartada');
  assert.equal(rows[rows.length - 1].at, 'nova');
});

test('cota estourada não quebra o painel', () => {
  const st = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.doesNotThrow(() => addCapture(st, buildSnapshot(BASE)));
});

test('CSV traz cabeçalho e a linha', () => {
  const csv = toCSV([buildSnapshot(BASE)]);
  const [head, row] = csv.split('\n');
  assert.ok(head.startsWith('at,tour,surface'));
  assert.ok(row.includes('Alcaraz'));
  assert.ok(row.includes('2.8'));
});

test('CSV escapa nome com vírgula', () => {
  const csv = toCSV([buildSnapshot({ ...BASE, a: 'Silva, J.' })]);
  assert.ok(csv.includes('"Silva, J."'));
});

test('registra o veredito exibido, não só o preço', () => {
  const s = buildSnapshot({ ...BASE, src: 'op', side: 'b', act: 'lay', ev: 0.0812, com: 0.065 });
  assert.equal(s.src, 'op');
  assert.equal(s.side, 'b');
  assert.equal(s.act, 'lay');
  assert.equal(s.ev, 0.081);
  assert.equal(s.com, 0.065);
});

test('sem veredito os campos ficam nulos (observação antiga continua válida)', () => {
  const s = buildSnapshot(BASE);
  assert.equal(s.src, null);
  assert.equal(s.act, null);
  assert.equal(s.ev, null);
});

test('CSV traz as colunas do veredito', () => {
  const csv = toCSV([buildSnapshot({ ...BASE, src: 'op', side: 'a', act: 'back', ev: 0.05, com: 0.065 })]);
  const [head, row] = csv.split('\n');
  assert.ok(head.endsWith('pre,src,side,act,ev,com'));
  assert.ok(row.endsWith('op,a,back,0.05,0.065'));
});

test('chave de identidade distingue placares', () => {
  const s1 = buildSnapshot(BASE);
  const s2 = buildSnapshot({ ...BASE, live: { ...LIVE, setsA: 1 } });
  assert.notEqual(snapshotKey(s1), snapshotKey(s2));
});
