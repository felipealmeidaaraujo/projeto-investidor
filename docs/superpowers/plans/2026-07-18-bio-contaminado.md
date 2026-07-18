# Bio Contaminado no patterns-ingest — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parar o `patterns-ingest.js` de colar o bio/estilo/pressão de outra pessoa em homônimos, resolvendo a identidade de cada slot pelo `player_id` do Sackmann ancorado no `p.fullName` do `serve-stats`.

**Architecture:** A lógica de resolução vira uma função **pura** testável (`resolveSlotOwners`) em `pipeline/patterns.js`; o `patterns-ingest.js` (IO) passa a montar as entries de cada slot a partir dela e a pular por completo os slots não resolvidos (homônimo real indistinguível). Nada muda em `rankings.js` nem em `serve-stats.js`.

**Tech Stack:** JavaScript ESM puro, `node --test` (node:test + node:assert/strict), sem dependências novas. `patterns-ingest.js` e `rankings-ingest.js` são scripts de IO (fetch do mirror Sackmann), verificados re-gerando os modelos.

## Global Constraints

- **Identidade = `player_id`, âncora = `fullName`.** Em slot ambíguo (≥2 nomes do Sackmann casam via `matchPlayer`): com `p.fullName` → o candidato cujo `normName` == `normName(p.fullName)`; sem `fullName` → merge se todos os candidatos têm o mesmo `bio.id`, senão **sem enriquecimento**.
- **1 candidato NÃO é revalidado contra `fullName`** — usa-se ele, como hoje (evita quebrar nomes com formato diferente entre fontes, ex. "Alexander Zverev" no Sackmann vs. "Alex Zverev" no TML).
- **Slot não resolvido = sem `style`, `pressure` E `bio`** (as entries misturadas contaminam tudo, não só o bio). Silêncio na tela; sem mensagem especial.
- **`resolveSlotOwners(byName, players)` → `Map<p.name, string[]>`**; slots não resolvidos ficam FORA do mapa.
- **Ordem do pipeline:** `serve-stats.js` roda ANTES de `patterns-ingest.js` (já é assim no `update-model.yml`), garantindo `p.fullName`.
- **Comando de teste:** um arquivo → `node --test tests/patterns.test.js`; suíte toda → `npm test`.
- Repo em pt-BR (identificadores/comentários) — padrão do projeto.

---

## Arquivos tocados

- `pipeline/patterns.js` — Task 1 (nova função pura `resolveSlotOwners`)
- `tests/patterns.test.js` — Task 1 (testes da função)
- `pipeline/patterns-ingest.js` — Task 2 (usa a função; pula não resolvidos)
- `web/model-atp.json`, `web/model-wta.json` — Task 2 (regenerados pela verificação)

---

### Task 1: Função pura `resolveSlotOwners`

**Files:**
- Modify: `pipeline/patterns.js` (novo export no fim; novo import no topo)
- Test: `tests/patterns.test.js`

**Interfaces:**
- Consumes: `matchPlayer`, `normName` de `web/src/match-names.js`; a forma das entries de `groupByPlayer` (cada entry tem `entry.bio.id` e `entry.bio.name`).
- Produces: `resolveSlotOwners(byName, players): Map<string, string[]>` — para cada slot resolvido, os nomes do Sackmann (chaves de `byName`) cujas entries usar.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `tests/patterns.test.js`:

```js
import { resolveSlotOwners } from '../pipeline/patterns.js';
import { normName } from '../web/src/match-names.js';

// entry mínima: resolveSlotOwners só olha entry.bio.id; bio.name serve pro invariante.
const ent = (id, name) => ({ bio: { id, name } });

test('resolveSlotOwners: sem ambiguidade — 1 candidato é usado', () => {
  const players = [{ name: 'Sinner J.', fullName: 'Jannik Sinner' }];
  const byName = new Map([['Jannik Sinner', [ent('207989', 'Jannik Sinner')]]]);
  assert.deepEqual(resolveSlotOwners(byName, players).get('Sinner J.'), ['Jannik Sinner']);
});

test('resolveSlotOwners: ambíguo COM fullName escolhe a pessoa certa', () => {
  const players = [{ name: 'Wang Y.', fullName: 'Yafan Wang' }];
  const byName = new Map([
    ['Yafan Wang', [ent('206374', 'Yafan Wang')]],
    ['Yuhan Wang', [ent('264205', 'Yuhan Wang')]],
    ['Yuping Wang', [ent('300000', 'Yuping Wang')]],
  ]);
  assert.deepEqual(resolveSlotOwners(byName, players).get('Wang Y.'), ['Yafan Wang']);
});

test('resolveSlotOwners: ambíguo SEM fullName, MESMO id → merge das variantes de grafia', () => {
  const players = [{ name: 'Chung Y.' }]; // sem fullName
  const byName = new Map([
    ['Yunseong Chung', [ent('123', 'Yunseong Chung')]],
    ['Yun Seong Chung', [ent('123', 'Yun Seong Chung')]],
  ]);
  const donos = resolveSlotOwners(byName, players).get('Chung Y.');
  assert.deepEqual([...donos].sort(), ['Yun Seong Chung', 'Yunseong Chung']);
});

test('resolveSlotOwners: ambíguo SEM fullName, ids DISTINTOS (irmãos) → slot fica sem dono', () => {
  const players = [{ name: 'Blanch D.' }];
  const byName = new Map([
    ['Darwin Blanch', [ent('111', 'Darwin Blanch')]],
    ['Dali Blanch', [ent('222', 'Dali Blanch')]],
  ]);
  assert.equal(resolveSlotOwners(byName, players).has('Blanch D.'), false);
});

test('resolveSlotOwners: invariante — as entries do slot resolvido são todas do fullName', () => {
  const players = [{ name: 'Wang Y.', fullName: 'Yafan Wang' }];
  const byName = new Map([
    ['Yafan Wang', [ent('206374', 'Yafan Wang')]],
    ['Yuhan Wang', [ent('264205', 'Yuhan Wang')]],
  ]);
  const donos = resolveSlotOwners(byName, players).get('Wang Y.');
  const entries = donos.flatMap((f) => byName.get(f));
  assert.ok(entries.every((e) => normName(e.bio.name) === normName('Yafan Wang')));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/patterns.test.js`
Expected: FAIL — `resolveSlotOwners` não existe (import quebra / não é função).

- [ ] **Step 3: Implementar a função**

Em `pipeline/patterns.js`, adicionar ao import do topo (que hoje é `import { stylePatterns, pressurePatterns } from './game-patterns.js';`) uma nova linha de import:

```js
import { matchPlayer, normName } from '../web/src/match-names.js';
```

E adicionar ao fim do arquivo:

```js
/** Para cada slot do modelo, decide quais nomes do Sackmann (chaves de `byName`) são da
 *  MESMA pessoa que o slot, resolvendo homônimos pelo player_id e pelo `p.fullName`.
 *
 *  Por que isto existe: `matchPlayer` casa por sobrenome + inicial, então "Yafan Wang",
 *  "Yuhan Wang" e "Yuping Wang" caem todas no slot "Wang Y.". Concatenar as três (o que o
 *  patterns-ingest fazia) colava o bio/estilo de uma pessoa arbitrária. Aqui:
 *   - 1 candidato → usa ele (não revalida contra fullName: formatos diferem entre fontes).
 *   - ≥2 candidatos, com p.fullName (resolvido pelo serve-stats, que roda antes) → o
 *     candidato cujo nome normaliza igual ao fullName.
 *   - ≥2 candidatos, sem fullName → merge se todos têm o MESMO bio.id (variantes de
 *     grafia da mesma pessoa); ids distintos (homônimos reais) → slot sem dono (sem bio).
 *  @param {Map<string, Array<{bio:{id:string}}>>} byName  nome Sackmann → entries
 *  @param {Array<{name:string, fullName?:string}>} players  jogadores do modelo
 *  @returns {Map<string, string[]>} p.name → [nomes Sackmann a usar]; slots sem dono ficam fora. */
export function resolveSlotOwners(byName, players) {
  const cand = new Map(); // p.name → [nome Sackmann]
  for (const full of byName.keys()) {
    const p = matchPlayer(full, players);
    if (!p) continue;
    if (!cand.has(p.name)) cand.set(p.name, []);
    cand.get(p.name).push(full);
  }
  const byModelName = new Map(players.map((p) => [p.name, p]));
  const owners = new Map();
  for (const [name, cs] of cand) {
    if (cs.length === 1) { owners.set(name, cs); continue; }
    const p = byModelName.get(name);
    if (p && p.fullName) {
      const dono = cs.find((f) => normName(f) === normName(p.fullName));
      if (dono) owners.set(name, [dono]);
    } else {
      const ids = new Set(cs.map((f) => byName.get(f)?.[0]?.bio?.id).filter((x) => x != null));
      if (ids.size === 1) owners.set(name, cs);
    }
  }
  return owners;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/patterns.test.js`
