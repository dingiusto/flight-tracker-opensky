// Proxy Edge Runtime Vercel → adsb.fi /api/v2/ (données live)
// Remplace OpenSky qui bloque les IPs Vercel (AWS et Cloudflare).
// adsb.fi est une source communautaire ADS-B libre, sans blocage IP.
// Renvoie les données au format OpenSky-compatible pour ne pas modifier le frontend.

export const config = { runtime: 'edge' };

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute (données live)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-site-password, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// Distance en km entre deux points géographiques
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

  const { searchParams } = new URL(req.url);
  const lamin = parseFloat(searchParams.get('lamin') || '0');
  const lomin = parseFloat(searchParams.get('lomin') || '0');
  const lamax = parseFloat(searchParams.get('lamax') || '0');
  const lomax = parseFloat(searchParams.get('lomax') || '0');

  // Clé de cache basée sur la bbox (arrondie au 0.5° pour mutualiser les requêtes proches)
  const cacheKey = `states:${lamin.toFixed(1)},${lomin.toFixed(1)},${lamax.toFixed(1)},${lomax.toFixed(1)}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return Response.json(cached.data, {
      headers: { ...CORS, 'X-Cache': 'HIT' },
    });
  }

  // Convertir la bbox en centre + rayon pour l'API adsb.fi
  const centerLat = (lamin + lamax) / 2;
  const centerLon = (lomin + lomax) / 2;
  // Rayon = distance du centre au coin, en miles nautiques (API adsb.fi), cap 500nm
  const radiusKm = haversineKm(centerLat, centerLon, lamin, lomin);
  const radiusNm = Math.min(Math.ceil(radiusKm * 0.539957), 500);

  const adsbUrl = `https://opendata.adsb.fi/api/v2/lat/${centerLat.toFixed(4)}/lon/${centerLon.toFixed(4)}/dist/${radiusNm}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);

  try {
    const response = await fetch(adsbUrl, {
      signal: ac.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'flight-tracker/2.0',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return Response.json(
        { error: `adsb.fi HTTP ${response.status} — ${text.slice(0, 200)}` },
        { status: response.status, headers: CORS }
      );
    }

    const data = await response.json();

    // Convertir au format OpenSky + filtrer sur la bbox exacte (le rayon déborde les coins)
    const states = (data.ac || [])
      .filter(a =>
        a.lat != null && a.lon != null &&
        a.lat >= lamin && a.lat <= lamax &&
        a.lon >= lomin && a.lon <= lomax
      )
      .map(a => [
        (a.hex || '').toLowerCase(),                                      // 0  icao24
        (a.flight || '').trim(),                                          // 1  callsign
        '',                                                               // 2  origin_country (non dispo)
        null,                                                             // 3  time_position
        null,                                                             // 4  last_contact
        a.lon,                                                            // 5  longitude
        a.lat,                                                            // 6  latitude
        a.alt_baro != null ? Math.round(a.alt_baro * 0.3048) : null,     // 7  baro_altitude ft→m
        a.alt_baro != null && a.alt_baro <= 50,                          // 8  on_ground
        a.gs != null ? Math.round(a.gs * 0.514444 * 10) / 10 : null,    // 9  velocity kts→m/s
        a.track ?? null,                                                  // 10 heading (degrés)
        a.baro_rate != null ? Math.round(a.baro_rate * 0.00508 * 10) / 10 : null, // 11 vert_rate ft/min→m/s
        null, null,                                                       // 12-13
        a.squawk ?? null,                                                 // 14 squawk
        false, 0                                                          // 15-16
      ]);

    const result = { time: Math.floor(now / 1000), states };

    cache.set(cacheKey, { data: result, expires: now + CACHE_TTL_MS });
    if (cache.size > 300) cache.delete(cache.keys().next().value);

    return Response.json(result, {
      headers: { ...CORS, 'X-Cache': 'MISS' },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return Response.json(
        { error: 'adsb.fi ne répond pas dans les délais (timeout 20s).' },
        { status: 504, headers: CORS }
      );
    }
    return Response.json(
      { error: `Échec du fetch vers adsb.fi : ${err.message || String(err)}` },
      { status: 500, headers: CORS }
    );
  }
}
