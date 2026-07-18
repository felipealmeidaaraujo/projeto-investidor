# Cobertura do momento de carreira — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar o "momento de carreira" para (A) o Shelbayh (transliteração TML×Sackmann, via allowlist curada) e (C) 19 ATP + 5 WTA veteranos fora do snapshot de ranking (via âncora por jogador com portão de recência).

**Architecture:** Duas mudanças puras em `pipeline/rankings.js`, testadas em `tests/rankings.test.js`. **A** = allowlist de `player_id` que pula o guarda-corpo de nome só para ids confirmados à mão. **C** = `buildTrajectories` ancora cada jogador no snapshot global (saída idêntica pra quem está nele) ou no próprio último ranking, se dentro de `MAX_STALE_DAYS`. Nada muda em `career.js`, `EloEngine`, `serve-stats.js` ou `patterns-ingest.js`. A regeneração real é só `node pipeline/rankings-ingest.js` (lê o `bio.id`/`fullName` já no modelo).

**Tech Stack:** Node.js (ES modules), test runner nativo (`node --test`), sem libs novas. Spec: [`docs/superpowers/specs/2026-07-18-cobertura-momento-carreira-design.md`](../specs/2026-07-18-cobertura-momento-carreira-design.md).

---

## File Structure

- **Modify:** `pipeline/rankings.js`
  - `buildTrajectories` (atual linhas 112-156): âncora por jogador + portão de recência.
  - `resolvePlayers` (atual linhas 166-219): allowlist `TRANSLIT_CONFIRMADO`.
  - Novo helper `daysBetween` (perto de `toDate`/`toInt`, ~linha 33) e const `MAX_STALE_DAYS`.
- **Modify (testes):** `tests/rankings.test.js` (adiciona testes de C e A; os existentes têm que continuar verdes sem mudança).
- **Regenera (dado, não código):** `web/model-atp.json`, `web/model-wta.json` via `node pipeline/rankings-ingest.js` (Task 3).

**Não tocar:** `web/src/career.js`, `pipeline/elo*.js`, `pipeline/engine-fingerprint.js` (a trajetória é pós-calibração; o fingerprint do motor não é afetado), `pipeline/serve-stats.js`, `pipeline/patterns-ingest.js`.

---

## Task 1: C — âncora por jogador com portão de recência em `buildTrajectories`

**Files:**
- Modify: `pipeline/rankings.js` (helper `daysBetween` ~linha 33; `buildTrajectories` linhas 112-156)
- Test: `tests/rankings.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao fim de `tests/rankings.test.js`:

```js
test('buildTrajectories: fora do snapshot global mas recente (dentro do portão) é recuperado, ancorado no próprio ranking', () => {
  // 111 está no snapshot global (20260608). 222 saiu: último ranking 20260525 (14 dias antes).
  const csv = [
    'ranking_date,rank,player,points',
    '20250609,10,111,3000',
    '20260608,8,111,3200',   // snapshot global
    '20250526,300,222,120',  // ~12m antes do último ranking do 222
    '20260525,673,222,50',   // último do 222, 14 dias antes do snapshot -> dentro do portão
  ].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  const v = t.get('222');
  assert.equal(v.rank, 673);
  assert.equal(v.snapshotDate, 20260525); // âncora = o próprio último ranking (o careerText mostra como 'as of')
  assert.equal(v.rank12m, 300);
  assert.equal(v.points12m, 120);
});

test('buildTrajectories: fora do snapshot e velho demais (além do portão) fica de fora', () => {
  // 222 último ranking 20250721, ~322 dias antes de 20260608: não entra (dado velho seria mentira).
  const csv = [
    'ranking_date,rank,player,points',
    '20260608,8,111,3200',
    '20250721,188,222,900',
  ].join('\n');
  const t = buildTrajectories(parseRankingRows(csv));
  assert.equal(t.has('222'), false);
  assert.equal(t.has('111'), true);
});

