import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careerMoment, noAuge } from '../web/src/career.js';

const c = (o) => ({ rank: 10, points: 3000, rank12m: 10, points12m: 3000, peak: 10, peakDate: 20260608, snapshotDate: 20260608, date12m: 20250609, spikePct: null, spikeDate: null, ...o });

test('careerMoment: pontos multiplicados por 1,5 ou mais é ascensão', () => {
  // Auger-Aliassime: 1.685 -> 4.440 (x2,64), do #29 ao #4
  const m = careerMoment(c({ rank: 4, points: 4440, rank12m: 29, points12m: 1685 }));
  assert.equal(m.moment, 'ascensao');
});

test('careerMoment: perder um terço dos pontos ou mais é declínio', () => {
  // Gauff: 8.083 -> 4.879 (x0,60), do #2 ao #7
  const m = careerMoment(c({ rank: 7, points: 4879, rank12m: 2, points12m: 8083, peak: 2, peakDate: 20250101 }));
  assert.equal(m.moment, 'declinio');
});

test('careerMoment: parado no pico da carreira é auge', () => {
  // Sinner #1, pico #1
  const m = careerMoment(c({ rank: 1, points: 13500, rank12m: 1, points12m: 10880, peak: 1 }));
  assert.equal(m.moment, 'auge');
});

test('careerMoment: parado longe do pico é estável', () => {
  // Djokovic: #7 hoje, era #5; pico #1 em 2011. Não está caindo, mas não está no auge.
  const m = careerMoment(c({ rank: 7, points: 3760, rank12m: 5, points12m: 4630, peak: 1, peakDate: 20110704 }));
  assert.equal(m.moment, 'estavel');
});

test('careerMoment: Alcaraz #2 com pico #1 é auge, não estável (a régua aditiva)', () => {
  // peak*1.25 puniria quem foi bom: floor(1*1.25) = 1, folga zero.
  const m = careerMoment(c({ rank: 2, points: 11500, rank12m: 3, points12m: 10200, peak: 1, peakDate: 20220101 }));
  assert.equal(m.moment, 'auge');
});

test('careerMoment: Sabalenka #1->#1 (razão 0,787) NÃO é declínio — a defesa do T=1,5', () => {
  // Em T=1,3 o corte seria 0,769 e ela ficaria a 0,018 de ser publicada como "Em declínio".
  const m = careerMoment(c({ rank: 1, points: 8260, rank12m: 1, points12m: 10490, peak: 1 }));
  assert.equal(m.moment, 'auge');
});

test('careerMoment: sem ranking há 12 meses NÃO vira estável — vira sem-histórico', () => {
  // Venus Williams: #465 hoje, não estava no ranking há um ano. Ausência não é declínio.
  const m = careerMoment(c({ rank: 465, points: 123, rank12m: null, points12m: null, peak: 2 }));
  assert.equal(m.moment, null);
  assert.equal(m.reason, 'sem-historico');
});

test('careerMoment: pouco tênis no período NÃO vira estável nem ascensão', () => {
  // Darian King: 1 -> 7 pontos. Sem o portão, sairia "Em ascensão" (x7).
  const m = careerMoment(c({ rank: 900, points: 7, rank12m: 1100, points12m: 1, peak: 900 }));
  assert.equal(m.moment, null);
  assert.equal(m.reason, 'pouco-tenis');
});

test('careerMoment: rank == peak com pico ruim não vira auge sem base', () => {
  // Jang S.J. #1235, pico 1235: rank == peak, mas sem histórico não há rótulo.
  const m = careerMoment(c({ rank: 1235, points: 8, rank12m: null, points12m: null, peak: 1235 }));
  assert.equal(m.reason, 'sem-historico');
});

test('careerMoment: quem não tinha nenhum ponto há 12 meses é ascensão, sem dividir por zero', () => {
  const m = careerMoment(c({ rank: 187, points: 400, rank12m: 1324, points12m: 0, peak: 187 }));
  assert.equal(m.moment, 'ascensao');
  assert.equal(Number.isFinite(m.ratio), false);
});

test('careerMoment: career nulo ou vazio não estoura', () => {
  assert.equal(careerMoment(null).moment, null);
  assert.equal(careerMoment(undefined).moment, null);
  assert.equal(careerMoment({}).moment, null);
});

test('noAuge: folga de 25% do pico, entre 3 e 20 posições', () => {
  assert.equal(noAuge(1, 1), true);    // no topo
  assert.equal(noAuge(4, 1), true);    // 1 + piso 3
  assert.equal(noAuge(5, 1), false);
  assert.equal(noAuge(9, 7), true);    // 7 + piso 3 = 10
  assert.equal(noAuge(120, 100), true);  // 100 + teto 20
  assert.equal(noAuge(121, 100), false);
  assert.equal(noAuge(1010, 1000), true); // teto 20 segura a cauda
  assert.equal(noAuge(1021, 1000), false);
  assert.equal(noAuge(null, 1), false);
  assert.equal(noAuge(1, null), false);
});
