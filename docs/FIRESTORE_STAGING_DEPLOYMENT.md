# TELIYA - Procedure de premier deploiement Firestore staging

Phase: 1.3.6

Cette procedure prepare le premier deploiement des regles et index Firestore vers le projet Firebase staging.

Aucun deploiement Firebase n'a ete execute pendant la Phase 1.3.6.

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
--project staging
```

## Deploiement des index

Commande future, non executee pendant cette phase:

```bash
npm run deploy:indexes:staging
```

Cette commande doit cibler explicitement:

```text
--project staging
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
--project staging
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
4. Redeployer explicitement vers staging avec `--project staging`.

Exemples futurs, non executes pendant cette phase:

```bash
npm run test:rules
npm run deploy:rules:staging
npm run deploy:indexes:staging
```

Ne jamais improviser un rollback par modification manuelle dans la console Firebase.

## Commandes dangereuses existantes

Des commandes historiques sans `--project` existent encore dans la documentation et dans `functions/package.json`.

Elles sont recensees dans:

```text
docs/FIREBASE_PROJECT_ALIASES.md
```

Elles ne sont pas corrigees pendant cette phase.
