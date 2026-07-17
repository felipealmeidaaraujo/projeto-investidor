# Curva de Idade na Probabilidade da ATP — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o viés medido do Elo, que subestima o jogador mais novo em até 10pp nos confrontos com muita diferença de idade — só na ATP, com a explicação visível no card.

**Architecture:** Um módulo puro novo (`web/src/age-curve.js`) aplica um termo de idade sobre a probabilidade **depois** do `calibrationT`, no mesmo ponto onde o `analyzeMatch` já monta a leitura. O motor Elo não muda. A UI só renderiza o que o módulo devolve.

**Tech Stack:** Node 20, ES modules, zero dependências novas. `node:test` + `node:assert/strict` (`npm test` = `node --test`). JS puro no front.

**Spec:** [docs/superpowers/specs/2026-07-17-vies-idade-elo-design.md](../specs/2026-07-17-vies-idade-elo-design.md)

## Global Constraints

- **Português do Brasil** em toda string de UI, nome de teste e mensagem de commit; comentários em pt-BR; **identificadores em inglês**.
- **Zero dependências novas.** `package.json` só tem `exceljs`.
- **Módulos em `web/src/` são puros:** sem DOM, sem import do app. `web/app.js` é o único que toca DOM.
- **Todo módulo puro trata o caso nulo e é testado nele.**
- **Nunca há fallback silencioso.** Sem idade confiável → sem ajuste, e o card não mostra a linha.
- **Regra de clareza (`clareza-zero-duvida`):** o número vai sempre embutido. A probabilidade não muda sem o card dizer por quê e quanto.
- **Só ATP.** A WTA não recebe ajuste — ver a spec.

## Os números, fechados (não são estimativa)

Todos medidos no dataset walk-forward de 99.846 partidas (2018-2026), com o Elo limpo, e validados fora da amostra (treino ≤2023, teste 2024-26, só tour, N=6.618):

| constante | valor | de onde vem |
|---|---|---|
| `AGE_COEF.ATP` | **0.026** | melhor Brier fora da amostra: ganho **+0,00149**, IC95 [0,00077; 0,00223] |
| `AGE_COEF.WTA` | **0** (sem ajuste) | ganho −0,00025, IC95 [−0,00165; 0,00122] — cruza zero |
| escala (`b`) | **1,0 — não mexer** | o fit só-escala deu b=0,977 (ATP) / 1,026 (WTA): a tela **já está calibrada** pelo `calibrationT` |

**Por que `c = 0,026` e não `0,038`** (que era o fit com volume): o `0,038` elimina melhor o viés residual (−1,26pp vs +1,76pp) mas tem **pior Brier** (+0,00119 vs +0,00149) — corrige demais o extremo e paga no geral. O critério da spec é o Brier. O resíduo de +1,76pp é a correção sendo conservadora de propósito.

**Efeito na tela** (confronto 50/50): gap 4 anos → 52,6% · gap 8 anos → 55,2% · gap 13 anos → 58,4%.

---

### Task 1: O módulo da curva de idade

