// Sonda a chave de agregador de odds do .env: ela vale? cobre tênis? tem Betfair? tem ao vivo?
// NÃO imprime a chave. Uso: node pipeline/probe-odds-api.js
import { readFile } from 'node:fs/promises';

const BASE = 'https://api.the-odds-api.com/v4';

async function readKey() {
  try {
    const txt = await readFile(new URL('../.env', import.meta.url), 'utf8');
    const m = txt.match(/^\s*ODDS_API_KEY\s*=\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

async function get(path, key, params = {}) {
  const qs = new URLSearchParams({ apiKey: key, ...params });
  const res = await fetch(`${BASE}${path}?${qs}`);
  const quota = { restantes: res.headers.get('x-requests-remaining'), usadas: res.headers.get('x-requests-used') };
  if (!res.ok) return { erro: `HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`, quota };
  return { data: await res.json(), quota };
}

async function main() {
  const key = await readKey();
  if (!key) return console.log('Nenhuma ODDS_API_KEY no .env.');
  console.log(`Chave encontrada (${key.length} caracteres, não exibida).\n`);

  const sports = await get('/sports/', key, { all: 'true' });
  if (sports.erro) return console.log(`A chave NÃO respondeu: ${sports.erro}`);
  console.log(`Chave VÁLIDA · requisições restantes: ${sports.quota.restantes ?? '?'} (usadas: ${sports.quota.usadas ?? '?'})`);

  const todos = sports.data || [];
  const tenis = todos.filter((s) => /tennis/i.test(s.key) || /tennis/i.test(s.group || ''));
  const tenisAtivo = tenis.filter((t) => t.active);
  console.log(`\nTênis no catálogo: ${tenis.length} competições · ativas agora: ${tenisAtivo.length}`);
  console.log('(o catálogo só tem torneios grandes — Slams, Masters, WTA principais; sem Challenger/WTA125)');

  // Pra descobrir se a fonte carrega Betfair, usa qualquer esporte ATIVO agora.
  const alvo = tenisAtivo[0] || todos.find((s) => s.active && !/winner|outright/i.test(s.key));
  if (!alvo) return console.log('\nNada ativo agora — impossível listar casas.');

  console.log(`\n=== Casas disponíveis, medindo em "${alvo.title}" ===`);
  const odds = await get(`/sports/${alvo.key}/odds/`, key, { regions: 'uk,eu', markets: 'h2h', oddsFormat: 'decimal' });
  if (odds.erro) return console.log(`Falhou: ${odds.erro}`);

  const eventos = odds.data || [];
  const casas = new Set();
  for (const e of eventos) for (const b of e.bookmakers || []) casas.add(b.title);
  console.log(`${eventos.length} eventos · ${casas.size} casas`);
  console.log([...casas].sort().join(', ') || '(nenhuma)');

  const betfair = [...casas].filter((c) => /betfair/i.test(c));
  console.log(`\nTem Betfair? ${betfair.length ? `SIM — ${betfair.join(', ')}` : 'NÃO'}`);

  // Algum evento já começou? (indica se o plano entrega preço ao vivo)
  const agora = Date.now();
  const emAndamento = eventos.filter((e) => Date.parse(e.commence_time) < agora);
  console.log(`Eventos já iniciados na resposta: ${emAndamento.length} de ${eventos.length}`);
  console.log(emAndamento.length ? '→ o plano parece entregar preço COM o jogo rolando.' : '→ só eventos futuros: sem preço ao vivo neste plano.');
}

main();
