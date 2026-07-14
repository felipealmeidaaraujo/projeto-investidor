import * as store from './src/store.js';
import * as auth from './src/supabase.js';
import { summarize, plOnDate, stopLossStatus, tiltWarning, segmentBy } from './src/stats.js';
import { makeTrade } from './src/trade.js';
import { evFraction, kellyFraction, stakeKelly, impliedProb } from './src/finance.js';
import { analyzeMatch, playerTags, buildReadingExplanation, serveBand } from './src/analysis.js';
import { winProbFromState, impliedServeProbs } from './src/inplay.js';
import { formatBRL, formatSignedBRL, formatSignedPct, formatPctFrac } from './src/format.js';

/* ---------------- Navegação ---------------- */
const tabs = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');
let currentScreen = 'banca';

function renderScreen(target) {
  if (target === 'banca') renderBanca();
  else if (target === 'registrar') renderRegistrar();
  else if (target === 'historico') renderHistorico();
  else if (target === 'analise') renderAnalise();
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

const MARKET_OPTS = ['Match Odds', 'Vencedor Set', 'Games', 'Outro'];
const SURFACE_OPTS = [{ v: 'clay', l: 'Saibro' }, { v: 'hard', l: 'Dura' }, { v: 'grass', l: 'Grama' }, { v: 'indoor', l: 'Indoor' }];
const RESULT_OPTS = [{ v: 'green', l: '🟢 Green' }, { v: 'red', l: '🔴 Red' }, { v: 'zero', l: '⚪ Zerei' }];
const EMOTION_OPTS = [{ v: 'calmo', l: '😌 Calmo' }, { v: 'confiante', l: '💪 Confiante' }, { v: 'ansioso', l: '😬 Ansioso' }, { v: 'tilt', l: '🎢 Tilt' }];

function defaultReg() {
  return { market: null, surface: null, oddEntry: 2.0, oddClose: null, showClose: false, stake: 0, result: null, plAmount: 0, emotion: null };
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
  if (!reg.market || !reg.result || reg.stake <= 0) return false;
  if ((reg.result === 'green' || reg.result === 'red') && reg.plAmount <= 0) return false;
  return true;
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

  regEl.innerHTML = `
    <h1 class="screen-title">Registrar trade</h1>
    ${sl.hit ? `<div class="warn-banner">⚠️ Stop-loss diário atingido. O ideal é <strong>parar hoje</strong>.</div>` : ''}
    ${tilt ? `<div class="warn-banner">🎢 Você aumentou o stake depois de um red. Cuidado com o <strong>tilt</strong> (caçar prejuízo).</div>` : ''}

    <div class="field"><div class="field-label"><span>Mercado</span></div>${chipsHTML(reg, 'market', MARKET_OPTS)}</div>
    <div class="field"><div class="field-label"><span>Superfície</span></div>${chipsHTML(reg, 'surface', SURFACE_OPTS)}</div>

    <div class="field">
      <div class="field-label"><span>Odd de entrada</span></div>
      ${oddStepper('oddEntry', reg.oddEntry)}
    </div>

    <div class="field">
      <div class="field-label"><span>Odd de fechamento</span><span class="field-hint">opcional — mede o CLV</span></div>
      ${reg.showClose
        ? oddStepper('oddClose', reg.oddClose) + `<button class="btn btn-ghost" id="btn-noclose" style="margin-top:8px">Remover</button>`
        : `<button class="btn" id="btn-addclose">+ Adicionar odd de fechamento</button>`}
    </div>

    <div class="field">
      <div class="field-label"><span>Stake</span><span class="field-hint ${overCap ? 'hint-red' : ''}">teto ${formatBRL(cap)}</span></div>
      <button class="value-input" id="btn-stake">${formatBRL(reg.stake)}</button>
      ${overCap ? `<p class="hint-red" style="margin-top:6px;font-size:12px">Acima do seu teto por operação (${formatPctFrac(cfg.maxStakePct, 0)} da banca).</p>` : ''}
    </div>

    <div class="field"><div class="field-label"><span>Resultado</span></div>${chipsHTML(reg, 'result', RESULT_OPTS)}</div>

    ${showPL ? `<div class="field">
      <div class="field-label"><span>${plLabel}</span></div>
      <button class="value-input" id="btn-pl">${formatBRL(reg.plAmount)}</button>
    </div>` : ''}

    <div class="field"><div class="field-label"><span>Estado emocional</span></div>${chipsHTML(reg, 'emotion', EMOTION_OPTS)}</div>

    <button class="btn btn-primary" id="btn-savetrade" ${regValid() ? '' : 'disabled'}>Salvar trade</button>`;

  wireChips(regEl, reg, renderRegistrar);
  regEl.querySelectorAll('.step').forEach((b) =>
    b.addEventListener('click', () => {
      const f = b.dataset.step;
      reg[f] = clampOdd((reg[f] ?? 2.0) + Number(b.dataset.delta));
      renderRegistrar();
    })
  );
  regEl.querySelector('#btn-addclose')?.addEventListener('click', () => { reg.showClose = true; reg.oddClose = reg.oddEntry; renderRegistrar(); });
  regEl.querySelector('#btn-noclose')?.addEventListener('click', () => { reg.showClose = false; reg.oddClose = null; renderRegistrar(); });
  regEl.querySelector('#btn-stake').addEventListener('click', () =>
    openKeypad({ title: 'Stake (R$)', value: reg.stake, onConfirm: (v) => { reg.stake = v; renderRegistrar(); } })
  );
  regEl.querySelector('#btn-pl')?.addEventListener('click', () =>
    openKeypad({ title: plLabel, value: reg.plAmount, onConfirm: (v) => { reg.plAmount = v; renderRegistrar(); } })
  );
  regEl.querySelector('#btn-savetrade').addEventListener('click', saveTrade);
}
async function saveTrade() {
  if (!regValid()) return;
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

function renderHistorico() {
  const trades = store.getTrades();
  if (!trades.length) {
    histEl.innerHTML = `<h1 class="screen-title">Histórico</h1><div class="notice"><p>Nenhum trade ainda. Registre na aba <strong>Registrar</strong>.</p></div>`;
    return;
  }
  const s = summarize(trades);
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
          <div class="tr-main"><span>${t.market}</span><span class="tr-pl ${plCls}">${formatSignedBRL(t.pl)}</span></div>
          <div class="tr-sub">${sub} ${review}</div>
          ${expand}
        </div>`;
    })
    .join('');

  const decided = s.greens + s.reds;
  histEl.innerHTML = `
    <h1 class="screen-title">Histórico</h1>
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
  live: { active: false, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3 },
};
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
      <div class="notice" style="margin-bottom:18px"><p>Sem jogos cobertos hoje. O feed automático cobre os <strong>torneios grandes</strong> (Grand Slams, Masters) enquanto ativos — hoje não há nenhum. Use a busca manual abaixo. 👇</p></div>`;
  }
  const rows = list
    .map((g, i) => {
      const favPct = (g.favoriteProb * 100).toFixed(0);
      return `<button class="fixture" data-fx="${i}">
        <div class="fx-top"><span class="fx-players">${g.a} vs ${g.b}</span><span class="fx-tour">${g.tour} · ${SURFACE_PT[g.surface] || g.surface}</span></div>
        <div class="fx-sub">Favorito: <strong>${g.favorite}</strong> ${favPct}% · ${g.marginLabel} · confiança ${g.confidence}</div>
      </button>`;
    })
    .join('');
  return `<div class="section-title">Jogos de hoje (${list.length})</div><div class="fixtures">${rows}</div>`;
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
  analiseEl.querySelector('#slot-a').addEventListener('click', () => openPlayerPicker((p) => { anal.a = p; renderAnalise(); }));
  analiseEl.querySelector('#slot-b').addEventListener('click', () => openPlayerPicker((p) => { anal.b = p; renderAnalise(); }));
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
  try {
    let title = player.fullName;
    if (!title) {
      const surname = player.name.split(' ')[0];
      const r = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(surname + ' tennis player')}&limit=1`);
      const j = await r.json();
      title = j.pages?.[0]?.key || j.pages?.[0]?.title;
    }
    if (!title) throw new Error('sem título');
    const sres = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
    const sj = await sres.json();
    const url = sj.thumbnail?.source || null;
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
    root.innerHTML = `
      <div class="modal-overlay" id="dos-overlay">
        <div class="modal-sheet">
          <div class="dossier">
            <div class="dos-photo" id="dos-photo"><span class="dos-avatar">${initials(player.name)}</span></div>
            <div class="dos-name">${player.name}</div>
            <div class="dos-elo">Elo ${player.elo}${player.matches ? ` · ${player.matches} jogos` : ''}</div>
            ${tags.length ? `<div class="dos-tags">${tags.map((t) => `<span class="pill ${{ strength: 'pill-green', relative: 'pill-amber', weakness: 'pill-red' }[t.kind] || 'pill-muted'}">${t.t}</span>`).join('')}</div>` : ''}
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
      </div>
      <div class="reading-note">${narrative(r)}</div>
    </div>
    ${renderExplain(r)}
    <button class="btn" id="btn-live" style="margin-top:14px">${anal.live.active ? '⏱️ Ocultar trade ao vivo' : '⏱️ Trade ao vivo (odd por placar)'}</button>
    ${anal.live.active ? renderLive(r) : ''}`;
}

