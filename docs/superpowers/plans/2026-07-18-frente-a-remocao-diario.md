# Frente A — Remoção do diário — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover as telas de diário (Banca, Registrar, Histórico), o login/Supabase e tudo que só existe por causa deles, deixando o app como plataforma de análise pura (Análise + Jogadores) que abre sem conta.

**Architecture:** PWA vanilla JS, sem build. Um monólito `web/app.js` renderiza as telas; `web/index.html` define nav + seções; módulos em `web/src/`. Análise e Jogadores só leem JSON estático (não usam `store`/Supabase), então a remoção é uma poda cirúrgica: primeiro reduz `app.js`/`index.html` às duas telas e boota direto; depois apaga os módulos/testes órfãos; por fim limpa o gerador `pipeline/closings.js` e o step do cron.

**Tech Stack:** JavaScript ES modules (browser), Node.js `--test` (testes), GitHub Actions (cron `update-model.yml`), service worker.

**Spec:** [docs/superpowers/specs/2026-07-18-frente-a-remocao-diario-design.md](../specs/2026-07-18-frente-a-remocao-diario-design.md)

**Convenção do repo:** trunk-based, commits direto no `main` (o próprio cron commita no `main`). Felipe autoriza deploy sem perguntar.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade depois |
|---|---|---|
| `web/index.html` | Modificar | Nav com 2 abas (Análise, Jogadores), 2 seções de tela, sem `#auth-root` |
| `web/app.js` | Modificar | Só Análise + Jogadores; boota direto, sem login/store |
| `web/sw.js` | Modificar | Cache `investidor-v3` (shell novo) |
| `web/src/store.js` | **Deletar** | — |
| `web/src/supabase.js` | **Deletar** | — |
| `web/src/supabase-config.js` | **Deletar** (tracked) | — |
| `web/src/merge.js` | **Deletar** | — |
| `web/src/stats.js` | **Deletar** | — |
| `web/src/trade.js` | **Deletar** | — |
| `web/src/finance.js` | **Deletar** | — |
| `web/src/closings.js` | **Deletar** | — |
| `web/closings.json` | **Deletar** (tracked) | — |
| `tests/closings.test.js` | **Deletar** | — |
| `tests/finance.test.js` | **Deletar** | — |
| `tests/merge.test.js` | **Deletar** | — |
| `tests/stats.test.js` | **Deletar** | — |
| `tests/stoploss.test.js` | **Deletar** | — |
| `tests/tilt.test.js` | **Deletar** | — |
| `tests/trade.test.js` | **Deletar** | — |
| `pipeline/closings.js` | **Deletar** | — |
| `.github/workflows/update-model.yml` | Modificar | Sem step de fechamentos; sem `web/closings.json` no `git add` |

**Preservados (NÃO tocar):** `web/src/{analysis,inplay,tactics,scouting,career,age-curve,decay-curve,patterns-view,player-search,match-names,model-math,format}.js` e todos os JSON de modelo/grade (`model-atp.json`, `model-wta.json`, `today.json`, `matches.json`). `match-names.js` fica porque `player-search.js` usa `normName`.

---

## Task 1: Reduzir `app.js` + `index.html` às duas telas e bootar sem login

**Files:**
- Modify: `web/app.js`
- Modify: `web/index.html`
- Modify: `web/sw.js`

- [ ] **Step 1: Confirmar baseline verde e anotar tamanho atual**

Run: `npm test 2>&1 | tail -3 && wc -l web/app.js`
Expected: `fail 0` e algo como `1705 web/app.js`.

- [ ] **Step 2: Trocar o bloco de imports do `app.js`**

Substituir TODO o bloco de imports (linhas 1–17) por exatamente:

