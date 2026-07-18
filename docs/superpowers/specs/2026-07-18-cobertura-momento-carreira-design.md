# Cobertura do momento de carreira — Especificação

> **Data:** 2026-07-18
> **Status:** Escopo aprovado pelo Felipe (brainstorming — "prosseguir com o mais pertinente"). Próximo passo: plano de implementação (writing-plans).
> **Relacionado:** `momento-carreira-regra` (a régua dos 4 rótulos, calibrada), `bio-contaminado-patterns-ingest` (o guarda-corpo que o item A afrouxa), `roadmap-itens-abertos` (item "reconciliar fullName ATP"). Follow-up natural do bio contaminado.

---

## Resumo em português claro

Dois buracos na cobertura do **momento de carreira** (o rótulo ascensão/auge/estável/declínio no card do jogador), medidos no modelo real de hoje:

- **A — transliteração (1 jogador ATP).** O **Abdullah/Abedallah Shelbayh** (#308) tem identidade confirmada pelo `player_id` do Sackmann, mas fica **sem momento de carreira** porque um guarda-corpo compara o nome do Sackmann com o nome do TML — que apenas *transcreve* o primeiro nome diferente. É um falso positivo de contaminação.
- **C — veteranos fora do snapshot (19 ATP + 5 WTA).** Jogadores ativos como **Gasquet, Schwartzman, Paire, Cressy, Koepfer, Errani** ficam sem momento de carreira porque a trajetória só considera quem está no *único* snapshot de ranking mais recente do dataset — e eles saíram dele há poucas semanas. O rótulo honesto deles ("Em declínio" ou "Pouco tênis no período") existe, só não é publicado.

As duas correções são puras e testáveis, e **não tocam** no `EloEngine`, na régua de rótulos (`career.js`) nem no `serve-stats.js`.

---

## A causa (confirmada e medida em 2026-07-18)

### A — o guarda-corpo compara as fontes erradas

`pipeline/rankings.js:189`, dentro de `resolvePlayers`:
```js
if (p.bio && p.bio.name && p.fullName && normName(p.bio.name) !== normName(p.fullName)) continue;
```
O `p.bio.name` vem do **Sackmann** (patterns-ingest) e o `p.fullName` vem do **TML** (serve-stats). A contaminação que o guarda-corpo quer pegar — "o `patterns-ingest` colou o bio da pessoa errada" — é um fenômeno **interno do Sackmann**. Comparar Sackmann×TML mistura fontes e **dispara em transliteração**, recusando um jogador correto.

**Medido no Shelbayh (id 209406):**
| fonte | nome |
|---|---|
| Sackmann `players.csv` (`meta.fullName`) | Abedallah Shelbayh |
| Sackmann `matches` (`bio.name`) | Abedallah Shelbayh |
| TML (`fullName`) | Abdullah Shelbayh |

O Sackmann é **internamente consistente** (`normName(bio.name) === normName(meta.fullName)` → `true`); só o TML escreve "Abdullah". A identidade já está confirmada pelo `bio.id` (casou por `byBioId`). É o **único** ativo com `bio.name != fullName` em toda a base (ATP e WTA).

**Descoberta que decide a abordagem (verificada empiricamente):** *não existe* jeito automático seguro de afrouxar esse guarda-corpo. Uma transliteração legítima ("Abdullah/Abedallah Shelbayh", **uma** pessoa) e uma contaminação real ("Yafan/Yuhan Wang", **duas** pessoas — o caso do teste `rankings.test.js:275`) satisfazem **as mesmas** condições: mesmo sobrenome, mesma inicial, `bio.name == meta.fullName`, `bio.name != fullName`, e até distância de edição parecida. Dos nomes sozinhos são indistinguíveis, e o único âncora de identidade que cruzaria as fontes (o `wikidata_id`) existe no Sackmann mas **não no TML**. Simulado: qualquer regra de "consistência mesma-fonte" resolve os **dois** — logo readmitiria a contaminação da Wang. Por isso a correção é uma **allowlist curada por `player_id`**, não uma heurística.

### C — a trajetória exige o snapshot global mais recente

`buildTrajectories` (`pipeline/rankings.js:113`) faz, por jogador:
```js
const hoje = serie.find((s) => s.date === snapshotDate); // snapshotDate = latestDate GLOBAL
if (!hoje) continue;                                       // fora do snapshot global → sem trajetória
```
Quem não tem uma linha de ranking **exatamente** na data mais nova do dataset (`20260608`) é descartado — mesmo tendo ranking há duas semanas. São veteranos que escorregaram do ranking recentemente.

**Medido — ativos sem `career`, com `bio.id`, por recência do último ranking:**

| | recuperáveis (≤120 dias) | velhos demais (>120 dias) | sem bio¹ | colisão² |
|---|---:|---:|---:|---:|
| ATP | **19** | 4 (Fognini 322d, Pouille 126d, Pospisil 238d, Furness 343d) | 46 | Suresh D. |
| WTA | **5** | 3 (Cornet 252d, Schmiedlova 126d, Contreras 483d) | 8 | — |

¹ Sem perfil do Sackmann (janela de `MIN_GAMES` do patterns) — outra causa, fora de escopo (classe do Kyrgios).
² Homônimo real excluído de propósito por `resolvePlayers` (Suresh D., junto de Tsitsipas P./Li Z./Petrovic D.) — comportamento correto, fora de escopo.

Os "velhos demais" ficam de fora **de propósito**: rotular o Fognini com o #188 de um ano atrás como se fosse hoje seria mentira.

---

## A correção

### A — allowlist curada de transliterações por `player_id` (`rankings.js`, `resolvePlayers`)

Uma allowlist explícita e auditável de `player_id`s do Sackmann confirmados **à mão** como sendo a mesma pessoa que o slot, apesar de o TML transliterar o nome diferente. O guarda-corpo do nome só é **pulado** para um id que casou pelo próprio `bio.id` do slot **e** está na allowlist.

```js
// Transliterações confirmadas à mão: o mesmo jogador escrito diferente entre o TML
// (p.fullName) e o Sackmann (bio.name). NÃO é heurística — é uma allowlist por
// player_id, porque de nome sozinho "Abdullah/Abedallah Shelbayh" (uma pessoa) é
// indistinguível de "Yafan/Yuhan Wang" (duas). Só entra um id verificado; o check de
// QA (bio.name != fullName) revela novos casos para curadoria futura.
const TRANSLIT_CONFIRMADO = new Set([
  '209406', // Abedallah Shelbayh (Sackmann) = Abdullah Shelbayh (TML)
]);
```

No laço de `resolvePlayers`:
```js
const porId = byBioId.get(String(id));            // casou pelo próprio bio.id do slot?
const p = porId || findModelPlayer(m.fullName, players);
if (!p) continue;
// guarda-corpo de bio contaminado — exceto transliterações confirmadas do próprio id:
const transliteracaoOk = porId && TRANSLIT_CONFIRMADO.has(String(id));
if (!transliteracaoOk && p.bio && p.bio.name && p.fullName && normName(p.bio.name) !== normName(p.fullName)) continue;
```

**Princípio:** a mudança apenas **afrouxa** para ids explicitamente listados; **não introduz novas recusas** e **não afrouxa nada por heurística**. A contaminação da Wang (id `264205`, fora da lista) continua sendo recusada — o teste `:275` segue verde. Os guarda-corpos de idade (`MAX_AGE_GAP_YEARS`) e de colisão permanecem intactos.

### C — âncora por jogador com portão de recência (`rankings.js`, `buildTrajectories`)

Cada jogador é ancorado no snapshot global **se estiver nele** (saída idêntica à de hoje), senão no **seu próprio ranking mais recente**, desde que dentro de um **portão de recência** (`MAX_STALE_DAYS = 120`). O `date12m`, o pico e o spike passam a ser calculados relativos à âncora daquele jogador.

```js
const anchor = serie.some((s) => s.date === snapshotDate)
  ? snapshotDate
  : maxDate(serie);
if (anchor !== snapshotDate && diasEntre(snapshotDate, anchor) > MAX_STALE_DAYS) continue; // velho demais
// ... trajetória ancorada em `anchor` (date12m = nearestDate(dates, minus12Months(anchor)))
```

Para quem está no snapshot, `anchor === snapshotDate` → **byte-idêntico ao de hoje** (ver Verificação). O `career.snapshotDate` de um recuperado passa a ser a data do próprio último ranking; o `careerText` **já** publica isso como `as of DD/MM/AAAA` (o campo `asOf` existe e diz "nunca 'hoje'"), então o atraso é comunicado sem mudança de UI.

**Nada muda em `career.js`** (a régua e os textos). Os rótulos saem da mesma função pura; a mudança é só *quais* jogadores recebem um `career`.

---

## O que sai publicado (medido pela simulação do design, read-only)

Rodando a lógica nova sobre o dado real (`careerText` de verdade):

- **19 ATP recuperados:** 17 "Em declínio" (Gasquet: *"perdeu 85% dos pontos em 12 meses (339 → 50). Era #166, está no #673"* — `as of 25/05/2026`; Koepfer, Cressy, Lestienne, Cachin, Paire, Schwartzman, Zapata Miralles, Marterer, Klizan, Mager, Ilkel, Diez, Escobedo, Bourgue, Olivo, Edmund), 2 "Pouco tênis no período" (Andreozzi, Miedler).
- **5 WTA recuperados:** Saville e Errani "Em declínio" (Errani: *"perdeu 95%… Era #176, está no #997"* — `as of 01/06/2026`); Moore, Mchale, Xun "Pouco tênis no período".
- **Shelbayh (A):** passa a "Estável" — *"os pontos mudaram +14% em 12 meses (154 → 176); está no #308; seu melhor foi #181, em 2024"* — `as of 08/06/2026`.

Todos os rótulos são coerentes e honestos (número sempre embutido, data de referência visível).

---

## Testes

**`tests/rankings.test.js`** (funções puras, séries sintéticas):

*C — `buildTrajectories` com âncora por jogador:*
- Jogador **no** snapshot global → âncora = snapshot; resultado **inalterado** (mesma saída da versão atual).
- Jogador **fora** do snapshot, último ranking a 30 dias (dentro do portão) → recebe trajetória ancorada no próprio último ranking; `snapshotDate` = a data dele.
- Jogador **fora** do snapshot, último ranking a 200 dias (fora do portão) → **sem** trajetória (como hoje).
- Fronteira do portão: exatamente `MAX_STALE_DAYS` entra; `MAX_STALE_DAYS + 1` não.
- `date12m`/rank12m calculados relativos à âncora do jogador (não ao snapshot global).

*A — `resolvePlayers` com allowlist de transliteração:*
- Id **na allowlist** (`209406`), casou por `bio.id`, `fullName`(TML) ≠ `bio.name`(Sackmann) → **resolve** (guarda-corpo pulado). (Caso Shelbayh.)
- Id **fora da allowlist** com `bio.name != fullName` (bio contaminado, id `264205`) → **recusa** — o teste `:275` existente continua passando **sem alteração**.
- Colisão (2+ ids no mesmo slot) → continua excluindo os dois (inalterado).

O `rankings-ingest.js` (IO de rede) segue sem teste unitário; a lógica testável vive nas puras. Verificação de ponta a ponta = re-geração real (abaixo).

---

## Re-geração e verificação

Rodar o pipeline na ordem do cron: `serve-stats.js` → `patterns-ingest.js` → `rankings-ingest.js`, regenerando `web/model-atp.json` e `web/model-wta.json`. Conferir no dado real:
- **Byte-idêntico onde tem que ser:** os jogadores já com `career` (no snapshot) mantêm exatamente os mesmos campos de trajetória. (Simulação: 408 ATP + 328 WTA conferidos, **0 divergências**.)
- **A:** `Shelbayh A.` passa a ter `career` (Estável, #308); segue sendo o único com `bio.name != fullName`, agora sem consequência.
- **C:** os 19 ATP + 5 WTA recuperados ganham `career` com o rótulo esperado e `as of` na data do próprio ranking; nenhum "velho demais" (Fognini, Cornet…) entra.
- A cobertura de `career` entre ativos sobe (guarda de 80% de `rankings-ingest` segue satisfeita, com folga maior).
- A suíte inteira segue verde.

---

## Fora de escopo (YAGNI)

- **Reconciliação estrutural TML×Sackmann por identidade global** (a "opção B"): hoje protege **0** casos ambíguos; over-engineering. A allowlist curada trata o único caso real com risco zero.
- **Afrouxar o guarda-corpo por heurística** (distância de edição, sobrenome+inicial): readmitiria a contaminação da Wang (indistinguível do Shelbayh por nome). Descartado — só allowlist explícita.
- **Ativos sem bio** (46 ATP + 8 WTA — classe do Kyrgios): causa diferente (janela de `MIN_GAMES` do patterns), não é nome/snapshot.
- **Homônimos reais excluídos por colisão** (Suresh D., Tsitsipas P.…): exclusão correta, mantida.
- **"Velhos demais" (>120d):** deixados sem rótulo de propósito — dado velho como se fosse atual seria mentira.
- **Mexer em `career.js`, `serve-stats.js`, `patterns-ingest.js` ou no `EloEngine`.**

---

## Riscos e observações

- **Régua calibrada intacta:** a saída de `career.js` não muda para ninguém que já tem `career` (provado byte-a-byte na simulação). A mudança é aditiva.
- **Portão de 120 dias é uma constante ajustável.** No corte de 120d entram Schwartzman/Koepfer/Escobedo (119d) e fica de fora Pouille (126d). Como o `as of` mostra a data, o portão é sobre "velho demais para valer a pena", não sobre honestidade — o texto nunca finge ser de hoje. Fácil de afinar (uma constante) se o Felipe quiser 90/150/180 depois.
- **`bio.rank`/`bio.age` dos recuperados** passam a refletir a âncora deles (o `rankings-ingest` já conserta esses campos a partir do `career` — `rankings-ingest.js:76-81`), coerente com o rótulo.
- **Allowlist manual (A):** 1 entrada hoje (Shelbayh). É curadoria consciente, não escala automática — mas o volume é 1, e o check de QA `bio.name != fullName` (roda na verificação) revela qualquer caso novo para adicionar à mão. Trade-off aceito: manutenção mínima em troca de risco zero de readmitir contaminação.
- **Ordem do pipeline:** inalterada. C não depende de fonte nova; A usa só o `id`/`meta` que o `rankings-ingest` já carrega.
