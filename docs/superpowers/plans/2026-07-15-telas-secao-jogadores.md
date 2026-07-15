# Telas 4c — Seção de jogadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela nova "Jogadores" onde o Felipe busca/navega qualquer jogador (ATP ou WTA) e abre o card completo (o mesmo `openDossier`) fora da análise de confronto.

**Architecture:** Uma função pura `searchPlayers` (filtra ativos + busca por nome) em `web/src/player-search.js`. No `web/index.html`, um item de nav novo e uma `<section id="screen-jogadores">`. No `web/app.js`, `renderJogadores()` (seletor ATP/WTA + campo de busca + lista) que reusa `openDossier` e `loadModel`.

**Tech Stack:** Node.js (ESM) para o teste da função pura; HTML/CSS no app. Zero dependências novas.

**Contexto:** os botões de nav usam `data-target`; `renderScreen(target)` roteia; `showScreen` alterna a `.screen.active`. `openDossier(player)` já existe e usa `anal.tour`/`anal.model` — a tela seta esses antes de abrir. `initials()` e `loadModel()` já existem.

---

### Task 1: Busca de jogadores (`searchPlayers`)

**Files:**
- Create: `web/src/player-search.js`
- Test: `tests/player-search.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPlayers } from '../web/src/player-search.js';

const PLAYERS = [
  { name: 'Sinner J.', fullName: 'Jannik Sinner', elo: 2548, active: true },
  { name: 'Alcaraz C.', fullName: 'Carlos Alcaraz', elo: 2500, active: true },
  { name: 'Velho X.', elo: 1800, active: false },
];

test('searchPlayers: só ativos, mantém a ordem do modelo (por Elo)', () => {
  const r = searchPlayers(PLAYERS, '');
  assert.equal(r.length, 2);
  assert.equal(r[0].name, 'Sinner J.');
});

test('searchPlayers: filtra por nome do modelo ou nome completo', () => {
  assert.equal(searchPlayers(PLAYERS, 'alcaraz')[0].name, 'Alcaraz C.');
  assert.equal(searchPlayers(PLAYERS, 'jannik')[0].name, 'Sinner J.');
});

test('searchPlayers: respeita o limite', () => {
  assert.equal(searchPlayers(PLAYERS, '', 1).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/player-search.test.js`
Expected: FAIL com `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write minimal implementation**

Crie `web/src/player-search.js`:

```javascript
// Busca de jogadores para a seção de jogadores: filtra ativos e por nome. Pura.
import { normName } from './match-names.js';

