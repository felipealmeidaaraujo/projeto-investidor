import { analyzeMatch, playerTags, buildReadingExplanation, serveBand } from './src/analysis.js';
import { styleLines, pressureLines, bioText } from './src/patterns-view.js';
import { tacticalSuggestion } from './src/tactics.js';
import { searchPlayers } from './src/player-search.js';
import { whatToWatch } from './src/watch.js';
import { liveFairOdds, overreaction, netEdge, devigPair } from './src/inplay.js';
import { correctFavProb } from './src/live-correction.js';
import { gridStatus, isLiveMatch, humanAge } from './src/freshness.js';
import { nextGameStates, ticksBetween } from './src/ladder.js';
import { buildSnapshot, addCapture, loadCaptures, toCSV } from './src/capture.js';
import { recentForm, restDays, headToHead } from './src/scouting.js';
import { formatBRL, formatSignedPct, formatPctFrac } from './src/format.js';
import { careerText } from './src/career.js';
import { ageAdjustText, ageSuppressedText } from './src/age-curve.js';
import { decayAdjustText } from './src/decay-curve.js';

/* ---------------- Navegação ---------------- */
const tabs = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');
let currentScreen = 'analise';

function renderScreen(target) {
  if (target === 'analise') renderAnalise();
  else if (target === 'jogadores') renderJogadores();
}
function showScreen(target) {
  currentScreen = target;
  screens.forEach((s) => s.classList.toggle('active', s.id === `screen-${target}`));
  tabs.forEach((t) => {
    const active = t.dataset.target === target;
    t.classList.toggle('active', active);
    if (active) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  renderScreen(target);
  document.querySelector('.app-main')?.scrollTo(0, 0);
}
tabs.forEach((tab) => tab.addEventListener('click', () => showScreen(tab.dataset.target)));

/* ---------------- Utilidades ---------------- */
function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function clampOdd(v) {
  return Math.min(1000, Math.max(1.01, Math.round(v * 100) / 100));
}
function chipsHTML(obj, field, options) {
  return `<div class="chips">${options
    .map((o) => {
      const v = typeof o === 'object' ? o.v : o;
      const l = typeof o === 'object' ? o.l : typeof o === 'number' ? formatPctFrac(o, 0) : o;
      const sel = obj[field] === v ? ' selected' : '';
      return `<button class="chip${sel}" data-field="${field}" data-value="${v}">${l}</button>`;
    })
    .join('')}</div>`;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}
// Comissão da Betfair (fração do LUCRO). Fica no aparelho pra você poder ajustar —
// ela mexe direto no que sobra de cada entrada, então nunca é suposição escondida.
const COMMISSION_KEY = 'investidor.commission';
const DEFAULT_COMMISSION = 0.065;
function getCommission() {
  try {
    const v = Number(localStorage.getItem(COMMISSION_KEY));
    return Number.isFinite(v) && v > 0 && v < 1 ? v : DEFAULT_COMMISSION;
  } catch {
    return DEFAULT_COMMISSION;
  }
}
function setCommission(pct) {
  try {
    localStorage.setItem(COMMISSION_KEY, String(pct / 100));
  } catch { /* sem storage: segue com o padrão */ }
}
// Baixa as observações ao vivo já capturadas (placar + odd justa + odd da Betfair).
// É a matéria-prima pra um dia validar método AO VIVO — não existe base pública disso.
function exportCaptures() {
  const rows = loadCaptures(localStorage);
  if (!rows.length) {
    toast('Nada capturado ainda.');
    return;
  }
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `investidor-observacoes-${todayLocal()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast(`${rows.length} observações exportadas.`);
}
/* ================= Tela: Análise ================= */
const analiseEl = document.getElementById('screen-analise');
const anal = {
  tour: 'ATP', models: {}, model: null, loadingTour: null, a: null, b: null, surface: 'hard', level: null,
  explainOpen: false, moreOpen: false, fxFilter: 'todos',
  live: { active: false, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3, mktA: null, mktB: null, preA: null, preB: null },
};
// Zera o painel ao vivo (placar + odds de mercado) — chamado ao trocar de confronto.
function resetLive() {
  anal.live = { active: false, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3, mktA: null, mktB: null, preA: null, preB: null };
}

// Histórico de partidas (scouting) — carregado sob demanda ao abrir a Análise.
// Funde o histórico (matches.json, tennis-data/Sackmann, com lag de ~1-2 semanas)
// com os resultados frescos do Flashscore (recent-results.json, atualizado de hora
// em hora) — assim forma recente, descanso e H2H ficam em dia. Dedup na borda.
let scoutMatches = null;
async function loadScoutMatches() {
  if (scoutMatches) return;
  try {
    const [histRes, recentRes] = await Promise.all([
      fetch('matches.json'),
      fetch('recent-results.json').catch(() => null),
    ]);
    if (!histRes.ok) return;
    const hist = (await histRes.json()).matches || [];
    let recent = [];
    if (recentRes && recentRes.ok) { try { recent = (await recentRes.json()).matches || []; } catch {} }
    const seen = new Set(hist.map((m) => `${m.date}|${m.winner}|${m.loser}`));
    const merged = hist.slice();
    for (const m of recent) {
      const k = `${m.date}|${m.winner}|${m.loser}`;
      if (!seen.has(k)) { seen.add(k); merged.push(m); }
    }
    scoutMatches = merged;
    renderScreen(currentScreen);
  } catch { /* sem scouting se o fetch falhar */ }
}
// Partidas só do circuito atual (evita misturar ATP/WTA em nomes iguais). Cacheado por tour.
let _scoutTour = null, _scoutTourCache = null;
function scoutForTour() {
  if (!scoutMatches) return null;
  if (_scoutTour !== anal.tour) { _scoutTour = anal.tour; _scoutTourCache = scoutMatches.filter((m) => m.tour === anal.tour); }
  return _scoutTourCache;
}
const SURF_OPTS = [{ v: 'clay', l: 'Saibro' }, { v: 'hard', l: 'Dura' }, { v: 'grass', l: 'Grama' }];
const SURFACE_PT = { clay: 'saibro', hard: 'quadra dura', grass: 'grama' };

let todayData = null;
let todayLoading = false;
async function loadToday() {
  if (todayData || todayLoading) return;
  todayLoading = true;
  try {
    const res = await fetch('today.json');
    todayData = res.ok ? await res.json() : { count: 0, matches: [] };
  } catch {
    todayData = { count: 0, matches: [] };
  }
  todayLoading = false;
  if (currentScreen === 'analise') renderAnalise();
}

const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';
const hojeInt = () => Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));

async function loadModel() {
  const tour = anal.tour;
  if (anal.models[tour]) { anal.model = anal.models[tour]; return; }
  if (anal.loadingTour === tour) return;
  anal.loadingTour = tour;
  try {
    const res = await fetch(`model-${tour.toLowerCase()}.json`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    anal.models[tour] = await res.json();
  } catch (e) {
    anal.models[tour] = { error: e.message };
  }
  anal.loadingTour = null;
  if (anal.tour === tour) {
    anal.model = anal.models[tour];
    // Re-renderiza a tela ATUAL (Análise OU Jogadores). Antes só re-renderizava a
    // Análise, então a lista de Jogadores ficava presa em "Carregando o modelo…"
    // quando o modelo era baixado a partir dela (ex.: ao trocar pra WTA).
    renderScreen(currentScreen);
  }
}

function switchTour(t) {
  if (anal.tour === t) return;
  anal.tour = t;
  anal.a = null;
  anal.b = null;
  anal.level = null;
  resetLive();
  anal.model = anal.models[t] || null;
  renderAnalise();
}

// "Ao vivo" de verdade: além do status do snapshot (que é regenerado de hora em
// hora), exige que o jogo tenha começado há pouco. Um jogo que começou há mais de
// ~4h30 certamente já acabou — não mostramos "AO VIVO" mesmo se o dado ainda disser,
// cobrindo a defasagem residual entre atualizações da grade. (Date.now e commence
// são ambos UTC → a comparação é honesta em qualquer fuso.)
/** Frescor da grade agora (a lógica vive em src/freshness.js, testada). */
function gridState() {
  return gridStatus(todayData?.generatedAt ?? todayData?.updatedAt);
}
function isLive(g) {
  return isLiveMatch(g, { gridStale: gridState().stale });
}

// Um botão de jogo. `i` é o índice na lista COMPLETA (todayData.matches) —
// preservado mesmo quando a lista é filtrada, pra o pickFixture achar o jogo certo.
function fixtureButtonHTML(g, i) {
  const favPct = (g.favoriteProb * 100).toFixed(0);
  const live = isLive(g);
  const statusTag = live
    ? `<span class="fx-live"><span class="fx-dot"></span>AO VIVO</span>`
    : g.status === 'SUSPENDED' ? `<span class="fx-susp">interrompido</span>` : '';
  const nivelLabel = g.level === 'challenger' ? ' · Challenger' : '';
  const badges = [
    g.ageAdjust?.adjusted ? 'ajuste de idade' : '',
    g.ageSuppressed ? 'ajuste suspenso' : '',
    g.decayAdjust ? 'ajuste de inatividade' : '',
  ].filter(Boolean).map((t) => `<span class="fx-badge">⚖ ${t}</span>`).join('');
  const tourn = g.tournament ? `<div class="fx-tourn">${g.tournament}</div>` : '';
  return `<button class="fixture surf-${g.surface}${live ? ' is-live' : ''}" data-fx="${i}">
    <div class="fx-meta"><span class="fx-surf">${SURFACE_PT[g.surface] || g.surface}</span><span class="fx-tour">${g.tour}${nivelLabel}</span>${statusTag}</div>
    <div class="fx-main"><span class="fx-avs"><span class="fx-av" data-pname="${encodeURIComponent(g.a)}"><span>${initials(g.a)}</span></span><span class="fx-av" data-pname="${encodeURIComponent(g.b)}"><span>${initials(g.b)}</span></span></span><span class="fx-players">${g.a} <span class="fx-vs">vs</span> ${g.b}</span><span class="fx-prob">${favPct}%</span></div>
    <div class="fx-sub">Favorito <strong>${g.favorite}</strong> · ${g.marginLabel} · confiança ${g.confidence}</div>
    ${badges ? `<div class="fx-badges">${badges}</div>` : ''}
    ${tourn}
  </button>`;
}
function fxCounts(list) {
  return {
    todos: list.length,
    live: list.filter(isLive).length,
    ATP: list.filter((m) => m.tour === 'ATP').length,
    WTA: list.filter((m) => m.tour === 'WTA').length,
  };
}
// Aplica o filtro atual mantendo o índice original; quando "Todos", ao vivo primeiro.
function fixtureRowsHTML(list) {
  const f = anal.fxFilter || 'todos';
  const rows = list
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => (f === 'todos' ? true : f === 'live' ? isLive(g) : g.tour === f))
    .sort((a, b) => {
      if (f !== 'todos') return 0;
      return (isLive(a.g) ? 0 : 1) - (isLive(b.g) ? 0 : 1);
    })
    .map(({ g, i }) => fixtureButtonHTML(g, i))
    .join('');
  return rows || `<div class="field-hint" style="padding:10px 2px">Nenhum jogo nesse filtro.</div>`;
}
function renderFixtures() {
  if (!todayData) {
    loadToday();
    return '';
  }
  const list = todayData.matches || [];
  if (!list.length) {
    return `<div class="section-title">Jogos de hoje</div>
      <div class="notice" style="margin-bottom:18px"><p>Sem jogos de tour agora. A grade é montada <strong>automaticamente todo dia</strong> a partir do calendário ATP/WTA — se está vazia, não há jogos do circuito principal no momento (fora de temporada). Use a busca manual acima. 👆</p></div>`;
  }
  const c = fxCounts(list);
  const f = anal.fxFilter || 'todos';
  const chip = (val, label, n) => `<button class="chip fxf${f === val ? ' selected' : ''}" data-fxf="${val}">${label}${n != null ? ` <span class="fxf-n">${n}</span>` : ''}</button>`;
  // A idade do dado SEMPRE na tela: o app não pode apresentar um retrato de 3 horas
  // com a mesma confiança de um de 2 minutos. Sem isso, não há como você julgar.
  const { ageMs: idade, warn: alerta, stale: velha } = gridState();
  const idadeTxt = idade == null ? 'sem carimbo de atualização' : `atualizada ${humanAge(idade)}`;
  const ageBar = `<div class="grid-age${alerta ? ' warn' : ''}">${
    velha
      ? `⚠️ Grade <strong>${idadeTxt}</strong> — velha demais pra afirmar quem está ao vivo. Os selos "AO VIVO" foram suspensos; confira na Betfair antes de operar.`
      : `Grade <strong>${idadeTxt}</strong>.${alerta ? ' Já passou do ciclo normal de 1h — confira antes de confiar no status.' : ''}`
  }</div>`;
  return `<div class="section-title">Jogos de hoje</div>
    ${ageBar}
    <div class="chips fx-filter">
      ${chip('todos', 'Todos', c.todos)}
      ${c.live ? chip('live', '● Ao vivo', c.live) : ''}
      ${chip('ATP', 'ATP', c.ATP)}
      ${chip('WTA', 'WTA', c.WTA)}
    </div>
    <div class="fixtures" id="fx-list">${fixtureRowsHTML(list)}</div>`;
}

async function pickFixture(game) {
  const tourChanged = anal.tour !== game.tour;
  if (tourChanged) {
    anal.tour = game.tour;
    anal.model = anal.models[game.tour] || null;
  }
  if (!anal.model) await loadModel();
  const m = anal.models[game.tour];
  if (m && !m.error) {
    anal.a = m.players.find((p) => p.name === game.a) || null;
    anal.b = m.players.find((p) => p.name === game.b) || null;
    anal.level = game.level ?? null;
    resetLive();
    anal.surface = game.surface;
  }
  // Se mudou de circuito, a grade precisa refletir o novo tour (reconstrói uma vez).
  // No caso comum (mesmo tour), só os slots atualizam — a grade fica intacta, sem piscar.
  if (tourChanged) renderAnalise(); else syncControls();
  if (anal.a && anal.b) openReading();
}

function tourHeader() {
  return `
    <h1 class="screen-title">Analisar um confronto</h1>
    <div class="chips" style="margin-bottom:14px">
      <button class="chip${anal.tour === 'ATP' ? ' selected' : ''}" data-tour="ATP">ATP</button>
      <button class="chip${anal.tour === 'WTA' ? ' selected' : ''}" data-tour="WTA">WTA</button>
    </div>`;
}
function wireTour() {
  analiseEl.querySelectorAll('[data-tour]').forEach((b) => b.addEventListener('click', () => switchTour(b.dataset.tour)));
}

// Um slot (Jogador A/B): foto + nome quando preenchido; placeholder quando vazio.
function slotHTML(key, player, placeholder) {
  if (!player) return `<button class="slot" id="slot-${key}">${placeholder}</button>`;
  const nm = player.fullName || player.name;
  return `<button class="slot filled" id="slot-${key}"><span class="pl-avatar slot-ava" data-photo="slot-${key}"><span>${initials(nm)}</span></span><span class="slot-name">${nm}</span></button>`;
}

// Card "Montar confronto" (circuito + slots + ação). Fica num host próprio pra
// atualizar sozinho, sem reconstruir a grade de jogos.
function controlsHTML() {
  const canRead = anal.a && anal.b;
  return `
    <div class="card build-card">
      <div class="build-head">Montar confronto</div>
      <div class="chips build-tour">
        <button class="chip${anal.tour === 'ATP' ? ' selected' : ''}" data-tour="ATP">ATP</button>
        <button class="chip${anal.tour === 'WTA' ? ' selected' : ''}" data-tour="WTA">WTA</button>
      </div>
      <div class="matchup-slots">
        ${slotHTML('a', anal.a, '➕ Jogador A')}
        <span class="vs">vs</span>
        ${slotHTML('b', anal.b, '➕ Jogador B')}
      </div>
      ${canRead
        ? `<button class="btn btn-primary" id="btn-analisar">Ver leitura do confronto</button>`
        : `<p class="field-hint build-hint">Escolha os <strong>dois jogadores</strong> — ou toque num jogo abaixo.</p>`}
    </div>`;
}
function wireControls() {
  analiseEl.querySelectorAll('#controls-host [data-tour]').forEach((b) => b.addEventListener('click', () => switchTour(b.dataset.tour)));
  analiseEl.querySelector('#slot-a')?.addEventListener('click', () => openPlayerPicker(anal.model, (p) => { anal.a = p; anal.level = null; resetLive(); syncControls(); }));
  analiseEl.querySelector('#slot-b')?.addEventListener('click', () => openPlayerPicker(anal.model, (p) => { anal.b = p; anal.level = null; resetLive(); syncControls(); }));
  analiseEl.querySelector('#btn-analisar')?.addEventListener('click', () => openReading());
  if (anal.a) loadPhoto(anal.a, () => analiseEl.querySelector('.slot-ava[data-photo="slot-a"]'));
  if (anal.b) loadPhoto(anal.b, () => analiseEl.querySelector('.slot-ava[data-photo="slot-b"]'));
}
// Atualiza só o card de montar confronto — a grade de jogos não é tocada.
function syncControls() {
  const host = analiseEl.querySelector('#controls-host');
  if (!host) { renderAnalise(); return; }
  host.innerHTML = controlsHTML();
  wireControls();
}

function wireFixtureButtons() {
  analiseEl.querySelectorAll('#fx-host [data-fx]').forEach((b) =>
    b.addEventListener('click', () => pickFixture(todayData.matches[Number(b.dataset.fx)]))
  );
}
// Carrega as fotos dos jogadores nos cards da grade sob demanda (só as visíveis;
// o resto conforme rola). Muitos challengers não têm foto → cai nas iniciais.
let fxObserver = null;
function observeFxPhotos() {
  if (fxObserver) fxObserver.disconnect();
  const host = analiseEl.querySelector('#fx-host');
  if (!host) return;
  const load = (el) => loadPhoto({ name: decodeURIComponent(el.dataset.pname) }, () => el);
  const avatars = [...host.querySelectorAll('.fx-av[data-pname]')];
  avatars.slice(0, 12).forEach(load); // os primeiros já
  fxObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      fxObserver.unobserve(e.target);
      load(e.target);
    }
  }, { rootMargin: '300px' });
  avatars.slice(12).forEach((el) => fxObserver.observe(el)); // o resto conforme rola
}
function wireFixtures() {
  analiseEl.querySelectorAll('#fx-host [data-fxf]').forEach((b) =>
    b.addEventListener('click', () => { anal.fxFilter = b.dataset.fxf; syncFixtures(); })
  );
  wireFixtureButtons();
  observeFxPhotos();
}
// Troca o filtro re-renderizando SÓ a lista de jogos (não a tela, não os controles).
function syncFixtures() {
  const host = analiseEl.querySelector('#fx-host');
  const listEl = host?.querySelector('#fx-list');
  if (!listEl) return;
  listEl.innerHTML = fixtureRowsHTML(todayData.matches || []);
  host.querySelectorAll('[data-fxf]').forEach((b) => b.classList.toggle('selected', b.dataset.fxf === (anal.fxFilter || 'todos')));
  wireFixtureButtons();
  observeFxPhotos();
}

function renderAnalise() {
  loadScoutMatches();
  if (!anal.model) {
    analiseEl.innerHTML = tourHeader() + `<div class="card"><p class="card-lead">Carregando o modelo ${anal.tour}…</p></div>`;
    wireTour();
    loadModel();
    return;
  }
  if (anal.model.error) {
    analiseEl.innerHTML = tourHeader() + `<div class="notice"><p>Não consegui carregar o modelo ${anal.tour} (${anal.model.error}).</p></div>`;
    wireTour();
    return;
  }
  analiseEl.innerHTML = `<h1 class="screen-title">Análise</h1>`
    + `<div id="controls-host">${controlsHTML()}</div>`
    + `<div id="fx-host">${renderFixtures()}</div>`;
  wireControls();
  wireFixtures();
}

/* ================= Dossiê do jogador ================= */
const photoCache = new Map();
function initials(name) {
  const t = name.trim().split(/\s+/);
  return ((t[0]?.[0] || '') + (t[1]?.[0] || '')).toUpperCase();
}
async function loadPhoto(player, getBox) {
  const box = getBox || (() => document.getElementById('dos-photo'));
  const set = (url) => { if (url && box()) box().innerHTML = `<img src="${url}" alt="${player.name}">`; };
  if (photoCache.has(player.name)) { set(photoCache.get(player.name)); return; }
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const tokens = player.name.trim().split(/\s+/);
  const isModelFmt = /\.$/.test(tokens[tokens.length - 1]); // formato "Sobrenome I."
  // Busca sempre pelo nome completo + "tennis": desambigua nomes comuns ("Daniel Evans" cai numa
  // página de desambiguação se usado como título direto) e acha o Challenger certo (o nome dele é
  // completo, então NÃO dá pra usar o 1º token como sobrenome — isso trazia a foto de outro "Daniel").
  const query = player.fullName || (isModelFmt ? tokens.slice(0, -1).join(' ') : player.name);
  const surname = player.fullName
    ? player.fullName.trim().split(/\s+/).slice(-1)[0]
    : (isModelFmt ? tokens.slice(0, -1).join(' ') : tokens.slice(-1)[0]);
  try {
    const r = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query + ' tennis')}&limit=1`);
    const j = await r.json();
    const title = j.pages?.[0]?.key || j.pages?.[0]?.title;
    // Só aceita se o resultado contém o sobrenome (evita foto de outro jogador por match fuzzy).
    if (!title || !norm(title).includes(norm(surname))) throw new Error('sem match confiável');
    const sres = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    const sj = await sres.json();
    const url = (sj.type !== 'disambiguation' && sj.thumbnail?.source) || null;
    photoCache.set(player.name, url);
    set(url);
  } catch {
    photoCache.set(player.name, null);
  }
}
function surfaceRank(player, surf) {
  const model = anal.model;
  if (!model?.players || player[surf] == null) return null;
  const active = model.players.filter((p) => p.active && p[surf] != null);
  if (!active.length) return null;
  const higher = active.filter((p) => p.name !== player.name && p[surf] > player[surf]).length;
  return { rank: higher + 1, total: active.length };
}
function rankLabel(r) {
  if (!r) return '';
  if (r.rank <= 5) return 'top 5';
  if (r.rank <= 10) return 'top 10';
  if (r.rank <= 25) return 'top 25';
  if (r.rank <= 50) return 'top 50';
  return `${r.rank}º de ${r.total}`;
}
const DOSSIER_EXPLAIN = [
  { term: 'Elo — o nível geral', what: 'Nota que resume o jogador: vence sobe, perde desce, e bater um forte vale mais. Quanto maior, melhor. O número de jogos é o tamanho da amostra por trás da nota.' },
  { term: 'As tags coloridas', what: 'Resumos automáticos do que os números dizem. <b style="color:var(--green)">Verde</b> = força; <b style="color:var(--amber)">âmbar</b> = rende menos numa superfície (relativo a ele); <b style="color:var(--red)">vermelho</b> = fraqueza. Saem do saque/devolução e da diferença de Elo por piso.' },
  { term: 'Elo por superfície & rank', what: 'O <b>piso</b> é o Elo contando só os jogos naquela superfície. O <b>"top 10 no circuito"</b> é a posição desse piso entre os jogadores ativos.' },
];
const DOSSIER_EXPLAIN_SERVE = { term: 'Saque & devolução', what: 'Percentuais tirados do histórico. A etiqueta ao lado (<b>na média / acima / elite</b>) mostra onde ele está no circuito — porque o número sozinho engana: <b>40% de devolução parece pouco, mas no ATP é elite</b> (a média fica bem abaixo).' };

