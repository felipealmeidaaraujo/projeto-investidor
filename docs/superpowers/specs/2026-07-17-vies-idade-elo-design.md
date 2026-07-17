# Viés de Idade no Elo — Especificação

> **Data:** 2026-07-17
> **Status:** Escopo aprovado pelo Felipe. Próximo passo: plano de implementação (writing-plans).
> **Muda a spec-mãe:** [2026-07-15-plataforma-analise-tenis-design.md](2026-07-15-plataforma-analise-tenis-design.md) põe "ajustar a probabilidade do modelo por forma/idade" fora de escopo. **Esta spec abre uma exceção**, com a evidência que a justifica — ver "A exceção à spec-mãe".

---

## Resumo em português claro

**O modelo subestima o jogador mais novo.** Num confronto de tour ATP entre um jovem (≤23) e um veterano (≥30), ele diz 49,4% e a realidade é 57,5% — **8 pontos percentuais de erro**. Com 12+ anos de diferença, o erro chega a **10,5pp**.

**Vamos corrigir isso — só na ATP**, com um termo de idade aplicado na hora de servir a probabilidade. O card vai dizer que corrigiu e quanto.

**Na WTA, não.** O viés existe lá também (+5,32pp), mas a correção **não se sustenta no teste fora da amostra** — e chega a supercorrigir nos casos extremos. Viés existir e correção compensar são perguntas diferentes.

**Três hipóteses foram testadas e descartadas** (detalhes abaixo): não é o K-factor, não é volume de carreira, não é a "superconfiança" do modelo. **É idade.**

**O que muda na sua tela:** 21,3% dos jogos ATP têm diferença de idade ≥8 anos. Num confronto típico a probabilidade move ~2,9pp; nos extremos, até 10pp.

---

## O que foi medido

Dataset walk-forward, **com o Elo limpo** (após o fix de ordenação de 2026-07-17, commit `317b3a0`): o Elo de cada jogador *antes* de cada partida, mais idade e volume de jogos. ATP N=77.301, WTA N=22.545, de 2018 a 2026. Ordem canônica A/B (não vencedor/perdedor) — taxa base verificada em ~50%.

### O viés existe

| corte | N | previsto | real | viés | IC95 |
|---|---:|---:|---:|---:|---:|
| **ATP tour, jovem ≤23 × veterano ≥30** | 1.976 | 49,4% | 57,5% | **+8,16pp** | ±2,18 |
| ATP tudo, jovem × veterano | 7.435 | 48,4% | 54,2% | +5,82pp | ±1,12 (cluster) |
| **WTA tour, jovem × veterano** | 1.377 | 50,7% | 56,1% | **+5,32pp** | ±2,62 |
| **ATP tour, gap ≥12 anos** | 1.254 | 47,3% | 57,8% | **+10,47pp** | ±2,73 |

Sinal positivo = o modelo subestima o mais novo. Números na escala da **tela** (com o `calibrationT` já aplicado), não na crua.

**Por que não é ruído:**

- **Placebo interno nulo.** Gap 0–2 anos: +0,52pp (ATP, z=1,7). Se fosse artefato de medição, apareceria também onde os dois têm a mesma idade.
- **Placebo externo nulo.** Permutando o mapa jogador→`dob` 20 vezes: z mediano −0,02, |z| máximo 1,41. A maquinaria não fabrica efeito.
- **Gradiente monótono:** ~0,5pp por ano de gap, em toda a faixa.
- **Não depende de ninguém:** removendo os 10 jogadores mais frequentes, o viés **sobe** (+5,82 → +6,19pp).

### A causa é idade, não volume de carreira

Esta era a pergunta que decidia o desenho. Regressão sem intercepto, antissimétrica, na escala da tela:

| modelo | ATP (N=77.301) | WTA (N=22.545) |
|---|---|---|
| [M1] escala + idade | γ = **0,0227** (z=17,9) | γ = **0,0189** (z=7,9) |
| [M2] escala + volume, **sem** idade | δ = −0,0136 (z=−1,80) → **NULO** | δ = +0,0259 (z=+1,90) → **NULO** |
| [M3] ambos | γ = **0,0394** (z=22,7) | γ = **0,0370** (z=11,8) |

1. **O volume sozinho não explica nada** — nulo nos dois tours, e com **sinais opostos** entre eles.
2. **Quando a idade entra, γ cresce** (0,0227 → 0,0394): o volume estava *mascarando* a idade, não criando.
3. A idade **não encolhe em nenhum** dos 5 estratos de volume (ATP −0,036 a −0,041) — teste não-paramétrico, não depende de forma funcional.

### Três hipóteses falsificadas

