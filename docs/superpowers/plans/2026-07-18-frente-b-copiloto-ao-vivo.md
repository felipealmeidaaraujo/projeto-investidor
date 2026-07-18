# Frente B — Copiloto ao vivo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o momento ao vivo um copiloto honesto — o cartão de sobre-reação deixa de mandar ("Valor em BACK") e vira observação (mercado esticado/curto + Betfair vs justo + "confira o motivo, você decide"); e um bloco novo "o que observar" diz, do perfil do confronto, quais eventos importam e por que o mercado reage.

**Architecture:** PWA vanilla JS. Uma função pura nova (`web/src/watch.js`) gera as linhas de "o que observar" das regras de saque/devolução/estilo (usando `serveBand`). `app.js` ganha um `renderWatch` (na leitura) e tem o `orCard` do `renderLive` reformulado. `styles.css` troca o cartão verde por um cartão âmbar calmo e adiciona o bloco. O motor (`inplay.js`) não muda.

**Tech Stack:** JavaScript ES modules (browser), Node.js `--test`, service worker (sem bump — só JS/CSS de conteúdo, servido network-first).

**Spec:** [docs/superpowers/specs/2026-07-18-frente-b-copiloto-ao-vivo-design.md](../specs/2026-07-18-frente-b-copiloto-ao-vivo-design.md)

**Nota de ambiente:** os arquivos do repo são **CRLF**. O `Edit` com `old_string` em LF pode não casar — ao aplicar edições, use edição CRLF-aware (ex.: script Node que normaliza `\r\n`→`\n`, edita e restaura), como feito na Frente A.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `web/src/watch.js` | Criar | Regras puras de "o que observar" (saque/devolução/estilo → linhas) |
| `tests/watch.test.js` | Criar | Cobre as regras e o fallback neutro |
| `web/app.js` | Modificar | Importa `whatToWatch`; `renderWatch` na leitura; `orCard` reformulado no `renderLive` |
| `web/styles.css` | Modificar | Cartão âmbar (troca o verde) + classes do bloco "o que observar" |

Preservado sem tocar: `web/src/inplay.js` (motor `overreaction`/`liveFairOdds`), `web/src/analysis.js` (`serveBand`).

---

## Task 1: `web/src/watch.js` + testes (a lógica pura)

**Files:**
- Create: `web/src/watch.js`
- Create: `tests/watch.test.js`

- [ ] **Step 1: Escrever os testes primeiro**

Criar `tests/watch.test.js` com exatamente:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatToWatch } from '../web/src/watch.js';

const P = (name, serve, style) => ({ name, serve, style: style || {} });

test('favorito com saque elite → linha de saque forte, com o %', () => {
  const fav = P('Fav', { bpSavedPct: 0.67, servePtsWonPct: 0.69, returnPtsWonPct: 0.34 });
  const und = P('Und', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.some((l) => l.includes('Fav') && l.includes('segura bem o saque')));
  assert.ok(lines.some((l) => l.includes('67%')));
});

test('os dois devolvem acima da média → linha de jogo quebra-quebra', () => {
  const fav = P('A', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.41 });
  const und = P('B', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.42 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.some((l) => l.includes('devolvem acima da média')));
});

test('comeback alto → "vira de trás"', () => {
  const fav = P('Vira', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 }, { comeback: { pct: 52, n: 30 } });
  const und = P('B', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.some((l) => l.includes('Vira') && l.includes('virar de trás')));
});

test('comeback baixo → "desanda"', () => {
  const fav = P('Cai', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 }, { comeback: { pct: 12, n: 30 } });
  const und = P('B', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.some((l) => l.includes('Cai') && l.includes('desandar')));
});

test('sem sinais fortes → 1 linha neutra honesta', () => {
  const fav = P('A', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const und = P('B', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.35 });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('equilibrados'));
});

test('Challenger sem serve não quebra e cai no neutro', () => {
  const lines = whatToWatch(P('A'), P('B'), 'ATP');
  assert.equal(lines.length, 1);
});

