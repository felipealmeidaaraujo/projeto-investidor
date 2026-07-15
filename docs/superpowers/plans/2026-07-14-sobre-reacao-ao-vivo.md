# Sobre-reação no trade ao vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox.

**Goal:** Detector acionável de sobre-reação no Trade ao vivo: odd de mercado (Betfair, digitada) vs odd justa (modelo) → veredito back/lay por nível.

**Spec:** `docs/superpowers/specs/2026-07-14-sobre-reacao-ao-vivo-design.md`

---

## Task 1: `overreaction()` (função pura)

**Files:** Modify `web/src/inplay.js`; Test `tests/inplay.test.js`

- [ ] **Step 1: Testes que falham** — ampliar o import em `tests/inplay.test.js` (linha 3) para incluir `overreaction` e adicionar ao fim:
```js
test('overreaction: mercado paga mais que o justo → back; níveis conservadores', () => {
  // justo 2.0, mercado 2.4 = +20% → leve, back
  let r = overreaction(2.0, 2.4);
  approx(r.divPct, 20); assert.equal(r.level, 'leve'); assert.equal(r.back, true);
  // +30% → moderada
  assert.equal(overreaction(2.0, 2.6).level, 'moderada');
  // +50% → forte
  assert.equal(overreaction(2.0, 3.0).level, 'forte');
});
test('overreaction: mercado paga menos → lay; abaixo de 15% → em linha (level null)', () => {
  const r = overreaction(2.0, 1.5); // -25% → moderada, lay
  assert.equal(r.back, false); assert.equal(r.level, 'moderada');
  assert.equal(overreaction(2.0, 2.2).level, null); // +10% → em linha
});
test('overreaction: entradas inválidas → null', () => {
  assert.equal(overreaction(1, 2.0), null);
  assert.equal(overreaction(2.0, null), null);
  assert.equal(overreaction(2.0, 0.9), null);
  assert.equal(overreaction(Infinity, 2.0), null);
});
```
Import (linha 3):
```js
import { holdProb, winProbFromState, impliedServeProbs, liveFairOdds, overreaction } from '../web/src/inplay.js';
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test tests/inplay.test.js` → FAIL.

- [ ] **Step 3: Implementar** — adicionar ao fim de `web/src/inplay.js`:
```js
const OVERREACTION_BANDS = [
  { min: 40, level: 'forte' },
  { min: 25, level: 'moderada' },
  { min: 15, level: 'leve' },
];

/**
 * Sobre-reação: compara a odd de mercado com a odd justa de um jogador.
 * divPct > 0 = mercado paga mais que o justo (subestima → valor em BACK nele).
 * divPct < 0 = mercado paga menos (superestima → valor em LAY nele).
 * level null = divergência < 15% (odd em linha). null se odds inválidas.
 */
export function overreaction(fairOdd, marketOdd) {
  if (!(fairOdd > 1) || !(marketOdd > 1)) return null;
  const divPct = (marketOdd / fairOdd - 1) * 100;
  const abs = Math.abs(divPct);
  const band = OVERREACTION_BANDS.find((b) => abs >= b.min);
  return { divPct, level: band ? band.level : null, back: divPct > 0 };
}
```

- [ ] **Step 4: Rodar e ver passar** — `node --test tests/inplay.test.js` → PASS.

- [ ] **Step 5: Commit**
```bash
git add web/src/inplay.js tests/inplay.test.js
git commit -m "feat(inplay): overreaction (mercado ao vivo vs odd justa)"
```

---

## Task 2: UI de sobre-reação no `renderLive`

**Files:** Modify `web/app.js` (import `overreaction`; `anal.live`; `renderLive`; handlers)

- [ ] **Step 1: Import** — na linha 7 (import de inplay), adicionar `overreaction`.

- [ ] **Step 2: Estado** — na definição de `anal.live` (`{ active, setsA, ... bestOf }`), adicionar `mktA: null, mktB: null`.

