# CLV herói no topo do Histórico (fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promover o CLV a métrica-herói no topo da tela Histórico: bloco grande com CLV médio, beat rate, tendência acumulada, e quebra de CLV por mercado e superfície.

**Architecture:** Lógica pura e testável em `web/src/stats.js` (3 funções novas), renderização em `web/app.js` (nova seção no topo de `renderHistorico` + helper `clvSegCard`), estilo em `web/styles.css`. Reaproveita `areaSpark`, `formatSignedPct`, `formatPctFrac` e as classes de card existentes. Sem mudanças no robô/pipeline.

**Tech Stack:** PWA sem build (HTML/CSS/JS ES modules), node built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-07-14-clv-heroi-topo-historico-design.md`

---

## File Structure

- **Modify** `web/src/stats.js` — adiciona `clvStats`, `clvTrend`, `clvBySegment` (funções puras).
- **Modify** `tests/stats.test.js` — testes das 3 funções novas.
- **Modify** `web/app.js` — corrige `MARKET_OPTS`; importa as 3 funções; adiciona `clvSegCard`; insere a seção CLV no topo de `renderHistorico`.
- **Modify** `web/styles.css` — classes `.clv-hero` e filhas.

---

## Task 1: `clvStats` — resumo de CLV

**Files:**
- Modify: `web/src/stats.js`
- Test: `tests/stats.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar no fim de `tests/stats.test.js` (o import da linha 3 e o helper `approx` já existem no arquivo; ampliar o import para incluir as novas funções):

Trocar a linha 3:
```js
import { summarize, plOnDate, segmentBy } from '../web/src/stats.js';
```
por:
```js
import { summarize, plOnDate, segmentBy, clvStats, clvTrend, clvBySegment } from '../web/src/stats.js';
```

Adicionar no fim do arquivo:
```js
const clvTrades = [
  { date: '2026-07-10', market: 'Match Odds', surface: 'clay', clv: 4 },
  { date: '2026-07-11', market: 'Match Odds', surface: 'hard', clv: 2 },
  { date: '2026-07-12', market: 'Handicap', surface: 'clay', clv: -3 },
  { date: '2026-07-13', market: 'Match Odds', surface: 'grass' }, // sem clv → ignorado
];

test('clvStats: média, beat rate e contagem só de trades com CLV', () => {
  const s = clvStats(clvTrades);
  assert.equal(s.measured, 3);
  approx(s.avgClv, (4 + 2 - 3) / 3);
  assert.equal(s.beatCount, 2);
  approx(s.beatRate, 2 / 3);
});

test('clvStats: sem trades medidos não quebra', () => {
  const s = clvStats([{ date: 'x' }]);
  assert.equal(s.measured, 0);
  approx(s.avgClv, 0);
  approx(s.beatRate, 0);
  assert.equal(s.beatCount, 0);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/stats.test.js`
Expected: FAIL — `clvStats is not a function` (ou export não encontrado).

- [ ] **Step 3: Implementar `clvStats`**

Adicionar no fim de `web/src/stats.js`:
```js
/** Resumo de CLV: quantos trades têm CLV, CLV médio (%), e quanto bateu o fechamento. */
export function clvStats(trades) {
  let sum = 0;
  let measured = 0;
  let beatCount = 0;
  for (const t of trades) {
    if (typeof t.clv !== 'number') continue;
    measured++;
    sum += t.clv;
    if (t.clv > 0) beatCount++;
  }
  return {
    measured,
    avgClv: measured > 0 ? sum / measured : 0,
    beatRate: measured > 0 ? beatCount / measured : 0,
    beatCount,
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/stats.test.js`
Expected: PASS (os 2 testes novos de `clvStats` + todos os antigos).

- [ ] **Step 5: Commit**

```bash
git add web/src/stats.js tests/stats.test.js
git commit -m "feat(stats): clvStats — CLV medio, beat rate e contagem de medidos"
```

---

## Task 2: `clvTrend` — CLV médio acumulado

**Files:**
- Modify: `web/src/stats.js`
- Test: `tests/stats.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar no fim de `tests/stats.test.js`:
```js
test('clvTrend: CLV médio acumulado em ordem de data', () => {
  const t = clvTrend([
    { date: '2026-07-12', clv: -3 },
    { date: '2026-07-10', clv: 4 },
    { date: '2026-07-11', clv: 2 },
  ]);
  // ordena por data: 4, 2, -3 → acumulado: 4, 3, 1
  assert.equal(t.length, 3);
  approx(t[0], 4);
  approx(t[1], 3);
  approx(t[2], 1);
});