function renderDossierExplain(st, hasServe) {
  if (!st.explainOpen) {
    return `<button class="explain-head" id="dos-explain" aria-expanded="false">
        <span>O que significam esses números?</span><span class="explain-caret">▸</span>
      </button>`;
  }
  const blocks = hasServe ? [...DOSSIER_EXPLAIN, DOSSIER_EXPLAIN_SERVE] : DOSSIER_EXPLAIN;
  const blk = (b) => `<div class="explain-blk"><div class="explain-term">${b.term}</div><div class="explain-what">${b.what}</div></div>`;
  return `
    <div class="explain">
      <button class="explain-head open" id="dos-explain" aria-expanded="true">
        <span>O que significam esses números?</span><span class="explain-caret">▾</span>
      </button>
      <div class="explain-body">${blocks.map(blk).join('')}</div>
    </div>`;
}

function openDossier(player, opts = {}) {
  const root = document.getElementById('modal-root');
  const st = { explainOpen: false };
  const closeDossier = () => { root.innerHTML = ''; if (opts.onBack) opts.onBack(); };

  // Re-render escopado do "O que significam esses números?": reescreve SÓ o bloco,
  // sem recriar o modal — assim o scroll não volta pro topo ao abrir/fechar.
  function drawExplain() {
    const host = root.querySelector('#dos-explain-host');
    if (!host) return;
    host.innerHTML = renderDossierExplain(st, !!player.serve);
    host.querySelector('#dos-explain')?.addEventListener('click', () => { st.explainOpen = !st.explainOpen; drawExplain(); });
  }

  function draw() {
    const tags = playerTags(player, anal.tour);
    const s = player.serve;
    const p100 = (x) => `${Math.round(x * 100)}%`;
    const srow = (surf, lbl) => {
      if (player[surf] == null) return '';
      const rl = rankLabel(surfaceRank(player, surf));
      return `<div class="dos-srow"><span>${lbl}${rl ? ` <span class="field-hint">· ${rl} no circuito</span>` : ''}</span><strong>${player[surf]}</strong></div>`;
    };
    const svRow = (key, lbl) => {
      const v = s[key];
      const r = serveBand(anal.tour, key, v);
      const pill = r ? `<span class="refpill ref-${r.band}">${r.label}</span>` : '';
      return `<div class="dos-srow"><span>${lbl}</span><span class="dos-srv-val"><strong>${p100(v)}</strong>${pill}</span></div>`;
    };
    const scoutBlock = () => {
      const head = '<div class="dos-section">Forma &amp; descanso</div>';
      const sm = scoutForTour();
      if (!sm) return `${head}<div class="dos-srow"><span class="field-hint">carregando…</span></div>`;
      const f = recentForm(sm, player.name, 10);
      if (!f.results.length) return `${head}<div class="dos-srow"><span class="field-hint">sem partidas recentes no histórico</span></div>`;
      const rest = restDays(sm, player.name, Number(todayLocal().replace(/-/g, '')));
      const pills = f.results.map((rr) => `<span class="form-pill ${rr.won ? 'w' : 'l'}">${rr.won ? 'V' : 'D'}</span>`).join('');
      const restTxt = rest == null ? '' : rest === 0 ? 'jogou hoje' : rest === 1 ? 'jogou ontem' : `descansado ${rest} dias`;
      return `${head}
        <div class="dos-srow"><span>Últimos ${f.results.length} <span class="field-hint">· recente à esquerda</span></span><strong>${f.wins}V ${f.losses}D</strong></div>
        <div class="dos-form">${pills}</div>
        ${restTxt ? `<div class="dos-srow"><span>Descanso</span><span>${restTxt}</span></div>` : ''}`;
    };
    root.innerHTML = `
      <div class="modal-overlay" id="dos-overlay">
        <div class="modal-sheet">
          <button class="modal-x" id="dos-x" aria-label="Fechar">✕</button>
          <div class="dossier">
            <div class="dos-photo" id="dos-photo"><span class="dos-avatar">${initials(player.name)}</span></div>
            <div class="dos-name">${player.name}</div>
            <div class="dos-elo">Elo ${player.elo}${player.matches ? ` · ${player.matches} jogos` : ''}${player.level === 'challenger' ? ' <span class="pill pill-muted">Challenger</span>' : ''}</div>
            ${bioText(player.bio, anal.tour) ? `<div class="dos-bio">${bioText(player.bio, anal.tour)}</div>` : ''}
            ${(() => {
              const ct = careerText(player.career);
              if (!ct) return '';
              return `<div class="dos-career"><strong>${ct.label}</strong> — ${ct.detail}</div>
                ${ct.warn ? `<div class="explain-warn" style="margin:6px 0 0">${ct.warn}</div>` : ''}
                <div class="field-hint" style="margin-top:4px">${ct.asOf ? `Ranking de ${ct.asOf}. ` : ''}Descreve o que já aconteceu nos últimos 12 meses — medimos que não antecipa o próximo jogo.</div>`;
            })()}
            ${player.level === 'challenger' ? '<div class="field-hint" style="margin-top:2px">Base Challenger/125 — Elo menos calibrado que o do tour.</div>' : ''}
            ${tags.length ? `<div class="dos-tags">${tags.map((t) => `<span class="pill ${{ strength: 'pill-green', relative: 'pill-amber', weakness: 'pill-red' }[t.kind] || 'pill-muted'}">${t.t}</span>`).join('')}</div>` : ''}
            ${scoutBlock()}
            <div class="dos-section">Elo por superfície</div>
            <div class="dos-surf">${srow('clay', 'Saibro')}${srow('hard', 'Dura')}${srow('grass', 'Grama')}</div>
            ${s
              ? `<div class="dos-section">Saque &amp; devolução</div>
                 <div class="dos-serve">
                   ${svRow('servePtsWonPct', 'Pontos ganhos no saque')}
                   ${svRow('firstInPct', '1º saque dentro')}
                   ${svRow('acePct', 'Aces (por ponto de saque)')}
                   ${svRow('returnPtsWonPct', 'Pontos de devolução ganhos')}
                   ${svRow('bpSavedPct', 'Break points salvos')}
                 </div>`
              : ''}
            ${styleLines(player.style).length ? `<div class="dos-section">Como costuma jogar</div>
              <div class="dos-patterns">${styleLines(player.style).map((l) => `<div class="dos-srow"><span>${l.label}</span><span class="dos-pat-detail">${l.detail}</span></div>`).join('')}</div>` : ''}
            ${pressureLines(player.pressure).length ? `<div class="dos-section">Pressão nos games</div>
              <div class="dos-patterns">${pressureLines(player.pressure).map((l) => `<div class="dos-srow"><span>${l.label}</span><span class="dos-pat-detail">${l.detail}</span></div>`).join('')}</div>` : ''}
            <div id="dos-explain-host">${renderDossierExplain(st, !!s)}</div>
          </div>
          <div class="modal-actions"><button class="btn btn-ghost" id="dos-close">Fechar</button></div>
        </div>
      </div>`;
    root.querySelector('#dos-close').addEventListener('click', closeDossier);
    root.querySelector('#dos-x').addEventListener('click', closeDossier);
    root.querySelector('#dos-overlay').addEventListener('click', (e) => { if (e.target.id === 'dos-overlay') closeDossier(); });
    root.querySelector('#dos-explain')?.addEventListener('click', () => { st.explainOpen = !st.explainOpen; drawExplain(); });
    loadPhoto(player);
  }

  draw();
}

