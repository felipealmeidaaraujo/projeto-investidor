// A lógica de sincronizar as observações com a nuvem — pura, sem rede.
//
// Por que este arquivo existe separado do cloud.js: o que pode dar errado numa sincronia
// não é o HTTP, é a REGRA (mandar duas vezes, sobrescrever um desfecho, perder linha ao
// juntar dois aparelhos). Isolando a regra, ela fica testável sem servidor.
//
// Princípio: o localStorage continua sendo a fonte durante o jogo (síncrono, funciona
// sem sinal na arena). A nuvem é cópia durável e via de recuperação — nunca um bloqueio
// no laço da operação.
//
// Testado em tests/sync.test.js.

/** Identidade da observação na nuvem: o instante da leitura + o confronto. */
export const rowKey = (r) => `${r.at}|${r.a}|${r.b}`;

/**
 * Impressão digital do que já foi enviado. Inclui o desfecho porque ele chega DEPOIS:
 * quando o `won` é colado numa linha antiga, a impressão muda e a linha volta pra fila.
 */
export const rowStamp = (r) => `${rowKey(r)}|${r.won ?? ''}`;

/** Linhas que a nuvem ainda não tem (ou que mudaram desde o último envio). */
export function rowsToPush(rows, enviadas) {
  const jaFoi = enviadas instanceof Set ? enviadas : new Set(enviadas || []);
  return (rows || []).filter((r) => r?.at && r?.a && r?.b && !jaFoi.has(rowStamp(r)));
}

/** Formato da linha na tabela: chave natural exposta + a captura inteira no jsonb. */
export function toCloudRow(r) {
  return { at: r.at, a: r.a, b: r.b, data: r };
}

/**
 * Junta o que veio da nuvem com o que existe no aparelho. Usado ao entrar num aparelho
 * novo (ou depois de limpar o navegador): o que faltar é adicionado, e um desfecho que
 * a nuvem já sabe preenche a linha local que ainda não sabia.
 *
 * Nunca apaga nem sobrescreve uma observação local: uma leitura de preço é irrecuperável,
 * então na dúvida o dado FICA. A única coisa que a nuvem preenche é o desfecho ausente.
 */
export function mergeRemote(locais, remotas) {
  const out = (locais || []).filter(Boolean).slice();
  const porChave = new Map(out.map((r) => [rowKey(r), r]));
  let novas = 0;
  let desfechos = 0;
  for (const rem of remotas || []) {
    if (!rem?.at || !rem?.a || !rem?.b) continue;
    const local = porChave.get(rowKey(rem));
    if (!local) {
      out.push(rem);
      porChave.set(rowKey(rem), rem);
      novas++;
    } else if (!local.won && rem.won) {
      local.won = rem.won;
      desfechos++;
    }
  }
  out.sort((x, y) => String(x.at).localeCompare(String(y.at)));
  return { rows: out, novas, desfechos };
}

/** Resumo curto pro rodapé da tela: o que já está guardado fora do aparelho. */
export function syncResumo({ conectado, pendentes, ultimaEm }) {
  if (!conectado) return 'só neste aparelho — não está na nuvem';
  if (pendentes > 0) return `${pendentes} ${pendentes === 1 ? 'observação esperando' : 'observações esperando'} pra subir`;
  return ultimaEm ? `tudo na nuvem · ${ultimaEm}` : 'tudo na nuvem';
}
