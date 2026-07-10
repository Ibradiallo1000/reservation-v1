# TELIYA - PHASE 0 - Audit d'infrastructure

Date d'audit: 2026-07-10  
Objectif: documenter l'etat actuel de l'infrastructure sans modifier les fonctionnalites, Firestore, React, les regles de production, les index ou les donnees.

## 0. Perimetre et garanties

Documents lus integralement avant audit:

- `docs/ACCOUNTING_SAFETY_PROTOCOL.md`
- `docs/KNOWN_BUGS_AND_FIXES.md`

Contraintes appliquees:

- aucune modification metier;
- aucune modification de collection ou donnee Firestore;
- aucune modification de `firestore.rules`;
- aucune modification de `firestore.indexes.json`;
- aucune modification de Cloud Function metier;
- aucune modification React ou UI;
- creation uniquement du present document d'audit.

Commandes executees en lecture:

- `git status --short --branch`
- `git status --porcelain=v1 -uall`
- `git log --oneline --decorate -n 20`
- `git branch -a -vv`
- `git remote -v`
- `git config --list --show-origin`
- `git ls-files ...`
- `firebase --version`
- `firebase use --json`
- lectures des fichiers de configuration demandes

## 1. Etat actuel

### 1.1 Audit Git

Branche actuelle:

- branche locale: `main`
- suivi distant: `origin/main`
- HEAD: `7ed12e2198ec86c6e1b1dd7064767f9a210442d6`
- dernier commit: `correction de validation de session caisse par le comptable agence`
- etat: `main...origin/main`, sans avance ni retard visible

Etat du depot:

- `git status --porcelain=v1 -uall`: aucun fichier modifie ou non suivi au moment de l'audit, avant creation de ce rapport.
- Aucun conflit Git detecte par l'etat courant.

Branches locales observees:

- `main`
- `audit/agent-courrier`
- `backup-main-before-rollback`
- `legacy-6d489ac`
- `recuperation-courrier-propre`
- `restore-6d489ac`
- `rollback-stable-7-avril`
- `sauvegarde-debug-finances`

Branches distantes observees:

- `origin/main`
- `origin/audit/agent-courrier`

Tags observes:

- `stable-courrier-v1`
- `stable-billetterie-comptable-e97ed199`

Remote:

- `origin`: `https://github.com/Ibradiallo1000/reservation-v1.git`

Configuration Git notable:

- `core.autocrlf=true`
- `pull.rebase=false`
- `init.defaultbranch=master`
- branche principale reelle du repo: `main`
- `core.ignorecase=true`

Qualite de l'historique:

- Historique lineaire recent sur `main`, sans merge visible dans les 20 derniers commits.
- Des branches de rollback/sauvegarde existent, mais la strategie de branches n'est pas formalisee.
- Plusieurs commits portent des messages fonctionnels courts; utiles pour contexte humain, mais pas toujours normalises.
- Risque de confusion entre branches de sauvegarde, rollback, audit et branche stable actuelle.

Elements suivis par Git qui devraient etre audites en Phase 1:

- `.env`
- `.env.local`
- `dist/` avec 286 fichiers suivis
- `dev-dist/` avec 4 fichiers suivis
- `playwright-report/index.html`
- `test-results/.last-run.json`
- `firestore-debug.log`

Ces fichiers sont deja suivis par Git; les ajouter a `.gitignore` ne suffira pas a les sortir de l'historique ou de l'index.

### 1.2 Audit Firebase

Projet Firebase actuellement utilise:

- projet par defaut dans `.firebaserc`: `monbillet-95b77`
- projet actif Firebase CLI lu par `firebase use --json`: `monbillet-95b77`
- version Firebase CLI locale: `14.25.0`

Contenu complet de `.firebaserc`:

```json
{
  "projects": {
    "default": "monbillet-95b77"
  }
}
```

Aliases existants:

- `default` uniquement.
- Aucun alias explicite `prod`, `staging`, `dev` ou `emulator`.

Strategie actuelle de deploiement:

- `firebase.json` configure Firestore rules, Storage rules, Functions et emulators.
- Le projet pointe directement vers `monbillet-95b77` via alias `default`.
- Les commandes documentees ou presentes dans le repo incluent:
  - `firebase deploy --only firestore:rules`
  - `firebase deploy --only firestore:rules --project monbillet-95b77`
  - `firebase deploy --only firestore:indexes`
  - `firebase deploy --only functions`
  - `firebase emulators:exec --only firestore "..."`
- Il n'y a pas de script racine standardise `deploy:rules`, `deploy:indexes`, `deploy:functions`, `deploy:hosting` ou `deploy:prod`.

### 1.3 Audit Firestore

Fichiers presents:

- `firestore.rules`: present a la racine, taille importante, fichier critique.
- `firestore.indexes.json`: present a la racine.

Emplacement reel des regles:

- `firebase.json` reference `firestore.rules`:

```json
"firestore": {
  "rules": "firestore.rules"
}
```

Point critique:

- `firestore.indexes.json` existe mais n'est pas reference dans `firebase.json`.
- Le bloc attendu devrait declarer explicitement les index pour un deploiement reproductible.
- Etat actuel: les regles sont integrees a la config Firebase, les index existent localement mais leur deploiement n'est pas solidement rattache a la configuration Firebase racine.

Methode actuelle de gestion des regles:

- Regles versionnees dans `firestore.rules`.
- Tests Rules Emulator presents dans `tests/firestore`.
- Plusieurs incidents documentes autour des limites d'evaluation Firestore Rules (`maximum of 1000 expressions reached`).
- Le protocole comptable impose de ne jamais ouvrir globalement les droits et de tester les commits complets.

Niveau de versionnement:

- `firestore.rules` et `firestore.indexes.json` sont suivis par Git.
- Les rules sont auditees et documentees dans `docs/KNOWN_BUGS_AND_FIXES.md`.
- Les index sont versionnes mais pas attaches a `firebase.json`, ce qui reduit la reproductibilite.

### 1.4 Audit des environnements

Fichiers `.env*` presents:

- `.env`
- `.env.example`
- `.env.local`

Fichiers absents:

- `.env.production`
- `.env.development`
- autre fichier `.env*` non observe.

Etat Git:

- `.env` est suivi par Git.
- `.env.local` est suivi par Git.
- `.env.example` est suivi par Git.
- `.gitignore` contient `.env`, mais trop tard pour les fichiers deja suivis.
- `.gitignore` ne contient pas explicitement `.env.local`, `.env.production`, `.env.development`.