/* ================= Leitura do confronto (modal sobreposto) ================= */
// Reusa o padrão do dossiê (#modal-root). Cada micro-interação atualiza SÓ o
// bloco que mudou — a grade de jogos atrás nunca re-renderiza, e mexer no placar
// ao vivo não recria o card (as fotos não piscam).
function openReading() {
  if (!(anal.a && anal.b && anal.model && !anal.model.error)) return;
  const root = document.getElementById('modal-root');
  const currentR = () => analyzeMatch(anal.a, anal.b, anal.surface, anal.model, anal.level, hojeInt());

  function liveHTML(r) {
    return `<button class="btn" id="btn-live" style="margin-top:14px">${anal.live.active ? '⏱️ Ocultar trade ao vivo' : '⏱️ Trade ao vivo (odd por placar)'}</button>
      <div id="rd-live-panel">${anal.live.active ? renderLive(r) : ''}</div>`;
  }
  // Só o painel ao vivo (botão + steppers). Não toca o card nem as fotos.
  function drawLive() {
    const host = root.querySelector('#rd-live-host');
    if (!host) return;
    host.innerHTML = liveHTML(currentR());
    root.querySelector('#btn-live')?.addEventListener('click', () => { anal.live.active = !anal.live.active; drawLive(); });
    root.querySelectorAll('[data-live]').forEach((b) =>
      b.addEventListener('click', () => {
        const f = b.dataset.live;
        const max = f.startsWith('sets') ? (anal.live.bestOf === 5 ? 3 : 2) : 7;
        anal.live[f] = Math.min(max, Math.max(0, anal.live[f] + Number(b.dataset.d)));
        drawLive();
      })
    );
    root.querySelectorAll('[data-server]').forEach((b) =>
      b.addEventListener('click', () => { anal.live.serverIsA = b.dataset.server === 'A'; drawLive(); })
    );
    root.querySelectorAll('[data-bestof]').forEach((b) =>
      b.addEventListener('click', () => { anal.live.bestOf = Number(b.dataset.bestof); drawLive(); })
    );
    root.querySelectorAll('[data-mkt]').forEach((b) =>
      b.addEventListener('click', () => {
        const side = b.dataset.mkt;
        // O teclado ocupa o #modal-root (some com a leitura); onClose redesenha a leitura de volta.
        openKeypad({ title: `Odd Betfair · ${side === 'A' ? anal.a.name : anal.b.name}`, value: side === 'A' ? anal.live.mktA : anal.live.mktB, mode: 'odd', onConfirm: (v) => { if (side === 'A') anal.live.mktA = v; else anal.live.mktB = v; }, onClose: draw });
      })
    );
    root.querySelectorAll('[data-pre]').forEach((b) =>
      b.addEventListener('click', () => {
        const side = b.dataset.pre;
        openKeypad({
          title: `Odd de ABERTURA · ${side === 'A' ? anal.a.name : anal.b.name}`,
          value: side === 'A' ? anal.live.preA : anal.live.preB,
          mode: 'odd',
          onConfirm: (v) => { if (side === 'A') anal.live.preA = v; else anal.live.preB = v; },
          onClose: draw,
        });
      })
    );
    root.querySelector('#btn-export-cap')?.addEventListener('click', exportCaptures);
    root.querySelector('#btn-commission')?.addEventListener('click', () =>
      openKeypad({
        title: 'Sua comissão na Betfair (%)',
        value: getCommission() * 100,
        mode: 'odd',
        onConfirm: (v) => setCommission(v),
        onClose: draw,
      })
    );
  }
  // Só a faixa "O que significam esses números".
  function drawExplain() {
    const host = root.querySelector('#rd-explain');
    if (!host) return;
    host.innerHTML = renderExplain(currentR());
    root.querySelector('#btn-explain')?.addEventListener('click', () => { anal.explainOpen = !anal.explainOpen; drawExplain(); });
    root.querySelector('#btn-more')?.addEventListener('click', () => { anal.moreOpen = !anal.moreOpen; drawExplain(); });
  }
  // O card de leitura (favorito + jogadores + H2H + narrativa + táticas). As fotos vivem aqui.
  function drawCard() {
    const host = root.querySelector('#rd-card');
    if (!host) return;
    host.innerHTML = readingCardHTML(currentR());
    host.querySelectorAll('[data-dossier]').forEach((el) =>
      el.addEventListener('click', () => {
        const p = el.dataset.dossier === 'a' ? anal.a : anal.b;
        if (p) openDossier(p, { onBack: draw });
      })
    );
    loadPhoto(anal.a, () => host.querySelector('.pl-avatar[data-photo="a"]'));
    loadPhoto(anal.b, () => host.querySelector('.pl-avatar[data-photo="b"]'));
  }
  function draw() {
    const nomeA = anal.a.fullName || anal.a.name;
    const nomeB = anal.b.fullName || anal.b.name;
    root.innerHTML = `
      <div class="modal-overlay" id="rd-overlay">
        <div class="modal-sheet reading-sheet surf-${anal.surface}">
          <div class="rd-head">
            <div class="rd-head-titles">
              <span class="rd-head-eyebrow">Leitura · ${SURFACE_PT[anal.surface]}</span>
              <span class="rd-head-players">${nomeA} <span class="rd-head-vs">vs</span> ${nomeB}</span>
            </div>
            <button class="rd-x" id="rd-close" aria-label="Fechar">✕</button>
          </div>
          <div class="rd-body">
            <div class="field rd-surface"><div class="field-label"><span>Superfície</span></div>${chipsHTML(anal, 'surface', SURF_OPTS)}</div>
            <div id="rd-card"></div>
            <div id="rd-explain"></div>
            <div id="rd-live-host"></div>
            <p class="field-hint rd-disclaimer">⚠️ Leitura do modelo pra você <strong>entender</strong> o jogo — não é recomendação de aposta. Você decide.</p>
          </div>
        </div>
      </div>`;
    root.querySelector('#rd-close').addEventListener('click', () => (root.innerHTML = ''));
    root.querySelector('#rd-overlay').addEventListener('click', (e) => { if (e.target.id === 'rd-overlay') root.innerHTML = ''; });
    root.querySelectorAll('.chip[data-field="surface"]').forEach((chip) =>
      chip.addEventListener('click', () => {
        anal.surface = chip.dataset.value;
        root.querySelectorAll('.chip[data-field="surface"]').forEach((c) => c.classList.toggle('selected', c.dataset.value === anal.surface));
        applySurf();
        drawCard(); drawExplain(); drawLive();
      })
    );
    drawCard();
    drawExplain();
    drawLive();
  }
  // Sincroniza o acento de superfície (classe do sheet + etiqueta) ao abrir e ao trocar de piso.
  function applySurf() {
    const sheet = root.querySelector('.reading-sheet');
    if (sheet) {
      sheet.classList.remove('surf-clay', 'surf-hard', 'surf-grass');
      sheet.classList.add(`surf-${anal.surface}`);
    }
    const eb = root.querySelector('.rd-head-eyebrow');
    if (eb) eb.textContent = `Leitura · ${SURFACE_PT[anal.surface]}`;
  }
  draw();
}

