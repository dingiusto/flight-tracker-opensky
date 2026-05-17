// Proxy Edge Runtime Vercel → adsb.fi /api/v2/hex/{icao24}
// Retourne une trace synthétique : courte ligne directionnelle (position actuelle + cap).
// Les tracés historiques ne sont pas disponibles via les API ADS-B libres ;
// on représente chaque avion comme un vecteur de ~20km montrant sa direction de vol.

export const config = { runtime: 'edge' };

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

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

  const { searchParams } = new URL(req.url);
  const icao24 = (searchParams.get('icao24') || '').toLowerCase().trim();

  if (!icao24) {
    return Response.json(null, { status: 200, headers: CORS });
  }

  const cacheKey = `tracks:${icao24}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > now) {
    return Response.json(cached.data, { headers: { ...CORS, 'X-Cache': 'HIT' } });
  }

  const adsbUrl = `https://opendata.adsb.fi/api/v2/hex/${icao24}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);

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
      // Avion introuvable ou plus visible : on renvoie null silencieusement
      return Response.json(null, { status: 200, headers: CORS });
    }

    const data = await response.json();
    const aircraft = data.ac && data.ac[0];

    if (!aircraft || aircraft.lat == null || aircraft.lon == null) {
      return Response.json(null, { status: 200, headers: CORS });
    }

    const lat = aircraft.lat;
    const lon = aircraft.lon;
    const altM = aircraft.alt_baro != null ? Math.round(aircraft.alt_baro * 0.3048) : 10000;
    const heading = aircraft.track ?? 0; // cap en degrés (0=Nord, 90=Est…)
    const headingRad = heading * Math.PI / 180;

    // Trace synthétique : vecteur de ~20km dans le sens inverse du cap
    // (point de départ apparent → position actuelle)
    const D = 0.18; // ~20km en degrés de latitude
    const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 0.01);
    const prevLat = lat - D * Math.cos(headingRad);
    const prevLon = lon - D * Math.sin(headingRad) / cosLat;

    const t0 = Math.floor(now / 1000) - 120;
    const t1 = Math.floor(now / 1000);

    // Format OpenSky track : [time, lat, lon, altitude_m, heading, on_ground]
    const result = {
      icao24,
      callsign: (aircraft.flight || '').trim(),
      startTime: t0,
      endTime: t1,
      path: [
        [t0, prevLat, prevLon, altM, heading, false],
        [t1, lat, lon, altM, heading, false],
      ],
    };

    cache.set(cacheKey, { data: result, expires: now + CACHE_TTL_MS });
    if (cache.size > 800) cache.delete(cache.keys().next().value);

    return Response.json(result, { headers: { ...CORS, 'X-Cache': 'MISS' } });
  } catch (err) {
    clearTimeout(timer);
    // Timeout ou erreur réseau : on renvoie null, l'avion sera ignoré silencieusement
    return Response.json(null, { status: 200, headers: CORS });
  }
}
