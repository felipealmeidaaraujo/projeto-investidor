# Guarda-corpo contra coeficientes obsoletos (fingerprint do motor Elo) — Especificação

> **Data:** 2026-07-18
> **Status:** Escopo aprovado pelo Felipe (brainstorming). Próximo passo: plano de implementação (writing-plans).
> **Relacionado:** [2026-07-17-vies-idade-elo-design.md](2026-07-17-vies-idade-elo-design.md) (AGE_COEF) e [2026-07-18-decay-inatividade-design.md](2026-07-18-decay-inatividade-design.md) (DECAY_COEF) — os dois coeficientes que este guarda-corpo protege.

---

## Resumo em português claro

Os coeficientes `AGE_COEF = 0,026` e `DECAY_COEF = 0,50` **não são constantes da natureza** — são o *erro deste Elo específico*. Foram medidos contra um motor com um K-factor, um prior de entrada (1500) e uma fórmula determinados. O cron **retreina o modelo todo dia**; se um dia alguém mudar o K, o prior ou a fórmula do Elo (ajustando `pipeline/elo.js`, `model-math.js` ou `elo-engine.js`), os coeficientes ficam **obsoletos** — mas continuam sendo aplicados na tela, silenciosamente errados. Hoje a única proteção é um comentário de aviso em cada curva, que depende de boa-fé e memória.

**A correção:** um teste que **falha automaticamente** se o comportamento do motor Elo mudar sem os coeficientes serem refeitos. O risco silencioso vira um erro barulhento no `npm test` — que roda no cron **antes** do commit/deploy, então bloqueia a publicação de um modelo com coeficientes desalinhados.

---

## O que invalida os coeficientes

Os coeficientes corrigem um viés do estimador Elo; o viés depende de **como** o Elo trata idade/inatividade, que por sua vez depende dos params do motor:

| param | onde vive | por que importa |
|---|---|---|
| `kFactor = 250/(m+5)^0.4` | [pipeline/elo.js:6](../../../pipeline/elo.js) | Quão rápido o Elo reage. A spec da idade mediu o viés **2,5× maior onde o K é alto** — é o param mais crítico. |
| `INITIAL = 1500` | [pipeline/elo-engine.js:5](../../../pipeline/elo-engine.js) | O prior de entrada — afeta onde novatos entram. |
| `expectedScore` (base 10, escala 400) | [web/src/model-math.js:5](../../../web/src/model-math.js) | A curva logística Elo→probabilidade. |
| `blendSurface` (`surfaceWeight` 0,5) | [web/src/model-math.js:10](../../../web/src/model-math.js) | O peso geral × superfície. |
| `updateRating` (linear) | [pipeline/elo.js:11](../../../pipeline/elo.js) | A regra de atualização. |

**NÃO entra:** o `calibrationT` (temperatura). Ele é **refitado a cada treino de propósito** (auto-ajustável), e os coeficientes operam sobre a probabilidade já calibrada — são robustos a pequenas variações de T por construção. Incluí-lo faria o teste falhar todo dia.

---

## O design

### 1. `engineFingerprint()` — resumo comportamental do motor

Função pura que aplica os params do motor a **entradas fixas** e resume os resultados num hash curto (hex). Determinística (mesmo motor → sempre o mesmo hash), imune a mudança cosmética (comentário, espaço, refactor sem efeito) — só muda quando o **comportamento** muda.

```
amostras = [
  kFactor(0), kFactor(5), kFactor(20), kFactor(100), kFactor(500),
  expectedScore(1500,1500), expectedScore(1600,1500), expectedScore(2000,1800), expectedScore(1500,2000),
  blendSurface(1800, 1900),               // captura o surfaceWeight default (0,5)
  updateRating(1500, 1, 0.5, 32),
  INITIAL,
]
engineFingerprint = hash(amostras.map(x => x.toFixed(10)).join('|'))
```

O hash é uma função determinística simples (ex.: FNV-1a/djb2 → hex de 8 caracteres). O objetivo é comparar igualdade, não segurança — qualquer hash estável e sem dependência externa serve.

### 2. O fingerprint esperado, gravado em cada curva

Cada curva exporta o fingerprint do motor **contra o qual seu coeficiente foi medido**:
- `web/src/age-curve.js`: `export const ENGINE_FP_MEDIDO = '<hash>';`
- `web/src/decay-curve.js`: `export const ENGINE_FP_MEDIDO = '<hash>';`

