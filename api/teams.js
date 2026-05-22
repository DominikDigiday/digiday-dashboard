// /api/teams — GET zoznam, PUT upsert, DELETE odstránenie tímu
const { sb } = require('./_supabase.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const rows = await sb('GET', '/dashboard_teams?select=*&order=position.asc,name.asc');
      res.status(200).json({ teams: rows });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const teams = Array.isArray(body.teams) ? body.teams : [body];
      const rows = teams
        .filter(t => t && t.id && t.name)
        .map(t => ({
          id: String(t.id),
          name: String(t.name),
          color: t.color || '#FF009E',
          position: Number.isFinite(t.position) ? t.position : 0,
          updated_at: new Date().toISOString(),
        }));
      if (!rows.length) {
        res.status(400).json({ error: 'No valid teams provided (need id + name)' });
        return;
      }
      const saved = await sb('POST', '/dashboard_teams?on_conflict=id', {
        body: rows,
        prefer: 'return=representation,resolution=merge-duplicates',
      });
      res.status(200).json({ teams: saved });
      return;
    }

    if (req.method === 'DELETE') {
      const id = (req.query?.id || '').toString();
      if (!id) {
        res.status(400).json({ error: 'Missing ?id' });
        return;
      }
      await sb('DELETE', `/dashboard_teams?id=eq.${encodeURIComponent(id)}`);
      res.status(200).json({ ok: true, id });
      return;
    }

    res.setHeader('Allow', 'GET, PUT, POST, DELETE');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    console.error('[api/teams]', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
};
