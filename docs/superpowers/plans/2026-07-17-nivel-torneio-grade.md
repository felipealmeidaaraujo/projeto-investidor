# Nível do Torneio na Grade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar o nível do torneio (`tour`/`challenger`) no parser do Flashscore, exibir "Challenger" na grade e gatear a curva de idade por nível — com a supressão do ajuste explicada quando ocorre.

**Architecture:** O `level` nasce no parser (`flashscore.js`), atravessa o pipeline (`fixtures.js` → `today.json`) e a UI (`app.js`), e alimenta o gate da idade em `analyzeMatch`. ITF/exhibition/teams são filtrados no parser. O gate vive em `analyzeMatch`; a função pura `ageAdjusted` fica intacta. A supressão do ajuste (quando barrado por ser Challenger) é registrada em `ageSuppressed` e explicada por `ageSuppressedText`.

**Tech Stack:** JavaScript ESM puro, `node --test` (node:test + node:assert/strict), sem dependências novas. UI é DOM imperativo em `web/app.js` (sem framework), verificada no navegador.

## Global Constraints

- **Idioma da UI e das mensagens:** português do Brasil. Percentuais com vírgula decimal e uma casa (ex.: `8,4 pp`), como o `pct`/`ageAdjustText` já fazem.
- **Regra de clareza (zero-dúvida):** nada de selo enigmático; todo rótulo é auto-explicativo. "Challenger" e "ajuste suspenso (Challenger)" são texto claro.
- **Contrato de `analyzeMatch(...).ageAdjust`:** sempre um objeto quando a probabilidade é válida, com `adjusted: true|false` — nunca `null` nesses casos. Os testes existentes leem `r.ageAdjust.adjusted` sem optional chaining; não quebrar isso.
- **Curva de idade só na ATP:** `AGE_COEF = { ATP: 0.026, WTA: 0 }`. O gate por nível é uma restrição ADICIONAL (nível `tour`), não substitui a regra por circuito.
- **Nível efetivo (fallback):** `level ?? (algum jogador '.level' === 'challenger' ? 'challenger' : 'tour')`. Ausência de `.level` conta como tour (retrocompat).
- **Comando de teste:** um arquivo → `node --test tests/<arquivo>.test.js`; suíte toda → `npm test`.

---

## Arquivos tocados

- `pipeline/flashscore.js` — Tasks 1, 2 (captura e filtro de nível)
- `tests/flashscore.test.js` — Tasks 1, 2 (testes do parser)
- `web/src/analysis.js` — Task 3 (gate + sombra em `analyzeMatch`)
- `tests/analysis.test.js` — Task 3 (testes do gate)
- `web/src/age-curve.js` — Task 4 (`ageSuppressedText` + comentário)
- `tests/age-curve.test.js` — Task 4 (testes do texto)
- `pipeline/fixtures.js` — Task 5 (propagação ao `today.json`)
- `web/app.js` — Tasks 6, 7 (grade e coerência grade→detalhe)

---

### Task 1: Capturar o nível em `parseTournamentHeader`

**Files:**
- Modify: `pipeline/flashscore.js:8-25` (função `parseTournamentHeader`)
- Test: `tests/flashscore.test.js`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `parseTournamentHeader(za)` passa a devolver `{ tour, level, singles, surface, tournament }`, onde `level ∈ {'tour','challenger','itf','other'}`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `tests/flashscore.test.js`:

```js
test('parseTournamentHeader: nível — challenger, itf, tour e outros', () => {
  assert.equal(parseTournamentHeader('CHALLENGER MEN - SINGLES: Granby (Canada), hard').level, 'challenger');
  assert.equal(parseTournamentHeader('ATP - SINGLES: Gstaad (Switzerland), clay').level, 'tour');
  assert.equal(parseTournamentHeader('WTA - SINGLES: Athens (Greece), hard').level, 'tour');
  assert.equal(parseTournamentHeader('ITF MEN - SINGLES: M15 Gubbio (Italy), clay').level, 'itf');
  assert.equal(parseTournamentHeader('EXHIBITION - MEN: UTS Championship (World), clay').level, 'other');
});

test('parseTournamentHeader: o nível não atrapalha o gênero (Challenger/ITF WOMEN = WTA)', () => {
  const ch = parseTournamentHeader('CHALLENGER WOMEN - SINGLES: Rome (Italy), clay');
  assert.equal(ch.tour, 'WTA');
  assert.equal(ch.level, 'challenger');
  const itf = parseTournamentHeader('ITF MEN - SINGLES: M15 Gubbio (Italy), clay');
  assert.equal(itf.tour, 'ATP');
  assert.equal(itf.level, 'itf');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/flashscore.test.js`