function narrative(r) {
  const s = SURFACE_PT[r.surface];
  const phrase = (side) => {
    const sr = side.surfaceRead;
    if (sr.tag === 'forte') return `${side.name} rende <strong>acima</strong> do seu nível no ${s} (${sr.delta > 0 ? '+' : ''}${sr.delta})`;
    if (sr.tag === 'fraco') return `${side.name} rende <strong>abaixo</strong> do seu nível no ${s} (${sr.delta})`;
    if (sr.tag === 'poucos dados') return `${side.name} tem <strong>poucos jogos</strong> no ${s} (cautela)`;
    return `${side.name} joga em linha com seu nível no ${s}`;
  };
  return `No ${s}: ${phrase(r.a)}; ${phrase(r.b)}. O modelo vê <strong>${r.favorite}</strong> como <strong>${r.marginLabel}</strong> (${pct(r.favoriteProb)}). Confiança <strong>${r.confidence.level}</strong> — ${r.confidence.reason}.`;
}

const EXPLAIN_STATIC = {
  elo: 'Nota única que resume o jogador juntando todos os jogos: vencer sobe, perder desce, e bater um forte vale mais que bater um fraco. Quanto maior, melhor.',
  piso: 'A mesma conta, mas contando só os jogos naquela superfície. Mostra quem rende diferente conforme o piso (tem quem seja fera no saibro e sofra na grama).',
  forca: 'Média do Elo geral com o piso (metade de cada). Nem só o geral, nem só a superfície: um meio-termo, pra valorizar o especialista sem exagerar num piso.',
  delta: 'É o piso menos o Elo geral: o quanto o jogador rende a mais (+) ou a menos (−) nessa superfície, comparado com <strong>ele mesmo</strong>.',
};
const SAIBA_MAIS = [
  'Todo jogador começa em <strong>1500</strong> e o número anda a cada partida.',
  'A distância entre dois Elos vira a probabilidade: cada <strong>~400 pontos</strong> de vantagem ≈ <strong>91%</strong> pro mais forte; Elo igual = 50/50.',
  'Os primeiros jogos mexem mais no número; com o tempo ele fica estável.',
  'Menos de ~15 jogos na superfície: o piso ainda não é confiável — o app marca <strong>poucos dados</strong>.',
  'Recalculado <strong>todo dia</strong> com os jogos mais recentes.',
];

