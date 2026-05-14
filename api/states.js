// Proxy Edge Runtime Vercel → OpenSky /states/all
// Edge Runtime = réseau Cloudflare → contourne le blocage AWS d'OpenSky
// Cache Map best-effort (partagé dans une même instance Edge, pas garanti entre invocations)

export const config = { runtime: 'edge' };

const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-site-password, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS });
  }

  // Vérification mot de passe site
  const sitePassword = process.env.SITE_PASSWORD;
  if (sitePassword) {
    const provided = req.headers.get('x-site-password');
    if (provided !== sitePassword) {
      return Response.json(
        { error: 'Mot de passe site invalide ou absent' },
        { status: 401, headers: CORS }
      );
    }
  }

  // Credentials OpenSky
  const oskyUser = (process.env.OPENSKY_USER || '').trim();
  const oskyPass = (process.env.OPENSKY_PASS || '').trim();

  if (!oskyUser || !oskyPass) {
    return Response.json(
      { error: "Variables d'environnement OPENSKY_USER ou OPENSKY_PASS manquantes ou vides sur Vercel. Vérifie Settings > Environment Variables, puis redéploie." },
      { status: 500, headers: CORS }
    );
  }

  // Récupération des query params depuis l'URL
  const { searchParams } = new URL(req.url);
  const queryStr = searchParams.toString();
  const cacheKey = `states:${queryStr}`;

  // Vérif cache
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return Response.json(cached.data, {
      headers: { ...CORS, 'X-Cache': 'HIT', 'Cache-Control': 's-maxage=3600, stale-while-revalidate=7200' },
    });
  }

  // Appel OpenSky
  const openSkyUrl = `https://opensky-network.org/api/states/all${queryStr ? '?' + queryStr : ''}`;
  const auth = btoa(`${oskyUser}:${oskyPass}`);

  try {
    const response = await fetch(openSkyUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`,
        'User-Agent': 'flight-tracker-opensky/1.0',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const snippet = text.slice(0, 300).replace(/\s+/g, ' ');
      return Response.json(
        { error: `OpenSky HTTP ${response.status} ${response.statusText}${snippet ? ' — ' + snippet : ''}` },
        { status: response.status, headers: CORS }
      );
    }

    const data = await response.json();

    // Mise en cache
    cache.set(cacheKey, { data, expires: now + CACHE_TTL_MS });
    // Nettoyage basique si trop d'entrées
    if (cache.size > 500) cache.delete(cache.keys().next().value);

    return Response.json(data, {
      headers: { ...CORS, 'Cache-Control': 's-maxage=3600, stale-while-revalidate=7200', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    const cause = err.cause;
    const causeMsg = cause
      ? ` → ${cause.message || String(cause)}${cause.code ? ' [' + cause.code + ']' : ''}`
      : '';
    return Response.json(
      { error: `Échec du fetch vers OpenSky : ${err.message || String(err)}${causeMsg}` },
      { status: 500, headers: CORS }
    );
  }
}
