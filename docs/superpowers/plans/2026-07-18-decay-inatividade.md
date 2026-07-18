# Decay por Inatividade no Challenger ATP — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a probabilidade de quem volta de pausa longa, só em Challenger ATP, com um termo de inatividade medido — espelho do ajuste de idade (que roda só no tour).

**Architecture:** Módulo puro `web/src/decay-curve.js` (análogo a `age-curve.js`); integração em `analyzeMatch` gateada por `nivelEfetivo === 'challenger'`; a inatividade vem de `lastDate` (já no `model.json`) e da data do confronto; a UI ganha um selo e uma frase no padrão dos ajustes existentes.

**Tech Stack:** JavaScript ESM puro, `node --test` (node:test + node:assert/strict). `fixtures.js` é IO (verificado por re-geração); `app.js` é UI (verificado no navegador).

## Global Constraints

- **Fórmula (pareada, antissimétrica, sem intercepto):** `logit(p_corr_A) = logit(p_tela_A) + c · (f(inat_B) − f(inat_A))`, com `f(inat) = min(1, max(0, (inat − 90)/365))`. `p_corr(A,B) + p_corr(B,A) = 1`.
- **`DECAY_COEF = { ATP: 0.50, WTA: 0 }`** — c=0,50 medido no Challenger, ganho fora da amostra +0,00060, IC [0,00041; 0,00078], placebo nulo.
- **Só Challenger:** `analyzeMatch` aplica o decay sse `nivelEfetivo === 'challenger'` (o mesmo `nivelEfetivo` que gateia a idade — nunca aplicam juntos). O tour ATP e a WTA ficam fora (IC cruza zero).
- **Inatividade:** `dias = data_do_confronto − p.lastDate` (ambos AAAAMMDD). Sem `lastDate`, ou inatividade < 90 dias, → `f = 0` (sem contribuição). Sem data de referência → decay não roda.
- **Contrato de compatibilidade:** os testes existentes de `analyzeMatch` chamam sem a data de referência e sem `lastDate` — o decay NÃO deve rodar neles (sem regressão).
- **UI pt-BR; pp/percentuais com vírgula e 1 casa.** Selo: `⚖ ajuste de inatividade`.
- **Comando de teste:** um arquivo → `node --test tests/<arquivo>.test.js`; suíte toda → `npm test`.

---

## Arquivos tocados

- `web/src/decay-curve.js` — Task 1 (novo, puro)
- `tests/decay-curve.test.js` — Task 1 (novo)
- `web/src/analysis.js` — Task 2 (integração em `analyzeMatch`)
- `tests/analysis.test.js` — Task 2 (testes do gate + decay)
- `pipeline/fixtures.js` — Task 3 (data de referência + grava `decayAdjust`)
- `web/model-*.json` / `web/today.json` — Task 3 (regenerados na verificação)
- `web/app.js` — Task 4 (selo na grade, frase no card, data de referência nas chamadas)

---

### Task 1: Módulo puro `decay-curve.js`

**Files:**
- Create: `web/src/decay-curve.js`
- Test: `tests/decay-curve.test.js`

**Interfaces:**
- Produces:
  - `inatividadeDias(refDateInt, lastDateInt): number|null` — dias entre duas datas AAAAMMDD; `null` se faltar alguma.
  - `decayAdjusted(prob, inatA, inatB, tour): {prob, base, delta, inatA, inatB, adjusted}|null`.
  - `decayAdjustText(decayAdjust, nomeMaisParado): string|null`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/decay-curve.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inatividadeDias, decayAdjusted, decayAdjustText } from '../web/src/decay-curve.js';

test('inatividadeDias: 1/jan a 1/abr de 2026 = 90 dias', () => {
  assert.equal(inatividadeDias(20260401, 20260101), 90);
});
test('inatividadeDias: sem lastDate (null ou 0) devolve null', () => {
  assert.equal(inatividadeDias(20260401, null), null);
  assert.equal(inatividadeDias(20260401, 0), null);
  assert.equal(inatividadeDias(null, 20260101), null);
});

