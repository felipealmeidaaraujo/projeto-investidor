# Guarda-corpo contra Coeficientes Obsoletos — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um teste que falha se o comportamento do motor Elo mudar sem `AGE_COEF`/`DECAY_COEF` serem refeitos — bloqueando, no cron, a publicação de coeficientes obsoletos.

**Architecture:** Uma função pura `engineFingerprint()` (em `pipeline/`) resume o comportamento do motor num hash determinístico; cada curva grava o fingerprint contra o qual foi medida (`ENGINE_FP_MEDIDO`); um teste compara os dois e falha com mensagem acionável.

**Tech Stack:** JavaScript ESM puro, `node --test`. Sem dependências novas (hash próprio, FNV-1a).

## Global Constraints

- **O fingerprint amostra o COMPORTAMENTO** (aplica as funções do motor a entradas fixas), não o código-fonte — imune a mudança cosmética.
- **Params incluídos:** `kFactor` (elo.js), `expectedScore` + `blendSurface` (model-math.js), `updateRating` (elo.js), `INITIAL` (elo-engine.js). **Excluído:** `calibrationT` (refitado a cada treino).
- **Determinístico e estável:** `toFixed(10)` nas amostras (evita divergência de float); hash sem dependência externa.
- **`ENGINE_FP_MEDIDO` gravado em CADA curva** (age-curve.js e decay-curve.js), não central — se refizerem só uma medição, o teste ainda pega a outra.
- **A mensagem de falha traz o hash atual** para a atualização ser copiar/colar.
- Repo pt-BR (identificadores/comentários).
- **Comando de teste:** um arquivo → `node --test tests/engine-fingerprint.test.js`; suíte toda → `npm test`.

---

## Arquivos tocados

- `pipeline/elo-engine.js` — Task 1 (exportar `INITIAL`)
- `pipeline/engine-fingerprint.js` — Task 1 (novo: `engineFingerprint`, `hashStr`)
- `tests/engine-fingerprint.test.js` — Tasks 1 e 2 (novo)
- `web/src/age-curve.js` / `web/src/decay-curve.js` — Task 2 (`ENGINE_FP_MEDIDO` + comentário)

---

### Task 1: `engineFingerprint()` + exportar `INITIAL`

**Files:**
- Modify: `pipeline/elo-engine.js:5` (exportar `INITIAL`)
- Create: `pipeline/engine-fingerprint.js`
- Test: `tests/engine-fingerprint.test.js`

**Interfaces:**
- Consumes: `kFactor`, `updateRating` de `pipeline/elo.js`; `expectedScore`, `blendSurface` de `web/src/model-math.js`; `INITIAL` de `pipeline/elo-engine.js`.
- Produces: `engineFingerprint(): string` (hex de 8 chars) e `hashStr(s): string`.

- [ ] **Step 1: Exportar `INITIAL`**

Em `pipeline/elo-engine.js:5`, trocar:
```js
const INITIAL = 1500;
```
por:
```js
export const INITIAL = 1500;
```

- [ ] **Step 2: Escrever os testes que falham**

Criar `tests/engine-fingerprint.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineFingerprint, hashStr } from '../pipeline/engine-fingerprint.js';

test('hashStr: determinístico — mesma entrada, mesmo hash', () => {
  assert.equal(hashStr('teste'), hashStr('teste'));
});
test('hashStr: sensível — entradas diferentes dão hashes diferentes', () => {
  assert.notEqual(hashStr('a'), hashStr('b'));
  assert.notEqual(hashStr('1.5000000000|2.5000000000'), hashStr('1.5000000000|2.6000000000'));
});
test('hashStr: hex de 8 caracteres', () => {
  assert.match(hashStr('qualquer'), /^[0-9a-f]{8}$/);
});
test('engineFingerprint: determinístico (duas chamadas iguais)', () => {
  assert.equal(engineFingerprint(), engineFingerprint());
});
test('engineFingerprint: hex de 8 caracteres não-vazio', () => {
  assert.match(engineFingerprint(), /^[0-9a-f]{8}$/);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test tests/engine-fingerprint.test.js`
Expected: FAIL — `pipeline/engine-fingerprint.js` não existe (import quebra).

- [ ] **Step 4: Implementar o módulo**

