// Ingestão do tennis-data.co.uk (resultados + superfície + ODDS de casas), formato .xlsx.
// Usado só no pipeline de backtest (não vai pro app). Baixe via HTTP (o HTTPS do site quebra).
import ExcelJS from 'exceljs';

const BASE = 'http://www.tennis-data.co.uk';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function toYMD(dateVal) {
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** Baixa e parseia um ano de um tour (ATP ou WTA). */
export async function fetchTennisDataYear(year, tour = 'ATP') {
  const url = tour === 'WTA' ? `${BASE}/${year}w/${year}.xlsx` : `${BASE}/${year}/${year}.xlsx`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('planilha ilegível (provável .xls antigo)');

  const headerRow = ws.getRow(1).values;
  const col = {};
  for (let i = 1; i < headerRow.length; i++) col[headerRow[i]] = i;

  const matches = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r).values;
    const get = (name) => (col[name] != null ? row[col[name]] : undefined);
    const winner = get('Winner');
    const loser = get('Loser');
    if (!winner || !loser) continue;
    if (String(get('Comment') || '') === 'Walkover') continue; // W.O. não é jogo real

    matches.push({
      dateInt: toYMD(get('Date')),
      surface: String(get('Surface') || '').toLowerCase() || null,
      indoor: String(get('Court') || '') === 'Indoor',
      bestOf: num(get('Best of')) ?? 3,
      winner: String(winner).trim(),
      loser: String(loser).trim(),
      winnerRank: num(get('WRank')),
      loserRank: num(get('LRank')),
      // placar set a set (games do vencedor/perdedor da partida) — permite reconstruir o
      // estado do jogo em cada fronteira de set, pros métodos e pra calibração ao vivo.
      w1: num(get('W1')),
      l1: num(get('L1')),
      w2: num(get('W2')),
      l2: num(get('L2')),
      w3: num(get('W3')),
      l3: num(get('L3')),
      w4: num(get('W4')),
      l4: num(get('L4')),
      w5: num(get('W5')),
      l5: num(get('L5')),
      // odds de fechamento: Betfair Exchange (mercado do Felipe), média do mercado, Pinnacle, Max, B365
      bfew: num(get('BFEW')),
      bfel: num(get('BFEL')),
      avgw: num(get('AvgW')),
      avgl: num(get('AvgL')),
      psw: num(get('PSW')),
      psl: num(get('PSL')),
      maxw: num(get('MaxW')),
      maxl: num(get('MaxL')),
      b365w: num(get('B365W')),
      b365l: num(get('B365L')),
    });
  }
  return matches;
}

/** Carrega um intervalo de anos, ordenado por data. */
export async function loadTennisData(from, to, tour = 'ATP') {
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const chunks = await Promise.all(
    years.map(async (y) => {
      try {
        return await fetchTennisDataYear(y, tour);
      } catch (e) {
        console.warn(`aviso: ${tour} ${y} ignorado (${e.message})`);
        return [];
      }
    })
  );
  return chunks
    .flat()
    .filter((m) => m.surface && m.dateInt)
    .sort((a, b) => a.dateInt - b.dateInt);
}
