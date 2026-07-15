// Busca de jogadores para a seção de jogadores: filtra ativos e por nome. Pura.
import { normName } from './match-names.js';

/** Jogadores ativos que casam com a busca (nome do modelo ou completo), na ordem do modelo. */
export function searchPlayers(players, query, limit = 60) {
  const q = normName(query);
  let list = players.filter((p) => p.active !== false);
  if (q) {
    list = list.filter((p) => normName(p.name).includes(q) || (p.fullName && normName(p.fullName).includes(q)));
  }
  return list.slice(0, limit);
}