function renderExplain(r) {
  const ex = buildReadingExplanation(r);
  const blk = (term, what, caso) =>
    `<div class="explain-blk">
       <div class="explain-term">${term}</div>
       <div class="explain-what">${what}</div>
       <div class="explain-case"><span class="explain-case-lbl">No jogo:</span> ${caso}</div>
     </div>`;
  const warn = `<div class="explain-warn">⚠️ É relativo a ele mesmo, não é ranking. Um top pode ter (−40) na grama e ainda assim ser muito melhor que um jogador fraco.</div>`;
  const moreBody = anal.moreOpen
    ? `<ul class="explain-more-list">${SAIBA_MAIS.map((li) => `<li>${li}</li>`).join('')}</ul>`
    : '';
  if (!anal.explainOpen) {
    return `<button class="explain-head" id="btn-explain" aria-expanded="false">
        <span>O que significam esses números?</span><span class="explain-caret">▸</span>
      </button>`;
  }
  return `
    <div class="explain">
      <button class="explain-head open" id="btn-explain" aria-expanded="true">
        <span>O que significam esses números?</span><span class="explain-caret">▾</span>
      </button>
      <div class="explain-body">
        ${blk('Elo — o nível geral', EXPLAIN_STATIC.elo, ex.elo)}
        ${blk('Piso — o Elo só nessa superfície', EXPLAIN_STATIC.piso, ex.piso)}
        ${blk('Força — a nota que decide a %', EXPLAIN_STATIC.forca, ex.forca)}
        ${blk('(+X) e (−Y) — acima ou abaixo do próprio nível', EXPLAIN_STATIC.delta, ex.delta)}
        ${warn}
        <button class="explain-more-head" id="btn-more" aria-expanded="${anal.moreOpen}">
          <span>Saiba mais: de onde vem o Elo</span><span class="explain-caret">${anal.moreOpen ? '▾' : '▸'}</span>
        </button>
        ${moreBody}
      </div>
    </div>`;
}

function renderH2H() {
  const sm = scoutForTour();
  if (!sm) return '';
  const aN = anal.a.name, bN = anal.b.name;
  const h = headToHead(sm, aN, bN);
  if (!h.total) return `<div class="h2h"><span class="h2h-lbl">H2H</span> <span class="field-hint">sem confrontos diretos (últimos 3 anos)</span></div>`;
  const bs = h.bySurface[anal.surface];
  const surfTxt = bs ? ` · ${bs.a}×${bs.b} no ${SURFACE_PT[anal.surface]}` : '';
  const lastTxt = h.last ? ` · último: ${h.last.winner} venceu` : '';
  return `<div class="h2h"><span class="h2h-lbl">H2H</span> <strong>${aN} ${h.aWins} × ${h.bWins} ${bN}</strong> <span class="field-hint">${surfTxt}${lastTxt}</span></div>`;
}

function renderTactics(r) {
  const favIsA = r.favorite === anal.a.name;
  const styleFav = favIsA ? anal.a.style : anal.b.style;
  const styleUnd = favIsA ? anal.b.style : anal.a.style;
  const t = tacticalSuggestion(r, styleFav, styleUnd, SURFACE_PT[anal.surface]);
  return `<div class="tactics">
      <div class="tactics-head">💡 Leitura pro trade</div>
      <p class="tactics-line">${t.pende}</p>
      <p class="tactics-line">${t.caminho}</p>
      <p class="tactics-line tactics-risk">${t.risco}</p>
      <p class="field-hint" style="margin-top:6px">Leitura dos padrões — não é recomendação nem garantia. Você decide.</p>
    </div>`;
}

function renderWatch(r) {
  const favIsA = r.favorite === anal.a.name;
  const fav = favIsA ? anal.a : anal.b;
  const und = favIsA ? anal.b : anal.a;
  const lines = whatToWatch(fav, und, anal.tour);
  return `<div class="watch">
      <div class="watch-head">👁️ O que observar</div>
      ${lines.map((l) => `<p class="watch-line">${l}</p>`).join('')}
      <p class="watch-foot">Leitura dos perfis — o que costuma mexer o mercado, não garantia.</p>
    </div>`;
}

// Uma linha comparativa A × B: números nas pontas + BARRA DE DIFERENÇA — sai do
// centro pro lado de quem leva, proporcional ao Δ (opts.full = Δ que enche o lado).
// Valor faltando vira "—" sem barra.
function versusRow(label, a, b, opts = {}) {
  const fmt = opts.fmt || ((x) => x);
  if (a == null || b == null) {
    return `<div class="vs-row"><div class="vs-top"><span class="vs-a">${a != null ? fmt(a) : '—'}</span><span class="vs-lbl">${label}</span><span class="vs-b">${b != null ? fmt(b) : '—'}</span></div></div>`;
  }
  const aWins = a > b, bWins = b > a;
  const w = (Math.min(1, Math.abs(a - b) / (opts.full || 1)) * 100).toFixed(1); // % da metade
  return `<div class="vs-row">
    <div class="vs-top"><span class="vs-a${aWins ? ' vs-win' : ''}">${fmt(a)}</span><span class="vs-lbl">${label}</span><span class="vs-b${bWins ? ' vs-win' : ''}">${fmt(b)}</span></div>
    <div class="vs-bar"><div class="vs-half vs-half-l">${aWins ? `<i style="width:${w}%"></i>` : ''}</div><div class="vs-half vs-half-r">${bWins ? `<i style="width:${w}%"></i>` : ''}</div></div>
  </div>`;
}

// Linhas do raio-x (saque, devolução, nível, forma) — perfil comparativo pré-jogo
// com o que o modelo já tem. Os nomes ficam no header comparativo acima.
function renderVersus(r) {
  const A = anal.a, B = anal.b;
  const sA = A.serve, sB = B.serve;
  const p = (x) => `${Math.round(x * 100)}%`;
  const serveBlock = (sA && sB)
    ? [
        versusRow('Aces (por saque)', sA.acePct, sB.acePct, { fmt: p, full: 0.06 }),
        versusRow('1º serviço dentro', sA.firstInPct, sB.firstInPct, { fmt: p, full: 0.12 }),
        versusRow('Ganhos no 1º saque', sA.firstWonPct, sB.firstWonPct, { fmt: p, full: 0.10 }),
        versusRow('Ganhos no 2º saque', sA.secondWonPct, sB.secondWonPct, { fmt: p, full: 0.12 }),
        versusRow('Break points salvos', sA.bpSavedPct, sB.bpSavedPct, { fmt: p, full: 0.10 }),
        `<div class="vs-sec">Devolução</div>`,
        versusRow('Pontos na devolução', sA.returnPtsWonPct, sB.returnPtsWonPct, { fmt: p, full: 0.10 }),
      ].join('')
    : `<div class="vs-empty">Sem dados de saque para um dos jogadores (base Challenger).</div>`;
  // Forma recente (V/D) — reusa o histórico do scouting.
  const sm = scoutForTour();
  let formaRow = '';
  if (sm) {
    const pills = (name) => {
      const f = recentForm(sm, name, 5);
      return f.results.length ? f.results.map((rr) => `<span class="vs-form-pill ${rr.won ? 'w' : 'l'}">${rr.won ? 'V' : 'D'}</span>`).join('') : '<span class="field-hint">—</span>';
    };
    formaRow = `<div class="vs-row"><div class="vs-top"><span class="vs-form">${pills(A.name)}</span><span class="vs-lbl">Forma (últimos 5)</span><span class="vs-form">${pills(B.name)}</span></div></div>`;
  }
  return `
    <div class="versus">
      <div class="vs-sec">Saque</div>
      ${serveBlock}
      <div class="vs-sec">Nível &amp; forma</div>
      ${versusRow('Elo (força geral)', r.a.elo, r.b.elo, { full: 150 })}
      ${versusRow(`Piso no ${SURFACE_PT[anal.surface]}`, r.a.surfaceElo, r.b.surfaceElo, { full: 150 })}
      ${formaRow}
    </div>`;
}