Criar `pipeline/engine-fingerprint.js`:
```js
// Fingerprint COMPORTAMENTAL do motor Elo — resume os params contra os quais AGE_COEF e
// DECAY_COEF foram medidos. Se o motor mudar (kFactor / prior 1500 / expectedScore /
// blendSurface), o hash muda e tests/engine-fingerprint.test.js falha, forçando refazer as
// medições (specs de idade e de decay). NÃO inclui o calibrationT (refitado a cada treino
// de propósito). Amostra o COMPORTAMENTO, não o código — imune a mudança cosmética.
//
// Ressalva: o surfaceWeight aparece em elo-engine.js (construtor) e num 0.5 hardcoded em
// web/src/analysis.js; este fingerprint captura o DEFAULT de blendSurface. Uma mudança só no
// 0.5 de analysis.js (mantendo o default) não seria pega — mas já seria uma inconsistência
// interna hoje, fora do escopo deste guarda-corpo.
import { kFactor, updateRating } from './elo.js';
import { expectedScore, blendSurface } from '../web/src/model-math.js';
import { INITIAL } from './elo-engine.js';

/** Hash determinístico simples (FNV-1a 32 bits → hex de 8 chars). Só para igualdade, não segurança. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Resume o comportamento do motor Elo aplicando os params a entradas fixas. */
export function engineFingerprint() {
  const amostras = [
    kFactor(0), kFactor(5), kFactor(20), kFactor(100), kFactor(500),
    expectedScore(1500, 1500), expectedScore(1600, 1500), expectedScore(2000, 1800), expectedScore(1500, 2000),
    blendSurface(1800, 1900), // sem 3º arg: captura o surfaceWeight default (0,5)
    updateRating(1500, 1, 0.5, 32),
    INITIAL,
  ];
  return hashStr(amostras.map((x) => x.toFixed(10)).join('|'));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/engine-fingerprint.test.js`
Expected: PASS — os 5 testes passam.

- [ ] **Step 6: Registrar o hash atual (para a Task 2)**

Run:
```bash
node --input-type=module -e "import('./pipeline/engine-fingerprint.js').then(m => console.log('ENGINE_FP atual:', m.engineFingerprint()))"
```
Anote o valor impresso — a Task 2 grava-o em `ENGINE_FP_MEDIDO`.

- [ ] **Step 7: Suíte inteira**

Run: `npm test`
Expected: PASS (nada regrediu; módulo novo).

- [ ] **Step 8: Commit**

```bash
git add pipeline/elo-engine.js pipeline/engine-fingerprint.js tests/engine-fingerprint.test.js
git commit -m "feat(motor): engineFingerprint — resumo comportamental determinístico do Elo"
```

---

### Task 2: gravar `ENGINE_FP_MEDIDO` nas curvas + o guarda-corpo

**Files:**
- Modify: `web/src/age-curve.js` (novo export + comentário), `web/src/decay-curve.js` (novo export + comentário)
- Test: `tests/engine-fingerprint.test.js` (adicionar os 2 testes do guarda-corpo)

**Interfaces:**
- Consumes: `engineFingerprint()` (Task 1); o valor de hash anotado no Step 6 da Task 1.
- Produces: `ENGINE_FP_MEDIDO` (string) exportado de `age-curve.js` e `decay-curve.js`.

> **Nota:** `<HASH>` abaixo é o valor impresso no Step 6 da Task 1. Use o valor real, idêntico nas duas curvas (mesmo motor).

- [ ] **Step 1: Escrever os testes que falham (o guarda-corpo)**

Adicionar ao fim de `tests/engine-fingerprint.test.js`:
```js
import { ENGINE_FP_MEDIDO as FP_IDADE } from '../web/src/age-curve.js';
import { ENGINE_FP_MEDIDO as FP_DECAY } from '../web/src/decay-curve.js';

const fpAtual = engineFingerprint();
const msg = (curva, coef, spec) =>
  `O motor Elo mudou. O ${coef} em web/src/${curva} foi calibrado contra o motor ANTIGO e ` +
  `provavelmente está obsoleto. REFAÇA a medição (docs/superpowers/specs/${spec}) e atualize ` +
  `ENGINE_FP_MEDIDO para '${fpAtual}'.`;

test('guarda-corpo: AGE_COEF foi medido contra o motor Elo atual', () => {
  assert.equal(FP_IDADE, fpAtual, msg('age-curve.js', 'AGE_COEF', '2026-07-17-vies-idade-elo-design.md'));
});
test('guarda-corpo: DECAY_COEF foi medido contra o motor Elo atual', () => {
  assert.equal(FP_DECAY, fpAtual, msg('decay-curve.js', 'DECAY_COEF', '2026-07-18-decay-inatividade-design.md'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/engine-fingerprint.test.js`
Expected: FAIL — `ENGINE_FP_MEDIDO` não existe em nenhuma curva (import é `undefined` → `undefined !== fpAtual`).

