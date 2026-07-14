# Valor da entrada ao vivo (Entrega 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Métrica-herói "valor da entrada ao vivo": comparar a odd pega com a odd justa ao vivo (motor `inplay.js`), com back/lay, e exibir como herói no Histórico.

**Architecture:** Funções puras em `web/src/` (finance, inplay, trade, stats) + UI em `app.js` (registro com placar ao vivo, atalho do Trade ao vivo, herói no Histórico). Reaproveita o motor ao vivo e o card `.clv-hero` da fase 1.

**Tech Stack:** PWA sem build (JS ES modules), node built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-07-14-valor-entrada-ao-vivo-design.md`

---

## File Structure

- **Modify** `web/src/finance.js` — `clvPct`/`beatClose` ganham `side` ('back'|'lay').
- **Modify** `web/src/inplay.js` — nova `liveFairOdds` (extrai o cálculo inline do `renderLive`).
- **Modify** `web/src/stats.js` — `clvStats`/`clvTrend`/`clvBySegment` ganham `field='clv'`.
- **Modify** `web/src/trade.js` — `makeTrade` grava `side`/`dir`/`entryType`/`liveState`/`liveValue`.
- **Modify** `web/app.js` — imports; registro (campos + placar); atalho Trade ao vivo; herói Histórico.
- **Modify** tests: `finance.test.js`, `inplay.test.js`, `trade.test.js`, `stats.test.js`.

---

## Task 1: `clvPct`/`beatClose` com direção (back/lay)

**Files:** Modify `web/src/finance.js`; Test `tests/finance.test.js`

- [ ] **Step 1: Testes que falham** — adicionar ao fim de `tests/finance.test.js`:
```js
test('clvPct: back mede odd maior que a referência; lay inverte', () => {
  approx(clvPct(2.1, 2.0), 5);            // back (default) retrocompat
  approx(clvPct(2.1, 2.0, 'back'), 5);
  approx(clvPct(2.0, 2.1, 'lay'), (2.1 / 2.0 - 1) * 100); // lay: bom pegar odd baixa
});
test('beatClose: back = pegou maior; lay = pegou menor', () => {
  assert.equal(beatClose(2.1, 2.0), true);
  assert.equal(beatClose(2.0, 2.1, 'lay'), true);
  assert.equal(beatClose(2.2, 2.0, 'lay'), false);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/finance.test.js` → FAIL (lay dá valor de back).

- [ ] **Step 3: Implementar** — substituir `clvPct` e `beatClose` em `web/src/finance.js`:
```js
/** Valor (%) da odd pega vs. uma referência (fechamento OU odd justa ao vivo). Back e lay. */
export function clvPct(oddsTaken, oddsRef, side = 'back') {
  return side === 'lay' ? (oddsRef / oddsTaken - 1) * 100 : (oddsTaken / oddsRef - 1) * 100;
}

/** A odd pega superou a referência? (back: maior é melhor; lay: menor é melhor) */
export function beatClose(oddsTaken, oddsRef, side = 'back') {
  return side === 'lay' ? oddsTaken < oddsRef : oddsTaken > oddsRef;
}
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/finance.test.js` → PASS (novos + antigos).

- [ ] **Step 5: Commit**
```bash
git add web/src/finance.js tests/finance.test.js
git commit -m "feat(finance): clvPct/beatClose com direcao back/lay"
```

---

## Task 2: `liveFairOdds` (odd justa ao vivo)

**Files:** Modify `web/src/inplay.js`; Test `tests/inplay.test.js`

- [ ] **Step 1: Testes que falham** — adicionar ao fim de `tests/inplay.test.js` (o import na linha 3 e o `approx`/`START` já existem; ampliar o import para incluir `liveFairOdds`):

Trocar a linha 3:
```js
import { holdProb, winProbFromState, impliedServeProbs } from '../web/src/inplay.js';
```
por:
```js
import { holdProb, winProbFromState, impliedServeProbs, liveFairOdds } from '../web/src/inplay.js';
```
Adicionar ao fim:
```js
test('liveFairOdds: no início ≈ odd justa pré-jogo', () => {
  const r = liveFairOdds(0.5, START, { base: 0.64, bestOf: 3 });
  approx(r.probA, 0.5, 5e-3);
  approx(r.fairOddA, 2.0, 3e-2);
  approx(r.probA + r.probB, 1);
});
test('liveFairOdds: placar favorável baixa a odd do líder', () => {
  const led = liveFairOdds(0.5, { setsA: 1, setsB: 0, gamesA: 3, gamesB: 0, serverIsA: true }, { base: 0.64, bestOf: 3 });
  assert.ok(led.probA > 0.5);       // A na frente → mais provável
  assert.ok(led.fairOddA < 2.0);    // odd justa de A cai
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/inplay.test.js` → FAIL (`liveFairOdds is not a function`).

- [ ] **Step 3: Implementar** — adicionar ao fim de `web/src/inplay.js`:
```js
/** Odd justa ao vivo de A e B, dado a prob pré-jogo de A (target) e o placar. */
export function liveFairOdds(preProbA, state, { base = 0.64, bestOf = 3 } = {}) {
  const { pA, pB } = impliedServeProbs(preProbA, { base, bestOf });
  const probA = winProbFromState(state, pA, pB, bestOf);
  const probB = 1 - probA;
  return {
    probA,
    probB,
    fairOddA: probA > 0 ? 1 / probA : Infinity,
    fairOddB: probB > 0 ? 1 / probB : Infinity,
  };
}
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/inplay.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add web/src/inplay.js tests/inplay.test.js
git commit -m "feat(inplay): liveFairOdds — odd justa ao vivo por placar"
```

---

## Task 3: `stats.js` — agregação por campo (`clv` ou `liveValue`)

**Files:** Modify `web/src/stats.js`; Test `tests/stats.test.js`

- [ ] **Step 1: Testes que falham** — adicionar ao fim de `tests/stats.test.js`:
```js
test('clvStats/clvTrend/clvBySegment: aceitam field liveValue', () => {
  const lv = [
    { date: '2026-07-10', surface: 'clay', liveValue: 6 },
    { date: '2026-07-11', surface: 'hard', liveValue: -2 },
    { date: '2026-07-12', surface: 'clay', liveValue: 4 },
    { date: '2026-07-13', surface: 'grass' }, // sem liveValue → ignorado
  ];
  const s = clvStats(lv, 'liveValue');
  assert.equal(s.measured, 3);
  approx(s.avgClv, (6 - 2 + 4) / 3);
  approx(s.beatRate, 2 / 3);
  assert.equal(clvTrend(lv, 'liveValue').length, 3);
  const seg = clvBySegment(lv, 'liveValue', 'surface');
  assert.equal(seg.clay.count, 2);
  approx(seg.clay.avgClv, 5);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/stats.test.js` → FAIL (usa `t.clv`, não `liveValue`).

- [ ] **Step 3: Implementar** — em `web/src/stats.js`, adicionar o parâmetro `field` (default `'clv'`) às três funções. Substituir as assinaturas e os acessos a `t.clv`:

`clvStats`:
```js
export function clvStats(trades, field = 'clv') {
  let sum = 0, measured = 0, beatCount = 0;
  for (const t of trades) {
    if (!Number.isFinite(t[field])) continue;
    measured++;
    sum += t[field];
    if (t[field] > 0) beatCount++;
  }
  return { measured, avgClv: measured > 0 ? sum / measured : 0, beatRate: measured > 0 ? beatCount / measured : 0, beatCount };
}
```
`clvTrend`:
```js
export function clvTrend(trades, field = 'clv') {
  const measured = trades.filter((t) => Number.isFinite(t[field])).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const out = [];
  let sum = 0;
  for (let i = 0; i < measured.length; i++) { sum += measured[i][field]; out.push(sum / (i + 1)); }
  return out;
}
```
`clvBySegment`:
```js
export function clvBySegment(trades, field = 'clv', key = 'market') {
  const groups = {};
  for (const t of trades) {
    if (!Number.isFinite(t[field])) continue;
    const k = t[key] ?? '—';
    const g = (groups[k] ??= { count: 0, sum: 0, beatCount: 0, avgClv: 0, beatRate: 0 });
    g.count++; g.sum += t[field]; if (t[field] > 0) g.beatCount++;
  }
  for (const g of Object.values(groups)) { g.avgClv = g.count > 0 ? g.sum / g.count : 0; g.beatRate = g.count > 0 ? g.beatCount / g.count : 0; }
  return groups;
}
```
**Atenção — muda a assinatura de `clvBySegment`** (a chave vira o 3º parâmetro). Atualizar as duas chamadas na fase 1 (na `renderHistorico`, ver Task 8): `clvBySegment(trades, 'market')` → `clvBySegment(trades, 'clv', 'market')` e idem para `'surface'`.

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/stats.test.js`. Os testes antigos de `clvBySegment` que usam `clvBySegment(x, 'market')` vão quebrar (agora 'market' cai no `field`). Atualizá-los para `clvBySegment(x, 'clv', 'market')`. Rodar de novo → PASS.

- [ ] **Step 5: Commit**
```bash
git add web/src/stats.js tests/stats.test.js
git commit -m "feat(stats): agregacao por campo (clv ou liveValue)"
```

---

## Task 4: `makeTrade` — campos ao vivo e direção

**Files:** Modify `web/src/trade.js`; Test `tests/trade.test.js`

- [ ] **Step 1: Testes que falham** — adicionar ao fim de `tests/trade.test.js`:
```js
test('makeTrade: grava side/dir/entryType e o valor ao vivo', () => {
  const t = makeTrade({
    market: 'Match Odds', surface: 'hard', oddEntry: 2.5, stake: 50, result: 'green', plAmount: 40,
    players: { a: 'A A', b: 'B B', tour: 'ATP' }, side: 'a', dir: 'back',
    entryType: 'live', liveState: { setsA: 0, setsB: 1, gamesA: 2, gamesB: 3, serverIsA: true, bestOf: 3 }, liveFairOdd: 2.0,
  }, { id: 'x', date: 'd' });
  assert.equal(t.side, 'a');
  assert.equal(t.dir, 'back');
  assert.equal(t.entryType, 'live');
  assert.deepEqual(t.liveState, { setsA: 0, setsB: 1, gamesA: 2, gamesB: 3, serverIsA: true, bestOf: 3 });
  // valor = clvPct(2.5, 2.0, 'back') = +25%
  assert.equal(Math.round(t.liveValue), 25);
});
test('makeTrade: CLV pré-jogo manual usa a direção (lay inverte)', () => {
  const t = makeTrade({
    market: 'Match Odds', surface: 'clay', oddEntry: 2.0, oddClose: 2.1, stake: 10, result: 'zero', plAmount: 0,
    side: 'b', dir: 'lay',
  }, { id: 'y', date: 'd' });
  // lay: clvPct(2.0, 2.1, 'lay') = (2.1/2.0 - 1)*100 = +5%
  assert.equal(Math.round(t.clv), 5);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/trade.test.js` → FAIL (`t.side`/`t.liveValue` undefined).

- [ ] **Step 3: Implementar** — substituir `makeTrade` em `web/src/trade.js`:
```js
export function makeTrade(input, meta) {
  const pl = resolvePL(input.result, input.plAmount);
  const trade = {
    id: meta.id,
    date: meta.date,
    market: input.market,
    surface: input.surface,
    oddEntry: input.oddEntry,
    stake: input.stake,
    result: input.result,
    pl,
    emotion: input.emotion,
  };
  if (input.players && input.players.a && input.players.b) {
    trade.players = { a: input.players.a, b: input.players.b, tour: input.players.tour };
  }
  if (input.side) trade.side = input.side;
  if (input.dir) trade.dir = input.dir;
  if (input.entryType) trade.entryType = input.entryType;
  if (typeof input.oddClose === 'number') {
    trade.oddClose = input.oddClose;
    trade.clv = clvPct(input.oddEntry, input.oddClose, input.dir || 'back');
  }
  if (input.entryType === 'live' && input.liveState && typeof input.liveFairOdd === 'number') {
    trade.liveState = input.liveState;
    trade.liveFairOdd = input.liveFairOdd;
    trade.liveValue = clvPct(input.oddEntry, input.liveFairOdd, input.dir || 'back');
  }
  return trade;
}
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/trade.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add web/src/trade.js tests/trade.test.js
git commit -m "feat(trade): makeTrade grava side/dir/entryType e valor ao vivo"
```

---

## Task 5: `renderLive` usa `liveFairOdds` (refactor DRY)

**Files:** Modify `web/app.js`

- [ ] **Step 1: Ampliar o import de inplay** — na linha 7:
```js
import { winProbFromState, impliedServeProbs, liveFairOdds } from './src/inplay.js';
```

- [ ] **Step 2: Substituir o cálculo inline no `renderLive`** — trocar as linhas que calculam `pA/pB/probA` no início de `renderLive`:
```js
  const base = anal.tour === 'WTA' ? 0.56 : 0.64;
  const { pA, pB } = impliedServeProbs(pre.probA, { base, bestOf: anal.live.bestOf });
  const L = anal.live;
  const probA = winProbFromState({ setsA: L.setsA, setsB: L.setsB, gamesA: L.gamesA, gamesB: L.gamesB, serverIsA: L.serverIsA }, pA, pB, L.bestOf);
  const probB = 1 - probA;
```
por:
```js
  const base = anal.tour === 'WTA' ? 0.56 : 0.64;
  const L = anal.live;
  const { probA, probB } = liveFairOdds(pre.probA, { setsA: L.setsA, setsB: L.setsB, gamesA: L.gamesA, gamesB: L.gamesB, serverIsA: L.serverIsA }, { base, bestOf: L.bestOf });
```
(`impliedServeProbs` continua importado — ainda é usado internamente pela `liveFairOdds`; o import direto pode permanecer sem uso ou ser removido. Deixe-o.)

- [ ] **Step 3: Verificar no navegador** — `npm run dev`, aba Análise → um confronto → "Trade ao vivo", mudar o placar e confirmar que a "Odd justa AO VIVO" muda como antes (mesmos números). Sem erro no console.

- [ ] **Step 4: Commit**
```bash
git add web/app.js
git commit -m "refactor(app): renderLive usa liveFairOdds (DRY)"
```

---

## Task 6: Atalho do Trade ao vivo leva o placar pro registro

**Files:** Modify `web/app.js` (handler `btn-reg-conf`, ~linha 773)

- [ ] **Step 1: Estender o handler** — substituir o handler do `btn-reg-conf`:
```js
  analiseEl.querySelector('#btn-reg-conf')?.addEventListener('click', () => {
    reg = { ...defaultReg(), tour: anal.tour, surface: anal.surface, players: { a: anal.a.fullName || anal.a.name, b: anal.b.fullName || anal.b.name, tour: anal.tour } };
    if (anal.live.active) {
      const r = analyzeMatch(anal.a, anal.b, anal.surface, anal.model);
      reg.market = 'Match Odds';
      reg.entryType = 'live';
      reg.liveState = { setsA: anal.live.setsA, setsB: anal.live.setsB, gamesA: anal.live.gamesA, gamesB: anal.live.gamesB, serverIsA: anal.live.serverIsA, bestOf: anal.live.bestOf };
      reg.preProbA = r.probA;
    }
    showScreen('registrar');
  });
```

- [ ] **Step 2: Verificação** — coberta na Task 7 (o registro precisa existir para ver o efeito).

- [ ] **Step 3: Commit**
```bash
git add web/app.js
git commit -m "feat(app): Trade ao vivo leva placar+prob pre-jogo pro registro"
```

---

## Task 7: Registro — tipo de entrada, lado, direção, placar ao vivo

**Files:** Modify `web/app.js` (`defaultReg`, imports, `renderRegistrar`, `regValid`, `saveTrade`)

- [ ] **Step 1: Imports** — na linha 5, adicionar `clvPct`; na linha 4, nada (makeTrade ok); adicionar import de match-names após a linha 8:
```js
import { evFraction, kellyFraction, stakeKelly, impliedProb, clvPct } from './src/finance.js';
```
e nova linha:
```js
import { matchPlayer } from './src/match-names.js';
```

- [ ] **Step 2: `defaultReg`** — substituir por:
```js
function defaultReg() {
  return { market: null, surface: null, oddEntry: 2.0, oddClose: null, showClose: false, stake: 0, result: null, plAmount: 0, emotion: null, tour: 'ATP', players: null,
    entryType: null, side: null, dir: null, liveState: { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3 }, preProbA: null };
}
```

- [ ] **Step 3: Bloco de campos de Match Odds** — dentro de `renderRegistrar`, definir um `matchOddsBlock` antes do `regEl.innerHTML` (logo após `const plLabel = ...`):
```js
  const isMO = reg.market === 'Match Odds';
  const nmA = reg.players?.a || 'Jogador A';
  const nmB = reg.players?.b || 'Jogador B';
  const base = reg.tour === 'WTA' ? 0.56 : 0.64;
  let liveFeedback = '';
  if (isMO && reg.entryType === 'live') {
    if (reg.preProbA != null && reg.side) {
      const fair = liveFairOdds(reg.preProbA, reg.liveState, { base, bestOf: reg.liveState.bestOf });
      const sideFair = reg.side === 'a' ? fair.fairOddA : fair.fairOddB;
      const val = clvPct(reg.oddEntry, sideFair, reg.dir || 'back');
      const vCls = val > 0 ? 'pos' : val < 0 ? 'neg' : '';
      liveFeedback = `<p class="card-lead" style="margin-top:8px">Odd justa ao vivo de <strong>${reg.side === 'a' ? nmA : nmB}</strong>: <strong>${sideFair.toFixed(2)}</strong> · valor da entrada: <strong class="${vCls}">${formatSignedPct(val)}</strong></p>`;
    } else if (reg.preProbA == null) {
      liveFeedback = `<p class="hint-red" style="margin-top:8px">Não consegui identificar os jogadores no modelo — o valor ao vivo não será medido neste confronto.</p>`;
    }
  }
  const step = (f, v) => `<div class="livestep"><button class="lstep" data-regsc="${f}" data-d="-1">−</button><span class="lstep-v">${v}</span><button class="lstep" data-regsc="${f}" data-d="1">+</button></div>`;
  const L = reg.liveState;
  const matchOddsBlock = !isMO ? '' : `
    <div class="field"><div class="field-label"><span>Tipo de entrada</span></div>
      <div class="chips"><button class="chip${reg.entryType === 'pre' ? ' selected' : ''}" data-entrytype="pre">Pré-jogo</button><button class="chip${reg.entryType === 'live' ? ' selected' : ''}" data-entrytype="live">Ao vivo</button></div>
    </div>
    ${reg.players?.a && reg.players?.b ? `<div class="field"><div class="field-label"><span>Entrei em</span></div>
      <div class="chips"><button class="chip${reg.side === 'a' ? ' selected' : ''}" data-side="a">${nmA}</button><button class="chip${reg.side === 'b' ? ' selected' : ''}" data-side="b">${nmB}</button></div>
    </div>` : ''}
    <div class="field"><div class="field-label"><span>Direção</span></div>
      <div class="chips"><button class="chip${reg.dir === 'back' ? ' selected' : ''}" data-dir="back">Back</button><button class="chip${reg.dir === 'lay' ? ' selected' : ''}" data-dir="lay">Lay</button></div>
    </div>
    ${reg.entryType === 'live' ? `<div class="field"><div class="field-label"><span>Placar no momento da entrada</span></div>
      <div class="live-grid">
        <div class="live-cell"><span class="live-lbl">Sets · ${nmA}</span>${step('setsA', L.setsA)}</div>
        <div class="live-cell"><span class="live-lbl">Sets · ${nmB}</span>${step('setsB', L.setsB)}</div>
        <div class="live-cell"><span class="live-lbl">Games · ${nmA}</span>${step('gamesA', L.gamesA)}</div>
        <div class="live-cell"><span class="live-lbl">Games · ${nmB}</span>${step('gamesB', L.gamesB)}</div>
      </div>
      <div class="chips" style="margin-top:10px"><button class="chip${L.serverIsA ? ' selected' : ''}" data-regserver="A">saca ${nmA}</button><button class="chip${!L.serverIsA ? ' selected' : ''}" data-regserver="B">saca ${nmB}</button></div>
      <div class="chips" style="margin-top:8px"><button class="chip${L.bestOf === 3 ? ' selected' : ''}" data-regbestof="3">3 sets</button><button class="chip${L.bestOf === 5 ? ' selected' : ''}" data-regbestof="5">5 sets</button></div>
      ${liveFeedback}
    </div>` : ''}`;
```

- [ ] **Step 4: Inserir o bloco no HTML** — no template de `renderRegistrar`, logo após o `</div>` do campo "Mercado"/"Superfície" e antes do campo "Odd de entrada", inserir `${matchOddsBlock}`. Concretamente, após a linha do campo Superfície:
```js
    <div class="field"><div class="field-label"><span>Superfície</span></div>${chipsHTML(reg, 'surface', SURFACE_OPTS)}</div>
    ${matchOddsBlock}
```

- [ ] **Step 5: Handlers** — no fim de `renderRegistrar` (após os handlers existentes, antes do fechamento), adicionar:
```js
  regEl.querySelectorAll('[data-entrytype]').forEach((b) =>
    b.addEventListener('click', async () => {
      reg.entryType = b.dataset.entrytype;
      if (reg.entryType === 'live' && reg.preProbA == null && reg.players?.a && reg.players?.b) {
        const m = await ensureModel(reg.tour);
        if (!m.error) {
          const pa = matchPlayer(reg.players.a, m.players);
          const pb = matchPlayer(reg.players.b, m.players);
          if (pa && pb) reg.preProbA = analyzeMatch(pa, pb, reg.surface || 'hard', m).probA;
        }
      }
      renderRegistrar();
    })
  );
  regEl.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => { reg.side = b.dataset.side; renderRegistrar(); }));
  regEl.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => { reg.dir = b.dataset.dir; renderRegistrar(); }));
  regEl.querySelectorAll('[data-regsc]').forEach((b) =>
    b.addEventListener('click', () => { const f = b.dataset.regsc; reg.liveState[f] = Math.max(0, reg.liveState[f] + Number(b.dataset.d)); renderRegistrar(); })
  );
  regEl.querySelectorAll('[data-regserver]').forEach((b) => b.addEventListener('click', () => { reg.liveState.serverIsA = b.dataset.regserver === 'A'; renderRegistrar(); }));
  regEl.querySelectorAll('[data-regbestof]').forEach((b) => b.addEventListener('click', () => { reg.liveState.bestOf = Number(b.dataset.regbestof); renderRegistrar(); }));
```

- [ ] **Step 6: `regValid`** — substituir por:
```js
function regValid() {
  if (!reg.players || !reg.players.a || !reg.players.b) return false;
  if (!reg.market || !reg.result || reg.stake <= 0) return false;
  if ((reg.result === 'green' || reg.result === 'red') && reg.plAmount <= 0) return false;
  if (reg.market === 'Match Odds' && (!reg.entryType || !reg.side || !reg.dir)) return false;
  return true;
}
```

- [ ] **Step 7: `saveTrade`** — substituir a construção do trade em `saveTrade`:
```js
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
```

- [ ] **Step 8: Verificar no navegador** — `npm run dev`. (a) Aba Análise → confronto → Trade ao vivo → montar placar → "Registrar trade neste confronto": o registro abre com Mercado=Match Odds, Tipo=Ao vivo e o placar preenchido. Escolher "Entrei em" e Back/Lay → o feedback mostra odd justa + valor. (b) Salvar e conferir. Sem erro no console.

- [ ] **Step 9: Commit**
```bash
git add web/app.js
git commit -m "feat(registro): tipo de entrada, lado, direcao e placar ao vivo"
```

---

## Task 8: Herói de valor ao vivo no Histórico

**Files:** Modify `web/app.js` (`renderHistorico`)

- [ ] **Step 1: Atualizar as chamadas de `clvBySegment` (assinatura nova)** — na `renderHistorico`, onde o `clvBlock` (fase 1) chama `clvBySegment(trades, 'market')` e `clvBySegment(trades, 'surface')`, trocar para `clvBySegment(trades, 'clv', 'market')` e `clvBySegment(trades, 'clv', 'surface')`.

- [ ] **Step 2: Montar o herói ao vivo** — em `renderHistorico`, logo após o cálculo do `clvBlock` (fase 1), adicionar:
```js
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
```

- [ ] **Step 3: Reordenar no HTML** — no template de `histEl.innerHTML`, colocar o herói ao vivo no topo e rebaixar o `clvBlock` (CLV pré-jogo) a secundário. Trocar:
```js
    <h1 class="screen-title">Histórico</h1>
    ${clvBlock}
```
por:
```js
    <h1 class="screen-title">Histórico</h1>
    ${liveHero}
    <div class="section-title">CLV pré-jogo</div>
    ${clvBlock}
```

- [ ] **Step 4: Verificar no navegador** — `npm run dev`, aba Histórico: sem trades ao vivo → herói mostra o estado educativo; após registrar um trade ao vivo (Task 7), o herói mostra o valor médio + a quebra por superfície; o CLV pré-jogo aparece embaixo como seção secundária.

- [ ] **Step 5: Commit**
```bash
git add web/app.js
git commit -m "feat(historico): heroi de valor ao vivo + CLV pre-jogo secundario"
```

---

## Task 9: Verificação final, revisão e publicação

**Files:** nenhum

- [ ] **Step 1: Suíte completa** — `npm test` → tudo verde (finance, inplay, trade, stats + antigos).

- [ ] **Step 2: `node --check web/app.js`** → sem erro de sintaxe.

- [ ] **Step 3: Verificação de render isolada** — criar um `web/_live-preview.html` temporário (como na fase 1) que importa `clvStats`/`clvTrend`/`clvBySegment` e `liveFairOdds`, renderiza o herói ao vivo com trades de exemplo (com `liveValue`) e um confronto ao vivo de exemplo, confere os números via `get_page_text`. Remover o arquivo depois.

- [ ] **Step 4: Verificação de fluxo** — `npm run dev`: Trade ao vivo → registrar entrada ao vivo → Histórico mostra o valor. Console limpo.

- [ ] **Step 5: Revisão adversarial** — despachar um Code Reviewer sobre o diff da Entrega 1 (bugs/edge cases: prob 0/1, side errado, lay invertido, placar impossível). Aplicar correções reais.

- [ ] **Step 6: Publicar** — no `main`: `git push` (redeploy automático). Reportar ao Felipe.

---

## Notas de execução

- **Não** implementar a Entrega 2 (captura tennis-data) aqui.
- A `liveFairOdds` deve dar o MESMO número que a tela Trade ao vivo já mostra (é o mesmo cálculo, extraído).
- O `analyzeMatch(pa, pb, surface, model)` precisa dos objetos-jogador do modelo (via `matchPlayer`), não das strings do confronto.