```js
import { analyzeMatch, playerTags, buildReadingExplanation, serveBand } from './src/analysis.js';
import { styleLines, pressureLines, bioText } from './src/patterns-view.js';
import { tacticalSuggestion } from './src/tactics.js';
import { searchPlayers } from './src/player-search.js';
import { liveFairOdds, overreaction } from './src/inplay.js';
import { recentForm, restDays, headToHead } from './src/scouting.js';
import { formatBRL, formatSignedPct, formatPctFrac } from './src/format.js';
import { careerText } from './src/career.js';
import { ageAdjustText, ageSuppressedText } from './src/age-curve.js';
import { decayAdjustText } from './src/decay-curve.js';
```

(Saíram: `store`, `supabase`/`auth`, `stats`, `trade`, `finance`, `closings`, `matchPlayer` de `match-names`. Trimados: `inplay` mantém só `liveFairOdds`/`overreaction`; `format` perde `formatSignedBRL`.)

- [ ] **Step 3: Ajustar navegação e boot no topo**

Trocar `let currentScreen = 'banca';` por:

```js
let currentScreen = 'analise';
```

Trocar a função `renderScreen` inteira por:

```js
function renderScreen(target) {
  if (target === 'analise') renderAnalise();
  else if (target === 'jogadores') renderJogadores();
}
```

Deletar a função `nowLocalISO` (só o `saveTrade` a usava). **Manter** `todayLocal` (scouting/descanso usam) e `clampOdd` (teclado de odd usa).

- [ ] **Step 4: Deletar o bloco da Banca — mas preservar `ring()`**

Deletar estes símbolos (seção `/* ===== Tela: Banca ===== */`): `bancaEl`, `draft`, `STOP_OPTS`, `MAXSTAKE_OPTS`, `KELLY_OPTS`, `defaultDraft`, `renderBanca`, `renderConfigForm`, `renderDashboard`, `openCalculator`.

Dos "Mini-gráficos": deletar `pctOf`, `areaSpark`, `lineSpark`, `donutCard`. **MANTER `ring()`** — a leitura do confronto e o ao vivo usam.

- [ ] **Step 5: Deletar o bloco da Registrar**

Deletar (seção `/* ===== Tela: Registrar ===== */`): `regEl`, `reg`, `MARKET_OPTS`, `SURFACE_OPTS`, `RESULT_OPTS`, `EMOTION_OPTS`, `defaultReg`, `ensureModel`, `oddStepper`, `regValid`, `_probLoadingKey`, `probKeyFor`, `findModelPlayer`, `ensurePreProb`, `renderRegistrar`, `saveTrade`.

(Não confundir: `SURFACE_PT` e `SURF_OPTS` ficam — são da Análise, definidos na seção da Análise.)

- [ ] **Step 6: Deletar o bloco do Histórico + revisão**

Deletar (seção `/* ===== Tela: Histórico ===== */`): `histEl`, `expandedId`, `REVIEW_RED_OPTS`, `EMO`, `resultBadge`, `segCard`, `clvSegCard`, `renderHistorico`, `openReview`.

- [ ] **Step 7: Deletar Auth + simplificar o boot (preservando Jogadores)**

Na seção `/* ===== Auth + Boot ===== */`, deletar: `authRoot` (const), `booted` (let), `traduzErroAuth`, `renderAuth`, `syncClosings`.
**Preservar** tudo de Jogadores que está interleaved nessa seção: `jogadoresEl`, `jog`, `jogObserver`, `observeJogPhotos`, `jogListHTML`, `renderJogadores`.

Trocar a função `bootApp` inteira por:

```js
function bootApp() {
  renderScreen(currentScreen);
}
```

Trocar o bloco final `auth.onAuthChange((session) => { ... });` por:

```js
bootApp();
```

**Manter** o listener de tema (`#theme-toggle`) e o registro do service worker (`navigator.serviceWorker.register('sw.js')`).

- [ ] **Step 8: Remover o botão-ponte "Registrar trade neste confronto"**

Em `renderReading`, remover a linha do botão:

```js
    <button class="btn btn-primary" id="btn-reg-conf" style="margin-top:12px">📝 Registrar trade neste confronto</button>
```

