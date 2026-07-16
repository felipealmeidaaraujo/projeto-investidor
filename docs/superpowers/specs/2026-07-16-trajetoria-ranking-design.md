# Trajetória de Ranking e Momento de Carreira — Especificação

> **Data:** 2026-07-16
> **Status:** Escopo aprovado pelo Felipe. Próximo passo: plano de implementação (writing-plans).
> **Origem:** os dois últimos itens em aberto de [2026-07-15-plataforma-analise-tenis-design.md](2026-07-15-plataforma-analise-tenis-design.md) (linhas 43 e 59).

---

## Resumo em português claro

Eram duas coisas. **Uma vai ser feita, a outra foi medida e não existe.**

**Vai ser feita — "Momento de carreira" no card:** dizer se o jogador está **em ascensão**, **no auge**, **estável** ou **em declínio**. A regra foi calibrada nos 813 jogadores ativos da ATP e 366 da WTA, não chutada. A lista final passa no teste do olho humano: Sinner e Alcaraz saem "no auge", Djokovic sai "estável" aos 39, quem perdeu metade dos pontos sai "em declínio".

**Não vai ser feita — o aviso de "Elo defasado":** a ideia era avisar quando o modelo estivesse atrasado sobre um jogador. Medimos em 118.214 partidas e **a premissa estava invertida**: o Elo do projeto reage *rápido demais*, não devagar. O aviso apontaria o trader para o lado errado. Detalhes e números em "O obituário do item 2", abaixo.