function renderLive(pre) {
  const base = anal.tour === 'WTA' ? 0.56 : 0.64;
  const { pA, pB } = impliedServeProbs(pre.probA, { base, bestOf: anal.live.bestOf });
  const L = anal.live;
  const probA = winProbFromState({ setsA: L.setsA, setsB: L.setsB, gamesA: L.gamesA, gamesB: L.gamesB, serverIsA: L.serverIsA }, pA, pB, L.bestOf);
  const probB = 1 - probA;
  const favA = probA >= 0.5;
  const aN = anal.a.name;
  const bN = anal.b.name;
  const step = (f, v) => `<div class="livestep"><button class="lstep" data-live="${f}" data-d="-1">−</button><span class="lstep-v">${v}</span><button class="lstep" data-live="${f}" data-d="1">+</button></div>`;
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
        <div class="reading-note field-hint">No início era ${pct(pre.probA)} pra ${aN}. Se o mercado estiver bem longe da odd justa, pode ser sobre-reação.</div>
      </div>
    </div>`;
}

function openPlayerPicker(onPick) {
  const root = document.getElementById('modal-root');
  let showAll = false; // por padrão, só quem está ativo (joga hoje)
  let letter = null;

  function draw() {
    const players = showAll ? anal.model.players : anal.model.players.filter((p) => p.active);
    const letters = [...new Set(players.map((p) => p.name[0].toUpperCase()))].sort();
    const list = !letter
      ? players.slice(0, 40)
      : players.filter((p) => p.name[0].toUpperCase() === letter).sort((a, b) => a.name.localeCompare(b.name));
    root.innerHTML = `
      <div class="modal-overlay" id="pp-overlay">
        <div class="modal-sheet picker-sheet">
          <div class="modal-title">Escolha o jogador</div>
          <div class="chips" style="margin-bottom:8px">
            <button class="chip${showAll ? '' : ' selected'}" data-mode="ativos">Ativos</button>
            <button class="chip${showAll ? ' selected' : ''}" data-mode="todos">Todos (histórico)</button>
          </div>
          <div class="az-strip">${letters.map((L) => `<button class="az${letter === L ? ' sel' : ''}" data-l="${L}">${L}</button>`).join('')}</div>
          <div class="field-hint" style="padding:6px 2px">${letter ? `Nomes com "${letter}"` : 'Mais fortes (por Elo)'}</div>
          <div class="picker-list">
            ${list.map((p) => `<button class="picker-row" data-name="${encodeURIComponent(p.name)}"><span>${p.name}</span><span class="field-hint">Elo ${p.elo}</span></button>`).join('')}
          </div>
          <div class="modal-actions"><button class="btn btn-ghost" id="pp-cancel">Cancelar</button></div>
        </div>
      </div>`;
    root.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => { showAll = b.dataset.mode === 'todos'; letter = null; draw(); })
    );
    root.querySelectorAll('.az').forEach((b) => b.addEventListener('click', () => { letter = b.dataset.l; draw(); }));
    root.querySelectorAll('.picker-row').forEach((b) =>
      b.addEventListener('click', () => {
        const p = anal.model.players.find((x) => x.name === decodeURIComponent(b.dataset.name));
        root.innerHTML = '';
        onPick(p);
      })
    );
    root.querySelector('#pp-cancel').addEventListener('click', () => (root.innerHTML = ''));
    root.querySelector('#pp-overlay').addEventListener('click', (e) => { if (e.target.id === 'pp-overlay') root.innerHTML = ''; });
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
function openKeypad({ title, value = 0, onConfirm }) {
  const root = document.getElementById('modal-root');
  let buf = value ? String(Math.round(value)) : '';

  function draw() {
    const shown = buf ? Number(buf) : 0;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
    root.innerHTML = `
      <div class="modal-overlay" id="kp-overlay">
        <div class="modal-sheet" id="kp-sheet">
          <div class="modal-title">${title}</div>
          <div class="keypad-display">${formatBRL(shown)}</div>
          <div class="keypad">${keys.map((k) => `<button class="key" data-k="${k}">${k}</button>`).join('')}</div>
          <div class="modal-actions"><button class="btn btn-ghost" id="kp-cancel">Cancelar</button></div>
        </div>
      </div>`;
    root.querySelectorAll('.key').forEach((btn) =>
      btn.addEventListener('click', () => {
        const k = btn.dataset.k;
        if (k === '⌫') buf = buf.slice(0, -1);
        else if (k === 'OK') return close(Number(buf || 0));
        else if (buf.length < 9) buf += k;
        draw();
      })
    );
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

async function bootApp() {
  authRoot.innerHTML = '';
  try { await store.initStore(); }
  catch (e) { toast('Erro ao carregar seus dados: ' + (e?.message || 'sem conexão')); }
  if (!booted) {
    booted = true;
    store.subscribe(() => renderScreen(currentScreen));
  }
  renderScreen(currentScreen);
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