**O K-factor.** `K = 250/(matches+5)^0.4` previa viés pior onde o K é **menor** (veterano com muitos jogos). O dado diz o oposto: viés −0,0755 onde K≈64 vs −0,0302 onde K≈22 — **2,5× maior onde o K é ALTO**. Mexer no K não corrige e adiciona ruído.

**A "superconfiança".** Uma medição alarmou β=0,85 (ATP) na probabilidade **crua**. Mas 1/1,15 = 0,87 — o `calibrationT` do app ([analysis.js:85](../../../web/src/analysis.js)) **já é exatamente essa correção**. Na escala da tela: **b = 0,987 (ATP) / 1,023 (WTA)** — calibrado. Aplicar de novo seria dobrar.

**O bug de ordenação.** O viés foi medido antes (+6pp) e depois (+5,82pp) do fix: a diferença está dentro do IC. Os 587.022 pares fora de ordem **não eram a causa**. Consertá-los foi certo por outros motivos.

### O teste que decide: fora da amostra

Treino ≤2023, teste 2024-26, só tour, baseline = a probabilidade que a tela mostra hoje:

| tour | N teste | Brier tela | Brier +idade | ganho | IC95 (bootstrap cluster) | veredito |
|---|---:|---:|---:|---:|---:|---|
| **ATP** | 6.618 | 0,21295 | 0,21144 | **+0,00150** | [0,00090; 0,00218] | **melhora** |
| **WTA** | 5.881 | 0,21696 | 0,21639 | +0,00057 | [−0,00020; 0,00125] | **nulo** |

---

## A exceção à spec-mãe

A spec de 2026-07-15 diz, em "Fora de escopo": *"Ajustar a probabilidade do modelo por forma/idade (o momento de carreira é leitura, não ajuste do modelo)."*

**Esta spec abre uma exceção, decidida pelo Felipe em 2026-07-17.** O raciocínio:

A regra nasceu de um princípio bom — **não ajuste o modelo por palpite**. Ela foi escrita no contexto de "não mexa na probabilidade porque *acho* que forma/idade importam". Aqui não é palpite: é a **correção de um viés medido do estimador**, com placebo interno e externo nulos e ganho fora da amostra cujo IC não cruza zero.

O custo é **um termo**, não um redesenho. O motor Elo não muda.

**A regra continua valendo para todo o resto.** O "momento de carreira" segue sendo leitura, não ajuste — e continua medido como não-preditivo (ver [2026-07-16-trajetoria-ranking-design.md](2026-07-16-trajetoria-ranking-design.md), "O obituário do item 2").

---

## A fórmula

```
logit(p_corrigido) = b · logit(p_tela) + c · gap_idade      // SEM intercepto
```

- `p_tela` — a probabilidade que o app já serve hoje (com `calibrationT` aplicado)
- `gap_idade` — idade do jogador B menos a de A, em anos (positivo = A é mais novo)
- **c ≈ 0,026/ano** (ATP) — medido: 0,0257 no fit de treino, 0,0273 na amostra toda
- `b` ≈ 1,0 (a tela já está calibrada; o fit final determina o valor exato)

**Sem intercepto é obrigatório, não estilo.** Com intercepto, `p(A vs B) + p(B vs A) = 1,0588` — o modelo diria que os dois somam 105,9% de chance de vencer. Pior: o intercepto **absorve o próprio efeito de idade** (a₀ = 0,134 ≈ gap médio 5a × c 0,028). Foi esse artefato que fez uma medição anterior concluir que a correção "piorava" a WTA.

**Linear, não quadrático.** O termo quadrático é desprezível na ATP (coef +0,0008) e nulo na WTA (z=0,72). Um termo por tour basta.

**Só ATP.** Ver "O que fica fora".

**O volume entra no ajuste, não na tela.** Como covariável de calibração no fit — omiti-lo puxa γ para zero por supressão mútua (r=+0,65 com efeitos de sinal oposto). Não é um input da fórmula servida.

---

## Arquitetura

Segue o padrão do projeto: módulo puro em `web/src/`, sem DOM; a UI só renderiza.

| peça | papel |
|---|---|
| `web/src/age-curve.js` | **novo, puro**: `ageAdjusted(prob, gapAnos, tour) -> {prob, delta, gap}` |
| `web/src/analysis.js` | ponto de integração — onde o `calibrationT` já é aplicado (linha ~85) |
| `web/app.js` | só renderiza a linha explicativa |

O coeficiente é uma constante nomeada, com o valor medido, a data e o N ao lado — o padrão dos comentários deste projeto.

**Fonte da idade:** `p.career` já traz o necessário, e o `bio.age` foi corrigido na feature anterior (recalculado do `dob` no snapshot). Jogador sem idade confiável → **sem ajuste**, sem fallback silencioso.

