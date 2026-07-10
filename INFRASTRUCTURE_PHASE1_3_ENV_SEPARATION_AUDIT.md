# TELIYA - PHASE 1.3
## Audit de preparation a la separation Local / Staging / Production

Date: 2026-07-10

Branche auditee: `infra/phase-1.1-snapshot`

Commit audite: `81351523430329bcfdae2e7cc260c836cab39550`

Projet Firebase production actuel: `monbillet-95b77`

Tag stable de reference: `stable-phase0-2026-07-10`

---

## 1. Perimetre de cette phase

Cette phase est un audit de preparation uniquement.

Aucune action de separation effective n'a ete realisee:

- aucun projet Firebase staging cree;
- aucun alias Firebase ajoute ou modifie;
- aucune modification de `.firebaserc`;
- aucune modification de `firebase.json`;
- aucune modification de `src/firebaseConfig.ts`;
- aucune modification de `src/lib/firebaseClient.ts`;
- aucune modification de `.env`, `.env.local` ou des valeurs locales;
- aucune commande Firebase distante executee;
- aucun deploiement execute.

---

## 2. Etat Git au demarrage de l'audit

Commandes de diagnostic executees:

- `git status --short --branch`
- `git rev-parse HEAD`
- `git branch --show-current`

Constats:

- branche courante: `infra/phase-1.1-snapshot`;
- branche alignee sur `origin/infra/phase-1.1-snapshot`;
- commit courant: `81351523430329bcfdae2e7cc260c836cab39550`;
- aucun fichier local d'environnement ou artefact genere n'est encore suivi par Git apres la Phase 1.2:
  - `.env`;
  - `.env.local`;
  - `dist/`;
  - `dev-dist/`;
  - `playwright-report/`;
  - `test-results/`;
  - `firestore-debug.log`.

---

## 3. Etat Firebase actuel

### 3.1 `.firebaserc`

Contenu actuel:

```json
{
  "projects": {
    "default": "monbillet-95b77"
  }
}
```

Constats:

- seul l'alias `default` existe;
- l'alias `default` pointe directement vers la production `monbillet-95b77`;
- aucun alias `prod`, `staging`, `dev` ou `local` n'est defini;
- une commande Firebase sans `--project` ou sans alias explicite peut donc cibler la production.

### 3.2 `firebase.json`

Configuration actuelle:

- Firestore rules: `firestore.rules`;
- Storage rules: `storage.rules`;
- Functions:
  - source: `functions`;
  - codebase: `default`;
  - predeploy: `npm --prefix "$RESOURCE_DIR" run build`;
- Emulator Suite:
  - Auth Emulator: port `9099`;
  - Functions Emulator: port `5001`;
  - Firestore Emulator: port `8080`;
  - Storage Emulator: port `9199`;
  - Emulator UI: active;
  - `singleProjectMode`: `true`.

Constats:

- la base locale d'emulateurs existe deja;
- aucune separation staging/production n'est configuree;
- les emulateurs utilisent les memes definitions de regles locales que le projet;
- aucun fichier `firestore.indexes.json` n'est declare dans `firebase.json`.

---

## 4. Etat des environnements applicatifs

### 4.1 `.env.example`

Le fichier modele contient des variables vides pour:

- `VITE_FIREBASE_API_KEY`;
- `VITE_FIREBASE_AUTH_DOMAIN`;
- `VITE_FIREBASE_PROJECT_ID`;
- `VITE_FIREBASE_STORAGE_BUCKET`;
- `VITE_FIREBASE_MESSAGING_SENDER_ID`;
- `VITE_FIREBASE_APP_ID`;
- `VITE_FIREBASE_MEASUREMENT_ID`;
- `VITE_RECAPTCHA_V3_KEY`;
- `VITE_APPCHECK_DEBUG`;
- `VITE_FIRESTORE_FORCE_LONG_POLLING`;
- `VITE_USE_EMULATORS`;
- `VITE_APP_VERSION`.

Constat important:

- ces variables existent dans le modele, mais `src/firebaseConfig.ts` n'utilise pas encore `VITE_FIREBASE_*` pour construire la configuration Firebase principale.

### 4.2 `src/firebaseConfig.ts`

Constats:

- la configuration Firebase Web App est codee directement dans le fichier;
- le projet cible code en dur est `monbillet-95b77`;
- la configuration inclut notamment:
  - `authDomain`: `monbillet-95b77.firebaseapp.com`;
  - `projectId`: `monbillet-95b77`;
  - `storageBucket`: `monbillet-95b77.appspot.com`;
  - `messagingSenderId`: `337289733382`;
  - `measurementId`: present;
- le fichier connecte Firestore, Auth, Storage et Functions aux emulateurs seulement si:
  - `VITE_USE_EMULATORS === "true"`;
  - l'application tourne sur `localhost` ou `127.0.0.1`;
- la region Functions est fixee a `europe-west1`.

