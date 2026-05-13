// Proxy serverless Vercel vers OpenSky /states/all
// - cache 'best-effort' en memoire (1h)
// - ajoute Basic Auth depuis variables d'environnement
// - verifie le mot de passe d'acces au site

const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (v.expires < now) cache.delete(k);
  }
  // Limite de securite si on monte trop haut
  if (cache.size > 500) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

module.exports = async (req, res) => {
  // CORS pour eventuels tests locaux
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-site-password, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verification du mot de passe d'acces au site
  const sitePassword = process.env.SITE_PASSWORD;
  if (sitePassword) {
    const provided = req.headers['x-site-password'];
    if (provided !== sitePassword) {
      return res.status(401).json({ error: 'Mot de passe site invalide ou absent' });
    }
  }

  // Recuperation des credentials OpenSky
  const oskyUser = process.env.OPENSKY_USER;
  const oskyPass = process.env.OPENSKY_PASS;

  // Construction de la query string a partir des params recus
  const params = req.query || {};
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  }
  const queryStr = sp.toString();
  const cacheKey = `states:${queryStr}`;

  // Verif cache
  pruneCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(cached.data);
  }

  // Appel OpenSky
  const openSkyUrl = `https://opensky-network.org/api/states/all?${queryStr}`;
  const headers = { 'Accept': 'application/json' };
  if (oskyUser && oskyPass) {
    const auth = Buffer.from(`${oskyUser}:${oskyPass}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  }

  try {
    const response = await fetch(openSkyUrl, { headers });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({
        error: `OpenSky HTTP ${response.status}`,
        statusText: response.statusText,
        details: text.slice(0, 300)
      });
    }
    const data = await response.json();

    // Mise en cache
    cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });

    // Cache Edge cote Vercel
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur lors du fetch OpenSky', details: err.message });
  }
};
