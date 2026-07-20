import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridStatus, isLiveMatch, liveWindowFor, humanAge, GRID_WARN_MS, GRID_STALE_MS, LIVE_MAX_BO3, LIVE_MAX_BO5 } from '../web/src/freshness.js';

const AGORA = Date.parse('2026-07-20T03:00:00Z');
const antes = (ms) => new Date(AGORA - ms).toISOString();
const min = (n) => n * 60 * 1000;
const hora = (n) => n * 60 * 60 * 1000;

const jogo = (extra = {}) => ({ status: 'IN_PROGRESS', tour: 'ATP', tournament: 'Lincoln (USA)', commence: antes(min(40)), ...extra });

// --- frescor da grade ---
test('grade recém-gerada: sem aviso, sem suspeita', () => {
  const s = gridStatus(antes(min(10)), AGORA);
  assert.equal(s.warn, false);
  assert.equal(s.stale, false);
  assert.equal(s.ageMs, min(10));
});

test('passou do ciclo de 1h30: avisa mas ainda não suspende', () => {
  const s = gridStatus(antes(GRID_WARN_MS + min(5)), AGORA);
  assert.equal(s.warn, true);
  assert.equal(s.stale, false);
});

test('passou de 2h: retrato velho demais', () => {
  const s = gridStatus(antes(GRID_STALE_MS + min(1)), AGORA);
  assert.equal(s.stale, true);
});

test('o caso real que quebrou: grade de 3h10', () => {
  const s = gridStatus(antes(hora(3) + min(10)), AGORA);
  assert.equal(s.stale, true);
  assert.equal(humanAge(s.ageMs), 'há 3h10');
});

test('sem carimbo de geração, trata como velho (não inventa confiança)', () => {
  for (const v of [null, undefined, '', 'nao-e-data']) {
    const s = gridStatus(v, AGORA);
    assert.equal(s.stale, true, `falhou para ${JSON.stringify(v)}`);
    assert.equal(s.ageMs, null);
  }
});

// --- janela por formato ---
test('melhor-de-3 é o padrão; só Slam do ATP usa a janela longa', () => {
  assert.equal(liveWindowFor(jogo()), LIVE_MAX_BO3);
  assert.equal(liveWindowFor(jogo({ tournament: 'Wimbledon' })), LIVE_MAX_BO5);
  assert.equal(liveWindowFor(jogo({ tournament: 'Roland Garros' })), LIVE_MAX_BO5);
  assert.equal(liveWindowFor(jogo({ tour: 'WTA', tournament: 'Wimbledon' })), LIVE_MAX_BO3, 'WTA é melhor-de-3 até em Slam');
});

// --- selo ao vivo ---
test('jogo em andamento, grade fresca, começou há pouco → ao vivo', () => {
  assert.equal(isLiveMatch(jogo(), { now: AGORA, gridStale: false }), true);
});

test('O BUG: Challenger que começou há 3,6h NÃO é ao vivo', () => {
  const g = jogo({ commence: antes(hora(3) + min(36)) });
  assert.equal(isLiveMatch(g, { now: AGORA, gridStale: false }), false, 'melhor-de-3 não dura 3,6h');
});

test('o mesmo tempo num Slam do ATP ainda pode estar rolando', () => {
  const g = jogo({ tournament: 'US Open', commence: antes(hora(3) + min(36)) });
  assert.equal(isLiveMatch(g, { now: AGORA, gridStale: false }), true);
});

test('grade velha suspende o selo mesmo com tudo o mais batendo', () => {
  assert.equal(isLiveMatch(jogo(), { now: AGORA, gridStale: true }), false);
});

test('status diferente de "em andamento" nunca é ao vivo', () => {
  assert.equal(isLiveMatch(jogo({ status: 'SCHEDULED' }), { now: AGORA }), false);
  assert.equal(isLiveMatch(jogo({ status: 'SUSPENDED' }), { now: AGORA }), false);
  assert.equal(isLiveMatch(null, { now: AGORA }), false);
});

test('sem horário de início confiável, confia no status', () => {
  assert.equal(isLiveMatch(jogo({ commence: null }), { now: AGORA, gridStale: false }), true);
});

// --- idade em texto ---
test('idade legível', () => {
  assert.equal(humanAge(0), 'agora mesmo');
  assert.equal(humanAge(min(1)), 'há 1 min');
  assert.equal(humanAge(min(45)), 'há 45 min');
  assert.equal(humanAge(hora(1)), 'há 1h');
  assert.equal(humanAge(hora(2) + min(5)), 'há 2h05');
  assert.equal(humanAge(null), null);
});