Expected: PASS — os 5 testes novos passam e os antigos de `patterns.js` continuam verdes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — nada regrediu (a função é nova; ninguém a consome ainda).

- [ ] **Step 6: Commit**

```bash
git add pipeline/patterns.js tests/patterns.test.js
git commit -m "feat(patterns): resolveSlotOwners resolve homônimos por player_id + fullName"
```

---

### Task 2: `patterns-ingest.js` usa `resolveSlotOwners` + re-geração

**Files:**
- Modify: `pipeline/patterns-ingest.js:5` (import) e `:43-64` (o laço de matching dentro de `enrich`)
- Regenerate: `web/model-atp.json`, `web/model-wta.json`

**Interfaces:**
- Consumes: `resolveSlotOwners(byName, players)` (Task 1); `groupByPlayer`, `buildProfile` (já existentes).
- Produces: modelos com `bio`/`style`/`pressure` só da pessoa certa; slots não resolvidos sem esses campos.

> **Nota de teste:** `patterns-ingest.js` é um script de IO (fetch do Sackmann) sem teste unitário — a lógica testável está na Task 1. Esta task é fiação + verificação por re-geração real.

- [ ] **Step 1: Trocar o import**

Em `pipeline/patterns-ingest.js:5`, trocar:

```js
import { matchPlayer } from '../web/src/match-names.js';
```

por:

```js
import { toEnrichedMatch, groupByPlayer, buildProfile, resolveSlotOwners } from './patterns.js';
```

e **remover** a linha 6 atual (`import { toEnrichedMatch, groupByPlayer, buildProfile } from './patterns.js';`), já que os quatro nomes passam a vir do mesmo import acima. (`matchPlayer` não é mais usado diretamente aqui.)

- [ ] **Step 2: Reescrever o laço de matching em `enrich`**

Em `pipeline/patterns-ingest.js`, substituir o trecho que hoje é (linhas ~43-62):

```js
  const byName = groupByPlayer(matches);

  const byPlayer = new Map();
  for (const [fullName, entries] of byName) {
    const p = matchPlayer(fullName, model.players);
    if (!p) continue;
    if (!byPlayer.has(p.name)) byPlayer.set(p.name, []);
    byPlayer.get(p.name).push(...entries);
  }

  let n = 0;
  for (const p of model.players) {
    const entries = byPlayer.get(p.name);
    if (!entries || entries.length < MIN_GAMES) continue;
    const prof = buildProfile(entries);
    p.style = prof.style;
    p.pressure = prof.pressure;
    p.bio = prof.bio;
    n++;
  }
```

por:

```js
  const byName = groupByPlayer(matches);

  // Resolve homônimos pelo player_id + fullName (serve-stats roda ANTES no pipeline e
  // preenche p.fullName). Slots não resolvidos (homônimo real sem fullName) ficam sem
  // enriquecimento — as entries misturadas contaminariam estilo/pressão/bio, não só o bio.
  const owners = resolveSlotOwners(byName, model.players);

  let n = 0;
  for (const p of model.players) {
    const fulls = owners.get(p.name);
    if (!fulls) continue;
    const entries = fulls.flatMap((f) => byName.get(f));
    if (entries.length < MIN_GAMES) continue;
    const prof = buildProfile(entries);
    p.style = prof.style;
    p.pressure = prof.pressure;
    p.bio = prof.bio;
    n++;
  }
```