Expected: FAIL — os dois testes novos falham em `level` (undefined `!== 'challenger'` etc.).

- [ ] **Step 3: Implementar a detecção de nível**

Em `pipeline/flashscore.js`, dentro de `parseTournamentHeader`, logo após a linha `const tour = /women|wta|girls|ladies/i.test(cat) ? 'WTA' : 'ATP';`, inserir:

```js
  const level =
    /challenger/i.test(cat) ? 'challenger' :
    /itf/i.test(cat) ? 'itf' :
    /\b(atp|wta)\b/i.test(cat) ? 'tour' :
    'other';
```

E trocar o `return` da função por:

```js
  return { tour, level, singles, surface, tournament };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/flashscore.test.js`
Expected: PASS — todos os testes do arquivo (novos e antigos) passam.

- [ ] **Step 5: Commit**

```bash
git add pipeline/flashscore.js tests/flashscore.test.js
git commit -m "feat(flashscore): parseTournamentHeader captura o nível do torneio"
```

---

### Task 2: Filtrar por nível em `parseFeed`

**Files:**
- Modify: `pipeline/flashscore.js:35-66` (const `ACTIVE` e função `parseFeed`)
- Test: `tests/flashscore.test.js`

**Interfaces:**
- Consumes: `parseTournamentHeader(...).level` da Task 1.
- Produces: `parseFeed(text)` emite apenas jogos de `level ∈ {tour, challenger}` e cada jogo emitido ganha o campo `level`. Descarta ITF, exhibition, teams — mesmo quando marcados como singles.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `tests/flashscore.test.js`:

```js
const FEED_NIVEIS = [
  '~ZA÷ATP - SINGLES: Gstaad (Switzerland), clay',
  '~AA÷t1', 'AD÷1784106600', 'AB÷1', 'AE÷Tour A.', 'AF÷Tour B.',
  '~ZA÷CHALLENGER MEN - SINGLES: Granby (Canada), hard',
  '~AA÷c1', 'AD÷1784106600', 'AB÷1', 'AE÷Chall A.', 'AF÷Chall B.',
  '~ZA÷ITF MEN - SINGLES: M15 Gubbio (Italy), clay',
  '~AA÷i1', 'AD÷1784106600', 'AB÷1', 'AE÷Itf A.', 'AF÷Itf B.',
  '~ZA÷EXHIBITION - MEN: UTS Championship (World), clay',
  '~AA÷e1', 'AD÷1784106600', 'AB÷1', 'AE÷Exib A.', 'AF÷Exib B.',
].join('¬');

test('parseFeed: emite tour+challenger com o campo level, descarta ITF e exhibition', () => {
  const jogos = parseFeed(FEED_NIVEIS);
  assert.deepEqual(jogos.map((j) => j.level), ['tour', 'challenger']);
  assert.deepEqual(
    jogos.map((j) => `${j.a} vs ${j.b}`),
    ['Tour A. vs Tour B.', 'Chall A. vs Chall B.']
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/flashscore.test.js`
Expected: FAIL — o ITF entra na lista (hoje não é filtrado) e/ou `j.level` é undefined.

- [ ] **Step 3: Implementar o filtro e o campo**

Em `pipeline/flashscore.js`, logo após `const ACTIVE = new Set(['SCHEDULED', 'IN_PROGRESS']);`, adicionar:

```js
const GRADE_LEVELS = new Set(['tour', 'challenger']);
```

Dentro de `parseFeed`, trocar o corpo do `flush` por:

```js
  const flush = () => {
    if (cur && th && th.singles && GRADE_LEVELS.has(th.level) && ACTIVE.has(cur.status) && cur.a && cur.b) {
      out.push({
        tour: th.tour, level: th.level, tournament: th.tournament, surface: th.surface,
        status: cur.status, commence: cur.commence, a: cur.a, b: cur.b,
      });
    }
  };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/flashscore.test.js`
Expected: PASS — todos os testes do arquivo passam (os antigos `parseFeed` continuam verdes: o `FEED` original só tem tour+challenger).

- [ ] **Step 5: Commit**

```bash
git add pipeline/flashscore.js tests/flashscore.test.js
git commit -m "feat(flashscore): parseFeed filtra ITF/exibição e carrega o nível"
```

---

### Task 3: Gate por nível + sombra em `analyzeMatch`

**Files:**
- Modify: `web/src/analysis.js:85-122` (função `analyzeMatch`)
- Test: `tests/analysis.test.js`

**Interfaces:**
- Consumes: `ageAdjusted(prob, ageA, ageB, tour)` (inalterada) de `web/src/age-curve.js`.
- Produces: `analyzeMatch(playerA, playerB, surface, model, level?)` — 5º parâmetro opcional `level` (nível do torneio). O objeto retornado ganha `ageSuppressed: { gap, wouldDelta } | null`. `ageAdjust` continua sempre objeto (`adjusted: true|false`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `tests/analysis.test.js` (os fixtures `jovem` e `veterano` já existem no arquivo, linhas ~130-131):

```js
test('analyzeMatch: level="challenger" barra o ajuste e registra a sombra', () => {
  const m = { calibrationT: 1.15, tour: 'ATP' };
  const r = analyzeMatch(jovem, veterano, 'hard', m, 'challenger');
  assert.equal(r.ageAdjust.adjusted, false);
  assert.ok(Math.abs(r.probA - 0.5) < 1e-9, `challenger não devia mexer, veio ${r.probA}`);
  assert.ok(r.ageSuppressed, 'devia registrar a sombra');
  assert.equal(r.ageSuppressed.gap, 13);
  assert.ok(r.ageSuppressed.wouldDelta > 0, 'a sombra a favor do mais novo é positiva');
});

test('analyzeMatch: level="tour" mantém o ajuste (igual a hoje)', () => {
  const m = { calibrationT: 1.15, tour: 'ATP' };
  const r = analyzeMatch(jovem, veterano, 'hard', m, 'tour');
  assert.equal(r.ageAdjust.adjusted, true);
  assert.equal(r.ageSuppressed, null);
  assert.ok(r.probA > 0.5);
});

test('analyzeMatch: sem level, um jogador challenger barra o ajuste', () => {
  const m = { calibrationT: 1.15, tour: 'ATP' };
  const r = analyzeMatch(jovem, { ...veterano, level: 'challenger' }, 'hard', m);
  assert.equal(r.ageAdjust.adjusted, false);
  assert.ok(r.ageSuppressed);
  assert.equal(r.ageSuppressed.gap, 13);
});

test('analyzeMatch: sem level, jogadores de tour ajustam', () => {
  const m = { calibrationT: 1.15, tour: 'ATP' };
  const r = analyzeMatch({ ...jovem, level: 'tour' }, { ...veterano, level: 'tour' }, 'hard', m);
  assert.equal(r.ageAdjust.adjusted, true);
  assert.equal(r.ageSuppressed, null);
});

test('analyzeMatch: challenger sem gap de idade não gera sombra', () => {
  const m = { calibrationT: 1.15, tour: 'ATP' };
  const mesmaIdade = { ...veterano, bio: { age: 20 } }; // igual ao jovem
  const r = analyzeMatch(jovem, mesmaIdade, 'hard', m, 'challenger');
  assert.equal(r.ageAdjust.adjusted, false);
  assert.equal(r.ageSuppressed, null);
});

test('analyzeMatch: challenger na WTA não gera sombra (WTA nunca ajusta)', () => {
  const m = { calibrationT: 1.25, tour: 'WTA' };
  const r = analyzeMatch(jovem, veterano, 'hard', m, 'challenger');
  assert.equal(r.ageAdjust.adjusted, false);
  assert.equal(r.ageSuppressed, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/analysis.test.js`
Expected: FAIL — `analyzeMatch` ignora o 5º parâmetro; `r.ageSuppressed` é undefined e o challenger ainda ajusta.

- [ ] **Step 3: Reescrever `analyzeMatch`**

Substituir a função `analyzeMatch` inteira (`web/src/analysis.js:85-122`) por:

```js
/** Leitura completa do confronto.
 *  `level` (opcional) é o nível do torneio ('tour'|'challenger'); quando ausente,
 *  deriva do nível dos jogadores. A curva de idade só roda em nível 'tour'. */
export function analyzeMatch(playerA, playerB, surface, model, level) {
  const T = model.calibrationT ?? 1;
  const bruta = matchProbability(playerA, playerB, surface, T);

  // Nível efetivo: o do torneio quando informado (grade); senão, deriva do nível dos jogadores.
  // Barra o ajuste só se ALGUM jogador for explicitamente 'challenger' — quem não tem o campo
  // (fixture de teste, jogador custom) conta como tour, preservando o comportamento anterior.
  const nivelEfetivo =
    level ?? (playerA.level === 'challenger' || playerB.level === 'challenger' ? 'challenger' : 'tour');
  const aplicaIdade = nivelEfetivo === 'tour';

  // A "sombra": o ajuste que o modelo faria no tour. Calculado sempre, para explicar a supressão.
  const shadow = ageAdjusted(bruta, playerA.bio?.age, playerB.bio?.age, model.tour);

  let probA, ageAdjust, ageSuppressed;
  if (aplicaIdade || !shadow?.adjusted) {
    // Aplica normalmente (tour), ou não havia ajuste de qualquer forma (WTA, mesma idade, sem bio).
    ageAdjust = shadow;
    probA = shadow ? shadow.prob : bruta;
    ageSuppressed = null;
  } else {
    // Havia ajuste (ATP + gap), mas o nível Challenger o barra: suprime e guarda a sombra.
    probA = bruta;
    ageAdjust = { prob: bruta, base: bruta, delta: 0, gap: shadow.gap, adjusted: false };
    ageSuppressed = { gap: shadow.gap, wouldDelta: shadow.delta };
  }
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
    ageSuppressed,
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

- [ ] **Step 4: Rodar e ver passar (inclui os testes antigos de idade)**

Run: `node --test tests/analysis.test.js`
Expected: PASS — os 6 testes novos passam E os antigos (linhas 133-175) continuam verdes: chamados sem `level`, com jogadores sem `.level`, caem em `nivelEfetivo='tour'` e mantêm o comportamento anterior.

- [ ] **Step 5: Commit**

```bash
git add web/src/analysis.js tests/analysis.test.js
git commit -m "feat(analise): gate da curva de idade por nível do torneio + sombra da supressão"
```

---

### Task 4: `ageSuppressedText` + atualizar o comentário de extrapolação

**Files:**
- Modify: `web/src/age-curve.js:20-29` (comentário do `AGE_COEF`) e fim do arquivo (nova função)
- Test: `tests/age-curve.test.js`

**Interfaces:**
- Consumes: o objeto `ageSuppressed = { gap, wouldDelta }` produzido por `analyzeMatch` (Task 3).
- Produces: `ageSuppressedText(ageSuppressed, nomeMaisNovo)` → string explicativa, ou `null` quando `ageSuppressed` é nulo.

- [ ] **Step 1: Escrever os testes que falham**

No topo de `tests/age-curve.test.js`, trocar o import por:

```js
import { ageAdjusted, ageAdjustText, ageSuppressedText } from '../web/src/age-curve.js';
```

Adicionar ao fim do arquivo:

```js
test('ageSuppressedText: explica a supressão com anos e magnitude, nomeando o mais novo', () => {
  const t = ageSuppressedText({ gap: 13, wouldDelta: 0.084 }, 'Fonseca J.');
  assert.ok(t.includes('13 anos'), t);
  assert.ok(t.includes('Fonseca J.'), t);
  assert.ok(t.includes('8,4 pp'), t);
  assert.ok(t.includes('Challenger'), t);
});

test('ageSuppressedText: usa a magnitude absoluta (gap e delta negativos)', () => {
  const t = ageSuppressedText({ gap: -3, wouldDelta: -0.017 }, 'Merida D.');
  assert.ok(t.includes('3 anos'), t);
  assert.ok(t.includes('1,7 pp'), t);
});

test('ageSuppressedText: sem supressão não gera linha', () => {
  assert.equal(ageSuppressedText(null, 'A B'), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/age-curve.test.js`
Expected: FAIL — `ageSuppressedText` não existe (ImportError / não é função).

- [ ] **Step 3: Implementar a função**

Adicionar ao fim de `web/src/age-curve.js`:

```js
/** A linha que explica por que o ajuste de idade NÃO foi aplicado (nível Challenger).
 *  Simétrica a ageAdjustText: só existe quando o ajuste TERIA ocorrido (ATP + gap).
 *  null quando não houve supressão. */
export function ageSuppressedText(ageSuppressed, nomeMaisNovo) {
  if (!ageSuppressed) return null;
  const anos = Math.abs(Math.round(ageSuppressed.gap));
  const pp = `${(Math.abs(ageSuppressed.wouldDelta) * 100).toFixed(1).replace('.', ',')} pp`;
  return `Ajuste de idade não aplicado: ${anos} anos de diferença — no tour o modelo corrigiria a favor do ${nomeMaisNovo} em ~${pp}, mas este é um Challenger, nível onde a correção nunca foi validada (o Elo de Challenger é menos calibrado). A probabilidade acima está sem esse ajuste.`;
}
```

- [ ] **Step 4: Atualizar o comentário de extrapolação (agora resolvido)**

Em `web/src/age-curve.js`, substituir as 4 linhas do comentário do `AGE_COEF` que hoje dizem "extrapolação conhecida" (`ATENÇÃO — extrapolação conhecida: ...` até `... assim que o campo de torneio trouxer essa informação.`) por:

```js
 *  Validado SÓ no nível TOUR (ATP principal). O gate por nível vive em analyzeMatch
 *  (web/src/analysis.js): em Challenger o ajuste é SUPRIMIDO, e a supressão é explicada
 *  na tela (ageSuppressedText). Ver docs/superpowers/specs/2026-07-17-nivel-torneio-grade-design.md. */
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/age-curve.test.js`
Expected: PASS — os 3 testes novos passam; os antigos continuam verdes.

- [ ] **Step 6: Commit**

```bash
git add web/src/age-curve.js tests/age-curve.test.js
git commit -m "feat(idade): texto que explica a supressão do ajuste em Challenger"
```

---

### Task 5: Propagar o nível no `fixtures.js` → `today.json`

**Files:**
- Modify: `pipeline/fixtures.js:28` (map do fallback ESPN), `:64` (chamada `analyzeMatch`), `:65-86` (push do match)

**Interfaces:**
- Consumes: `parseFeed(...)` com `level` (Task 2); `analyzeMatch(..., level)` com `ageSuppressed` (Task 3).
- Produces: cada match do `today.json` ganha `level` e, quando houver, `ageSuppressed`. O fallback ESPN marca `level: 'tour'`.

> **Nota de teste:** `fixtures.js` é um script de IO (fetch de rede) sem teste unitário no projeto — a lógica testável já está coberta nas Tasks 2 e 3. Esta task é fiação, verificada rodando o pipeline real e inspecionando o `today.json`.

- [ ] **Step 1: Passar o nível ao `analyzeMatch`**

Em `pipeline/fixtures.js:64`, trocar:

```js
    const r = analyzeMatch(pa, pb, g.surface, model);
```

por:

```js
    const r = analyzeMatch(pa, pb, g.surface, model, g.level);
```

- [ ] **Step 2: Gravar `level` e `ageSuppressed` no match**

No objeto empurrado em `out.matches.push({ ... })` (`pipeline/fixtures.js:65-86`), adicionar `level: g.level,` logo após `tour: g.tour,`, e incluir a `ageSuppressed` condicional logo após o bloco de `ageAdjust` (que hoje é `...(r.ageAdjust?.adjusted ? { ageAdjust: r.ageAdjust } : {}),`):

```js
      tour: g.tour,
      level: g.level,
      tournament: g.tournament,
```

e, após o spread de `ageAdjust`:

```js
      ...(r.ageAdjust?.adjusted ? { ageAdjust: r.ageAdjust } : {}),
      ...(r.ageSuppressed ? { ageSuppressed: r.ageSuppressed } : {}),
```

- [ ] **Step 3: Marcar o fallback ESPN como tour**

Em `pipeline/fixtures.js:28`, trocar:

```js
      jogos = jogos.concat(g.map((x) => ({ ...x, a: x.aFull, b: x.bFull })));
```

por:

```js
      jogos = jogos.concat(g.map((x) => ({ ...x, a: x.aFull, b: x.bFull, level: 'tour' })));
```

- [ ] **Step 4: Rodar o pipeline e inspecionar o `today.json`**

Run: `node pipeline/fixtures.js`
Depois:

```bash
node --input-type=module -e '
import { readFile } from "node:fs/promises";
const t = JSON.parse(await readFile(new URL("./web/today.json", `file://${process.cwd()}/`)));
const semLevel = t.matches.filter((m) => !m.level);
const challAjustado = t.matches.filter((m) => m.level === "challenger" && m.ageAdjust?.adjusted);
const suprimidos = t.matches.filter((m) => m.ageSuppressed);
console.log("total:", t.matches.length);
console.log("sem level (deve ser 0):", semLevel.length);
console.log("challenger com ajuste aplicado (deve ser 0):", challAjustado.length);
console.log("supressões registradas:", suprimidos.length, suprimidos.map((m) => `${m.a} vs ${m.b}`));
console.log("níveis presentes:", [...new Set(t.matches.map((m) => m.level))]);
'
```

Expected: `sem level: 0`, `challenger com ajuste aplicado: 0`. Os níveis presentes são `['tour','challenger']` (ITF não aparece). Se houver Challenger ATP com idade discrepante no dia, `suprimidos` lista esses jogos.

> Se a rede estiver indisponível e o Flashscore falhar, o pipeline cai no fallback ESPN (só tour) — nesse caso `níveis presentes: ['tour']` e `supressões: 0`, o que ainda é válido. Repetir quando a fonte voltar.

- [ ] **Step 5: Commit**

```bash
git add pipeline/fixtures.js web/today.json
git commit -m "feat(grade): today.json leva o nível do torneio e a supressão do ajuste"
```

---

### Task 6: Selo "Challenger" e "ajuste suspenso" na grade

**Files:**
- Modify: `web/app.js:868-882` (função `renderFixtures`, montagem de cada linha)

**Interfaces:**
- Consumes: `g.level` e `g.ageSuppressed` do `today.json` (Task 5).
- Produces: rótulo `ATP · Challenger · saibro` quando `level==='challenger'`; selo `⚖ ajuste suspenso (Challenger)` quando há `ageSuppressed`.

> **Nota de teste:** `app.js` é UI DOM sem suíte de teste no projeto (regra do projeto: lógica pura testada, UI verificada no navegador real). Verificação via preview.

- [ ] **Step 1: Adicionar o rótulo de nível e o selo de supressão**

Em `web/app.js`, dentro do `.map((g, i) => { ... })` de `renderFixtures`, logo após a linha do `ageBadge` (`const ageBadge = g.ageAdjust?.adjusted ? ...`), adicionar:

```js
      const nivelLabel = g.level === 'challenger' ? ' · Challenger' : '';
      const ageSuppressBadge = g.ageSuppressed ? ` <span class="field-hint">⚖ ajuste suspenso (Challenger)</span>` : '';
```

Trocar a linha do `fx-top` (hoje `<span class="fx-tour">${g.tour} · ${SURFACE_PT[g.surface] || g.surface}</span>`) por:

```js
        <div class="fx-top"><span class="fx-players">${flag}${g.a} vs ${g.b}</span><span class="fx-tour">${g.tour}${nivelLabel} · ${SURFACE_PT[g.surface] || g.surface}</span></div>
```

E trocar a linha do `fx-sub` (hoje termina em `...confiança ${g.confidence}${ageBadge}</div>`) por:

```js
        <div class="fx-sub">Favorito: <strong>${g.favorite}</strong> ${favPct}% · ${g.marginLabel} · confiança ${g.confidence}${ageBadge}${ageSuppressBadge}</div>
```

- [ ] **Step 2: Verificar no navegador**

Iniciar o preview do app (dev server em `.claude/launch.json` — `npm run dev`, `scripts/serve.mjs`) e abrir `index.html`. Na tela de Análise, com o `today.json` da Task 5:
- Um jogo de Challenger mostra `ATP · Challenger · saibro` (ou `WTA · Challenger · …`).
- Um jogo de tour continua `ATP · saibro`, sem "Challenger".
- Onde houver `ageSuppressed`, aparece `⚖ ajuste suspenso (Challenger)` na linha de baixo.

Confirmar com `read_page` / screenshot: o texto "Challenger" aparece só nos jogos certos. Se o dia não tiver Challenger, checar via console do navegador que `todayData.matches.some(m => m.level==='challenger')` reflete o `today.json`.

- [ ] **Step 3: Commit**

```bash
git add web/app.js
git commit -m "feat(grade): sinaliza Challenger e o ajuste de idade suspenso na grade"
```

---

### Task 7: Coerência grade→detalhe + a frase de supressão no card

**Files:**
- Modify: `web/app.js:16` (import), `:780-784` (estado `anal`), `:847-855` (`switchTour`), `:887-902` (`pickFixture`), `:944-945` (pickers manuais), `:953` e `:1257` (chamadas `analyzeMatch`), `:1275-1284` (bloco de texto no card)

**Interfaces:**
- Consumes: `analyzeMatch(..., level)` e `ageSuppressed` (Task 3); `ageSuppressedText` (Task 4); `game.level` do `today.json` (Task 5).
- Produces: `anal.level` acompanha o jogo aberto da grade; o card de detalhe mostra a frase de supressão quando há `ageSuppressed`.

> **Nota de teste:** UI DOM — verificação no navegador (padrão do projeto). O invariante-chave a checar: grade e detalhe do mesmo jogo concordam sobre ter havido/suprimido ajuste.

- [ ] **Step 1: Importar `ageSuppressedText`**

Em `web/app.js:16`, trocar:

```js
import { ageAdjustText } from './src/age-curve.js';
```

por:

```js
import { ageAdjustText, ageSuppressedText } from './src/age-curve.js';
```

- [ ] **Step 2: Adicionar `level` ao estado `anal`**

Em `web/app.js:780-784`, no objeto `const anal = { ... }`, adicionar `level: null,` (p.ex. logo após `surface: 'hard',`):

```js
const anal = {
  tour: 'ATP', models: {}, model: null, loadingTour: null, a: null, b: null, surface: 'hard', level: null,
  explainOpen: false, moreOpen: false,
  live: { active: false, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3, mktA: null, mktB: null },
};
```

- [ ] **Step 3: `pickFixture` guarda o nível do jogo da grade**

Em `web/app.js:894-899`, dentro do `if (m && !m.error) { ... }`, adicionar `anal.level = game.level ?? null;`:

```js
  if (m && !m.error) {
    anal.a = m.players.find((p) => p.name === game.a) || null;
    anal.b = m.players.find((p) => p.name === game.b) || null;
    anal.level = game.level ?? null;
    resetLive();
    anal.surface = game.surface;
  }
```

- [ ] **Step 4: Trocar de jogador manualmente limpa o nível**

Em `web/app.js:847-855`, em `switchTour`, adicionar `anal.level = null;` junto de `anal.a = null; anal.b = null;`:

```js
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
```

Em `web/app.js:944-945`, nos dois pickers manuais, adicionar `anal.level = null;` (o confronto deixou de ser o da grade):

```js
  analiseEl.querySelector('#slot-a').addEventListener('click', () => openPlayerPicker(anal.model, (p) => { anal.a = p; anal.level = null; resetLive(); renderAnalise(); }));
  analiseEl.querySelector('#slot-b').addEventListener('click', () => openPlayerPicker(anal.model, (p) => { anal.b = p; anal.level = null; resetLive(); renderAnalise(); }));
```

- [ ] **Step 5: Passar `anal.level` às chamadas de detalhe**

Em `web/app.js:953` (dentro do handler `#btn-reg-conf`, ramo `anal.live.active`) e `web/app.js:1257` (início de `renderReading`), trocar `analyzeMatch(anal.a, anal.b, anal.surface, anal.model)` por:

```js
  analyzeMatch(anal.a, anal.b, anal.surface, anal.model, anal.level)
```

(São duas ocorrências idênticas; ambas recebem o 5º argumento `anal.level`.)

- [ ] **Step 6: Renderizar a frase de supressão no card**

Em `web/app.js`, no `renderReading`, logo após o bloco IIFE que renderiza `ageAdjustText` (termina em `})()}` na linha ~1283), adicionar um bloco irmão:

```js
        ${(() => {
          if (!r.ageSuppressed) return '';
          const maisNovoNome = r.ageSuppressed.gap > 0 ? fullA : fullB;
          const txt = ageSuppressedText(r.ageSuppressed, maisNovoNome);
          return txt ? `<div class="field-hint" style="margin-top:8px">${txt}</div>` : '';
        })()}
```

- [ ] **Step 7: Verificar a coerência no navegador**

No preview: abrir um jogo de **Challenger ATP com idade discrepante** pela grade (aquele que na Task 5 apareceu em `suprimidos`, ou o que mostra `⚖ ajuste suspenso` na grade). No card de detalhe deve aparecer a frase "Ajuste de idade não aplicado: N anos … este é um Challenger …", e a probabilidade do card deve ser a **crua** (bater com a `probA` do `today.json`, sem `delta`).

Invariante a confirmar: a grade diz "ajuste suspenso" ⇔ o detalhe diz "não aplicado" para o mesmo jogo. Abrir também um jogo de **tour ATP** com idade discrepante e confirmar que o detalhe segue mostrando "Ajustado por idade…" (comportamento antigo intacto).

- [ ] **Step 8: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — toda a suíte (os ~292 testes + os novos) verde.

- [ ] **Step 9: Commit**

```bash
git add web/app.js
git commit -m "feat(analise): nível do torneio flui da grade ao detalhe; card explica a supressão"
```

---

## Self-Review (preenchido)

**1. Cobertura da spec:**
- Captura no parser (tour/challenger/itf/other) → Task 1. ✓
- Filtro de ITF/exhibition/teams → Task 2. ✓
- Gate por nível + fallback por `player.level` + `ageSuppressed` → Task 3. ✓
- Texto da supressão + comentário atualizado → Task 4. ✓
- `today.json` com `level`/`ageSuppressed` + fallback ESPN → Task 5. ✓
- Selo "Challenger" e "ajuste suspenso" na grade → Task 6. ✓
- Coerência grade→detalhe + frase no card → Task 7. ✓

**2. Placeholders:** nenhum "TBD/TODO"; todo step tem código/comando concreto e saída esperada.

**3. Consistência de tipos/nomes:** `level` (`'tour'|'challenger'|'itf'|'other'`) e `ageSuppressed` (`{ gap, wouldDelta }`) usados de forma idêntica entre parser, `analyzeMatch`, `fixtures.js`, `age-curve.js` e `app.js`. `analyzeMatch(..., level)` — 5º parâmetro — consistente nas Tasks 3, 5, 7. `ageSuppressedText(ageSuppressed, nomeMaisNovo)` — assinatura idêntica entre a Task 4 (definição) e a Task 7 (uso).

## Riscos

- **Formato do cabeçalho do Flashscore muda** → a categoria não reconhecida cai em `'other'` e é descartada (falha segura: some da grade em vez de vazar rótulo errado).
- **Rede indisponível na Task 5** → o pipeline cai no fallback ESPN (só tour); a verificação continua válida, repetir quando a fonte voltar.
- **UI sem teste automatizado (Tasks 6-7)** → mitigado pela verificação no navegador e pelo invariante grade↔detalhe explícito.