Em `renderAnalise`, remover o handler inteiro `analiseEl.querySelector('#btn-reg-conf')?.addEventListener('click', () => { ... });` (o bloco que montava `reg` e chamava `showScreen('registrar')`).

- [ ] **Step 9: Reescrever a navegação e as seções do `index.html`**

Trocar o `<nav class="side-nav">…</nav>` (sidebar) por exatamente:

```html
      <nav class="side-nav">
        <button class="tab active" data-target="analise" aria-current="page">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19V5m0 14h16M8 15l3-4 3 3 4-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Análise</span>
        </button>
        <button class="tab" data-target="jogadores">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M5 19c0-3.6 3-5.6 7-5.6s7 2 7 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Jogadores</span>
        </button>
      </nav>
```

Trocar as 5 `<section class="screen" …>` por exatamente:

```html
        <section class="screen active" id="screen-analise" aria-label="Análise"></section>
        <section class="screen" id="screen-jogadores" aria-label="Jogadores"></section>
```

Trocar a `<nav class="tabbar">…</nav>` (rodapé mobile) por exatamente:

```html
  <nav class="tabbar" aria-label="Navegação principal">
    <button class="tab active" data-target="analise" aria-current="page">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19V5m0 14h16M8 15l3-4 3 3 4-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Análise</span>
    </button>
    <button class="tab" data-target="jogadores">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="2"/><path d="M5 19c0-3.6 3-5.6 7-5.6s7 2 7 5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Jogadores</span>
    </button>
  </nav>
```

Remover a linha `<div id="auth-root"></div>` (manter `<div id="modal-root"></div>`).

- [ ] **Step 10: Bump do cache no service worker**

Em `web/sw.js`, trocar `const CACHE = 'investidor-v2';` por:

```js
const CACHE = 'investidor-v3';
```

- [ ] **Step 11: Checar sintaxe do `app.js`**

Run: `node --check web/app.js`
Expected: sem saída (exit 0). Se acusar erro de referência a símbolo, é sobra de código deletado apontando para import removido — corrigir.

- [ ] **Step 12: Verificar no navegador de verdade**

Subir o dev server: `node scripts/serve.mjs` (porta em `scripts/serve.mjs`; use `.claude/launch.json` se existir, senão crie um apontando pra esse comando) e abrir o app no navegador.
Conferir:
- App abre **direto na Análise**, **sem tela de login**.
- Grade "Jogos de hoje" carrega; clicar num jogo mostra a leitura (favorito, odd justa, forças, H2H, "Leitura pro trade").
- Botão "⏱️ Trade ao vivo" abre o painel; mexer placar / quem saca / odd Betfair atualiza a odd justa e o cartão de sobre-reação.
- Aba **Jogadores**: busca + abrir um dossiê (Elo, saque, padrões, forma).
- Console **sem erros**; nenhuma requisição a Supabase; **não** existe mais o botão "Registrar trade neste confronto".

- [ ] **Step 13: Commit**

