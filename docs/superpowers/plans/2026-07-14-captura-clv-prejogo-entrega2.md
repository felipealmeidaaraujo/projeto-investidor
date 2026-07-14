# Captura automática do CLV pré-jogo (Entrega 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Preencher sozinho o CLV pré-jogo dos trades marcados como pré-jogo, cruzando com os fechamentos Pinnacle (tennis-data) que o robô publica.

**Architecture:** Robô publica `web/closings.json` (dados públicos); cliente cruza no boot com os trades pré-jogo e preenche `clv` via `store.updateTrade`. Lógica de casamento pura e testável em `web/src/closings.js`.

**Tech Stack:** PWA sem build (JS ES modules), node built-in test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-14-captura-clv-prejogo-entrega2-design.md`

---

## File Structure

- **Modify** `web/src/match-names.js` — exporta `matchesModelName(fullName, modelName)`.
- **Create** `web/src/closings.js` — `ymd`, `matchClosing`, `closingPatches` (puros).
- **Create** `pipeline/closings.js` — baixa tennis-data → `web/closings.json`.
- **Modify** `.github/workflows/update-model.yml` — passo `node pipeline/closings.js`.
- **Modify** `web/app.js` — import + `syncClosings()` no boot.
- **Modify/Create** tests: `tests/match-names.test.js`, `tests/closings.test.js`.

---

## Task 1: `matchesModelName` (casar nome completo ↔ "Sobrenome I.")

**Files:** Modify `web/src/match-names.js`; Test `tests/match-names.test.js`

- [ ] **Step 1: Teste que falha** — no fim de `tests/match-names.test.js`, ampliar o import da linha 3 para incluir `matchesModelName` e adicionar:
```js
test('matchesModelName: casa nome completo com formato do modelo', () => {
  assert.equal(matchesModelName('Carlos Alcaraz', 'Alcaraz C.'), true);
  assert.equal(matchesModelName('Jannik Sinner', 'Sinner J.'), true);
  assert.equal(matchesModelName('Carlos Alcaraz', 'Sinner J.'), false);
  assert.equal(matchesModelName('Félix Auger-Aliassime', 'Auger-Aliassime F.'), true); // acentos/hífen
});
```
Import (linha 3):
```js
import { normName, matchPlayer, matchesModelName } from '../web/src/match-names.js';
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/match-names.test.js` → FAIL (`matchesModelName is not a function`).

- [ ] **Step 3: Implementar** — adicionar ao fim de `web/src/match-names.js` (reusa `parseFullName`/`parseModelName` já presentes no arquivo):
```js
/** Um nome completo ("Carlos Alcaraz") e um nome de modelo ("Alcaraz C.") são o mesmo jogador? */
export function matchesModelName(fullName, modelName) {
  const f = parseFullName(fullName);
  const m = parseModelName(modelName);
  return !!m.surname && m.surname === f.surname && (f.initial === '' || m.initial === f.initial);
}
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/match-names.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add web/src/match-names.js tests/match-names.test.js
git commit -m "feat(match-names): matchesModelName (nome completo vs Sobrenome I.)"
```

---

## Task 2: Casamento trade↔fechamento (`web/src/closings.js`)

**Files:** Create `web/src/closings.js`; Create `tests/closings.test.js`

- [ ] **Step 1: Teste que falha** — criar `tests/closings.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymd, matchClosing, closingPatches } from '../web/src/closings.js';

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);

const closings = [
  { date: 20260712, surface: 'clay', tour: 'ATP', winner: 'Alcaraz C.', loser: 'Sinner J.', psw: 1.80, psl: 2.05, maxw: 1.85, maxl: 2.10 },
  { date: 20260710, surface: 'hard', tour: 'ATP', winner: 'Zverev A.', loser: 'Ruud C.', psw: null, psl: null, maxw: 1.50, maxl: 2.60 },
];

test('ymd: extrai YYYYMMDD de uma data ISO', () => {
  assert.equal(ymd('2026-07-12T14:30'), 20260712);
  assert.equal(ymd('2026-07-12'), 20260712);
  assert.equal(ymd(''), null);
});

test('matchClosing: casa por nomes (qualquer ordem) e escolhe a odd do lado', () => {
  // entrei back no Alcaraz (players.a), que venceu → oddClose = psw = 1.80
  const t = { market: 'Match Odds', entryType: 'pre', date: '2026-07-12T10:00', oddEntry: 2.0, dir: 'back',
    players: { a: 'Carlos Alcaraz', b: 'Jannik Sinner' }, side: 'a' };
  const r = matchClosing(t, closings);
  approx(r.oddClose, 1.80);
  // entrei no Sinner (perdedor) → psl = 2.05
  const t2 = { ...t, side: 'b' };
  approx(matchClosing(t2, closings).oddClose, 2.05);
});

