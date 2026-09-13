# AMICAL LABS — SaaS vidéo IA V1

Cette base conserve le frontend AMICAL LABS et ajoute un backend Node.js pour préparer le flux SaaS vidéo asynchrone. Elle ne contient aucune donnée utilisateur, clé API ou mot de passe.

## Déploiement hPanel
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install` (ou `npm ci` si un package-lock.json est ajouté)
- Start command: `npm start`
- Node.js: 18.18+ (ou une version LTS compatible disponible dans hPanel)

## Variables serveur
Configurer dans hPanel, jamais dans le frontend :
`BYTEPLUS_API_KEY`, `BYTEPLUS_BASE_URL`, `BYTEPLUS_OPERATOR_ID`, `BYTEPLUS_OPERATOR_VERSION`, `BYTEPLUS_MODEL`.

Ne jamais utiliser `VITE_BYTEPLUS_API_KEY`.

L’identité utilisateur doit venir du système d’authentification existant via `req.user.id`, `req.auth.userId` ou `req.session.user.id`. Pour un proxy d’authentification qui transmet un identifiant vérifié, activer explicitement `AMICAL_TRUSTED_USER_HEADER=true` et transmettre `x-amical-user-id`. Ne jamais activer cette option sans proxy de confiance. En développement uniquement, `AMICAL_DEV_USER_ID` peut fournir une identité de test.

Le stockage local par défaut est `.data/amical-store.json`. Il est additif, atomique et ignoré par Git. En production, définir `AMICAL_DATA_FILE` vers le stockage persistant prévu par Hostinger ou remplacer l’adaptateur par la base existante sans supprimer les données actuelles.

## API préparée
- `GET /api/health`
- `GET /api/session`
- `GET /api/credits`
- `GET /api/video/history`
- `POST /api/video/generate`
- `GET /api/video/generation/:taskId`
- `POST /api/video/replace-character` (compatibilité avec l’intégration existante)

Le backend appelle BytePlus LAS `las_video_edit_enhance` avec le modèle configuré (Seedance par défaut). Le mode Character Reference conserve le template `replace/person_replace`. Le navigateur ne reçoit jamais la clé BytePlus.

Le flux de génération est : validation de l’identité et du prompt → réservation atomique des crédits → création BytePlus → conservation du `task_id` → polling propriétaire → enregistrement de l’URL finale. Un échec rembourse une réservation au maximum une fois.

## Données actuelles
Ce ZIP ne remplace pas une base de données et ne contient aucun mécanisme de reset/migration destructive. Lors de l'intégration au projet Hostinger existant, conserver les comptes, crédits, personnages, vidéos et historiques existants et brancher l’adaptateur `backend/store.js` sur les collections actuelles.

Sans système d’authentification attaché et sans `BYTEPLUS_API_KEY`, l’interface reste consultable mais les routes protégées et la génération réelle refusent proprement la requête. Aucune génération n’est simulée.
