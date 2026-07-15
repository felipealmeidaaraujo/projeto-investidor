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
  if (tokens.length < 2) return { initial: '', candidates: [normName(full)].filter(Boolean) };
  const initial = (tokens[0][0] || '').toLowerCase();
  const rest = tokens.slice(1);
  const candidates = [...new Set([normName(rest.join('')), normName(rest[rest.length - 1])])].filter(Boolean);
  return { initial, candidates };
}

// Limitação: casa por sobrenome + inicial do 1º nome — homônimos com a mesma inicial
// não são distinguidos (raro; o gate de inicial cobre o caso comum de irmãos).
/** Acha o jogador do modelo correspondente ao nome completo (ou null). */
export function matchPlayer(fullName, players) {
  const { initial, candidates } = fullNameKey(fullName);
  for (const p of players) {
    const m = parseModelName(p.name);
    if (m.surname && candidates.includes(m.surname) && (initial === '' || m.initial === initial)) return p;
  }
  return null;
}

/** Um nome completo ("Carlos Alcaraz") e um nome de modelo ("Alcaraz C.") são o mesmo jogador? */
export function matchesModelName(fullName, modelName) {
  const { initial, candidates } = fullNameKey(fullName);
  const m = parseModelName(modelName);
  return !!m.surname && candidates.includes(m.surname) && (initial === '' || m.initial === initial);
}

/** Resolve um nome contra o modelo, seja no formato do modelo ("Borges N.") ou completo ("Nuno Borges"). */
export function findModelPlayer(name, players) {
  const n = normName(name);
  for (const p of players) if (normName(p.name) === n) return p;
  return matchPlayer(name, players);
}

/** Mapa fullName (Sackmann) → nome canônico p/ o Elo, resolvendo ambiguidade em lote.
 *  - fullName que casa com UM jogador do tour, único do lote a casar → nome do tour (transita).
 *  - 2+ fullNames distintos casando com o MESMO jogador do tour (homônimos de mesma inicial):
 *    o "dono" do nó é quem tem MUITO mais partidas de main draw (`tourCounts`): se o 1º tem ≥3× o 2º,
 *    ele canonicaliza e os outros ficam crus; senão (volumes parecidos → ambíguo) todos ficam crus.
 *  - fullName que não casa com ninguém → mantém o fullName (Challenger puro).
 *  Limitação residual: homônimos de tour com volumes parecidos ficam separados (evita merge errado). */
export function buildChallengerNames(challFullNames, tourPlayers, tourCounts = new Map()) {
  const hitOf = new Map();   // fullName -> nome do tour (quando casa)
  const perTour = new Map(); // nome do tour -> [fullNames distintos que casam nele]
  for (const full of challFullNames) {
    const p = matchPlayer(full, tourPlayers);
    if (!p) continue;
    hitOf.set(full, p.name);
    if (!perTour.has(p.name)) perTour.set(p.name, []);
    perTour.get(p.name).push(full);
  }
  const owner = new Map(); // nome do tour -> fullName dono (ou null se ambíguo)
  for (const [tourName, group] of perTour) {
    if (group.length === 1) { owner.set(tourName, group[0]); continue; }
    const ranked = group
      .map((n) => ({ n, c: tourCounts.get(n) || 0 }))
      .filter((x) => x.c > 0)
      .sort((a, b) => b.c - a.c);
    owner.set(tourName, ranked.length && ranked[0].c >= 3 * (ranked[1]?.c || 0) ? ranked[0].n : null);
  }
  const map = new Map();
  for (const full of challFullNames) {
    const tourName = hitOf.get(full);
    map.set(full, tourName && owner.get(tourName) === full ? tourName : full);
  }
  return map;
}