**Files:**
- Create: `web/src/age-curve.js`
- Test: `tests/age-curve.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `ageAdjusted(prob, ageA, ageB, tour) -> { prob, base, delta, gap, adjusted }`
  - `prob` — a probabilidade corrigida de A vencer (ou a original, se não houver ajuste)
  - `base` — a probabilidade antes do ajuste (para o card mostrar "sem o ajuste seria X")
  - `delta` — `prob - base`, em fração (positivo = A ganhou probabilidade)
  - `gap` — `ageB - ageA`, em anos (positivo = A é mais novo)
  - `adjusted` — booleano: houve ajuste?

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/age-curve.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageAdjusted } from '../web/src/age-curve.js';

test('ageAdjusted: o mais novo GANHA probabilidade (o modelo o subestima)', () => {
  // Caso real medido: num par jovem≤23 × veterano≥30 do tour ATP, o modelo dá 49,4%
  // ao mais novo e ele ganha 57,5% — 8,16pp de erro (N=1.976).
  const r = ageAdjusted(0.5, 20, 33, 'ATP'); // A tem 20, B tem 33 -> gap +13
  assert.ok(r.prob > 0.5, `esperava > 0,5, veio ${r.prob}`);
  assert.equal(r.adjusted, true);
  assert.equal(r.gap, 13);
  assert.ok(r.delta > 0, 'o mais novo tem que GANHAR probabilidade');
});

test('ageAdjusted: gap de 13 anos move ~8pp num confronto 50/50', () => {
  const r = ageAdjusted(0.5, 20, 33, 'ATP');
  // sigmoid(logit(0,5) + 0,026*13) = sigmoid(0,338) = 0,5837
  assert.ok(Math.abs(r.prob - 0.584) < 0.005, `esperava ~0,584, veio ${r.prob}`);
  assert.equal(r.base, 0.5);
});

test('ageAdjusted: ANTISSIMETRIA — p(A,B) + p(B,A) = 1 (o teste que pega o intercepto)', () => {
  // Se alguém acrescentar um intercepto, isto quebra: a soma daria 1,0588 e o modelo
  // diria que os dois jogadores somam 105,9% de chance de vencer.
  for (const [pa, ia, ib] of [[0.5, 20, 33], [0.7, 25, 31], [0.35, 34, 22], [0.9, 19, 38]]) {
    const ab = ageAdjusted(pa, ia, ib, 'ATP');
    const ba = ageAdjusted(1 - pa, ib, ia, 'ATP');
    assert.ok(Math.abs(ab.prob + ba.prob - 1) < 1e-9, `p(A,B)+p(B,A)=${ab.prob + ba.prob}, esperava 1`);
  }
});

test('ageAdjusted: mesma idade não mexe em nada', () => {
  const r = ageAdjusted(0.62, 25, 25, 'ATP');
  assert.equal(r.prob, 0.62);
  assert.equal(r.delta, 0);
  assert.equal(r.adjusted, false);
});

test('ageAdjusted: a WTA NÃO é ajustada (a correção não paga fora da amostra)', () => {
  const r = ageAdjusted(0.5, 20, 33, 'WTA');
  assert.equal(r.prob, 0.5);
  assert.equal(r.adjusted, false);
});

test('ageAdjusted: sem idade não há ajuste — e não estoura', () => {
  for (const [a, b] of [[null, 30], [22, null], [null, null], [undefined, 30]]) {
    const r = ageAdjusted(0.5, a, b, 'ATP');
    assert.equal(r.prob, 0.5);
    assert.equal(r.adjusted, false);
  }
});

test('ageAdjusted: probabilidade nula ou inválida devolve null, sem estourar', () => {
  assert.equal(ageAdjusted(null, 20, 33, 'ATP'), null);
  assert.equal(ageAdjusted(undefined, 20, 33, 'ATP'), null);
});

test('ageAdjusted: a probabilidade corrigida nunca chega a 0% nem a 100%', () => {
  const alta = ageAdjusted(0.999, 18, 40, 'ATP');
  const baixa = ageAdjusted(0.001, 40, 18, 'ATP');
  assert.ok(alta.prob < 1, `passou de 100%: ${alta.prob}`);
  assert.ok(baixa.prob > 0, `chegou a 0%: ${baixa.prob}`);
});

test('ageAdjusted: tour desconhecido não é ajustado', () => {
  const r = ageAdjusted(0.5, 20, 33, 'ITF');
  assert.equal(r.adjusted, false);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/age-curve.test.js`
Expected: FAIL — `Cannot find module '../web/src/age-curve.js'`

- [ ] **Step 3: Implementar o mínimo**

Crie `web/src/age-curve.js`:

```js
// Correção do viés de idade do Elo: o modelo subestima o jogador mais novo.
// Função pura. Aplicada DEPOIS do calibrationT, na probabilidade já servida.
//
// O QUE FOI MEDIDO (walk-forward, 99.846 partidas 2018-2026, com o Elo já corrigido
// da ordenação cronológica — commit 317b3a0):
//   par jovem(≤23) × veterano(≥30), tour ATP: o modelo dá 49,4%, a realidade é 57,5%
//   → +8,16pp de erro (N=1.976, IC ±2,18). Com 12+ anos de gap: +10,47pp.
//   Placebo interno nulo (gap 0-2 anos: +0,52pp) e placebo externo nulo (permutando
//   as datas de nascimento 20x: z mediano −0,02). Não é ruído.
//
// TRÊS HIPÓTESES FALSIFICADAS antes de chegar aqui:
//   - K-factor: previa viés pior onde o K é MENOR; o dado diz 2,5x MAIOR onde o K é alto.
//   - Volume de carreira: nulo nos dois tours, e com sinais opostos entre eles.
//   - "Superconfiança": o calibrationT já é essa correção (o fit só-escala dá b=0,977).
//
// ATENÇÃO: estes coeficientes são o ERRO DESTE MODELO, não constantes da natureza.
// Se o K, o prior de entrada (1500) ou a fórmula do Elo mudarem, a medida precisa
// ser REFEITA. Ver docs/superpowers/specs/2026-07-17-vies-idade-elo-design.md.

/** Ganho de logit por ano de diferença de idade, a favor do mais novo.
 *  ATP 0,026: escolhido pelo melhor Brier FORA DA AMOSTRA (treino ≤2023, teste 2024-26,
 *  só tour, N=6.618): ganho +0,00149, IC95 [0,00077; 0,00223].
 *  WTA 0: o viés existe lá (+5,32pp) mas a correção NÃO paga fora da amostra
 *  (ganho −0,00025, IC95 [−0,00165; 0,00122] — cruza zero) e supercorrige os extremos.
 *  Viés existir e correção compensar são perguntas diferentes. */
const AGE_COEF = { ATP: 0.026, WTA: 0 };

/** Diferença de idade mínima para valer o ajuste (evita mexer por causa de arredondamento). */
const MIN_GAP_YEARS = 0.5;

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
// A probabilidade servida nunca é 0 nem 1: o logit estouraria, e "100% de chance" é
// uma afirmação que o modelo não pode fazer.
const clamp = (p) => Math.min(0.9999, Math.max(0.0001, p));

/** Corrige a probabilidade de A vencer pelo viés de idade.
 *  NÃO tem intercepto, de propósito: com um, p(A vs B) + p(B vs A) daria 1,0588 —
 *  os dois jogadores somariam 105,9% de chance de vencer. O intercepto também absorve
 *  o próprio efeito de idade (a₀ ≈ gap médio × coef), e foi esse artefato que fez uma
 *  medição anterior concluir que a correção "piorava" a WTA.
 *  A escala (b) fica em 1,0: o fit só-escala deu 0,977 — a tela já está calibrada.
 *  @returns {{prob, base, delta, gap, adjusted}|null} */
export function ageAdjusted(prob, ageA, ageB, tour) {
  if (prob == null || !Number.isFinite(prob)) return null;
  const semAjuste = { prob, base: prob, delta: 0, gap: null, adjusted: false };

  const coef = AGE_COEF[tour];
  if (!coef) return semAjuste; // WTA (0) ou tour desconhecido (undefined)
  if (!Number.isFinite(ageA) || !Number.isFinite(ageB)) return semAjuste;

  const gap = ageB - ageA; // positivo = A é mais novo
  if (Math.abs(gap) < MIN_GAP_YEARS) return { ...semAjuste, gap };

  const ajustada = sigmoid(logit(clamp(prob)) + coef * gap);
  return { prob: ajustada, base: prob, delta: ajustada - prob, gap, adjusted: true };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/age-curve.test.js`
Expected: PASS — 9 testes

Nota: o teste da antissimetria passa porque não há intercepto e o `clamp` é simétrico em torno de 0,5.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — 271 (os que já existiam) + 9 = 280.

- [ ] **Step 6: Commit**