test('matchClosing: fallback Max quando Pinnacle ausente', () => {
  const t = { market: 'Match Odds', entryType: 'pre', date: '2026-07-10', oddEntry: 1.5, dir: 'back',
    players: { a: 'Alexander Zverev', b: 'Casper Ruud' }, side: 'a' };
  approx(matchClosing(t, closings).oddClose, 1.50); // psw null → maxw
});

test('matchClosing: ignora ao vivo, já-com-oddClose, fora da janela e sem casar', () => {
  const base = { market: 'Match Odds', entryType: 'pre', date: '2026-07-12', oddEntry: 2.0, dir: 'back',
    players: { a: 'Carlos Alcaraz', b: 'Jannik Sinner' }, side: 'a' };
  assert.equal(matchClosing({ ...base, entryType: 'live' }, closings), null);
  assert.equal(matchClosing({ ...base, oddClose: 1.9 }, closings), null);
  assert.equal(matchClosing({ ...base, date: '2026-06-01' }, closings), null); // fora da janela
  assert.equal(matchClosing({ ...base, players: { a: 'Novak Djokovic', b: 'Jannik Sinner' } }, closings), null);
});

test('closingPatches: calcula clv com a direção (lay invertido)', () => {
  const back = { id: 'x', market: 'Match Odds', entryType: 'pre', date: '2026-07-12', oddEntry: 2.0, dir: 'back',
    players: { a: 'Carlos Alcaraz', b: 'Jannik Sinner' }, side: 'a' };
  const [pBack] = closingPatches([back], closings);
  assert.equal(pBack.id, 'x');
  approx(pBack.oddClose, 1.80);
  approx(pBack.clv, (2.0 / 1.80 - 1) * 100); // back
  const lay = { ...back, id: 'y', dir: 'lay' };
  const [pLay] = closingPatches([lay], closings);
  approx(pLay.clv, (1.80 / 2.0 - 1) * 100); // lay invertido
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/closings.test.js` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — criar `web/src/closings.js`:
```js
// Casa trades PRÉ-JOGO (Match Odds) com os fechamentos Pinnacle (tennis-data). Funções puras.
import { matchesModelName } from './match-names.js';
import { clvPct } from './finance.js';

/** Data ISO ('2026-07-12T14:30') → inteiro AAAAMMDD (ou null). */
export function ymd(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : null;
}

function ymdToDate(n) {
  return new Date(Date.UTC(Math.floor(n / 10000), Math.floor((n % 10000) / 100) - 1, n % 100));
}
function daysBetween(a, b) {
  return Math.abs((ymdToDate(a) - ymdToDate(b)) / 86400000);
}

/** Acha a odd de fechamento do lado apostado, ou null. */
export function matchClosing(trade, closings, { windowDays = 4 } = {}) {
  if (trade.market !== 'Match Odds' || trade.entryType !== 'pre') return null;
  if (!trade.players?.a || !trade.players?.b || !trade.side) return null;
  if (typeof trade.oddClose === 'number') return null;
  const td = ymd(trade.date);
  if (td == null) return null;

  const sidePlayer = trade.side === 'a' ? trade.players.a : trade.players.b;
  const otherPlayer = trade.side === 'a' ? trade.players.b : trade.players.a;

  let best = null;
  let bestDist = Infinity;
  for (const c of closings) {
    if (c.date == null) continue;
    const dist = daysBetween(td, c.date);
    if (dist > windowDays) continue;
    const sideIsWinner = matchesModelName(sidePlayer, c.winner) && matchesModelName(otherPlayer, c.loser);
    const sideIsLoser = matchesModelName(sidePlayer, c.loser) && matchesModelName(otherPlayer, c.winner);
    if (!sideIsWinner && !sideIsLoser) continue;
    const oddClose = sideIsWinner ? (c.psw ?? c.maxw) : (c.psl ?? c.maxl);
    if (!Number.isFinite(oddClose)) continue;
    if (dist < bestDist) { bestDist = dist; best = { oddClose }; }
  }
  return best;
}

/** Patches {id, oddClose, clv} dos trades que casaram (clv com a direção do trade). */
export function closingPatches(trades, closings) {
  const patches = [];
  for (const t of trades) {
    const m = matchClosing(t, closings);
    if (m) patches.push({ id: t.id, oddClose: m.oddClose, clv: clvPct(t.oddEntry, m.oddClose, t.dir || 'back') });
  }
  return patches;
}
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/closings.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add web/src/closings.js tests/closings.test.js
git commit -m "feat(closings): casamento trade<->fechamento Pinnacle (puro, testado)"
```

---

## Task 3: Robô gera `web/closings.json`

**Files:** Create `pipeline/closings.js`; Modify `.github/workflows/update-model.yml`

- [ ] **Step 1: Criar `pipeline/closings.js`**:
```js
// Gera web/closings.json com os fechamentos Pinnacle das últimas ~10 semanas (ATP+WTA).
// Rode com: node pipeline/closings.js
import { writeFile } from 'node:fs/promises';
import { fetchTennisDataYear } from './ingest-tennisdata.js';

function ymdOf(d) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

async function build() {
  const year = new Date().getUTCFullYear();
  const cutoff = ymdOf(new Date(Date.now() - 70 * 86400000)); // ~10 semanas
  const out = { generatedAt: new Date().toISOString(), count: 0, matches: [] };
  for (const tour of ['ATP', 'WTA']) {
    let matches = [];
    try { matches = await fetchTennisDataYear(year, tour); }
    catch (e) { console.warn(`${tour} ${year} ignorado: ${e.message}`); continue; }
    for (const m of matches) {
      if (!m.dateInt || m.dateInt < cutoff || !m.winner || !m.loser) continue;
      out.matches.push({ date: m.dateInt, surface: m.surface, tour, winner: m.winner, loser: m.loser, psw: m.psw, psl: m.psl, maxw: m.maxw, maxl: m.maxl });
    }
  }
  out.matches.sort((a, b) => a.date - b.date);
  out.count = out.matches.length;
  await writeFile(new URL('../web/closings.json', import.meta.url), JSON.stringify(out));
  console.log(`closings.json: ${out.count} partidas desde ${cutoff}`);
}
build();
```

- [ ] **Step 2: Gerar o arquivo inicial** — `node pipeline/closings.js`
Esperado: cria `web/closings.json` com N partidas (N pode ser 0 fora de temporada; ok). Se a rede falhar (tennis-data fora), criar um placeholder: `echo '{"generatedAt":"","count":0,"matches":[]}' > web/closings.json`.

- [ ] **Step 3: Passo no workflow** — em `.github/workflows/update-model.yml`, logo após o passo "Buscar os jogos do dia (The Odds API)", inserir:
```yaml
      - name: Gerar fechamentos (CLV pré-jogo, tennis-data)
        run: node pipeline/closings.js
```

- [ ] **Step 4: Commit**
```bash
git add pipeline/closings.js .github/workflows/update-model.yml web/closings.json
git commit -m "feat(robo): publica closings.json (fechamentos Pinnacle, tennis-data)"
```

---

## Task 4: `syncClosings()` no boot do app

**Files:** Modify `web/app.js`

- [ ] **Step 1: Import** — adicionar após o import de match-names (perto da linha 9):
```js
import { closingPatches } from './src/closings.js';
```

- [ ] **Step 2: Função `syncClosings`** — adicionar perto de `bootApp` (antes dela):
```js
async function syncClosings() {
  const pending = store.getTrades().filter(
    (t) => t.market === 'Match Odds' && t.entryType === 'pre' && t.players?.a && t.players?.b && t.side && typeof t.oddClose !== 'number'
  );
  if (!pending.length) return;
  let matches;
  try {
    const res = await fetch('closings.json', { cache: 'no-cache' });
    if (!res.ok) return;
    matches = (await res.json()).matches || [];
  } catch { return; }
  const patches = closingPatches(pending, matches);
  let n = 0;
  for (const p of patches) {
    try { await store.updateTrade(p.id, { oddClose: p.oddClose, clv: p.clv }); n++; } catch { /* ignora falha isolada */ }
  }
  if (n) toast(`CLV preenchido em ${n} trade${n > 1 ? 's' : ''} ✅`);
}
```

- [ ] **Step 3: Chamar no boot** — em `bootApp()`, logo após `renderScreen(currentScreen);`, adicionar:
```js
  syncClosings();
```

- [ ] **Step 4: Verificar sintaxe e testes** — `node --check web/app.js` (OK) e `npm test` (tudo verde).

- [ ] **Step 5: Verificação de render isolada** — criar `web/_closings-preview.html` temporário que importa `closingPatches` e roda com trades pré-jogo de exemplo + um `closings.json` de exemplo inline; conferir via `get_page_text` que o `clv` calculado bate. Carregar também `localhost:5173/` (index.html) e confirmar console limpo (o app real carrega com o novo import). Remover o preview.

- [ ] **Step 6: Commit**
```bash
git add web/app.js
git commit -m "feat(app): syncClosings no boot preenche CLV pre-jogo automatico"
```

---

## Task 5: Verificação final, revisão e publicação

- [ ] **Step 1:** `npm test` verde (match-names + closings + toda a suíte).
- [ ] **Step 2:** `node --check web/app.js` OK; app real carrega sem erro no console.
- [ ] **Step 3:** Revisão adversarial do diff da Entrega 2 (casamento de nomes, janela de data, escolha psw/psl pelo lado, lay, boot resiliente, workflow).
- [ ] **Step 4:** Aplicar correções reais.
- [ ] **Step 5:** Publicar — `git push` (redeploy). Reportar ao Felipe; lembrar do lag (planilha semanal) e que só Match Odds pré-jogo é coberto.

---

## Notas de execução

- `web/src/match-names.js` é a fonte única (browser + pipeline). Não recriar em `pipeline/`.
- `closings.json` é regenerado no runner (como `today.json`/`model.json`); o commit inicial é só pra existir antes do 1º cron.
- Não sobrescrever `oddClose` preenchido à mão (o `matchClosing` já pula quem tem `oddClose`).
