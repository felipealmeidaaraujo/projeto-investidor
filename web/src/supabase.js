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
