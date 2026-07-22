// Vercel serverless function: /api/pipedrive
// Returns Pipedrive activities (calls + meetings) in the CSV-row shape the
// existing dashboard JS expects, so no frontend re-architecture is needed.
//
// Query params:
//   since=YYYY-MM-DD   default: 13 months ago

const PD_BASE = 'https://api.pipedrive.com/v1';
const CALL_TYPES = new Set(['spojeny_hovor', 'nespojeny_hovor', 'call']);
const MEETING_TYPES = new Set(['bezna_schuzka', 'meeting']);

async function pagedRecents(token, items, since) {
  const out = [];
  let start = 0;
  while (true) {
    const url = `${PD_BASE}/recents?since_timestamp=${encodeURIComponent(since)}&items=${items}&limit=500&start=${start}&api_token=${token}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.success || !d.data?.length) break;
    out.push(...d.data);
    if (!d.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
  }
  return out;
}

async function fetchUsers(token) {
  const r = await fetch(`${PD_BASE}/users?api_token=${token}`);
  const d = await r.json();
  const map = new Map();
  (d.data || []).forEach(u => map.set(u.id, u.name));
  return map;
}

async function fetchActivityTypes(token) {
  const r = await fetch(`${PD_BASE}/activityTypes?api_token=${token}`);
  const d = await r.json();
  const map = new Map();
  (d.data || []).forEach(t => map.set(t.key_string, t.name));
  return map;
}

async function fetchOrgFieldKeys(token) {
  const r = await fetch(`${PD_BASE}/organizationFields?api_token=${token}`);
  const d = await r.json();
  const fields = d.data || [];
  const labelField = fields.find(f => f.key === 'label');
  const labelOptions = new Map();
  (labelField?.options || []).forEach(o => labelOptions.set(String(o.id), o.label));
  const krajField = fields.find(f => /kraj/i.test(f.name));
  const krajKey = krajField?.key || null;
  const krajOptions = new Map();
  (krajField?.options || []).forEach(o => krajOptions.set(String(o.id), o.label));
  return { labelOptions, krajKey, krajOptions };
}

async function fetchOrgMap(token, since, labelOptions, krajKey, krajOptions) {
  const items = await pagedRecents(token, 'organization', since);
  const map = new Map();
  for (const it of items) {
    const o = it.data;
    if (!o?.id) continue;
    const labelIds = o.label ? String(o.label).split(',').map(s => s.trim()) : [];
    const labels = labelIds.map(id => labelOptions.get(id)).filter(Boolean).join(', ');
    let kraj = '';
    if (krajKey && o[krajKey] != null) {
      const raw = String(o[krajKey]);
      kraj = krajOptions.get(raw) || raw;
    }
    map.set(o.id, { labels, kraj });
  }
  return map;
}

function stavForCall(activity, typeName) {
  if (activity.type === 'nespojeny_hovor') return 'Neuskutečněno';
  if (/neusk/i.test(typeName)) return 'Neuskutečněno';
  return activity.done ? 'Dokončeno' : 'Otevřeno';
}

function rowFromActivity(a, users, typeNames, orgMap, kind) {
  const typeName = typeNames.get(a.type) || a.type || '';
  const userName = users.get(a.user_id) || '';
  const authorName = users.get(a.created_by_user_id) || userName;
  const org = orgMap.get(a.org_id) || { labels: '', kraj: '' };

  const updateTime = a.marked_as_done_time || a.update_time || a.add_time || '';
  const addTime = a.add_time || '';

  return {
    'Aktivita - Čas aktualizace': updateTime,
    'Aktivita - Čas přidání': addTime,
    'Aktivita - Typ': typeName,
    'Aktivita - Stav': kind === 'call' ? stavForCall(a, typeName) : (a.done ? 'Dokončeno' : 'Otevřeno'),
    'Aktivita - Předmět': a.subject || '',
    'Aktivita - Přiřazeno uživateli': userName,
    'Aktivita - Autor': authorName,
    'Organizace - Štítek': org.labels,
    'Organizace - Kraj': org.kraj,
  };
}

function dedupeLatest(items) {
  const byId = new Map();
  for (const it of items) {
    if (it.data?.id) byId.set(it.data.id, it);
  }
  return Array.from(byId.values())
    .filter(it => it.data?.active_flag !== false)
    .map(it => it.data);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const token = process.env.PIPEDRIVE_API_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'PIPEDRIVE_API_TOKEN not configured' });
    return;
  }

  try {
    const sinceParam = (req.query?.since || '').toString();
    const sinceDate = /^\d{4}-\d{2}-\d{2}$/.test(sinceParam)
      ? sinceParam
      : (() => {
          const d = new Date();
          d.setMonth(d.getMonth() - 13);
          return d.toISOString().slice(0, 10);
        })();
    const since = `${sinceDate} 00:00:00`;

    const [users, typeNames, orgFields, rawActivities] = await Promise.all([
      fetchUsers(token),
      fetchActivityTypes(token),
      fetchOrgFieldKeys(token),
      pagedRecents(token, 'activity', since),
    ]);

    const orgMap = await fetchOrgMap(
      token,
      since,
      orgFields.labelOptions,
      orgFields.krajKey,
      orgFields.krajOptions,
    );

    const activities = dedupeLatest(rawActivities);

    const calls = activities
      .filter(a => CALL_TYPES.has(a.type) && a.done === true)
      .map(a => rowFromActivity(a, users, typeNames, orgMap, 'call'));

    const meetings = activities
      .filter(a => MEETING_TYPES.has(a.type))
      .map(a => rowFromActivity(a, users, typeNames, orgMap, 'meeting'));

    // Typ "Zájem" — kľúč hľadáme podľa key_string aj názvu, aby fungoval
    // bez ohľadu na to, ako presne je typ v Pipedrive pomenovaný.
    const interestKeys = new Set();
    typeNames.forEach((name, key) => {
      if (/z[áa]jem/i.test(String(name)) || /zajem/i.test(String(key))) interestKeys.add(key);
    });
    const interests = activities
      .filter(a => interestKeys.has(a.type))
      .map(a => rowFromActivity(a, users, typeNames, orgMap, 'meeting'));

    res.status(200).json({
      calls,
      meetings,
      interests,
      fetchedAt: new Date().toISOString(),
      since: sinceDate,
      counts: {
        calls: calls.length,
        meetings: meetings.length,
        interests: interests.length,
        users: users.size,
        orgs: orgMap.size,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
