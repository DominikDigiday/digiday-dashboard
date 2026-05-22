// /api/operators — GET zoznam (s joinom na tím), PUT upsert, DELETE odstránenie operátora
const { sb } = require('./_supabase.js');

const VALID_POSITIONS = new Set(['junior1', 'junior2', 'senior', 'novacek']);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const rows = await sb(
        'GET',
        '/dashboard_operators?select=pd_user_id,pd_user_name,team_id,position,plan_monthly,plan_daily,active,updated_at&order=active.desc,pd_user_name.asc',
      );
      res.status(200).json({ operators: rows });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const ops = Array.isArray(body.operators) ? body.operators : [body];
      const rows = ops
        .filter(o => o && (o.pd_user_id != null) && o.pd_user_name)
        .map(o => ({
          pd_user_id: Number(o.pd_user_id),
          pd_user_name: String(o.pd_user_name),
          team_id: o.team_id || null,
          position: VALID_POSITIONS.has(o.position) ? o.position : 'junior1',
          plan_monthly: Number.isFinite(o.plan_monthly) ? o.plan_monthly : 0,
          plan_daily: Number.isFinite(o.plan_daily) ? o.plan_daily : 0,
          active: o.active !== false,
          updated_at: new Date().toISOString(),
        }));
      if (!rows.length) {
        res.status(400).json({ error: 'No valid operators provided (need pd_user_id + pd_user_name)' });
        return;
      }
      const saved = await sb('POST', '/dashboard_operators?on_conflict=pd_user_id', {
        body: rows,
        prefer: 'return=representation,resolution=merge-duplicates',
      });
      res.status(200).json({ operators: saved });
      return;
    }

    if (req.method === 'DELETE') {
      const id = (req.query?.pd_user_id || '').toString();
      if (!id) {
        res.status(400).json({ error: 'Missing ?pd_user_id' });
        return;
      }
      await sb('DELETE', `/dashboard_operators?pd_user_id=eq.${encodeURIComponent(id)}`);
      res.status(200).json({ ok: true, pd_user_id: id });
      return;
    }

    res.setHeader('Allow', 'GET, PUT, POST, DELETE');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    console.error('[api/operators]', e);
    res.status(e.statusCode || 500).json({ error: e.message });
  }
};
