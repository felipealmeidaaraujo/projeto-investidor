# Decay por inatividade no Challenger ATP — Especificação

> **Data:** 2026-07-18
> **Status:** Escopo aprovado pelo Felipe (brainstorming). Medição fechada. Próximo passo: plano de implementação (writing-plans).
> **Relacionado:** [2026-07-17-vies-idade-elo-design.md](2026-07-17-vies-idade-elo-design.md) (o mesmo método e o mesmo ponto de integração; o decay é o **espelho** do ajuste de idade — idade só no tour, decay só no Challenger). Bug do "Elo defasado" (obituário): [2026-07-16-trajetoria-ranking-design.md](2026-07-16-trajetoria-ranking-design.md).

---

## Resumo em português claro

**O modelo superestima quem volta de uma pausa longa.** O Elo fica "congelado" no nível de antes da ausência, mas o jogador volta enferrujado e rende menos do que o número prevê. Medido walk-forward, quem entra numa partida depois de **180+ dias sem jogar** vence, na média, **~6pp menos** do que o Elo diz; depois de um ano, **~9pp menos**.

**Vamos corrigir isso — só no Challenger ATP.** Não porque o viés não exista no tour (existe, e é do mesmo tamanho), mas porque **só no Challenger há dado suficiente para a correção pagar fora da amostra**. Um termo de inatividade aplicado na hora de servir a probabilidade, análogo ao de idade. O card vai dizer que corrigiu e por quê.

**Na WTA, não** — o ganho não paga fora da amostra (IC cruza zero), como no viés de idade.
**No tour ATP, não** — o viés existe (−6,17pp), mas com só 297 jogos de 180+ dias no teste não há poder para validar (IC cruza zero). É "não sei", não "não tem"; fica documentado como revisitável.

---

## O que foi medido (2026-07-18)

Walk-forward com o Elo do projeto (prevê cada jogo **antes** de atualizar, sem vazamento), 2013–2026, probabilidade na escala da tela (com `calibrationT` aplicado). Desenho por jogador-partida; inatividade = dias entre a partida e o `lastDate` do jogador.

### O viés existe, e é monótono na inatividade (ATP, amostra inteira)

| inatividade | n | previsto | real | viés |
|---|---:|---:|---:|---:|
| 0–30 dias | 233k | 50,5% | 51,2% | +0,71pp |
| 30–90 | 17k | 49,0% | 49,1% | +0,07pp |
| 90–180 | 5,2k | 43,7% | 41,2% | −2,57pp |
| 180–365 | 4,0k | 41,6% | 35,9% | **−5,72pp** |
| 365+ | 2,1k | 40,7% | 31,2% | **−9,45pp** |

Nulo em quem jogou há pouco; cresce de forma monótona a partir de ~90 dias. **Placebo nulo:** permutando as inatividades entre os registros, o ganho da correção cai a 0,00000 — a maquinaria não fabrica efeito.

### O teste que decide: fora da amostra, por nível

Treino ≤2023, teste 2024–26. Ganho de Brier da correção (baseline = a probabilidade da tela). IC95 bootstrap-cluster (por partida).

| recorte | n teste | ganho de Brier | IC95 | veredito |
|---|---:|---:|---|---|
| **Challenger ATP** | 50.786 | **+0,00060** | [0,00041; 0,00078] | **paga** |
| Tour ATP | 13.774 | +0,00003 | [−0,00007; 0,00013] | cruza zero → **fora** |
| WTA (combinado) | 11.401 | +0,00011 | [−0,00012; 0,00035] | cruza zero → **fora** |

O ganho vive no **Challenger**. É o mesmo padrão do "Elo defasado", cujo único efeito real também morava lá. O viés descritivo é praticamente igual nos dois níveis da ATP (tour −6,17pp; chall −7,03pp) — a diferença é **dado** (tour: só N=297 de 180+ dias no teste).

### O efeito é concentrado e move na direção certa

No Challenger: **9,6%** dos jogos do teste têm algum jogador voltando de 90+ dias, e neles o ganho de Brier é **+0,00623** (10× o diluído). Nos jogadores que voltam (n=2.663): o modelo previa **41,2%**, a correção baixa para **38,0%**, e o real é **35,1%** — fecha ~metade do viés.

---

## A exceção à spec-mãe

A spec de 2026-07-15 põe "ajustar a probabilidade do modelo por forma/idade" fora de escopo. Como no viés de idade, **esta spec abre a mesma exceção, pela mesma razão**: não é palpite, é a correção de um viés **medido** do estimador, com placebo nulo e ganho fora da amostra cujo IC não cruza zero. O custo é **um termo**; o motor Elo não muda.

---

## A fórmula

```
logit(p_corr_A) = logit(p_tela_A) + c · (f(inat_B) − f(inat_A))     // SEM intercepto
f(inat) = min(1, max(0, (dias_inativo − 90) / 365))                // rampa: 0 até 90d, sobe até 1 em ~1,4 ano
```

- `p_tela_A` — a probabilidade que o app já serve (com `calibrationT`).
- `inat_X` — dias entre a data do confronto e o `lastDate` do jogador X. Sem `lastDate` (novato) → `f = 0`.
- **c = 0,50** (Challenger ATP) — fitado no treino; ganho fora da amostra **+0,00060**, IC95 [0,00041; 0,00078].

**Sem intercepto, antissimétrico** (como a idade): `p_corr(A vs B) + p_corr(B vs A) = 1`. Trocar A↔B inverte o sinal do termo.

**A rampa começa em 90 dias** porque o viés só aparece a partir daí (nulo em 0–90). Foi a forma de melhor ajuste entre as testadas (rampa>90, rampa>90 capada, binário 180+, rampa>180); as quatro pagam, esta é a maior.