Gravar em **cada** curva (não num lugar central) é deliberado: força atualizar explicitamente ao refazer cada medição. Se alguém mudar o motor e refizer só a idade (atualizando o FP de `age-curve.js`), o teste **ainda falha** para o decay — cobrindo o esquecimento. Hoje os dois valores são idênticos (mesmo motor); o teste valida ambos.

### 3. O teste — `tests/engine-fingerprint.test.js`

Compara `engineFingerprint()` (o motor atual) com o `ENGINE_FP_MEDIDO` de cada curva. Se divergir, falha com mensagem **acionável**:

```
O motor Elo mudou (kFactor / prior 1500 / expectedScore / blendSurface).
O <AGE_COEF|DECAY_COEF> em web/src/<curva>.js foi calibrado contra o motor ANTIGO
e provavelmente está obsoleto. REFAÇA a medição (ver docs/superpowers/specs/<spec>.md)
e atualize ENGINE_FP_MEDIDO para <hash-atual>.
```

A mensagem já traz o hash atual, para que — depois de refeita a medição — a atualização seja copiar/colar.

### 4. Comentários das curvas atualizados

O bloco "ATENÇÃO: se o K, o prior ou a fórmula mudarem, a medida precisa ser REFEITA" em cada curva passa a apontar para o guarda-corpo: *"O teste `engine-fingerprint.test.js` falha automaticamente se isso acontecer."* Deixa de ser um pedido de boa-fé.

---

## Arquitetura

| peça | papel |
|---|---|
| `pipeline/engine-fingerprint.js` | **novo, puro**: `engineFingerprint()` — importa os params de `elo.js`, `model-math.js`, `elo-engine.js`. Fica no pipeline (onde o motor vive). |
| `pipeline/elo-engine.js` | exporta `INITIAL` (hoje é `const` não exportada) para o fingerprint acessá-lo. |
| `web/src/age-curve.js` / `web/src/decay-curve.js` | ganham `export const ENGINE_FP_MEDIDO` (só o valor hex — **não** importam o pipeline, para o app não arrastar o motor). |
| `tests/engine-fingerprint.test.js` | **novo**: compara `engineFingerprint()` com cada `ENGINE_FP_MEDIDO`; testa também que o fingerprint é **determinístico** (duas chamadas dão o mesmo valor) e que a função de hash é **sensível** (strings de entrada diferentes → hashes diferentes, garantindo que o fingerprint não é degenerado). |

---

## Fora de escopo (YAGNI)

- **Estampar o fingerprint no `model.json`** — o teste já é o guarda-corpo que bloqueia o deploy; o JSON só documentaria, ao custo de mexer no `train.js` e no arquivo que o celular baixa. Fácil de somar depois se a rastreabilidade em produção virar necessidade.
- **Detectar mudança no `calibrationT`** — auto-ajustável de propósito; incluí-lo quebraria o teste todo dia.
- **Auto-refazer a medição** — continua manual; o teste só sinaliza que é hora.
- **Fingerprintar as constantes das próprias curvas** (MIN_GAP_YEARS, a rampa do decay) — essas são das correções, não do motor; mudá-las é uma decisão consciente de quem mexe na curva.

---

## Riscos e observações

- **O `surfaceWeight` aparece em dois lugares** (`elo-engine.js` construtor e o `0.5` que `analysis.js` passa a `blendSurface`). O fingerprint captura o **default de `blendSurface`** (via `blendSurface(1800,1900)` sem 3º arg). Uma mudança só no default de `blendSurface` é pega; uma mudança apenas no `0.5` hardcoded de `analysis.js` (mantendo o default) não seria — mas isso seria uma inconsistência interna já hoje, fora do escopo deste guarda-corpo. Documentar a ressalva no comentário do fingerprint.
- **O fingerprint precisa ser estável entre Node e o ambiente do cron** — por isso `toFixed(10)` (evita divergência de representação de float) e um hash sem dependências. Determinismo é testado.
- **Primeiro valor de `ENGINE_FP_MEDIDO`:** calculado na implementação rodando `engineFingerprint()` contra o motor atual (o mesmo contra o qual os coeficientes vigentes foram medidos) e gravado como a linha-base.
