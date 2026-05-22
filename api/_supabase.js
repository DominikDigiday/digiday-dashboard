// Tenký Supabase PostgREST klient cez fetch (bez @supabase/supabase-js)
// Rovnaký pattern ako AKV wall lib/storage.js.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function assertConfigured() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const e = new Error('Supabase nie je nakonfigurovaný (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
    e.statusCode = 500;
    throw e;
  }
}

async function sb(method, path, { body, prefer } = {}) {
  assertConfigured();
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) {
    const err = new Error(`Supabase ${method} ${path} → ${r.status}: ${text}`);
    err.statusCode = r.status;
    throw err;
  }
  return data;
}

module.exports = { sb };
