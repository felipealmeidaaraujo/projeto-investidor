import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tacticalSuggestion } from '../web/src/tactics.js';

const R = { favorite: 'Sinner J.', underdog: 'Borges N.', favoriteProb: 0.72, marginLabel: 'favorito claro' };

test('tacticalSuggestion: favorito que começa bem + azarão que vira jogos', () => {
  const styleFav = { firstSet: { pct: 87, n: 100 }, decider: { pct: 80, n: 50 } };
  const styleUnd = { comeback: { pct: 45, n: 30 } };
  const t = tacticalSuggestion(R, styleFav, styleUnd, 'saibro');
  assert.equal(t.pende, 'No saibro, o Sinner J. é favorito claro (72%).');
  assert.ok(t.caminho.includes('ganha o 1º set em 87%'), t.caminho);
  assert.ok(t.caminho.includes('green cedo'), t.caminho);
  assert.ok(t.risco.includes('vira jogos'), t.risco);
  assert.ok(t.risco.includes('45%'), t.risco);
});

test('tacticalSuggestion: equilibrado + favorito que resolve na reta final', () => {
  const r = { favorite: 'A', underdog: 'B', favoriteProb: 0.53, marginLabel: 'equilibrado' };
  const styleFav = { firstSet: { pct: 52, n: 80 }, decider: { pct: 62, n: 40 } };
  const t = tacticalSuggestion(r, styleFav, null, 'quadra dura');
  assert.ok(t.pende.startsWith('Jogo parelho'), t.pende);
  assert.ok(t.caminho.includes('reta final'), t.caminho);
  assert.ok(t.risco.includes('B'), t.risco);
});

test('tacticalSuggestion: sem padrões (jogador obscuro) dá caminho e risco genéricos', () => {
  const t = tacticalSuggestion(R, null, null, 'grama');
  assert.ok(t.caminho.includes('Sinner J.'), t.caminho);
  assert.ok(t.risco.includes('Borges N.'), t.risco);
});
