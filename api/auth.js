// Verification du mot de passe d'acces au site
// - POST avec body { password } -> 200 si correct, 401 sinon
// - si SITE_PASSWORD n'est pas defini, renvoie ok=true (acces libre)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-site-password');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) {
    return res.status(200).json({ ok: true, protected: false });
  }

  // Recuperation du mot de passe fourni (POST body ou header)
  let provided = req.headers['x-site-password'];
  if (!provided && req.method === 'POST') {
    try {
      // Vercel parse normalement le body automatiquement si Content-Type: application/json
      if (req.body && typeof req.body === 'object') {
        provided = req.body.password;
      } else if (typeof req.body === 'string') {
        try {
          provided = JSON.parse(req.body).password;
        } catch (_) {}
      }
    } catch (_) {}
  }

  if (provided && provided === sitePassword) {
    return res.status(200).json({ ok: true, protected: true });
  }
  return res.status(401).json({ ok: false, error: 'Mot de passe invalide' });
};