```bash
git add web/src/age-curve.js tests/age-curve.test.js
git commit -m "feat(modelo): curva de idade — o Elo subestima o mais novo em ate 10pp

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Ligar no confronto

O `analyzeMatch` já recebe tudo o que precisa: `playerA.bio.age`, `playerB.bio.age` e `model.tour`. O ajuste entra logo depois do `calibrationT`, que é o que a spec exige ("pós-hoc, na probabilidade servida").

**Files:**
- Modify: `web/src/analysis.js` (import no topo; `analyzeMatch` na linha ~84-116)
- Test: `tests/analysis.test.js`

**Interfaces:**
- Consumes: `ageAdjusted(prob, ageA, ageB, tour)` (Task 1).
- Produces: `analyzeMatch(...)` passa a devolver, além do que já devolvia, `ageAdjust: {prob, base, delta, gap, adjusted}|null`. O `probA`/`probB`/`fairOddA`/`fairOddB`/`favorite`/`marginLabel` passam a refletir a probabilidade **ajustada**.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao fim de `tests/analysis.test.js`:

```js
import { ageAdjusted } from '../web/src/age-curve.js';

const jovem = { name: 'Jovem A.', elo: 2000, hard: 2000, clay: 2000, grass: 2000, matches: 100, bio: { age: 20 } };
const veterano = { name: 'Veterano B.', elo: 2000, hard: 2000, clay: 2000, grass: 2000, matches: 100, bio: { age: 33 } };

test('analyzeMatch: aplica a curva de idade e conta que aplicou (ATP)', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  // Elos iguais -> 50% cru. Com 13 anos de gap, o mais novo sobe.
  assert.ok(r.probA > 0.5, `esperava > 0,5, veio ${r.probA}`);
  assert.equal(r.ageAdjust.adjusted, true);
  assert.equal(r.ageAdjust.gap, 13);
  assert.ok(r.ageAdjust.base < r.probA, 'a base tem que ser menor que a ajustada');
});

test('analyzeMatch: probA + probB continua 1 depois do ajuste', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  assert.ok(Math.abs(r.probA + r.probB - 1) < 1e-9, `soma deu ${r.probA + r.probB}`);
});

test('analyzeMatch: a odd justa acompanha a probabilidade ajustada', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  assert.ok(Math.abs(r.fairOddA - 1 / r.probA) < 1e-9);
  assert.ok(Math.abs(r.fairOddB - 1 / r.probB) < 1e-9);
});

test('analyzeMatch: o favorito é decidido DEPOIS do ajuste', () => {
  // Elos iguais: sem ajuste ninguém é favorito (50/50). Com o ajuste, o mais novo é.
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  assert.equal(r.favorite, 'Jovem A.');
});

test('analyzeMatch: WTA não é ajustada', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.25, tour: 'WTA' });
  assert.equal(r.ageAdjust.adjusted, false);
  assert.ok(Math.abs(r.probA - 0.5) < 1e-9, `WTA não devia mexer, veio ${r.probA}`);
});

test('analyzeMatch: jogador sem bio não estoura e não ajusta', () => {
  const semBio = { name: 'Sem Bio C.', elo: 2000, hard: 2000, clay: 2000, grass: 2000, matches: 100 };
  const r = analyzeMatch(semBio, veterano, 'hard', { calibrationT: 1.15, tour: 'ATP' });
  assert.equal(r.ageAdjust.adjusted, false);
  assert.ok(Number.isFinite(r.probA));
});

