# TELIYA - Connexion locale au projet Firebase Staging

Ce document explique comment connecter localement Teliya au projet Firebase staging `teliya-staging`.

Le fichier local a utiliser est:

```text
.env.staging.local
```

Ce fichier est ignore par Git et ne doit jamais etre committe.

## Recuperer la configuration Web Firebase

1. Ouvrir Firebase Console.
2. Aller dans le projet `teliya-staging`.
3. Ouvrir les parametres du projet.
4. Descendre jusqu'a la section `Vos applications`.
5. Choisir l'application Web `Teliya Staging Web`.
6. Copier uniquement les valeurs Web publiques.
7. Coller ces valeurs dans `.env.staging.local`.

Correspondance des champs:

```text
apiKey            -> VITE_FIREBASE_API_KEY
authDomain        -> VITE_FIREBASE_AUTH_DOMAIN
projectId         -> VITE_FIREBASE_PROJECT_ID
storageBucket     -> VITE_FIREBASE_STORAGE_BUCKET
messagingSenderId -> VITE_FIREBASE_MESSAGING_SENDER_ID
appId             -> VITE_FIREBASE_APP_ID
measurementId     -> VITE_FIREBASE_MEASUREMENT_ID
```

Ne jamais coller dans ce fichier:

- cle privee;
- compte de service;
- secret Admin SDK;
- token personnel;
- mot de passe.

## Lancer Teliya en mode staging

Commande:

```text
npm run dev:staging
```

Cette commande lance Vite avec:

```text
vite --mode staging
```

Vite charge alors les fichiers d'environnement du mode staging, notamment:

```text
.env
.env.local
.env.staging
.env.staging.local
```

## Verification attendue

Apres avoir renseigne `.env.staging.local`, verifier que l'application utilise:

```text
VITE_FIREBASE_PROJECT_ID=teliya-staging
```

Le staging doit rester separe de la production.

## Firebase Messaging Service Worker

Le fichier servi sur:

```text
/firebase-messaging-sw.js
```

est genere avant le demarrage ou le build.

Ce service worker fonctionne en dehors de l'application React. Il ne peut donc pas lire directement:

```text
import.meta.env
```

Le fichier source versionne est:

```text
public/firebase-messaging-sw.template.js
```

Le fichier genere est:

```text
public/firebase-messaging-sw.js
```

Il ne doit jamais etre modifie manuellement ni committe. Les scripts `dev`, `dev:staging`, `build` et `build:staging` regenerent le fichier avec les variables de l'environnement actif.

Le generateur utilise:

```text
scripts/generate-firebase-messaging-sw.mjs
```

Si une variable Firebase obligatoire manque, la generation s'arrete et le build ne doit pas continuer. Chaque build doit regenerer ce service worker pour eviter de conserver une ancienne configuration locale.

## Rappels importants

- `.env.staging.local` reste uniquement sur l'ordinateur local.
- Aucune vraie valeur Firebase ne doit etre ajoutee dans un fichier versionne.
- Aucun deploiement Firebase n'est effectue par cette procedure.
- Aucun compte utilisateur de test n'est cree par cette procedure.
