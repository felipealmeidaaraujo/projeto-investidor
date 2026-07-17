import * as store from './src/store.js';
import * as auth from './src/supabase.js';
import { summarize, plOnDate, stopLossStatus, tiltWarning, segmentBy, clvStats, clvTrend, clvBySegment } from './src/stats.js';
import { makeTrade } from './src/trade.js';
import { evFraction, kellyFraction, stakeKelly, impliedProb, clvPct } from './src/finance.js';
import { analyzeMatch, playerTags, buildReadingExplanation, serveBand } from './src/analysis.js';
import { styleLines, pressureLines, bioText } from './src/patterns-view.js';
import { tacticalSuggestion } from './src/tactics.js';
import { searchPlayers } from './src/player-search.js';
import { winProbFromState, impliedServeProbs, liveFairOdds, overreaction } from './src/inplay.js';
import { matchPlayer } from './src/match-names.js';
import { closingPatches } from './src/closings.js';
import { recentForm, restDays, headToHead } from './src/scouting.js';
import { formatBRL, formatSignedBRL, formatSignedPct, formatPctFrac } from './src/format.js';
import { careerText } from './src/career.js';
import { ageAdjustText } from './src/age-curve.js';

/* ---------------- Navegação ---------------- */
const tabs = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');
let currentScreen = 'banca';

function renderScreen(target) {
  if (target === 'banca') renderBanca();
  else if (target === 'registrar') renderRegistrar();
  else if (target === 'historico') renderHistorico();
  else if (target === 'analise') renderAnalise();
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
function nowLocalISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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

/* ================= Tela: Banca ================= */
const bancaEl = document.getElementById('screen-banca');
let draft = null;

const STOP_OPTS = [0.05, 0.1, 0.15, 0.2];
const MAXSTAKE_OPTS = [0.01, 0.02, 0.03, 0.05];
const KELLY_OPTS = [{ v: 0.125, l: '⅛' }, { v: 0.25, l: '¼' }, { v: 0.5, l: '½' }, { v: 1, l: 'Cheia' }];

function defaultDraft() {
  return { initial: 0, dailyStopLossPct: 0.1, maxStakePct: 0.03, kellyFraction: 0.25 };
}
function renderBanca() {
  if (!draft && !store.isConfigured()) draft = defaultDraft();
  if (draft) renderConfigForm();
  else renderDashboard();
}
function renderConfigForm() {
  const first = !store.isConfigured();
  bancaEl.innerHTML = `
    <h1 class="screen-title">${first ? 'Configurar banca' : 'Ajustar configuração'}</h1>
    <div class="card"><p class="card-lead">Defina sua banca e os limites de proteção. Pode mudar quando quiser.</p></div>
    <div class="field">
      <div class="field-label"><span>Banca inicial</span><span class="field-hint">toque para digitar</span></div>
      <button class="value-input" id="btn-initial">${formatBRL(draft.initial)}</button>
    </div>
    <div class="field">
      <div class="field-label"><span>Stop-loss diário</span><span class="field-hint">perda máxima no dia</span></div>
      ${chipsHTML(draft, 'dailyStopLossPct', STOP_OPTS)}
    </div>
    <div class="field">
      <div class="field-label"><span>Máximo por operação</span><span class="field-hint">% da banca por trade</span></div>
      ${chipsHTML(draft, 'maxStakePct', MAXSTAKE_OPTS)}
    </div>
    <div class="field">
      <div class="field-label"><span>Fração de Kelly</span><span class="field-hint">¼ é o recomendado</span></div>
      ${chipsHTML(draft, 'kellyFraction', KELLY_OPTS)}
    </div>
    <button class="btn btn-primary" id="btn-save" ${draft.initial > 0 ? '' : 'disabled'}>Salvar</button>
    ${first ? '' : '<button class="btn btn-ghost" id="btn-cancel" style="margin-top:8px">Cancelar</button>'}`;

  wireChips(bancaEl, draft, renderBanca);
  bancaEl.querySelector('#btn-initial').addEventListener('click', () =>
    openKeypad({ title: 'Banca inicial', value: draft.initial, onConfirm: (v) => { draft.initial = v; renderBanca(); } })
  );
  bancaEl.querySelector('#btn-save').addEventListener('click', async () => {
    try { await store.setConfig({ ...draft }); }
    catch { toast('Sem conexão — não salvo.'); return; }
    draft = null;
    renderBanca();
    toast('Configuração salva ✅');
  });
  bancaEl.querySelector('#btn-cancel')?.addEventListener('click', () => { draft = null; renderBanca(); });
}
/* ---- Mini-gráficos (SVG) ---- */
function pctOf(a, b) { return b ? Math.round((a / b) * 100) : 0; }
function areaSpark(values, w, h, color) {
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), range = (max - min) || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / range) * (h - 8)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const id = 'sg' + Math.floor(Math.random() * 1e6);
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".26"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${line} L ${w} ${h} L 0 ${h} Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function lineSpark(values, w, h, color) {
  if (values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), range = (max - min) || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / range) * (h - 6)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" opacity=".9"/></svg>`;
}
function ring(frac, size, stroke, color, track, label, labelColor) {
  const r = size / 2 - stroke / 2 - 1, c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, frac)) * c;
  const txt = label != null ? `<text x="${size / 2}" y="${size / 2}" dy="0.34em" text-anchor="middle" fill="${labelColor || color}" font-size="${Math.round(size * 0.26)}" font-weight="800" font-family="inherit">${label}</text>` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track || 'var(--hover)'}" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>${txt}</svg>`;
}
function donutCard(segments, totalPL) {
  const size = 150, stroke = 20, r = size / 2 - stroke / 2 - 2, c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let off = 0;
  const arcs = segments.map((s) => {
    const len = (s.value / total) * c;
    const el = `<circle cx="75" cy="75" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 75 75)"/>`;
    off += len; return el;
  }).join('');
  const plColor = totalPL > 0 ? 'var(--green)' : totalPL < 0 ? 'var(--red)' : 'var(--text-2)';
  const plTxt = formatSignedBRL(totalPL).replace('R$ ', '').replace('R$ ', '');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--hover)" stroke-width="${stroke}"/>${arcs}<text x="75" y="68" text-anchor="middle" fill="var(--text-2)" font-size="11" font-weight="600" font-family="inherit">P/L total</text><text x="75" y="89" text-anchor="middle" fill="${plColor}" font-size="16" font-weight="800" font-family="inherit">${plTxt}</text></svg>`;
}

