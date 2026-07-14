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
