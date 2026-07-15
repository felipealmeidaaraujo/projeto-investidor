// Casa nomes completos ("Jannik Sinner") com os do modelo ("Sinner J.").
// Estratégia: sobrenome normalizado (candidatos p/ nome-do-meio) + inicial do primeiro nome.

export function normName(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Nome do modelo "Sobrenome... I." → { surname, initial }. */
function parseModelName(name) {
  const tokens = name.trim().split(/\s+/);
  const initial = (tokens[tokens.length - 1].replace(/\./g, '')[0] || '').toLowerCase();
  const surname = normName(tokens.slice(0, -1).join(''));
  return { surname, initial };
}

/** Nome completo → inicial do 1º nome + candidatos de sobrenome.
 *  Candidatos = "tudo após o 1º token" (pega "de Minaur", "Bautista Agut") E
 *  "só o último token" (pega nome-do-meio: "Juan Pablo Varillas" → "Varillas"). */
function fullNameKey(full) {
  const tokens = full.trim().split(/\s+/);
  if (tokens.length < 2) return { initial: '', cands: [normName(full)].filter(Boolean) };
  const initial = (tokens[0][0] || '').toLowerCase();
  const rest = tokens.slice(1);
  const cands = [...new Set([normName(rest.join('')), normName(rest[rest.length - 1])])].filter(Boolean);
  return { initial, cands };
}

/** Acha o jogador do modelo correspondente ao nome completo (ou null). */
export function matchPlayer(fullName, players) {
  const { initial, cands } = fullNameKey(fullName);
  for (const p of players) {
    const m = parseModelName(p.name);
    if (m.surname && cands.includes(m.surname) && (initial === '' || m.initial === initial)) return p;
  }
  return null;
}

/** Um nome completo ("Carlos Alcaraz") e um nome de modelo ("Alcaraz C.") são o mesmo jogador? */
export function matchesModelName(fullName, modelName) {
  const { initial, cands } = fullNameKey(fullName);
  const m = parseModelName(modelName);
  return !!m.surname && cands.includes(m.surname) && (initial === '' || m.initial === initial);
}

/** Nome canônico p/ o Elo: nome do modelo se o jogador transita; senão o próprio fullName (puro). */
export function canonicalName(fullName, players) {
  return matchPlayer(fullName, players)?.name ?? fullName;
}
