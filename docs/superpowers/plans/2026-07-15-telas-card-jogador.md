# Telas 4a — Card do jogador enriquecido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar no dossiê do jogador (o modal `openDossier` do `web/app.js`) os dados novos do Plano 2 — identidade (bio), padrões de estilo e padrões de pressão — em rótulos claros e auto-explicativos (regra de clareza total).

**Architecture:** Um módulo puro novo `web/src/patterns-view.js` traduz `p.style`, `p.pressure` e `p.bio` em linhas prontas `{ label, detail }` (com o número embutido). O `openDossier` ganha blocos que consomem essas funções. Segue o padrão dos blocos existentes (`dos-section` + `dos-srow`).

**Tech Stack:** Node.js (ESM) para os testes das funções puras; a UI é HTML string no `app.js`. Zero dependências novas.

**Regra de clareza (fixa):** todo rótulo é auto-explicativo, com o número — "Vira jogos — vence 75% quando perde o 1º set". Sem gíria, sem sigla sem legenda.

**Dados disponíveis no `player`** (do modelo enriquecido): `bio {rank,hand,ht,age,ioc}`, `style {firstSet,comeback,decider,tieBreak}` (cada um `{pct,n}`), `pressure {bpSavedPct,breaksAgainstPerSvGm,breaksFor,bpCreated}`.

---

### Task 1: Linhas dos padrões de estilo (`styleLines`)

**Files:**
- Create: `web/src/patterns-view.js`
- Test: `tests/patterns-view.test.js`

`styleLines(style, minN)` devolve `[{ label, detail }]` só das leituras com dados suficientes (`n >= minN`, padrão 5).

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleLines } from '../web/src/patterns-view.js';

const STYLE = {
  firstSet: { pct: 87, n: 183 },
  comeback: { pct: 75, n: 40 },
  decider: { pct: 85, n: 60 },
  tieBreak: { pct: 78, n: 55 },
};

test('styleLines: rótulos claros com o número embutido', () => {
  const lines = styleLines(STYLE);
  assert.deepEqual(lines[0], { label: 'Começa ligado', detail: 'ganha o 1º set em 87%' });
  assert.deepEqual(lines[1], { label: 'Vira jogos', detail: 'vence 75% quando perde o 1º set' });
  assert.deepEqual(lines[2], { label: 'Aguenta a decisão', detail: 'vence 85% dos jogos de 3 sets' });
  assert.deepEqual(lines[3], { label: 'Forte no tie-break', detail: 'ganha 78% dos tie-breaks' });
});

test('styleLines: omite leituras com poucos dados', () => {
  const lines = styleLines({ firstSet: { pct: 90, n: 100 }, comeback: { pct: 50, n: 2 } });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].label, 'Começa ligado');
});

