// Funções puras que leem o placar (score do Sackmann) e derivam padrões de jogo.
// O score é sempre da perspectiva do VENCEDOR da partida. Testado em tests/game-patterns.test.js.

/** "6-4 3-6 7-6(5)" -> { sets:[{w,l,tb}], walkover, incomplete }.
 *  w/l = games do vencedor/perdedor da partida naquele set; tb = placar do tie-break (ou null). */
export function parseScore(score) {
  const raw = (score || '').trim();
  if (!raw) return { sets: [], walkover: false, incomplete: false };
  if (/^w\/o$/i.test(raw) || /walkover/i.test(raw)) return { sets: [], walkover: true, incomplete: true };
  const incomplete = /\b(ret|def|abn|abd)\b/i.test(raw);
  const sets = [];
  for (const tok of raw.split(/\s+/)) {
    const m = tok.match(/^(\d+)-(\d+)(?:\((\d+)\))?$/);
    if (!m) continue;
    sets.push({ w: Number(m[1]), l: Number(m[2]), tb: m[3] != null ? Number(m[3]) : null });
  }
  return { sets, walkover: false, incomplete };
}