function renderDashboard() {
  const cfg = store.getConfig();
  const trades = store.getTrades();
  const banca = store.currentBankroll();
  const delta = banca - cfg.initial;
  const s = summarize(trades);
  const sl = stopLossStatus(cfg, trades, todayLocal());
  const barClass = sl.used >= 1 ? 'danger' : sl.used >= 0.7 ? 'warn' : '';

  const deltaClass = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
  const roiClass = s.roi > 0 ? 'pos' : s.roi < 0 ? 'neg' : '';
  const clvClass = s.avgClvPct > 0 ? 'pos' : s.avgClvPct < 0 ? 'neg' : '';

  const sorted = trades.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let run = cfg.initial;
  const bancaSeries = [cfg.initial];
  for (const t of sorted) { run += t.pl || 0; bancaSeries.push(run); }
  const clvVals = sorted.filter((t) => t.clv != null).map((t) => t.clv);
  const zeros = s.count - s.greens - s.reds;
  const decided = s.greens + s.reds;
  const stopColor = sl.used >= 1 ? 'var(--red)' : sl.used >= 0.7 ? 'var(--amber)' : 'var(--green)';

  bancaEl.innerHTML = `
    <h1 class="screen-title">Sua banca</h1>
    <div class="grid-hero">
      <div class="hero-card">
        <span class="hero-label">Banca atual</span>
        <span class="hero-value ${deltaClass}">${formatBRL(banca)}</span>
        <div class="hero-meta">
          <span class="pill ${delta >= 0 ? 'pill-green' : 'pill-red'}">${delta >= 0 ? '↑' : '↓'} ${formatSignedBRL(delta)}</span>
          <span class="pill pill-muted">inicial ${formatBRL(cfg.initial)}</span>
        </div>
        ${bancaSeries.length > 1 ? `<div style="margin-top:16px">${areaSpark(bancaSeries, 320, 54, delta >= 0 ? 'var(--green)' : 'var(--red)')}</div>` : ''}
      </div>
      <div class="vcard v-green">
        <div class="v-lab">CLV médio</div>
        ${clvVals.length > 1 ? `<div class="v-chart">${lineSpark(clvVals, 84, 32, '#fff')}</div>` : ''}
        <div><div class="v-val">${s.avgClvPct ? formatSignedPct(s.avgClvPct) : '—'}</div><div class="v-cap">sua habilidade real ✓</div></div>
      </div>
      <div class="vcard v-blue">
        <div class="v-lab">Acerto</div>
        <div class="v-ring">${ring(decided ? s.winRate : 0, 66, 7, '#fff', 'rgba(255,255,255,.28)', decided ? formatPctFrac(s.winRate, 0) : '—', '#fff')}</div>
        <div><div class="v-val">${s.greens}/${decided || 0}</div><div class="v-cap">greens no período</div></div>
      </div>
    </div>
    ${s.count > 0 ? `
    <div class="grid-2b">
      <div class="card">
        <div class="seg-title">Resultado dos trades</div>
        <div class="donut-wrap">
          ${donutCard([{ value: s.greens, color: 'var(--green)' }, { value: s.reds, color: 'var(--red)' }, { value: zeros, color: 'var(--text-3)' }], s.totalPL)}
          <div class="seg">
            <div class="seg-line"><span class="nm">Greens</span><span class="vv pos">${s.greens}</span><div class="seg-bar"><i style="width:${pctOf(s.greens, s.count)}%;background:var(--green)"></i></div></div>
            <div class="seg-line"><span class="nm">Reds</span><span class="vv neg">${s.reds}</span><div class="seg-bar"><i style="width:${pctOf(s.reds, s.count)}%;background:var(--red)"></i></div></div>
            <div class="seg-line"><span class="nm">Zerou</span><span class="vv" style="color:var(--text-2)">${zeros}</span><div class="seg-bar"><i style="width:${pctOf(zeros, s.count)}%;background:var(--text-3)"></i></div></div>
            <div class="seg-line" style="border-top:1px solid var(--border-subtle);padding-top:11px"><span class="nm">ROI</span><span class="vv ${roiClass}">${formatSignedPct(s.roi * 100)}</span></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="seg-title">Stop-loss diário</div>
        <div style="display:flex;align-items:center;gap:18px">
          ${ring(Math.min(1, sl.used), 92, 10, stopColor, 'var(--hover)', Math.round(sl.used * 100) + '%', 'var(--text-1)')}
          <div>
            <div class="tnum" style="font-size:20px;font-weight:800">${formatBRL(sl.lossToday)} <span style="color:var(--text-3);font-size:14px;font-weight:600">/ ${formatBRL(sl.limit)}</span></div>
            <p class="field-hint" style="margin-top:6px">${sl.hit ? 'ATINGIDO — o ideal é parar hoje.' : 'P/L de hoje: ' + formatSignedBRL(sl.plToday)}</p>
            <span class="pill ${sl.hit ? 'pill-red' : sl.used >= 0.7 ? 'pill-amber' : 'pill-green'}" style="margin-top:10px">${sl.hit ? 'pare hoje' : sl.used >= 0.7 ? 'atenção' : 'seguro'}</span>
          </div>
        </div>
      </div>
    </div>` : `<div class="notice"><strong>Banca configurada ✅</strong><p>Registre seus trades na aba <strong>Registrar</strong> para acompanhar ROI, CLV e disciplina.</p></div>`}
    <button class="btn" id="btn-calc" style="margin-bottom:16px">🧮 Calculadora de stake (Kelly)</button>
    <div class="section-title">Configuração</div>
    <div class="card"><p class="card-lead">Stop-loss: <strong>${formatPctFrac(cfg.dailyStopLossPct, 0)}</strong> · Máx/operação: <strong>${formatPctFrac(cfg.maxStakePct, 0)}</strong> · Kelly: <strong>${cfg.kellyFraction}×</strong></p></div>
    <button class="btn" id="btn-adjust">Ajustar configuração</button>
    <button class="btn btn-ghost" id="btn-theme-m" style="margin-top:8px">◐ Alternar tema</button>
    <button class="btn btn-ghost" id="btn-logout">Sair da conta</button>`;

  bancaEl.querySelector('#btn-adjust').addEventListener('click', () => { draft = { ...cfg }; renderBanca(); });
  bancaEl.querySelector('#btn-calc').addEventListener('click', openCalculator);
  bancaEl.querySelector('#btn-theme-m')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('investidor.theme', next); } catch {}
  });
  bancaEl.querySelector('#btn-logout').addEventListener('click', async () => {
    await auth.signOut();
    store.clearCache();
  });
}

