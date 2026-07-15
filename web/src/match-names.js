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

/** Mapa fullName (Sackmann) → nome canônico p/ o Elo, resolvendo ambiguidade em lote.
 *  - fullName que casa com UM jogador do tour, e é o ÚNICO do lote a casar com ele → usa o nome
 *    do tour (o jogador transita entre níveis e unifica no mesmo Elo).
 *  - 2+ fullNames distintos que casariam com o MESMO jogador do tour (irmãos/homônimos de mesma
 *    inicial, ex.: "Petros"/"Pavlos Tsitsipas" ↔ "Tsitsipas P.") → mantém os nomes completos
 *    (separa — o gate de inicial não distingue, então canonicalizar fundiria os dois num Elo só).
 *  - fullName que não casa com ninguém → mantém o fullName (Challenger puro).
 *  Limitação residual: só desambigua homônimos que aparecem AMBOS no lote de Challenger; se só um
 *  irmão jogou Challenger no período, ele ainda pode fundir com o do tour de mesma inicial. */
export function buildChallengerNames(challFullNames, tourPlayers) {
  const hitOf = new Map();   // fullName -> nome do tour (quando casa)
  const perTour = new Map(); // nome do tour -> Set(fullName distintos que casam nele)
  for (const full of challFullNames) {
    const p = matchPlayer(full, tourPlayers);
    if (!p) continue;
    hitOf.set(full, p.name);
    if (!perTour.has(p.name)) perTour.set(p.name, new Set());
    perTour.get(p.name).add(full);
  }
  const map = new Map();
  for (const full of challFullNames) {
    const tourName = hitOf.get(full);
    map.set(full, tourName && perTour.get(tourName).size === 1 ? tourName : full);
  }
  return map;
}
