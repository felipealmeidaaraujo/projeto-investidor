import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdProb, gameWinProb, winProbFromState, impliedServeProbs, liveFairOdds, overreaction, commissionZone, netEdge, devigPair } from '../web/src/inplay.js';

const approx = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

const START = { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true };

// --- hold (manter o saque) ---
test('holdProb: saque 50% no ponto → 50% de manter', () => {
  approx(holdProb(0.5), 0.5);
});
test('holdProb: saque 60% no ponto → ~73,6% de manter', () => {
  approx(holdProb(0.6), 0.7357, 2e-3);
});
test('holdProb: saque perfeito mantém sempre; nulo nunca', () => {
  approx(holdProb(1), 1);
  approx(holdProb(0), 0);
});

// --- partida (simetria, limites, monotonicidade) ---
test('winProbFromState: jogadores iguais no início → 50%', () => {
  approx(winProbFromState(START, 0.64, 0.64, 3), 0.5, 5e-3);
});
test('winProbFromState: partida já decidida → 1 (ou 0)', () => {
  assert.equal(winProbFromState({ ...START, setsA: 2 }, 0.6, 0.6, 3), 1);
  assert.equal(winProbFromState({ ...START, setsB: 2 }, 0.6, 0.6, 3), 0);
});
test('winProbFromState: saque melhor → mais chance', () => {
  assert.ok(winProbFromState(START, 0.7, 0.6, 3) > 0.5);
});

// --- a quebra vale (dinâmica ao vivo) ---
test('winProbFromState: quebrado à frente (1-0 sacando) favorece, mesmo entre iguais', () => {
  const upBreak = { setsA: 0, setsB: 0, gamesA: 1, gamesB: 0, serverIsA: true };
  assert.ok(winProbFromState(upBreak, 0.64, 0.64, 3) > 0.52);
});

// --- deriva a força de saque a partir da prob pré-jogo (consistência) ---
test('impliedServeProbs: recupera a probabilidade alvo no início do jogo', () => {
  const { pA, pB } = impliedServeProbs(0.75, { base: 0.64, bestOf: 3 });
  approx(winProbFromState(START, pA, pB, 3), 0.75, 6e-3);
});

test('liveFairOdds: no início ≈ odd justa pré-jogo', () => {
  const r = liveFairOdds(0.5, START, { base: 0.64, bestOf: 3 });
  approx(r.probA, 0.5, 5e-3);
  approx(r.fairOddA, 2.0, 3e-2);
  approx(r.probA + r.probB, 1);
});

test('liveFairOdds: placar favorável baixa a odd do líder', () => {
  const led = liveFairOdds(0.5, { setsA: 1, setsB: 0, gamesA: 3, gamesB: 0, serverIsA: true }, { base: 0.64, bestOf: 3 });
  assert.ok(led.probA > 0.5);       // A na frente → mais provável
  assert.ok(led.fairOddA < 2.0);    // odd justa de A cai
});

test('overreaction: mercado paga mais que o justo → back; níveis conservadores', () => {
  const r = overreaction(2.0, 2.4); // +20% → leve, back
  approx(r.divPct, 20); assert.equal(r.level, 'leve'); assert.equal(r.back, true);
  assert.equal(overreaction(2.0, 2.6).level, 'moderada'); // +30%
  assert.equal(overreaction(2.0, 3.0).level, 'forte'); // +50%
});

test('overreaction: mercado paga menos → lay; abaixo de 15% → em linha (level null)', () => {
  const r = overreaction(2.0, 1.5); // -25% → moderada, lay
  assert.equal(r.back, false); assert.equal(r.level, 'moderada');
  assert.equal(overreaction(2.0, 2.2).level, null); // +10% → em linha
});

test('overreaction: entradas inválidas → null', () => {
  assert.equal(overreaction(1, 2.0), null);
  assert.equal(overreaction(2.0, null), null);
  assert.equal(overreaction(2.0, 0.9), null);
  assert.equal(overreaction(Infinity, 2.0), null);
});