// Coluna de um jogador no header comparativo (foto + nome + prob + odd justa).
function versusPlayer(key, name, prob, odd, isFav) {
  return `<button class="vs-player${isFav ? ' fav' : ''}" data-dossier="${key}">
    <span class="pl-avatar vs-ava" data-photo="${key}"><span>${initials(name)}</span></span>
    <span class="vs-pname">${name}${isFav ? ' 👑' : ''}</span>
    <span class="vs-pprob">${pct(prob)}</span>
    <span class="vs-podd">odd justa ${odd.toFixed(2)}</span>
  </button>`;
}

function readingCardHTML(r) {
  const confPill = { alta: 'pill-green', 'média': 'pill-amber', baixa: 'pill-red' }[r.confidence.level];
  const favIsA = r.favorite === anal.a.name;
  const fullA = anal.a.fullName || anal.a.name;
  const fullB = anal.b.fullName || anal.b.name;
  const adjustNotes = [
    (() => { if (!r.ageAdjust?.adjusted) return ''; const nm = r.ageAdjust.gap > 0 ? fullA : fullB; const t = ageAdjustText(r.ageAdjust, nm); return t ? `<div class="field-hint vs-note">${t}</div>` : ''; })(),
    (() => { if (!r.ageSuppressed) return ''; const nm = r.ageSuppressed.gap > 0 ? fullA : fullB; const t = ageSuppressedText(r.ageSuppressed, nm); return t ? `<div class="field-hint vs-note">${t}</div>` : ''; })(),
    (() => { if (!r.decayAdjust?.adjusted) return ''; const nm = (r.decayAdjust.inatA ?? 0) >= (r.decayAdjust.inatB ?? 0) ? fullA : fullB; const t = decayAdjustText(r.decayAdjust, nm); return t ? `<div class="field-hint vs-note">${t}</div>` : ''; })(),
  ].join('');
  return `
    <div class="reading-card">
      <div class="vs-players">
        ${versusPlayer('a', fullA, r.probA, r.fairOddA, favIsA)}
        <div class="vs-mid"><span class="vs-vs">VS</span></div>
        ${versusPlayer('b', fullB, r.probB, r.fairOddB, !favIsA)}
      </div>
      <div class="vs-context">
        <span class="field-hint">no ${SURFACE_PT[anal.surface]}:</span>
        <span class="pill pill-green">${r.marginLabel}</span>
        <span class="pill ${confPill}">confiança ${r.confidence.level}</span>
      </div>
      ${adjustNotes}
      ${renderVersus(r)}
      ${renderH2H()}
      <div class="reading-note">${narrative(r)}</div>
      ${renderTactics(r)}
      ${renderWatch(r)}
    </div>`;
}