- [ ] **Step 3: Validar sintaxe e suíte**

Run: `node --check pipeline/patterns-ingest.js` → sem erro.
Run: `npm test` → PASS (304+5 = 309 esperado; a suíte não cobre patterns-ingest, mas confirma que nada quebrou).

- [ ] **Step 4: Re-gerar os modelos (o serve-stats já preencheu o fullName no cron de hoje)**

Run: `node pipeline/patterns-ingest.js`
Depois, re-aplicar a trajetória (destrava os corrigidos): `node pipeline/rankings-ingest.js`

> Rede: baixa o mirror Sackmann. Se indisponível, repetir quando voltar. Não rodar `train.js`/`serve-stats.js` não é necessário — os `model-*.json` atuais já trazem `p.fullName` do cron; o `patterns-ingest` só reescreve `style`/`pressure`/`bio`.

- [ ] **Step 5: Verificar a correção no dado real**

```bash
node --input-type=module -e '
import { readFile } from "node:fs/promises";
import { normName } from "./web/src/match-names.js";
for (const tour of ["atp","wta"]) {
  const m = JSON.parse(await readFile(`./web/model-${tour}.json`));
  const comFull = m.players.filter(p => p.bio && p.fullName);
  const contaminados = comFull.filter(p => normName(p.bio.name) !== normName(p.fullName));
  console.log(`${tour.toUpperCase()}: contaminados (deve ser 0): ${contaminados.length}`, contaminados.map(p=>p.name));
}
const w = JSON.parse(await readFile("./web/model-wta.json"));
const wang = w.players.find(p => p.name === "Wang Y.");
console.log("Wang Y. -> fullName:", wang?.fullName, "| bio.name:", wang?.bio?.name, "| bio.rank:", wang?.bio?.rank);
'
```

Expected: `ATP: contaminados (deve ser 0): 0`, `WTA: ... 0`. `Wang Y. -> fullName: Yafan Wang | bio.name: Yafan Wang | bio.rank: 298`.

> Se a rede caiu no Step 4 e os modelos não foram regenerados, este step ainda mostra o estado antigo (contaminados > 0) — nesse caso o Step 4 precisa rodar de novo com a fonte disponível antes de commitar.

- [ ] **Step 6: Commit**

```bash
git add pipeline/patterns-ingest.js web/model-atp.json web/model-wta.json
git commit -m "fix(patterns-ingest): resolve o bio contaminado por homônimo (player_id + fullName)"
```

---

## Self-Review (preenchido)

**1. Cobertura da spec:**
- Função pura de resolução por id/fullName → Task 1. ✓
- `patterns-ingest` usa a função e pula não resolvidos → Task 2. ✓
- Política sem-fullName (merge por id / sem bio) → Task 1 (Steps 3-4 dos testes). ✓
- Trajetória destrava sozinha (rankings.js intocado) → verificado no Step 4 (rankings-ingest re-roda) sem editar `rankings.js`. ✓
- Re-geração + verificação (0 contaminados, Wang Y. correta) → Task 2 Steps 4-5. ✓

**2. Placeholders:** nenhum; todo step tem código/comando concreto e saída esperada.

**3. Consistência de tipos/nomes:** `resolveSlotOwners(byName, players) → Map<string,string[]>` idêntico entre a definição (Task 1 Step 3), os testes (Task 1 Step 1) e o uso (Task 2 Step 2). `entry.bio.id`/`entry.bio.name` consistentes com `groupByPlayer` (`bio: m.winner`).

## Riscos

- **Rede indisponível na Task 2** → os modelos não regeneram; o Step 5 detecta (contaminados > 0) e o commit não deve acontecer até a fonte voltar.
- **Rodar `patterns-ingest` sem `serve-stats` antes** → os ambíguos-com-fullName cairiam no caminho "sem fullName". Mitigado: os `model-*.json` atuais já têm `p.fullName`; um comentário no código documenta a dependência de ordem.
- **`node --test` conta:** a suíte sobe de 304 para 309 (5 testes novos na Task 1).
