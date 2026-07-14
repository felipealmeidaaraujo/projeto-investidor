// Armazenamento local (localStorage) — single-user, offline.
// A lógica pura vive em finance.js / stats.js; aqui é só persistência + eventos.
const KEY_CONFIG = 'investidor.config.v1';
const KEY_TRADES = 'investidor.trades.v1';

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) fn();
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  emit();
}

// --- Configuração (banca inicial + limites) ---
export function getConfig() {
  return read(KEY_CONFIG, null);
}
export function setConfig(cfg) {
  write(KEY_CONFIG, cfg);
}
export function isConfigured() {
  return getConfig() != null;
}

// --- Trades ---
export function getTrades() {
  return read(KEY_TRADES, []);
}
export function addTrade(trade) {
  const all = getTrades();
  all.push(trade);
  write(KEY_TRADES, all);
}
export function removeTrade(id) {
  write(KEY_TRADES, getTrades().filter((t) => t.id !== id));
}
export function updateTrade(id, patch) {
  write(KEY_TRADES, getTrades().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

/** Banca atual = banca inicial + soma de todos os P/L. */
export function currentBankroll() {
  const cfg = getConfig();
  if (!cfg) return 0;
  return cfg.initial + getTrades().reduce((acc, t) => acc + (t.pl ?? 0), 0);
}