/* ================= Calculadora de stake (modal) ================= */
function openCalculator() {
  const root = document.getElementById('modal-root');
  const cfg = store.getConfig();
  const banca = store.currentBankroll();
  const st = { odd: 2.0, p: 0.5 };

  function draw() {
    const evPct = evFraction(st.p, st.odd) * 100;
    const fairOdd = 1 / st.p;
    const stake = stakeKelly({ bankroll: banca, p: st.p, odds: st.odd, fraction: cfg.kellyFraction, capFraction: cfg.maxStakePct });
    const hasValue = evPct > 0;
    const verdict = hasValue
      ? `<div class="calc-verdict pos">✅ Tem valor · stake sugerido <strong>${formatBRL(stake)}</strong> <span class="field-hint">(Kelly ${cfg.kellyFraction}×, com teto)</span></div>`
      : `<div class="calc-verdict neg">❌ Sem valor nessa odd. A odd justa seria <strong>${fairOdd.toFixed(2)}</strong> ou mais. Não entrar.</div>`;

    root.innerHTML = `
      <div class="modal-overlay" id="calc-overlay">
        <div class="modal-sheet">
          <div class="modal-title">Calculadora de stake (Kelly)</div>
          <div class="field">
            <div class="field-label"><span>Odd da entrada</span></div>
            ${oddStepper('odd', st.odd)}
          </div>
          <div class="field">
            <div class="field-label"><span>Sua probabilidade estimada</span><span class="field-hint">sua leitura da chance real</span></div>
            <div class="stepper">
              <button class="step" data-pstep="-0.05">−5%</button>
              <button class="step" data-pstep="-0.01">−1%</button>
              <span class="step-value">${Math.round(st.p * 100)}%</span>
              <button class="step" data-pstep="0.01">+1%</button>
              <button class="step" data-pstep="0.05">+5%</button>
            </div>
          </div>
          <div class="grid-2">
            <div class="stat-card"><span class="stat-label">EV</span><span class="stat-value ${evPct > 0 ? 'pos' : 'neg'}">${formatSignedPct(evPct)}</span></div>
            <div class="stat-card"><span class="stat-label">Odd justa</span><span class="stat-value">${fairOdd.toFixed(2)}</span></div>
          </div>
          ${verdict}
          <div class="modal-actions"><button class="btn btn-ghost" id="calc-close">Fechar</button></div>
        </div>
      </div>`;

    root.querySelectorAll('.step[data-step]').forEach((b) =>
      b.addEventListener('click', () => { st.odd = clampOdd(st.odd + Number(b.dataset.delta)); draw(); })
    );
    root.querySelectorAll('.step[data-pstep]').forEach((b) =>
      b.addEventListener('click', () => { st.p = Math.min(0.99, Math.max(0.01, Math.round((st.p + Number(b.dataset.pstep)) * 100) / 100)); draw(); })
    );
    root.querySelector('#calc-close').addEventListener('click', () => (root.innerHTML = ''));
    root.querySelector('#calc-overlay').addEventListener('click', (e) => { if (e.target.id === 'calc-overlay') root.innerHTML = ''; });
  }
  draw();
}

/* ================= Tela: Registrar ================= */
const regEl = document.getElementById('screen-registrar');
let reg = null;

const MARKET_OPTS = ['Match Odds', 'Handicap', 'Over/Under Games'];
const SURFACE_OPTS = [{ v: 'clay', l: 'Saibro' }, { v: 'hard', l: 'Dura' }, { v: 'grass', l: 'Grama' }, { v: 'indoor', l: 'Indoor' }];
const RESULT_OPTS = [{ v: 'green', l: '🟢 Green' }, { v: 'red', l: '🔴 Red' }, { v: 'zero', l: '⚪ Zerei' }];
const EMOTION_OPTS = [{ v: 'calmo', l: '😌 Calmo' }, { v: 'confiante', l: '💪 Confiante' }, { v: 'ansioso', l: '😬 Ansioso' }, { v: 'tilt', l: '🎢 Tilt' }];