test('decayAdjusted: A volta de 6 meses (oponente fresco) PERDE probabilidade (ATP)', () => {
  const r = decayAdjusted(0.5, 180, 0, 'ATP'); // f(180)=90/365=0,2466; termo=-0,2466
  assert.equal(r.adjusted, true);
  assert.ok(r.prob < 0.5, `esperava < 0,5, veio ${r.prob}`);
  assert.ok(Math.abs(r.prob - 0.4692) < 0.002, `esperava ~0,469, veio ${r.prob}`);
  assert.equal(r.base, 0.5);
});

test('decayAdjusted: ANTISSIMETRIA — p(A,B) + p(B,A) = 1', () => {
  for (const [p, ia, ib] of [[0.5, 180, 0], [0.7, 300, 40], [0.35, 0, 500]]) {
    const ab = decayAdjusted(p, ia, ib, 'ATP');
    const ba = decayAdjusted(1 - p, ib, ia, 'ATP');
    assert.ok(Math.abs(ab.prob + ba.prob - 1) < 1e-9, `soma ${ab.prob + ba.prob}`);
  }
});

test('decayAdjusted: inatividade < 90 dias não mexe (rampa começa em 90)', () => {
  const r = decayAdjusted(0.6, 80, 10, 'ATP');
  assert.equal(r.adjusted, false);
  assert.equal(r.prob, 0.6);
});

test('decayAdjusted: mesma inatividade nos dois lados não mexe', () => {
  const r = decayAdjusted(0.6, 200, 200, 'ATP');
  assert.equal(r.adjusted, false);
});

test('decayAdjusted: WTA não é ajustada (coef 0)', () => {
  const r = decayAdjusted(0.5, 300, 0, 'WTA');
  assert.equal(r.adjusted, false);
  assert.equal(r.prob, 0.5);
});

test('decayAdjusted: inatividade nula/ausente não estoura', () => {
  const r = decayAdjusted(0.5, null, null, 'ATP');
  assert.equal(r.adjusted, false);
});

test('decayAdjusted: probabilidade inválida devolve null', () => {
  assert.equal(decayAdjusted(null, 200, 0, 'ATP'), null);
});

