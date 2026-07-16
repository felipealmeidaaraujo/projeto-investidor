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

test('careerMoment: Sabalenka #1->#1 com queda de pontos continua no auge', () => {
  // Razão 0,787: perto do corte de T=1,3 (0,769), a apenas 0,018 dele, mas não o atravessa —
  // ou seja, este teste passaria com T=1,5 ou T=1,3. Não trava o limiar sozinho (ver o
  // teste do Cerundolo logo abaixo, que atravessa a fronteira de verdade).
  const m = careerMoment(c({ rank: 1, points: 8260, rank12m: 1, points12m: 10490, peak: 1 }));
  assert.equal(m.moment, 'auge');
});

test('careerMoment: Cerundolo (razão 0,726) é estável em T=1,5 mas viraria declínio em T=1,3 — trava o limiar', () => {
  // Caso real: #18 -> #27, pontos 2.285 -> 1.660 (razão 0,726).
  // 0,726 está ENTRE 1/1,5 (0,667) e 1/1,3 (0,769): com T=1,5 não é declínio; com T=1,3 seria.
  // Se alguém baixar o T para 1,3, ESTE teste quebra — o da Sabalenka (0,787) não quebraria.
  const m = careerMoment(c({ rank: 27, points: 1660, rank12m: 18, points12m: 2285, peak: 18, peakDate: 20250601 }));
  assert.equal(m.moment, 'estavel');
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
  assert.equal(noAuge(50, 40), true);   // 40 + round(0.25*40)=10 -> folga até 50, sem grampo
  assert.equal(noAuge(51, 40), false);
  assert.equal(noAuge(null, 1), false);
  assert.equal(noAuge(1, null), false);
});

test('careerMoment: sem pico não vira "estável" por acidente (a regra de ouro)', () => {
  // Hoje inalcançável — o buildTrajectories sempre dá um pico a quem está no ranking.
  // A guarda existe para que uma mudança futura no pipeline não vire fallback silencioso.
  const m = careerMoment(c({ rank: 30, points: 1500, rank12m: 30, points12m: 1500, peak: null, peakDate: null }));
  assert.equal(m.moment, null);
  assert.equal(m.reason, 'sem-dados');
});
