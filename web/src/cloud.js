// A ponte com o Supabase: login e o vai-e-vem das observações. Só entrada e saída —
// a regra de o que sobe e como se junta mora em sync.js, que é testável sem rede.
//
// Nada aqui pode travar a operação: toda função devolve erro em vez de estourar, e o
// app trata a nuvem como um bônus. Se cair a internet no meio de um jogo, o laço
// continua igual, gravando no aparelho, e a fila sobe depois.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { toCloudRow } from './sync.js';

const LOTE = 500; // o Supabase engasga com payload gigante; sobe em pedaços

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'investidor.auth' },
});

export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((_e, session) => cb(session));
}

export async function getSession() {
  try {
    const { data } = await sb.auth.getSession();
    return data?.session ?? null;
  } catch {
    return null;
  }
}

export async function signIn(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data.session;
}

export async function signUp(email, senha) {
  const { data, error } = await sb.auth.signUp({ email, password: senha });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  try { await sb.auth.signOut(); } catch { /* sair local já basta */ }
}

/**
 * Sobe as observações. `upsert` pela chave natural (dono + instante + confronto): mandar
 * de novo é inofensivo, e é assim que o desfecho, que chega no dia seguinte, atualiza
 * uma linha que já estava lá.
 */
export async function pushRows(rows) {
  if (!rows?.length) return { enviadas: 0 };
  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE).map(toCloudRow);
    const { error } = await sb
      .from('observacoes')
      .upsert(lote, { onConflict: 'user_id,at,a,b' });
    if (error) throw error;
  }
  return { enviadas: rows.length };
}

/** Baixa tudo que é do dono. Usado ao entrar num aparelho novo ou pra recuperar. */
export async function pullRows() {
  const todas = [];
  const PAGINA = 1000;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await sb
      .from('observacoes')
      .select('data')
      .order('at', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    todas.push(...(data || []).map((r) => r.data).filter(Boolean));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}
