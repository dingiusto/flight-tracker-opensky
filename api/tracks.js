// Proxy serverless Vercel vers OpenSky /tracks/all
// Memes principes que states.js : cache 1h + Basic Auth + check mot de passe site

const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (v.expires < now) cache.delete(k);
  }
  if (cache.size > 1000) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-site-password, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sitePassword = process.env.SITE_PASSWORD;
  if (sitePassword) {
    const provided = req.headers['x-site-password'];
    if (provided !== sitePassword) {
      return res.status(401).json({ error: 'Mot de passe site invalide ou absent' });
    }
  }

  const oskyUser = process.env.OPENSKY_USER;
  const oskyPass = process.env.OPENSKY_PASS;

  const params = req.query || {};
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  }
  const queryStr = sp.toString();
  const cacheKey = `tracks:${queryStr}`;

  pruneCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(cached.data);
  }

  const openSkyUrl = `https://opensky-network.org/api/tracks/all?${queryStr}`;
  const headers = { 'Accept': 'application/json' };
  if (oskyUser && oskyPass) {
    const auth = Buffer.from(`${oskyUser}:${oskyPass}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  }

  try {
    const response = await fetch(openSkyUrl, { headers });
    if (!response.ok) {
      // 404 frequent sur /tracks/all si l'avion n'a pas de track dispo : on renvoie null calmement
      if (response.status === 404) {
        return res.status(200).json(null);
      }
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({
        error: `OpenSky HTTP ${response.status}`,
        statusText: response.statusText,
        details: text.slice(0, 300)
      });
    }
    const data = await response.json();

    cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur lors du fetch OpenSky', details: err.message });
  }
};
