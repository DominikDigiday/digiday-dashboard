// /api/users — zoznam Pipedrive userov pre admin selektor
// Cache 10 minút (zoznam sa nemení často).
const PD_BASE = 'https://api.pipedrive.com/v1';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
  const token = process.env.PIPEDRIVE_API_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'PIPEDRIVE_API_TOKEN not configured' });
    return;
  }
  try {
    const r = await fetch(`${PD_BASE}/users?api_token=${token}`);
    const d = await r.json();
    if (!d.success) {
      res.status(502).json({ error: 'Pipedrive error', detail: d });
      return;
    }
    const users = (d.data || []).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      active: !!u.active_flag,
    }));
    users.sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'cs'));
    res.status(200).json({ users, count: users.length });
  } catch (e) {
    console.error('[api/users]', e);
    res.status(500).json({ error: e.message });
  }
};