Variables Firebase dans `.env`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN=monbillet-95b77.firebaseapp.com`
- `VITE_FIREBASE_PROJECT_ID=monbillet-95b77`
- `VITE_FIREBASE_STORAGE_BUCKET=monbillet-95b77.firebasestorage.app`
- `VITE_FIREBASE_MESSAGING_SENDER_ID=337289733382`
- `VITE_FIREBASE_APP_ID`

Variables locales:

- `.env.local`: `VITE_USE_EMULATORS=false`
- `.env.local`: `VITE_APPCHECK_DEBUG=true`

Variables Firebase codees directement dans `src/firebaseConfig.ts`:

- `apiKey`
- `authDomain`: `monbillet-95b77.firebaseapp.com`
- `projectId`: `monbillet-95b77`
- `storageBucket`: `monbillet-95b77.appspot.com`
- `messagingSenderId`: `337289733382`
- `appId`
- `measurementId`: `G-G96GYRYS76`

Constat important:

- `src/firebaseConfig.ts` n'utilise pas les variables `VITE_FIREBASE_*` pour construire la config Firebase principale.
- Les valeurs `.env` et `src/firebaseConfig.ts` divergent sur `storageBucket`:
  - `.env`: `monbillet-95b77.firebasestorage.app`
  - `src/firebaseConfig.ts`: `monbillet-95b77.appspot.com`
- `src/lib/firebaseClient.ts` contient une seconde initialisation Firebase basee sur `NEXT_PUBLIC_FIREBASE_*`, ce qui ne correspond pas au mode Vite actuel. Ce fichier semble secondaire, mais il doit etre confirme avant toute suppression ou refactor.

### 1.5 Audit Firebase Emulator Suite

Configuration dans `firebase.json`:

```json
"emulators": {
  "auth": {
    "port": 9099
  },
  "functions": {
    "port": 5001
  },
  "firestore": {
    "port": 8080
  },
  "storage": {
    "port": 9199
  },
  "ui": {
    "enabled": true
  },
  "singleProjectMode": true
}
```

Etat par emulateur:

- Firestore Emulator: configure, port `8080`.
- Auth Emulator: configure, port `9099`.
- Functions Emulator: configure, port `5001`.
- Storage Emulator: configure, port `9199`.
- Emulator UI: active.

Connexion frontend:

- `src/firebaseConfig.ts` connecte Firestore, Auth, Storage et Functions aux emulateurs si:
  - `VITE_USE_EMULATORS === "true"`;
  - le hostname est `localhost` ou `127.0.0.1`.
- `.env.local` force actuellement `VITE_USE_EMULATORS=false`.
- Donc, par defaut local actuel, l'application utilise le cloud, pas les emulateurs.

Risques actuels:

- Developpement local potentiellement connecte au projet cloud par defaut.
- Un seul alias Firebase `default` pointe vers le projet reel.
- Les tests rules utilisent l'emulateur, mais l'application locale n'est pas basculee dessus par defaut.
- Pas de separation claire `dev/staging/prod`.

### 1.6 Audit des tests

Vitest:

- present dans `package.json`.
- script racine:
  - `test:unit`: `vitest run`
  - `test:run`: `vitest run`
- config: `vitest.config.ts`
- environnement: `node`
- inclus:
  - `src/modules/**/*.test.ts`
  - `src/tests/**/*.test.ts`
- exclus:
  - `**/e2e/**`

Tests unitaires observes:

- `src/tests/reservation.test.ts`
- `src/tests/operationQuota.test.ts`
- `src/modules/agence/services/reservationStatutService.test.ts`
- `src/modules/compagnie/fleet/vehicleTripSync.test.ts`

Jest:

- aucune configuration Jest principale observee dans `package.json`.
- aucun script Jest detecte.

Firebase Rules Testing:

- dependance presente: `@firebase/rules-unit-testing`.
- tests presents:
  - `tests/firestore/agencyBankDepositDirect.rules.test.cjs`
  - `tests/firestore/agencyExpenseDirect.rules.test.cjs`
  - `tests/firestore/agencyManagerCashAccount.rules.test.cjs`
  - `tests/firestore/agencySessionAccountantValidation.rules.test.cjs`
  - `tests/firestore/operatorDigitalOnlineMobileMoney.rules.test.cjs`

Scripts rules:

- script racine unique:
  - `test:rules:agency-expense`: `firebase emulators:exec --only firestore "node tests/firestore/agencyExpenseDirect.rules.test.cjs"`

Constat:

- Plusieurs tests Firestore critiques existent mais ne sont pas tous exposes par des scripts npm dedies.
- La CI ne lance pas explicitement les tests Firestore Rules Emulator.

Tests Auth:

- Tests applicatifs nommes `auth.e2e.test.ts` exclus par la config Vitest actuelle car situes dans `src/tests/e2e`.
- Pas de test Rules/Auth Emulator dedie observe pour custom claims ou isolation des roles.

Playwright:

- configuration presente: `playwright.config.ts`.
- tests presents dans `tests/playwright`.
- `package.json` ne contient pas de script `test:e2e` ou `playwright`.
- `playwright.config.ts` indique `baseURL` par defaut `http://localhost:5190`.
- commentaire interne mentionne un port Vite actuel `5192`, mais l'URL configuree reste `5190`.

CI/CD:

- GitHub Actions present: `.github/workflows/ci.yml`.
- Declencheurs: push et pull_request sur `main` et `master`.
- Etapes:
  - `npm ci`
  - `npm run test:run`
  - `npm run build`
- Node CI: `20`.
- Build local racine utilise TypeScript et Vite.

Limites CI:

- pas de test Rules Emulator dans CI;
- pas de test Playwright dans CI;
- pas de build `functions` dans CI;
- pas de validation `firebase.json` / `.firebaserc`;
- pas de garde contre deploiement accidentel;
- secrets Firebase partiellement prevus pour le build, mais la config runtime principale est codee en dur dans `src/firebaseConfig.ts`.

### 1.7 Audit du deploiement

Scripts racine `package.json`:

- `dev`: `vite`
- `build`: `npm run clean && tsc && vite build`
- `preview`: `vite preview`
- `test:unit`: `vitest run`
- `test:run`: `vitest run`
- `test:rules:agency-expense`: `firebase emulators:exec --only firestore "node tests/firestore/agencyExpenseDirect.rules.test.cjs"`

Scripts Functions:

- `functions/package.json`
- `build`: `tsc`
- `deploy`: `npm run build && firebase deploy --only functions`

Predeploy Functions dans `firebase.json`:

- `npm --prefix "$RESOURCE_DIR" run build`

Commandes de deploiement observees dans la documentation:

- `firebase deploy --only firestore:rules`
- `firebase deploy --only firestore:rules --project monbillet-95b77`
- `firebase deploy --only firestore:rules --project monbillet-95b77 --debug`
- `firebase deploy --only firestore:indexes`
- `firebase deploy --only functions`

Risques de deploiement:

- projet `default` pointe directement vers `monbillet-95b77`;
- pas d'alias `staging` ou `dev`;
- pas de script npm standardise avec confirmation;
- `firestore.indexes.json` non reference dans `firebase.json`;
- les rules peuvent etre deployees sans execution systematique de toute la suite Rules Emulator;
- la CI ne valide pas les Functions;
- la CI ne valide pas les rules;
- risque d'executer localement l'application contre le cloud si `.env.local` garde `VITE_USE_EMULATORS=false`.

### 1.8 Audit Functions

Configuration:

- source Functions: `functions`
- codebase: `default`
- main: `functions/package.json` -> `lib/index.js`
- runtime declare: Node `18`

Fichiers observes:

- `functions/src/index.ts`: source TypeScript principale, volumineuse, avec callables, triggers et scheduled functions.
- `functions/lib/index.js`: sortie compilee.
- `functions/index.js`: ancien fichier CommonJS a la racine du dossier functions, non reference par `functions/package.json`.

Risque:

- `functions/index.js` peut induire en erreur lors d'un audit ou d'une intervention, car le main reel est `lib/index.js`.
- Plusieurs fonctions peuvent ecrire dans Auth, Firestore et Storage. Aucune modification ne doit etre faite sans audit metier cible.

## 2. Risques

### Critique

1. Environnement local connecte au cloud par defaut

- `.env.local` contient `VITE_USE_EMULATORS=false`.
- `src/firebaseConfig.ts` n'utilise les emulateurs que si cette variable vaut `true` et si l'app tourne sur localhost.
- Risque: tests manuels ou developpements locaux peuvent lire/ecrire dans `monbillet-95b77`.

2. Absence de separation Firebase `prod/staging/dev`

- `.firebaserc` ne contient que `default`.
- `default` pointe vers `monbillet-95b77`.
- Risque: commandes de deploiement ou tests manuels diriges vers le projet reel.

3. Fichiers `.env` et `.env.local` suivis par Git

- `.env` et `.env.local` sont versionnes.
- `.gitignore` contient `.env`, mais le fichier est deja suivi.
- Risque: fuite de configuration, confusion entre environnement local et production, mauvaise hygiene de secrets.

### Eleve

4. `firestore.indexes.json` present mais non reference dans `firebase.json`

- Le fichier existe et est versionne.
- Le deploiement des index n'est pas attache explicitement a la config Firebase.
- Risque: environnement non reproductible et erreurs d'index en production.

5. Tests Firestore Rules non integres a la CI

- Les tests existent, mais la CI lance seulement `npm run test:run`.
- Risque: regression rules non detectee avant merge sur `main`.

6. Absence de script de deploiement securise

- Les commandes directes `firebase deploy --only ...` sont documentees.
- Pas de wrapper npm avec projet explicite, prechecks et ordre standard.
- Risque: deploiement incomplet ou vers mauvais projet.

7. Build artifacts et rapports suivis par Git

- `dist/`, `dev-dist/`, `playwright-report`, `test-results`, `firestore-debug.log` sont suivis.
- Risque: historique lourd, diffs parasites, snapshots moins propres, confusion entre source et artefacts.

8. Config Firebase hardcodee dans `src/firebaseConfig.ts`

- Les variables `VITE_FIREBASE_*` existent mais ne pilotent pas la config principale.
- Risque: impossibilite pratique de separer dev/staging/prod par environnement sans modifier le code.

### Moyen

9. Divergence `storageBucket`

- `.env`: `monbillet-95b77.firebasestorage.app`
- `src/firebaseConfig.ts`: `monbillet-95b77.appspot.com`
- Risque: confusion de configuration Storage et diagnostics difficiles.

10. Fonctions non validees par CI

- `functions/package.json` a un script `build`.
- La CI racine ne lance pas `npm --prefix functions ci` ni `npm --prefix functions run build`.
- Risque: regression Functions non detectee avant deploiement.

11. Playwright configure mais non expose par script npm

- Tests Playwright presents.
- Pas de script racine `test:e2e`.
- Risque: tests E2E non executes regulierement.

12. Port Playwright ambigu

- `baseURL`: `http://localhost:5190`
- commentaire: port Vite actuel `5192`
- Risque: faux negatif E2E ou serveur local incorrect.

13. `functions/index.js` ancien non reference

- Main reel: `lib/index.js`
- Ancien fichier racine: `functions/index.js`
- Risque: intervention sur le mauvais fichier.

### Faible

14. `init.defaultbranch=master` dans Git global

- Repo actuel utilise `main`.
- Risque faible mais peut creer des depots futurs incoherents.

15. Messages de commits non uniformes

- Historique comprehensible, mais pas de convention stricte.
- Risque faible pour audit, moyen si equipe plus large.

16. `.env.example` correct mais incomplet pour environnements

- Bon squelette, mais pas de profils `.env.development.example`, `.env.production.example`.
- Risque faible tant qu'une seule personne opere le projet.

## 3. Strategie Git professionnelle proposee

Aucune branche n'a ete creee pendant cette Phase 0.

### Branche Production

Nom recommande: `main`

Role:

- represente l'etat deployable stable;
- recoit uniquement des merges valides;
- chaque deploiement production doit pointer vers un commit identifie de `main`;
- les tags de snapshot stable doivent etre poses sur cette branche.

Regles recommandees:

- protection de branche;
- pull request obligatoire;
- CI obligatoire avant merge;
- interdiction des commits directs sauf urgence explicitement documentee.

### Branche Develop

Nom recommande: `develop`

Role:

- integration controlee des travaux valides avant promotion vers `main`;
- espace de stabilisation avant release;
- ne doit pas etre connectee directement au projet Firebase production.

Regles recommandees:

- CI obligatoire;
- tests rules obligatoires pour tout changement `firestore.rules` ou tests Firestore;
- build Functions obligatoire si `functions/**` change.

### Branche Infrastructure

Nom recommande: `infra/phase-1-hardening` ou `infra/<sujet>`

Role:

- isoler les changements purement infrastructurels;
- exemples: `.firebaserc`, `firebase.json`, scripts npm, CI, `.gitignore`, templates `.env`, documentation de deploiement;
- aucune modification metier dans cette branche.

Regles recommandees:

- revue stricte des fichiers modifies;
- diff limite aux fichiers d'infrastructure;
- tests de non-regression: build, unit, rules emulator, functions build selon perimetre.

### Branche Feature

Nom recommande: `feature/<module>-<objectif>`

Role:

- developpement metier cible;
- une branche par fonctionnalite ou correction;
- aucune modification d'infrastructure transverse sauf necessite explicite.

Regles recommandees:

- partir de `develop` ou de la branche de release convenue;
- PR courte;
- tests lies au module.

## 4. Strategie de sauvegarde de l'etat actuel

Aucune sauvegarde, branche ou tag n'a ete cree pendant cette Phase 0.

Strategie recommandee pour creer un Snapshot Stable:

1. Verifier l'etat propre du depot:

```bash
git status --short --branch
```

2. Identifier le commit exact:

```bash
git rev-parse HEAD
```

Commit actuel audite:

```text
7ed12e2198ec86c6e1b1dd7064767f9a210442d6
```

3. Creer un tag annote apres validation humaine:

```bash
git tag -a stable-phase0-2026-07-10 7ed12e2198ec86c6e1b1dd7064767f9a210442d6 -m "Stable snapshot before infrastructure Phase 1"
```

4. Pousser le tag apres validation humaine:

```bash
git push origin stable-phase0-2026-07-10
```

5. Pour revenir exactement a cette version:

```bash
git checkout stable-phase0-2026-07-10
```

ou, pour creer une branche de restauration sans toucher `main`:

```bash
git checkout -b restore/stable-phase0-2026-07-10 stable-phase0-2026-07-10
```

6. Conserver un artefact de reference:

- hash du commit;
- tag;
- resultat CI;
- version Firebase CLI;
- contenu de `.firebaserc`;
- contenu de `firebase.json`;
- liste des tests executes.

## 5. Recommandations Phase 1 uniquement

Ces recommandations ne doivent pas etre implementees en Phase 0.

### Priorite 1 - Securiser les environnements

1. Introduire une separation explicite Firebase:

- `.firebaserc` avec aliases `prod`, `staging`, `dev` si les projets existent;
- ne plus utiliser `default` seul pour les operations critiques;
- documenter quel alias peut deployer quoi.

2. Externaliser la config Firebase frontend:

- remplacer progressivement les valeurs hardcodees de `src/firebaseConfig.ts` par `import.meta.env.VITE_FIREBASE_*`;
- garder un fallback bloquant clair si une variable obligatoire manque;
- ne pas modifier le comportement metier.

3. Corriger l'hygiene `.env`:

- sortir `.env` et `.env.local` de l'index Git apres validation;
- conserver `.env.example`;
- ajouter `.env.local`, `.env.development`, `.env.production` et variantes locales au `.gitignore`;
- ne pas supprimer les fichiers locaux.

### Priorite 2 - Rendre les deploiements reproductibles

4. Referencer `firestore.indexes.json` dans `firebase.json`.

5. Ajouter des scripts npm explicites:

- `test:rules`
- `test:rules:agency-session`
- `test:rules:agency-bank-deposit`
- `test:rules:online-mobile-money`
- `functions:build`
- `deploy:rules:prod`
- `deploy:indexes:prod`

Chaque script de deploiement doit inclure le projet explicite et etre documente.

6. Creer une procedure de deploiement:

- ordre des validations;
- tests obligatoires;
- commande exacte;
- verification post-deploiement;
- rollback par tag.

### Priorite 3 - Renforcer CI/CD

7. Etendre GitHub Actions:

- `npm ci`
- `npm run test:run`
- suite Firestore Rules Emulator complete;
- `npm run build`
- `npm --prefix functions ci`
- `npm --prefix functions run build`

8. Ajouter des conditions par chemins:

- changement `firestore.rules` -> tests rules obligatoires;
- changement `functions/**` -> build functions obligatoire;
- changement `src/**` -> unit + build;
- changement `firebase.json` ou `.firebaserc` -> audit manuel obligatoire.

### Priorite 4 - Nettoyer le versionnement sans supprimer de fichiers

9. Sortir de l'index Git les artefacts suivis apres validation:

- `dist/`
- `dev-dist/`
- `playwright-report/`
- `test-results/`
- `firestore-debug.log`
- `.env`
- `.env.local`

Action recommandee uniquement en Phase 1 et avec validation:

```bash
git rm --cached -r dist dev-dist playwright-report test-results
git rm --cached firestore-debug.log .env .env.local
```

Les fichiers resteraient localement presents, mais ne seraient plus suivis.

10. Clarifier `functions/index.js`:

- confirmer qu'il est obsolete;
- documenter le main reel `lib/index.js`;
- ne le supprimer qu'apres validation separee.

### Priorite 5 - Formaliser le snapshot stable

11. Creer un tag annote `stable-phase0-2026-07-10` apres validation.

12. Activer protections GitHub:

- PR obligatoire vers `main`;
- CI obligatoire;
- interdiction force push;
- review obligatoire pour fichiers proteges:
  - `firestore.rules`
  - `firestore.indexes.json`
  - `firebase.json`
  - `.firebaserc`
  - `functions/**`
  - services comptables identifies par les protocoles.

## 6. Plan d'action detaille Phase 1

### Phase 1.1 - Snapshot et garde-fous Git

1. Valider humainement que `main` au commit `7ed12e2198ec86c6e1b1dd7064767f9a210442d6` est l'etat stable voulu.
2. Creer le tag annote `stable-phase0-2026-07-10`.
3. Pousser le tag.
4. Activer les protections de branche GitHub.
5. Documenter la procedure de rollback.

### Phase 1.2 - Hygiene environnement

1. Creer des templates `.env.example` plus explicites.
2. Ajouter les variantes locales au `.gitignore`.
3. Retirer `.env` et `.env.local` du suivi Git sans les supprimer localement.
4. Verifier que le build fonctionne avec variables `VITE_FIREBASE_*`.
5. Decider d'une valeur locale par defaut pour `VITE_USE_EMULATORS`.

### Phase 1.3 - Firebase multi-environnements

1. Definir les projets Firebase reels: production, staging, developpement.
2. Ajouter les aliases Firebase seulement apres validation.
3. Interdire les deploiements implicites sur `default` dans la documentation.
4. Ajouter scripts npm avec `--project`.

### Phase 1.4 - Firestore Rules et indexes

1. Referencer `firestore.indexes.json` dans `firebase.json`.
2. Ajouter un script `test:rules` qui execute toute la suite `tests/firestore`.
3. Ajouter la suite rules a GitHub Actions.
4. Ne modifier aucune regle metier pendant cette etape.

### Phase 1.5 - Functions et CI

1. Ajouter build Functions a la CI.
2. Clarifier `functions/index.js` vs `functions/src/index.ts`.
3. Documenter les fonctions qui peuvent modifier Firestore/Auth/Storage.
4. Ne modifier aucune logique de Cloud Function metier pendant cette etape.

### Phase 1.6 - Artefacts et depot propre

1. Retirer les artefacts suivis de l'index Git apres validation.
2. Garder les fichiers localement.
3. Ajouter les exclusions `.gitignore` manquantes.
4. Verifier que `git status` reste lisible apres build/test.

## 7. Conclusion Phase 0

L'application n'a pas ete modifiee fonctionnellement pendant cette phase.

Etat actuel synthetique:

- Firebase pointe vers `monbillet-95b77`.
- Le depot local est propre avant l'ajout du rapport.
- Les rules Firestore sont presentes et versionnees.
- Les index Firestore sont presents mais pas references par `firebase.json`.
- Les emulateurs sont configures, mais l'app locale ne les utilise pas par defaut.
- La CI existe mais ne couvre pas encore les rules, les functions et Playwright.
- Des fichiers d'environnement et artefacts de build sont suivis par Git.

Decision recommandee avant Phase 1:

- ne pas commencer de nouvelle evolution metier tant que la separation des environnements, le snapshot stable, les scripts de tests rules et la strategie de deploiement ne sont pas formalises.

## 8. Suivi Phase 1.1 - Snapshot Git stable

Date d'execution: 2026-07-10

Actions realisees:

- verification Git prealable executee;
- confirmation du commit stable local:
  `7ed12e2198ec86c6e1b1dd7064767f9a210442d6`;
- creation du tag Git annote local:
  `stable-phase0-2026-07-10`;
- push du tag vers `origin` execute avec succes;
- creation de la branche locale d'infrastructure:
  `infra/phase-1.1-snapshot`;
- creation de la procedure de rollback:
  `docs/GIT_STABLE_SNAPSHOT_ROLLBACK.md`.

Actions non realisees:

- aucun deploiement Firebase;
- aucune modification de `firebase.json`;
- aucune modification de `.firebaserc`;
- aucune modification de `firestore.rules`;
- aucune modification de `firestore.indexes.json`;
- aucune modification de `src/firebaseConfig.ts`;
- aucune modification de `.env`, `.env.local` ou `.env.example`;
- aucune modification de `functions/**`;
- aucun retrait de fichier de l'index Git.

Etat du tag:

```text
stable-phase0-2026-07-10 -> 7ed12e2198ec86c6e1b1dd7064767f9a210442d6
```

Commande de push du tag:

```bash
git push origin stable-phase0-2026-07-10
```

Etat du push distant:

```text
OK - tag publie sur origin
```
