// Frescor da grade e honestidade do selo "ao vivo".
//
// POR QUÊ: a grade é um RETRATO regenerado de hora em hora. Em 20/07 o robô agendado foi
// cancelado, o dado ficou 3h parado, e o app seguiu exibindo "AO VIVO" num Challenger que
// já tinha acabado — com a mesma confiança de um dado de 2 minutos. O usuário sentou pra
// operar um jogo encerrado. Regra que sai daqui: o app mostra a IDADE do dado e, quando o
// retrato é velho, CALA sobre o que está acontecendo agora em vez de chutar.
//
// Funções puras (o "agora" é injetado). Testado em tests/freshness.test.js.

/** Passado disso, a grade já deveria ter sido regenerada — merece aviso. */
export const GRID_WARN_MS = 90 * 60 * 1000;
/** Passado disso, o retrato é velho demais pra sustentar qualquer afirmação de "agora". */
export const GRID_STALE_MS = 2 * 60 * 60 * 1000;

// Duração plausível por formato. Quase tudo é melhor-de-3 (1h30–2h30 típico);
// só Slam masculino é melhor-de-5. A janela antiga (4h30 pra tudo) era generosa demais.
export const LIVE_MAX_BO3 = 3 * 60 * 60 * 1000;
export const LIVE_MAX_BO5 = 5 * 60 * 60 * 1000;
const SLAM_RE = /austral|roland|french open|wimbledon|us open/i;

/** Estado de frescor da grade. `generatedAt` é o carimbo do arquivo (ISO) — pode faltar. */
export function gridStatus(generatedAt, now = Date.now()) {
  const ms = generatedAt ? Date.parse(generatedAt) : NaN;
  if (Number.isNaN(ms)) return { ageMs: null, warn: true, stale: true };
  const ageMs = Math.max(0, now - ms);
  return { ageMs, warn: ageMs > GRID_WARN_MS, stale: ageMs > GRID_STALE_MS };
}

/** Janela máxima plausível de duração da partida. */
export function liveWindowFor(game) {
  return game?.tour === 'ATP' && SLAM_RE.test(game?.tournament || '') ? LIVE_MAX_BO5 : LIVE_MAX_BO3;
}

/**
 * O jogo está mesmo rolando agora?
 * Exige as três coisas: status de "em andamento" NO RETRATO, retrato recente o bastante,
 * e início dentro da janela plausível do formato. Sem horário confiável, confia no status.
 */
export function isLiveMatch(game, { now = Date.now(), gridStale = false } = {}) {
  if (!game || game.status !== 'IN_PROGRESS') return false;
  if (gridStale) return false;
  const started = game.commence ? Date.parse(game.commence) : NaN;
  if (Number.isNaN(started)) return true;
  return now - started < liveWindowFor(game);
}

/** "agora mesmo" / "há 12 min" / "há 3h10" — idade em português de gente. */
export function humanAge(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `há ${h}h${r ? String(r).padStart(2, '0') : ''}`;
}
