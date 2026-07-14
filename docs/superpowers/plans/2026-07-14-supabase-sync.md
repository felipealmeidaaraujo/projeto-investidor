# Sincronização com Supabase — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar o diário (banca + trades) na nuvem (Supabase), atrás de login e-mail/senha, sincronizando automático entre PC e celular, sem perder os dados atuais.

**Architecture:** Supabase (Postgres + Auth) como fonte da verdade; `localStorage` vira cache local (leitura offline). Leituras do app continuam síncronas (do cache); escritas são "nuvem primeiro" (envia → no sucesso atualiza o cache). Cliente `supabase-js` via import ESM (sem build).

**Tech Stack:** PWA sem build (HTML/CSS/JS ES modules), `@supabase/supabase-js@2` via esm.sh, Supabase (org Athenia, região São Paulo), Node test runner (`npm test`).

**Online-only:** sem camada de escrita offline. Sem internet = leitura do cache, escrita bloqueada com aviso.

---

## Estrutura de arquivos

- **Novo** `web/src/supabase-config.js` — `SUPABASE_URL` + `SUPABASE_ANON_KEY` (preenchidos na Task 1).
- **Novo** `web/src/supabase.js` — cliente + helpers de auth e de dados.
- **Novo** `web/src/merge.js` — puro/testável: `mergeTrades`, `shouldMigrate`.
- **Modificar** `web/src/store.js` — cache + orquestração de sync (init assíncrono; escritas assíncronas).
- **Modificar** `web/app.js` — portão de auth, boot assíncrono, botão sair, handlers de escrita `async`.
- **Modificar** `web/index.html` — `#auth-root` + estilos da tela de login (via styles.css).
- **Modificar** `web/styles.css` — tela de auth.
- **Test** `tests/merge.test.js`.

---

## Task 1: Provisionar Supabase (projeto + schema + RLS)

Feito via ferramentas MCP do Supabase (não é código do app). Org: `silykubavtcvqnqheoga` (Athenia).

- [ ] **Step 1: Criar o projeto** (custo R$0/mês, já confirmado)

Usar `create_project`: name `projeto-investidor`, organization_id `silykubavtcvqnqheoga`, region `sa-east-1`.
Guardar o `id`/`ref` retornado. Aguardar status `ACTIVE_HEALTHY` (checar com `get_project` até ficar pronto; pode levar ~1-2 min).

- [ ] **Step 2: Criar tabelas + RLS** (via `apply_migration`, name `init_diario`)

```sql
create extension if not exists "pgcrypto";

create table public.trades (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index trades_user_idx on public.trades(user_id);

create table public.config (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.trades enable row level security;
alter table public.config enable row level security;

create policy "own trades" on public.trades
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own config" on public.config
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 3: Pegar URL + chave pública**

Usar `get_publishable_keys` (ou `get_project_url` + a anon/publishable key). Anotar `SUPABASE_URL` (`https://<ref>.supabase.co`) e `SUPABASE_ANON_KEY`.

- [ ] **Step 4: Checar segurança**

Usar `get_advisors` (type `security`). Esperado: **sem** avisos de tabela sem RLS. Se aparecer algo, corrigir antes de seguir.

- [ ] **Step 4b: Desligar confirmação de e-mail (recomendado)**

Pra o fluxo "criar conta → entrar na hora" funcionar sem depender de e-mail: no painel do Supabase → Authentication → Sign In / Providers → **Email** → desligar **"Confirm email"**. (Passo manual de painel; o MCP não expõe essa config.)
Se **não** desligar, o app ainda funciona — o `signUp` retorna sem sessão e a tela mostra "Confirme o e-mail e depois entre" (tratado na Task 5). É só uma questão de conveniência.

- [ ] **Step 5: Gravar a config no app**

Criar `web/src/supabase-config.js`:

```js
// Chave pública (anon) — feita para ser pública; o RLS é quem protege os dados.
export const SUPABASE_URL = 'PREENCHER_COM_URL_DA_TASK1';
export const SUPABASE_ANON_KEY = 'PREENCHER_COM_ANON_KEY_DA_TASK1';
```

(Substituir os dois valores pelos reais da Task 1 antes de commitar.)

- [ ] **Step 6: Commit**

```bash
git add web/src/supabase-config.js
git commit -m "Supabase: config do projeto (URL + chave publica)"
```

---

## Task 2: Lógica pura de merge e migração

**Files:**
- Create: `web/src/merge.js`
- Test: `tests/merge.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Criar `tests/merge.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrades, shouldMigrate } from '../web/src/merge.js';

