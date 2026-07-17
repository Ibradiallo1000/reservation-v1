# Teliya — Guide de sécurité des environnements

## Environnements reconnus

| Environnement | Projet Firebase | Usage |
|---|---|---|
| émulateurs | `demo-teliya-local` | développement local sans cloud |
| staging | `teliya-staging` | validation cloud avant production |
| production | `monbillet-95b77` | utilisateurs et données réelles |

La source des alias est `.firebaserc`. Aucun projet `default` n’est utilisé. Toute commande Firebase de déploiement doit fournir explicitement `--project staging` ou `--project prod`.

## Garde production

`src/config/environmentSafety.ts` s’exécute avant `initializeApp`. La combinaison `localhost + monbillet-95b77` est bloquée par défaut et Firebase n’est pas initialisé. Le message indique le projet fautif et les alternatives.

La dérogation `VITE_ALLOW_PRODUCTION_FROM_LOCAL=true` est réservée à une intervention exceptionnelle, volontaire et temporaire. Sa valeur normale est `false`; elle ne doit jamais être versionnée à `true`.

## Variables minimales

Les variables `VITE_FIREBASE_*` sont obligatoires. `VITE_USE_EMULATORS` et `VITE_ALLOW_PRODUCTION_FROM_LOCAL` valent `false` par défaut. App Check, long polling et version applicative restent optionnels. Les fichiers contenant des valeurs réelles sont `*.local` et ignorés par Git.

## Commandes sûres

- `npm run dev` : mode développement; bloqué si le fichier local cible prod.
- `npm run dev:staging` : charge `.env.staging.local`, exige `teliya-staging` pour le messaging worker.
- `npm run dev:emulators` : charge `.env.emulators.local`; exige `demo-teliya-local` et connecte les émulateurs.
- `npm run build:staging` : build staging sans déploiement.
- `npm run build:prod` : build production sans déploiement.
- `npm run deploy:staging` : déploiement explicite vers l’alias staging.
- `npm run deploy:prod` : déploiement explicite vers l’alias prod.

Copier `.env.emulators.example` vers `.env.emulators.local` avant le mode émulateur. Ne jamais utiliser un projectId cloud avec `VITE_USE_EMULATORS=true`.

## Indicateur global

Développement et staging affichent en bas à droite l’environnement, le projectId et `cloud`/`émulateurs`. La production ne rend aucun indicateur.

## Vérification avant déploiement

1. Worktree et branche attendus.
2. Projet/alias explicite et variables du bon environnement.
3. `npm run typecheck`, `npm test`, `npm run build:staging` et tests Rules requis.
4. Validation sur staging, y compris Auth, Rules, index et workflows critiques.
5. Relecture du diff et plan de rollback par commit/tag.
6. Approbation humaine avant `deploy:prod`.

## Procédure d’urgence

Arrêter le serveur, supprimer la dérogation locale, vérifier `.env*.local`, contrôler le projectId affiché, révoquer tout credential suspect et documenter l’incident. Ne jamais corriger une donnée ou redéployer Rules/index sans audit séparé.

## Netlify et CI

Les variables Netlify/GitHub doivent être définies par contexte. Les builds ne doivent pas contenir de fichier `.env*.local`. Cette phase ne modifie ni ne déploie la configuration distante.