// --- comissão: zona morta e EV líquido ---
test('zona morta cresce com a odd (comissão 6,5%)', () => {
  const z2 = commissionZone(2.0, 0.065);
  approx(z2.layMax, 1.935);
  approx(z2.backMin, 2.0695, 1e-3);
  const z5 = commissionZone(5.0, 0.065);
  approx(z5.layMax, 4.74);
  approx(z5.backMin, 5.2781, 1e-3);
  // quanto maior a odd, mais larga a zona morta em termos relativos
  assert.ok((z5.backMin / 5 - 1) > (z2.backMin / 2 - 1));
});

test('sem comissão, a zona morta some (os dois limites viram a justa)', () => {
  const z = commissionZone(2.0, 0);
  approx(z.layMax, 2.0);
  approx(z.backMin, 2.0);
});

test('odd justa inválida ou comissão absurda → null', () => {
  assert.equal(commissionZone(1, 0.065), null);
  assert.equal(commissionZone(2, 1), null);
  assert.equal(commissionZone(2, -0.1), null);
  assert.equal(netEdge(2, 0.5, 0.065), null);
});

test('mercado dentro da zona morta: nenhum lado cobre a comissão', () => {
  const dentro = netEdge(2.0, 2.0, 0.065); // exatamente no justo
  assert.equal(dentro.covers, false);
  assert.ok(dentro.ev < 0);
  const quase = netEdge(2.0, 2.05, 0.065); // abaixo do backMin de 2.07
  assert.equal(quase.back, true);
  assert.equal(quase.covers, false, 'a 2.05 o back ainda não paga a comissão');
});

test('mercado acima do backMin: back passa a ter EV positivo', () => {
  const bom = netEdge(2.0, 2.2, 0.065);
  assert.equal(bom.back, true);
  assert.equal(bom.covers, true);
  approx(bom.ev, 0.5 * 1.2 * 0.935 - 0.5, 1e-6);
});

test('mercado abaixo do layMax: lay passa a ter EV positivo', () => {
  const bom = netEdge(2.0, 1.85, 0.065);
  assert.equal(bom.back, false);
  assert.equal(bom.covers, true);
  // o ev do lay é por unidade de RESPONSABILIDADE (0,85 aqui), não do stake do apostador
  approx(bom.ev, (0.5 * 0.935 - 0.5 * 0.85) / 0.85, 1e-6);
});

test('a comissão come a divergência: 17% bruto vira bem menos líquido', () => {
  const r = netEdge(2.05, 2.4, 0.065);
  const bruto = (1 / 2.05) * 2.4 - 1; // EV sem comissão
  assert.ok(r.ev > 0 && r.ev < bruto, 'o líquido tem que ser positivo mas menor que o bruto');
  approx(bruto, 0.1707, 1e-3);
  approx(r.ev, 0.1264, 1e-3);
});

// --- de-vig do par de odds (âncora de mercado) ---
test('devigPair: par simétrico dá 50/50', () => {
  approx(devigPair(2.0, 2.0), 0.5);
});
test('devigPair: tira a margem embutida (soma das probs volta a 1)', () => {
  const p = devigPair(1.5, 2.5); // 66,7% + 40% = 106,7% de margem
  approx(p, (1 / 1.5) / (1 / 1.5 + 1 / 2.5), 1e-9);
  approx(p, 0.625, 1e-3);
});
test('devigPair: favorito curto vira prob alta', () => {
  const p = devigPair(1.25, 4.5);
  assert.ok(p > 0.75 && p < 0.82, `veio ${p}`);
});
test('devigPair: precisa das DUAS odds válidas', () => {
  assert.equal(devigPair(2.0, null), null);
  assert.equal(devigPair(null, 2.0), null);
  assert.equal(devigPair(1.0, 2.0), null);
  assert.equal(devigPair(NaN, 2.0), null);
});