test('no máximo 3 linhas', () => {
  const fav = P('Fav', { bpSavedPct: 0.67, servePtsWonPct: 0.69, returnPtsWonPct: 0.41 }, { comeback: { pct: 55, n: 30 } });
  const und = P('Und', { bpSavedPct: 0.60, servePtsWonPct: 0.62, returnPtsWonPct: 0.41 }, { comeback: { pct: 10, n: 30 } });
  const lines = whatToWatch(fav, und, 'ATP');
  assert.ok(lines.length <= 3);
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `node --test tests/watch.test.js`
Expected: FALHA com erro de módulo não encontrado (`web/src/watch.js`).

- [ ] **Step 3: Implementar `web/src/watch.js`**

Criar `web/src/watch.js` com exatamente:

```js
// "O que observar": eventos do jogo que costumam mover o mercado nesta dupla.
// Descritivo (do perfil de saque/devolução/estilo) e HONESTO — não prevê swing.
// Puro e testável. Ver tests/watch.test.js.
import { serveBand } from './analysis.js';

const strong = (r) => !!r && (r.band === 'high' || r.band === 'elite');

/**
 * Linhas de "o que observar" pra um confronto, escolhendo os sinais mais fortes.
 * fav / und = jogadores do modelo (com .serve e .style); tour = 'ATP' | 'WTA'.
 * Retorna string[] (1 a 3 linhas).
 */
export function whatToWatch(fav, und, tour) {
  const out = [];

  // 1. Favorito segura bem o saque → quebra é rara; o mercado exagera quando vem.
  if (fav.serve) {
    const bp = serveBand(tour, 'bpSavedPct', fav.serve.bpSavedPct);
    const sv = serveBand(tour, 'servePtsWonPct', fav.serve.servePtsWonPct);
    if (strong(bp) || strong(sv)) {
      const pct = Math.round((fav.serve.bpSavedPct || 0) * 100);
      const elite = bp?.band === 'elite' || sv?.band === 'elite';
      out.push({ w: elite ? 3 : 2, t: `${fav.name} segura bem o saque${pct ? ` (salva ${pct}% dos break points)` : ''}. Uma quebra nele é rara — quando vem, o mercado costuma exagerar.` });
    }
  }

  // 2. Jogo quebra-quebra: os dois devolvem acima da média → placar volátil.
  if (fav.serve && und.serve) {
    const rf = serveBand(tour, 'returnPtsWonPct', fav.serve.returnPtsWonPct);
    const ru = serveBand(tour, 'returnPtsWonPct', und.serve.returnPtsWonPct);
    if (strong(rf) && strong(ru)) {
      out.push({ w: 2, t: `Os dois devolvem acima da média: espere várias quebras e a odd balançando ao longo do set.` });
    }
  }

  // 3. Estilo de virada/queda (amostra mínima de 5 jogos).
  for (const p of [fav, und]) {
    const cb = p.style?.comeback;
    if (cb && cb.pct != null && cb.n >= 5) {
      if (cb.pct >= 45) out.push({ w: 1, t: `${p.name} costuma virar de trás (vence ${cb.pct}% quando perde o 1º set) — se cair um set, o mercado pode exagerar contra ele.` });
      else if (cb.pct <= 18) out.push({ w: 1, t: `${p.name} costuma desandar após perder o 1º set (vence só ${cb.pct}%) — um set atrás pode virar ladeira.` });
    }
  }

  out.sort((a, b) => b.w - a.w);
  const top = out.slice(0, 3).map((x) => x.t);
  if (!top.length) return [`Perfis equilibrados no saque e na devolução — sem um gatilho de mercado óbvio nesta dupla.`];
  return top;
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `node --test tests/watch.test.js`
Expected: todos os testes PASSAM.

- [ ] **Step 5: Suíte completa verde**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: `fail 0` (total = baseline + 7 novos).

- [ ] **Step 6: Commit**

```bash
git add web/src/watch.js tests/watch.test.js
git commit -m "$(cat <<'EOF'
feat(watch): módulo "o que observar" — sinais de mercado do perfil do confronto

Regras puras (saque forte do favorito, jogo quebra-quebra, estilo de
virada/queda) → linhas descritivas e honestas; fallback neutro. Usa serveBand.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Reformular o cartão ao vivo (`orCard` + CSS)

**Files:**
- Modify: `web/app.js` (bloco `orCard` dentro de `renderLive`)
- Modify: `web/styles.css` (classes `.or-*`)

- [ ] **Step 1: Trocar o bloco `orCard` no `renderLive`**

Em `web/app.js`, substituir exatamente:

```js
  let orCard;
  if (withLevel.length) {
    const s = withLevel[0];
    const dir = s.or.back ? `BACK no ${s.n}` : `LAY no ${s.n}`;
    orCard = `<div class="or-card">
      <div class="or-head">⚡ SOBRE-REAÇÃO ${s.or.level.toUpperCase()} · ${formatSignedPct(s.or.divPct)}</div>
      <div class="or-action">Valor em <strong>${dir}</strong></div>
      <div class="or-sub">Betfair paga ${s.mkt.toFixed(2)}, o justo é ${s.fair.toFixed(2)}. Medido pelo modelo — confira o motivo (lesão? cansaço?).</div>
    </div>`;
  } else if (signals.length) {
    orCard = `<div class="or-card or-neutral"><div class="or-head">Odd em linha com o justo</div><div class="or-sub">Sem exagero relevante do mercado nesse placar.</div></div>`;
  } else {
    orCard = '';
  }
```

por:

```js
  let orCard;
  if (withLevel.length) {
    const s = withLevel[0];
    const titulo = s.or.divPct > 0 ? `Mercado esticado no ${s.n}` : `Mercado curto no ${s.n}`;
    orCard = `<div class="or-card">
      <div class="or-top"><span class="or-title">${titulo}</span><span class="or-mag">${formatSignedPct(s.or.divPct)}</span></div>
      <div class="or-odds">
        <div class="or-odd"><span class="or-odd-lbl">Betfair paga</span><span class="or-odd-val">${s.mkt.toFixed(2)}</span></div>
        <div class="or-odd"><span class="or-odd-lbl">Âncora justa</span><span class="or-odd-val">${s.fair.toFixed(2)}</span></div>
      </div>
      <div class="or-note">Pode ser exagero — confira o motivo (lesão? cansaço?). Você decide.</div>
    </div>`;
  } else if (signals.length) {
    orCard = `<div class="or-card or-neutral"><div class="or-title">Odd em linha com a âncora</div><div class="or-note">Sem esticão relevante do mercado neste placar.</div></div>`;
  } else {
    orCard = '';
  }
```

- [ ] **Step 2: Trocar o CSS do cartão em `web/styles.css`**

Substituir exatamente (as linhas do `.or-card` e derivados — NÃO mexer em `.or-inputs`/`.or-in`):

```css
.or-card { margin-top: 12px; border-radius: 12px; padding: 13px 15px; color: #fff;
  background: linear-gradient(155deg, #1CC98A, #12A56C); }
.or-card.or-neutral { background: var(--hover); color: var(--text-2); }
.or-card .or-head { font-size: 12.5px; font-weight: 700; opacity: .95; }
.or-card .or-action { font-size: 15px; font-weight: 700; margin-top: 5px; }
.or-card .or-sub { font-size: 12px; opacity: .9; margin-top: 6px; line-height: 1.4; }
.or-card.or-neutral .or-sub { opacity: 1; color: var(--text-3); }
```

por:

```css
.or-card { margin-top: 12px; border-radius: 12px; padding: 14px 16px;
  background: var(--amber-dim); border: 1px solid rgba(224,145,47,0.30); color: var(--text-1); }
.or-card.or-neutral { background: var(--hover); border: none; color: var(--text-2); }
.or-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.or-title { font-size: 14.5px; font-weight: 700; }
.or-mag { background: var(--amber); color: #fff; font-size: 12.5px; font-weight: 700; padding: 3px 10px; border-radius: 8px; white-space: nowrap; }
.or-odds { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.or-odd { background: var(--card); border-radius: 10px; padding: 9px 12px; }
.or-odd-lbl { display: block; font-size: 11.5px; color: var(--text-2); }
.or-odd-val { display: block; font-size: 22px; font-weight: 800; margin-top: 2px; }
.or-note { font-size: 12.5px; color: var(--text-2); line-height: 1.4; }
.or-card.or-neutral .or-note { color: var(--text-3); }
```

- [ ] **Step 3: Checar sintaxe**

Run: `node --check web/app.js`
Expected: exit 0.

- [ ] **Step 4: Verificar no navegador**

Subir/abrir o preview (`node scripts/serve.mjs`, porta 5173). Escolher um jogo da grade → abrir "Trade ao vivo" → nas duas caixas "Betfair" informar odds que divergem do justo (ex.: se o justo do favorito é ~1.67, digitar 2.40 no outro jogador, ou mexer o placar pra criar divergência) até o cartão aparecer.
Conferir:
- Cartão **âmbar** (não verde), título `Mercado esticado no {jogador}` (ou `curto`), selo com o `%`, os dois números `Betfair paga` / `Âncora justa`, e a linha `Pode ser exagero — confira o motivo… Você decide.`
- **Não** aparece "Valor em BACK/LAY" nem "SOBRE-REAÇÃO" em caixa-alta.
- Alternar tema (claro/escuro) — legível nos dois. Console limpo.
- Screenshot como prova.

- [ ] **Step 5: Commit**

```bash
git add web/app.js web/styles.css
git commit -m "$(cat <<'EOF'
refactor(ao-vivo): cartão de sobre-reação vira observação honesta

Tira "Valor em BACK/LAY" e o fundo verde (= "entra"); vira "mercado
esticado/curto no X" + Betfair vs âncora justa + "confira o motivo, você
decide", num cartão âmbar calmo. Cálculo (inplay.js) intacto.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: "O que observar" na leitura (`renderWatch` + CSS)

**Files:**
- Modify: `web/app.js` (import de `whatToWatch`; função `renderWatch`; inserir na `renderReading`)
- Modify: `web/styles.css` (classes `.watch*`)

- [ ] **Step 1: Importar `whatToWatch`**

Em `web/app.js`, logo após a linha `import { searchPlayers } from './src/player-search.js';`, adicionar:

```js
import { whatToWatch } from './src/watch.js';
```

- [ ] **Step 2: Adicionar a função `renderWatch`**

Em `web/app.js`, imediatamente ANTES de `function renderReading() {`, inserir:

```js
function renderWatch(r) {
  const favIsA = r.favorite === anal.a.name;
  const fav = favIsA ? anal.a : anal.b;
  const und = favIsA ? anal.b : anal.a;
  const lines = whatToWatch(fav, und, anal.tour);
  return `<div class="watch">
      <div class="watch-head">👁️ O que observar</div>
      ${lines.map((l) => `<p class="watch-line">${l}</p>`).join('')}
      <p class="watch-foot">Leitura dos perfis — o que costuma mexer o mercado, não garantia.</p>
    </div>`;
}
```

- [ ] **Step 3: Inserir o bloco na `renderReading`**

Em `web/app.js`, dentro do `return` da `renderReading`, substituir:

```js
      ${renderTactics(r)}
    </div>
```

por:

```js
      ${renderTactics(r)}
      ${renderWatch(r)}
    </div>
```

- [ ] **Step 4: Adicionar o CSS do bloco em `web/styles.css`**

Logo após a linha `.or-card.or-neutral .or-note { color: var(--text-3); }` (adicionada na Task 2), inserir:

```css
.watch { margin-top: 12px; padding: 12px 14px; background: var(--hover); border-radius: 12px; }
.watch-head { font-size: 13.5px; font-weight: 800; margin-bottom: 6px; }
.watch-line { font-size: 13px; color: var(--text-1); line-height: 1.5; margin-top: 6px; }
.watch-foot { font-size: 11.5px; color: var(--text-3); margin-top: 8px; }
```

- [ ] **Step 5: Checar sintaxe**

Run: `node --check web/app.js`
Expected: exit 0.

- [ ] **Step 6: Verificar no navegador**

Recarregar o preview. Escolher um confronto de tour com dados ricos (ex.: Rublev × Tabilo, ou Sinner × alguém).
Conferir:
- Abaixo da "💡 Leitura pro trade" aparece o bloco **👁️ O que observar** com 1–3 linhas coerentes com o confronto (ex.: saque forte do favorito / jogo quebra-quebra / estilo), e o rodapé "Leitura dos perfis — … não garantia".
- Testar um confronto sem sinais fortes / um Challenger sem `serve` → aparece a linha neutra "Perfis equilibrados…", sem quebrar.
- Claro/escuro legível; console limpo. Screenshot como prova.

- [ ] **Step 7: `npm test` + commit**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → `fail 0`.

```bash
git add web/app.js web/styles.css
git commit -m "$(cat <<'EOF'
feat(leitura): bloco "o que observar" no confronto

Renderiza whatToWatch() abaixo da leitura tática: o que vigiar no mercado
nesta dupla (saque forte, jogo quebra-quebra, estilo de virada/queda), com
rodapé honesto. Cai em linha neutra quando não há gatilho.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Verificação final

- [ ] `npm test` verde (`fail 0`), com os 7 testes novos de `watch`.
- [ ] `node --check web/app.js` exit 0.
- [ ] No navegador (claro e escuro): cartão ao vivo âmbar sem comando; bloco "o que observar" na leitura; nada de "Valor em BACK", "SOBRE-REAÇÃO" caixa-alta ou fundo verde. Screenshot de prova.
- [ ] Publicar conforme a convenção (merge no `main` → deploy Pages), confirmando com o Felipe.

## Notas
- Sem bump do SW: só muda conteúdo JS/CSS, servido network-first.
- Thresholds do `comeback` (≥45 vira / ≤18 desanda) são heurísticos, sinalizados no código; o número real vai sempre no texto (honesto).
- Regra de melhor-de-5 ficou fora (a leitura não carrega `bestOf`); pode entrar depois se fizer falta.
