import { analyzeMatch, playerTags, buildReadingExplanation, serveBand } from './src/analysis.js';
import { styleLines, pressureLines, bioText } from './src/patterns-view.js';
import { tacticalSuggestion } from './src/tactics.js';
import { searchPlayers } from './src/player-search.js';
import { liveFairOdds, overreaction } from './src/inplay.js';
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

function ring(frac, size, stroke, color, track, label, labelColor) {
  const r = size / 2 - stroke / 2 - 1, c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, frac)) * c;
  const txt = label != null ? `<text x="${size / 2}" y="${size / 2}" dy="0.34em" text-anchor="middle" fill="${labelColor || color}" font-size="${Math.round(size * 0.26)}" font-weight="800" font-family="inherit">${label}</text>` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track || 'var(--hover)'}" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>${txt}</svg>`;
}
/* ================= Tela: Análise ================= */
const analiseEl = document.getElementById('screen-analise');
const anal = {
  tour: 'ATP', models: {}, model: null, loadingTour: null, a: null, b: null, surface: 'hard', level: null,
  explainOpen: false, moreOpen: false,
  live: { active: false, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3, mktA: null, mktB: null },
};
// Zera o painel ao vivo (placar + odds de mercado) — chamado ao trocar de confronto.
function resetLive() {
  anal.live = { active: false, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3, mktA: null, mktB: null };
}

