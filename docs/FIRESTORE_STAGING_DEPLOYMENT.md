# TELIYA - Procedure de premier deploiement Firestore staging

Phase: 1.3.6

Cette procedure prepare le premier deploiement des regles et index Firestore vers le projet Firebase staging.

Aucun deploiement Firebase n'a ete execute pendant la Phase 1.3.6.

## Cloture Phase 1.3.8

Le deploiement des regles Firestore est confirme sur le projet staging `teliya-staging`.

Le deploiement des index Firestore est confirme sur le projet staging `teliya-staging`.

Le nettoyage des index a supprime 6 faux index composites a champ unique et le doublon exact `tripAssignments`.

Total final: 112 index.

La production `monbillet-95b77` n'a pas ete touchee pendant cette phase.

Les warnings Firestore Rules restants seront traites dans une phase separee.

Validation code: `npm run build` reussi et `npm run test:run` reussi avec 121 tests.

Validation Rules locale: `npm run test:rules` differe uniquement parce que Firebase CLI 15.24.0 exige Java 21 alors que l'environnement local utilise Java 17.

La mise a niveau Java 21 sera traitee dans une phase dediee d'outillage.

## Cloture Phase 1.3.10

Isolation staging avant deploiement applicatif:

- scripts Firebase staging verrouilles sur `--project teliya-staging`;
- suppression des deploys Functions sans projet explicite;
- build staging force via `npm run build:staging`;
- `npm run build:staging` nettoie `dist`, exige `.env.staging.local` et refuse tout projectId different de `teliya-staging`;
- service worker Firebase Messaging genere depuis les variables staging;
- Functions frontend initialisees sur la region `europe-west1`;
- scripts admin locaux refuses si le compte de service pointe vers `monbillet-95b77`;
- tests Firestore Rules alignes sur le projet emule `demo-teliya-local`;
- bundle `dist` verifie sans reference `monbillet-95b77`, `monbillet-95b77.web.app`, `monbillet-95b77.appspot.com`, `monbillet-95b77.firebaseapp.com` ou `monbillet-95b77.firebasestorage.app`.

Validations Phase 1.3.10:

- `npm run typecheck` reussi;
- `npm --prefix functions run build` reussi;
- `npm run test:run` reussi avec 24 fichiers et 121 tests;
- `npm run test:rules` reussi avec 9 suites Rules;
- `npm run build:staging` reussi;
- aucune commande Firebase distante executee;
- aucun deploiement Firebase ou Netlify execute;
- production `monbillet-95b77` non touchee.

## Environnement cible

```text
Alias Firebase: staging
Projet Firebase: teliya-staging
```

La production reste:

```text
Alias Firebase: prod
Projet Firebase: monbillet-95b77
```

## Avant le deploiement

Executer localement:

```bash
git status --short --branch
npm run test:rules
npm run test:run
npm run build:staging
```

Le workspace doit etre propre ou contenir uniquement les changements explicitement valides pour la phase de deploiement.

Les tests Rules Emulator doivent reussir avant toute commande de deploiement.

## Deploiement des regles

Commande future, non executee pendant cette phase:

```bash
npm run deploy:rules:staging
```

Cette commande doit cibler explicitement:

```text
--project teliya-staging
```

## Deploiement des index

Commande future, non executee pendant cette phase:

```bash
npm run deploy:indexes:staging
```

Cette commande doit cibler explicitement:

```text
--project teliya-staging
```

## Ordre recommande

1. Tests Rules Emulator
2. Tests applicatifs
3. Build staging
4. Deploiement des regles staging
5. Verification
6. Deploiement des index staging
7. Verification

## Verifications apres deploiement staging

Apres le deploiement des regles:

- verifier que l'application staging peut lire les donnees attendues;
- verifier que les ecritures interdites restent bloquees;
- verifier les workflows critiques avec des donnees fictives uniquement;
- verifier qu'aucune commande ne cible `prod`.

Apres le deploiement des index:

- verifier que les requetes staging attendues ne retournent plus d'erreur d'index manquant;
- attendre la construction des index si Firebase indique un etat en cours;
- documenter le commit Git deploye.

## Interdictions

Ne jamais utiliser:

```bash
firebase deploy
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Toute commande de deploiement doit contenir explicitement:

```text
--project teliya-staging
```

ou, dans une phase production separee et validee:

```text
--project prod
```

## Production

Aucun deploiement production n'est autorise pendant la Phase 1.3.6.

Un deploiement vers `prod` devra faire l'objet d'une phase separee avec:

- tests locaux reussis;
- validation staging reussie;
- commit Git identifie;
- validation humaine explicite;
- procedure de rollback connue.

## Rollback staging

Le rollback doit utiliser un commit Git identifie.

Principe:

1. Identifier le commit stable a restaurer.
2. Revenir au contenu versionne de `firestore.rules` et/ou `firestore.indexes.json`.
3. Relancer les tests Rules Emulator.
4. Redeployer explicitement vers staging avec `--project teliya-staging`.

Exemples futurs, non executes pendant cette phase:

```bash
npm run test:rules
npm run deploy:rules:staging
npm run deploy:indexes:staging
```

Ne jamais improviser un rollback par modification manuelle dans la console Firebase.

## Commandes dangereuses existantes

Des commandes historiques sans `--project` peuvent encore exister dans de vieux documents techniques non executables.

Elles sont recensees dans:

```text
docs/FIREBASE_PROJECT_ALIASES.md
```

Les scripts actifs staging doivent utiliser `--project teliya-staging`.