test('decayAdjustText: nomeia quem volta, os meses e a prob sem o ajuste', () => {
  const r = decayAdjusted(0.5, 240, 0, 'ATP'); // A parado 8 meses; A é o mais parado
  const t = decayAdjustText(r, 'Fonseca J.');
  assert.ok(t.includes('Fonseca J.'), t);
  assert.ok(t.includes('8 meses'), t);       // 240/30 = 8
  assert.ok(t.includes('50,0%'), t);         // base do mais parado (A) = 0,5
  assert.ok(/inatividade/i.test(t), t);
});
test('decayAdjustText: sem ajuste não gera linha', () => {
  assert.equal(decayAdjustText(decayAdjusted(0.5, 200, 200, 'ATP'), 'A'), null);
  assert.equal(decayAdjustText(null, 'A'), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/decay-curve.test.js`
Expected: FAIL — o módulo não existe (import quebra).

- [ ] **Step 3: Implementar o módulo**

Criar `web/src/decay-curve.js`:

```js
// Correção do viés de INATIVIDADE do Elo: o modelo superestima quem volta de pausa longa
// (o Elo fica congelado no nível de antes da ausência). Função pura. Aplicada DEPOIS do
// calibrationT, na probabilidade servida. Espelho de age-curve.js — a idade roda só no tour,
// o decay só no Challenger; nunca no mesmo jogo.
//
// O QUE FOI MEDIDO (walk-forward 2013-2026, ATP combined; teste out-of-sample 2024-26):
//   viés monótono na inatividade (180+ dias: −6pp; 365+: −9pp), placebo nulo. O ganho da
//   correção PAGA só no CHALLENGER (+0,00060, IC95 [0,00041; 0,00078]); no tour ATP (N=297)
//   e na WTA o IC cruza zero. Ver docs/superpowers/specs/2026-07-18-decay-inatividade-design.md.
//
// ATENÇÃO: o coeficiente é o ERRO DESTE Elo, não uma constante da natureza. Se o K, o prior
// 1500 ou a fórmula mudarem, a medição precisa ser REFEITA.

/** Ganho de logit por unidade de "ferrugem", contra quem volta. Só ATP; WTA não paga fora
 *  da amostra (IC cruza zero). Aplicado SÓ em Challenger — o gate vive em analyzeMatch. */
const DECAY_COEF = { ATP: 0.50, WTA: 0 };
const RAMP_START = 90;   // dias sem jogar antes de a ferrugem começar (o viés é nulo em 0-90)
const RAMP_SPAN = 365;   // dias para a ferrugem ir de 0 a 1

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clamp = (p) => Math.min(0.9999, Math.max(0.0001, p));
const pct = (p) => `${(p * 100).toFixed(1).replace('.', ',')}%`;
const toDays = (i) => Date.UTC(Math.floor(i / 10000), (Math.floor(i / 100) % 100) - 1, i % 100) / 86400000;

/** "Ferrugem" acumulada: 0 até 90 dias, sobe linearmente até 1 em ~1,4 ano. */
const ferrugem = (inat) => (inat == null || !Number.isFinite(inat)) ? 0 : Math.min(1, Math.max(0, (inat - RAMP_START) / RAMP_SPAN));

/** Dias entre duas datas AAAAMMDD (referência − último jogo). null se faltar alguma. */
export function inatividadeDias(refDateInt, lastDateInt) {
  if (!refDateInt || !lastDateInt) return null;
  return toDays(refDateInt) - toDays(lastDateInt);
}

/** Corrige a probabilidade de A vencer pelo viés de inatividade. Antissimétrico, sem
 *  intercepto (como age-curve). Só mexe quando há DIFERENÇA de ferrugem entre os dois.
 *  @returns {{prob, base, delta, inatA, inatB, adjusted}|null} */
export function decayAdjusted(prob, inatA, inatB, tour) {
  if (prob == null || !Number.isFinite(prob)) return null;
  const semAjuste = { prob, base: prob, delta: 0, inatA: inatA ?? null, inatB: inatB ?? null, adjusted: false };
  const coef = DECAY_COEF[tour];
  if (!coef) return semAjuste; // WTA (0) ou tour desconhecido
  const termo = ferrugem(inatB) - ferrugem(inatA); // positivo = B mais enferrujado → A ganha
  if (termo === 0) return semAjuste;
  const ajustada = sigmoid(logit(clamp(prob)) + coef * termo);
  return { prob: ajustada, base: prob, delta: ajustada - prob, inatA, inatB, adjusted: true };
}

/** A linha que explica o ajuste no card. Nomeia quem volta (o mais parado). null sem ajuste. */
export function decayAdjustText(decayAdjust, nomeMaisParado) {
  if (!decayAdjust || !decayAdjust.adjusted) return null;
  const { inatA, inatB, base } = decayAdjust;
  const maisParadoEhA = (inatA ?? 0) >= (inatB ?? 0);
  const meses = Math.round((maisParadoEhA ? inatA : inatB) / 30);
  const baseMaisParado = maisParadoEhA ? base : 1 - base; // a prob sem o ajuste do jogador nomeado
  return `Ajustado por inatividade: ${nomeMaisParado} volta de ${meses} meses sem jogar — o modelo superestima quem volta de pausa longa em Challenger. Sem o ajuste: ${pct(baseMaisParado)}.`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/decay-curve.test.js`
Expected: PASS — os 10 testes passam.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — nada regrediu (módulo novo, ninguém o consome ainda).

- [ ] **Step 6: Commit**

```bash
git add web/src/decay-curve.js tests/decay-curve.test.js
git commit -m "feat(decay): decay-curve — correção pura do viés de inatividade (Challenger ATP)"
```

---

### Task 2: Integrar o decay em `analyzeMatch`

**Files:**
- Modify: `web/src/analysis.js:1-6` (import), `:87-141` (função `analyzeMatch`)
- Test: `tests/analysis.test.js`

**Interfaces:**
- Consumes: `inatividadeDias`, `decayAdjusted` (Task 1); o `nivelEfetivo` já computado em `analyzeMatch`.
- Produces: `analyzeMatch(playerA, playerB, surface, model, level, refDate)` — 6º param opcional `refDate` (AAAAMMDD). O objeto retornado ganha `decayAdjust: {...}|null`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `tests/analysis.test.js`:

```js
// Fixtures de Challenger com lastDate (para o decay). refDate = 20260710.
const challParado = { name: 'Parado P.', elo: 2000, hard: 2000, clay: 2000, grass: 2000, matches: 100, lastDate: 20260101, level: 'challenger' };
const challFresco = { name: 'Fresco F.', elo: 2000, hard: 2000, clay: 2000, grass: 2000, matches: 100, lastDate: 20260701, level: 'challenger' };
const mCh = { calibrationT: 1, tour: 'ATP' };

test('analyzeMatch: Challenger + refDate → aplica decay em quem voltou de pausa', () => {
  const r = analyzeMatch(challParado, challFresco, 'hard', mCh, 'challenger', 20260710);
  assert.equal(r.decayAdjust.adjusted, true);
  assert.ok(r.probA < 0.5, `o parado devia perder prob, veio ${r.probA}`);
  assert.ok(Math.abs(r.probA + r.probB - 1) < 1e-9);
  assert.equal(r.ageAdjust.adjusted, false); // idade não roda em challenger
});

test('analyzeMatch: sem refDate → decay não roda (compat com os testes antigos)', () => {
  const r = analyzeMatch(challParado, challFresco, 'hard', mCh, 'challenger');
  assert.equal(r.decayAdjust, null);
  assert.ok(Math.abs(r.probA - 0.5) < 1e-9);
});

test('analyzeMatch: nível tour → decay não roda (só idade)', () => {
  const r = analyzeMatch(challParado, challFresco, 'hard', mCh, 'tour', 20260710);
  assert.equal(r.decayAdjust, null);
});

test('analyzeMatch: WTA Challenger → decay não roda (coef 0)', () => {
  const r = analyzeMatch(challParado, challFresco, 'hard', { calibrationT: 1, tour: 'WTA' }, 'challenger', 20260710);
  assert.equal(r.decayAdjust, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/analysis.test.js`
Expected: FAIL — `analyzeMatch` ignora `refDate`; `r.decayAdjust` é undefined.

- [ ] **Step 3: Implementar a integração**

Em `web/src/analysis.js`, no import do topo (`import { ageAdjusted } from './age-curve.js';`), acrescentar uma linha:

```js
import { inatividadeDias, decayAdjusted } from './decay-curve.js';
```

Trocar a assinatura de `analyzeMatch` (`export function analyzeMatch(playerA, playerB, surface, model, level) {`) por:

```js
export function analyzeMatch(playerA, playerB, surface, model, level, refDate) {
```

E inserir o bloco do decay logo APÓS o `if/else` que resolve `probA`/`ageAdjust`/`ageSuppressed` (hoje termina na linha do `ageSuppressed = { ... }` e é seguido por `const probB = 1 - probA;`). Inserir ENTRE eles:

```js
  // Decay por inatividade — só Challenger ATP; exclusivo com a idade (que só roda em tour).
  // Sem refDate (chamada sem data do confronto) o decay não roda — a inatividade é indeterminada.
  let decayAdjust = null;
  if (nivelEfetivo === 'challenger' && refDate != null) {
    const inatA = inatividadeDias(refDate, playerA.lastDate);
    const inatB = inatividadeDias(refDate, playerB.lastDate);
    const d = decayAdjusted(probA, inatA, inatB, model.tour);
    if (d?.adjusted) { probA = d.prob; decayAdjust = d; }
  }
```

E adicionar `decayAdjust,` ao objeto retornado (junto de `ageAdjust,` e `ageSuppressed,`).

- [ ] **Step 4: Rodar e ver passar (inclui os testes antigos)**

Run: `node --test tests/analysis.test.js`
Expected: PASS — os 4 novos passam E todos os antigos (idade, nível) continuam verdes: chamados sem `refDate`, o decay não roda.

- [ ] **Step 5: Suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/analysis.js tests/analysis.test.js
git commit -m "feat(analise): analyzeMatch aplica o decay de inatividade em Challenger ATP"
```

---

### Task 3: `fixtures.js` — data de referência + grava `decayAdjust`; re-gera

**Files:**
- Modify: `pipeline/fixtures.js:64` (chamada `analyzeMatch`) e `:78-79` (spreads condicionais)
- Regenerate: `web/model-*.json` (não muda) e `web/today.json`

**Interfaces:**
- Consumes: `analyzeMatch(..., level, refDate)` com `decayAdjust` (Task 2).
- Produces: cada match do `today.json` ganha `decayAdjust` quando houver.

> **Nota de teste:** `fixtures.js` é IO (fetch) sem teste unitário — a lógica está coberta nas Tasks 1-2. Verificação por re-geração real.

- [ ] **Step 1: Passar a data de referência e gravar o decay**

Em `pipeline/fixtures.js:64`, trocar:

```js
    const r = analyzeMatch(pa, pb, g.surface, model, g.level);
```

por (o `commence` é ISO — `"2026-07-18T..."`; os 10 primeiros chars viram AAAAMMDD):

```js
    const refDate = g.commence ? Number(g.commence.slice(0, 10).replace(/-/g, '')) : null;
    const r = analyzeMatch(pa, pb, g.surface, model, g.level, refDate);
```

E, logo após o spread de `ageSuppressed` (`...(r.ageSuppressed ? { ageSuppressed: r.ageSuppressed } : {}),`), adicionar:

```js
      ...(r.decayAdjust?.adjusted ? { decayAdjust: r.decayAdjust } : {}),
```

- [ ] **Step 2: Validar sintaxe e suíte**

Run: `node --check pipeline/fixtures.js` → sem erro.
Run: `npm test` → PASS (a suíte não cobre fixtures.js, mas confirma que nada quebrou).

- [ ] **Step 3: Re-gerar o `today.json` e inspecionar**

Run: `node pipeline/fixtures.js`
Depois:

```bash
node --input-type=module -e '
import { readFile } from "node:fs/promises";
const t = JSON.parse(await readFile(new URL("./web/today.json", `file://${process.cwd()}/`)));
const dec = t.matches.filter((m) => m.decayAdjust);
console.log("jogos com decay:", dec.length);
for (const m of dec) console.log(`  ${m.level} ${m.a} vs ${m.b}: probA ${m.probA?.toFixed(3)} (base ${m.decayAdjust.base?.toFixed(3)}, inatA ${m.decayAdjust.inatA}, inatB ${m.decayAdjust.inatB})`);
// invariante: nenhum decay fora de challenger
const foraChall = dec.filter((m) => m.level !== "challenger");
console.log("decay fora de challenger (deve ser 0):", foraChall.length);
'
```

Expected: qualquer jogo com `decayAdjust` tem `level: "challenger"`; `decay fora de challenger: 0`. (Se não houver Challenger com jogador inativo hoje, a lista pode vir vazia — válido; a lógica está testada na Task 1-2. Note no report.)

- [ ] **Step 4: Commit**

```bash
git add pipeline/fixtures.js web/today.json
git commit -m "feat(grade): today.json leva o ajuste de inatividade (decay) por jogo"
```

---

### Task 4: UI — selo na grade, frase no card, data de referência nas chamadas

**Files:**
- Modify: `web/app.js:16` (import), `:875` (região dos selos em `renderFixtures`), `:878` (linha `fx-sub`), `:1261` (chamada `analyzeMatch` em `renderReading`), `:1288-1293` (bloco de frases no card)

**Interfaces:**
- Consumes: `g.decayAdjust` do `today.json` (Task 3); `decayAdjustText` (Task 1); `analyzeMatch(..., refDate)` (Task 2).
- Produces: selo `⚖ ajuste de inatividade` na grade; frase explicativa no card.

> **Nota de teste:** `app.js` é UI sem suíte — validação por `node --check` + verificação no navegador (feita pelo controller).

- [ ] **Step 1: Importar `decayAdjustText`**

Em `web/app.js:16`, trocar:

```js
import { ageAdjustText, ageSuppressedText } from './src/age-curve.js';
```

por (duas linhas):

```js
import { ageAdjustText, ageSuppressedText } from './src/age-curve.js';
import { decayAdjustText } from './src/decay-curve.js';
```

- [ ] **Step 2: Selo na grade**

Em `web/app.js`, dentro do `.map((g, i) => {...})` de `renderFixtures`, junto do `ageSuppressBadge` (adicionado na feature de nível), adicionar:

```js
      const decayBadge = g.decayAdjust ? ` <span class="field-hint">⚖ ajuste de inatividade</span>` : '';
```

E na linha do `fx-sub` (hoje termina em `...${ageBadge}${ageSuppressBadge}</div>`), acrescentar `${decayBadge}`:

```js
        <div class="fx-sub">Favorito: <strong>${g.favorite}</strong> ${favPct}% · ${g.marginLabel} · confiança ${g.confidence}${ageBadge}${ageSuppressBadge}${decayBadge}</div>
```

- [ ] **Step 3: Passar a data de hoje ao `analyzeMatch` do detalhe**

Perto do topo de `renderReading` (onde hoje é `const r = analyzeMatch(anal.a, anal.b, anal.surface, anal.model, anal.level);`), trocar por:

```js
  const hojeInt = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const r = analyzeMatch(anal.a, anal.b, anal.surface, anal.model, anal.level, hojeInt);
```

> Coerência grade↔detalhe: a grade usa `commence` (Task 3) e o detalhe usa hoje; para os jogos do dia `commence` cai no mesmo AAAAMMDD, então a inatividade em dias coincide. (Jogos agendados para outro dia seriam o único desvio, de 1 dia — desprezível na rampa de 90–365.)

- [ ] **Step 4: Frase no card**

Em `web/app.js`, logo após o bloco IIFE de `ageSuppressedText` (termina em `})()}` na região ~1293), adicionar um bloco irmão:

```js
        ${(() => {
          if (!r.decayAdjust?.adjusted) return '';
          const nomeMaisParado = (r.decayAdjust.inatA ?? 0) >= (r.decayAdjust.inatB ?? 0) ? fullA : fullB;
          const txt = decayAdjustText(r.decayAdjust, nomeMaisParado);
          return txt ? `<div class="field-hint" style="margin-top:8px">${txt}</div>` : '';
        })()}
```

- [ ] **Step 5: Validar sintaxe e suíte**

Run: `node --check web/app.js` → sem erro.
Run: `npm test` → PASS (app.js não é coberto, mas confirma que nada quebrou).

- [ ] **Step 6: Verificação no navegador (controller)**

Com um `today.json` que tenha um Challenger com jogador inativo (ou injetando um caso de teste), confirmar via DOM: a grade mostra `⚖ ajuste de inatividade` no jogo certo, e o card de detalhe mostra "Ajustado por inatividade: … volta de N meses …". Invariante: só em jogos de Challenger; um jogo de tour com idade discrepante segue mostrando "Ajustado por idade".

- [ ] **Step 7: Commit**

```bash
git add web/app.js
git commit -m "feat(grade): selo e explicação do ajuste de inatividade no card e na grade"
```

---

## Self-Review (preenchido)

**1. Cobertura da spec:**
- Fórmula (rampa>90, c=0,50, antissimétrica) → Task 1. ✓
- Gate só Challenger, via `nivelEfetivo` → Task 2. ✓
- Inatividade de `lastDate` + data do confronto → Task 1 (`inatividadeDias`) + Tasks 2/3/4. ✓
- `today.json` leva o decay → Task 3. ✓
- Selo + frase no padrão dos ajustes → Task 4. ✓
- WTA/tour fora (coef 0 / sem gate) → Task 1 (DECAY_COEF) + Task 2 (gate challenger). ✓

**2. Placeholders:** nenhum; cada step tem código/comando concreto e saída esperada.

**3. Consistência de tipos/nomes:** `decayAdjusted(prob, inatA, inatB, tour) → {prob, base, delta, inatA, inatB, adjusted}` idêntico entre Task 1 (def), Task 2 (uso) e Task 4 (leitura do `inatA/inatB` para o nome). `analyzeMatch(..., level, refDate)` — 6º param — consistente entre Tasks 2, 3, 4. `decayAdjustText(decayAdjust, nomeMaisParado)` idêntico entre Task 1 e Task 4. Selo `⚖ ajuste de inatividade` idêntico entre Task 3 (dado) e Task 4 (render).

## Riscos

- **`app.js` usa `new Date()`** (não puro) — aceitável: é a camada de UI, e `analyzeMatch`/`decay-curve` permanecem puros (recebem `refDate`).
- **Coerência grade↔detalhe:** `commence` (grade) vs hoje (detalhe) coincidem no mesmo dia; desvio só para jogos de outro dia, ≤1 dia, desprezível.
- **Sem Challenger inativo no dia da verificação:** a lógica está coberta por teste unitário (Tasks 1-2); a verificação de UI pode precisar de um caso injetado — anotar no report se a grade do dia não tiver um exemplo natural.
- **Suíte:** 310 → 324 esperado (+10 na Task 1, +4 na Task 2).
