// Cola o DESFECHO em cada observação ao vivo: "e no fim, quem ganhou?".
//
// Por que existe: sem o desfecho, a captura é foto sem legenda. Ela guarda o preço e a
// odd justa daquele instante, mas nada nela diz se a justa estava CERTA — e é isso que
// precisa ser medido um dia. Com o desfecho, cada observação vira um teste.
//
// Não há digitação: o resultado sai sozinho no dia seguinte pelo Flashscore, que já
// ingerimos (recent-results.json, 14 dias) e que se soma ao histórico (matches.json).
// Os dois arquivos trazem o nome JÁ canonizado contra o modelo — o mesmo nome que a
// captura gravou — então o casamento é exato, sem fuzzy e sem chute.
//
// Funções puras. Testado em tests/outcome.test.js.

// A data é o elo frouxo: a captura marca em UTC, o Flashscore data pelo dia do torneio,
// e o histórico (tennis-data) às vezes discorda em um dia. Duas partidas da MESMA dupla
// em 2 dias não existem no tênis, então a folga é barata; e quando os candidatos
// discordam de vencedor, a gente desiste em vez de chutar (ver resolveCaptures).
const FOLGA_DIAS = 2;

const pairKey = (tour, x, y) => `${tour ?? ''}|${[x, y].sort().join('|')}`;

/** YYYYMMDD (int) do instante ISO da captura. Null se a data não for utilizável. */
export function captureDay(at) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  return Number(new Date(t).toISOString().slice(0, 10).replace(/-/g, ''));
}

/** Distância em dias entre dois YYYYMMDD. Null se algum não for uma data válida. */
export function daysApart(d1, d2) {
  const parse = (d) => {
    const s = String(d);
    if (!/^\d{8}$/.test(s)) return null;
    const ms = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    return Number.isFinite(ms) ? ms : null;
  };
  const a = parse(d1);
  const b = parse(d2);
  if (a == null || b == null) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * Carimba `won` ('a' ou 'b' — qual lado DA OBSERVAÇÃO venceu a partida) nas linhas que
 * ainda não têm desfecho. Muta as linhas recebidas e devolve quantas foram resolvidas.
 *
 * Regra conservadora: só resolve quando os candidatos do período concordam sobre o
 * vencedor. Duplicata do mesmo jogo nas duas fontes (com um dia de diferença) resolve
 * normalmente; discordância de verdade fica SEM desfecho, porque um desfecho errado
 * envenena a validação inteira e é pior que a ausência dele.
 */
export function resolveCaptures(rows, matches) {
  const pendentes = new Map(); // pairKey -> linhas esperando desfecho
  for (const r of rows || []) {
    if (!r || r.won || !r.a || !r.b) continue;
    const k = pairKey(r.tour, r.a, r.b);
    if (!pendentes.has(k)) pendentes.set(k, []);
    pendentes.get(k).push(r);
  }
  if (!pendentes.size) return 0;

  // Uma passada só no histórico (dezenas de milhares de jogos), guardando apenas o que
  // interessa às duplas pendentes.
  const candidatos = new Map();
  for (const m of matches || []) {
    if (!m?.winner || !m?.loser) continue;
    const k = pairKey(m.tour, m.winner, m.loser);
    if (!pendentes.has(k)) continue;
    if (!candidatos.has(k)) candidatos.set(k, []);
    candidatos.get(k).push(m);
  }

  let resolvidas = 0;
  for (const [k, linhas] of pendentes) {
    const jogos = candidatos.get(k);
    if (!jogos) continue;
    for (const r of linhas) {
      const dia = captureDay(r.at);
      if (dia == null) continue;
      const perto = jogos.filter((g) => {
        const d = daysApart(dia, g.date);
        return d != null && Math.abs(d) <= FOLGA_DIAS;
      });
      if (!perto.length) continue;
      const vencedores = new Set(perto.map((g) => g.winner));
      if (vencedores.size !== 1) continue; // fontes discordam: melhor sem desfecho que errado
      r.won = perto[0].winner === r.a ? 'a' : 'b';
      resolvidas++;
    }
  }
  return resolvidas;
}

/** Quantas observações já têm desfecho e quantas ainda esperam. */
export function outcomeStats(rows) {
  const total = rows?.length ?? 0;
  let comDesfecho = 0;
  for (const r of rows || []) if (r?.won) comDesfecho++;
  return { total, comDesfecho, semDesfecho: total - comDesfecho };
}