function renderLive(pre) {
  const base = anal.tour === 'WTA' ? 0.56 : 0.64;
  const L = anal.live;
  const aN = anal.a.name;
  const bN = anal.b.name;

  // PASSO 1 — DE ONDE PARTE. O nosso Elo fica em média 8pp longe do mercado e erra mais
  // que ele (medido em 19k jogos). Então, com as odds de abertura informadas, o mercado manda.
  const ancora = devigPair(L.preA, L.preB);
  const ancorado = ancora != null;
  const probPreA = ancorado ? ancora : pre.probA;

  const favIsA = probPreA >= 0.5;
  // PASSOS 2 e 3 juntos, num só lugar: Markov ancorado + correção medida. A escada usa
  // ESTA mesma função nos estados seguintes — senão ela mostraria número cru com cara de
  // precisão, propagando justamente o viés que a gente acabou de corrigir.
  const fairAt = (st) => {
    const cru = liveFairOdds(probPreA, st, { base, bestOf: L.bestOf });
    const corr = correctFavProb({
      tour: anal.tour,
      favPreProb: favIsA ? probPreA : 1 - probPreA,
      favSets: favIsA ? st.setsA : st.setsB,
      dogSets: favIsA ? st.setsB : st.setsA,
      bestOf: L.bestOf,
      modelProbFav: favIsA ? cru.probA : cru.probB,
    });
    const pa = favIsA ? corr.prob : 1 - corr.prob;
    return { probA: pa, probB: 1 - pa, oddA: 1 / pa, oddB: 1 / (1 - pa), corr };
  };

  const estadoAgora = { setsA: L.setsA, setsB: L.setsB, gamesA: L.gamesA, gamesB: L.gamesB, serverIsA: L.serverIsA };
  const agora = fairAt(estadoAgora);
  const corr = agora.corr;
  const probA = agora.probA;
  const probB = agora.probB;
  const favA = probA >= 0.5;
  const step = (f, v) => `<div class="livestep"><button class="lstep" data-live="${f}" data-d="-1">−</button><span class="lstep-v">${v}</span><button class="lstep" data-live="${f}" data-d="1">+</button></div>`;

  const fairA = 1 / probA, fairB = 1 / probB;
  const preInput = (side, v) => `<button class="value-input" data-pre="${side}">${v != null ? v.toFixed(2) : 'informar'}</button>`;
  const ancoraBox = `
    <div class="anchor-box${ancorado ? ' on' : ''}">
      <div class="anchor-head">${ancorado ? '⚓ Ancorado no mercado' : '⚓ Âncora — odd de abertura na Betfair'}</div>
      <div class="or-inputs">
        <div class="or-in"><span class="live-lbl">${aN}</span>${preInput('A', L.preA)}</div>
        <div class="or-in"><span class="live-lbl">${bN}</span>${preInput('B', L.preB)}</div>
      </div>
      <div class="anchor-note">${
        ancorado
          ? `A conta parte de <strong>${pct(probPreA)}</strong> pro ${aN}, que é o preço do mercado. <span class="field-hint">(nosso Elo dizia ${pct(pre.probA)} — descartado, o mercado é mais preciso)</span>`
          : `Sem as <strong>duas</strong> odds, a conta parte do <strong>nosso Elo</strong> — que fica 8pp longe do mercado em média e erra mais. Informe as duas pra ancorar.`
      }</div>
      ${
        // Mercado e Elo discordando de QUEM é o favorito quase sempre é odd no campo errado.
        // Acontece: é fácil trocar os dois valores de lugar. Avisa em vez de calcular calado.
        ancorado && favIsA !== pre.probA >= 0.5
          ? `<div class="anchor-warn">⚠️ O mercado e o nosso Elo discordam sobre <strong>quem é o favorito</strong>. Confira se as odds não estão trocadas de campo — a de <strong>${aN}</strong> vai no primeiro, a de <strong>${bN}</strong> no segundo. Se estiverem certas, é uma divergência real e vale entender por quê.</div>`
          : ''
      }
    </div>`;
  // ESCADA DO PRÓXIMO GAME: pra onde a justa vai em cada desfecho. Não é previsão de quem
  // ganha o game — é a aritmética do movimento, que é o que define tamanho de posição.
  const prox = nextGameStates(estadoAgora, L.bestOf);
  let escada = '';
  if (prox) {
    const sacador = L.serverIsA ? aN : bN;
    const hold = fairAt(prox.hold);
    const brk = fairAt(prox.broken);
    // Alavancagem se mede em PROBABILIDADE, não em ticks: em odd curta (1.07) os degraus
    // comprimem e um game decisivo pareceria "pequeno". O swing em pontos percentuais é
    // igual pros dois lados e não depende da faixa de odd. Os ticks vêm depois, por lado,
    // porque é neles que se executa — e eles diferem MUITO entre favorito e azarão.
    const amplitudePp = Math.abs(hold.probA - brk.probA) * 100;
    const ticksA = ticksBetween(hold.oddA, brk.oddA);
    const ticksB = ticksBetween(hold.oddB, brk.oddB);
    const alavanca = amplitudePp >= 10;
    const cel = (r) => `<div class="lad-line"><span>${aN}</span><strong>${r.oddA.toFixed(2)}</strong></div>
        <div class="lad-line"><span>${bN}</span><strong>${r.oddB.toFixed(2)}</strong></div>`;
    escada = `
      <div class="ladder${alavanca ? ' leverage' : ''}">
        <div class="ladder-head">⛓ Próximo ${prox.tiebreak ? 'tie-break' : 'game'} — ${prox.tiebreak ? 'saca' : 'saca'} ${sacador}</div>
        <div class="ladder-grid">
          <div class="lad-col">
            <div class="lad-cap">${prox.tiebreak ? 'SE VENCER O TIE-BREAK' : 'SE SEGURAR'}</div>
            ${cel(hold)}
          </div>
          <div class="lad-col">
            <div class="lad-cap">${prox.tiebreak ? 'SE PERDER O TIE-BREAK' : 'SE FOR QUEBRADO'}</div>
            ${cel(brk)}
          </div>
        </div>
        <div class="lad-foot">
          ${alavanca ? '⚡ <strong>Game de alavanca.</strong> ' : ''}<strong>${amplitudePp.toFixed(1).replace('.', ',')} pontos</strong> de probabilidade em jogo${alavanca ? '' : ' — pouco, operar aqui é pagar spread'}.
          ${ticksA != null && ticksB != null ? `<br><span class="field-hint">Na escada: ${aN} anda ${Math.abs(ticksA)} degraus · ${bN} anda ${Math.abs(ticksB)}.</span>` : ''}
        </div>
      </div>`;
  }
  const corrNota = corr.applied
    ? `<div class="corr-note">✔ <strong>Corrigido pelo histórico.</strong> Neste placar, favoritos de ${corr.band} vencem <strong>${formatPctFrac(corr.real)}</strong> na vida real, contra ${formatPctFrac(corr.model)} que o modelo projeta — medido em ${corr.n.toLocaleString('pt-BR')} jogos.</div>`
    : `<div class="corr-note off">Sem correção histórica neste estado (${corr.reason}) — o número é o do modelo puro.</div>`;
  // Grava a observação ao vivo (só conta quando há odd da Betfair informada). A repetição
  // do mesmo estado é ignorada pelo próprio módulo, então chamar a cada render é seguro.
  const capturas = addCapture(
    localStorage,
    buildSnapshot({
      at: new Date().toISOString(),
      tour: anal.tour,
      surface: anal.surface,
      level: anal.level,
      a: aN,
      b: bN,
      live: L,
      fair: { fairOddA: fairA, fairOddB: fairB },
      preProbA: probPreA, // a âncora REALMENTE usada (mercado quando informado, senão Elo)
    })
  );
  // Quem decide é o EV LÍQUIDO (já com comissão), não a divergência bruta: a comissão
  // incide sobre o lucro e cria uma zona morta em volta da justa onde nada é operável.
  const comissao = getCommission();
  const comPct = (comissao * 100).toFixed(1).replace('.', ',');
  const signals = [
    { n: aN, fair: fairA, mkt: L.mktA },
    { n: bN, fair: fairB, mkt: L.mktB },
  ]
    // `bruto` = o MESMO lado, sem comissão. Assim "bruto → líquido" fala do mesmo trade
    // (usar a divergência crua aqui invertia o sinal no lay e confundia).
    .map((s) => ({ ...s, or: overreaction(s.fair, s.mkt), net: netEdge(s.fair, s.mkt, comissao), bruto: netEdge(s.fair, s.mkt, 0) }))
    .filter((s) => s.or && s.net && s.bruto);
  const melhor = signals.slice().sort((a, b) => b.net.ev - a.net.ev)[0];
  let orCard = '';
  if (melhor) {
    const zona = `Com ${comPct}% de comissão, só há valor <strong>lançando abaixo de ${melhor.net.layMax.toFixed(2)}</strong> ou <strong>bancando acima de ${melhor.net.backMin.toFixed(2)}</strong>.`;
    const odds = `<div class="or-odds">
        <div class="or-odd"><span class="or-odd-lbl">Betfair paga</span><span class="or-odd-val">${melhor.mkt.toFixed(2)}</span></div>
        <div class="or-odd"><span class="or-odd-lbl">Âncora justa</span><span class="or-odd-val">${melhor.fair.toFixed(2)}</span></div>
      </div>`;
    if (melhor.net.covers) {
      orCard = `<div class="or-card">
        <div class="or-top"><span class="or-title">${melhor.net.back ? 'BACK' : 'LAY'} no ${melhor.n}</span><span class="or-mag">${formatSignedPct(melhor.net.ev * 100)} líquido</span></div>
        ${odds}
        <div class="or-net">Bruto ${formatSignedPct(melhor.bruto.ev * 100)} → <strong>líquido ${formatSignedPct(melhor.net.ev * 100)}</strong>, depois da comissão de ${comPct}%.</div>
        <div class="or-note">${zona} Confira o motivo (lesão? cansaço?) antes de entrar. Você decide.</div>
      </div>`;
    } else {
      orCard = `<div class="or-card or-neutral">
        <div class="or-top"><span class="or-title">Zona morta — não cobre a comissão</span><span class="or-mag">${formatSignedPct(melhor.net.ev * 100)}</span></div>
        ${odds}
        <div class="or-note">${zona} A diferença de hoje some na comissão — não é entrada.</div>
      </div>`;
    }
  }
  const mktInput = (side, v) => `<button class="value-input" data-mkt="${side}">${v != null ? v.toFixed(2) : 'informar'}</button>`;

  return `
    <div class="live-panel">
      ${ancoraBox}
      <div class="live-grid">
        <div class="live-cell"><span class="live-lbl">Sets · ${aN}</span>${step('setsA', L.setsA)}</div>
        <div class="live-cell"><span class="live-lbl">Sets · ${bN}</span>${step('setsB', L.setsB)}</div>
        <div class="live-cell"><span class="live-lbl">Games · ${aN}</span>${step('gamesA', L.gamesA)}</div>
        <div class="live-cell"><span class="live-lbl">Games · ${bN}</span>${step('gamesB', L.gamesB)}</div>
      </div>
      <div class="field" style="margin-top:12px"><div class="field-label"><span>Quem saca agora</span></div>
        <div class="chips"><button class="chip${L.serverIsA ? ' selected' : ''}" data-server="A">${aN}</button><button class="chip${!L.serverIsA ? ' selected' : ''}" data-server="B">${bN}</button></div>
      </div>
      <div class="field"><div class="field-label"><span>Melhor de</span></div>
        <div class="chips"><button class="chip${L.bestOf === 3 ? ' selected' : ''}" data-bestof="3">3 sets</button><button class="chip${L.bestOf === 5 ? ' selected' : ''}" data-bestof="5">5 sets</button></div>
      </div>
      <div class="reading-card" style="margin-top:6px">
        <div class="reading-fav">
          <span class="field-hint">Odd justa AO VIVO</span>
          <div class="reading-fav-name">${favA ? aN : bN}</div>
          <div class="reading-fav-prob">${pct(favA ? probA : probB)}</div>
        </div>
        <div class="reading-players">
          <div class="pl-row ${favA ? 'fav' : ''}"><div class="pl-top"><span class="pl-name">${aN}</span><span class="pl-prob">${pct(probA)}</span></div><div class="pl-sub">odd justa <strong>${(1 / probA).toFixed(2)}</strong></div></div>
          <div class="pl-row ${favA ? '' : 'fav'}"><div class="pl-top"><span class="pl-name">${bN}</span><span class="pl-prob">${pct(probB)}</span></div><div class="pl-sub">odd justa <strong>${(1 / probB).toFixed(2)}</strong></div></div>
        </div>
        ${corrNota}
        ${escada}
        <div class="reading-note field-hint">No início era ${pct(probPreA)} pra ${aN}. Informe a odd da Betfair pra medir a sobre-reação.</div>
        <div class="or-inputs">
          <div class="or-in"><span class="live-lbl">Betfair · ${aN}</span>${mktInput('A', L.mktA)}</div>
          <div class="or-in"><span class="live-lbl">Betfair · ${bN}</span>${mktInput('B', L.mktB)}</div>
        </div>
        ${orCard}
        <div class="capture-bar">
          <span class="field-hint">${capturas} ${capturas === 1 ? 'observação gravada' : 'observações gravadas'} neste aparelho</span>
          <span class="cap-actions">
            <button class="btn btn-ghost" id="btn-commission">comissão ${comPct}%</button>
            ${capturas ? `<button class="btn btn-ghost" id="btn-export-cap">Exportar CSV</button>` : ''}
          </span>
        </div>
      </div>
    </div>`;
}