test('styleLines: style ausente devolve lista vazia', () => {
  assert.deepEqual(styleLines(null), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patterns-view.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write minimal implementation**

Crie `web/src/patterns-view.js`:

```javascript
// Traduz os padrões do jogador (style/pressure/bio) em linhas claras { label, detail } para a UI.
// Regra de clareza: o número vai sempre embutido no texto. Funções puras.

/** Padrões de estilo -> linhas legíveis. Omite leituras com menos de minN jogos. */
export function styleLines(style, minN = 5) {
  if (!style) return [];
  const defs = [
    { label: 'Começa ligado', r: style.firstSet, txt: (v) => `ganha o 1º set em ${v}%` },
    { label: 'Vira jogos', r: style.comeback, txt: (v) => `vence ${v}% quando perde o 1º set` },
    { label: 'Aguenta a decisão', r: style.decider, txt: (v) => `vence ${v}% dos jogos de 3 sets` },
    { label: 'Forte no tie-break', r: style.tieBreak, txt: (v) => `ganha ${v}% dos tie-breaks` },
  ];
  return defs
    .filter((d) => d.r && d.r.pct != null && d.r.n >= minN)
    .map((d) => ({ label: d.label, detail: d.txt(d.r.pct) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patterns-view.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/patterns-view.js tests/patterns-view.test.js
git commit -m "feat(card): linhas dos padroes de estilo (styleLines)"
```

---

### Task 2: Linhas dos padrões de pressão (`pressureLines`)

**Files:**
- Modify: `web/src/patterns-view.js`
- Test: `tests/patterns-view.test.js`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/patterns-view.test.js`:

```javascript
import { pressureLines } from '../web/src/patterns-view.js';

test('pressureLines: salva break point e fragilidade no saque, claros', () => {
  const lines = pressureLines({ bpSavedPct: 73, breaksAgainstPerSvGm: 0.05, breaksFor: 653, bpCreated: 1516 });
  assert.deepEqual(lines[0], { label: 'Salva break point', detail: 'segura 73% dos break points contra' });
  assert.deepEqual(lines[1], { label: 'Firmeza no saque', detail: 'é quebrado em 5% dos games de saque' });
});

test('pressureLines: pressure ausente ou vazio devolve lista vazia', () => {
  assert.deepEqual(pressureLines(null), []);
  assert.deepEqual(pressureLines({ bpSavedPct: null, breaksAgainstPerSvGm: null }), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patterns-view.test.js`
Expected: FAIL — `pressureLines is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `web/src/patterns-view.js`:

```javascript
/** Padrões de pressão -> linhas legíveis (só as taxas claras). */
export function pressureLines(pressure) {
  if (!pressure) return [];
  const lines = [];
  if (pressure.bpSavedPct != null) {
    lines.push({ label: 'Salva break point', detail: `segura ${pressure.bpSavedPct}% dos break points contra` });
  }
  if (pressure.breaksAgainstPerSvGm != null) {
    lines.push({ label: 'Firmeza no saque', detail: `é quebrado em ${Math.round(pressure.breaksAgainstPerSvGm * 100)}% dos games de saque` });
  }
  return lines;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patterns-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/patterns-view.js tests/patterns-view.test.js
git commit -m "feat(card): linhas dos padroes de pressao (pressureLines)"
```

---

### Task 3: Linha de identidade (`bioText`)

**Files:**
- Modify: `web/src/patterns-view.js`
- Test: `tests/patterns-view.test.js`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `tests/patterns-view.test.js`:

```javascript
import { bioText } from '../web/src/patterns-view.js';

test('bioText: identidade clara e por extenso', () => {
  const s = bioText({ rank: 1, hand: 'R', ht: 191, age: 24.7, ioc: 'ITA' }, 'ATP');
  assert.equal(s, 'Ranking #1 ATP · destro · 191 cm · 24 anos · Itália');
});

test('bioText: canhoto e país fora do mapa mostra o código', () => {
  const s = bioText({ hand: 'L', ioc: 'ZZZ' }, 'ATP');
  assert.ok(s.includes('canhoto'));
  assert.ok(s.includes('ZZZ'));
});

test('bioText: bio nulo devolve string vazia', () => {
  assert.equal(bioText(null, 'ATP'), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/patterns-view.test.js`
Expected: FAIL — `bioText is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicione a `web/src/patterns-view.js`:

```javascript
const IOC = {
  ITA: 'Itália', ESP: 'Espanha', SRB: 'Sérvia', USA: 'EUA', FRA: 'França', GER: 'Alemanha',
  GBR: 'Reino Unido', RUS: 'Rússia', ARG: 'Argentina', AUS: 'Austrália', CAN: 'Canadá',
  SUI: 'Suíça', AUT: 'Áustria', GRE: 'Grécia', NOR: 'Noruega', DEN: 'Dinamarca', POL: 'Polônia',
  NED: 'Holanda', BUL: 'Bulgária', CRO: 'Croácia', CZE: 'Tchéquia', CHI: 'Chile', BRA: 'Brasil',
  JPN: 'Japão', CHN: 'China', KAZ: 'Cazaquistão', SVK: 'Eslováquia', BEL: 'Bélgica', HUN: 'Hungria',
  POR: 'Portugal', FIN: 'Finlândia', SWE: 'Suécia', COL: 'Colômbia', BOL: 'Bolívia', PER: 'Peru',
  UKR: 'Ucrânia', BLR: 'Belarus', ROU: 'Romênia', SLO: 'Eslovênia', TUN: 'Tunísia',
  IND: 'Índia', TPE: 'Taipé', MDA: 'Moldávia', BIH: 'Bósnia', LTU: 'Lituânia', LAT: 'Letônia',
};

/** Bio do jogador -> linha de identidade por extenso. */
export function bioText(bio, tour) {
  if (!bio) return '';
  const parts = [];
  if (bio.rank) parts.push(`Ranking #${bio.rank} ${tour}`);
  if (bio.hand) parts.push(bio.hand === 'L' ? 'canhoto' : 'destro');
  if (bio.ht) parts.push(`${bio.ht} cm`);
  if (bio.age) parts.push(`${Math.round(bio.age)} anos`);
  if (bio.ioc) parts.push(IOC[bio.ioc] || bio.ioc);
  return parts.join(' · ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/patterns-view.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/patterns-view.js tests/patterns-view.test.js
git commit -m "feat(card): linha de identidade do jogador (bioText)"
```

---

### Task 4: Integrar os blocos no dossiê (`openDossier`)

**Files:**
- Modify: `web/app.js` (import no topo; blocos dentro de `openDossier`, a partir da linha ~1096)

- [ ] **Step 1: Importar as funções no topo do app.js**

Encontre a linha (perto do topo) que importa de `./src/analysis.js`:
```javascript
import { analyzeMatch, playerTags, buildReadingExplanation, serveBand } from './src/analysis.js';
```
Adicione, logo abaixo dela:
```javascript
import { styleLines, pressureLines, bioText } from './src/patterns-view.js';
```

- [ ] **Step 2: Adicionar os blocos no HTML do dossiê**

Em `openDossier`, dentro de `draw()`, ache o bloco da identidade (a `dos-elo`) e os padrões. Logo após a linha:
```javascript
            <div class="dos-elo">Elo ${player.elo}${player.matches ? ` · ${player.matches} jogos` : ''}${player.level === 'challenger' ? ' <span class="pill pill-muted">Challenger</span>' : ''}</div>
```
adicione a linha de identidade (bio):
```javascript
            ${bioText(player.bio, anal.tour) ? `<div class="dos-bio">${bioText(player.bio, anal.tour)}</div>` : ''}
```

E ache o fim do bloco de saque (a `</div>` que fecha `dos-serve`, antes de `${renderDossierExplain(...)}`). Logo antes de `${renderDossierExplain(st, !!s)}`, adicione os blocos de estilo e pressão:
```javascript
            ${styleLines(player.style).length ? `<div class="dos-section">Como costuma jogar</div>
              <div class="dos-patterns">${styleLines(player.style).map((l) => `<div class="dos-srow"><span>${l.label}</span><span class="dos-pat-detail">${l.detail}</span></div>`).join('')}</div>` : ''}
            ${pressureLines(player.pressure).length ? `<div class="dos-section">Pressão nos games</div>
              <div class="dos-patterns">${pressureLines(player.pressure).map((l) => `<div class="dos-srow"><span>${l.label}</span><span class="dos-pat-detail">${l.detail}</span></div>`).join('')}</div>` : ''}
```

- [ ] **Step 3: Adicionar o CSS dos novos elementos**

No fim de `web/styles.css`, adicione:
```css
.dos-bio { font-size: 12.5px; color: var(--text-2); margin-top: 4px; }
.dos-patterns { display: flex; flex-direction: column; }
.dos-pat-detail { font-size: 12.5px; color: var(--text-2); text-align: right; }
```

- [ ] **Step 4: Verificar a sintaxe e os testes**

Run: `node --check web/app.js && npm test 2>&1 | grep -E "pass |fail "`
Expected: sem erro de sintaxe; PASS em tudo.

- [ ] **Step 5: Verificar no navegador (dossiê renderiza os blocos)**

Suba o preview (`preview_start` name `investidor-dev`) e, via `javascript_tool`, monte o HTML de um dossiê com um jogador que tem `style`/`pressure`/`bio` (ex.: buscar em `model-atp.json` o `Sinner J.`) reproduzindo o mesmo template, e confirme que as seções "Como costuma jogar" e "Pressão nos games" aparecem com as frases claras. (O app real fica atrás de login; a verificação é do HTML gerado pelas funções + o CSS carregado.)

- [ ] **Step 6: Commit**

```bash
git add web/app.js web/styles.css
git commit -m "feat(card): dossie mostra identidade, estilo e pressao"
```

---

## Próximas fatias (fora deste documento)

- **Plano 4b — Análise de confronto:** comparação lado a lado com todas as métricas (incl. pressão), e a **sugestão tática em palavras** (função pura que cruza favorito + padrões + superfície + fase → um caminho + o risco).
- **Plano 4c — Seção de jogadores:** navegar/buscar jogadores e abrir o card fora da análise.
- **Depois:** momento de carreira (trajetória de ranking) + aviso de Elo defasado; integrar os pipelines ao robô diário.