test('INVARIANTE: bancar A é o mesmo trade que lançar B — mesmo ev', () => {
  // Par devigado: A justa 5.00 (p=0,2) ⇒ B justa 1.25. Mercado paga 6.00 em A ⇒ 1.20 em B.
  const back = netEdge(5.0, 6.0, 0.065);
  const lay = netEdge(1.25, 1.2, 0.065);
  assert.equal(back.back, true);
  assert.equal(lay.back, false);
  approx(lay.ev, back.ev, 1e-9);
});

test('o ev do lay é sobre a responsabilidade, não sobre o stake do apostador', () => {
  const r = netEdge(4.0, 3.0, 0.065);
  assert.equal(r.back, false);
  assert.equal(r.liability, 2);
  const semDividir = (1 - 1 / 4) * 0.935 - (1 / 4) * 2;
  approx(r.ev, semDividir / 2, 1e-9);
  assert.ok(r.ev < semDividir, 'lay longo: dividir pela liability REDUZ o retorno aparente');
});

test('lay curto: dividir pela responsabilidade AUMENTA o retorno (liability < 1)', () => {
  const r = netEdge(1.25, 1.2, 0.065);
  const semDividir = (1 - 1 / 1.25) * 0.935 - (1 / 1.25) * 0.2;
  approx(r.ev, semDividir / 0.2, 1e-9);
  assert.ok(r.ev > semDividir);
});

test('o veredito de valor não muda com o denominador (só a magnitude)', () => {
  assert.equal(netEdge(2.0, 1.85, 0.065).covers, true);
  assert.equal(netEdge(2.0, 1.98, 0.065).covers, false);
});

// --- probabilidade do game a partir do placar de PONTOS ---
test('gameWinProb de 0-0 é exatamente o holdProb (consistência do motor)', () => {
  for (const p of [0.5, 0.6, 0.64, 0.7, 0.75]) approx(gameWinProb(p, 0, 0), holdProb(p), 1e-12);
});

test('deuce: 3-3 é a fórmula clássica p²/(p²+q²)', () => {
  const p = 0.64, q = 0.36;
  approx(gameWinProb(p, 3, 3), (p * p) / (p * p + q * q), 1e-12);
});

test('vantagem: sacador à frente vale mais que deuce; devolvedor à frente, menos', () => {
  const p = 0.64;
  const d = gameWinProb(p, 3, 3);
  assert.ok(gameWinProb(p, 4, 3) > d, 'vantagem do sacador');
  assert.ok(gameWinProb(p, 3, 4) < d, 'vantagem do devolvedor');
});

test('game já decidido devolve 1 ou 0', () => {
  assert.equal(gameWinProb(0.64, 4, 0), 1);
  assert.equal(gameWinProb(0.64, 4, 2), 1);
  assert.equal(gameWinProb(0.64, 0, 4), 0);
  assert.equal(gameWinProb(0.64, 2, 4), 0);
});

test('0-40 é MUITO pior que 0-0 — é o buraco que isso conserta', () => {
  const p = 0.64;
  const zero = gameWinProb(p, 0, 0);
  const breakPoint = gameWinProb(p, 0, 3);
  assert.ok(breakPoint < zero * 0.5, `0-40 (${breakPoint}) deveria ser bem pior que 0-0 (${zero})`);
});

test('mais pontos pro sacador nunca piora a chance dele', () => {
  const p = 0.64;
  for (const b of [0, 1, 2, 3]) {
    for (let a = 0; a < 3; a++) {
      assert.ok(gameWinProb(p, a + 1, b) >= gameWinProb(p, a, b), `quebrou em ${a}->${a + 1} x ${b}`);
    }
  }
});

test('entrada inválida devolve null', () => {
  assert.equal(gameWinProb(NaN, 0, 0), null);
  assert.equal(gameWinProb(1.5, 0, 0), null);
});

// --- pontos dentro do cálculo da PARTIDA ---
test('sem pontos, o resultado é idêntico ao de antes (não quebrou nada)', () => {
  const st = { setsA: 0, setsB: 1, gamesA: 3, gamesB: 2, serverIsA: true };
  approx(winProbFromState(st, 0.64, 0.62, 3), winProbFromState({ ...st, ptsA: 0, ptsB: 0 }, 0.64, 0.62, 3), 1e-12);
});

