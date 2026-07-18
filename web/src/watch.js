// "O que observar": eventos do jogo que costumam mover o mercado nesta dupla.
// Descritivo (do perfil de saque/devolução/estilo) e HONESTO — não prevê swing.
// Puro e testável. Ver tests/watch.test.js.
import { serveBand } from './analysis.js';

const strong = (r) => !!r && (r.band === 'high' || r.band === 'elite');

/**
 * Linhas de "o que observar" pra um confronto, escolhendo os sinais mais fortes.
 * fav / und = jogadores do modelo (com .serve e .style); tour = 'ATP' | 'WTA'.
 * Retorna string[] (1 a 3 linhas).
 */
export function whatToWatch(fav, und, tour) {
  const out = [];

  // 1. Favorito segura bem o saque → quebra é rara; o mercado exagera quando vem.
  if (fav.serve) {
    const bp = serveBand(tour, 'bpSavedPct', fav.serve.bpSavedPct);
    const sv = serveBand(tour, 'servePtsWonPct', fav.serve.servePtsWonPct);
    if (strong(bp) || strong(sv)) {
      const pct = Math.round((fav.serve.bpSavedPct || 0) * 100);
      const elite = bp?.band === 'elite' || sv?.band === 'elite';
      out.push({ w: elite ? 3 : 2, t: `${fav.name} segura bem o saque${pct ? ` (salva ${pct}% dos break points)` : ''}. Uma quebra nele é rara — quando vem, o mercado costuma exagerar.` });
    }
  }

  // 2. Jogo quebra-quebra: os dois devolvem acima da média → placar volátil.
  if (fav.serve && und.serve) {
    const rf = serveBand(tour, 'returnPtsWonPct', fav.serve.returnPtsWonPct);
    const ru = serveBand(tour, 'returnPtsWonPct', und.serve.returnPtsWonPct);
    if (strong(rf) && strong(ru)) {
      out.push({ w: 2, t: `Os dois devolvem acima da média: espere várias quebras e a odd balançando ao longo do set.` });
    }
  }

  // 3. Estilo de virada/queda (amostra mínima de 5 jogos).
  for (const p of [fav, und]) {
    const cb = p.style?.comeback;
    if (cb && cb.pct != null && cb.n >= 5) {
      if (cb.pct >= 45) out.push({ w: 1, t: `${p.name} costuma virar de trás (vence ${cb.pct}% quando perde o 1º set) — se cair um set, o mercado pode exagerar contra ele.` });
      else if (cb.pct <= 18) out.push({ w: 1, t: `${p.name} costuma desandar após perder o 1º set (vence só ${cb.pct}%) — um set atrás pode virar ladeira.` });
    }
  }

  out.sort((a, b) => b.w - a.w);
  const top = out.slice(0, 3).map((x) => x.t);
  if (!top.length) return [`Perfis equilibrados no saque e na devolução — sem um gatilho de mercado óbvio nesta dupla.`];
  return top;
}
