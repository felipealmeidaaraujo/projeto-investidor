// Captura de observações REAIS ao vivo: placar + odd justa + odd de mercado + horário.
//
// Por que existe: não há base histórica pública de odds in-play. Sem gravar as nossas,
// NENHUM método ao vivo poderá ser validado algum dia — e é ao vivo que a operação acontece.
// Cada odd da Betfair digitada no painel vira um ponto de dado permanente.
//
// Funções puras; o armazenamento é injetado (localStorage no app, objeto falso nos testes).
// Testado em tests/capture.test.js.

export const CAPTURE_KEY = 'investidor.capture';
export const MAX_CAPTURES = 5000; // teto — o localStorage costuma ter ~5MB

const num = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);

/**
 * Monta o registro de uma observação ao vivo.
 * Retorna null quando não há NENHUMA odd de mercado — sem preço, a observação não tem valor.
 */
export function buildSnapshot({ at, tour, surface, level, a, b, live, fair, preProbA }) {
  if (!a || !b || !live || !fair) return null;
  const ma = num(live.mktA);
  const mb = num(live.mktB);
  if (ma == null && mb == null) return null; // é o preço que faz a observação valer
  return {
    at,
    tour: tour ?? null,
    surface: surface ?? null,
    level: level ?? null,
    a,
    b,
    sa: live.setsA ?? 0,
    sb: live.setsB ?? 0,
    ga: live.gamesA ?? 0,
    gb: live.gamesB ?? 0,
    srv: live.serverIsA ? 'a' : 'b',
    bo: live.bestOf ?? 3,
    fa: num(fair.fairOddA),
    fb: num(fair.fairOddB),
    ma,
    mb,
    pre: num(preProbA),
  };
}

/** Identidade da observação: mesmo confronto + mesmo placar + mesmas odds = a mesma coisa. */
export function snapshotKey(s) {
  return [s.a, s.b, `${s.sa}-${s.sb}`, `${s.ga}-${s.gb}`, s.srv, s.ma ?? '', s.mb ?? ''].join('|');
}

/** Lê as capturas gravadas. Tolerante a storage ausente ou conteúdo corrompido. */
export function loadCaptures(storage) {
  try {
    const raw = storage?.getItem(CAPTURE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Grava a observação se ela for nova (não repete a última). Aplica o teto, descartando as
 * mais antigas. Retorna o total de capturas após a operação (ou o total atual, se ignorada).
 */
export function addCapture(storage, snap) {
  if (!snap) return loadCaptures(storage).length;
  const rows = loadCaptures(storage);
  const last = rows[rows.length - 1];
  if (last && snapshotKey(last) === snapshotKey(snap)) return rows.length; // nada mudou
  rows.push(snap);
  const trimmed = rows.length > MAX_CAPTURES ? rows.slice(rows.length - MAX_CAPTURES) : rows;
  try {
    storage?.setItem(CAPTURE_KEY, JSON.stringify(trimmed));
  } catch {
    /* cota estourada: mantém o que já existe em vez de quebrar o painel */
  }
  return trimmed.length;
}

const COLS = ['at', 'tour', 'surface', 'level', 'a', 'b', 'sa', 'sb', 'ga', 'gb', 'srv', 'bo', 'fa', 'fb', 'ma', 'mb', 'pre'];

/** Exporta as capturas em CSV (cabeçalho + linhas), pronto pro backtest futuro. */
export function toCSV(rows) {
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLS.join(','), ...rows.map((r) => COLS.map((c) => esc(r[c])).join(','))].join('\n');
}