test('analyzeMatch: model sem tour não ajusta (não assume ATP)', () => {
  const r = analyzeMatch(jovem, veterano, 'hard', { calibrationT: 1.15 });
  assert.equal(r.ageAdjust.adjusted, false);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/analysis.test.js`
Expected: FAIL — `r.ageAdjust` é `undefined`

- [ ] **Step 3: Implementar o mínimo**

Em `web/src/analysis.js`, acrescente o import junto dos que já existem no topo:

```js
import { ageAdjusted } from './age-curve.js';
```

E troque o corpo de `analyzeMatch` (a partir da linha ~84) por:

```js
/** Leitura completa do confronto. */
export function analyzeMatch(playerA, playerB, surface, model) {
  const T = model.calibrationT ?? 1;
  const bruta = matchProbability(playerA, playerB, surface, T);
  // Correção do viés de idade — DEPOIS do calibrationT, sobre a probabilidade servida.
  // Só ATP; ver web/src/age-curve.js para os números e o porquê.
  const ageAdjust = ageAdjusted(bruta, playerA.bio?.age, playerB.bio?.age, model.tour);
  const probA = ageAdjust ? ageAdjust.prob : bruta;
  const probB = 1 - probA;
  const favA = probA >= 0.5;

  return {
    surface,
    a: {
      name: playerA.name,
      elo: playerA.elo,
      surfaceElo: playerA[surface] ?? null,
      blended: Math.round(blendedRating(playerA, surface)),
      surfaceRead: surfaceRead(playerA, surface),
    },
    b: {
      name: playerB.name,
      elo: playerB.elo,
      surfaceElo: playerB[surface] ?? null,
      blended: Math.round(blendedRating(playerB, surface)),
      surfaceRead: surfaceRead(playerB, surface),
    },
    probA,
    probB,
    ageAdjust,
    favorite: favA ? playerA.name : playerB.name,
    underdog: favA ? playerB.name : playerA.name,
    favoriteProb: favA ? probA : probB,
    marginLabel: marginLabel(favA ? probA : probB),
    confidence: confidenceLevel(playerA, playerB, surface),
    fairOddA: 1 / probA,
    fairOddB: 1 / probB,
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/analysis.test.js`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — 280 + 7 = 287.

**Se algum teste antigo de `analysis.test.js` quebrar:** provavelmente ele fixa uma probabilidade num fixture que agora tem `bio.age`. Confira se o fixture tem idade nos dois lados; se tiver e a diferença for ≥0,5 ano, a mudança é **esperada** — ajuste a asserção. Se o fixture não tem `bio`, o ajuste não roda e o teste não deveria mudar: nesse caso você quebrou algo.

- [ ] **Step 6: Commit**

```bash
git add web/src/analysis.js tests/analysis.test.js
git commit -m "feat(confronto): aplica a curva de idade na probabilidade servida

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: A linha no card

A regra de clareza do projeto não deixa a probabilidade mudar em silêncio: se o número mexeu, o card diz quanto e por quê.

**Files:**
- Modify: `web/src/age-curve.js` (acrescenta `ageAdjustText`)
- Modify: `web/app.js` (import + a linha no card de leitura do confronto)
- Test: `tests/age-curve.test.js`

**Interfaces:**
- Consumes: `ageAdjusted(...)` (Task 1), `analyzeMatch(...).ageAdjust` (Task 2).
- Produces: `ageAdjustText(ageAdjust, nomeMaisNovo) -> string|null`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao fim de `tests/age-curve.test.js`:

```js
import { ageAdjustText } from '../web/src/age-curve.js';

test('ageAdjustText: diz quanto ajustou e qual seria a probabilidade sem o ajuste', () => {
  const a = ageAdjusted(0.5, 20, 33, 'ATP');
  const t = ageAdjustText(a, 'Fonseca J.');
  assert.ok(t.includes('13 anos'), t);
  assert.ok(t.includes('Fonseca J.'), t);
  assert.ok(t.includes('50,0%'), t); // a probabilidade sem o ajuste
});

test('ageAdjustText: sem ajuste não gera linha', () => {
  assert.equal(ageAdjustText(ageAdjusted(0.5, 25, 25, 'ATP'), 'A B'), null);
  assert.equal(ageAdjustText(ageAdjusted(0.5, 20, 33, 'WTA'), 'A B'), null);
  assert.equal(ageAdjustText(null, 'A B'), null);
});

test('ageAdjustText: arredonda a idade — "13 anos", não "12,7 anos"', () => {
  const t = ageAdjustText(ageAdjusted(0.5, 20.1, 32.8, 'ATP'), 'A B');
  assert.ok(t.includes('13 anos'), t);
  assert.ok(!t.includes('12,7'), t);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- tests/age-curve.test.js`
Expected: FAIL — `ageAdjustText is not a function`

- [ ] **Step 3: Implementar o mínimo**

Acrescente a `web/src/age-curve.js`:

```js
/** 0.5837 -> "58,4%" (uma casa, vírgula decimal do pt-BR). */
const pct = (p) => `${(p * 100).toFixed(1).replace('.', ',')}%`;

/** A linha que explica o ajuste no card. null quando não houve ajuste.
 *  A regra de clareza do projeto não deixa a probabilidade mudar em silêncio:
 *  o número mexeu, então o card diz quanto, por quê, e qual era antes. */
export function ageAdjustText(ageAdjust, nomeMaisNovo) {
  if (!ageAdjust || !ageAdjust.adjusted) return null;
  const anos = Math.abs(Math.round(ageAdjust.gap));
  return `Ajustado por idade: ${anos} anos de diferença — medimos que o modelo subestima o mais novo em confrontos assim, e o ${nomeMaisNovo} leva a correção. Sem o ajuste: ${pct(ageAdjust.base)}.`;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- tests/age-curve.test.js`
Expected: PASS — 13 testes

- [ ] **Step 5: Ligar no card do confronto**

Em `web/app.js`, acrescente ao import de `analysis` (ou crie um import novo, junto dos outros do topo):

```js
import { ageAdjustText } from './src/age-curve.js';
```

Em `renderReading()` (linha 1254), o resultado do `analyzeMatch` está na variável **`r`** — o `anal` é o estado global da tela, não o resultado. Insira logo **depois** de `${playerRow(r.b, ...)}` (linha 1275) e **antes** de `${renderH2H()}` (linha 1277):

```js
        ${(() => {
          if (!r.ageAdjust?.adjusted) return '';
          const maisNovo = r.ageAdjust.gap > 0 ? r.a.name : r.b.name;
          const txt = ageAdjustText(r.ageAdjust, maisNovo);
          return txt ? `<div class="field-hint" style="margin-top:8px">${txt}</div>` : '';
        })()}
      </div>
```

**Atenção ao fechamento:** a linha 1276 já fecha a `<div class="reading-players">`. O trecho acima entra **dentro** dela (depois do `playerRow` do B), então o `</div>` do exemplo **substitui** o que já está lá — não acrescente um segundo. Leia as linhas 1273-1277 antes de colar.

- [ ] **Step 6: Ver no app de verdade**

Não basta o teste passar — carregue o app real (é regra registrada do projeto).

Run: `npm run dev` (em background). Abra `http://localhost:5173/index.html`.

O app pede login e **você não deve inserir credenciais**. Verifique renderizando o texto com dados reais em vez disso:

```bash
node --input-type=module -e "
import { analyzeMatch } from './web/src/analysis.js';
import { ageAdjustText } from './web/src/age-curve.js';
import { readFileSync } from 'node:fs';
const m = JSON.parse(readFileSync('web/model-atp.json','utf8'));
const acha = (n) => m.players.find(p => p.name === n);
// dois confrontos reais com diferenca grande de idade
for (const [na, nb] of [['Fonseca J.','Djokovic N.'], ['Tien L.','Monfils G.']]) {
  const a = acha(na), b = acha(nb);
  if (!a || !b || !a.bio || !b.bio) { console.log('pulei ' + na + ' x ' + nb); continue; }
  const r = analyzeMatch(a, b, 'hard', m);
  console.log(na + ' (' + a.bio.age + 'a) x ' + nb + ' (' + b.bio.age + 'a)');
  console.log('  probA: ' + (100*r.probA).toFixed(1) + '%  (sem ajuste: ' + (100*r.ageAdjust.base).toFixed(1) + '%)');
  const maisNovo = r.ageAdjust.gap > 0 ? r.a.name : r.b.name;
  console.log('  card: ' + ageAdjustText(r.ageAdjust, maisNovo));
}
"
```

Confira: a probabilidade do mais novo subiu, o texto traz os anos de diferença e a probabilidade sem o ajuste, e a frase está em português correto.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — 287 + 4 = 291.

- [ ] **Step 8: Commit**

```bash
git add web/src/age-curve.js tests/age-curve.test.js web/app.js
git commit -m "feat(confronto): o card explica o ajuste de idade e mostra a probabilidade sem ele

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: A grade do dia

O `fixtures.js:64` já chama o `analyzeMatch`, então a **probabilidade** da grade já sai ajustada pela Task 2. Mas ele monta o objeto do jogo copiando campo a campo (`probA: r.probA`, linha 73) — o `ageAdjust` **não** vai junto sozinho. Sem ele, a grade mostraria o número corrigido sem poder explicar por quê, e o card do confronto explicaria: dois comportamentos para o mesmo jogo.

**Files:**
- Modify: `pipeline/fixtures.js:64-80` (o objeto do jogo)
- Verify: `web/today.json` (regerado)

**Interfaces:**
- Consumes: `analyzeMatch(...).ageAdjust` (Task 2).
- Produces: `today.json` com `ageAdjust` em cada jogo ajustado.

- [ ] **Step 1: Ler o trecho antes de mexer**

Run: `sed -n '60,85p' pipeline/fixtures.js`

Confirme onde está o `probA: r.probA` e como o objeto do jogo é montado. **Se o `analyzeMatch` não estiver lá** (linha ~64), PARE e reporte — a grade estaria recalculando a probabilidade por conta própria e ficaria sem o ajuste.

- [ ] **Step 2: Incluir o ageAdjust no objeto do jogo**

Junto de `probA: r.probA`, acrescente:

```js
      // Só quando houve ajuste — evita um campo null em todo jogo do JSON que o
      // celular baixa. O card da grade usa isto para explicar por que a
      // probabilidade mudou (ver ageAdjustText em web/src/age-curve.js).
      ...(r.ageAdjust?.adjusted ? { ageAdjust: r.ageAdjust } : {}),
```

- [ ] **Step 3: Regerar a grade**

Run: `node pipeline/fixtures.js`
Expected: escreve o `web/today.json` sem erro.

- [ ] **Step 4: Conferir o efeito na grade real**

```bash
node -e "
const t = require('./web/today.json');
const jogos = t.matches || t.games || [];
console.log('grade: ' + jogos.length + ' jogos | fonte: ' + t.source);
const comAjuste = jogos.filter(j => j.ageAdjust && j.ageAdjust.adjusted);
console.log('com ajuste de idade: ' + comAjuste.length + ' de ' + jogos.length);
comAjuste.slice(0,5).forEach(j =>
  console.log('  ' + j.a + ' x ' + j.b + ': ' + (100*j.probA).toFixed(1) + '% (sem ajuste ' + (100*j.ageAdjust.base).toFixed(1) + '%, gap ' + Math.abs(Math.round(j.ageAdjust.gap)) + 'a)'));
const semIdade = jogos.filter(j => !j.ageAdjust).length;
console.log('sem ajuste (mesma idade, WTA, ou sem bio): ' + semIdade);
"
```

Esperado: alguns jogos com ajuste; nos ajustados, `probA` diferente de `ageAdjust.base`. Se **nenhum** jogo tiver ajuste, investigue — na grade de um dia típico ~21% dos jogos ATP têm gap ≥8 anos.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — 291.

- [ ] **Step 6: Commit**

```bash
git add pipeline/fixtures.js web/today.json
git commit -m "feat(grade): o today.json leva o ajuste de idade, para o card poder explicar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm test` — 291 testes passando
- [ ] A antissimetria vale: `p(A,B) + p(B,A) = 1` em todos os casos testados
- [ ] A WTA não é ajustada (`AGE_COEF.WTA = 0`)
- [ ] O card mostra a linha do ajuste, com os anos e a probabilidade sem ele
- [ ] A grade do dia (`today.json`) e o card do confronto mostram **a mesma** probabilidade
- [ ] O comentário do `age-curve.js` diz que os coeficientes são o erro DESTE modelo e precisam ser refeitos se o Elo mudar

## O que este plano NÃO faz (registrado na spec)

- **A WTA.** O viés existe (+5,32pp) mas a correção não paga fora da amostra e supercorrige os extremos.
- **O K-factor.** Falsificado: o viés é 2,5× maior onde o K é alto.
- **A "superconfiança".** O `calibrationT` já faz; aplicar de novo dobraria.
- **Decay por inatividade.** Real (voltar de 180+ dias: −6,78pp, quase todo em veteranos), mas não medeia o viés de idade — carrega 5%. Outra spec.
- **O nível do torneio na grade.** O `flashscore.js:13` descarta o nível e Challenger/ITF aparecem como "ATP"/"WTA". Bug real, outra spec.
