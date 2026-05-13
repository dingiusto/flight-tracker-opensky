# Flight Tracker — OpenSky Historical

Visualiseur de trajectoires de vols (donnees OpenSky Network), inspire de la cartographie de The Economist. Frontend statique + 3 micro-fonctions serverless qui jouent le role de proxy pour cacher tes identifiants OpenSky.

## Architecture

```
flight-tracker-opensky/
├── index.html         Frontend (Leaflet + Vanilla JS)
├── api/
│   ├── states.js      Proxy vers OpenSky /states/all (avec cache 1h)
│   ├── tracks.js      Proxy vers OpenSky /tracks/all (avec cache 1h)
│   └── auth.js        Verification du mot de passe d'acces au site
├── package.json
├── vercel.json
└── README.md
```

## Pourquoi un backend proxy ?

- **CORS** : OpenSky ne permet pas toujours d'attaquer son API depuis un navigateur sur un domaine arbitraire. Le proxy contourne ce probleme.
- **Securite** : tes identifiants OpenSky sont stockes uniquement sur Vercel (variables d'environnement). Ils ne quittent jamais le serveur.
- **Quota** : le cache d'1h evite de retaper OpenSky pour les memes requetes, ce qui economise ton quota de 400 req/jour.
- **Acces** : le mot de passe d'acces evite que n'importe qui sur internet utilise ton outil et epuise ton quota.

---

# Deploiement pas-a-pas

Tu n'as pas besoin de savoir coder. Tu vas juste cliquer dans 2 sites web : GitHub et Vercel.

## Etape 1 — Creer le repo GitHub

1. Va sur https://github.com et connecte-toi.
2. En haut a droite, clique sur le **+** puis **New repository**.
3. Remplis :
   - **Repository name** : `flight-tracker-opensky` (ou ce que tu veux)
   - **Description** : optionnel
   - Coche **Public** (Vercel gratuit accepte les repos publics et prives)
   - **Ne coche rien d'autre** (pas de README, pas de .gitignore, pas de license — on a deja tout)
4. Clique sur **Create repository**.

## Etape 2 — Uploader les fichiers

1. Sur la page du repo qui vient d'apparaitre, clique sur **uploading an existing file** (lien bleu au milieu) ou va dans **Add file > Upload files**.
2. **Glisse-depose les fichiers et le dossier `api/`** :
   - `index.html`
   - `package.json`
   - `vercel.json`
   - `README.md`
   - le dossier `api/` (avec ses 3 fichiers : `states.js`, `tracks.js`, `auth.js`)
3. En bas, dans le champ "Commit changes" : tape `Initial commit` (ou ce que tu veux).
4. Clique sur **Commit changes**.

**Important** : verifie que le dossier `api/` est bien visible a la racine du repo avec ses 3 fichiers a l'interieur. C'est ce qui declenche les fonctions serverless de Vercel.

## Etape 3 — Creer un compte Vercel

1. Va sur https://vercel.com/signup
2. Choisis **Continue with GitHub** (c'est le plus simple).
3. Autorise Vercel a acceder a ton compte GitHub.
4. Pour le plan, choisis **Hobby** (gratuit).
5. Saisis ton prenom ou pseudo si demande.

## Etape 4 — Importer le repo dans Vercel

1. Une fois connecte, clique sur **Add New...** puis **Project**.
2. Tu vois la liste de tes repos GitHub. Trouve `flight-tracker-opensky` et clique sur **Import**.
3. Sur l'ecran de configuration :
   - **Project Name** : laisse celui propose
   - **Framework Preset** : **Other** (s'il n'est pas deja selectionne)
   - **Root Directory** : ne touche pas (.) 
   - **Build & Output Settings** : ne touche pas
4. **AVANT de cliquer Deploy**, deplie la section **Environment Variables**.

## Etape 5 — Ajouter les 3 variables d'environnement

Dans la section **Environment Variables**, ajoute 3 entrees :

| Name              | Value                                        |
|-------------------|----------------------------------------------|
| `OPENSKY_USER`    | ton username OpenSky                         |
| `OPENSKY_PASS`    | ton password OpenSky                         |
| `SITE_PASSWORD`   | un mot de passe au choix (pour acceder au site) |

Pour chacune :
1. Tape le **Name** dans le premier champ.
2. Tape la **Value** dans le deuxieme champ.
3. Clique **Add**.

Verifie bien que les 3 variables sont affichees dans la liste.

## Etape 6 — Deployer

1. Clique sur **Deploy** en bas.
2. Attends 30 a 60 secondes.
3. Quand tu vois "Congratulations" et un visuel de confettis, c'est en ligne.
4. Clique sur la preview ou sur **Visit** pour ouvrir ton site.

L'URL ressemble a : `https://flight-tracker-opensky-xxxxx.vercel.app`

## Etape 7 — Tester

1. Ton site demande le mot de passe d'acces : saisis ce que tu as mis dans `SITE_PASSWORD`.
2. Choisis une region (Moyen-Orient par defaut).
3. Choisis une plage de dates (par defaut : avant-hier).
4. Clique **Charger les vols**.
5. Si tout fonctionne, tu vois des traces apparaitre sur la carte.

---

# Que faire si ca ne marche pas

## Le mot de passe d'acces ne passe pas
- Verifie sur Vercel (Settings > Environment Variables) que `SITE_PASSWORD` est bien defini.
- Si tu modifies une variable d'env, il faut **redeployer** : va dans **Deployments**, clique sur les `...` du dernier deploiement, puis **Redeploy**.

## Erreur "HTTP 401" lors du chargement des vols
- Tes identifiants OpenSky sont probablement refuses. Verifie qu'ils marchent en te connectant a https://opensky-network.org/login.
- **Si ton compte est recent** (cree apres mi-2025) : OpenSky a bascule en OAuth2 et le Basic Auth ne marche plus. Tu dois :
  1. Aller dans ton profil OpenSky -> **API Clients** -> creer un client.
  2. Me dire que tu as un `client_id` et un `client_secret` et je modifierai le code pour utiliser OAuth2.

## Erreur "HTTP 429"
- Tu as atteint le quota OpenSky (400 req/jour). Reessaye demain. Le cache d'1h aide a eviter ca.

## Erreur "HTTP 500" ou page blanche
- Va dans Vercel > ton projet > **Logs** (ou **Functions**). Tu verras le detail de l'erreur.

## La carte n'apparait pas
- Ouvre la console du navigateur (F12) et regarde les erreurs.
- Souvent un probleme de chargement de Leaflet ou Google Fonts (rare).

---

# Limites connues

- **Quota** : 400 requetes/jour avec un compte authentifie. Le cache d'1h aide mais ne fait pas de miracle.
- **Historique** : OpenSky garde les traces detaillees ~30 jours. Plus ancien que ca = pas de donnees.
- **Tracks > 2h** : necessite imperativement un compte authentifie (le SITE le fait deja).
- **Plan Vercel Hobby** : fonctions serverless limitees a 100 GB-heures/mois. Largement suffisant pour usage perso.

# Pour aller plus loin (optionnel)

- **Mode comparaison** : afficher deux periodes cote-a-cote (comme The Economist).
- **Filtre par compagnie / pays d'origine** : filtre cote frontend.
- **Bbox dessinable** : utiliser Leaflet.Draw pour tracer la zone a la souris.
- **OAuth2 OpenSky** : si Basic Auth ne marche plus, basculer sur le nouveau systeme.

Demande-moi quand tu veux et on ajoute.