test('mergeTrades: une por id, o "incoming" vence em conflito', () => {
  const base = [{ id: 'a', pl: 1 }, { id: 'b', pl: 2 }];
  const incoming = [{ id: 'b', pl: 20 }, { id: 'c', pl: 3 }];
  const out = mergeTrades(base, incoming);
  const byId = Object.fromEntries(out.map((t) => [t.id, t.pl]));
  assert.deepEqual(byId, { a: 1, b: 20, c: 3 });
  assert.equal(out.length, 3);
});

test('mergeTrades: sem duplicar ids', () => {
  const out = mergeTrades([{ id: 'x' }], [{ id: 'x' }]);
  assert.equal(out.length, 1);
});

test('shouldMigrate: só quando a nuvem está vazia e há dados locais', () => {
  assert.equal(shouldMigrate([], [{ id: '1' }]), true);
  assert.equal(shouldMigrate([{ id: '1' }], [{ id: '2' }]), false);
  assert.equal(shouldMigrate([], []), false);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test tests/merge.test.js`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `web/src/merge.js`**

```js
// Funções puras de reconciliação do diário (união de trades, decisão de migração).

/** União de trades por id. O array "incoming" vence em conflito de id. */
export function mergeTrades(base, incoming) {
  const map = new Map();
  for (const t of base) map.set(t.id, t);
  for (const t of incoming) map.set(t.id, t);
  return [...map.values()];
}

/** Migra os dados locais pra nuvem só quando a nuvem está vazia e há dados locais. */
export function shouldMigrate(cloudTrades, localTrades) {
  return cloudTrades.length === 0 && localTrades.length > 0;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test tests/merge.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/merge.js tests/merge.test.js
git commit -m "Sync: merge de trades e decisao de migracao (puros)"
```

---

## Task 3: Cliente Supabase (auth + dados)

**Files:**
- Create: `web/src/supabase.js`

- [ ] **Step 1: Implementar o cliente**

Criar `web/src/supabase.js`:

```js
// Cliente Supabase + helpers de auth e de dados. supabase-js via ESM (sem build).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ---- Auth ---- */
export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((_event, session) => cb(session));
}
export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function currentUserId() {
  const s = await getSession();
  return s?.user?.id ?? null;
}
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}
export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() {
  await sb.auth.signOut();
}
export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

/* ---- Dados ---- */
export async function fetchAll() {
  const [t, c] = await Promise.all([
    sb.from('trades').select('data'),
    sb.from('config').select('data').maybeSingle(),
  ]);
  if (t.error) throw t.error;
  if (c.error) throw c.error;
  return { trades: (t.data || []).map((r) => r.data), config: c.data?.data ?? null };
}
export async function upsertTrade(userId, trade) {
  const { error } = await sb.from('trades').upsert({ id: trade.id, user_id: userId, data: trade });
  if (error) throw error;
}
export async function deleteTradeRow(id) {
  const { error } = await sb.from('trades').delete().eq('id', id);
  if (error) throw error;
}
export async function upsertConfig(userId, config) {
  const { error } = await sb.from('config').upsert({ user_id: userId, data: config });
  if (error) throw error;
}
```

- [ ] **Step 2: Checagem de sintaxe**

Run: `node --check web/src/supabase.js`
Expected: sem erro. (O import de rede só resolve no navegador; `--check` valida a sintaxe.)

- [ ] **Step 3: Commit**

```bash
git add web/src/supabase.js
git commit -m "Supabase: cliente com helpers de auth e dados"
```

---

## Task 4: `store.js` vira cache + sync

**Files:**
- Modify: `web/src/store.js` (substituição completa)

- [ ] **Step 1: Reescrever `web/src/store.js`**

```js
// Cache local (localStorage) + sincronização com o Supabase.
// Leituras são síncronas (do cache); escritas são "nuvem primeiro".
import * as cloud from './supabase.js';
import { mergeTrades, shouldMigrate } from './merge.js';

const KEY_CONFIG = 'investidor.config.v1';
const KEY_TRADES = 'investidor.trades.v1';

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(); }