- [ ] **Step 3: Gravar `ENGINE_FP_MEDIDO` em `age-curve.js`**

Em `web/src/age-curve.js`, logo após a definição de `AGE_COEF` (linha ~29), adicionar:
```js
/** Fingerprint do motor Elo contra o qual o AGE_COEF acima foi medido. O guarda-corpo em
 *  tests/engine-fingerprint.test.js falha se o motor mudar sem esta constante ser atualizada
 *  (o que só deve acontecer DEPOIS de refazer a medição da spec 2026-07-17-vies-idade-elo). */
export const ENGINE_FP_MEDIDO = '<HASH>';
```

- [ ] **Step 4: Gravar `ENGINE_FP_MEDIDO` em `decay-curve.js`**

Em `web/src/decay-curve.js`, logo após a definição de `DECAY_COEF` (perto do topo), adicionar:
```js
/** Fingerprint do motor Elo contra o qual o DECAY_COEF acima foi medido. O guarda-corpo em
 *  tests/engine-fingerprint.test.js falha se o motor mudar sem esta constante ser atualizada
 *  (o que só deve acontecer DEPOIS de refazer a medição da spec 2026-07-18-decay-inatividade). */
export const ENGINE_FP_MEDIDO = '<HASH>';
```

- [ ] **Step 5: Atualizar os comentários de aviso das curvas**

Em `web/src/age-curve.js`, o bloco que hoje diz "ATENÇÃO: estes coeficientes são o ERRO DESTE MODELO... a medida precisa ser REFEITA" — acrescentar uma frase apontando o guarda-corpo:
```
// O teste tests/engine-fingerprint.test.js FALHA automaticamente se o motor mudar sem esta
// medição ser refeita — não depende mais de boa-fé.
```
Fazer o mesmo no comentário equivalente de `web/src/decay-curve.js`.

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test tests/engine-fingerprint.test.js`
Expected: PASS — os 2 testes do guarda-corpo passam (o `<HASH>` gravado == `engineFingerprint()` atual).

- [ ] **Step 7: Verificar que o guarda-corpo REALMENTE protege (sanidade)**

Confirme que o teste falharia se o motor mudasse: mude temporariamente `250` para `260` em `pipeline/elo.js:7`, rode `node --test tests/engine-fingerprint.test.js`, e confirme que os 2 testes do guarda-corpo FALHAM com a mensagem acionável (mostrando o novo hash). **Depois REVERTA a mudança** (`git checkout pipeline/elo.js`) e rode de novo para confirmar que volta a passar.

- [ ] **Step 8: Suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/age-curve.js web/src/decay-curve.js tests/engine-fingerprint.test.js
git commit -m "feat(guarda-corpo): as curvas gravam o fingerprint do motor; o teste falha se ele mudar"
```

---

## Self-Review (preenchido)

**1. Cobertura da spec:**
- `engineFingerprint()` comportamental (kFactor/expectedScore/blend/updateRating/INITIAL, sem calibrationT) → Task 1. ✓
- Exportar `INITIAL` → Task 1 Step 1. ✓
- `ENGINE_FP_MEDIDO` em cada curva → Task 2. ✓
- Teste do guarda-corpo com mensagem acionável (hash atual embutido) → Task 2. ✓
- Comentários atualizados → Task 2 Step 5. ✓
- Determinismo + sensibilidade do hash testados → Task 1 Step 2. ✓
- Prova de que protege (mudar 250→260 falha) → Task 2 Step 7. ✓

**2. Placeholders:** `<HASH>` é intencional (o valor real vem do Step 6 da Task 1, anotado e colado). Todo o resto é concreto.

**3. Consistência de tipos/nomes:** `engineFingerprint()`/`hashStr()` idênticos entre def (Task 1) e uso (Task 1 testes, Task 2 guarda-corpo). `ENGINE_FP_MEDIDO` idêntico entre as duas curvas (Task 2) e os imports do teste. `INITIAL` exportado (Task 1) e consumido por `engine-fingerprint.js` (Task 1).

## Riscos

- **`<HASH>` errado/divergente entre as curvas** → o teste do guarda-corpo falha na hora (Task 2 Step 6), pegando o erro imediatamente. Use o valor exato do Step 6 da Task 1 nas duas.
- **Float não-determinístico entre ambientes** → mitigado por `toFixed(10)`; o teste de determinismo cobre a estabilidade dentro de uma execução. (FNV-1a e `toFixed` são padrão, estáveis entre Node no dev e no cron.)
- **Suíte:** 326 → ~333 (+5 na Task 1, +2 na Task 2).
