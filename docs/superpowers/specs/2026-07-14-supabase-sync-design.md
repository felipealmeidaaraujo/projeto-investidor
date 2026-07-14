# Sincronização com Supabase (nuvem + multi-dispositivo) — Design

- **Data:** 2026-07-14
- **Status:** Aprovado (brainstorming) — pronto para virar plano
- **Área:** `web/` (app) + Supabase (banco/auth)
- **Contexto:** substitui o "backup em JSON" (que sai do roteiro). Relacionado: [[projeto-investidor-visao-geral]].

## Problema

O diário (banca + trades) vive só no `localStorage` de **um aparelho**. Riscos: perder tudo
ao limpar o navegador/trocar de PC, e não ter os dados no celular. O Felipe opera **basicamente
no PC, às vezes no celular, e só com internet** — então quer sincronização automática na nuvem,
sem exportar/importar manual.

## Objetivo

Guardar o diário na nuvem (Supabase), privado, sincronizando automático entre os aparelhos,
sem perder os dados que já existem no PC.

## Viabilidade (já confirmada)

- Conta Supabase **acessível** (org **Athenia**, `silykubavtcvqnqheoga`).
- Criar projeto dedicado: **R$ 0/mês** (free).
- Região **São Paulo (sa-east-1)** — baixa latência no Brasil.
- **Online-only** (decisão do usuário) → dispensa a camada de sync offline, que era a parte
  mais arriscada. É o que torna o projeto viável agora.

## Escopo

**Dentro:**
- Projeto Supabase dedicado + tabelas `trades` e `config` com **RLS** (cada conta só vê o seu).
- **Auth e-mail + senha** (Supabase Auth), com "esqueci a senha" (evita travamento).
- App **atrás de login**: sem sessão → tela de entrar/criar conta; com sessão → app normal.
- `localStorage` vira **cache local** (leitura offline). Supabase é a fonte da verdade.
- **Migração one-time**: no 1º login, se a nuvem estiver vazia e houver dados locais, sobe tudo.

**Fora:**
- Escrita offline / fila de sincronização (é online-only).
- Realtime entre aparelhos abertos ao mesmo tempo (o fetch no boot já cobre o uso dele).
- Funcionalidades de multiusuário além do isolamento por conta.

## Design

### Experiência (o que o usuário vê)
- 1ª vez: **criar conta** (e-mail + senha). Depois, nos outros aparelhos, **entrar** com o mesmo.
- Sessão **persiste** (quase nunca reloga).
- Tudo que registra **sobe sozinho** e aparece nos dois aparelhos (ao abrir o app, ele busca o
  estado mais recente).
- **Sem internet:** mostra os últimos dados (cache, só leitura) e avisa que registrar precisa de
  conexão.

### Banco (Supabase)
- `trades`: `id uuid pk`, `user_id uuid` (→ `auth.users`), `data jsonb` (o objeto do trade),
  `created_at`. RLS: `select/insert/update/delete` só onde `auth.uid() = user_id`.
- `config`: `user_id uuid pk` (→ `auth.users`), `data jsonb` (banca/limites), `updated_at`.
  RLS igual.
- Guardar o trade/config como `jsonb` mantém o formato atual do app sem reescrever a modelagem
  (o `id` do trade já é `crypto.randomUUID()`).

### Cliente
- `supabase-js` via **import ESM** (`https://esm.sh/@supabase/supabase-js@2`) — sem build,
  mantém o padrão do projeto.
- **URL do projeto + chave pública (anon)** ficam no código (são feitas pra ser públicas; quem
  protege é o RLS). A **service_role NUNCA** entra no cliente.

### Arquitetura de dados (crucial)
- **Leituras continuam síncronas**, lendo do **cache** (`localStorage`) — a UI do `app.js` quase
  não muda (`getTrades()`/`getConfig()` seguem retornando na hora).
- **No boot:** inicia o cliente → checa sessão → se logado, **busca** trades+config do Supabase →
  grava no cache → renderiza.
- **Escritas viram "nuvem primeiro"** (assíncronas): envia pro Supabase e, no sucesso, atualiza o
  cache + re-renderiza. Falhou (offline) → **não** grava e mostra aviso ("sem conexão"). Isso evita
  cache e nuvem divergirem. Latência p/ São Paulo é baixa, então o toque continua fluido.
- **Merge por `id`** na migração e em qualquer reconciliação (união, nunca sobrescreve perdendo).

### Migração dos dados atuais
- No 1º login: se `trades` da nuvem estiver vazio **e** houver trades no `localStorage`, sobe todos
  (e o `config`). Idempotente: só migra quando a nuvem está vazia.

### Segurança / hardening
- RLS obrigatório nas duas tabelas (sem isso o `jsonb` ficaria exposto).
- **Opção (pedido do Felipe):** depois de ele criar a conta, **desabilitar novos cadastros** no
  painel do Supabase (Authentication → Providers → "Allow new users to sign up" off). Assim ninguém
  mais cria login no app. Fica como **passo final recomendado**, não bloqueia o resto.

## Arquitetura / onde mexer

- **Novo** `web/src/supabase.js`: init do cliente + helpers de auth (`signUp`, `signIn`, `signOut`,
  `getSession`, `onAuthChange`, `resetPassword`) e de dados (`fetchAll`, `upsertTrade`,
  `deleteTrade`, `upsertConfig`).
- **Novo** `web/src/merge.js` (puro, testável): `mergeTrades(a, b)` (união por `id`) e o helper de
  decisão de migração.
- **Modificar** `web/src/store.js`: vira **cache + orquestração de sync** usando `supabase.js`.
  Leituras síncronas do cache; escritas assíncronas (nuvem→cache). Novo `initStore()` (boot).
- **Modificar** `web/app.js`: **portão de auth** (tela de entrar/criar conta quando sem sessão),
  boot assíncrono, botão **sair**, e os handlers de escrita (`saveTrade`, salvar config, remover,
  revisão) viram `async` (com aviso em caso de falha).
- **Modificar** `web/index.html`: contêiner da tela de auth (ou overlay).
- **Config**: constantes `SUPABASE_URL` + `SUPABASE_ANON_KEY` (preenchidas ao criar o projeto).

**Sem** mexer no motor de análise. Service worker: pode precisar de ajuste leve (não cachear a auth),
mas é network-first — avalio no plano.

## Estados de borda
1. **Sem sessão** → tela de login (app fica atrás dela).
2. **Offline** → app mostra cache (leitura); escrita bloqueada com aviso.
3. **Nuvem vazia + local com dados** → migração sobe tudo.
4. **Nuvem com dados + local vazio** (aparelho novo) → baixa tudo pro cache.
5. **Erro de auth** (senha errada, e-mail já existe) → mensagem clara, não trava.
6. **Sessão expira** → volta pra tela de login sem perder o cache.

## Testes
- **Puros (unit):** `mergeTrades` (união por id, sem duplicar), decisão de migração (só quando
  nuvem vazia), mapeamento trade↔linha do banco.
- **Manual (navegador):** criar conta → registrar trade → conferir que aparece no Supabase (via
  MCP `execute_sql`) → "entrar" num contexto limpo e ver os dados baixarem → abrir offline e ver
  o cache (leitura) → tentar registrar offline e ver o aviso.
- **RLS:** confirmar (via MCP) que uma conta não lê linhas de outra.

## Fora de escopo / futuro
- Sync em tempo real entre aparelhos abertos simultaneamente.
- Escrita offline com fila.
- Multiusuário/monetização (Fase 5) — o isolamento por conta já deixa a base pronta.
