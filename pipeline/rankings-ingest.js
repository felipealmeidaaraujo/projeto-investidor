// Enriquece os modelos (ATP/WTA) com a trajetória de ranking (p.career) e conserta
// bio.rank / bio.age, que hoje ficam congelados na data do último jogo do jogador.
// Uso: node pipeline/rankings-ingest.js
import { readFile, writeFile } from 'node:fs/promises';
import { parseRankingRows, buildTrajectories, resolvePlayers, ageFrom } from './rankings.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';

/** players.csv -> Map<player_id, {fullName, dob}>. */
function parsePlayers(text) {
  const meta = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = lines[i].split(',');
    const id = c[0];
    if (!id) continue;
    const fullName = `${c[1] || ''} ${c[2] || ''}`.trim();
    if (!fullName) continue;
    meta.set(id, { fullName, dob: Number(c[4]) || null });
  }
  return meta;
}

async function get(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

async function enrich(modelFile, tour) {
  const t = tour.toLowerCase();
  const url = new URL(modelFile, import.meta.url);
  const model = JSON.parse(await readFile(url));
  console.log(`Trajetória de ranking ${tour}...`);

  // O 10s NÃO é baixado: o pico de 2010-2019 é história e vem do cache versionado.
  const [current, s20, playersCsv, peakCache] = await Promise.all([
    get(`${t}/${t}_rankings_current.csv`),
    get(`${t}/${t}_rankings_20s.csv`),
    get(`${t}/${t}_players.csv`),
    readFile(new URL('../data/peak-2010-2019.json', import.meta.url)).then((b) => JSON.parse(b)),
  ]);

  const rows = [...parseRankingRows(s20), ...parseRankingRows(current)];
  const traj = buildTrajectories(rows);
  const meta = parsePlayers(playersCsv);
  const { resolved, excluded } = resolvePlayers([...traj.keys()], model.players, meta);

  const antigo = peakCache[t] || {};
  let n = 0;
  for (const [id, p] of resolved) {
    const c = { ...traj.get(id) };
    // pico final = o melhor entre a janela viva e a história de 2010-2019.
    // No EMPATE de rank, vale a data mais antiga: "peak" é a PRIMEIRA vez que ele
    // atingiu o melhor ranking da carreira — a mesma regra que buildTrajectories e
    // peak-cache-build.js já usam dentro de cada arquivo. Sem isto, a data seria a do
    // primeiro snapshot da janela viva, que só reflete onde o recorte começa (o
    // Djokovic foi #1 em 2011 e em 2020: sem o empate, o card diria 2020).
    const velho = antigo[id];
    if (velho && (c.peak == null || velho[0] < c.peak || (velho[0] === c.peak && velho[1] < c.peakDate))) {
      c.peak = velho[0];
      c.peakDate = velho[1];
    }
    p.career = c;
    // conserta o que hoje fica congelado na data do último jogo
    if (p.bio) {
      p.bio.rank = c.rank;
      const m = meta.get(id);
      const idade = m ? ageFrom(m.dob, c.snapshotDate) : null;
      if (idade != null) p.bio.age = idade;
    }
    n++;
  }

  await writeFile(url, JSON.stringify(model));
  const ativos = model.players.filter((p) => p.active);
  const comCareer = ativos.filter((p) => p.career).length;
  console.log(
    `${modelFile}: ${n} jogadores com trajetória — ${comCareer}/${ativos.length} ativos ` +
    `(${((100 * comCareer) / ativos.length).toFixed(1)}%). ${excluded.length} excluídos por ambiguidade` +
    `${excluded.length ? `: ${excluded.join(', ')}` : ''}.`
  );
  if (comCareer / ativos.length < 0.8) {
    throw new Error(`Cobertura caiu para ${((100 * comCareer) / ativos.length).toFixed(1)}% dos ativos (esperado ~92% ATP / ~96% WTA). O join quebrou.`);
  }
}

async function main() {
  await enrich('../web/model-atp.json', 'ATP');
  await enrich('../web/model-wta.json', 'WTA');
}

main();
