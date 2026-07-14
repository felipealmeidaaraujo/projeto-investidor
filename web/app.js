import * as store from './src/store.js';
import { summarize, plOnDate, stopLossStatus, tiltWarning, segmentBy } from './src/stats.js';
import { makeTrade } from './src/trade.js';
import { evFraction, kellyFraction, stakeKelly, impliedProb } from './src/finance.js';
import { analyzeMatch } from './src/analysis.js';
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
  bancaEl.querySelector('#btn-save').addEventListener('click', () => {
    store.setConfig({ ...draft });
    draft = null;
    renderBanca();
    toast('Configuração salva ✅');
  });
  bancaEl.querySelector('#btn-cancel')?.addEventListener('click', () => { draft = null; renderBanca(); });
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

  bancaEl.innerHTML = `
    <div class="hero-card">
      <span class="hero-label">Banca atual</span>
      <span class="hero-value ${deltaClass}">${formatBRL(banca)}</span>
      <div class="hero-meta">
        <span class="pill ${delta >= 0 ? 'pill-green' : 'pill-red'}">${formatSignedBRL(delta)}</span>
        <span class="pill pill-muted">inicial ${formatBRL(cfg.initial)}</span>
      </div>
    </div>
    <div class="grid-2">
      <div class="stat-card"><span class="stat-label">ROI</span><span class="stat-value ${roiClass}">${s.count ? formatSignedPct(s.roi * 100) : '—'}</span></div>
      <div class="stat-card"><span class="stat-label">CLV médio</span><span class="stat-value ${clvClass}">${s.avgClvPct ? formatSignedPct(s.avgClvPct) : '—'}</span></div>
      <div class="stat-card"><span class="stat-label">Acerto</span><span class="stat-value">${s.greens + s.reds ? formatPctFrac(s.winRate, 0) : '—'}</span></div>
      <div class="stat-card"><span class="stat-label">Trades</span><span class="stat-value">${s.count}</span></div>
    </div>
    <div class="card">
      <div class="status-head">
        <strong>Stop-loss diário</strong>
        <span class="${sl.hit ? 'pill pill-red' : 'field-hint'}">${sl.hit ? 'ATINGIDO — pare hoje' : formatBRL(sl.lossToday) + ' de ' + formatBRL(sl.limit)}</span>
      </div>
      <div class="bar"><span class="${barClass}" style="width:${Math.round(sl.used * 100)}%"></span></div>
      <p class="field-hint" style="margin-top:8px">P/L de hoje: ${formatSignedBRL(sl.plToday)}</p>
    </div>
    ${s.count === 0 ? `<div class="notice"><strong>Banca configurada ✅</strong><p>Registre seus trades na aba <strong>Registrar</strong> para acompanhar ROI, CLV e disciplina.</p></div>` : ''}
    <button class="btn" id="btn-calc" style="margin-bottom:14px">🧮 Calculadora de stake (Kelly)</button>
    <div class="section-title">Configuração</div>
    <div class="card"><p class="card-lead">Stop-loss: <strong>${formatPctFrac(cfg.dailyStopLossPct, 0)}</strong> · Máx/operação: <strong>${formatPctFrac(cfg.maxStakePct, 0)}</strong> · Kelly: <strong>${cfg.kellyFraction}×</strong></p></div>
    <button class="btn" id="btn-adjust">Ajustar configuração</button>`;

  bancaEl.querySelector('#btn-adjust').addEventListener('click', () => { draft = { ...cfg }; renderBanca(); });
  bancaEl.querySelector('#btn-calc').addEventListener('click', openCalculator);
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
function saveTrade() {
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
  store.addTrade(trade);
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

  histEl.innerHTML = `
    <h1 class="screen-title">Histórico</h1>
    <div class="grid-2">
      <div class="stat-card"><span class="stat-label">P/L total</span><span class="stat-value ${s.totalPL > 0 ? 'pos' : s.totalPL < 0 ? 'neg' : ''}">${formatSignedBRL(s.totalPL)}</span></div>
      <div class="stat-card"><span class="stat-label">ROI</span><span class="stat-value ${s.roi > 0 ? 'pos' : s.roi < 0 ? 'neg' : ''}">${formatSignedPct(s.roi * 100)}</span></div>
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
    chip.addEventListener('click', () => {
      store.updateTrade(chip.dataset.id, { review: chip.dataset.review });
      toast('Revisão salva 📝');
    })
  );
  histEl.querySelectorAll('[data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => {
      store.removeTrade(btn.dataset.remove);
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
    chip.addEventListener('click', () => {
      store.updateTrade(tradeId, { review: chip.dataset.rv });
      close();
      toast('Revisão salva 📝');
    })
  );
  root.querySelector('#rv-skip').addEventListener('click', close);
  root.querySelector('#rv-overlay').addEventListener('click', (e) => { if (e.target.id === 'rv-overlay') close(); });
}

/* ================= Tela: Análise ================= */
const analiseEl = document.getElementById('screen-analise');
const anal = { model: null, loading: false, a: null, b: null, surface: 'hard' };
const SURF_OPTS = [{ v: 'clay', l: 'Saibro' }, { v: 'hard', l: 'Dura' }, { v: 'grass', l: 'Grama' }];
const SURFACE_PT = { clay: 'saibro', hard: 'quadra dura', grass: 'grama' };

const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';

async function loadModel() {
  if (anal.model || anal.loading) return;
  anal.loading = true;
  try {
    const res = await fetch('model.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    anal.model = await res.json();
  } catch (e) {
    anal.model = { error: e.message };
  }
  anal.loading = false;
  if (currentScreen === 'analise') renderAnalise();
}

function renderAnalise() {
  if (!anal.model) {
    analiseEl.innerHTML = `<h1 class="screen-title">Análise do confronto</h1><div class="card"><p class="card-lead">Carregando o modelo…</p></div>`;
    loadModel();
    return;
  }
  if (anal.model.error) {
    analiseEl.innerHTML = `<h1 class="screen-title">Análise do confronto</h1><div class="notice"><p>Não consegui carregar o modelo (${anal.model.error}).</p></div>`;
    return;
  }
  const canRead = anal.a && anal.b;
  analiseEl.innerHTML = `
    <h1 class="screen-title">Análise do confronto</h1>
    <div class="matchup-slots">
      <button class="slot ${anal.a ? 'filled' : ''}" id="slot-a">${anal.a ? anal.a.name : '➕ Jogador A'}</button>
      <span class="vs">vs</span>
      <button class="slot ${anal.b ? 'filled' : ''}" id="slot-b">${anal.b ? anal.b.name : '➕ Jogador B'}</button>
    </div>
    <div class="field"><div class="field-label"><span>Superfície</span></div>${chipsHTML(anal, 'surface', SURF_OPTS)}</div>
    <div id="reading">${canRead ? renderReading() : `<div class="notice"><p>Escolha os <strong>dois jogadores</strong> e a superfície para ver a leitura do confronto.</p></div>`}</div>
    <p class="field-hint" style="margin-top:14px">⚠️ Leitura do modelo pra você <strong>entender</strong> o jogo — não é recomendação de aposta. O modelo não bate o mercado; use como preparação.</p>`;

  analiseEl.querySelector('#slot-a').addEventListener('click', () => openPlayerPicker((p) => { anal.a = p; renderAnalise(); }));
  analiseEl.querySelector('#slot-b').addEventListener('click', () => openPlayerPicker((p) => { anal.b = p; renderAnalise(); }));
  wireChips(analiseEl, anal, renderAnalise);
}

function tagPill(tag) {
  const map = { forte: 'pill-green', fraco: 'pill-red', neutro: 'pill-muted', 'poucos dados': 'pill-amber' };
  return `<span class="pill ${map[tag] || 'pill-muted'}">${tag}</span>`;
}

function playerRow(side, prob, fairOdd, isFav) {
  return `<div class="pl-row ${isFav ? 'fav' : ''}">
    <div class="pl-top"><span class="pl-name">${side.name}${isFav ? ' 👑' : ''}</span><span class="pl-prob">${pct(prob)}</span></div>
    <div class="pl-sub">Elo ${side.elo} · piso ${side.surfaceElo ?? '—'} · força ${side.blended} ${tagPill(side.surfaceRead.tag)}${side.surfaceRead.delta ? ` <span class="field-hint">(${side.surfaceRead.delta > 0 ? '+' : ''}${side.surfaceRead.delta})</span>` : ''}</div>
    <div class="pl-sub">odd justa <strong>${fairOdd.toFixed(2)}</strong></div>
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

function renderReading() {
  const r = analyzeMatch(anal.a, anal.b, anal.surface, anal.model);
  const confPill = { alta: 'pill-green', 'média': 'pill-amber', baixa: 'pill-red' }[r.confidence.level];
  const favIsA = r.favorite === anal.a.name;
  return `
    <div class="reading-card">
      <div class="reading-fav">
        <span class="field-hint">Favorito no ${SURFACE_PT[anal.surface]}</span>
        <div class="reading-fav-name">${r.favorite}</div>
        <div class="reading-fav-prob">${pct(r.favoriteProb)}</div>
        <div class="reading-pills"><span class="pill pill-green">${r.marginLabel}</span><span class="pill ${confPill}">confiança ${r.confidence.level}</span></div>
      </div>
      <div class="reading-players">
        ${playerRow(r.a, r.probA, r.fairOddA, favIsA)}
        ${playerRow(r.b, r.probB, r.fairOddB, !favIsA)}
      </div>
      <div class="reading-note">${narrative(r)}</div>
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
  container.querySelectorAll('.chip').forEach((chip) =>
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

/* ================= Boot ================= */
store.subscribe(() => renderScreen(currentScreen));
renderScreen('banca');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW não registrado:', err.message));
  });
}