function defaultReg() {
  return { market: null, surface: null, oddEntry: 2.0, oddClose: null, showClose: false, stake: 0, result: null, plAmount: 0, emotion: null, tour: 'ATP', players: null,
    entryType: null, side: null, dir: null, liveState: { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3 }, preProbA: null, preProbKey: null,
    showMore: false, editingScore: false };
}
async function ensureModel(tour) {
  if (anal.models[tour] && !anal.models[tour].error) return anal.models[tour];
  try {
    const res = await fetch(`model-${tour.toLowerCase()}.json`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    anal.models[tour] = await res.json();
  } catch (e) {
    anal.models[tour] = { error: e.message };
  }
  return anal.models[tour];
}
function oddStepper(field, value) {
  return `<div class="stepper">
    <button class="step" data-step="${field}" data-delta="-0.1">−.10</button>
    <button class="step" data-step="${field}" data-delta="-0.01">−.01</button>
    <span class="step-value">${value != null ? value.toFixed(2) : '—'}</span>
    <button class="step" data-step="${field}" data-delta="0.01">+.01</button>
    <button class="step" data-step="${field}" data-delta="0.1">+.10</button>
  </div>`;
}
function regValid() {
  if (!reg.players || !reg.players.a || !reg.players.b) return false;
  if (!reg.market || !reg.result || reg.stake <= 0) return false;
  if ((reg.result === 'green' || reg.result === 'red') && reg.plAmount <= 0) return false;
  if (reg.market === 'Match Odds' && (!reg.entryType || !reg.side || !reg.dir)) return false;
  return true;
}
let _probLoadingKey = null;
function probKeyFor() {
  return `${reg.tour}|${reg.players?.a}|${reg.players?.b}|${reg.surface || 'hard'}`;
}
// Acha o jogador do modelo a partir do rótulo guardado (fullName||name): casa exato primeiro
// (cobre Challenger puro e tour sem fullName), com matchPlayer como fallback (nomes digitados/Odds API).
function findModelPlayer(label, players) {
  return players.find((p) => (p.fullName || p.name) === label || p.name === label) || matchPlayer(label, players);
}
// (Re)calcula a prob pré-jogo do confronto sempre que tour/jogadores/superfície mudam.
async function ensurePreProb() {
  if (reg.market !== 'Match Odds' || reg.entryType !== 'live' || !reg.players?.a || !reg.players?.b) return;
  const key = probKeyFor();
  if (reg.preProbKey === key || _probLoadingKey === key) return;
  _probLoadingKey = key;
  try {
    const m = await ensureModel(reg.tour);
    if (m.error) return;
    const pa = findModelPlayer(reg.players.a, m.players);
    const pb = findModelPlayer(reg.players.b, m.players);
    const prob = pa && pb ? analyzeMatch(pa, pb, reg.surface || 'hard', m).probA : null;
    if (probKeyFor() === key && reg.entryType === 'live') {
      reg.preProbA = prob;
      reg.preProbKey = key;
      renderRegistrar();
    }
  } finally {
    if (_probLoadingKey === key) _probLoadingKey = null;
  }
}
function renderRegistrar() {
  if (!store.isConfigured()) {
    regEl.innerHTML = `<h1 class="screen-title">Registrar trade</h1><div class="notice"><p>Configure sua banca primeiro (aba <strong>Banca</strong>).</p></div>`;
    return;
  }
  if (!reg) reg = defaultReg();
  const cfg = store.getConfig();
  const cap = store.currentBankroll() * cfg.maxStakePct;
  const sl = stopLossStatus(cfg, store.getTrades(), todayLocal());
  const tilt = reg.stake > 0 && tiltWarning(store.getTrades(), todayLocal(), reg.stake);
  const overCap = reg.stake > cap && cap > 0;
  const showPL = reg.result === 'green' || reg.result === 'red';
  const plLabel = reg.result === 'red' ? 'Prejuízo (R$)' : 'Lucro (R$)';

  const isMO = reg.market === 'Match Odds';
  const nmA = reg.players?.a || 'Jogador A';
  const nmB = reg.players?.b || 'Jogador B';
  const hasConf = !!(reg.players?.a && reg.players?.b);
  const liveBase = reg.tour === 'WTA' ? 0.56 : 0.64;
  const RL = reg.liveState;
  const surfLabel = reg.surface ? (SURFACE_PT[reg.surface] || reg.surface) : null;

  let liveFeedback = '';
  if (isMO && reg.entryType === 'live') {
    if (reg.preProbA != null && reg.side) {
      const fair = liveFairOdds(reg.preProbA, RL, { base: liveBase, bestOf: RL.bestOf });
      const sideFair = reg.side === 'a' ? fair.fairOddA : fair.fairOddB;
      const val = clvPct(reg.oddEntry, sideFair, reg.dir || 'back');
      const vCls = val > 0 ? 'pos' : val < 0 ? 'neg' : '';
      liveFeedback = `<div class="live-value">Odd justa ao vivo de <strong>${reg.side === 'a' ? nmA : nmB}</strong>: <strong>${sideFair.toFixed(2)}</strong> · valor da entrada: <strong class="${vCls}">${formatSignedPct(val)}</strong></div>`;
    } else if (reg.preProbA == null) {
      liveFeedback = `<p class="hint-red" style="margin-top:8px">Não consegui identificar os jogadores no modelo — o valor ao vivo não será medido neste confronto.</p>`;
    }
  }

  const rstep = (f, v) => `<div class="livestep"><button class="lstep" data-regsc="${f}" data-d="-1">−</button><span class="lstep-v">${v}</span><button class="lstep" data-regsc="${f}" data-d="1">+</button></div>`;
  const scoreResume = `${RL.setsA}-${RL.setsB} sets · ${RL.gamesA}-${RL.gamesB} games · saca ${RL.serverIsA ? nmA : nmB} · ${RL.bestOf} sets`;
  const scoreEditor = `
    <div class="live-grid">
      <div class="live-cell"><span class="live-lbl">Sets · ${nmA}</span>${rstep('setsA', RL.setsA)}</div>
      <div class="live-cell"><span class="live-lbl">Sets · ${nmB}</span>${rstep('setsB', RL.setsB)}</div>
      <div class="live-cell"><span class="live-lbl">Games · ${nmA}</span>${rstep('gamesA', RL.gamesA)}</div>
      <div class="live-cell"><span class="live-lbl">Games · ${nmB}</span>${rstep('gamesB', RL.gamesB)}</div>
    </div>
    <div class="chips" style="margin-top:10px"><button class="chip${RL.serverIsA ? ' selected' : ''}" data-regserver="A">saca ${nmA}</button><button class="chip${!RL.serverIsA ? ' selected' : ''}" data-regserver="B">saca ${nmB}</button></div>
    <div class="chips" style="margin-top:8px"><button class="chip${RL.bestOf === 3 ? ' selected' : ''}" data-regbestof="3">3 sets</button><button class="chip${RL.bestOf === 5 ? ' selected' : ''}" data-regbestof="5">5 sets</button></div>`;

  const confBlock = hasConf ? `
    <div class="ctx-card">
      <div class="ctx-info">
        <div class="ctx-title">${nmA} × ${nmB}</div>
        <div class="ctx-sub">${reg.tour}${surfLabel ? ' · ' + surfLabel : ''}</div>
      </div>
      <button class="btn btn-ghost" id="reg-clearconf">trocar</button>
    </div>` : `
    <div class="field">
      <div class="field-label"><span>Confronto</span><span class="field-hint">quem jogou (obrigatório)</span></div>
      <div class="chips" style="margin-bottom:10px">
        <button class="chip${reg.tour === 'ATP' ? ' selected' : ''}" data-regtour="ATP">ATP</button>
        <button class="chip${reg.tour === 'WTA' ? ' selected' : ''}" data-regtour="WTA">WTA</button>
      </div>
      <div class="matchup-slots">
        <button class="slot ${reg.players?.a ? 'filled' : ''}" id="reg-slot-a">${reg.players?.a || '➕ Jogador A'}</button>
        <span class="vs">×</span>
        <button class="slot ${reg.players?.b ? 'filled' : ''}" id="reg-slot-b">${reg.players?.b || '➕ Jogador B'}</button>
      </div>
    </div>`;

  const entryChip = (s, d, lbl) => `<button class="chip${reg.side === s && reg.dir === d ? ' selected' : ''}" data-entry="${s}:${d}">${lbl}</button>`;
  const entryBlock = !isMO ? '' : `
    <div class="field"><div class="field-label"><span>Tipo de entrada</span></div>
      <div class="chips"><button class="chip${reg.entryType === 'pre' ? ' selected' : ''}" data-entrytype="pre">Pré-jogo</button><button class="chip${reg.entryType === 'live' ? ' selected' : ''}" data-entrytype="live">Ao vivo</button></div>
    </div>
    ${hasConf ? `<div class="field"><div class="field-label"><span>Entrei em</span></div>
      <div class="entry-row"><span class="entry-name">${nmA}</span>${entryChip('a', 'back', 'Back')}${entryChip('a', 'lay', 'Lay')}</div>
      <div class="entry-row" style="margin-top:8px"><span class="entry-name">${nmB}</span>${entryChip('b', 'back', 'Back')}${entryChip('b', 'lay', 'Lay')}</div>
    </div>` : ''}
    ${reg.entryType === 'live' ? `<div class="field">
      <div class="field-label"><span>Placar da entrada</span><span class="field-hint" id="btn-editscore" style="cursor:pointer;color:var(--accent)">${reg.editingScore ? 'pronto' : 'editar'}</span></div>
      ${reg.editingScore ? scoreEditor : `<div class="score-summary">${scoreResume}</div>`}
    </div>` : ''}
    ${liveFeedback}`;

  regEl.innerHTML = `
    <h1 class="screen-title">Registrar trade</h1>
    ${sl.hit ? `<div class="warn-banner">⚠️ Stop-loss diário atingido. O ideal é <strong>parar hoje</strong>.</div>` : ''}
    ${tilt ? `<div class="warn-banner">🎢 Você aumentou o stake depois de um red. Cuidado com o <strong>tilt</strong> (caçar prejuízo).</div>` : ''}

    ${confBlock}
    <div class="field"><div class="field-label"><span>Mercado</span></div>${chipsHTML(reg, 'market', MARKET_OPTS)}</div>
    ${entryBlock}

    <div class="field">
      <div class="grid-2col">
        <div><div class="field-label"><span>Odd que peguei</span></div><button class="value-input" id="btn-oddentry">${reg.oddEntry != null ? reg.oddEntry.toFixed(2) : '—'}</button></div>
        <div><div class="field-label"><span>Stake</span><span class="field-hint ${overCap ? 'hint-red' : ''}">teto ${formatBRL(cap)}</span></div><button class="value-input" id="btn-stake">${formatBRL(reg.stake)}</button></div>
      </div>
      ${overCap ? `<p class="hint-red" style="margin-top:6px;font-size:12px">Stake acima do seu teto por operação (${formatPctFrac(cfg.maxStakePct, 0)} da banca).</p>` : ''}
    </div>

    <div class="field"><div class="field-label"><span>Resultado</span></div>${chipsHTML(reg, 'result', RESULT_OPTS)}</div>
    ${showPL ? `<div class="field"><div class="field-label"><span>${plLabel}</span></div><button class="value-input" id="btn-pl">${formatBRL(reg.plAmount)}</button></div>` : ''}

    <button class="btn btn-ghost" id="btn-more" style="margin-bottom:8px">${reg.showMore ? '▴ Menos detalhes' : '▾ Mais detalhes'}<span class="field-hint" style="margin-left:6px">superfície, odd de fechamento, emoção</span></button>
    ${reg.showMore ? `
      <div class="field"><div class="field-label"><span>Superfície</span></div>${chipsHTML(reg, 'surface', SURFACE_OPTS)}</div>
      <div class="field">
        <div class="field-label"><span>Odd de fechamento</span><span class="field-hint">opcional — CLV pré-jogo</span></div>
        ${reg.showClose
          ? `<button class="value-input" id="btn-oddclose">${reg.oddClose != null ? reg.oddClose.toFixed(2) : '—'}</button><button class="btn btn-ghost" id="btn-noclose" style="margin-top:8px">Remover</button>`
          : `<button class="btn" id="btn-addclose">+ Adicionar odd de fechamento</button>`}
      </div>
      <div class="field"><div class="field-label"><span>Estado emocional</span></div>${chipsHTML(reg, 'emotion', EMOTION_OPTS)}</div>
    ` : ''}

    <button class="btn btn-primary" id="btn-savetrade" ${regValid() ? '' : 'disabled'}>Salvar trade</button>`;

  wireChips(regEl, reg, renderRegistrar);
  regEl.querySelectorAll('[data-regtour]').forEach((b) =>
    b.addEventListener('click', () => { reg.tour = b.dataset.regtour; reg.players = null; reg.side = null; reg.preProbA = null; reg.preProbKey = null; renderRegistrar(); })
  );
  const pickReg = (side) => async () => {
    const m = await ensureModel(reg.tour);
    if (m.error) { toast('Não consegui carregar os jogadores.'); return; }
    openPlayerPicker(m, (p) => { reg.players = { ...(reg.players || {}), [side]: p.fullName || p.name, tour: reg.tour }; reg.preProbA = null; reg.preProbKey = null; renderRegistrar(); }, { allowCustom: true });
  };
  regEl.querySelector('#reg-slot-a')?.addEventListener('click', pickReg('a'));
  regEl.querySelector('#reg-slot-b')?.addEventListener('click', pickReg('b'));
  regEl.querySelector('#reg-clearconf')?.addEventListener('click', () => { reg.players = null; reg.side = null; reg.preProbA = null; reg.preProbKey = null; renderRegistrar(); });
  regEl.querySelector('#btn-oddentry').addEventListener('click', () =>
    openKeypad({ title: 'Odd que peguei', value: reg.oddEntry, mode: 'odd', onConfirm: (v) => { reg.oddEntry = v; renderRegistrar(); } })
  );
  regEl.querySelector('#btn-stake').addEventListener('click', () =>
    openKeypad({ title: 'Stake (R$)', value: reg.stake, onConfirm: (v) => { reg.stake = v; renderRegistrar(); } })
  );
  regEl.querySelector('#btn-pl')?.addEventListener('click', () =>
    openKeypad({ title: plLabel, value: reg.plAmount, onConfirm: (v) => { reg.plAmount = v; renderRegistrar(); } })
  );
  regEl.querySelector('#btn-more').addEventListener('click', () => { reg.showMore = !reg.showMore; renderRegistrar(); });
  regEl.querySelector('#btn-addclose')?.addEventListener('click', () => { reg.showClose = true; reg.oddClose = reg.oddEntry; renderRegistrar(); });
  regEl.querySelector('#btn-noclose')?.addEventListener('click', () => { reg.showClose = false; reg.oddClose = null; renderRegistrar(); });
  regEl.querySelector('#btn-oddclose')?.addEventListener('click', () =>
    openKeypad({ title: 'Odd de fechamento', value: reg.oddClose, mode: 'odd', onConfirm: (v) => { reg.oddClose = v; renderRegistrar(); } })
  );
  regEl.querySelector('#btn-editscore')?.addEventListener('click', () => { reg.editingScore = !reg.editingScore; renderRegistrar(); });
  regEl.querySelectorAll('[data-entrytype]').forEach((b) =>
    b.addEventListener('click', () => {
      reg.entryType = b.dataset.entrytype;
      if (reg.entryType === 'live') reg.editingScore = true;
      renderRegistrar();
    })
  );
  regEl.querySelectorAll('[data-entry]').forEach((b) =>
    b.addEventListener('click', () => { const [s, d] = b.dataset.entry.split(':'); reg.side = s; reg.dir = d; renderRegistrar(); })
  );
  regEl.querySelectorAll('[data-regsc]').forEach((b) =>
    b.addEventListener('click', () => { const f = b.dataset.regsc; reg.liveState[f] = Math.max(0, reg.liveState[f] + Number(b.dataset.d)); renderRegistrar(); })
  );
  regEl.querySelectorAll('[data-regserver]').forEach((b) => b.addEventListener('click', () => { reg.liveState.serverIsA = b.dataset.regserver === 'A'; renderRegistrar(); }));
  regEl.querySelectorAll('[data-regbestof]').forEach((b) => b.addEventListener('click', () => { reg.liveState.bestOf = Number(b.dataset.regbestof); renderRegistrar(); }));
  regEl.querySelector('#btn-savetrade').addEventListener('click', saveTrade);
  ensurePreProb();
}
async function saveTrade() {
  if (!regValid()) return;
  let liveFairOdd;
  if (reg.market === 'Match Odds' && reg.entryType === 'live' && reg.preProbA != null) {
    const base = reg.tour === 'WTA' ? 0.56 : 0.64;
    const fair = liveFairOdds(reg.preProbA, reg.liveState, { base, bestOf: reg.liveState.bestOf });
    liveFairOdd = reg.side === 'a' ? fair.fairOddA : fair.fairOddB;
  }
  const trade = makeTrade(
    {
      market: reg.market,
      surface: reg.surface,
      oddEntry: reg.oddEntry,
      oddClose: reg.showClose ? reg.oddClose : undefined,
      stake: reg.stake,
      result: reg.result,
      plAmount: reg.plAmount,
      emotion: reg.emotion,
      players: reg.players && reg.players.a && reg.players.b ? reg.players : undefined,
      side: reg.market === 'Match Odds' ? reg.side : undefined,
      dir: reg.market === 'Match Odds' ? reg.dir : undefined,
      entryType: reg.market === 'Match Odds' ? reg.entryType : undefined,
      liveState: reg.entryType === 'live' ? reg.liveState : undefined,
      liveFairOdd,
    },
    { id: crypto.randomUUID(), date: nowLocalISO() }
  );
  try { await store.addTrade(trade); }
  catch { toast('Sem conexão — trade não salvo.'); return; }
  reg = defaultReg();
  renderRegistrar();
  toast('Trade registrado ✅');
  if (trade.result === 'red') openReview(trade.id);
}

/* ================= Tela: Histórico ================= */
const histEl = document.getElementById('screen-historico');
let expandedId = null;

const REVIEW_RED_OPTS = ['Entrei tarde', 'Saí cedo', 'Odd sem valor', 'Tilt', 'Jogo perigoso', 'Azar puro'];
const EMO = { calmo: '😌', confiante: '💪', ansioso: '😬', tilt: '🎢' };

function resultBadge(r) {
  if (r === 'green') return '<span class="pill pill-green">Green</span>';
  if (r === 'red') return '<span class="pill pill-red">Red</span>';
  return '<span class="pill pill-muted">Zerei</span>';
}
function segCard(title, groups, keyFmt = (k) => k) {
  const rows = Object.entries(groups)
    .sort((a, b) => b[1].pl - a[1].pl)
    .map(([k, g]) => {
      const cls = g.pl > 0 ? 'pos' : g.pl < 0 ? 'neg' : '';
      return `<div class="seg-row"><span>${keyFmt(k)}</span><span class="${cls}">${formatSignedBRL(g.pl)} · ${g.count}x · ROI ${formatSignedPct(g.roi * 100)}</span></div>`;
    })
    .join('');
  return `<div class="card"><div class="seg-title">${title}</div>${rows}</div>`;
}

function clvSegCard(title, groups, keyFmt = (k) => k) {
  const rows = Object.entries(groups)
    .sort((a, b) => b[1].avgClv - a[1].avgClv)
    .map(([k, g]) => {
      const cls = g.avgClv > 0 ? 'pos' : g.avgClv < 0 ? 'neg' : '';
      return `<div class="seg-row"><span>${keyFmt(k)}</span><span class="${cls}">${formatSignedPct(g.avgClv)} · ${formatPctFrac(g.beatRate, 0)} bateu · ${g.count}x</span></div>`;
    })
    .join('');
  return `<div class="card"><div class="seg-title">${title}</div>${rows}</div>`;
}

function renderHistorico() {
  const trades = store.getTrades();
  if (!trades.length) {
    histEl.innerHTML = `<h1 class="screen-title">Histórico</h1><div class="notice"><p>Nenhum trade ainda. Registre na aba <strong>Registrar</strong>.</p></div>`;
    return;
  }
  const s = summarize(trades);
  const clv = clvStats(trades);
  const clvTrendVals = clvTrend(trades);
  const clvBlock = clv.measured === 0
    ? `<div class="card"><div class="seg-title">CLV — sua habilidade real</div><p class="card-lead">Ainda não há trades com odd de fechamento. Ao registrar um trade, informe a <strong>odd de fechamento</strong> para medir seu CLV — o placar que mostra se você entrou melhor que o mercado. Em breve a captura será automática.</p></div>`
    : `
      <div class="clv-hero ${clv.avgClv < 0 ? 'neg' : ''}">
        <div class="clv-hero-top">
          <div>
            <div class="clv-lab">CLV médio — sua habilidade real</div>
            <div class="clv-val">${formatSignedPct(clv.avgClv)}</div>
          </div>
          ${clvTrendVals.length > 1 ? `<div class="clv-spark">${areaSpark(clvTrendVals, 130, 48, '#fff')}</div>` : ''}
        </div>
        <div class="clv-pills">
          <span class="clv-pill">${formatPctFrac(clv.beatRate, 0)} bateu o fechamento</span>
          <span class="clv-pill">${clv.measured} ${clv.measured === 1 ? 'trade medido' : 'trades medidos'}</span>
        </div>
      </div>
      <div class="grid-v">
        ${clvSegCard('CLV por mercado', clvBySegment(trades, 'clv', 'market'))}
        ${clvSegCard('CLV por superfície', clvBySegment(trades, 'clv', 'surface'), (k) => SURFACE_PT[k] || k)}
      </div>`;
  const live = clvStats(trades, 'liveValue');
  const liveTrend = clvTrend(trades, 'liveValue');
  const liveHero = live.measured === 0
    ? `<div class="card"><div class="seg-title">Valor ao vivo — sua leitura</div><p class="card-lead">Registre trades <strong>ao vivo</strong> (pela tela Trade ao vivo) para medir o valor das suas entradas — quanto você pega odd melhor que a justa do momento.</p></div>`
    : `
      <div class="clv-hero ${live.avgClv < 0 ? 'neg' : ''}">
        <div class="clv-hero-top">
          <div>
            <div class="clv-lab">Valor médio ao vivo — sua leitura</div>
            <div class="clv-val">${formatSignedPct(live.avgClv)}</div>
          </div>
          ${liveTrend.length > 1 ? `<div class="clv-spark">${areaSpark(liveTrend, 130, 48, '#fff')}</div>` : ''}
        </div>
        <div class="clv-pills">
          <span class="clv-pill">${formatPctFrac(live.beatRate, 0)} entrou com valor</span>
          <span class="clv-pill">${live.measured} ${live.measured === 1 ? 'entrada medida' : 'entradas medidas'}</span>
        </div>
      </div>
      ${clvSegCard('Valor ao vivo por superfície', clvBySegment(trades, 'liveValue', 'surface'), (k) => SURFACE_PT[k] || k)}`;
  const reds = trades.filter((t) => t.result === 'red');
  const redsReviewed = reds.filter((t) => t.review);
  const byReview = segmentBy(redsReviewed, 'review');
  const reviewEntries = Object.entries(byReview).sort((a, b) => b[1].count - a[1].count);

  const learn = reviewEntries.length
    ? `<div class="card"><div class="seg-title">Aprendizado</div><p class="card-lead">${reviewEntries[0][1].count} de ${reds.length} reds: <strong>${reviewEntries[0][0]}</strong>. Fique atento a esse padrão.</p></div>`
    : '';

  const rows = trades
    .slice()
    .reverse()
    .map((t) => {
      const plCls = t.pl > 0 ? 'pos' : t.pl < 0 ? 'neg' : '';
      const open = expandedId === t.id;
      const hasConf = t.players && t.players.a && t.players.b;
      const av = (nm) => `<span class="tr-av" data-pname="${encodeURIComponent(nm)}"><span>${initials(nm)}</span></span>`;
      const confTitle = hasConf
        ? `<span class="tr-title"><span class="tr-avs">${av(t.players.a)}${av(t.players.b)}</span>${t.players.a} × ${t.players.b}</span>`
        : `<span>${t.market}</span>`;
      const sub = `${resultBadge(t.result)} · odd ${Number(t.oddEntry).toFixed(2)} · ${formatBRL(t.stake)}${t.clv != null ? ' · CLV ' + formatSignedPct(t.clv) : ''}${t.emotion ? ' · ' + (EMO[t.emotion] || '') : ''}`;
      const review = t.review ? `<span class="tr-review">📝 ${t.review}</span>` : '';
      const expand = open
        ? `<div class="tr-expand">
             <div class="field-hint">${t.date.replace('T', ' ')}</div>
             ${t.result === 'red' ? `<div class="chips" style="margin-top:8px">${REVIEW_RED_OPTS.map((o) => `<button class="chip${t.review === o ? ' selected' : ''}" data-review="${o}" data-id="${t.id}">${o}</button>`).join('')}</div>` : ''}
             <button class="btn btn-ghost" data-remove="${t.id}" style="margin-top:10px">Remover trade</button>
           </div>`
        : '';
      return `<div class="trade-row" data-toggle="${t.id}">
          <div class="tr-main">${confTitle}<span class="tr-pl ${plCls}">${formatSignedBRL(t.pl)}</span></div>
          <div class="tr-sub">${hasConf ? `<span class="pill pill-muted">${t.market}</span> ` : ''}${sub} ${review}</div>
          ${expand}
        </div>`;
    })
    .join('');

  const decided = s.greens + s.reds;
  histEl.innerHTML = `
    <h1 class="screen-title">Histórico</h1>
    ${liveHero}
    <div class="section-title">CLV pré-jogo</div>
    ${clvBlock}
    <div class="hero-card">
      <span class="hero-label">P/L total</span>
      <span class="hero-value ${s.totalPL > 0 ? 'pos' : s.totalPL < 0 ? 'neg' : ''}">${formatSignedBRL(s.totalPL)}</span>
      <div class="hero-meta">
        <span class="pill ${s.roi >= 0 ? 'pill-green' : 'pill-red'}">ROI ${formatSignedPct(s.roi * 100)}</span>
        <span class="pill pill-muted">${s.count} trades</span>
        <span class="pill pill-muted">acerto ${decided ? formatPctFrac(s.winRate, 0) : '—'}</span>
      </div>
    </div>
    ${learn}
    <div class="section-title">Onde você ganha × sangra</div>
    ${segCard('Por mercado', segmentBy(trades, 'market'))}
    ${segCard('Por emoção', segmentBy(trades, 'emotion'), (k) => `${EMO[k] || ''} ${k}`)}
    <div class="section-title">Trades (${s.count})</div>
    ${rows}`;

  histEl.querySelectorAll('.tr-av[data-pname]').forEach((el) => {
    const nm = decodeURIComponent(el.dataset.pname);
    loadPhoto({ name: nm, fullName: nm }, () => el);
  });

  histEl.querySelectorAll('[data-toggle]').forEach((row) =>
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-review]') || e.target.closest('[data-remove]')) return;
      const id = row.dataset.toggle;
      expandedId = expandedId === id ? null : id;
      renderHistorico();
    })
  );
  histEl.querySelectorAll('[data-review]').forEach((chip) =>
    chip.addEventListener('click', async () => {
      try { await store.updateTrade(chip.dataset.id, { review: chip.dataset.review }); }
      catch { toast('Sem conexão — revisão não salva.'); return; }
      toast('Revisão salva 📝');
    })
  );
  histEl.querySelectorAll('[data-remove]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try { await store.removeTrade(btn.dataset.remove); }
      catch { toast('Sem conexão — não removido.'); return; }
      expandedId = null;
      toast('Trade removido');
    })
  );
}

