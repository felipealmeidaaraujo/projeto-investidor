import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleLines } from '../web/src/patterns-view.js';

const STYLE = {
  firstSet: { pct: 87, n: 183 },
  comeback: { pct: 75, n: 40 },
  decider: { pct: 85, n: 60 },
  tieBreak: { pct: 78, n: 55 },
};

test('styleLines: rótulos claros com o número embutido', () => {
  const lines = styleLines(STYLE);
  assert.deepEqual(lines[0], { label: 'Começa ligado', detail: 'ganha o 1º set em 87%' });
  assert.deepEqual(lines[1], { label: 'Vira jogos', detail: 'vence 75% quando perde o 1º set' });
  assert.deepEqual(lines[2], { label: 'Aguenta a decisão', detail: 'vence 85% dos jogos de 3 sets' });
  assert.deepEqual(lines[3], { label: 'Forte no tie-break', detail: 'ganha 78% dos tie-breaks' });
});

test('styleLines: omite leituras com poucos dados', () => {
  const lines = styleLines({ firstSet: { pct: 90, n: 100 }, comeback: { pct: 50, n: 2 } });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].label, 'Começa ligado');
});

test('styleLines: style ausente devolve lista vazia', () => {
  assert.deepEqual(styleLines(null), []);
});

import { pressureLines } from '../web/src/patterns-view.js';

test('pressureLines: salva break point e fragilidade no saque, claros', () => {
  const lines = pressureLines({ bpSavedPct: 73, breaksAgainstPerSvGm: 0.05, breaksFor: 653, bpCreated: 1516 });
  assert.deepEqual(lines[0], { label: 'Salva break point', detail: 'segura 73% dos break points contra' });
  assert.deepEqual(lines[1], { label: 'Firmeza no saque', detail: 'é quebrado em 5% dos games de saque' });
});

test('pressureLines: pressure ausente ou vazio devolve lista vazia', () => {
  assert.deepEqual(pressureLines(null), []);
  assert.deepEqual(pressureLines({ bpSavedPct: null, breaksAgainstPerSvGm: null }), []);
});
