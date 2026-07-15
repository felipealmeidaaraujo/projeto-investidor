# Telas 4b — Sugestão tática no confronto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à análise de confronto uma **sugestão tática em palavras** — cruza o favorito, os padrões de estilo dos dois e a superfície para dizer por onde o jogo pende, um caminho possível de operar e o risco. Sempre com o risco explícito; nunca "vai dar certo".

**Architecture:** Um módulo puro novo `web/src/tactics.js` com `tacticalSuggestion(r, styleFav, styleUnd, surfacePt)` que devolve `{ pende, caminho, risco }` (frases). O `renderReading` do `web/app.js` ganha um bloco que consome essa função (com os `style` de cada jogador do modelo enriquecido).

**Tech Stack:** Node.js (ESM) para os testes; HTML string no `app.js`. Zero dependências novas.

**Contexto:** `analyzeMatch` já devolve `r.favorite`, `r.underdog`, `r.favoriteProb`, `r.marginLabel`. Os padrões de estilo estão em `player.style` (`firstSet/comeback/decider/tieBreak`, cada `{pct,n}`). É honesto: é leitura dos padrões, não previsão do mercado.

---

### Task 1: Gerador da sugestão tática (`tacticalSuggestion`)

**Files:**
- Create: `web/src/tactics.js`
- Test: `tests/tactics.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tacticalSuggestion } from '../web/src/tactics.js';

const R = { favorite: 'Sinner J.', underdog: 'Borges N.', favoriteProb: 0.72, marginLabel: 'favorito claro' };

test('tacticalSuggestion: favorito que começa bem + azarão que vira jogos', () => {
  const styleFav = { firstSet: { pct: 87, n: 100 }, decider: { pct: 80, n: 50 } };
  const styleUnd = { comeback: { pct: 45, n: 30 } };
  const t = tacticalSuggestion(R, styleFav, styleUnd, 'saibro');
  assert.equal(t.pende, 'No saibro, o Sinner J. é favorito claro (72%).');
  assert.ok(t.caminho.includes('ganha o 1º set em 87%'), t.caminho);
  assert.ok(t.caminho.includes('green cedo'), t.caminho);
  assert.ok(t.risco.includes('vira jogos'), t.risco);
  assert.ok(t.risco.includes('45%'), t.risco);
});

test('tacticalSuggestion: equilibrado + favorito que resolve na reta final', () => {
  const r = { favorite: 'A', underdog: 'B', favoriteProb: 0.53, marginLabel: 'equilibrado' };
  const styleFav = { firstSet: { pct: 52, n: 80 }, decider: { pct: 62, n: 40 } };
  const t = tacticalSuggestion(r, styleFav, null, 'quadra dura');
  assert.ok(t.pende.startsWith('Jogo parelho'), t.pende);
  assert.ok(t.caminho.includes('reta final'), t.caminho);
  assert.ok(t.risco.includes('B'), t.risco);
});

test('tacticalSuggestion: sem padrões (jogador obscuro) dá caminho e risco genéricos', () => {
  const t = tacticalSuggestion(R, null, null, 'grama');
  assert.ok(t.caminho.includes('Sinner J.'), t.caminho);
  assert.ok(t.risco.includes('Borges N.'), t.risco);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tactics.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write minimal implementation**

Crie `web/src/tactics.js`:

```javascript
// Sugestão tática em palavras a partir dos padrões — leitura, não previsão. Pura, testada.

const pctOf = (r) => (r && r.pct != null ? r.pct : null);