```bash
git add web/app.js web/index.html web/sw.js
git commit -m "$(cat <<'EOF'
refactor(web): app vira 2 telas (Análise + Jogadores), abre sem login

Remove a navegação e o boot do diário: currentScreen inicia em 'analise',
renderScreen roteia só análise/jogadores, boota direto (sem auth gate),
imports reduzidos aos módulos de análise. Tira o botão-ponte de registrar
trade. SW cache v3 pro shell novo. (Módulos órfãos saem na próxima task.)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Apagar os módulos, o dado e os testes do diário

**Files:**
- Delete: `web/src/{store,supabase,supabase-config,merge,stats,trade,finance,closings}.js`, `web/closings.json`
- Delete: `tests/{closings,finance,merge,stats,stoploss,tilt,trade}.test.js`

- [ ] **Step 1: `git rm` dos módulos e do dado órfãos**

```bash
git rm web/src/store.js web/src/supabase.js web/src/supabase-config.js web/src/merge.js web/src/stats.js web/src/trade.js web/src/finance.js web/src/closings.js web/closings.json
```

- [ ] **Step 2: `git rm` dos testes órfãos**

```bash
git rm tests/closings.test.js tests/finance.test.js tests/merge.test.js tests/stats.test.js tests/stoploss.test.js tests/tilt.test.js tests/trade.test.js
```

- [ ] **Step 3: Confirmar que nada vivo referencia os deletados**

Run: `grep -rnE "store\.js|supabase|makeTrade|clvPct|summarize\(|stopLossStatus|tiltWarning|closingPatches|mergeTrades|stakeKelly|evFraction" web/`
Expected: **nenhuma** linha (saída vazia). Qualquer hit é sobra na `app.js` — voltar e limpar.

- [ ] **Step 4: Rodar os testes**

Run: `npm test 2>&1 | tail -3`
Expected: `fail 0`, com o total de testes menor que o baseline (7 arquivos a menos) e **nenhum** erro de módulo não encontrado.

- [ ] **Step 5: Re-checar sintaxe da `app.js`**

Run: `node --check web/app.js`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(web): remove módulos e testes do diário (órfãos)

Apaga store/supabase/merge/stats/trade/finance/closings + closings.json e
os 7 testes correspondentes. Nada na Análise/Jogadores os importava.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Limpar o gerador `pipeline/closings.js` e o step do cron

**Files:**
- Delete: `pipeline/closings.js`
- Modify: `.github/workflows/update-model.yml`

- [ ] **Step 1: `git rm` do gerador órfão**

```bash
git rm pipeline/closings.js
```

- [ ] **Step 2: Remover o step de fechamentos do cron**

Em `.github/workflows/update-model.yml`, deletar exatamente este step:

```yaml
      - name: Gerar fechamentos (CLV pré-jogo, tennis-data)
        run: node pipeline/closings.js
```

- [ ] **Step 3: Tirar `web/closings.json` do `git add` do cron**

Na mesma etapa de commit do workflow, trocar a linha:

```yaml
          git add web/model-atp.json web/model-wta.json web/today.json web/matches.json web/closings.json
```

por:

```yaml
          git add web/model-atp.json web/model-wta.json web/today.json web/matches.json
```

- [ ] **Step 4: Confirmar que closings sumiu do pipeline/cron**

Run: `grep -rn "closings" pipeline .github`
Expected: **nenhuma** linha (saída vazia).

- [ ] **Step 5: Rodar os testes (garantia final)**

Run: `npm test 2>&1 | tail -3`
Expected: `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
ci(cron): remove geração de closings.json (órfã após tirar o diário)

Deleta pipeline/closings.js e o step do update-model.yml; tira o arquivo
do git add. O robô diário segue verde (npm test) e para de publicar dado
que ninguém consome.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Verificação final (antes de declarar "pronto")

- [ ] `npm test` verde (`fail 0`), com 7 arquivos de teste a menos que o baseline.
- [ ] `grep -rnE "store|supabase|closings|finance|makeTrade|summarize" web/` → sem referências vivas.
- [ ] `grep -rn "closings" pipeline .github` → vazio.
- [ ] App carregado no navegador: abre na Análise sem login; grade → leitura → trade ao vivo (odd justa + sobre-reação) funcionam; Jogadores → dossiê funciona; console limpo. **Screenshot como prova.**
- [ ] Publicar/deploy conforme a convenção do repo (push no `main` → o Pages/cron publica). Confirmar com o Felipe se quer que eu dê o push.

## Notas
- `.env` é gitignored e não é tocado.
- Nada é apagado no Supabase remoto (tabelas `trades`/`config` ficam ociosas). Pausar o projeto é decisão do Felipe, depois.
- Dividir `app.js` em arquivos por tela fica como melhoria futura — fora desta frente.
