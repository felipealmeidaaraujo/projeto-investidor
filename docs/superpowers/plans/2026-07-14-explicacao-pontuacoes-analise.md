# Explicação das pontuações na Análise — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao card de leitura da Análise uma faixa colapsável que explica Elo, piso, força e o `(+/−)` — o que cada um é e por que deu aquele valor pros jogadores do confronto.

**Architecture:** Toda a lógica dinâmica (quem está à frente, houve inversão, piso ausente, poucos dados) vive numa função pura nova em `web/src/analysis.js` (`buildReadingExplanation`), testável com `node:test`. O `web/app.js` renderiza a faixa combinando textos estáticos (definições) com as frases dinâmicas dessa função, com toggle guardado no objeto `anal`. Estilo novo em `web/styles.css` seguindo a paleta atual.

**Tech Stack:** PWA sem build (HTML/CSS/JS ES modules), Node built-in test runner (`node --test`), servidor local `npm run dev` (porta 5173).

**Nota sobre cache:** o service worker (`web/sw.js`) é network-first (`cache: 'no-cache'`) — as mudanças propagam sozinhas no próximo load. **Não** é preciso mexer no `CACHE`/versão.

---

## Estrutura de arquivos

- **Modificar** `web/src/analysis.js` — adicionar `SURFACE_PT` (map de superfície→pt) e a função pura `buildReadingExplanation(r)`.
- **Modificar** `tests/analysis.test.js` — testes da função nova.
- **Modificar** `web/app.js` — constantes de texto estático, `renderExplain(r)`, inserção no `renderReading()`, estado (`explainOpen`/`moreOpen`) e wiring dos toggles.
- **Modificar** `web/styles.css` — classes da faixa.

---

## Task 1: Função pura `buildReadingExplanation`

**Files:**
- Modify: `web/src/analysis.js` (fim do arquivo)
- Test: `tests/analysis.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao fim de `tests/analysis.test.js`. Primeiro, inclua `buildReadingExplanation` no import do topo (linha 3-10), que passa a ser:

```js
import {
  blendedRating,
  matchProbability,
  marginLabel,
  surfaceRead,
  confidenceLevel,
  analyzeMatch,
  buildReadingExplanation,
} from '../web/src/analysis.js';
```

E adicione os testes no fim do arquivo:

```js
// Fixtures para a explicação da leitura
const alcaraz = { name: 'Alcaraz', elo: 2085, clay: 2145, hard: 2085, grass: 2085, matches: 300, matchesBySurface: { clay: 120, hard: 120, grass: 60 } };
const sinner = { name: 'Sinner', elo: 2110, clay: 2065, hard: 2130, grass: 2100, matches: 300, matchesBySurface: { clay: 100, hard: 130, grass: 70 } };
const clayKing = { name: 'ClayKing', elo: 2100, clay: 2160, hard: 2050, grass: 2040, matches: 300, matchesBySurface: { clay: 150, hard: 100, grass: 50 } };
const rival = { name: 'Rival', elo: 2000, clay: 1990, hard: 2010, grass: 2005, matches: 300, matchesBySurface: { clay: 90, hard: 120, grass: 60 } };
const novato = { name: 'Novato', elo: 1900, hard: 1900, grass: 1900, matches: 40, matchesBySurface: { hard: 30, grass: 10 } };

test('buildReadingExplanation: inversão — Sinner tem Elo geral maior mas Alcaraz vence no saibro', () => {
  const ex = buildReadingExplanation(analyzeMatch(alcaraz, sinner, 'clay', model));
  assert.equal(ex.flipped, true);
  assert.ok(ex.elo.includes('Sinner') && ex.elo.includes('2110') && ex.elo.includes('vem à frente'));
  assert.ok(ex.piso.includes('a mão vira') && ex.piso.includes('Alcaraz 2145'));
  assert.ok(ex.forca.includes('favorito é Alcaraz') && ex.forca.includes('53%') && ex.forca.includes('mesmo tendo Elo geral menor'));
  assert.ok(ex.delta.includes('Alcaraz (+60) forte') && ex.delta.includes('Sinner (−45) fraco'));
});

