import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageAdjusted, ageAdjustText } from '../web/src/age-curve.js';

test('ageAdjusted: o mais novo GANHA probabilidade (o modelo o subestima)', () => {
  // Caso real medido: num par jovem≤23 × veterano≥30 do tour ATP, o modelo dá 49,4%
  // ao mais novo e ele ganha 57,5% — 8,16pp de erro (N=1.976).
  const r = ageAdjusted(0.5, 20, 33, 'ATP'); // A tem 20, B tem 33 -> gap +13
  assert.ok(r.prob > 0.5, `esperava > 0,5, veio ${r.prob}`);
  assert.equal(r.adjusted, true);
  assert.equal(r.gap, 13);
  assert.ok(r.delta > 0, 'o mais novo tem que GANHAR probabilidade');
});

test('ageAdjusted: gap de 13 anos move ~8pp num confronto 50/50', () => {
  const r = ageAdjusted(0.5, 20, 33, 'ATP');
  // sigmoid(logit(0,5) + 0,026*13) = sigmoid(0,338) = 0,5837
  assert.ok(Math.abs(r.prob - 0.584) < 0.005, `esperava ~0,584, veio ${r.prob}`);
  assert.equal(r.base, 0.5);
});

test('ageAdjusted: ANTISSIMETRIA — p(A,B) + p(B,A) = 1 (o teste que pega o intercepto)', () => {
  // Se alguém acrescentar um intercepto, isto quebra: a soma daria 1,0588 e o modelo
  // diria que os dois jogadores somam 105,9% de chance de vencer.
  for (const [pa, ia, ib] of [[0.5, 20, 33], [0.7, 25, 31], [0.35, 34, 22], [0.9, 19, 38]]) {
    const ab = ageAdjusted(pa, ia, ib, 'ATP');
    const ba = ageAdjusted(1 - pa, ib, ia, 'ATP');
    assert.ok(Math.abs(ab.prob + ba.prob - 1) < 1e-9, `p(A,B)+p(B,A)=${ab.prob + ba.prob}, esperava 1`);
  }
});

test('ageAdjusted: mesma idade não mexe em nada', () => {
  const r = ageAdjusted(0.62, 25, 25, 'ATP');
  assert.equal(r.prob, 0.62);
  assert.equal(r.delta, 0);
  assert.equal(r.adjusted, false);
});

test('ageAdjusted: a WTA NÃO é ajustada (a correção não paga fora da amostra)', () => {
  const r = ageAdjusted(0.5, 20, 33, 'WTA');
  assert.equal(r.prob, 0.5);
  assert.equal(r.adjusted, false);
});

test('ageAdjusted: sem idade não há ajuste — e não estoura', () => {
  for (const [a, b] of [[null, 30], [22, null], [null, null], [undefined, 30]]) {
    const r = ageAdjusted(0.5, a, b, 'ATP');
    assert.equal(r.prob, 0.5);
    assert.equal(r.adjusted, false);
  }
});

test('ageAdjusted: probabilidade nula ou inválida devolve null, sem estourar', () => {
  assert.equal(ageAdjusted(null, 20, 33, 'ATP'), null);
  assert.equal(ageAdjusted(undefined, 20, 33, 'ATP'), null);
});

test('ageAdjusted: a probabilidade corrigida nunca chega a 0% nem a 100%', () => {
  const alta = ageAdjusted(0.999, 18, 40, 'ATP');
  const baixa = ageAdjusted(0.001, 40, 18, 'ATP');
  assert.ok(alta.prob < 1, `passou de 100%: ${alta.prob}`);
  assert.ok(baixa.prob > 0, `chegou a 0%: ${baixa.prob}`);
});

test('ageAdjusted: tour desconhecido não é ajustado', () => {
  const r = ageAdjusted(0.5, 20, 33, 'ITF');
  assert.equal(r.adjusted, false);
});

test('ageAdjustText: diz quanto ajustou e qual seria a probabilidade sem o ajuste', () => {
  const a = ageAdjusted(0.5, 20, 33, 'ATP');
  const t = ageAdjustText(a, 'Fonseca J.');
  assert.ok(t.includes('13 anos'), t);
  assert.ok(t.includes('Fonseca J.'), t);
  assert.ok(t.includes('50,0%'), t); // a probabilidade sem o ajuste
});

test('ageAdjustText: sem ajuste não gera linha', () => {
  assert.equal(ageAdjustText(ageAdjusted(0.5, 25, 25, 'ATP'), 'A B'), null);
  assert.equal(ageAdjustText(ageAdjusted(0.5, 20, 33, 'WTA'), 'A B'), null);
  assert.equal(ageAdjustText(null, 'A B'), null);
});

test('ageAdjustText: arredonda a idade — "13 anos", não "12,7 anos"', () => {
  const t = ageAdjustText(ageAdjusted(0.5, 20.1, 32.8, 'ATP'), 'A B');
  assert.ok(t.includes('13 anos'), t);
  assert.ok(!t.includes('12,7'), t);
});

test('ageAdjustText: a probabilidade "sem o ajuste" e a do jogador NOMEADO (nao a do adversario)', () => {
  // A=30 anos, B=27 -> gap -3, o mais novo e o B. base e a prob de A (0,367).
  // O card nomeia o B, entao "sem o ajuste" tem que ser a prob do B = 1 - 0,367 = 0,633.
  const aj = ageAdjusted(0.367, 30, 27, 'ATP');
  const t = ageAdjustText(aj, 'Tsitsipas S.');
  assert.ok(t.includes('63,3%'), 'esperava a prob do mais novo (63,3%), veio: ' + t);
  assert.ok(!t.includes('36,7%'), 'nao pode mostrar a prob do adversario: ' + t);
});

test('ageAdjustText: gap positivo (A mais novo) continua usando a base direto', () => {
  // A=20, B=33 -> gap +13, o mais novo e o A. base = prob de A = 0,5.
  const aj = ageAdjusted(0.5, 20, 33, 'ATP');
  const t = ageAdjustText(aj, 'Jovem A.');
  assert.ok(t.includes('50,0%'), t);
});
