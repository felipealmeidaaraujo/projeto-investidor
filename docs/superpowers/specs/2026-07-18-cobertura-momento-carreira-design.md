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

### A — guarda-corpo consciente da identidade por `bio.id` (`rankings.js`, `resolvePlayers`)

Quando o jogador casou por **`bio.id` exato** e o `bio.name` (Sackmann patterns) **bate com o `meta.fullName`** (Sackmann `players.csv` do mesmo id), a identidade está confirmada **dentro da fonte autoritativa** → não aplicar o guarda-corpo do nome-TML. Caso contrário, aplicar como hoje.

```js
const porId = byBioId.get(String(id));          // casou por bio.id?
const p = porId || findModelPlayer(m.fullName, players);
if (!p) continue;
// identidade confirmada pelo id + consistência interna do Sackmann:
const idConfirmado = porId && p.bio && p.bio.name && normName(p.bio.name) === normName(m.fullName);
// guarda-corpo de bio contaminado — só quando a identidade NÃO está confirmada por id:
if (!idConfirmado && p.bio && p.bio.name && p.fullName && normName(p.bio.name) !== normName(p.fullName)) continue;
```

**Princípio:** A-α apenas **afrouxa** (deixa de recusar transliterações confirmadas por id); **não introduz novas recusas**. Um bio de fato contaminado (patterns colou a pessoa errada num slot cujo id resolveu certo) tem `bio.name != meta.fullName` → `idConfirmado` falso → o guarda-corpo continua valendo. Os guarda-corpos de idade (`MAX_AGE_GAP_YEARS`) e de colisão permanecem intactos como rede de segurança.

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

*A — `resolvePlayers` com guarda-corpo consciente por id:*
- Casou por `bio.id`, `bio.name` normaliza igual ao `meta.fullName`, `fullName`(TML) diferente (transliteração) → **resolve** (não recusa). (Caso Shelbayh.)
- Casou por `bio.id`, `bio.name` **diferente** do `meta.fullName` (bio de fato contaminado) → **recusa** (guarda-corpo ainda vale).
- Casou **por nome** (sem `bio.id`), `bio.name != fullName` → **recusa** como hoje (sem id que confirme).
- Colisão (2+ ids no mesmo slot) → continua excluindo os dois.

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

- **Reconciliação estrutural TML×Sackmann por identidade global** (a "opção B"): hoje protege **0** casos ambíguos; over-engineering. A-α resolve a classe da transliteração com muito menos risco.
- **Ativos sem bio** (46 ATP + 8 WTA — classe do Kyrgios): causa diferente (janela de `MIN_GAMES` do patterns), não é nome/snapshot.
- **Homônimos reais excluídos por colisão** (Suresh D., Tsitsipas P.…): exclusão correta, mantida.
- **"Velhos demais" (>120d):** deixados sem rótulo de propósito — dado velho como se fosse atual seria mentira.
- **Mexer em `career.js`, `serve-stats.js`, `patterns-ingest.js` ou no `EloEngine`.**

---

## Riscos e observações

- **Régua calibrada intacta:** a saída de `career.js` não muda para ninguém que já tem `career` (provado byte-a-byte na simulação). A mudança é aditiva.
- **Portão de 120 dias é uma constante ajustável.** No corte de 120d entram Schwartzman/Koepfer/Escobedo (119d) e fica de fora Pouille (126d). Como o `as of` mostra a data, o portão é sobre "velho demais para valer a pena", não sobre honestidade — o texto nunca finge ser de hoje. Fácil de afinar (uma constante) se o Felipe quiser 90/150/180 depois.
- **`bio.rank`/`bio.age` dos recuperados** passam a refletir a âncora deles (o `rankings-ingest` já conserta esses campos a partir do `career` — `rankings-ingest.js:76-81`), coerente com o rótulo.
- **Ordem do pipeline:** inalterada. C não depende de fonte nova; A usa o `meta` (players.csv) que o `rankings-ingest` já carrega.