function readCache(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function writeCache(key, value) { localStorage.setItem(key, JSON.stringify(value)); emit(); }

/* ---- Leituras (síncronas, do cache) ---- */
export function getConfig() { return readCache(KEY_CONFIG, null); }
export function isConfigured() { return getConfig() != null; }
export function getTrades() { return readCache(KEY_TRADES, []); }
export function currentBankroll() {
  const cfg = getConfig();
  if (!cfg) return 0;
  return cfg.initial + getTrades().reduce((acc, t) => acc + (t.pl ?? 0), 0);
}

/* ---- Boot: baixa da nuvem, migra se preciso, popula o cache ---- */
export async function initStore() {
  const { trades: cloudTrades, config: cloudConfig } = await cloud.fetchAll();
  const localTrades = getTrades();
  const localConfig = getConfig();

  if (shouldMigrate(cloudTrades, localTrades)) {
    const userId = await cloud.currentUserId();
    for (const t of localTrades) await cloud.upsertTrade(userId, t);
    if (localConfig && !cloudConfig) await cloud.upsertConfig(userId, localConfig);
    writeCache(KEY_TRADES, localTrades);
    if (localConfig) writeCache(KEY_CONFIG, localConfig);
    return;
  }
  writeCache(KEY_TRADES, mergeTrades(localTrades, cloudTrades));
  writeCache(KEY_CONFIG, cloudConfig ?? localConfig ?? null);
}

/* ---- Escritas (nuvem primeiro; no sucesso, atualiza o cache) ---- */
export async function setConfig(cfg) {
  const userId = await cloud.currentUserId();
  await cloud.upsertConfig(userId, cfg);
  writeCache(KEY_CONFIG, cfg);
}
export async function addTrade(trade) {
  const userId = await cloud.currentUserId();
  await cloud.upsertTrade(userId, trade);
  writeCache(KEY_TRADES, [...getTrades(), trade]);
}
export async function updateTrade(id, patch) {
  const userId = await cloud.currentUserId();
  const updated = getTrades().map((t) => (t.id === id ? { ...t, ...patch } : t));
  const t = updated.find((x) => x.id === id);
  await cloud.upsertTrade(userId, t);
  writeCache(KEY_TRADES, updated);
}
export async function removeTrade(id) {
  await cloud.deleteTradeRow(id);
  writeCache(KEY_TRADES, getTrades().filter((t) => t.id !== id));
}

/** Limpa o cache local (usado no logout). */
export function clearCache() {
  localStorage.removeItem(KEY_CONFIG);
  localStorage.removeItem(KEY_TRADES);
}
```

- [ ] **Step 2: Checagem de sintaxe**

Run: `node --check web/src/store.js`
Expected: sem erro.

- [ ] **Step 3: Rodar a suíte (garantir que o resto não quebrou)**

Run: `npm test`
Expected: PASS (os testes atuais não importam `store.js`; os de merge passam).

- [ ] **Step 4: Commit**

```bash
git add web/src/store.js
git commit -m "Store: cache local + sync com Supabase (leitura sync, escrita async)"
```

---

## Task 5: Portão de auth, boot assíncrono e logout (app.js + index.html + styles.css)

**Files:**
- Modify: `web/index.html` (adicionar `#auth-root`)
- Modify: `web/styles.css` (tela de auth)
- Modify: `web/app.js` (boot, auth gate, logout, escritas async)

- [ ] **Step 1: Adicionar o contêiner de auth no `index.html`**

Trocar a linha `<div id="modal-root"></div>` por:

```html
  <div id="auth-root"></div>
  <div id="modal-root"></div>
```

- [ ] **Step 2: Estilos da tela de auth em `web/styles.css`** (adicionar ao fim)

```css
/* ===== Tela de login (auth) ===== */
#auth-root:empty { display: none; }
.auth-overlay {
  position: fixed; inset: 0; z-index: 100; background: var(--bg);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.auth-card {
  width: 100%; max-width: 360px; background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius); padding: 24px;
}
.auth-card h1 { font-size: 20px; margin-bottom: 4px; }
.auth-card p.sub { color: var(--muted); font-size: 13px; margin-bottom: 18px; }
.auth-input {
  width: 100%; padding: 14px; margin-bottom: 10px; font-size: 16px; font-family: inherit;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; color: var(--text);
}
.auth-input:focus { outline: none; border-color: var(--accent); }
.auth-error { color: var(--red); font-size: 13px; margin: 4px 0 10px; min-height: 18px; }
.auth-switch { text-align: center; margin-top: 14px; font-size: 13px; color: var(--muted); }
.auth-switch button { background: none; border: none; color: var(--accent); font: inherit; cursor: pointer; }
.auth-forgot { background: none; border: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; }
```

- [ ] **Step 3: `app.js` — import e boot assíncrono com portão de auth**

Em `web/app.js`, trocar a linha 1 (`import * as store from './src/store.js';`) por:

```js
import * as store from './src/store.js';
import * as auth from './src/supabase.js';
```

Substituir o bloco final de boot (hoje):

```js
/* ================= Boot ================= */
store.subscribe(() => renderScreen(currentScreen));
renderScreen('banca');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW não registrado:', err.message));
  });
}
```

por:

```js
/* ================= Auth + Boot ================= */
const authRoot = document.getElementById('auth-root');
let booted = false;

function renderAuth() {
  let mode = 'login'; // 'login' | 'signup'
  function draw() {
    authRoot.innerHTML = `
      <div class="auth-overlay"><div class="auth-card">
        <h1>${mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p class="sub">Seu diário fica privado e sincronizado na nuvem.</p>
        <input class="auth-input" id="auth-email" type="email" inputmode="email" placeholder="E-mail" autocomplete="email">
        <input class="auth-input" id="auth-pass" type="password" placeholder="Senha" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">
        <div class="auth-error" id="auth-error"></div>
        <button class="btn btn-primary" id="auth-submit">${mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        ${mode === 'login' ? '<div style="text-align:center;margin-top:10px"><button class="auth-forgot" id="auth-forgot">Esqueci a senha</button></div>' : ''}
        <div class="auth-switch">
          ${mode === 'login' ? 'Não tem conta?' : 'Já tem conta?'}
          <button id="auth-switch">${mode === 'login' ? 'Criar conta' : 'Entrar'}</button>
        </div>
      </div></div>`;
    const err = authRoot.querySelector('#auth-error');
    const email = () => authRoot.querySelector('#auth-email').value.trim();
    const pass = () => authRoot.querySelector('#auth-pass').value;
    authRoot.querySelector('#auth-switch').addEventListener('click', () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); });
    authRoot.querySelector('#auth-submit').addEventListener('click', async () => {
      err.textContent = '';
      try {
        if (mode === 'login') await auth.signIn(email(), pass());
        else {
          const { session } = await auth.signUp(email(), pass());
          err.style.color = 'var(--green)';
          err.textContent = session ? 'Conta criada! Entrando...' : 'Conta criada! Confirme o e-mail e depois entre.';
        }
      } catch (e) { err.style.color = 'var(--red)'; err.textContent = traduzErroAuth(e); }
    });
    authRoot.querySelector('#auth-forgot')?.addEventListener('click', async () => {
      if (!email()) { err.textContent = 'Digite seu e-mail primeiro.'; return; }
      try { await auth.resetPassword(email()); err.style.color = 'var(--green)'; err.textContent = 'Enviei um link de redefinição pro seu e-mail.'; }
      catch (e) { err.style.color = 'var(--red)'; err.textContent = traduzErroAuth(e); }
    });
  }
  draw();
}

function traduzErroAuth(e) {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered')) return 'Esse e-mail já tem conta. Tente entrar.';
  if (m.includes('password')) return 'Senha muito curta (mínimo 6 caracteres).';
  if (m.includes('email')) return 'E-mail inválido.';
  return 'Não deu certo. Confira os dados e a conexão.';
}

async function bootApp() {
  authRoot.innerHTML = '';
  try { await store.initStore(); }
  catch (e) { toast('Erro ao carregar seus dados: ' + (e?.message || 'sem conexão')); }
  if (!booted) {
    booted = true;
    store.subscribe(() => renderScreen(currentScreen));
  }
  renderScreen(currentScreen);
}

// Reage ao estado de login (inclui sessão persistida ao abrir o app)
auth.onAuthChange((session) => {
  if (session) bootApp();
  else { booted = false; renderAuth(); }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW não registrado:', err.message));
  });
}
```

- [ ] **Step 4: Tornar os handlers de escrita `async` (await nas chamadas de store)**

No `web/app.js`, ajustar os pontos que gravam (o `store.*` agora é assíncrono). Trocar cada trecho:

`saveTrade` (hoje `store.addTrade(trade);`) →
```js
try { await store.addTrade(trade); } catch (e) { toast('Sem conexão — trade não salvo.'); return; }
```
e marcar `async function saveTrade()`.

Salvar config (hoje `store.setConfig({ ...draft });`) →
```js
try { await store.setConfig({ ...draft }); } catch (e) { toast('Sem conexão — não salvo.'); return; }
```
(no callback do `#btn-save`, marcar a função `async`).

Remover trade (hoje `store.removeTrade(btn.dataset.remove);`) →
```js
try { await store.removeTrade(btn.dataset.remove); } catch { toast('Sem conexão — não removido.'); return; }
```
(marcar o handler `async`).

Revisão do trade — **dois pontos exatos**:

No `renderHistorico`, handler `[data-review]` (hoje `store.updateTrade(chip.dataset.id, { review: chip.dataset.review });`) →
```js
    chip.addEventListener('click', async () => {
      try { await store.updateTrade(chip.dataset.id, { review: chip.dataset.review }); }
      catch { toast('Sem conexão — revisão não salva.'); return; }
      toast('Revisão salva 📝');
    })
```

No `openReview`, handler `[data-rv]` (hoje `store.updateTrade(tradeId, { review: chip.dataset.rv });`) →
```js
    chip.addEventListener('click', async () => {
      try { await store.updateTrade(tradeId, { review: chip.dataset.rv }); }
      catch { toast('Sem conexão — revisão não salva.'); return; }
      close();
      toast('Revisão salva 📝');
    })
```

- [ ] **Step 5: Adicionar botão "Sair" no dashboard da Banca**

Em `renderDashboard` (dentro do `bancaEl.innerHTML`), após o botão "Ajustar configuração", adicionar:

```js
    <button class="btn btn-ghost" id="btn-logout" style="margin-top:8px">Sair da conta</button>
```

E no wiring do `renderDashboard`, adicionar:

```js
  bancaEl.querySelector('#btn-logout').addEventListener('click', async () => {
    await auth.signOut();
    store.clearCache();
  });
```

- [ ] **Step 6: Checagem de sintaxe**

Run: `node --check web/app.js`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add web/index.html web/styles.css web/app.js
git commit -m "App: login por e-mail/senha, boot com sync e botao sair"
```

---

## Task 6: Verificação de ponta a ponta (navegador)

- [ ] **Step 1: Subir o app e abrir**

Run: `npm run dev` (ou usar o servidor já rodando) e abrir `http://localhost:5173`.
Expected: aparece a **tela de login** (o app fica atrás dela).

- [ ] **Step 2: Criar conta e migrar**

Criar conta com um e-mail de teste + senha (≥6 chars). Após entrar, o app aparece; se havia dados no `localStorage` daquele navegador, eles continuam visíveis.
Conferir na nuvem (MCP `execute_sql`): `select count(*) from trades;` deve refletir os trades.

- [ ] **Step 3: Registrar um trade e ver subir**

Registrar um trade pela aba Registrar. Conferir via `execute_sql` que a contagem subiu.

- [ ] **Step 4: Simular "outro aparelho"**

Abrir o app numa **aba anônima** (localStorage limpo) → tela de login → entrar com a mesma conta → os trades **baixam** e aparecem. (Prova a sincronização.)

- [ ] **Step 5: Offline (leitura)**

Com o app logado, cortar a rede (DevTools → Offline) → recarregar → deve **mostrar os últimos dados** (cache). Tentar registrar → **aviso** "sem conexão". Religar a rede.

- [ ] **Step 6: RLS**

Via `execute_sql`, confirmar que as policies existem e que `trades`/`config` têm RLS on (`get_advisors` security = limpo).

- [ ] **Step 7: Sair**

Tocar "Sair da conta" → volta pra tela de login; cache local limpo.

---

## Task 7: Hardening opcional (travar novos cadastros)

- [ ] **Step 1 (após o Felipe criar a conta dele):** no painel do Supabase → Authentication → Sign In / Providers → desligar **"Allow new users to sign up"**. Assim ninguém mais cria login no app. (Passo manual, feito só quando o Felipe confirmar que já criou a conta.)

---

## Cobertura da spec (auto-revisão)

- **Projeto dedicado + tabelas + RLS** → Task 1.
- **Auth e-mail/senha + esqueci a senha** → Task 3 (helpers) + Task 5 (tela).
- **App atrás de login** → Task 5 (portão de auth).
- **Cache local + leitura sync + escrita nuvem-primeiro** → Task 4.
- **Migração one-time** → Task 4 (`initStore` + `shouldMigrate`) + Task 2 (puro/testado).
- **Offline (leitura do cache, escrita bloqueada com aviso)** → Task 4 (throw) + Task 5 Step 4 (toasts) + Task 6 Step 5 (verificação).
- **Chave pública no código; service_role fora** → Task 1/3 (só anon).
- **Travar cadastro (opção)** → Task 7.
- **Bordas** (sem sessão, offline, nuvem vazia/local cheia, aparelho novo, erro de auth, sessão expira) → Task 4/5 + Task 6.