**De brinde, dois bugs somem.** O card mostra hoje o Djokovic como `#4` (ele é #7) e 88 jogadores ATP com a idade errada — ambos porque o app exibe dados congelados na data do último jogo do jogador. O mesmo download que traz a trajetória conserta os dois.

*Ressalva honesta, apurada na review final:* a correção só alcança **quem está no ranking de hoje**. O Nadal, que aparece com 38 anos tendo 40, **não** é consertado — ele saiu do ranking, então não tem trajetória. Isso é inofensivo porque ele é `active: false` e nenhuma lista do app o mostra, mas a promessa original desta spec ("conserta o Nadal") era falsa e está corrigida aqui.

**O download diário é de ~29,5 MB, não 66 MB.** O histórico de ranking de 2010–2019 (37 MB, 56% do total) **não é baixado todo dia**: ele é história, não muda mais. Vira um arquivo de 238 KB calculado uma vez e versionado. Cortá-lo de vez mudaria 0 rótulos na ATP, mas faria o card afirmar que o auge do Tomic foi #164 quando foi #17 — daí o cache em vez do corte.

**A ressalva que precisa estar no card:** o momento **descreve o passado; não prevê o próximo jogo.** Isso foi medido, não suposto. O rótulo não antecipa vitórias além do que o Elo já sabe.

---

## O obituário do item 2 — "Aviso de Elo defasado"

Registrado com os números **para que ninguém (nem o Felipe, nem uma sessão futura de IA) reinvente a ideia daqui a seis meses.**

A spec original dizia: *"quando a trajetória diverge do Elo (jovem em ascensão vs. veterano em declínio), o sistema alerta que o modelo pode estar atrasado."*

**Método:** dataset walk-forward de 118.214 partidas (89.716 ATP + 28.498 WTA), de 2018-01-01 a 2026-07-12, com o Elo congelado *antes* de cada partida e a trajetória de pontos daquele momento. Taxa base verificada em 50,1% (ATP) / 49,9% (WTA) — sem vazamento do vencedor. Quatro medidas independentes, três céticos adversariais, e verificação própria do juiz.

**Três razões independentes mataram o aviso:**

1. **A premissa está invertida.** Entre dois jogadores com o mesmo Elo hoje, o que era mais forte há 12 meses **vence mais** (coef +0,039, **z=+9,28** ATP; +0,035, z=+4,40 WTA). O Elo **reage demais**, não de menos. O aviso precisaria do sinal oposto.
2. **O "mas" não tem conteúdo.** "Sobe *mas* o Elo está parado" é uma interação, e ela é nula (z=−0,50 ATP; z=−1,59 WTA). A célula "divergente" é só a soma aditiva de duas contribuições que já existem separadas.
3. **Não é trajetória, é nível.** Teste de Wald rejeita a forma trajetória (z=7,11 ATP; z=5,39 WTA): os pontos de *hoje* pesam 1,7x (ATP) e 2,5x (WTA) os de 12 meses atrás. Se fosse trajetória, os pesos seriam iguais e opostos.

**E o argumento de escopo, independente da estatística:** o único efeito real (+2,5pp) mora no **Challenger**. No tour ATP é +1,56pp com IC95 [−1,94; +3,98] — indistinguível de zero. Na WTA top-100 é negativo. A grade do app vem do scoreboard da ESPN, que **só cobre o tour** (ver memória `jogos-do-dia-fonte-espn`). Praticamente 100% dos disparos visíveis cairiam onde não há efeito.

**Honestidade sobre a força da conclusão:**

- O nulo da Medida 1 é **evidência de ausência** (poder para detectar +2pp; MDE ±0,63pp).
- O nulo no tour da Medida 2 é **ausência de evidência** (N=1.498; um efeito de +3pp passaria batido). É um "não sei", não um "não tem".
- **Nada disso testou odds da Betfair.** Tudo medido é "o pModel do projeto erra em tal direção". O mercado provavelmente já precifica trajetória de ranking — é informação pública.
- Uma das quatro medidas (rigidez do Elo / K-factor) **falhou** por erro de formato de saída. A hipótese dela foi coberta pela via da idade.

**Hipótese não testada, plausível:** o motor não enxerga ITF/Futures. Então "subiu de pontos mas o Elo não mexeu" pode ser literalmente *"melhorou em partidas que o modelo não viu"* — o que casaria com o efeito ser nulo no tour e vivo no Challenger. Se for isso, a correção é de **cobertura de dados**, não de interface.

### Achados colaterais — reais, medidos, e FORA desta spec

Ficam registrados para uma spec futura. Não entram aqui porque são **correção de modelo**, que a spec-mãe põe explicitamente fora de escopo.

1. **Viés de idade (robusto).** O modelo subestima o mais novo: **+6pp** num par jovem(≤23) × veterano(≥30); **+9,2pp** com 12+ anos de diferença. z=−16,96 (ATP), z=−6,46 (WTA). Gradiente monotônico nos dois tours, imune a controle por nível e por Elo. Consistente com `K = 250/(matches+5)^0.4` ([elo.js:6](../../../pipeline/elo.js)) somado à ausência de decay por inatividade.
2. **BUG DE PRODUÇÃO — ordenação cronológica.** `loadCombinedMatches` ordena só por `dateInt` (data de *início do torneio*). A partir de 2024 o mirror do Sackmann inverteu o `match_num`: **a final é processada antes da primeira rodada.** 37% das partidas ATP e 89,5% das WTA 125 fora de ordem; o Elo do Challenger 2024+ diverge ~29-45 pontos. Atinge [train.js](../../../pipeline/train.js) real.
3. **Resíduo de calibração no ATP (pequeno).** Uma auditoria alegou 18% de superconfiança; **verificado e refutado** — o app já aplica temperature scaling em [analysis.js:85](../../../web/src/analysis.js). A WTA está calibrada com precisão (T=1,26 vs 1,25 ideal). O ATP tem resíduo de ~5% (T=1,15 vs ~1,21 ideal), provavelmente porque [train.js:34](../../../pipeline/train.js) fita o T numa janela que termina em 2023.
4. **`bio.svGms`/`bpSaved`/`bpFaced` são lixo semântico** ([patterns.js:20-22](../../../pipeline/patterns.js)) — carregam valores de uma única partida. O agregado correto está em `p.pressure`. Já registrado em `plans/2026-07-15-telas-secao-jogadores.md:263`.

---

## Escopo

**Entra:**

1. Trajetória de ranking no pipeline (baixar + parsear + join).
2. "Momento de carreira" no card do jogador.
3. Correção do `bio.rank` congelado e do `bio.age` defasado.

**Sai:** o aviso de Elo defasado (ver obituário).

**Fora de escopo (outra spec):** curva de idade no motor; bug de ordenação cronológica; resíduo de calibração do ATP; investigação da hipótese ITF.

---

## Fundação de dados

Mirror já usado pelo projeto — [ingest-sackmann.js:5](../../../pipeline/ingest-sackmann.js):
`https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main`

**Baixado todo dia pelo cron:**

| arquivo | tamanho | papel |
|---|---:|---|
| `{atp,wta}/{atp,wta}_rankings_current.csv` | 1,8 MB | ranking de hoje |
| `{atp,wta}/{atp,wta}_rankings_20s.csv` | 22,7 MB | janela de 12 meses + pico recente |
| `{atp,wta}/{atp,wta}_players.csv` | 4,9 MB | `dob` (idade correta), nome completo |

**Total: ~29,5 MB por execução do cron.**

**Baixado UMA VEZ, versionado no repo:**

| arquivo | tamanho | papel |
|---|---:|---|
| `data/peak-2010-2019.json` | **238 KB** | pico histórico, `{tour: {player_id: [rank, date]}}` |

### Por que o `10s` sai do cron (medido, não suposto)

O `atp/wta_rankings_10s.csv` pesa **37,0 MB — 56% do download original**. Medido sobre os 817 ativos ATP e 370 WTA:

- **Cortá-lo muda 0 rótulos na ATP e 1 na WTA** (Aksu A., #277). Motivo: quem teve pico antigo está longe dele hoje de qualquer jeito (sai "Estável" com qualquer pico), e quem está *perto* do pico tem o pico recente por definição — Djokovic foi #1 até 2023, Osaka foi #1 em 2020.
- **Mas o TEXTO ficaria errado em 18 casos ATP (6,9% dos que citam o pico) e 22 WTA (14,2%)**, alguns grosseiros: **Tomic B. (real #17 em 2016 → diria #164)**, Barthel M. (#23 em 2013 → #163), Lepchenko V. (#19 em 2012 → #117), Wawrinka S. (#3 em 2014 → #13). Isso viola `clareza-zero-duvida` — não é arredondamento, é afirmação falsa.

**Solução: o pico de 2010–2019 é história e nunca muda.** Não há razão para rebaixar 37 MB por dia para recalcular um número congelado desde 2019. Calcula-se **uma vez**, grava-se `data/peak-2010-2019.json` (238 KB) e versiona-se — o projeto já commita dados de volta pelo cron (memória `publicacao-cron-commita-de-volta`).

O `peak` final = `min(pico do 20s+current, pico do cache 2010-2019)`.

**Sem filtro de "quem está ativo hoje".** Filtrar cairia para 86 KB, mas criaria fragilidade temporal: um jogador que sumiu e voltasse em 2027 ficaria sem pico. 152 KB não valem esse bug.

**O `00s` fica fora:** quem teve pico nos anos 2000 tem 40+ anos hoje.

**Formato (verificado, literal):**

```
ATP: ranking_date,rank,player,points
WTA: ranking_date,rank,player,points,tours     <- coluna EXTRA
players (ambos): player_id,name_first,name_last,hand,dob,ioc,height,wikidata_id
```

Indexação posicional `c[0..3]` funciona nos dois. Um parser que valide `length === 4` **quebra no WTA**.

**Não use o `parseCsv` do repo** ([ingest.js:30-42](../../../pipeline/ingest.js)) nesses arquivos — criaria 516.461 objetos. `split(',')` direto: 4 colunas, sem aspas, verificado.

**Defasagem inerente:** o último `ranking_date` publicado é **20260608**, e o `dataThrough` do modelo é 20260712 — ~5 semanas de gap. **O card deve mostrar a data do snapshot; nunca chamar de "hoje".**

---

## Arquitetura

Espelha o par que o projeto já usa (`patterns-ingest.js` [IO] / `patterns.js` [puro]):

| peça | papel |
|---|---|
| `pipeline/rankings.js` | **puro**: parse, join, pico, spike. Testável. |
| `pipeline/rankings-ingest.js` | **IO**: baixa (current + 20s + players), lê o cache de pico, chama as puras, regrava o `model-*.json` |
| `pipeline/peak-cache-build.js` | **one-shot**: baixa o `10s`, gera `data/peak-2010-2019.json`. Roda uma vez, na implementação. **Não entra no cron.** |
| `web/src/career.js` | **puro, novo**: classificação + texto |

**Ordem no workflow (load-bearing):** o `rankings-ingest.js` entra **depois** do `patterns-ingest.js` ([update-model.yml:37](../../../.github/workflows/update-model.yml)) e antes do `fixtures.js`. Os scripts reescrevem o mesmo arquivo em cadeia. O `git add` de `update-model.yml:50` já cobre `web/model-*.json`.

**Por que a classificação fica no `web/src/` e não no pipeline:** é o padrão existente — `p.style` guarda números crus e `styleLines()` gera o texto ([patterns-view.js:2](../../../web/src/patterns-view.js) declara isso). Assim a regra dos limiares muda sem re-rodar o pipeline.

O pipeline grava só fatos:

```js
p.career = {
  rank, points,            // snapshot mais recente
  rank12m, points12m,      // snapshot mais próximo de 12 meses antes
  peak, peakDate,          // melhor rank 2010→hoje
  snapshotDate,            // data real do snapshot (NÃO é "hoje")
  spikePct, spikeDate      // maior fatia do ganho de 12m vinda de uma única semana
}
```

`p.career = null` para quem não casou. Além disso, corrigir no mesmo ingest:
`bio.rank` → o ranking do snapshot; `bio.age` → calculada do `dob`.

**Tamanho do JSON:** publicar **apenas agregados**, nunca a série temporal. `model-atp.json` tem 0,50 MB hoje e `web/matches.json` já pesa 3,54 MB no cliente.

---

## A regra de classificação

Calibrada em 813 ativos ATP e 366 WTA (snapshot 20260608 vs 20250609, gap de 1 dia dos 12 meses exatos).

```
sem rank12m/points12m  → "Sem histórico"           (ausência de rótulo + motivo)
max(pts, pts12m) < 50  → "Pouco tênis no período"  (ausência de rótulo + motivo)
razão = points / points12m
razão >= 1.50          → Em ascensão
razão <= 0.667         → Em declínio
rank <= peak + clamp(round(0.25*peak), 3, 20) → No auge
senão                  → Estável
```

**Por que PONTOS e não posição no ranking.** A razão de posição é estruturalmente incapaz no topo: quem começa o ano no top 10 tem **0% de chance** de sair "Em ascensão" e 40% de sair "Em declínio" — partindo do #5 a razão máxima é 5,0 e a mínima é 0,005. Casos reais que isso produzia: Pegula #3→#4 = "Em declínio"; Swiatek #7→#3 = "Em ascensão"; Medvedev #11→#8 = "Em ascensão". Todos corrigidos por pontos.

**A objeção contra pontos foi testada e é falsa:** "ganhar pontos e cair no ranking" aconteceu em **0 de 813 (ATP) e 0 de 366 (WTA)** entre os rotulados. O card pode mostrar os dois números lado a lado — eles nunca se contradizem.

**Por que T=1,5.** Em 1,3, Sabalenka (#1→#1, razão 0,787) fica a **0,018** de ser publicada como "Em declínio". Em 2,0, Musetti (×0,51), Gauff (×0,60), Paolini (×0,54) e Tiafoe (×0,57) saem "Estável" tendo caído pela metade — 16 casos. Em 1,5 esse contador é zero e nenhum top-10 fica a menos de 18% de um corte.

**Por que o portão de 50 pontos (e não um piso de ganho absoluto).** Sem ele, Darian King (1→7 pontos, 34 anos) sai "Em ascensão". Um piso de 100 criaria absurdo novo: Kiranpal Pannu (46→3 pontos, #660→#1565) viraria "Estável" — 162 casos de movimento ≥100 posições virando "parado". O portão faz a limpeza sem isso (17 casos). Atinge 117 ativos ATP (14,4%, todos rank ≥685, mediana #990) e 5 WTA (1,4%).

**Por que a régua aditiva do auge.** `peak*1.25` **pune quem foi bom**: 10 ativos ATP e 18 WTA têm pico ≤4, e para todos `floor(peak*1.25) == peak` — folga zero. Alcaraz (#2, pico #1) sairia "Estável". Enquanto isso, quem tem pico #1000 ganharia +250 de folga. O piso de 3 (em vez de 5) foi apertado com evidência: com piso 5, Fritz vira "No auge" no #9 tendo caído do #7, e Svitolina vira "No auge" no #8 com pico #3 de 2017. Custo aceito: Mensik (#17, pico #12) vira "Estável".

**Precedência:** a direção (12 meses) decide ascensão/declínio primeiro; o pico só desempata os parados (auge vs estável). Motivo: todo jogador em ascensão está, por definição, no próprio pico — sem essa ordem, "ascensão" e "auge" colidiriam sempre.

### Distribuição resultante (medida)

| tour | recorte | n | Ascensão | Auge | Estável | Declínio | Sem base |
|---|---|---:|---:|---:|---:|---:|---:|
| ATP | todos | 813 | 28,0% | 4,6% | 27,4% | 23,4% | 16,6% |
| ATP | top 100 | 100 | 34,0% | 17,0% | 33,0% | 16,0% | 0% |
| WTA | todos | 366 | 23,8% | 7,1% | 35,0% | 30,6% | 3,6% |
| WTA | top 100 | 100 | 41,0% | 14,0% | 33,0% | 12,0% | 0% |

Nenhum balde vazio, nenhum dominante. Ascensão e declínio quase simétricos na ATP — esperado num ranking aproximadamente soma-zero.

---

## Identidade — BLOQUEANTE

**Brandon Nakashima (#32) e Bryce Nakashima (#1483) disputam o mesmo slot `Nakashima B.`.** São 10 colisões (Tsitsipas Petros vs Pavlos; Leylah vs Lya Fernandez; Yafan vs Yuhan Wang; Li Z.; Suresh D.; Petrovic D.; Jang S.J.; Lee G.; Petkovic A.). Sem desempate, **o rótulo do #32 do mundo é sorteio.**

Pior: **`Wang Xin.` já exibe hoje o ranking da pessoa errada** — recebeu o rank 31 de Xin Yu Wang, mas o `bio.id` aponta para Xin Tong Wang. Erro silencioso, já em produção.

**Regra de join, nesta ordem:**

1. **`bio.id` quando existir** — é o `player_id` do Sackmann (bate em 98,8% ATP / 97,7% WTA das linhas casadas). Cobre 438/879 ativos ATP e 345/381 WTA.
2. **Cair para nome** via `findModelPlayer(fullName, players)` ([match-names.js:64](../../../web/src/match-names.js)). Cobertura medida: **813/879 ativos ATP (92,5%)**, **366/381 WTA (96,1%)**.
3. **Guarda-corpo:** se `|age(dob) − bio.age| > 2`, é suspeito.
4. **Ambíguo irresolvível → EXCLUI, não chuta.** O protótipo excluiu 14 (ATP) e 1 (WTA).

**Notas obrigatórias:**

- **Use `findModelPlayer`, não `matchPlayer`.** O `matchPlayer` sozinho falha em nomes completos: para `"Tomas Barrios Vera"`, o `parseModelName` ([match-names.js:13-18](../../../web/src/match-names.js)) lê `initial="v"`, `surname="tomasbarrios"` — nunca casa. O `findModelPlayer` tenta `normName` exato antes.
- **Construa o mapa id→nome UMA vez** e reuse em todos os snapshots. É O(ids × players): 2.265 × 1.551 ≈ 2,3s por passada.
- **`p.name` é formato MISTO** ([combined-matches.js:24-32](../../../pipeline/combined-matches.js)): `Kyrgios N.` convive com `Tomas Barrios Vera`. Dos 441 ativos ATP sem `bio.id`, 433 são `level: 'challenger'` — os de nome completo.
- **Duplicata pré-existente no modelo:** `Bu Yunchaokete` (143 jogos) e `Bu Y.` (55 jogos) são o mesmo jogador em duas entradas. O join não cria o problema nem o resolve — `Bu Y.` fica órfão.
- **Asserte a cobertura no log final**, como [patterns-ingest.js:64](../../../pipeline/patterns-ingest.js) faz. O `EloEngine._get` cria jogador silenciosamente ([elo-engine.js:13-18](../../../pipeline/elo-engine.js)) — errar a chave é falha silenciosa.

---

## Textos do card

Tom do projeto, **número sempre embutido** (regra declarada em [patterns-view.js:2](../../../web/src/patterns-view.js)). Ordem: rótulo — evidência em pontos — evidência em rank.

Textos finais, como saem em produção:

```
Em ascensão — os pontos subiram 1,8x em 12 meses (1.970 → 3.540). Saiu do #25 e está no #10.
No auge — está no #1, o melhor ranking da carreira, alcançado em 2024.
No auge — está no #2; seu melhor foi #1, em 2022. Os pontos mudaram +13% em 12 meses (8.850 → 9.960).
Estável — os pontos mudaram -19% em 12 meses (4.630 → 3.760); está no #7; seu melhor foi #1, em 2011.
Em declínio — perdeu 40% dos pontos em 12 meses (8.083 → 4.879). Era #2, está no #7.
Sem histórico — não tinha ranking em junho de 2025, então não dá para dizer o momento. Está no #465.
Pouco tênis no período — não passou de 49 pontos nos últimos 12 meses; não dá para falar em momento de carreira.
```

Mais a data do snapshot, uma vez, junto da ressalva: `Ranking de 08/06/2026. Descreve o que já aconteceu…`

**Duas armadilhas que a review final pegou e que valem como regra:**

- **A palavra "longe" foi proibida.** A versão anterior desta spec trazia *"está no #7, longe do melhor da carreira (#1, em 2011)"*. Medido em produção: isso escrevia *"Mensik J. — está no #17, longe do melhor da carreira (#12, em 2026)"* — cinco posições, pico no mesmo ano. Era o único adjetivo editorial do módulo sem número que o sustentasse, e o número ao lado o desmentia. Usar sempre a construção neutra `; seu melhor foi #X, em ANO.` e deixar o leitor julgar a distância.
- **A palavra "hoje" foi proibida** (ver a regra normativa em Fundação de dados). A versão anterior trazia *"Hoje está no #465"* sobre um snapshot de 5 semanas atrás — exatamente o defeito que esta feature existe para corrigir.

**O ano do pico é obrigatório** em "No auge" e "Estável". *"No auge — #8, melhor foi #3, em 2017"* é uma frase muito diferente de *"No auge — #6, seu melhor de sempre, em 2024"*. Com o ano visível, o leitor calibra sozinho.

**Aviso de subida concentrada — obrigatório.** Medido: **26,3% dos "Em ascensão" da ATP** (60 de 228) e 19,5% da WTA têm ≥50% do ganho de 12 meses vindo de **uma única semana**. Cobolli (#10): 76%. Chwalinska (#21 WTA): 93%. "Em ascensão" sugere tendência; para 1 em cada 4, é um torneio.

```
Cuidado: 76% da subida do Cobolli veio de uma semana só — 1.200 dos 1.570 pontos, em 08/06/2026.
```

**Gatilho:** ≥60% do ganho de 12 meses numa única semana.

**Ressalva de honestidade — obrigatória.** Medimos que o rótulo não antecipa vitórias além do que o Elo já sabe. Segue o precedente de [app.js:935](../../../web/app.js):

```
Descreve o que já aconteceu nos últimos 12 meses — medimos que não antecipa o próximo jogo.
```

---

## Ponto de integração na UI

O card é o dossiê — `openDossier(player)`, [app.js:1067-1139](../../../web/app.js). Não existe `playerCard`.

**Nova linha entre [app.js:1107](../../../web/app.js) (`bioText` → `.dos-bio`) e :1108 (aviso Challenger)** — as posições 3-6 são o bloco de identidade, 7-11 são séries numéricas. Momento de carreira é identidade.

**Não enfie dentro do `bioText`:** [patterns-view.test.js:47](../../../tests/patterns-view.test.js) faz `assert.equal` da string inteira e quebraria.

CSS de aviso já existente e reutilizável: `.explain-warn` ([styles.css:436](../../../web/styles.css), âmbar), `.notice`, `.field-hint`.

---

## Casos de borda — tratamento explícito obrigatório

**Regra-mãe: nunca há fallback silencioso.** Um `if (!rank12m) return 'parado'` ingênuo faria **Venus Williams (#465, 46 anos, pico #2) virar "Estável"** e **Jang S.J. (#1235, pico 1235) virar "No auge"** porque `rank == peak`.

| caso | n medido | tratamento |
|---|---|---|
| **Sem `rank12m`** (novo ou sumiu do ranking) | 18 ATP / 8 WTA (2,2%) | "Sem histórico". `undefined ≠ 2000`. Na WTA são nomes reconhecíveis: Venus Williams, Vera Zvonareva, Bouchard. Recomendo **ocultar** da lista principal — é sinal de inatividade. |
| **Pouco tênis** (portão) | 117 ATP (14,4%) / 5 WTA | "Pouco tênis no período". **Não invente "Estável".** |
| **Lesão vs declínio** | 4 casos | **Impossível separar com os dados atuais.** O ranking não some — Storm Hunter ficou ranqueada 53/53 semanas no #1324. A ausência aparece como colapso de pontos, não como buraco na série. O card diz o fato ("caiu do #451 para o #1289"). **Não invente regra de idade para mascarar.** |
| **Pico muito antigo** | — | A régua aditiva resolve (Svitolina #8, pico #3 de 2017 → "Estável"). O ano do pico no texto fecha o resto. |
| **Volta de lesão** | — | Sai "Em ascensão". Aceito: o número não mente ("os pontos subiram 80x; do #1324 para o #187"). |
| **Aposentado ainda `active`** | 35 ATP `level:'tour'` com rank >500 | Causa é o `activeCutoff` frouxo do modelo, não a regra. Nishikori #710, Monfils #259, Coric #844. **Fora de escopo** — registrado. |
| **Colisão de nome** | 10 | Exclui. Ver Identidade. |

**Absurdos aceitos conscientemente:**

- **Veteranos "Em ascensão"** — 14/228 ATP (6,1%), 9/87 WTA. Cirstea aos 36 (#169→#18, ×5,6). Com o número no card, ela *está* subindo. É fato, não narrativa.
- **Gauff "Em declínio"** aos 22 (#2→#7, ×0,60). Ela perdeu 40% dos pontos. Com o número, é honesto.
- **Fronteira frágil.** Ann Li (#29 WTA) está a **2 pontos** de virar "Em ascensão" (razão 1,498). Corte categórico tem borda; não há solução dentro de rótulo discreto.

---

## Testes

`node:test` + `node:assert/strict` (`npm test` = `node --test`). Convenções do repo: nome em pt-BR (`funcao: o que ela faz`), fixture literal no topo, CSV inline com `.join('\n')` ([ingest-sackmann.test.js:5-13](../../../tests/ingest-sackmann.test.js)), **caso nulo sempre** ([patterns-view.test.js:27](../../../tests/patterns-view.test.js)).

Funções com `fetch` **não são testadas** (não há mock no repo) — mantenha o IO fino e a lógica pura.

**`tests/rankings.test.js`** (pipeline puro):
- parse ATP (4 colunas) e **WTA (5 colunas, `tours` extra)**
- join por `bio.id`; queda para nome; guarda-corpo do `dob`; **colisão → exclui**
- pico e `peakDate`; `spikePct`/`spikeDate`
- caso nulo

**`tests/career.test.js`** (classificação + texto):
- os 4 rótulos, um caso cada, com números reais
- **Sem histórico** — e que **não** cai em "Estável" (caso Venus)
- **Pouco tênis** — e que **não** cai em "Estável"
- `rank == peak` com pico ruim **não** vira "No auge" sem base (caso Jang S.J.)
- Alcaraz (#2, pico #1) → **No auge**, não "Estável" (a régua aditiva)
- Sabalenka (razão 0,787) → **não** é "Em declínio" (a defesa do T=1,5)
- aviso de spike dispara em ≥60% e não dispara em 59%
- `careerText(null) === ''`

---

## O que fica em aberto (registrado, não resolvido)

0. **672 jogadores inativos (43%) no `model-atp.json` publicado** — 28% do peso do arquivo (0,52 → 0,38 MB), invisíveis: todas as listas filtram por `active` ([player-search.js:7](../../../web/src/player-search.js), [app.js:1030](../../../web/app.js), :1353, :1402). São necessários **no treino** (as partidas contra eles moldaram o Elo de quem joga hoje), não no JSON servido ao cliente. **Decisão de 2026-07-16: deixar quieto** — podar é otimização, não esta feature, e o problema-raiz é o `activeCutoff` frouxo (35 ATP `level:'tour'` com rank >500 seguem `active`). Tratar junto quando isso for atacado. Custo de podar: perde-se buscar/simular com aposentados (Nadal, Federer).
1. **`partidas12m` não existe.** `matches` é total de carreira (Djokovic 773, Fruhvirtova 28) — e, pior, é "jogos desde 2013", não carreira real, o que já deixa o K-factor errado para veteranos. É a medição de **maior retorno por esforço** apontada pela auditoria: separaria lesão de declínio e retorno de ascensão, os casos que a regra hoje erra conscientemente. O projeto **tem** o histórico (`web/matches.json`, 3,54 MB) — é derivável, mas fora desta spec.
2. **Nível dos torneios que geraram os pontos.** A série semanal só tem o total. Sem isso, "Em ascensão" não separa tendência de evento único — daí o aviso de spike ser um remendo, não uma solução.
3. **Janela COVID.** 2020 tem 27 semanas de ranking ATP (vs ~47). Ranking congelado / melhor-de-24-meses quebra o significado da razão de pontos naquele período.
4. **Estabilidade temporal do rótulo.** Deslocar a janela em 2/4/8 semanas troca 12,8%/21,3%/26,9% dos rótulos. Quanto disso é ruído e quanto é sinal, não sabemos.
5. **O pico vem de séries que começam em 2010.** Quem teve pico antes disso fica com o pico errado — mas teria 40+ anos hoje. Aceito.
6. **`peakDate` é a PRIMEIRA vez no pico, não a última.** O Djokovic sai como "seu melhor foi #1, em 2011" tendo sido #1 até 2024. É verdade literal e a regra é consistente (a alternativa — a data da janela viva — não significa nada, só reflete onde o recorte começa). Um `peakDateLast` seria mais informativo para quem está longe do pico, mas exigiria regerar o cache versionado, o que custa rebaixar o `10s`. Registrado, não resolvido.
7. **A identidade contaminada é recusada, não consertada.** A feature detecta quando `fullName` e `bio.name` discordam e se cala (7 casos). Mas o `bio` continua sendo da pessoa errada para o resto do card: a linha `Ranking #708 WTA · 19 anos` do `Wang Y.` segue errada, como já era antes desta branch. A raiz é o matching fraco do [patterns-ingest.js](../../../pipeline/patterns-ingest.js) e continua viva. **Esta feature parou de piorar o problema; não o resolveu.**
8. **`excluded` é um `console.log` num cron que ninguém lê.** O guarda de cobertura protege contra colapso (<80%), não contra erosão: se o join começar a excluir 30 jogadores em vez de 7, a cobertura cairia para ~88% e o dia passaria em silêncio. Um segundo guarda ("excluídos cresceram 3x vs. ontem") seria o que realmente avisa.
9. **O `rankings-ingest` pode derrubar a grade do dia.** Ele roda **antes** do `fixtures.js` no cron e falha alto (`throw`) se o mirror devolver 404. O `patterns-ingest.js` escolheu o oposto (`if (!res.ok) return` — degrada). Um 503 do mirror às 08:00 UTC não custa só a trajetória: custa os jogos do dia, e o Felipe vê a grade de ontem sem aviso de que é de ontem.
