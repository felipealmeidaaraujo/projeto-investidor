// Funções puras de reconciliação do diário (união de trades, decisão de migração).

/** União de trades por id. O array "incoming" vence em conflito de id. */
export function mergeTrades(base, incoming) {
  const map = new Map();
  for (const t of base) map.set(t.id, t);
  for (const t of incoming) map.set(t.id, t);
  return [...map.values()];
}

/** Migra os dados locais pra nuvem só quando a nuvem está vazia e há dados locais. */
export function shouldMigrate(cloudTrades, localTrades) {
  return cloudTrades.length === 0 && localTrades.length > 0;
}