/* ================= Revisão pós-trade (modal) ================= */
function openReview(tradeId) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay" id="rv-overlay">
      <div class="modal-sheet">
        <div class="modal-title">O que pesou nesse red?</div>
        <div class="chips" style="justify-content:center">
          ${REVIEW_RED_OPTS.map((o) => `<button class="chip" data-rv="${o}">${o}</button>`).join('')}
        </div>
        <div class="modal-actions"><button class="btn btn-ghost" id="rv-skip">Pular</button></div>
      </div>
    </div>`;
  const close = () => (root.innerHTML = '');
  root.querySelectorAll('[data-rv]').forEach((chip) =>
    chip.addEventListener('click', async () => {
      try { await store.updateTrade(tradeId, { review: chip.dataset.rv }); }
      catch { toast('Sem conexão — revisão não salva.'); return; }
      close();
      toast('Revisão salva 📝');
    })
  );
  root.querySelector('#rv-skip').addEventListener('click', close);
  root.querySelector('#rv-overlay').addEventListener('click', (e) => { if (e.target.id === 'rv-overlay') close(); });
}

/* ================= Tela: Análise ================= */
const analiseEl = document.getElementById('screen-analise');
const anal = {
  tour: 'ATP', models: {}, model: null, loadingTour: null, a: null, b: null, surface: 'hard',
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
      return `<button class="fixture" data-fx="${i}">
        <div class="fx-top"><span class="fx-players">${flag}${g.a} vs ${g.b}</span><span class="fx-tour">${g.tour}${nivelLabel} · ${SURFACE_PT[g.surface] || g.surface}</span></div>
        <div class="fx-sub">Favorito: <strong>${g.favorite}</strong> ${favPct}% · ${g.marginLabel} · confiança ${g.confidence}${ageBadge}${ageSuppressBadge}</div>
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
  analiseEl.querySelector('#slot-a').addEventListener('click', () => openPlayerPicker(anal.model, (p) => { anal.a = p; resetLive(); renderAnalise(); }));
  analiseEl.querySelector('#slot-b').addEventListener('click', () => openPlayerPicker(anal.model, (p) => { anal.b = p; resetLive(); renderAnalise(); }));
  wireChips(analiseEl, anal, renderAnalise);

  analiseEl.querySelector('#btn-explain')?.addEventListener('click', () => { anal.explainOpen = !anal.explainOpen; renderAnalise(); });
  analiseEl.querySelector('#btn-more')?.addEventListener('click', () => { anal.moreOpen = !anal.moreOpen; renderAnalise(); });
  analiseEl.querySelector('#btn-reg-conf')?.addEventListener('click', () => {
    reg = { ...defaultReg(), tour: anal.tour, surface: anal.surface, players: { a: anal.a.fullName || anal.a.name, b: anal.b.fullName || anal.b.name, tour: anal.tour } };
    if (anal.live.active) {
      const r = analyzeMatch(anal.a, anal.b, anal.surface, anal.model);
      reg.market = 'Match Odds';
      reg.entryType = 'live';
      reg.liveState = { setsA: anal.live.setsA, setsB: anal.live.setsB, gamesA: anal.live.gamesA, gamesB: anal.live.gamesB, serverIsA: anal.live.serverIsA, bestOf: anal.live.bestOf };
      reg.preProbA = r.probA;
      reg.preProbKey = probKeyFor();
    }
    showScreen('registrar');
  });
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
  const r = analyzeMatch(anal.a, anal.b, anal.surface, anal.model);
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
      </div>
      ${renderH2H()}
      <div class="reading-note">${narrative(r)}</div>
      ${renderTactics(r)}
    </div>
    <button class="btn btn-primary" id="btn-reg-conf" style="margin-top:12px">📝 Registrar trade neste confronto</button>
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