test('buildReadingExplanation: sem inversão + neutro', () => {
  const ex = buildReadingExplanation(analyzeMatch(clayKing, rival, 'clay', model));
  assert.equal(ex.flipped, false);
  assert.ok(ex.piso.includes('confirma o favorito'));
  assert.ok(ex.delta.includes('ClayKing (+60) forte'));
  assert.ok(ex.delta.includes('Rival joga em linha com o próprio nível'));
});

test('buildReadingExplanation: piso ausente cai no Elo geral', () => {
  const ex = buildReadingExplanation(analyzeMatch(clayKing, novato, 'clay', model));
  assert.ok(ex.piso.includes('Novato') && ex.piso.includes('não há um Elo de piso confiável'));
  assert.ok(ex.delta.includes('Novato tem poucos jogos no saibro'));
});

test('buildReadingExplanation: empate no Elo geral', () => {
  const gemeoA = { name: 'GA', elo: 2000, clay: 2050, hard: 2000, grass: 2000, matches: 200, matchesBySurface: { clay: 80, hard: 80, grass: 40 } };
  const gemeoB = { name: 'GB', elo: 2000, clay: 1980, hard: 2000, grass: 2000, matches: 200, matchesBySurface: { clay: 80, hard: 80, grass: 40 } };
  const ex = buildReadingExplanation(analyzeMatch(gemeoA, gemeoB, 'clay', model));
  assert.ok(ex.elo.includes('empatados no Elo geral (2000)'));
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/analysis.test.js`
Expected: FAIL — `buildReadingExplanation is not a function` (ou erro de import).

- [ ] **Step 3: Implementar a função**

Adicione ao fim de `web/src/analysis.js`:

```js
/** Superfície → nome em pt-BR, para as frases da explicação. */
const SURFACE_PT = { clay: 'saibro', hard: 'quadra dura', grass: 'grama' };

/**
 * Frases dinâmicas ("no jogo:") que explicam os números do card de leitura.
 * Recebe o resultado de analyzeMatch. Puro e testável.
 */
export function buildReadingExplanation(r) {
  const surf = SURFACE_PT[r.surface] ?? r.surface;
  const a = r.a;
  const b = r.b;

  // Bloco Elo — quem está à frente no geral
  let elo;
  if (a.elo === b.elo) {
    elo = `${a.name} e ${b.name} estão empatados no Elo geral (${a.elo}).`;
  } else {
    const hi = a.elo > b.elo ? a : b;
    const lo = a.elo > b.elo ? b : a;
    elo = `${hi.name} ${hi.elo} · ${lo.name} ${lo.elo} — no geral, ${hi.name} vem à frente.`;
  }

  // Favorito por Elo geral vs. favorito de fato (força) → detecta inversão
  const favGeneralName = a.elo === b.elo ? null : (a.elo > b.elo ? a.name : b.name);
  const flipped = favGeneralName != null && favGeneralName !== r.favorite;

  // Bloco Piso — quem rende mais na superfície (trata piso ausente)
  let piso;
  if (a.surfaceElo == null || b.surfaceElo == null) {
    const semPiso = a.surfaceElo == null ? a : b;
    piso = `${semPiso.name} tem poucos jogos no ${surf}, então não há um Elo de piso confiável pra ele — a força dele usa só o Elo geral.`;
  } else {
    const hi = a.surfaceElo > b.surfaceElo ? a : b;
    const lo = a.surfaceElo > b.surfaceElo ? b : a;
    const fecho = flipped ? 'a mão vira.' : 'confirma o favorito.';
    piso = `No ${surf}: ${hi.name} ${hi.surfaceElo} · ${lo.name} ${lo.surfaceElo} — ${fecho}`;
  }

  // Bloco Força — a nota que decide, + favorito e %
  const favProbPct = Math.round(r.favoriteProb * 100);
  const extra = flipped ? ', mesmo tendo Elo geral menor' : '';
  const forca = `${a.name} ${a.blended} · ${b.name} ${b.blended}. Por isso, no ${surf} o favorito é ${r.favorite} — ${favProbPct}%${extra}.`;

  // Bloco (+/−) — delta e tag de cada um
  const tagPhrase = (side) => {
    const sr = side.surfaceRead;
    if (sr.tag === 'poucos dados') {
      return `${side.name} tem poucos jogos no ${surf} (piso pouco confiável)`;
    }
    if (sr.tag === 'neutro') {
      return `${side.name} joga em linha com o próprio nível`;
    }
    const sign = sr.delta > 0 ? '+' : '−';
    return `${side.name} (${sign}${Math.abs(sr.delta)}) ${sr.tag}`;
  };
  const delta = `${tagPhrase(a)}; ${tagPhrase(b)}.`;

  return { elo, piso, forca, delta, flipped };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/analysis.test.js`
Expected: PASS — todos os testes de `buildReadingExplanation`, mais os que já existiam.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — nenhuma regressão (a suíte tem ~85 testes).

- [ ] **Step 6: Commit**

```bash
git add web/src/analysis.js tests/analysis.test.js
git commit -m "Analise: buildReadingExplanation (frases dinamicas das pontuacoes)"
```

---

## Task 2: Renderizar a faixa e ligar os toggles

**Files:**
- Modify: `web/app.js` — import, estado `anal`, constantes de texto, `renderExplain`, `renderReading`, wiring em `renderAnalise`.

- [ ] **Step 1: Incluir a nova função no import**

Em `web/app.js` linha 5, troque o import de `analysis.js` para incluir `buildReadingExplanation`:

```js
import { analyzeMatch, playerTags, buildReadingExplanation } from './src/analysis.js';
```

- [ ] **Step 2: Adicionar o estado dos toggles no objeto `anal`**

Em `web/app.js`, no objeto `anal` (por volta da linha 461-464), adicione `explainOpen` e `moreOpen`:

```js
const anal = {
  tour: 'ATP', models: {}, model: null, loadingTour: null, a: null, b: null, surface: 'hard',
  explainOpen: false, moreOpen: false,
  live: { active: false, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true, bestOf: 3 },
};
```

- [ ] **Step 3: Adicionar as constantes de texto estático e a função `renderExplain`**

Em `web/app.js`, logo **antes** da função `renderReading` (por volta da linha 728), adicione:

```js
const EXPLAIN_STATIC = {
  elo: 'Nota única que resume o jogador juntando todos os jogos: vencer sobe, perder desce, e bater um forte vale mais que bater um fraco. Quanto maior, melhor.',
  piso: 'A mesma conta, mas contando só os jogos naquela superfície. Mostra quem rende diferente conforme o piso (tem quem seja fera no saibro e sofra na grama).',
  forca: 'Média do Elo geral com o piso (metade de cada). Nem só o geral, nem só a superfície: um meio-termo, pra valorizar o especialista sem exagerar num piso.',
  delta: 'É o piso menos o Elo geral: o quanto o jogador rende a mais (+) ou a menos (−) nessa superfície, comparado com <strong>ele mesmo</strong>.',
};
const SAIBA_MAIS = [
  'Todo jogador começa em <strong>1500</strong> e o número anda a cada partida.',
  'A distância entre dois Elos vira a probabilidade: cada <strong>~400 pontos</strong> de vantagem ≈ <strong>91%</strong> pro mais forte; Elo igual = 50/50.',
  'Os primeiros jogos mexem mais no número; com o tempo ele fica estável.',
  'Menos de ~15 jogos na superfície: o piso ainda não é confiável — o app marca <strong>poucos dados</strong>.',
  'Recalculado <strong>todo dia</strong> com os jogos mais recentes.',
];

function renderExplain(r) {
  const ex = buildReadingExplanation(r);
  const blk = (term, what, caso) =>
    `<div class="explain-blk">
       <div class="explain-term">${term}</div>
       <div class="explain-what">${what}</div>
       <div class="explain-case"><span class="explain-case-lbl">No jogo:</span> ${caso}</div>
     </div>`;
  const warn = `<div class="explain-warn">⚠️ É relativo a ele mesmo, não é ranking. Um top pode ter (−40) na grama e ainda assim ser muito melhor que um jogador fraco.</div>`;
  const moreBody = anal.moreOpen
    ? `<ul class="explain-more-list">${SAIBA_MAIS.map((li) => `<li>${li}</li>`).join('')}</ul>`
    : '';
  if (!anal.explainOpen) {
    return `<button class="explain-head" id="btn-explain" aria-expanded="false">
        <span>O que significam esses números?</span><span class="explain-caret">▸</span>
      </button>`;
  }
  return `
    <div class="explain">
      <button class="explain-head open" id="btn-explain" aria-expanded="true">
        <span>O que significam esses números?</span><span class="explain-caret">▾</span>
      </button>
      <div class="explain-body">
        ${blk('Elo — o nível geral', EXPLAIN_STATIC.elo, ex.elo)}
        ${blk('Piso — o Elo só nessa superfície', EXPLAIN_STATIC.piso, ex.piso)}
        ${blk('Força — a nota que decide a %', EXPLAIN_STATIC.forca, ex.forca)}
        ${blk('(+X) e (−Y) — acima ou abaixo do próprio nível', EXPLAIN_STATIC.delta, ex.delta)}
        ${warn}
        <button class="explain-more-head" id="btn-more" aria-expanded="${anal.moreOpen}">
          <span>Saiba mais: de onde vem o Elo</span><span class="explain-caret">${anal.moreOpen ? '▾' : '▸'}</span>
        </button>
        ${moreBody}
      </div>
    </div>`;
}
```

- [ ] **Step 4: Inserir a faixa no `renderReading`**

Em `web/app.js`, na função `renderReading` (por volta da linha 728-748), insira `${renderExplain(r)}` entre o fim do `.reading-card` e o botão `#btn-live`. O `return` fica assim:

```js
  return `
    <div class="reading-card">
      <div class="reading-fav">
        <span class="field-hint">Favorito no ${SURFACE_PT[anal.surface]}</span>
        <div class="reading-fav-name">${r.favorite}</div>
        <div class="reading-fav-prob">${pct(r.favoriteProb)}</div>
        <div class="reading-pills"><span class="pill pill-green">${r.marginLabel}</span><span class="pill ${confPill}">confiança ${r.confidence.level}</span></div>
      </div>
      <div class="reading-players">
        ${playerRow(r.a, r.probA, r.fairOddA, favIsA, 'a')}
        ${playerRow(r.b, r.probB, r.fairOddB, !favIsA, 'b')}
      </div>
      <div class="reading-note">${narrative(r)}</div>
    </div>
    ${renderExplain(r)}
    <button class="btn" id="btn-live" style="margin-top:14px">${anal.live.active ? '⏱️ Ocultar trade ao vivo' : '⏱️ Trade ao vivo (odd por placar)'}</button>
    ${anal.live.active ? renderLive(r) : ''}`;
```

- [ ] **Step 5: Ligar os toggles no `renderAnalise`**

Em `web/app.js`, dentro de `renderAnalise`, junto dos outros `querySelector` (perto do `#btn-live`, por volta da linha 594), adicione:

```js
  analiseEl.querySelector('#btn-explain')?.addEventListener('click', () => { anal.explainOpen = !anal.explainOpen; renderAnalise(); });
  analiseEl.querySelector('#btn-more')?.addEventListener('click', () => { anal.moreOpen = !anal.moreOpen; renderAnalise(); });
```

- [ ] **Step 6: Verificação manual (sem estilo ainda)**

Run: `npm run dev` e abra `http://localhost:5173`.
Passos: aba **Análise** → escolher dois jogadores (ex.: ATP, superfície Saibro) → aparece o card de leitura.
Expected: abaixo do card há o texto **"O que significam esses números?"**. Ao tocar, expande e mostra os 4 blocos com o "No jogo:" preenchido com os nomes/números reais; dentro, **"Saiba mais"** expande a lista. Tocar de novo fecha. (Visual ainda cru — o estilo vem na Task 3.)

- [ ] **Step 7: Commit**

```bash
git add web/app.js
git commit -m "Analise: faixa 'O que significam esses numeros' (render + toggles)"
```

---

## Task 3: Estilo da faixa

**Files:**
- Modify: `web/styles.css` (fim do arquivo)

- [ ] **Step 1: Adicionar as classes da faixa**

Adicione ao fim de `web/styles.css`:

```css
/* ===== Faixa "O que significam esses números" (Análise) ===== */
.explain { margin-top: 10px; }
.explain-head {
  width: 100%; text-align: left; cursor: pointer;
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  min-height: 44px; padding: 11px 13px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  color: var(--accent); font-size: 13px; font-family: inherit;
}
.explain-head.open { border-radius: 12px 12px 0 0; border-bottom: none; }
.explain-caret { color: var(--muted); font-size: 12px; }
.explain-body {
  background: var(--surface); border: 1px solid var(--border); border-top: none;
  border-radius: 0 0 12px 12px; padding: 2px 0;
}
.explain-blk { padding: 12px 13px; border-top: 1px solid var(--border); }
.explain-blk:first-child { border-top: none; }
.explain-term { font-size: 13px; font-weight: 700; color: var(--text); }
.explain-what { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.5; }
.explain-case { font-size: 12px; color: var(--text); margin-top: 7px; line-height: 1.5; }
.explain-case-lbl { color: var(--muted); }
.explain-warn {
  margin: 4px 13px 12px; padding: 8px 10px; font-size: 11.5px; line-height: 1.45;
  color: var(--amber); background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px;
}
.explain-more-head {
  width: 100%; text-align: left; cursor: pointer;
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  min-height: 44px; padding: 11px 13px; border-top: 1px solid var(--border);
  background: transparent; color: var(--accent); font-size: 12.5px; font-family: inherit;
}
.explain-more-list { margin: 0; padding: 2px 13px 12px 30px; }
.explain-more-list li { font-size: 11.5px; color: var(--muted); line-height: 1.5; margin-bottom: 6px; }
```

- [ ] **Step 2: Verificação manual do visual**

Run: `npm run dev` e abra `http://localhost:5173` (recarregue com a página já aberta).
Passos: aba **Análise** → dois jogadores → tocar em "O que significam esses números?".
Expected:
- Faixa fechada = uma barra clean com a seta `▸`, sem empurrar o "Trade ao vivo".
- Aberta = 4 blocos separados por linha fina, "o que é" em cinza e "No jogo:" com os números; aviso ⚠️ em âmbar; "Saiba mais" abre a lista.
- Testar em viewport mobile (DevTools ~380px) e conferir que nada estoura a largura.
- Testar um caso de **piso ausente** (um jogador com poucos jogos na superfície, via "Todos (histórico)") e um caso **neutro**, confirmando que as frases fazem sentido.

- [ ] **Step 3: Rodar a suíte pra garantir que nada quebrou**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/styles.css
git commit -m "Analise: estilo da faixa de explicacao das pontuacoes"
```

---

## Cobertura da spec (auto-revisão)

- **Faixa colapsável, fechada por padrão, após a narrativa, antes do Trade ao vivo** → Task 2, Steps 4 e 6.
- **4 blocos (o que é + no jogo com números reais)** → Task 1 (dinâmico) + Task 2 Step 3 (estático).
- **Saiba mais aninhado** → Task 2 Step 3 (`SAIBA_MAIS`, `#btn-more`).
- **Bordas: piso ausente, poucos dados, empate, sem inversão, neutro** → Task 1 Steps 1 e 3 (testadas).
- **Nomes "piso"/"força" mantidos** → sim.
- **Sem mexer no dossiê / sem SW bump** → confirmado.
- **Fiel ao motor (1500, escala 400, força = média, limiar 15)** → textos de `SAIBA_MAIS` e `EXPLAIN_STATIC`.