function openPlayerPicker(model, onPick, opts = {}) {
  const root = document.getElementById('modal-root');
  const allowCustom = !!opts.allowCustom; // permite digitar um nome fora do modelo
  let showAll = false; // por padrão, só quem está ativo (joga hoje)
  let letter = null;
  let query = '';
  let observer = null;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function computeList() {
    const q = query.trim();
    // Busca varre o modelo INTEIRO (não só ativos) e ignora acentos — assim achar
    // "Tabilo" ou "muller" funciona sem trocar pra "Todos". Limita a 100 por performance.
    if (q) {
      const nq = norm(q);
      return model.players
        .filter((p) => norm(p.fullName || p.name).includes(nq) || norm(p.name).includes(nq))
        .sort((a, b) => (b.elo || 0) - (a.elo || 0))
        .slice(0, 100);
    }
    const base = showAll ? model.players : model.players.filter((p) => p.active);
    if (letter) return base.filter((p) => p.name[0].toUpperCase() === letter).sort((a, b) => a.name.localeCompare(b.name));
    return base; // lista completa, rolável — sem corte em 40
  }
  function observePhotos() {
    if (observer) observer.disconnect();
    const listEl = root.querySelector('.picker-list');
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        observer.unobserve(el);
        const p = model.players.find((x) => x.name === decodeURIComponent(el.dataset.pk));
        if (p) loadPhoto(p, () => el);
      }
    }, { root: listEl, rootMargin: '150px' });
    listEl.querySelectorAll('.pp-avatar[data-pk]').forEach((el) => observer.observe(el));
  }
  function renderList() {
    const list = computeList();
    const q = query.trim();
    const countEl = root.querySelector('#pp-count');
    if (countEl) {
      const n = list.length;
      const es = n > 1 ? 'es' : '';
      const suffix = q ? (n > 1 ? 'encontrados' : 'encontrado') : showAll ? '(histórico)' : (n > 1 ? 'ativos' : 'ativo');
      countEl.textContent = n ? `${n} jogador${es} ${suffix}` : '';
    }
    const wrap = root.querySelector('.picker-list');
    const customRow = allowCustom && q
      ? `<button class="picker-row" data-custom="${encodeURIComponent(q)}"><span class="pp-avatar"><span>${initials(q)}</span></span><span class="pp-name">Usar “${q}”</span><span class="field-hint">digitado</span></button>`
      : '';
    const rowsHtml = list.map((p) => {
      const nm = p.fullName || p.name;
      return `<button class="picker-row" data-name="${encodeURIComponent(p.name)}"><span class="pp-avatar" data-pk="${encodeURIComponent(p.name)}"><span>${initials(nm)}</span></span><span class="pp-name">${nm}</span><span class="field-hint">Elo ${p.elo}</span></button>`;
    }).join('');
    wrap.innerHTML = customRow + (list.length ? rowsHtml : (customRow ? '' : `<div class="field-hint" style="padding:16px 6px">Ninguém com esse nome.</div>`));
    wrap.querySelectorAll('.picker-row[data-name]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = model.players.find((x) => x.name === decodeURIComponent(b.dataset.name));
        root.innerHTML = '';
        onPick(p);
      })
    );
    wrap.querySelectorAll('.picker-row[data-custom]').forEach((b) =>
      b.addEventListener('click', () => {
        const nm = decodeURIComponent(b.dataset.custom);
        root.innerHTML = '';
        onPick({ name: nm, fullName: nm });
      })
    );
    observePhotos();
  }
  function draw() {
    const base = showAll ? model.players : model.players.filter((p) => p.active);
    const letters = [...new Set(base.map((p) => p.name[0].toUpperCase()))].sort();
    root.innerHTML = `
      <div class="modal-overlay" id="pp-overlay">
        <div class="modal-sheet picker-sheet">
          <div class="modal-title">Escolha o jogador</div>
          <input class="auth-input pp-search" id="pp-search" placeholder="Buscar por nome…" value="${query}" autocomplete="off">
          <div class="chips" style="margin-bottom:8px">
            <button class="chip${showAll ? '' : ' selected'}" data-mode="ativos">Ativos</button>
            <button class="chip${showAll ? ' selected' : ''}" data-mode="todos">Todos (histórico)</button>
          </div>
          <div class="az-strip">${letters.map((L) => `<button class="az${letter === L ? ' sel' : ''}" data-l="${L}">${L}</button>`).join('')}</div>
          <div class="pp-count" id="pp-count"></div>
          <div class="picker-list"></div>
          <div class="modal-actions"><button class="btn btn-ghost" id="pp-cancel">Cancelar</button></div>
        </div>
      </div>`;
    const search = root.querySelector('#pp-search');
    search.addEventListener('input', () => { query = search.value; letter = null; renderList(); });
    root.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => { showAll = b.dataset.mode === 'todos'; letter = null; query = ''; draw(); })
    );
    root.querySelectorAll('.az').forEach((b) => b.addEventListener('click', () => { letter = b.dataset.l; query = ''; draw(); }));
    root.querySelector('#pp-cancel').addEventListener('click', () => (root.innerHTML = ''));
    root.querySelector('#pp-overlay').addEventListener('click', (e) => { if (e.target.id === 'pp-overlay') root.innerHTML = ''; });
    renderList();
  }
  draw();
}

/* ================= Teclado numérico ================= */
function openKeypad({ title, value = 0, onConfirm, onClose, mode = 'money' }) {
  const root = document.getElementById('modal-root');
  const isOdd = mode === 'odd';
  let buf = value ? (isOdd ? String(value) : String(Math.round(value))) : '';
  // O valor atual aparece no visor, mas o PRIMEIRO dígito digitado SUBSTITUI em vez de
  // emendar: trocar 2.80 por 5.00 no meio de um jogo não pode exigir 4 toques no apagador.
  // O apagador cancela esse estado (aí você edita o número existente normalmente).
  let fresh = buf !== '';

  function draw() {
    const display = isOdd ? (buf || '—') : formatBRL(buf ? Number(buf) : 0);
    const keys = isOdd
      ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
      : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    root.innerHTML = `
      <div class="modal-overlay" id="kp-overlay">
        <div class="modal-sheet" id="kp-sheet">
          <div class="modal-title">${title}</div>
          <div class="keypad-display${fresh ? ' fresh' : ''}">${display}</div>
          ${fresh ? '<div class="keypad-hint">digite pra substituir · ⌫ pra editar</div>' : ''}
          <div class="keypad">${keys.map((k) => `<button class="key" data-k="${k}">${k}</button>`).join('')}</div>
          <div class="modal-actions">${isOdd ? `<button class="btn btn-primary" id="kp-ok">OK</button>` : ''}<button class="btn btn-ghost" id="kp-cancel">Cancelar</button></div>
        </div>
      </div>`;
    root.querySelectorAll('.key').forEach((btn) =>
      btn.addEventListener('click', () => {
        const k = btn.dataset.k;
        if (k === '⌫') {
          buf = buf.slice(0, -1);
          fresh = false; // apagou = quer editar o que está aí
        } else if (k === 'OK') {
          return close(Number(buf || 0));
        } else {
          if (fresh) { buf = ''; fresh = false; } // primeiro toque começa do zero
          if (k === '.') { if (!buf.includes('.')) buf += buf ? '.' : '0.'; }
          else if (buf.length < 9) buf += k;
        }
        draw();
      })
    );
    root.querySelector('#kp-ok')?.addEventListener('click', () => close(clampOdd(Number(buf || 0))));
    root.querySelector('#kp-cancel').addEventListener('click', () => close(null));
    root.querySelector('#kp-overlay').addEventListener('click', (e) => { if (e.target.id === 'kp-overlay') close(null); });
  }
  function close(result) {
    root.innerHTML = '';
    if (result != null) onConfirm(result);
    // Sempre chamado (OK ou Cancelar): quem abriu o teclado por cima de outro
    // modal (ex.: a leitura) usa isto pra se redesenhar de volta.
    if (onClose) onClose();
  }
  draw();
}

const jogadoresEl = document.getElementById('screen-jogadores');
const jog = { tour: 'ATP', query: '' };
let jogObserver = null;

function observeJogPhotos(model) {
  if (jogObserver) jogObserver.disconnect();
  const load = (el) => {
    const p = model.players.find((x) => x.name === decodeURIComponent(el.dataset.pk));
    if (p) loadPhoto(p, () => el);
  };
  const avatars = [...jogadoresEl.querySelectorAll('.jog-avatar[data-pk]')];
  avatars.slice(0, 15).forEach(load); // as visíveis: carrega já
  jogObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      jogObserver.unobserve(e.target);
      load(e.target);
    }
  }, { rootMargin: '300px' });
  avatars.slice(15).forEach((el) => jogObserver.observe(el)); // o resto: conforme rola
}

function jogListHTML(list) {
  if (!list.length) return '<p class="field-hint">Nenhum jogador encontrado.</p>';
  return list
    .map((p, i) => `<button class="jog-row" data-jog="${i}">
        <span class="jog-avatar" data-pk="${encodeURIComponent(p.name)}">${initials(p.name)}</span>
        <span class="jog-body">
          <span class="jog-name">${p.fullName || p.name}</span>
          <span class="jog-sub">Elo ${p.elo}${p.bio && p.bio.rank ? ` · #${p.bio.rank} ${jog.tour}` : ''}${p.level === 'challenger' ? ' · Challenger' : ''}</span>
        </span>
      </button>`)
    .join('');
}

function renderJogadores() {
  loadScoutMatches();
  const model = anal.models[jog.tour];
  if (!model) {
    anal.tour = jog.tour;
    loadModel();
    jogadoresEl.innerHTML = '<h1 class="screen-title">Jogadores</h1><div class="notice"><p>Carregando o modelo…</p></div>';
    return;
  }
  if (model.error) {
    jogadoresEl.innerHTML = `<h1 class="screen-title">Jogadores</h1><div class="notice"><p>Não consegui carregar o modelo ${jog.tour} (${model.error}).</p></div>`;
    return;
  }
  const wire = (list) => {
    jogadoresEl.querySelectorAll('[data-jog]').forEach((b) =>
      b.addEventListener('click', () => {
        anal.tour = jog.tour;
        anal.model = model;
        openDossier(list[Number(b.dataset.jog)]);
      })
    );
  };
  const list = searchPlayers(model.players, jog.query);
  jogadoresEl.innerHTML = `
    <h1 class="screen-title">Jogadores</h1>
    <div class="chips" style="margin-bottom:12px">
      <button class="chip${jog.tour === 'ATP' ? ' selected' : ''}" data-jtour="ATP">ATP</button>
      <button class="chip${jog.tour === 'WTA' ? ' selected' : ''}" data-jtour="WTA">WTA</button>
    </div>
    <input class="jog-search" id="jog-search" type="search" placeholder="Buscar por nome…" value="${jog.query}" />
    <div class="jog-list" id="jog-list">${jogListHTML(list)}</div>`;
  jogadoresEl.querySelectorAll('[data-jtour]').forEach((b) =>
    b.addEventListener('click', () => { jog.tour = b.dataset.jtour; jog.query = ''; renderJogadores(); })
  );
  const inp = jogadoresEl.querySelector('#jog-search');
  inp.addEventListener('input', () => {
    jog.query = inp.value;
    const filtered = searchPlayers(model.players, jog.query);
    const listEl = jogadoresEl.querySelector('#jog-list');
    listEl.innerHTML = jogListHTML(filtered);
    wire(filtered);
    observeJogPhotos(model);
  });
  wire(list);
  observeJogPhotos(model);
}

function bootApp() {
  renderScreen(currentScreen);
}

// Tema (claro é o padrão; escolha salva)
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('investidor.theme', next); } catch {}
});

// Boot: plataforma aberta, sem login.
bootApp();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW não registrado:', err.message));
  });
}