---

## O texto no card

Tom do projeto, número embutido:

```
Ajustado por idade: 13 anos de diferença — medimos que o modelo subestima o mais novo em confrontos assim. Sem o ajuste: 59,4%.
```

A linha aparece **sempre que houver ajuste** (não só quando for grande): um limiar criaria um card que às vezes explica e às vezes não, e mais uma constante arbitrária para justificar.

---

## O que fica fora, de propósito

| item | por quê |
|---|---|
| **A WTA** | O viés existe (+5,32pp, z=4,3) mas a correção **não paga fora da amostra** (IC cruza zero) e **supercorrige** os extremos (gap 12+: de +1,76pp para −6,20pp). 3,4× menos dado; no teste de estresse nenhum bucket sobrevive (N de 33 a 834). **Não replicar a curva do ATP nela.** |
| **O K-factor** | Falsificado (viés 2,5× maior onde o K é alto). |
| **A "superconfiança"** | O `calibrationT` já faz. Aplicar de novo dobraria. |
| **Decay por inatividade** | Achado real e grande (180+ dias: −6,78pp, quase todo em veteranos ≥33: −16,53pp; jovens <25: nulo). Mas **não medeia** o viés de idade — carrega só 5% (ATP) / 11% (WTA). **Outra spec.** |
| **O nível do torneio na grade** | O [flashscore.js:13](../../../pipeline/flashscore.js) descarta o nível: Challenger e ITF aparecem rotulados como "ATP"/"WTA". Bug real, viola `clareza-zero-duvida`, **outra spec**. |
| **Corrigir dentro do motor** | Só o efeito do **gap** é identificado; "jovem subestimado" vs "veterano superestimado" são indistinguíveis num desenho pareado. Pós-hoc no par é o único caminho validado. |

---

## Validação

**O teste que decide não é unitário.** É o Brier fora da amostra, refeito no pipeline com corte temporal (treino ≤2023, teste 2024-26, só tour). **Se o ganho na ATP não replicar ~+0,00150 com IC acima de zero, a correção não entra.**

Testes unitários (`node:test`, pt-BR, caso nulo obrigatório):

- **Antissimetria:** `p(A,B) + p(B,A) = 1` — o teste que pega o intercepto acidental
- **Gap zero não mexe em nada:** `ageAdjusted(p, 0, 'ATP') === p`
- **O sinal está certo:** o mais novo ganha probabilidade, não perde
- **WTA não é ajustada:** `ageAdjusted(p, 10, 'WTA') === p`
- **Idade ausente → sem ajuste**, e o card não mostra a linha
- **Caso nulo:** `ageAdjusted(null, ...)` não estoura
- **Limites:** a probabilidade corrigida fica em (0, 1) — nunca 0%, nunca 100%

---

## O que fica em aberto (registrado, não resolvido)

1. **A idade pode ser proxy de tendência, não a causa final.** A história causal mais plausível não é "o Elo odeia jovem": é que ele não acompanha **tendência sustentada de anos**, e a idade é um proxy forte da direção dela. Não dá para separar com este dataset (não tem série de ranking). **Decisão de 2026-07-17: corrigir por idade agora** — está validado fora da amostra, e a chance de "tendência" explicar melhor é baixa (o momento de carreira de 12 meses já foi medido como não-preditivo). Se um dia alguém medir tendência de vários anos e ela explicar melhor, troca-se o termo — é uma linha. **Sem contradição com o obituário do item 2:** o Elo pode reagir rápido demais a ruído recente **e** não capturar uma tendência de anos.
2. **De quem é a culpa, não sabemos.** Só o efeito do **gap** é identificado. O teste de nível (gap fixo, mexendo a idade do par) mostra o viés ~plano: um par 30×40 sofre o mesmo que um 19×29. **É o gap que manda, não "ser jovem".** Favorece "o Elo não desconta o envelhecimento do veterano", mas não prova.
3. **Um corte temporal, não walk-forward rolante.** Os coeficientes são estáveis entre treino e amostra toda, mas a estabilidade de γ ano a ano não foi testada.
4. **1,5% dos elegíveis caem por falta de `dob` confiável** — desproporcionalmente jogadores de baixo volume/ranking, exatamente onde o Elo é pior. Não dá para medir o viés nesse estrato.
5. **Tudo é condicional ao motor como ele está hoje.** São coeficientes do **erro deste modelo**, não constantes da natureza. Se o K, o prior de entrada (1500) ou a fórmula mudarem, a medida precisa ser refeita. **O comentário no código precisa dizer isso.**
6. **Nada aqui foi testado contra odds da Betfair.** Tudo medido é "o modelo do projeto erra em tal direção". O mercado provavelmente já precifica idade — é informação pública.