// Histórico de partidas (scouting) — carregado sob demanda ao abrir a Análise.
let scoutMatches = null;
async function loadScoutMatches() {
  if (scoutMatches) return;
  try {
    const res = await fetch('matches.json');
    if (!res.ok) return;
    scoutMatches = (await res.json()).matches || [];
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
    if (currentScreen === 'analise') renderAnalise();
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

function renderFixtures() {
  if (!todayData) {
    loadToday();
    return '';
  }
  const list = todayData.matches || [];
  if (!list.length) {
    return `<div class="section-title">Jogos de hoje</div>
      <div class="notice" style="margin-bottom:18px"><p>Sem jogos de tour agora. A grade é montada <strong>automaticamente todo dia</strong> a partir do calendário ATP/WTA — se está vazia, não há jogos do circuito principal no momento (fora de temporada). Use a busca manual abaixo. 👇</p></div>`;
  }
  const liveCount = list.filter((m) => m.status === 'IN_PROGRESS').length;
  const rows = list
    .map((g, i) => {
      const favPct = (g.favoriteProb * 100).toFixed(0);
      const flag =
        g.status === 'IN_PROGRESS' ? `<span class="fx-live">● AO VIVO</span> ` :
        g.status === 'SUSPENDED' ? `<span class="fx-susp">interrompido</span> ` : '';
      const tourn = g.tournament ? `<div class="fx-tourn">${g.tournament}</div>` : '';
      const ageBadge = g.ageAdjust?.adjusted ? ` <span class="field-hint">⚖ ajuste de idade</span>` : '';
      const nivelLabel = g.level === 'challenger' ? ' · Challenger' : '';
      const ageSuppressBadge = g.ageSuppressed ? ` <span class="field-hint">⚖ ajuste suspenso (Challenger)</span>` : '';
      const decayBadge = g.decayAdjust ? ` <span class="field-hint">⚖ ajuste de inatividade</span>` : '';
      return `<button class="fixture" data-fx="${i}">
        <div class="fx-top"><span class="fx-players">${flag}${g.a} vs ${g.b}</span><span class="fx-tour">${g.tour}${nivelLabel} · ${SURFACE_PT[g.surface] || g.surface}</span></div>
        <div class="fx-sub">Favorito: <strong>${g.favorite}</strong> ${favPct}% · ${g.marginLabel} · confiança ${g.confidence}${ageBadge}${ageSuppressBadge}${decayBadge}</div>
        ${tourn}
      </button>`;
    })
    .join('');
  const header = liveCount ? `Jogos de hoje (${list.length}) · ${liveCount} ao vivo` : `Jogos de hoje (${list.length})`;
  return `<div class="section-title">${header}</div><div class="fixtures">${rows}</div>`;
}

async function pickFixture(game) {
  if (anal.tour !== game.tour) {
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
  renderAnalise();
  document.querySelector('.app-main')?.scrollTo({ top: 220, behavior: 'smooth' });
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
  const canRead = anal.a && anal.b;
  analiseEl.innerHTML = renderFixtures() + tourHeader() + `
    <div class="matchup-slots">
      <button class="slot ${anal.a ? 'filled' : ''}" id="slot-a">${anal.a ? (anal.a.fullName || anal.a.name) : '➕ Jogador A'}</button>
      <span class="vs">vs</span>
      <button class="slot ${anal.b ? 'filled' : ''}" id="slot-b">${anal.b ? (anal.b.fullName || anal.b.name) : '➕ Jogador B'}</button>
    </div>
    <div class="field"><div class="field-label"><span>Superfície</span></div>${chipsHTML(anal, 'surface', SURF_OPTS)}</div>
    <div id="reading">${canRead ? renderReading() : `<div class="notice"><p>Escolha os <strong>dois jogadores</strong> e a superfície para ver a leitura do confronto.</p></div>`}</div>
    <p class="field-hint" style="margin-top:14px">⚠️ Leitura do modelo pra você <strong>entender</strong> o jogo — não é recomendação de aposta. O modelo não bate o mercado; use como preparação.</p>`;

  wireTour();
  analiseEl.querySelectorAll('[data-fx]').forEach((b) =>
    b.addEventListener('click', () => pickFixture(todayData.matches[Number(b.dataset.fx)]))
  );
  analiseEl.querySelector('#slot-a').addEventListener('click', () => openPlayerPicker(anal.model, (p) => { anal.a = p; anal.level = null; resetLive(); renderAnalise(); }));
  analiseEl.querySelector('#slot-b').addEventListener('click', () => openPlayerPicker(anal.model, (p) => { anal.b = p; anal.level = null; resetLive(); renderAnalise(); }));
  wireChips(analiseEl, anal, renderAnalise);

  analiseEl.querySelector('#btn-explain')?.addEventListener('click', () => { anal.explainOpen = !anal.explainOpen; renderAnalise(); });
  analiseEl.querySelector('#btn-more')?.addEventListener('click', () => { anal.moreOpen = !anal.moreOpen; renderAnalise(); });
  analiseEl.querySelector('#btn-live')?.addEventListener('click', () => { anal.live.active = !anal.live.active; renderAnalise(); });
  analiseEl.querySelectorAll('[data-live]').forEach((b) =>
    b.addEventListener('click', () => {
      const f = b.dataset.live;
      const max = f.startsWith('sets') ? (anal.live.bestOf === 5 ? 3 : 2) : 7;
      anal.live[f] = Math.min(max, Math.max(0, anal.live[f] + Number(b.dataset.d)));
      renderAnalise();
    })
  );
  analiseEl.querySelectorAll('[data-server]').forEach((b) =>
    b.addEventListener('click', () => { anal.live.serverIsA = b.dataset.server === 'A'; renderAnalise(); })
  );
  analiseEl.querySelectorAll('[data-bestof]').forEach((b) =>
    b.addEventListener('click', () => { anal.live.bestOf = Number(b.dataset.bestof); renderAnalise(); })
  );
  analiseEl.querySelectorAll('[data-mkt]').forEach((b) =>
    b.addEventListener('click', () => {
      const side = b.dataset.mkt;
      openKeypad({ title: `Odd Betfair · ${side === 'A' ? anal.a.name : anal.b.name}`, value: side === 'A' ? anal.live.mktA : anal.live.mktB, mode: 'odd', onConfirm: (v) => { if (side === 'A') anal.live.mktA = v; else anal.live.mktB = v; renderAnalise(); } });
    })
  );
  analiseEl.querySelectorAll('[data-dossier]').forEach((el) =>
    el.addEventListener('click', () => {
      const p = el.dataset.dossier === 'a' ? anal.a : anal.b;
      if (p) openDossier(p);
    })
  );
  if (anal.a && anal.b) {
    loadPhoto(anal.a, () => analiseEl.querySelector('.pl-avatar[data-photo="a"]'));
    loadPhoto(anal.b, () => analiseEl.querySelector('.pl-avatar[data-photo="b"]'));
  }
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

function openDossier(player) {
  const root = document.getElementById('modal-root');
  const st = { explainOpen: false };

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
            ${renderDossierExplain(st, !!s)}
          </div>
          <div class="modal-actions"><button class="btn btn-ghost" id="dos-close">Fechar</button></div>
        </div>
      </div>`;
    root.querySelector('#dos-close').addEventListener('click', () => (root.innerHTML = ''));
    root.querySelector('#dos-overlay').addEventListener('click', (e) => { if (e.target.id === 'dos-overlay') root.innerHTML = ''; });
    root.querySelector('#dos-explain')?.addEventListener('click', () => { st.explainOpen = !st.explainOpen; draw(); });
    loadPhoto(player);
  }

  draw();
}

function tagPill(tag) {
  const map = { forte: 'pill-green', fraco: 'pill-red', neutro: 'pill-muted', 'poucos dados': 'pill-amber' };
  return `<span class="pill ${map[tag] || 'pill-muted'}">${tag}</span>`;
}

function playerRow(side, prob, fairOdd, isFav, dossierKey, fullName) {
  const nm = fullName || side.name;
  return `<div class="pl-row ${isFav ? 'fav' : ''}" data-dossier="${dossierKey}" role="button">
    <div class="pl-avatar" data-photo="${dossierKey}"><span>${initials(nm)}</span></div>
    <div class="pl-body">
      <div class="pl-top"><span class="pl-name">${nm}${isFav ? ' 👑' : ''}</span><span class="pl-prob"${isFav ? ' style="color:var(--green)"' : ''}>${pct(prob)}</span></div>
      <div class="pl-sub">Elo ${side.elo} · piso ${side.surfaceElo ?? '—'} · força ${side.blended} ${tagPill(side.surfaceRead.tag)}${side.surfaceRead.delta ? ` (${side.surfaceRead.delta > 0 ? '+' : ''}${side.surfaceRead.delta})` : ''}</div>
      <div class="pl-sub">odd justa <strong>${fairOdd.toFixed(2)}</strong> <span class="field-hint">· toque p/ dossiê 🃏</span></div>
    </div>
  </div>`;
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

function renderReading() {
  const r = analyzeMatch(anal.a, anal.b, anal.surface, anal.model, anal.level, hojeInt());
  const confPill = { alta: 'pill-green', 'média': 'pill-amber', baixa: 'pill-red' }[r.confidence.level];
  const favIsA = r.favorite === anal.a.name;
  const fullA = anal.a.fullName || anal.a.name;
  const fullB = anal.b.fullName || anal.b.name;
  const favFull = favIsA ? fullA : fullB;
  return `
    <div class="reading-card">
      <div class="reading-fav">
        <div class="reading-fav-head">
          ${ring(r.favoriteProb, 92, 9, 'var(--accent)', 'var(--hover)', Math.round(r.favoriteProb * 100) + '%', 'var(--text-1)')}
          <div class="reading-fav-info">
            <span class="field-hint">Favorito no ${SURFACE_PT[anal.surface]}</span>
            <div class="reading-fav-name">${favFull}</div>
            <div class="reading-pills"><span class="pill pill-green">${r.marginLabel}</span><span class="pill ${confPill}">confiança ${r.confidence.level}</span></div>
          </div>
        </div>
      </div>
      <div class="reading-players">
        ${playerRow(r.a, r.probA, r.fairOddA, favIsA, 'a', fullA)}
        ${playerRow(r.b, r.probB, r.fairOddB, !favIsA, 'b', fullB)}
        ${(() => {
          if (!r.ageAdjust?.adjusted) return '';
          const maisNovoNome = r.ageAdjust.gap > 0 ? fullA : fullB;
          const txt = ageAdjustText(r.ageAdjust, maisNovoNome);
          return txt ? `<div class="field-hint" style="margin-top:8px">${txt}</div>` : '';
        })()}
        ${(() => {
          if (!r.ageSuppressed) return '';
          const maisNovoNome = r.ageSuppressed.gap > 0 ? fullA : fullB;
          const txt = ageSuppressedText(r.ageSuppressed, maisNovoNome);
          return txt ? `<div class="field-hint" style="margin-top:8px">${txt}</div>` : '';
        })()}
        ${(() => {
          if (!r.decayAdjust?.adjusted) return '';
          const nomeMaisParado = (r.decayAdjust.inatA ?? 0) >= (r.decayAdjust.inatB ?? 0) ? fullA : fullB;
          const txt = decayAdjustText(r.decayAdjust, nomeMaisParado);
          return txt ? `<div class="field-hint" style="margin-top:8px">${txt}</div>` : '';
        })()}
      </div>
      ${renderH2H()}
      <div class="reading-note">${narrative(r)}</div>
      ${renderTactics(r)}
    </div>
    ${renderExplain(r)}
    <button class="btn" id="btn-live" style="margin-top:14px">${anal.live.active ? '⏱️ Ocultar trade ao vivo' : '⏱️ Trade ao vivo (odd por placar)'}</button>
    ${anal.live.active ? renderLive(r) : ''}`;
}

function renderLive(pre) {
  const base = anal.tour === 'WTA' ? 0.56 : 0.64;
  const L = anal.live;
  const { probA, probB } = liveFairOdds(pre.probA, { setsA: L.setsA, setsB: L.setsB, gamesA: L.gamesA, gamesB: L.gamesB, serverIsA: L.serverIsA }, { base, bestOf: L.bestOf });
  const favA = probA >= 0.5;
  const aN = anal.a.name;
  const bN = anal.b.name;
  const step = (f, v) => `<div class="livestep"><button class="lstep" data-live="${f}" data-d="-1">−</button><span class="lstep-v">${v}</span><button class="lstep" data-live="${f}" data-d="1">+</button></div>`;

  const fairA = 1 / probA, fairB = 1 / probB;
  const signals = [
    { n: aN, fair: fairA, mkt: L.mktA, or: overreaction(fairA, L.mktA) },
    { n: bN, fair: fairB, mkt: L.mktB, or: overreaction(fairB, L.mktB) },
  ].filter((s) => s.or);
  const withLevel = signals.filter((s) => s.or.level).sort((a, b) => Math.abs(b.or.divPct) - Math.abs(a.or.divPct));
  let orCard;
  if (withLevel.length) {
    const s = withLevel[0];
    const dir = s.or.back ? `BACK no ${s.n}` : `LAY no ${s.n}`;
    orCard = `<div class="or-card">
      <div class="or-head">⚡ SOBRE-REAÇÃO ${s.or.level.toUpperCase()} · ${formatSignedPct(s.or.divPct)}</div>
      <div class="or-action">Valor em <strong>${dir}</strong></div>
      <div class="or-sub">Betfair paga ${s.mkt.toFixed(2)}, o justo é ${s.fair.toFixed(2)}. Medido pelo modelo — confira o motivo (lesão? cansaço?).</div>
    </div>`;
  } else if (signals.length) {
    orCard = `<div class="or-card or-neutral"><div class="or-head">Odd em linha com o justo</div><div class="or-sub">Sem exagero relevante do mercado nesse placar.</div></div>`;
  } else {
    orCard = '';
  }
  const mktInput = (side, v) => `<button class="value-input" data-mkt="${side}">${v != null ? v.toFixed(2) : 'informar'}</button>`;

  return `
    <div class="live-panel">
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
        <div class="reading-note field-hint">No início era ${pct(pre.probA)} pra ${aN}. Informe a odd da Betfair pra medir a sobre-reação.</div>
        <div class="or-inputs">
          <div class="or-in"><span class="live-lbl">Betfair · ${aN}</span>${mktInput('A', L.mktA)}</div>
          <div class="or-in"><span class="live-lbl">Betfair · ${bN}</span>${mktInput('B', L.mktB)}</div>
        </div>
        ${orCard}
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

  function computeList() {
    const base = showAll ? model.players : model.players.filter((p) => p.active);
    const q = query.trim().toLowerCase();
    if (q) return base.filter((p) => (p.fullName || p.name).toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).slice(0, 60);
    if (letter) return base.filter((p) => p.name[0].toUpperCase() === letter).sort((a, b) => a.name.localeCompare(b.name));
    return base.slice(0, 40);
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

/* ================= Chips (wiring compartilhado) ================= */
function wireChips(container, obj, rerender) {
  container.querySelectorAll('.chip[data-field]').forEach((chip) =>
    chip.addEventListener('click', () => {
      const raw = chip.dataset.value;
      const num = Number(raw);
      obj[chip.dataset.field] = raw === String(num) ? num : raw;
      rerender();
    })
  );
}

/* ================= Teclado numérico ================= */
function openKeypad({ title, value = 0, onConfirm, mode = 'money' }) {
  const root = document.getElementById('modal-root');
  const isOdd = mode === 'odd';
  let buf = value ? (isOdd ? String(value) : String(Math.round(value))) : '';

  function draw() {
    const display = isOdd ? (buf || '—') : formatBRL(buf ? Number(buf) : 0);
    const keys = isOdd
      ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
      : ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    root.innerHTML = `
      <div class="modal-overlay" id="kp-overlay">
        <div class="modal-sheet" id="kp-sheet">
          <div class="modal-title">${title}</div>
          <div class="keypad-display">${display}</div>
          <div class="keypad">${keys.map((k) => `<button class="key" data-k="${k}">${k}</button>`).join('')}</div>
          <div class="modal-actions">${isOdd ? `<button class="btn btn-primary" id="kp-ok">OK</button>` : ''}<button class="btn btn-ghost" id="kp-cancel">Cancelar</button></div>
        </div>
      </div>`;
    root.querySelectorAll('.key').forEach((btn) =>
      btn.addEventListener('click', () => {
        const k = btn.dataset.k;
        if (k === '⌫') buf = buf.slice(0, -1);
        else if (k === 'OK') return close(Number(buf || 0));
        else if (k === '.') { if (!buf.includes('.')) buf += buf ? '.' : '0.'; }
        else if (buf.length < 9) buf += k;
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