test('buildTrajectories: o portão de recência é uma fronteira exata', () => {
  // 20260101 -> 20260608 = 158 dias exatos.
  const csv = [
    'ranking_date,rank,player,points',
    '20260608,1,111,9000',
    '20260101,500,222,80',
  ].join('\n');
  assert.equal(buildTrajectories(parseRankingRows(csv), { maxStaleDays: 158 }).has('222'), true);
  assert.equal(buildTrajectories(parseRankingRows(csv), { maxStaleDays: 157 }).has('222'), false);
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `node --test tests/rankings.test.js`
Expected: os 3 novos testes FALHAM (`222` fica de fora hoje → `t.get('222')` é `undefined`, `v.rank` estoura; a fronteira não existe). Os demais passam.

- [ ] **Step 3: Adicionar o helper `daysBetween` e a const `MAX_STALE_DAYS`**

Em `pipeline/rankings.js`, logo após a definição de `toInt` (atual linha 33), adicione:

```js
/** Dias entre duas datas AAAAMMDD (valor absoluto). Usa o mesmo `toDate` do resto
 *  do arquivo, então o fuso se cancela. */
const daysBetween = (a, b) => Math.abs(toDate(a) - toDate(b)) / 86400000;
```

- [ ] **Step 4: Reescrever `buildTrajectories`**

Substitua a função inteira (atual linhas 112-156) por:

```js
const MAX_STALE_DAYS = 120; // fora do snapshot global, quão velho pode ser o último ranking do jogador

/** Rows -> trajetória por player_id. Ancorada no snapshot global quando o jogador está
 *  nele (saída IDÊNTICA à âncora global de antes); senão no ranking mais recente DELE,
 *  desde que dentro do portão de recência — rotular dado velho como se fosse de hoje
 *  seria mentira. A mudança é aditiva: quem já tinha trajetória não muda. */
export function buildTrajectories(rows, { maxStaleDays = MAX_STALE_DAYS } = {}) {
  if (!rows) return new Map(); // guarda: null/undefined não estoura em latestDate
  const snapshotDate = latestDate(rows);
  if (!snapshotDate) return new Map();
  const dates = [...new Set(rows.map((r) => r.date))];

  const byId = new Map();
  for (const r of rows) {
    let s = byId.get(r.id);
    if (!s) { s = []; byId.set(r.id, s); }
    s.push(r);
  }

  const out = new Map();
  for (const [id, serie] of byId) {
    serie.sort((a, b) => a.date - b.date); // peak/spikeOf dependem da ordem; e precisamos do último
    // Âncora: o snapshot global se o jogador está nele; senão o ranking mais recente
    // DELE, se não estiver velho demais. Para quem está no snapshot, anchorDate ===
    // snapshotDate e o date12m é o mesmo global -> saída idêntica à versão anterior.
    let anchorRow = serie.find((s) => s.date === snapshotDate);
    if (!anchorRow) {
      const ultimo = serie[serie.length - 1];
      if (daysBetween(snapshotDate, ultimo.date) > maxStaleDays) continue;
      anchorRow = ultimo;
    }
    const anchorDate = anchorRow.date;
    const date12m = nearestDate(dates, minus12Months(anchorDate));
    const antes = serie.find((s) => s.date === date12m) || null;
    let peak = Infinity;
    let peakDate = null;
    for (const s of serie) if (s.rank < peak) { peak = s.rank; peakDate = s.date; }
    const spike = antes ? spikeOf(serie, date12m, anchorDate) : null;
    out.set(id, {
      rank: anchorRow.rank,
      points: anchorRow.points,
      rank12m: antes ? antes.rank : null,
      points12m: antes ? antes.points : null,
      peak: peak === Infinity ? null : peak,
      peakDate,
      // snapshotDate agora é a data da ÂNCORA do jogador (global para quem está no
      // snapshot; o próprio último ranking para os recuperados). O careerText já publica
      // isso como 'as of DD/MM/AAAA'.
      snapshotDate: anchorDate,
      date12m,
      spikePct: spike ? spike.pct : null,
      spikeDate: spike ? spike.date : null,
      spikeGanho: spike ? spike.ganho : null,
      spikeTotal: spike ? spike.total : null,
    });
  }
  return out;
}
```

- [ ] **Step 5: Rodar os testes do arquivo e confirmar que passam (novos + regressão)**

Run: `node --test tests/rankings.test.js`
Expected: PASS em todos — os 3 novos e **todos os existentes de `buildTrajectories`** (a garantia byte-idêntica em nível de unidade). Em especial, `buildTrajectories: quem não está no snapshot de hoje fica fora` continua passando (222 a 364 dias > 120 → excluído).

- [ ] **Step 6: Commit**

```bash
git add pipeline/rankings.js tests/rankings.test.js
git commit -m "feat(trajetoria): ancora por jogador com portao de recencia (recupera veteranos fora do snapshot)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: A — allowlist curada de transliterações em `resolvePlayers`

**Files:**
- Modify: `pipeline/rankings.js` (const `TRANSLIT_CONFIRMADO` perto de `MAX_AGE_GAP_YEARS` ~linha 158; match + guarda-corpo linhas 178 e 189)
- Test: `tests/rankings.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao fim de `tests/rankings.test.js`:

```js
test('resolvePlayers: transliteração confirmada por id (Shelbayh) resolve apesar de fullName != bio.name', () => {
  // Abedallah (Sackmann) vs Abdullah (TML): mesma pessoa, só transliterada. id 209406 na allowlist.
  const players = [{ name: 'Shelbayh A.', fullName: 'Abdullah Shelbayh', lastDate: 20260525, bio: { id: '209406', name: 'Abedallah Shelbayh', age: 22.5 } }];
  const meta = new Map([['209406', { fullName: 'Abedallah Shelbayh', dob: 20031116 }]]);
  const { resolved } = resolvePlayers(['209406'], players, meta);
  assert.equal(resolved.get('209406').name, 'Shelbayh A.');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/rankings.test.js`
Expected: o novo teste FALHA — hoje o guarda-corpo `bio.name != fullName` recusa o Shelbayh, então `resolved.get('209406')` é `undefined`.

- [ ] **Step 3: Adicionar a const `TRANSLIT_CONFIRMADO`**

Em `pipeline/rankings.js`, logo após `const MAX_AGE_GAP_YEARS = 2;` (atual linha 158), adicione:

```js
// Transliterações confirmadas à mão: o mesmo jogador escrito diferente entre o TML
// (p.fullName) e o Sackmann (bio.name). NÃO é heurística — é uma allowlist por
// player_id, porque de nome sozinho "Abdullah/Abedallah Shelbayh" (uma pessoa) é
// indistinguível de "Yafan/Yuhan Wang" (duas). Só entra um id verificado; o check de
// QA (bio.name != fullName na verificação) revela novos casos para curadoria futura.
const TRANSLIT_CONFIRMADO = new Set([
  '209406', // Abedallah Shelbayh (Sackmann) = Abdullah Shelbayh (TML)
]);
```

- [ ] **Step 4: Ajustar o match e o guarda-corpo em `resolvePlayers`**

Localize (atual linha 178):
```js
    const p = byBioId.get(String(id)) || findModelPlayer(m.fullName, players);
    if (!p) continue;
```
Substitua por:
```js
    const porId = byBioId.get(String(id));
    const p = porId || findModelPlayer(m.fullName, players);
    if (!p) continue;
```

Localize o guarda-corpo (atual linha 189):
```js
    if (p.bio && p.bio.name && p.fullName && normName(p.bio.name) !== normName(p.fullName)) continue;
```
Substitua por:
```js
    // guarda-corpo de bio contaminado — exceto transliterações confirmadas do próprio id.
    // Só afrouxa para ids na allowlist; nunca por heurística (a contaminação da Wang,
    // id 264205, continua recusada — teste :275).
    const transliteracaoOk = porId && TRANSLIT_CONFIRMADO.has(String(id));
    if (!transliteracaoOk && p.bio && p.bio.name && p.fullName && normName(p.bio.name) !== normName(p.fullName)) continue;
```

- [ ] **Step 5: Rodar os testes do arquivo e confirmar que passam (novo + regressão da contaminação)**

Run: `node --test tests/rankings.test.js`
Expected: PASS em todos. Em especial, o teste existente `resolvePlayers: bio de outra pessoa (fullName != bio.name) é recusado` (o caso Wang, id `264205` fora da allowlist) **continua passando sem alteração**.

- [ ] **Step 6: Commit**

```bash
git add pipeline/rankings.js tests/rankings.test.js
git commit -m "feat(trajetoria): allowlist curada de transliteracao por player_id (destrava o Shelbayh)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Regeneração real e verificação de ponta a ponta

**Files:**
- Regenera: `web/model-atp.json`, `web/model-wta.json`
- Nenhum código muda nesta task.

- [ ] **Step 1: Rodar a suíte inteira (baseline verde antes de regenerar)**

Run: `npm test`
Expected: PASS (333 anteriores + 4 novos = ~337). Zero falhas. Se algo falhar, voltar às Tasks 1-2.

- [ ] **Step 2: Regenerar a trajetória sobre os modelos atuais**

Run: `node pipeline/rankings-ingest.js`
Expected (stdout): duas linhas de cobertura, ex.:
```
web/model-atp.json: <N> jogadores com trajetória — <X>/879 ativos (9X.X%). <k> excluídos por ambiguidade: Tsitsipas P., Li Z., Suresh D., Petrovic D.
web/model-wta.json: <N> jogadores com trajetória — <Y>/381 ativos (9X.X%). ...
```
A cobertura de ativos deve **subir** vs. antes (mais recuperados). O guarda de 80% não pode disparar (se disparar, nada é gravado — investigar).

- [ ] **Step 3: Verificar os desfechos no dado real**

Run:
```bash
node -e "
const norm=s=>(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z]/g,'');
const atp=require('./web/model-atp.json').players, wta=require('./web/model-wta.json').players;
const she=atp.find(p=>/Shelbayh/.test(p.name));
console.log('A) Shelbayh career?', !!she.career, '| rank', she.career&&she.career.rank);
const rec=['Gasquet R.','Schwartzman D.','Koepfer D.','Cressy M.','Paire B.'];
for(const n of rec){const p=atp.find(x=>x.name===n); console.log('C) '+n, p&&p.career?('career as of '+p.career.snapshotDate):'SEM career');}
const err=wta.find(p=>p.name==='Errani S.'); console.log('C) Errani S.', err&&err.career?'career as of '+err.career.snapshotDate:'SEM career');
const fog=atp.find(p=>p.name==='Fognini F.'); console.log('velho: Fognini career?', !!(fog&&fog.career), '(esperado false)');
const contam=atp.filter(p=>p.bio&&p.bio.name&&p.fullName&&norm(p.bio.name)!==norm(p.fullName));
console.log('unico bio.name!=fullName (esperado so Shelbayh):', contam.map(p=>p.name).join(',')||'nenhum');
"
```
Expected:
- `A) Shelbayh career? true` (rank ~308).
- `C) Gasquet/Schwartzman/Koepfer/Cressy/Paire/Errani` todos com `career as of <data recente>`.
- `velho: Fognini career? false`.
- `unico bio.name!=fullName ... Shelbayh A.` (segue sendo o único, agora com trajetória).

- [ ] **Step 4: Rodar a suíte inteira de novo (garante que os modelos regenerados não quebram nada)**

Run: `npm test`
Expected: PASS em tudo, incluindo `tests/engine-fingerprint.test.js` (a trajetória é pós-calibração; o fingerprint do motor não muda).

- [ ] **Step 5: Commit dos modelos regenerados**

```bash
git add web/model-atp.json web/model-wta.json
git commit -m "data(trajetoria): regenera modelos — Shelbayh + veteranos recuperados

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (feito na escrita do plano)

**1. Cobertura da spec:**
- Spec "A — allowlist curada" → Task 2 (const + guard + teste Shelbayh + regressão :275). ✓
- Spec "C — âncora por jogador com portão" → Task 1 (buildTrajectories + daysBetween + 3 testes). ✓
- Spec "Testes" (C: recuperado/gated/fronteira; A: allowlist/regressão) → Tasks 1-2 Steps 1. ✓
- Spec "Re-geração e verificação" (byte-idêntico, Shelbayh, 24 recuperados, sem velhos, suíte verde) → Task 3. ✓
- Spec "Fora de escopo" (não tocar career.js/EloEngine/serve-stats/patterns-ingest) → respeitado (File Structure "Não tocar"). ✓

**2. Placeholders:** nenhum "TBD/TODO"; todo código está completo. ✓

**3. Consistência de tipos/nomes:** `MAX_STALE_DAYS`, `maxStaleDays` (opção), `daysBetween`, `TRANSLIT_CONFIRMADO`, `porId`, `transliteracaoOk`, `anchorRow`/`anchorDate` — usados de forma consistente entre Task 1 e Task 2 e batendo com a spec. `buildTrajectories(rows, { maxStaleDays })` é a mesma assinatura no código e nos testes. ✓