/* ================= Auth + Boot ================= */
const authRoot = document.getElementById('auth-root');
let booted = false;

function traduzErroAuth(e) {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered')) return 'Esse e-mail já tem conta. Tente entrar.';
  if (m.includes('password')) return 'Senha muito curta (mínimo 6 caracteres).';
  if (m.includes('email')) return 'E-mail inválido.';
  return 'Não deu certo. Confira os dados e a conexão.';
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

function renderAuth() {
  let mode = 'login'; // 'login' | 'signup'
  function draw() {
    authRoot.innerHTML = `
      <div class="auth-overlay"><div class="auth-card">
        <div class="auth-brand"><span class="brand-mark"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.4" stroke="#fff" stroke-width="1.7"/><path d="M3.2 5.4c4 2 4 7.2 0 9.2M16.8 5.4c-4 2-4 7.2 0 9.2" stroke="#fff" stroke-width="1.7"/></svg></span><strong style="font-weight:800;letter-spacing:-0.02em">Projeto Investidor</strong></div>
        <h1>${mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p class="sub">Seu diário fica privado e sincronizado na nuvem.</p>
        <input class="auth-input" id="auth-email" type="email" inputmode="email" placeholder="E-mail" autocomplete="email">
        <input class="auth-input" id="auth-pass" type="password" placeholder="Senha" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
        <div class="auth-error" id="auth-error"></div>
        <button class="btn btn-primary" id="auth-submit">${mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        ${mode === 'login' ? '<div style="text-align:center;margin-top:10px"><button class="auth-forgot" id="auth-forgot">Esqueci a senha</button></div>' : ''}
        <div class="auth-switch">
          ${mode === 'login' ? 'Não tem conta?' : 'Já tem conta?'}
          <button id="auth-switch">${mode === 'login' ? 'Criar conta' : 'Entrar'}</button>
        </div>
      </div></div>`;
    const err = authRoot.querySelector('#auth-error');
    const email = () => authRoot.querySelector('#auth-email').value.trim();
    const pass = () => authRoot.querySelector('#auth-pass').value;
    authRoot.querySelector('#auth-switch').addEventListener('click', () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); });
    authRoot.querySelector('#auth-submit').addEventListener('click', async () => {
      err.textContent = '';
      try {
        if (mode === 'login') await auth.signIn(email(), pass());
        else {
          const { session } = await auth.signUp(email(), pass());
          err.style.color = 'var(--green)';
          err.textContent = session ? 'Conta criada! Entrando...' : 'Conta criada! Confirme o e-mail e depois entre.';
        }
      } catch (e) { err.style.color = 'var(--red)'; err.textContent = traduzErroAuth(e); }
    });
    authRoot.querySelector('#auth-forgot')?.addEventListener('click', async () => {
      if (!email()) { err.style.color = 'var(--red)'; err.textContent = 'Digite seu e-mail primeiro.'; return; }
      try { await auth.resetPassword(email()); err.style.color = 'var(--green)'; err.textContent = 'Enviei um link de redefinição pro seu e-mail.'; }
      catch (e) { err.style.color = 'var(--red)'; err.textContent = traduzErroAuth(e); }
    });
  }
  draw();
}