/** Jogadores ativos que casam com a busca (nome do modelo ou completo), na ordem do modelo. */
export function searchPlayers(players, query, limit = 60) {
  const q = normName(query);
  let list = players.filter((p) => p.active !== false);
  if (q) {
    list = list.filter((p) => normName(p.name).includes(q) || (p.fullName && normName(p.fullName).includes(q)));
  }
  return list.slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/player-search.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/player-search.js tests/player-search.test.js
git commit -m "feat(jogadores): busca de jogadores (searchPlayers)"
```

---

### Task 2: A tela de jogadores (index.html + app.js + CSS)

**Files:**
- Modify: `web/index.html` (2 botões de nav + 1 section)
- Modify: `web/app.js` (import, screen ref, roteamento, `renderJogadores`)
- Modify: `web/styles.css`

- [ ] **Step 1: Adicionar o botão de nav no sidebar (index.html)**

Em `web/index.html`, ache o botão de análise do sidebar (dentro de `<nav class="side-nav">`) e adicione, logo após o `</button>` dele:
```html
        <button class="tab" data-target="jogadores">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c0-3.6 3-5.6 7-5.6s7 2 7 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Jogadores</span>
        </button>
```

- [ ] **Step 2: Adicionar o botão de nav no tabbar (index.html)**

Ache o botão de análise do tabbar (dentro de `<nav class="tabbar">`) e adicione logo após o `</button>` dele:
```html
    <button class="tab" data-target="jogadores">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c0-3.6 3-5.6 7-5.6s7 2 7 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Jogadores</span>
    </button>
```

- [ ] **Step 3: Adicionar a section (index.html)**

Ache a linha `<section class="screen" id="screen-analise" aria-label="Análise"></section>` e adicione logo abaixo:
```html
        <section class="screen" id="screen-jogadores" aria-label="Jogadores"></section>
```

- [ ] **Step 4: Import e roteamento (app.js)**

Perto do topo do `app.js`, ache:
```javascript
import { tacticalSuggestion } from './src/tactics.js';
```
Adicione logo abaixo:
```javascript
import { searchPlayers } from './src/player-search.js';
```

Ache a função `renderScreen`:
```javascript
function renderScreen(target) {
  if (target === 'banca') renderBanca();
  else if (target === 'registrar') renderRegistrar();
  else if (target === 'historico') renderHistorico();
  else if (target === 'analise') renderAnalise();
}
```
Substitua por (adiciona a linha de jogadores):
```javascript
function renderScreen(target) {
  if (target === 'banca') renderBanca();
  else if (target === 'registrar') renderRegistrar();
  else if (target === 'historico') renderHistorico();
  else if (target === 'analise') renderAnalise();
  else if (target === 'jogadores') renderJogadores();
}
```

- [ ] **Step 5: A função renderJogadores (app.js)**

Logo antes de `function renderAuth() {` no `app.js`, adicione:
```javascript
const jogadoresEl = document.getElementById('screen-jogadores');
const jog = { tour: 'ATP', query: '' };

function jogListHTML(list) {
  if (!list.length) return '<p class="field-hint">Nenhum jogador encontrado.</p>';
  return list
    .map((p, i) => `<button class="jog-row" data-jog="${i}">
        <span class="jog-avatar">${initials(p.name)}</span>
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
  });
  wire(list);
}
```

- [ ] **Step 6: CSS (styles.css)**

No fim de `web/styles.css`, adicione:
```css
.jog-search { width: 100%; padding: 11px 14px; font-size: 15px; font-family: inherit; color: var(--text-1); background: var(--card); border: 1px solid var(--border); border-radius: var(--r-md); margin-bottom: 12px; box-sizing: border-box; }
.jog-list { display: flex; flex-direction: column; gap: 8px; }
.jog-row { display: flex; align-items: center; gap: 11px; text-align: left; background: var(--card); border: 1px solid var(--border-subtle); border-radius: var(--r-md); padding: 10px 13px; cursor: pointer; font-family: inherit; color: var(--text-1); -webkit-tap-highlight-color: transparent; }
.jog-row:active { background: var(--hover); }
.jog-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--hover); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.jog-body { display: flex; flex-direction: column; }
.jog-name { font-size: 14.5px; font-weight: 700; }
.jog-sub { font-size: 12px; color: var(--text-2); }
```

- [ ] **Step 7: Verificar sintaxe e testes**

Run: `node --check web/app.js && npm test 2>&1 | grep -E "pass |fail "`
Expected: sem erro de sintaxe; PASS em tudo.

- [ ] **Step 8: Commit**

```bash
git add web/index.html web/app.js web/styles.css
git commit -m "feat(jogadores): tela de busca e navegacao de jogadores"
```

---

### Task 3: Verificar no navegador

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir o preview e conferir a navegação**

Suba o preview (`preview_start` name `investidor-dev`). O app real fica atrás de login, então verifique via `javascript_tool`: import de `/src/player-search.js`, carregar `model-atp.json`, chamar `searchPlayers(model.players, 'sinner')` e confirmar que devolve o Sinner; e `searchPlayers(model.players, '')` devolve dezenas de ativos ordenados por Elo (o 1º deve ser o de maior Elo).

- [ ] **Step 2: Confirmar o HTML da lista**

Ainda via `javascript_tool`, gere `jogListHTML`-equivalente para os 3 primeiros e confirme que cada linha tem nome + "Elo N". (A abertura do dossiê em si depende do login; as funções puras + o roteamento cobrem o essencial.)

---

## Depois (fora deste documento)

- Momento de carreira (trajetória de ranking) + aviso de Elo defasado.
- Integrar `patterns-ingest.js` e o `fixtures.js` (Flashscore) ao robô diário (`update-model.yml`).
- Limpar os campos svGms/bpSaved/bpFaced do `p.bio` (resquício inofensivo).