/** r (de analyzeMatch) + padrões de estilo do favorito e do azarão -> { pende, caminho, risco }. */
export function tacticalSuggestion(r, styleFav, styleUnd, surfacePt) {
  const fav = r.favorite;
  const und = r.underdog;
  const favPct = Math.round(r.favoriteProb * 100);

  const pende =
    r.marginLabel === 'equilibrado'
      ? `Jogo parelho no ${surfacePt} — leve vantagem pro ${fav} (${favPct}%).`
      : `No ${surfacePt}, o ${fav} é ${r.marginLabel} (${favPct}%).`;

  const fFirst = pctOf(styleFav?.firstSet);
  const fDecider = pctOf(styleFav?.decider);
  let caminho;
  if (fFirst != null && fFirst >= 60) {
    caminho = `A força dele é no começo: ganha o 1º set em ${fFirst}%. Um caminho é entrar a favor do ${fav} e buscar o green cedo — numa quebra ou no 1º set.`;
  } else if (fDecider != null && fDecider >= 55) {
    caminho = `Ele resolve na reta final: vence ${fDecider}% dos jogos de 3 sets. Um caminho é ter paciência e não sair na primeira oscilação.`;
  } else {
    caminho = `Um caminho é entrar a favor do ${fav}, respeitando a leitura, com um alvo de saída definido.`;
  }

  const uComeback = pctOf(styleUnd?.comeback);
  const uDecider = pctOf(styleUnd?.decider);
  const uTb = pctOf(styleUnd?.tieBreak);
  let risco;
  if (uComeback != null && uComeback >= 40) {
    risco = `Cuidado: o ${und} vira jogos — vence ${uComeback}% quando perde o 1º set. Se o ${fav} não fechar cedo, a posição fica perigosa.`;
  } else if ((uDecider != null && uDecider >= 55) || (uTb != null && uTb >= 60)) {
    risco = `O ${und} é durão na reta final. Não subestime se o jogo esticar — tenha um ponto de saída.`;
  } else {
    risco = `O risco é o ${und} embalar; entre com um ponto de saída claro na cabeça.`;
  }

  return { pende, caminho, risco };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tactics.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/tactics.js tests/tactics.test.js
git commit -m "feat(confronto): gerador da sugestao tatica (tacticalSuggestion)"
```

---

### Task 2: Mostrar a sugestão no confronto (`renderReading`)

**Files:**
- Modify: `web/app.js` (import no topo; bloco novo no `renderReading` + função `renderTactics`)
- Modify: `web/styles.css`

- [ ] **Step 1: Importar a função no topo do app.js**

Ache a linha:
```javascript
import { styleLines, pressureLines, bioText } from './src/patterns-view.js';
```
Adicione logo abaixo:
```javascript
import { tacticalSuggestion } from './src/tactics.js';
```

- [ ] **Step 2: Adicionar a função renderTactics**

Logo antes de `function renderReading() {` no `web/app.js`, adicione:
```javascript
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
```

- [ ] **Step 3: Chamar renderTactics dentro do reading-card**

No `renderReading`, ache:
```javascript
      ${renderH2H()}
      <div class="reading-note">${narrative(r)}</div>
    </div>
```
Substitua por:
```javascript
      ${renderH2H()}
      <div class="reading-note">${narrative(r)}</div>
      ${renderTactics(r)}
    </div>
```

- [ ] **Step 4: Adicionar o CSS**

No fim de `web/styles.css`, adicione:
```css
.tactics { margin-top: 14px; padding: 12px 14px; background: var(--hover); border-radius: var(--r-md); }
.tactics-head { font-size: 12.5px; font-weight: 700; color: var(--text-1); margin-bottom: 6px; }
.tactics-line { font-size: 13px; line-height: 1.5; color: var(--text-1); margin: 0 0 5px; }
.tactics-risk { color: var(--text-2); }
```

- [ ] **Step 5: Verificar sintaxe e testes**

Run: `node --check web/app.js && npm test 2>&1 | grep -E "pass |fail "`
Expected: sem erro de sintaxe; PASS em tudo.

- [ ] **Step 6: Verificar no navegador**

Suba o preview (`preview_start` name `investidor-dev`); via `javascript_tool`, importe `/src/tactics.js` e `/src/analysis.js`, carregue `model-atp.json`, monte `analyzeMatch` de dois jogadores conhecidos com `style` (ex.: Sinner vs Alcaraz no saibro) e chame `tacticalSuggestion`, confirmando as 3 frases (pende/caminho/risco) coerentes. (O app real fica atrás de login.)

- [ ] **Step 7: Commit**

```bash
git add web/app.js web/styles.css
git commit -m "feat(confronto): sugestao tatica em palavras na leitura"
```

---

## Próxima fatia (fora deste documento)

- **Plano 4c — Seção de jogadores:** navegar/buscar jogadores e abrir o card fora da análise.
- **Depois:** momento de carreira + aviso de Elo defasado; integrar os pipelines ao robô diário; a comparação lado a lado completa (se o dossiê por jogador não bastar).
