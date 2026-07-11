# TELIYA - Phase 1.3.3 - Configuration Firebase frontend

Date: 2026-07-11

Branche: `infra/phase-1.3.3-firebase-env-config`

## 1. Objectif

Externaliser la configuration Firebase frontend afin que l'application lise les parametres Firebase depuis les variables d'environnement Vite.

Cette phase prepare l'utilisation future de plusieurs environnements:

- Local avec Firebase Emulator Suite;
- Staging avec un futur projet Firebase separe;
- Production avec le projet existant.

## 2. Avant / Apres

Avant:

- la configuration Firebase frontend etait ecrite directement dans `src/firebaseConfig.ts`;
- le code connaissait directement les valeurs du projet Firebase production.

Apres:

- la configuration Firebase est fournie par l'environnement;
- aucune valeur Firebase de production n'est codee en dur dans les fichiers modifies;
- aucune bascule silencieuse vers un projet production n'est possible si une variable obligatoire manque.

## 3. Fichiers modifies

- `.env.example`
- `src/firebaseConfig.ts`
- `src/lib/firebaseClient.ts`
- `src/vite-env.d.ts`

## 4. Variables utilisees

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_RECAPTCHA_V3_KEY`
- `VITE_APPCHECK_DEBUG`
- `VITE_FIRESTORE_FORCE_LONG_POLLING`
- `VITE_USE_EMULATORS`
- `VITE_APP_VERSION`

## 5. Source unique Firebase

`src/firebaseConfig.ts` est la source principale d'initialisation Firebase frontend.

Il initialise et exporte:

- `app`;
- `db`;
- `auth`;
- `storage`;
- `functions`;
- `firebaseConfig`;
- `APP_VERSION`.

## 6. Etat de `src/lib/firebaseClient.ts`

`src/lib/firebaseClient.ts` est conserve car il est encore importe par le code existant.

Il ne lance plus de seconde initialisation Firebase independante.

Il reutilise l'application principale exportee par `src/firebaseConfig.ts`.

## 7. Emulateurs

Les emulateurs restent conditionnes par:

```text
VITE_USE_EMULATORS=true
```

Ils ne peuvent s'activer que sur:

```text
localhost
127.0.0.1
```

Ports conserves:

- Auth: `9099`;
- Firestore: `8080`;
- Functions: `5001`;
- Storage: `9199`.

Une protection HMR evite les doubles connexions aux emulateurs pendant les rechargements Vite.

## 8. Gardes de securite

Variables obligatoires:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Si une variable obligatoire manque, l'initialisation s'arrete avec une erreur explicite listant les variables manquantes.

Garanties:

- aucun fallback production code en dur;
- aucune reference directe au projet production dans les fichiers modifies;
- l'utilisation des emulateurs exige un projet logique local;
- le futur projet staging ne peut pas etre combine avec `VITE_USE_EMULATORS=true`.

## 9. Tests

Commande executee:

```text
npm run test:run
```

Resultat:

```text
4 fichiers de tests reussis
18 tests reussis
0 echec
Code de sortie: 0
```

Note:

Le premier lancement dans le sandbox a echoue avant execution des tests avec une erreur d'acces Vitest/esbuild. La meme commande a ete relancee hors sandbox et a reussi.

## 10. Build

Commande executee:

```text
npm run build
```

Resultat:

```text
Build reussi
Code de sortie: 0
```

Warning non bloquant:

```text
Some chunks are larger than 1500 kB after minification.
```

Ce warning existait deja comme point de vigilance de bundling et ne bloque pas cette phase.

## 11. Firebase distant

Pendant cette phase:

- aucune commande Firebase n'a ete executee;
- aucun projet Firebase n'a ete cree;
- aucun deploiement Firebase n'a ete effectue;
- aucune donnee distante n'a ete modifiee;
- aucune configuration Firebase distante n'a ete modifiee.