**O efeito na tela** (jogador que volta, oponente fresco, confronto 50/50):
- volta de **6 meses** → 50,0% cai para **46,9%** (−3,1pp)
- volta de **1 ano** → 50,0% cai para **40,7%** (−9,3pp)

---

## O gate: espelho do ajuste de idade

O ajuste de idade roda **só no tour**; o decay roda **só no Challenger**. Como um jogo é tour **ou** Challenger, **os dois nunca se aplicam ao mesmo confronto** — são mutuamente exclusivos por nível. Não há interação a modelar (e a medição do decay, feita sobre a probabilidade *sem* o ajuste de idade, é exatamente o que roda em produção no Challenger).

O nível já existe no pipeline (feature de 2026-07-17): a decisão vive em `analyzeMatch`, pelo mesmo `nivelEfetivo` que gateia a idade.

```
aplicaDecay = (nivelEfetivo === 'challenger') && DECAY_COEF[model.tour]    // DECAY_COEF = { ATP: 0.50, WTA: 0 }
```

`nivelEfetivo` é **o mesmo** que já gateia a idade (introduzido na feature de nível): o nível do torneio quando informado (grade); senão, `'challenger'` se algum jogador for de nível Challenger (`player.level`), senão `'tour'`. Como idade e decay leem o mesmo `nivelEfetivo` e checam valores **opostos**, a exclusividade é automática — nenhum gate novo, nenhum fallback separado. Na análise manual, um confronto em que algum jogador é de base Challenger cai em `'challenger'` e recebe o decay; um confronto de dois jogadores de tour cai em `'tour'` e recebe a idade (se houver gap).

---

## Arquitetura

Segue o padrão do projeto (módulo puro em `web/src/`, a UI só renderiza):

| peça | papel |
|---|---|
| `web/src/decay-curve.js` | **novo, puro**: `decayAdjusted(prob, inatA, inatB, tour) -> {prob, base, delta, inatMaisParado, adjusted}` |
| `web/src/analysis.js` | integra junto do `ageAdjusted`, gateado por `nivelEfetivo === 'challenger'` |
| `pipeline/fixtures.js` | computa `inatA/inatB` do `lastDate` + `commence` e passa ao `analyzeMatch`; grava o resultado no `today.json` quando houver |
| `web/app.js` | renderiza a linha explicativa no card e um selo na grade |

`DECAY_COEF` e o `90`/`365` da rampa são constantes nomeadas, com o valor medido, a data e o N ao lado — o padrão dos comentários do projeto.

**Fonte da inatividade:** `dias = (data do confronto) − p.lastDate`. Na grade, a data é o `commence`; na análise manual, hoje. O `lastDate` já viaja no `model.json` ([train.js:62](../../../pipeline/train.js)). O `analyzeMatch` recebe a data de referência (ou a inatividade já computada) — detalhe do plano.

---

## O texto no card e o selo na grade

Tom do projeto, número embutido. A frase nomeia quem volta:

```
Ajustado por inatividade: Fulano volta de 8 meses sem jogar — o modelo superestima quem volta de pausa longa em Challenger. Sem o ajuste: 44,0%.
```

Na grade, um selo no padrão dos existentes (`⚖ ajuste de idade`, `⚖ ajuste suspenso`): **`⚖ ajuste de inatividade`**, só quando houver ajuste.

Aparece **sempre que houver ajuste** (não só quando grande) — a mesma regra da idade, sem limiar arbitrário.

---

## O que fica fora, de propósito

| item | por quê |
|---|---|
| **A WTA** | Ganho +0,00011, IC [−0,00012; 0,00035] cruza zero. Não paga fora da amostra. |
| **O tour ATP** | O viés existe (−6,17pp), mas N=297 de 180+ dias no teste → IC [−0,00007; 0,00013] cruza zero. Sem poder para validar. Revisitável com mais dado. |
| **Gate por idade** | O achado concentra em veteranos, mas a forma **pura** (só inatividade) já paga fora da amostra; gatear por idade não foi medido e o eixo idade já é coberto pelo ajuste de idade (no tour). |
| **Corrigir dentro do motor Elo** | Como na idade: só o efeito **pareado** é identificado; a correção pós-`calibrationT` no par é o único caminho validado. O motor não muda. |
| **Formas não-lineares elaboradas** | A rampa linear (>90, capada) já é a de melhor Brier entre as testadas; mais parâmetros = mais risco de overfit sem ganho medido. |

---

## Riscos e observações

- **`lastDate` reflete o último jogo que o modelo VIU.** O modelo é retreinado no cron diário; o `lastDate` é do último jogo antes do confronto de hoje. Correto por construção (a inatividade é sempre medida *antes* da partida). Um jogador que jogou um torneio não coberto pela fonte (ex.: ITF, que o modelo não ingere) apareceria como "inativo" — é a mesma cegueira de cobertura já conhecida (a grade não enxerga ITF); aceitável e conservador (na dúvida, assume ferrugem).
- **O coeficiente é o erro DESTE Elo, não uma constante da natureza.** Se o K, o prior 1500 ou a fórmula mudarem, a medição precisa ser **refeita** — igual ao aviso do `AGE_COEF`. O comentário da constante diz isso.
- **Interação com a idade: nenhuma, por construção** (exclusivos por nível). Se um dia o tour receber o decay (mais dado), aí a interação com a idade precisaria ser medida — hoje não.
- **Antissimetria a testar** (como na idade): `p_corr(A,B) + p_corr(B,A) = 1` para todos os casos, incluindo inatividades trocadas.