Risque principal:

- si `VITE_USE_EMULATORS` vaut `false` en local, le developpement local peut lire ou ecrire dans le projet cloud `monbillet-95b77`.

### 4.3 `src/lib/firebaseClient.ts`

Constats:

- le fichier contient une seconde initialisation Firebase;
- il utilise des variables `NEXT_PUBLIC_FIREBASE_*`;
- ces variables ne correspondent pas au standard Vite actuel `VITE_FIREBASE_*`;
- il exporte une app Firebase separee ainsi que `getAuth`, `getFunctions`, `getFirestore`;
- son role exact doit etre confirme avant toute suppression ou refactor.

Risque:

- coexistence de deux points d'initialisation Firebase pouvant compliquer la future separation d'environnements.

---

## 5. References directes a la production detectees

References a `monbillet-95b77` hors documentation:

- `src/firebaseConfig.ts`;
- `public/firebase-messaging-sw.js`;
- `src/tools/setUserRoles.ts`;
- `scripts/regularizeHistoricalOnlinePayments.cjs`;
- `functions/src/index.ts`;
- `functions/src/deleteCompany.ts`;
- tests Firestore:
  - `tests/firestore/operatorDigitalOnlineMobileMoney.rules.test.cjs`;
  - `tests/firestore/agencySessionAccountantValidation.rules.test.cjs`;
  - `tests/firestore/agencyExpenseDirect.rules.test.cjs`;
  - `tests/firestore/agencyManagerCashAccount.rules.test.cjs`;
  - `tests/firestore/agencyBankDepositDirect.rules.test.cjs`.

Constat:

- ces references ne doivent pas etre changees en Phase 1.3;
- elles devront etre classees en Phase 1.4 avant tout refactor:
  - references de production legitimes;
  - references a parametrer par environnement;
  - scripts dangereux a proteger;
  - tests emulateurs pouvant utiliser un project id de test ou demo.

---

## 6. Scripts et commandes Firebase detectes

### 6.1 `package.json`

Script Firebase detecte:

```json
"test:rules:agency-expense": "firebase emulators:exec --only firestore \"node tests/firestore/agencyExpenseDirect.rules.test.cjs\""
```

Constat:

- ce script utilise l'emulateur Firestore;
- il ne precise pas de project id dedie;
- il reste local en principe, mais depend de la configuration Firebase CLI et des fichiers de regles locaux.

### 6.2 `functions/package.json`

Script Firebase detecte:

```json
"deploy": "npm run build && firebase deploy --only functions"
```

Risque:

- le script ne precise ni alias ni `--project`;
- avec `.firebaserc` actuel, ce deploy cible potentiellement `monbillet-95b77`.

### 6.3 Documentation historique

Plusieurs documents mentionnent des commandes de deploiement:

- `firebase deploy --only firestore:rules`;
- `firebase deploy --only firestore:indexes`;
- `firebase deploy --only functions`;
- variantes avec `--project monbillet-95b77`.

Constat:

- ces commandes sont documentaires ou historiques;
- elles peuvent favoriser une execution manuelle risquee si aucune convention Phase 1 n'est formalisee.

---

## 7. Etat CI/CD

Fichier audite: `.github/workflows/ci.yml`

Constats:

- CI active sur `push` et `pull_request` vers `main` et `master`;
- Node.js utilise: `20`;
- commandes:
  - `npm ci`;
  - `npm run test:run`;
  - `npm run build`;
- le job de test injecte des variables `VITE_FIREBASE_*` vides;
- le job de build lit des secrets GitHub `VITE_FIREBASE_*`;
- aucune matrice local/staging/production;
- aucun deploiement Firebase dans la CI;
- aucun controle explicite empechant un build de production avec une configuration locale ou staging;
- le build peut reussir meme si `src/firebaseConfig.ts` ignore les variables `VITE_FIREBASE_*`, car la configuration principale est codee en dur.

---

## 8. Cible d'architecture recommandee

### 8.1 LOCAL

Objectif:

- utiliser uniquement Firebase Emulator Suite;
- ne jamais lire ni ecrire dans des donnees reelles;
- utiliser des donnees de test locales;
- rendre explicite l'activation des emulateurs.

Principe recommande:

- `VITE_USE_EMULATORS=true`;
- project id local non production, par exemple un id `demo-*` ou un id dedie aux emulateurs;
- scripts locaux explicites;
- tests de regles via emulateurs uniquement.

### 8.2 STAGING

Objectif:

- utiliser un projet Firebase separe de `monbillet-95b77`;
- contenir uniquement des donnees fictives;
- permettre les validations de regles, fonctions, auth, storage et workflows sans risque production.

Principe recommande:

- alias Firebase `staging`;
- variables d'environnement staging separees;
- utilisateurs et compagnies fictifs;
- aucune copie brute de donnees production;
- deploiements staging explicites avec `--project` ou alias valide.

