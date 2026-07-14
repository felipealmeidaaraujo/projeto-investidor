// Casa nomes completos (The Odds API: "Jannik Sinner") com os do modelo ("Sinner J.").
// Estratégia: comparar sobrenome normalizado + inicial do primeiro nome.

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

/** Nome completo "Primeiro ... Último" → { surname (tudo após o 1º token), initial }. */
function parseFullName(full) {
  const tokens = full.trim().split(/\s+/);
  if (tokens.length < 2) return { surname: normName(full), initial: '' };
  const initial = (tokens[0][0] || '').toLowerCase();
  const surname = normName(tokens.slice(1).join(''));
  return { surname, initial };
}

/** Acha o jogador do modelo correspondente ao nome completo (ou null). */
export function matchPlayer(fullName, players) {
  const f = parseFullName(fullName);
  for (const p of players) {
    const m = parseModelName(p.name);
    if (m.surname && m.surname === f.surname && (f.initial === '' || m.initial === f.initial)) return p;
  }
  return null;
}

/** Um nome completo ("Carlos Alcaraz") e um nome de modelo ("Alcaraz C.") são o mesmo jogador? */
export function matchesModelName(fullName, modelName) {
  const f = parseFullName(fullName);
  const m = parseModelName(modelName);
  return !!m.surname && m.surname === f.surname && (f.initial === '' || m.initial === f.initial);
}
