# Bio contaminado no patterns-ingest — Especificação

> **Data:** 2026-07-18
> **Status:** Escopo aprovado pelo Felipe (brainstorming). Próximo passo: plano de implementação (writing-plans).
> **Relacionado:** [[momento-carreira-regra]] e o guarda-corpo de `rankings.js` (a feature de trajetória que hoje *recusa* os contaminados). Bug documentado na memória `bio-contaminado-patterns-ingest`.

---

## Resumo em português claro

O `pipeline/patterns-ingest.js` cola em `p.bio` — e nas estatísticas de estilo/pressão — os dados de **outra pessoa** em alguns jogadores. Exemplo real, verificado hoje no modelo: o slot `Wang Y.` (que é a **Yafan Wang**, #298) carrega o bio da **Yuhan Wang** (#721) — nome, ranking, idade, tudo da pessoa errada.

**A causa:** o `patterns-ingest` re-casa cada nome do Sackmann ao jogador do modelo com `matchPlayer` (sobrenome + inicial do 1º nome), que **funde homônimos**: "Yafan Wang", "Yuhan Wang" e "Yuping Wang" casam todas no mesmo slot `Wang Y.`. O código concatena as partidas das três e o `buildProfile` usa o bio do jogo **mais recente** da mistura — que pode ser de qualquer uma.

**A correção:** usar o `player_id` do Sackmann (que já vem em cada partida) como identidade, ancorado no `p.fullName` que o `serve-stats.js` **já resolveu corretamente** por volume de saque e que roda **antes** no pipeline. Assim cada slot recebe só as partidas da pessoa certa.

**Efeito de brinde:** o guarda-corpo de `rankings.js` que hoje recusa os contaminados (barra quando `bio.name != fullName`) para de disparar sozinho, e os corrigidos recuperam o "momento de carreira" — agora com o bio certo.

---

## A causa raiz (confirmada e medida em 2026-07-18)

`patterns-ingest.js:46-51` faz:
```js
for (const [fullName, entries] of byName) {
  const p = matchPlayer(fullName, model.players);   // sobrenome + inicial → funde homônimos
  if (!p) continue;
  byPlayer.get(p.name).push(...entries);            // CONCATENA as pessoas fundidas
}
```
E `buildProfile` (`patterns.js:74-84`) faz `bio: recent.bio` — o bio do jogo mais recente da mistura.

**Por que o `serve-stats.js` acerta e o `patterns-ingest` erra:** ambos usam o mesmo `matchPlayer`, mas o `serve-stats` (`applyServe:55-77`) **desambigua por volume** — grava em `p.fullName` o nome do candidato com mais pontos de saque (o jogador de tour real). O `patterns-ingest` não desambigua. E no pipeline (`.github/workflows/update-model.yml`), o `serve-stats` roda **antes** do `patterns-ingest`, então `p.fullName` já existe quando o `patterns-ingest` precisa dele.

**Magnitude medida** (Sackmann dos últimos 3 anos vs. os `model-*.json` atuais):

| categoria | ATP | WTA | tratamento |
|---|---:|---:|---|
| slots com bio, **sem ambiguidade** (1 nome casa) | 466 | 358 | inalterado |
| **ambíguos COM `fullName`** (o `fullName` resolve 100%) | 4 | 12 | corrigidos pelo join por `fullName` |
| **ambíguos SEM `fullName`** (irmãos, variantes de grafia, homônimos reais) | 4 | 12 | ver política abaixo |
| contaminados hoje **detectáveis** (`bio.name != fullName`) | 2 | 5 | 7 no total (1 dos 2 do ATP é variante de grafia benigna) |

Os 350 slots com bio mas **sem `fullName`** (225 ATP + 125 WTA) têm contaminação indetectável pelo critério `bio.name != fullName`; a maioria (824 no total) não é ambígua e já está correta.

---

## A correção

### 1. Função pura de resolução — `pipeline/patterns.js`

Nova função pura testável, `resolveSlotOwners(byName, players)`:
- **Entrada:** `byName` (`Map<fullNameSackmann, entries[]>`, cada entry com `entry.bio.id`) e `players` (o array do modelo, com `p.name` e opcional `p.fullName`).
- **Saída:** `Map<p.name, string[]>` — para cada slot **resolvido**, a lista de nomes do Sackmann cujas entries usar. Slots não resolvidos (homônimo real indistinguível) **não entram no mapa**.

Regra por slot (candidatos = nomes do Sackmann que `matchPlayer` liga ao slot):
- **1 candidato** → `[candidato]`.
- **≥2 candidatos, com `p.fullName`** → o candidato cujo `normName` == `normName(p.fullName)` → `[esse]`. (Se, por acaso, nenhum casar o `fullName`, o slot não é resolvido.)
- **≥2 candidatos, sem `p.fullName`** → agrupar os candidatos por `entry.bio.id`:
  - todos o **mesmo id** (variantes de grafia da mesma pessoa) → `[todos os candidatos]` (merge).
  - **ids distintos** (homônimos reais) → não resolve (fora do mapa).

### 2. `pipeline/patterns-ingest.js`

Substituir o laço de matching por: montar as entries de cada slot a partir de `resolveSlotOwners`, e **pular por completo** (sem `style`, `pressure`, `bio`) os slots não resolvidos. As entries misturadas contaminam também estilo/pressão, então "não resolvido" = não enriquecer nada.

```js
const owners = resolveSlotOwners(byName, model.players);
for (const p of model.players) {
  const fulls = owners.get(p.name);
  if (!fulls) continue;
  const entries = fulls.flatMap((f) => byName.get(f));
  if (entries.length < MIN_GAMES) continue;
  const prof = buildProfile(entries);
  p.style = prof.style; p.pressure = prof.pressure; p.bio = prof.bio;
}
```

### 3. Política dos ambíguos sem `fullName`
`player_id`: merge das variantes de grafia (mesmo id), **sem enriquecimento** para homônimos reais (ids distintos). O card fica em **silêncio** nesses poucos casos — o mesmo estado "sem dossiê" que já vale para muitos jogadores; sem mensagem especial (evita jargão e uma distinção que o usuário não vê nos outros sem-bio).

### 4. Trajetória (`rankings.js`) — sem mudança
O guarda-corpo `rankings.js:189` (`bio.name != fullName → recusa`) para de disparar para os corrigidos, que recuperam a trajetória com o bio certo. O guarda-corpo permanece como rede de segurança. Nenhuma edição em `rankings.js`.

---

## Testes

**`tests/patterns.test.js`** — `resolveSlotOwners` (pura), com `byName`/`players` sintéticos:
- Sem ambiguidade: 1 candidato → `[ele]`.
- Ambíguo com `fullName`: dois candidatos ("Yafan Wang", "Yuhan Wang"), `p.fullName = "Yafan Wang"` → `["Yafan Wang"]`.
- Ambíguo sem `fullName`, mesmo `bio.id` (variantes de grafia "Yun Seong Chung"/"Yunseong Chung") → merge (os dois nomes).
- Ambíguo sem `fullName`, ids distintos (irmãos) → slot ausente do mapa.
- Invariante: para um slot resolvido com `p.fullName`, o `bio.name` do perfil montado (via `buildProfile`) normaliza igual ao `fullName`.

O `patterns-ingest.js` (IO de rede) permanece sem teste unitário; a lógica testável vive na função pura. A verificação de ponta a ponta é a re-geração real (abaixo).

---

## Re-geração e verificação

Rodar o pipeline localmente na ordem do cron: `serve-stats.js` → `patterns-ingest.js` → `rankings-ingest.js`, regenerando `web/model-atp.json` e `web/model-wta.json`. Verificar no dado real:
- **0 contaminados**: nenhum slot com `p.fullName` e `normName(bio.name) != normName(fullName)`.
- `Wang Y.` → bio de "Yafan Wang", rank 298 (não mais Yuhan/721); os outros 6 casos idem.
- Os homônimos reais sem `fullName` (Blanch, Tsitsipas P. etc.) ficam sem `bio`/`style`/`pressure`.
- A suíte de testes segue verde.

---

## Fora de escopo (YAGNI)

- Mexer no `serve-stats.js` (já desambigua certo) ou no `matchPlayer` genérico (usado em vários lugares — mudá-lo teria efeito colateral fora deste bug).
- Reintroduzir ITF ou qualquer mudança de cobertura.
- Mensagem de UI para o slot sem dossiê (silêncio, como hoje).
- Resolver os homônimos reais sem `fullName` "na marra" (chute por volume) — a decisão é deixá-los sem bio.

---

## Riscos e observações

- **Dependência de ordem no pipeline:** o `patterns-ingest` passa a depender de o `serve-stats` ter rodado antes (para `p.fullName`). Já é a ordem do `update-model.yml`; um comentário no `patterns-ingest` deixa isso explícito. Se rodado fora de ordem, os ambíguos-com-fullName caem no caminho "sem fullName" (merge se mesmo id, senão sem bio) — degrada com segurança, nunca contamina.
- **`bio.id` ausente em alguma entry:** o agrupamento por id trata `id` faltante como um grupo próprio; na prática o Sackmann traz o id. Se faltar em todas as entries de um ambíguo-sem-fullName, o slot fica não resolvido (seguro).
- **Menos jogadores com bio:** alguns poucos slots (homônimos reais) perdem o bio que hoje têm (errado). É a troca desejada: sem bio > bio de outra pessoa.
- **O caso "1 candidato" não é revalidado contra o `fullName`** — de propósito. Quando só um nome do Sackmann casa o slot, ele é usado como hoje. Revalidar contra `fullName` aqui quebraria nomes cujo formato difere entre as fontes (o `fullName` do ATP vem do TML, não do Sackmann; ex.: "Alexander Zverev" no Sackmann vs. "Alex Zverev" no TML normalizam diferente). A correção mira o caso **ambíguo** (≥2 candidatos), que é onde o bug vive; os 16 ambíguos-com-fullName medidos têm o `fullName` batendo um candidato (0 casos de "não resolve").