test('clvTrend: vazio e 1 elemento', () => {
  assert.deepEqual(clvTrend([]), []);
  const one = clvTrend([{ date: 'a', clv: 5 }]);
  assert.equal(one.length, 1);
  approx(one[0], 5);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/stats.test.js`
Expected: FAIL — `clvTrend is not a function`.

- [ ] **Step 3: Implementar `clvTrend`**

Adicionar no fim de `web/src/stats.js`:
```js
/** Série do CLV médio acumulado, em ordem de data — só trades com CLV. */
export function clvTrend(trades) {
  const measured = trades
    .filter((t) => typeof t.clv === 'number')
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const out = [];
  let sum = 0;
  for (let i = 0; i < measured.length; i++) {
    sum += measured[i].clv;
    out.push(sum / (i + 1));
  }
  return out;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/stats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/stats.js tests/stats.test.js
git commit -m "feat(stats): clvTrend — serie do CLV medio acumulado"
```

---

## Task 3: `clvBySegment` — quebra de CLV por chave

**Files:**
- Modify: `web/src/stats.js`
- Test: `tests/stats.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar no fim de `tests/stats.test.js`:
```js
test('clvBySegment: agrupa por chave só trades com CLV', () => {
  const g = clvBySegment([
    { market: 'Match Odds', clv: 4 },
    { market: 'Match Odds', clv: -2 },
    { market: 'Handicap', clv: 6 },
    { market: 'Handicap' }, // sem clv → ignorado
  ], 'market');
  assert.equal(g['Match Odds'].count, 2);
  approx(g['Match Odds'].avgClv, 1);
  approx(g['Match Odds'].beatRate, 0.5);
  assert.equal(g['Handicap'].count, 1);
  approx(g['Handicap'].avgClv, 6);
  approx(g['Handicap'].beatRate, 1);
});

test('clvBySegment: chave ausente cai em —', () => {
  const g = clvBySegment([{ clv: 3 }], 'surface');
  assert.equal(g['—'].count, 1);
  approx(g['—'].avgClv, 3);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/stats.test.js`
Expected: FAIL — `clvBySegment is not a function`.

- [ ] **Step 3: Implementar `clvBySegment`**

Adicionar no fim de `web/src/stats.js`:
```js
/** Agrupa por chave (market/surface) só trades com CLV: nº, CLV médio, beat rate. */
export function clvBySegment(trades, key) {
  const groups = {};
  for (const t of trades) {
    if (typeof t.clv !== 'number') continue;
    const k = t[key] ?? '—';
    const g = (groups[k] ??= { count: 0, sum: 0, beatCount: 0, avgClv: 0, beatRate: 0 });
    g.count++;
    g.sum += t.clv;
    if (t.clv > 0) g.beatCount++;
  }
  for (const g of Object.values(groups)) {
    g.avgClv = g.count > 0 ? g.sum / g.count : 0;
    g.beatRate = g.count > 0 ? g.beatCount / g.count : 0;
  }
  return groups;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/stats.test.js`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: PASS — toda a suíte verde (os antigos + os 6 novos de CLV).

- [ ] **Step 6: Commit**

```bash
git add web/src/stats.js tests/stats.test.js
git commit -m "feat(stats): clvBySegment — quebra de CLV por mercado/superficie"
```

---

## Task 4: Corrigir a lista de mercados

**Files:**
- Modify: `web/app.js:307`

- [ ] **Step 1: Trocar `MARKET_OPTS`**

Substituir a linha:
```js
const MARKET_OPTS = ['Match Odds', 'Vencedor Set', 'Games', 'Outro'];
```
por:
```js
const MARKET_OPTS = ['Match Odds', 'Handicap', 'Over/Under Games'];
```

- [ ] **Step 2: Verificar que o app carrega sem erro**

Run: `npm run dev` (deixe rodando; será usado nas próximas tarefas)
Abrir `http://localhost:5173`, ir na aba Registrar e confirmar que os chips de Mercado mostram exatamente: Match Odds, Handicap, Over/Under Games.

- [ ] **Step 3: Commit**

```bash
git add web/app.js
git commit -m "feat(registro): mercados reais do Felipe (Match Odds/Handicap/Over-Under)"
```

---

## Task 5: CSS do bloco CLV herói

**Files:**
- Modify: `web/styles.css`

- [ ] **Step 1: Adicionar as classes**

Adicionar em `web/styles.css` (logo após o bloco `.v-indigo { ... }`, perto da linha 209):
```css
.clv-hero { border-radius: var(--r-lg); padding: 20px 22px; color: #fff; margin-bottom: 14px;
  background: linear-gradient(155deg, #1CC98A, #12A56C); box-shadow: var(--shadow); }
.clv-hero.neg { background: linear-gradient(155deg, #FF6178, #E23F58); }
.clv-hero .clv-hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; }
.clv-hero .clv-lab { font-size: 13.5px; font-weight: 700; opacity: .95; }
.clv-hero .clv-val { font-size: 42px; font-weight: 800; letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums; margin-top: 4px; line-height: 1.05; }
.clv-hero .clv-spark { width: 130px; flex-shrink: 0; opacity: .9; margin-top: 8px; }
.clv-hero .clv-pills { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.clv-hero .clv-pill { background: rgba(255,255,255,.22); border-radius: 999px;
  padding: 5px 11px; font-size: 12.5px; font-weight: 600; }
```

- [ ] **Step 2: Commit**

```bash
git add web/styles.css
git commit -m "style: card heroi de CLV (verde/vermelho, pills, spark)"
```

---

## Task 6: Seção CLV no topo de `renderHistorico`

**Files:**
- Modify: `web/app.js` (import de stats na linha 3; helper `clvSegCard` perto do `segCard` da linha 471; `renderHistorico` a partir da linha 482)

- [ ] **Step 1: Ampliar o import de stats**

Substituir a linha 3:
```js
import { summarize, plOnDate, stopLossStatus, tiltWarning, segmentBy } from './src/stats.js';
```
por:
```js
import { summarize, plOnDate, stopLossStatus, tiltWarning, segmentBy, clvStats, clvTrend, clvBySegment } from './src/stats.js';
```

- [ ] **Step 2: Adicionar o helper `clvSegCard`**

Logo depois da função `segCard` (após a linha 480), adicionar:
```js
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
```

- [ ] **Step 3: Montar o bloco CLV em `renderHistorico`**

Dentro de `renderHistorico`, logo depois da linha `const s = summarize(trades);` (linha 488), adicionar:
```js
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
        ${clvSegCard('CLV por mercado', clvBySegment(trades, 'market'))}
        ${clvSegCard('CLV por superfície', clvBySegment(trades, 'surface'), (k) => SURFACE_PT[k] || k)}
      </div>`;
```

- [ ] **Step 4: Inserir o bloco no HTML**

No template de `histEl.innerHTML` dentro de `renderHistorico`, inserir `${clvBlock}` entre o `<h1 class="screen-title">Histórico</h1>` e o `<div class="hero-card">` do P/L:
```js
  histEl.innerHTML = `
    <h1 class="screen-title">Histórico</h1>
    ${clvBlock}
    <div class="hero-card">
```
(o resto do template permanece igual.)

- [ ] **Step 5: Verificar no navegador**

Com `npm run dev` rodando, abrir `http://localhost:5173` e ir na aba Histórico.
- Numa conta com trades que têm odd de fechamento: confirmar o card verde de CLV no topo (valor, tendência, pills) e os dois cards "CLV por mercado" e "CLV por superfície".
- Se `avgClv` for negativo, o card deve ficar vermelho.
- Numa conta sem CLV: confirmar o bloco educativo (sem números falsos).

Verificação via `get_page_text` + inspeção do DOM (screenshot do browser-pane é instável). Confirmar que não há erro no console.

- [ ] **Step 6: Commit**

```bash
git add web/app.js
git commit -m "feat(historico): CLV heroi no topo (media, tendencia, quebra mercado/superficie)"
```

---

## Task 7: Verificação final e deploy

**Files:** nenhum (verificação + publicação)

- [ ] **Step 1: Suíte de testes verde**

Run: `npm test`
Expected: PASS — tudo verde, sem regressão.

- [ ] **Step 2: Verificação funcional no navegador**

Com `npm run dev`, revisar o Histórico nos dois estados (com CLV e sem CLV), conferir responsividade (as duas quebras empilham no mobile via `.grid-v`) e ausência de erros no console.

- [ ] **Step 3: Publicar (autorização permanente do Felipe: feature pronta + testes verdes + verificada)**

Já estamos no branch `main`. Publicar:
```bash
git push
```
O GitHub Pages re-deploya sozinho. Reportar ao Felipe que foi ao ar (URL: https://felipealmeidaaraujo.github.io/projeto-investidor/), lembrando do lag do service worker até propagar.

---

## Notas de execução

- **Não** implementar aqui nada da fase 2 (captura tennis-data, campo lado, back/lay). É outro plano.
- Os trades de simulação da conta do Felipe podem ter mercados antigos ("Vencedor Set" etc.) — as quebras os exibem normalmente; serão apagados quando ele começar de verdade.
- Manter o padrão do código existente (funções puras em `src/`, sem libs novas).