### 8.3 PRODUCTION

Objectif:

- conserver `monbillet-95b77` comme production;
- proteger les donnees et les utilisateurs reels;
- rendre les deploiements production explicites et controles.

Principe recommande:

- alias Firebase `prod`;
- commandes production nommees et documentees;
- validation manuelle avant tout deploiement de regles, indexes ou functions;
- interdiction des deploys implicites via `default`.

---

## 9. Risques classes

### Critique

1. Developpement local pouvant cibler la production

- Cause: `src/firebaseConfig.ts` pointe vers `monbillet-95b77` et les emulateurs ne sont utilises que si `VITE_USE_EMULATORS=true`.
- Impact: lecture/ecriture accidentelle dans les vraies donnees.

2. Alias Firebase `default` pointant vers production

- Cause: `.firebaserc` ne contient que `default: monbillet-95b77`.
- Impact: toute commande Firebase implicite peut cibler production.

### Eleve

3. Script `functions:deploy` implicite

- Cause: `functions/package.json` contient `firebase deploy --only functions` sans `--project`.
- Impact: risque de deploy Functions production par erreur.

4. Configuration Firebase Web App codee en dur

- Cause: `src/firebaseConfig.ts` n'utilise pas `VITE_FIREBASE_*`.
- Impact: separation staging/production impossible sans refactor ulterieur.

5. Absence de projet staging

- Cause: seul `monbillet-95b77` est configure.
- Impact: les validations pre-production ne peuvent pas etre isolees.

### Moyen

6. Deux points d'initialisation Firebase

- Cause: `src/firebaseConfig.ts` et `src/lib/firebaseClient.ts`.
- Impact: risque de divergence de configuration lors de la separation.

7. Tests Firestore avec project id production code en dur

- Cause: fichiers `tests/firestore/*.rules.test.cjs`.
- Impact: confusion entre emulateur et production, meme si les tests utilisent normalement l'emulateur.

8. Service worker Firebase Messaging lie a production

- Cause: `public/firebase-messaging-sw.js` contient `monbillet-95b77`.
- Impact: future configuration staging/PWA a traiter avec prudence.

### Faible

9. Documentation historique contenant des commandes de deploy directes

- Cause: anciens rapports et notes techniques.
- Impact: risque humain, reduit si une procedure Phase 1 devient la reference officielle.

---

## 10. Recommandations pour la Phase 1.4 uniquement

Ne rien appliquer sans validation prealable.

Actions recommandees:

1. Definir officiellement les noms d'environnements

- `local`;
- `staging`;
- `production`.

2. Valider le futur projet Firebase staging

- nom du projet;
- region;
- billing plan;
- politique App Check;
- Auth providers;
- Storage;
- Functions;
- Firestore rules/indexes.

3. Definir la strategie `.firebaserc`

- remplacer le modele implicite `default` par des alias explicites;
- proposer `prod` pour `monbillet-95b77`;
- ajouter `staging` seulement apres creation du projet;
- documenter si `default` doit etre supprime ou conserve temporairement.

4. Preparer le refactor de `src/firebaseConfig.ts`

- construire la configuration depuis `import.meta.env.VITE_FIREBASE_*`;
- conserver le comportement applicatif;
- ajouter une validation defensive contre une execution locale en cloud non voulue;
- ne pas changer encore les flux metier.

5. Clarifier `src/lib/firebaseClient.ts`

- verifier ses imports reels;
- determiner s'il est encore utilise;
- decider s'il doit etre aligne sur Vite ou deprecie.

6. Standardiser les fichiers exemples d'environnement

- conserver `.env.example`;
- envisager des exemples separes:
  - `.env.local.example`;
  - `.env.staging.example`;
  - `.env.production.example`;
- ne jamais versionner les vraies valeurs.

7. Securiser les scripts

- remplacer a terme les commandes Firebase implicites par des scripts explicites;
- exiger `--project` ou alias clair;
- distinguer:
  - tests emulateurs;
  - deploy staging;
  - deploy production.

8. Encadrer les donnees staging

- aucune copie brute de production;
- seed fictif seulement;
- comptes test separes;
- compagnies fictives.

9. Mettre a jour la CI

- ajouter des controles de configuration par environnement;
- verifier que la config runtime utilise bien les variables attendues;
- eviter tout deploy automatique tant que la strategie n'est pas validee.

---

## 11. Conclusion

L'infrastructure est prete pour une Phase 1.4 de conception detaillee, mais pas encore pour une separation immediate.

Les risques principaux sont:

- le projet production `monbillet-95b77` est encore la cible par defaut;
- la configuration applicative principale est codee en dur;
- le mode local peut encore fonctionner contre le cloud si les emulateurs sont desactives;
- il n'existe pas encore de staging isole.

La prochaine phase doit rester une phase de conception et de securisation progressive avant tout changement actif de configuration Firebase.