// Preenche sozinho o CLV pré-jogo dos trades pendentes, cruzando com os fechamentos publicados.
async function syncClosings() {
  const pending = store.getTrades().filter(
    (t) => t.market === 'Match Odds' && t.entryType === 'pre' && t.players?.a && t.players?.b && t.side && typeof t.oddClose !== 'number'
  );
  if (!pending.length) return;
  let matches;
  try {
    const res = await fetch('closings.json', { cache: 'no-cache' });
    if (!res.ok) return;
    matches = (await res.json()).matches || [];
  } catch { return; }
  let n = 0;
  for (const p of closingPatches(pending, matches)) {
    try { await store.updateTrade(p.id, { oddClose: p.oddClose, clv: p.clv }); n++; } catch { /* ignora falha isolada */ }
  }
  if (n) toast(`CLV preenchido em ${n} trade${n > 1 ? 's' : ''} ✅`);
}

async function bootApp() {
  authRoot.innerHTML = '';
  try { await store.initStore(); }
  catch (e) { toast('Erro ao carregar seus dados: ' + (e?.message || 'sem conexão')); }
  if (!booted) {
    booted = true;
    store.subscribe(() => renderScreen(currentScreen));
  }
  renderScreen(currentScreen);
  syncClosings();
}

// Tema (claro é o padrão; escolha salva)
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('investidor.theme', next); } catch {}
});

// Reage ao estado de login (inclui sessão persistida ao abrir o app)
auth.onAuthChange((session) => {
  if (session) bootApp();
  else { booted = false; renderAuth(); }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW não registrado:', err.message));
  });
}