- [ ] **Step 3: Bloco de sobre-reação no `renderLive`** — antes do `return`, montar (usa `probA`/`probB` já calculados; nomes `aN`/`bN`):
```js
  const fairA = 1 / probA, fairB = 1 / probB;
  const orA = overreaction(fairA, L.mktA);
  const orB = overreaction(fairB, L.mktB);
  const signals = [
    { n: aN, fair: fairA, mkt: L.mktA, or: orA },
    { n: bN, fair: fairB, mkt: L.mktB, or: orB },
  ].filter((s) => s.or);
  const withLevel = signals.filter((s) => s.or.level).sort((a, b) => Math.abs(b.or.divPct) - Math.abs(a.or.divPct));
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
    orCard = `<div class="field-hint" style="margin-top:8px">Informe a odd que a Betfair está pagando pra checar sobre-reação.</div>`;
  }
  const mktInput = (side, v) => `<button class="value-input" data-mkt="${side}">${v != null ? v.toFixed(2) : 'informar'}</button>`;
```

- [ ] **Step 4: Inserir no HTML do `renderLive`** — dentro do `reading-card` da odd justa, após a `reading-note`, adicionar:
```js
        <div class="or-inputs">
          <div class="or-in"><span class="live-lbl">Betfair · ${aN}</span>${mktInput('A', L.mktA)}</div>
          <div class="or-in"><span class="live-lbl">Betfair · ${bN}</span>${mktInput('B', L.mktB)}</div>
        </div>
        ${orCard}
```

- [ ] **Step 5: Handlers** — no wiring de `renderAnalise` (onde estão os `data-live`/`data-server`), adicionar:
```js
  analiseEl.querySelectorAll('[data-mkt]').forEach((b) =>
    b.addEventListener('click', () => {
      const side = b.dataset.mkt;
      openKeypad({ title: `Odd Betfair · ${side === 'A' ? anal.a.name : anal.b.name}`, value: side === 'A' ? anal.live.mktA : anal.live.mktB, mode: 'odd', onConfirm: (v) => { if (side === 'A') anal.live.mktA = v; else anal.live.mktB = v; renderAnalise(); } })
    })
  );
```

- [ ] **Step 6: CSS** — em `web/styles.css` (perto de `.live-value`), adicionar:
```css
.or-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.or-in { display: flex; flex-direction: column; gap: 6px; }
.or-card { margin-top: 12px; border-radius: 12px; padding: 13px 15px; color: #fff; background: linear-gradient(155deg, #1CC98A, #12A56C); }
.or-card.or-neutral { background: var(--hover); color: var(--text-2); }
.or-card .or-head { font-size: 12.5px; font-weight: 700; opacity: .95; }
.or-card .or-action { font-size: 15px; font-weight: 700; margin-top: 5px; }
.or-card .or-sub { font-size: 12px; opacity: .9; margin-top: 6px; line-height: 1.4; }
.or-card.or-neutral .or-sub { opacity: 1; color: var(--text-3); }
```

- [ ] **Step 7: Verificar** — `node --check web/app.js` OK; `npm test` verde; `npm run dev` → Análise → Trade ao vivo: informar odds de Betfair, conferir veredito (back/lay/nível/em linha) e console limpo.

- [ ] **Step 8: Commit**
```bash
git add web/app.js web/styles.css
git commit -m "feat(ao vivo): detector de sobre-reacao (mercado vs justa, veredito back/lay)"
```

---

## Task 3: Verificação final, revisão e publicação

- [ ] **Step 1:** `npm test` verde; `node --check web/app.js` OK.
- [ ] **Step 2:** Preview isolado da lógica `overreaction` (níveis/back/lay) via `get_page_text`; app real (index.html) carrega sem erro no console.
- [ ] **Step 3:** Revisão adversarial do diff (níveis nos limiares exatos, back/lay, prob decidido → null, escolha do sinal mais forte, keypad).
- [ ] **Step 4:** Aplicar correções reais.
- [ ] **Step 5:** `git push`; reportar ao Felipe (com a ressalva do modelo).

---

## Notas

- É ferramenta de leitura ao vivo — não persiste nada no trade.
- Reusa `openKeypad mode:'odd'` (Entrega 1) e o motor `liveFairOdds`.
