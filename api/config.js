// /api/config — GET single-row config (JSONB), PUT/POST upsert
// Stores admin-side settings (heslo, workDays, workedDaysOverrides, positions)
// that need to propagate across devices. Operátori/Tímy idú cez vlastné tabuľky.
const { sb } = require('./_supabase.js');

const CONFIG_ID = 'main';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const rows = await sb('GET', `/dashboard_config?id=eq.${CONFIG_ID}&select=data,updated_at`);
      const row = (rows || [])[0];
      res.status(200).json({ config: (row && row.data) || {}, updated_at: (row && row.updated_at) || null });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const data = body && typeof body.config === 'object' && body.config !== null ? body.config : (typeof body === 'object' ? body : {});
      const saved = await sb('POST', '/dashboard_config?on_conflict=id', {
        body: [{ id: CONFIG_ID, data, updated_at: new Date().toISOString() }],
        prefer: 'return=representation,resolution=merge-duplicates',
      });
      res.status(200).json({ config: (saved && saved[0] && saved[0].data) || data });
      return;
    }

    res.setHeader('Allow', 'GET, PUT, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    console.error('[api/config]', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
};