test('0-40 no saque de A derruba a chance de A na PARTIDA', () => {
  const base = { setsA: 0, setsB: 0, gamesA: 3, gamesB: 3, serverIsA: true };
  const neutro = winProbFromState(base, 0.64, 0.64, 3);
  const contra = winProbFromState({ ...base, ptsA: 0, ptsB: 3 }, 0.64, 0.64, 3);
  const favor = winProbFromState({ ...base, ptsA: 3, ptsB: 0 }, 0.64, 0.64, 3);
  assert.ok(contra < neutro, 'break point contra tem que baixar');
  assert.ok(favor > neutro, 'game point a favor tem que subir');
  assert.ok(neutro - contra > 0.05, `a queda tem que ser material, veio ${(neutro - contra).toFixed(3)}`);
});

test('pontos no 6-6 são tratados como TIEBREAK', () => {
  const st = { setsA: 0, setsB: 0, gamesA: 6, gamesB: 6, serverIsA: true };
  const neutro = winProbFromState(st, 0.64, 0.64, 3);
  const bem = winProbFromState({ ...st, ptsA: 5, ptsB: 0 }, 0.64, 0.64, 3);
  const mal = winProbFromState({ ...st, ptsA: 0, ptsB: 5 }, 0.64, 0.64, 3);
  assert.ok(bem > neutro && mal < neutro);
  assert.ok(bem - mal > 0.2, 'no tiebreak avançado a diferença tem que ser grande');
});

test('game point convertido leva ao mesmo estado que o game já ganho', () => {
  const emJogo = winProbFromState({ setsA: 0, setsB: 0, gamesA: 2, gamesB: 2, serverIsA: true, ptsA: 4, ptsB: 0 }, 0.64, 0.62, 3);
  const jaGanho = winProbFromState({ setsA: 0, setsB: 0, gamesA: 3, gamesB: 2, serverIsA: false }, 0.64, 0.62, 3);
  approx(emJogo, jaGanho, 1e-12);
});

// ---- Quem saca: par vs ímpar ----
// Isto NÃO é bug, por mais que pareça. Em placar de games PAR os games que faltam se
// emparelham (um saque de cada), e quem saca primeiro se anula — conferido contra uma
// implementação independente e contra simulação Monte Carlo (0,8728 vs 0,8720 em 400 mil
// sets). Em placar ÍMPAR sobra um game desemparelhado e o sacador pesa. Já cheguei a
// chamar a simetria de bug uma vez; o teste existe pra ninguém "consertá-la".
test('em placar PAR, trocar o sacador não muda a probabilidade', () => {
  for (const [ga, gb] of [[0, 0], [2, 2], [4, 4], [5, 5], [3, 1]]) {
    const st = { setsA: 0, setsB: 0, gamesA: ga, gamesB: gb };
    const comA = winProbFromState({ ...st, serverIsA: true }, 0.70, 0.55, 3);
    const comB = winProbFromState({ ...st, serverIsA: false }, 0.70, 0.55, 3);
    approx(comA, comB, 1e-12);
  }
});

test('em placar ÍMPAR, o sacador muda a probabilidade de forma material', () => {
  for (const [ga, gb] of [[1, 0], [3, 2], [4, 3], [5, 4]]) {
    const st = { setsA: 0, setsB: 0, gamesA: ga, gamesB: gb };
    const comA = winProbFromState({ ...st, serverIsA: true }, 0.70, 0.55, 3);
    const comB = winProbFromState({ ...st, serverIsA: false }, 0.70, 0.55, 3);
    // O efeito cresce conforme o set avança (0,9pp no 1-0, ~2,1pp no 5-4): quanto menos
    // games faltam, mais pesa o game desemparelhado.
    assert.ok(comA > comB, `sacar tem que ajudar A em ${ga}-${gb}`);
    assert.ok(comA - comB > 0.005, `o efeito tem que ser material em ${ga}-${gb}, veio ${(comA - comB).toFixed(4)}`);
  }
});
