# TELIYA - Alias Firebase explicites

Phase: 1.3.5

## Projets Firebase

Production:

```text
monbillet-95b77
```

Staging:

```text
teliya-staging
```

## Alias locaux

```text
prod    -> monbillet-95b77
staging -> teliya-staging
```

## Pourquoi `default` est supprime

L'alias `default` est volontairement supprime de `.firebaserc`.

Un projet implicite peut provoquer un deploiement accidentel vers la production si une commande Firebase est executee sans cible explicite.

La regle de securite est donc simple: aucune commande Firebase critique ne doit dependre d'un projet par defaut.

## Regle obligatoire

Toute future commande Firebase de deploiement devra preciser explicitement l'environnement cible:

```text
--project staging
```

ou:

```text
--project prod
```

## Exemples futurs autorises

Ces exemples sont documentaires. Ils n'ont pas ete executes pendant cette phase.

```bash
firebase deploy --only firestore:rules --project staging
firebase deploy --only firestore:indexes --project staging
firebase deploy --only functions --project staging
```

## Exemples interdits

```bash
firebase deploy
firebase deploy --only firestore:rules
firebase deploy --only functions
```

## Production

Un deploiement vers `prod` exige au minimum:

- tests locaux reussis;
- validation staging reussie;
- commit Git identifie;
- validation humaine explicite.

## Acces valide hors Codex

L'utilisateur a confirme localement, depuis son terminal, l'acces au compte Firebase CLI:

```text
monbillet1000@gmail.com
```

La commande locale suivante a confirme les deux projets:

```bash
firebase projects:list
```

Projets confirmes:

```text
Production: monbillet-95b77
Project Number: 337289733382

Staging: teliya-staging
Project Number: 829946317608
```

Aucun token, mot de passe, compte de service ou secret n'est documente ici.

## Limitation de l'environnement Codex

Les commandes reseau Firebase echouent dans l'environnement Codex avec une erreur de certificat TLS:

```text
unable to verify the first certificate
```

Cette limitation concerne l'environnement Codex et n'invalide pas l'acces local confirme par l'utilisateur.

## Commandes dangereuses recensees

Les commandes ci-dessous contiennent `firebase deploy` sans `--project` ou documentent des formes de deploiement implicite. Elles sont recensees uniquement. Elles ne sont pas corrigees pendant cette phase.

```text
functions/package.json
  "deploy": "npm run build && firebase deploy --only functions"

docs/AGENCY_ACCOUNTANT_RUNTIME_DEBUG.md
  firebase deploy --only firestore:rules

docs/FLEET_ARCHITECTURE_FIXES_REPORT.md
  firebase deploy --only firestore:indexes

docs/FLEET_MIGRATION_PLAN.md
  firebase deploy --only firestore:indexes

docs/GIT_STABLE_SNAPSHOT_ROLLBACK.md
  mention de firebase deploy comme action a ne pas faire pendant le rollback

docs/PHASE6_TREASURY_INDEXES.md
  firebase deploy --only firestore:indexes

docs/PHASE_4.5_MIGRATION_NOTES.md
  firebase deploy --only firestore:rules

docs/RAPPORT_REFONTE_LEDGER_FINANCES.md
  firebase deploy --only firestore:rules

docs/ROUTES_AND_TRIP_CONFIG_IMPLEMENTATION.md
  firebase deploy --only firestore:indexes
```

## Aucun deploiement

Pendant cette intervention Codex:

- aucune commande Firebase n'a ete lancee;
- aucun deploiement Firebase n'a ete effectue;
- aucune donnee Firebase n'a ete modifiee;
- aucun utilisateur n'a ete cree;
- la production n'a pas ete modifiee.
