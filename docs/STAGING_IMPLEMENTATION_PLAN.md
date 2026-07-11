# TELIYA - Plan de creation controlee de l'environnement STAGING

Phase: 1.3.2

Statut: preparation uniquement

Date: 2026-07-10

---

## 0. Perimetre

Ce document prepare la creation de l'environnement STAGING de Teliya.

Aucune creation reelle n'est effectuee dans cette phase.

Aucune action technique active ne doit etre realisee a partir de ce document sans validation humaine explicite.

Interdictions maintenues:

- ne pas creer le projet Firebase;
- ne pas modifier `.firebaserc`;
- ne pas modifier `firebase.json`;
- ne pas modifier `firestore.rules`;
- ne pas modifier `firestore.indexes.json`;
- ne pas modifier `storage.rules`;
- ne pas modifier `src/firebaseConfig.ts`;
- ne pas modifier `src/lib/firebaseClient.ts`;
- ne pas modifier `package.json`;
- ne pas modifier `functions/**`;
- ne pas creer les fichiers `.env`;
- ne pas creer de site Netlify;
- ne pas creer de donnees Firestore;
- ne pas deployer.

---

## 1. Nom definitif du projet Firebase

### Nom retenu

Nom Firebase cible:

```text
teliya-staging
```

Nom d'affichage recommande:

```text
Teliya Staging
```

Role:

```text
environnement cloud de validation avant production
```

Ce projet doit etre totalement separe de la production:

```text
Production actuelle: monbillet-95b77
Staging cible:       teliya-staging
```

### Verification de disponibilite

La disponibilite definitive du project ID `teliya-staging` doit etre confirmee au moment de la creation dans Firebase Console ou via une commande de verification approuvee.

Cette phase ne doit pas tenter une creation automatique du projet pour tester la disponibilite.

Statut actuel dans ce plan:

```text
teliya-staging est le nom definitif recommande, sous reserve de disponibilite Firebase au moment de la creation.
```

### Alternatives si `teliya-staging` est indisponible

Alternatives propres, par ordre de preference:

1. `teliya-platform-staging`
2. `teliya-cloud-staging`
3. `teliya-app-staging`

Decision recommandee si conflit:

```text
Utiliser teliya-platform-staging.
```

Noms a eviter:

- `teliya-dev`, car l'architecture ne retient pas de projet cloud dev;
- `teliya-test`, trop vague;
- `monbillet-staging`, car le produit cible est maintenant Teliya;
- tout nom contenant `prod`, `real`, `live` ou `production`.

---

## 2. Alias Firebase

### Structure cible

Structure `.firebaserc` future proposee:

```json
{
  "projects": {
    "prod": "monbillet-95b77",
    "staging": "teliya-staging"
  }
}
```

### Alias definitifs

```text
prod    -> monbillet-95b77
staging -> teliya-staging
```

### Alias non retenus

```text
default
dev
local
preprod
test
```

Justification:

- `default` est ambigu et dangereux;
- `dev` n'existe pas comme projet cloud dans l'architecture retenue;
- `local` correspond aux emulateurs, pas a un projet cloud;
- `preprod` et `test` sont moins standards que `staging`.

### Regle de securite

Aucune commande Firebase ne doit dependre d'un projet implicite.

Toute commande future devra indiquer explicitement:

```text
--project staging
```

ou

```text
--project prod
```

selon le contexte valide.

---

## 3. Variables d'environnement

Les valeurs ci-dessous sont des placeholders. Aucune vraie valeur ne doit etre renseignee dans ce document.

### `.env.local`

Role:

```text
developpement local avec Firebase Emulator Suite
```

Fichier:

```text
.env.local
```

Statut Git:

```text
ignore, non commite
```

Contenu cible:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=demo-teliya-local
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

VITE_RECAPTCHA_V3_KEY=
VITE_APPCHECK_DEBUG=true
VITE_FIRESTORE_FORCE_LONG_POLLING=false
VITE_USE_EMULATORS=true
VITE_APP_VERSION=
```

Regles:

- doit utiliser les emulateurs;
- ne doit pas pointer vers `monbillet-95b77`;
- ne doit pas pointer vers `teliya-staging` pour le developpement quotidien;
- ne doit contenir aucune donnee sensible de production.

### `.env.staging`

Role:

```text
configuration cloud staging
```

Fichier:

```text
.env.staging
```

Statut Git:

```text
ignore, non commite
```

Contenu cible:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=teliya-staging.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=teliya-staging
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

VITE_RECAPTCHA_V3_KEY=
VITE_APPCHECK_DEBUG=false
VITE_FIRESTORE_FORCE_LONG_POLLING=false
VITE_USE_EMULATORS=false
VITE_APP_VERSION=
```

Regles:

- doit utiliser uniquement le projet Firebase staging;
- ne doit contenir aucune valeur production;
- doit etre configure aussi dans Netlify Staging;
- les donnees associees doivent rester fictives.

### `.env.production`

Role:

```text
configuration cloud production
```

Fichier:

```text
.env.production
```

Statut Git:

```text
ignore, non commite
```

Contenu cible:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=monbillet-95b77.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=monbillet-95b77
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

VITE_RECAPTCHA_V3_KEY=
VITE_APPCHECK_DEBUG=false
VITE_FIRESTORE_FORCE_LONG_POLLING=false
VITE_USE_EMULATORS=false
VITE_APP_VERSION=
```

Regles:

- gere uniquement via environnement de deploiement production;
- ne doit pas etre utilise pour le developpement local;
- modification uniquement apres validation humaine.

### `.env.example`

Role:

```text
modele versionne sans valeurs reelles
```

Variables attendues:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_RECAPTCHA_V3_KEY
VITE_APPCHECK_DEBUG
VITE_FIRESTORE_FORCE_LONG_POLLING
VITE_USE_EMULATORS
VITE_APP_VERSION
```

---

## 4. Architecture Netlify

### Site staging

Nom recommande:

```text
teliya-staging
```

Nom d'affichage:

```text
Teliya Staging
```

Role:

```text
validation fonctionnelle et technique avant production
```

Projet Firebase associe:

```text
teliya-staging
```

### Site production

Site existant ou cible production:

```text
Teliya Production
```

Projet Firebase associe:

```text
monbillet-95b77
```

Ce plan ne modifie pas Netlify Production.

### Build Netlify staging

Commande de build cible:

```text
npm run build
```

Repertoire de publication:

```text
dist
```

Version Node recommandee:

```text
20
```

Variables Netlify staging attendues:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_RECAPTCHA_V3_KEY
VITE_APPCHECK_DEBUG
VITE_FIRESTORE_FORCE_LONG_POLLING
VITE_USE_EMULATORS
VITE_APP_VERSION
```

Valeurs logiques staging:

```text
VITE_FIREBASE_PROJECT_ID=teliya-staging
VITE_USE_EMULATORS=false
VITE_APPCHECK_DEBUG=false
```

### Domaines

Sous-domaine Netlify par defaut attendu:

```text
teliya-staging.netlify.app
```

Domaine custom optionnel:

```text
staging.teliya.app
```

Decision recommandee:

```text
Utiliser d'abord le domaine Netlify par defaut, puis ajouter staging.teliya.app apres validation DNS.
```

### Regles Netlify

- ne pas connecter le staging a la production Firebase;
- ne pas partager les variables production;
- ne pas activer de deploy production depuis la branche staging;
- conserver les deploy previews comme aide visuelle, pas comme environnement de validation principal.

---

## 5. Services Firebase

### Services a activer dans `teliya-staging`

#### Firestore

Statut cible:

```text
actif
```

Usage:

- stockage applicatif principal;
- validation des regles;
- donnees fictives de test;
- verification des workflows multi-roles.

Mode:

```text
Native mode
```

Region recommandee:

```text
eur3 ou europe-west, a confirmer selon disponibilite Firebase et coherence avec la production
```

Point de vigilance:

```text
Le choix de region Firestore est irreversible apres creation.
```

#### Authentication

Statut cible:

```text
actif
```

Usage:

- comptes fictifs;
- roles de test;
- validation des claims et parcours de connexion.

Providers a preparer:

- Email/Password;
- autres providers uniquement s'ils sont deja utilises par production.

#### Storage

Statut cible:

```text
actif
```

Usage:

- documents fictifs;
- preuves fictives;
- images ou medias de test;
- validation des regles Storage.

#### Cloud Functions

Statut cible:

```text
actif lorsque le plan Firebase le permet
```

Usage:

- validation des callables et triggers existants;
- verification des integrations sans toucher production.

Point de vigilance:

```text
Les Functions peuvent exiger un plan Billing adapte selon les fonctionnalites utilisees.
```

#### App Check

Statut cible:

```text
prepare, activation progressive
```

Usage:

- validation des domaines staging;
- protection des appels Firebase cote frontend;
- test des cles reCAPTCHA staging.

Decision recommandee:

```text
Configurer App Check en mode observe ou non bloquant au depart, puis durcir apres validation.
```

#### Emulator Suite

Statut cible:

```text
reste local, pas un service cloud staging
```

Usage:

- developpement local;
- tests de rules;
- validation avant envoi vers staging.

---

## 6. Structure Firestore minimale

Cette section definit le plan de donnees fictives. Elle ne cree aucune donnee.

La structure doit respecter les collections existantes de Teliya et ne doit pas introduire de modele metier nouveau.

### Racines probables a preparer

```text
companies/{companyId}
companies/{companyId}/agencies/{agencyId}
companies/{companyId}/accounts/{accountId}
companies/{companyId}/financialTransactions/{transactionId}
companies/{companyId}/financialTransactionIdempotency/{idempotencyKey}
companies/{companyId}/users/{userId}
users/{userId}
```

### Identifiants fictifs recommandes

Compagnie:

```text
company_test_teliya
```

Agences:

```text
agency_test_bamako
agency_test_segou
```

Comptes techniques minimaux a prevoir si necessaires aux parcours comptables:

```text
agency_agency_test_bamako_cash
agency_agency_test_bamako_pending_cash
agency_agency_test_segou_cash
agency_agency_test_segou_pending_cash
company_mobile_money
company_clearing
```

Important:

```text
La creation effective de ces documents devra respecter les regles metier et comptables existantes.
```

---

## 7. Donnees fictives

### Compagnie Test

Nom:

```text
Compagnie Test Teliya
```

Identifiant recommande:

```text
company_test_teliya
```

Usage:

- validation des workflows compagnie;
- rattachement des agences;
- tests multi-roles.

### Agence Test Bamako

Nom:

```text
Agence Test Bamako
```

Identifiant recommande:

```text
agency_test_bamako
```

Usage:

- parcours agence principal;
- guichet;
- comptabilite agence;
- courrier.

### Agence Test Segou

Nom:

```text
Agence Test Segou
```

Identifiant recommande:

```text
agency_test_segou
```

Usage:

- tests d'isolation entre agences;
- validation des droits inter-agences;
- trajets fictifs entre Bamako et Segou.

### Utilisateurs fictifs

Les emails ci-dessous sont des placeholders. Ils devront etre adaptes au domaine de test choisi.

#### CEO Test

```text
email: ceo.test@teliya-staging.local
role: company_admin ou ceo selon le modele existant
companyId: company_test_teliya
agencyId: null
```

#### Chef Agence Test

```text
email: chef.agence.test@teliya-staging.local
role: agency_manager
companyId: company_test_teliya
agencyId: agency_test_bamako
```

#### Guichetier Test

```text
email: guichetier.test@teliya-staging.local
role: guichetier ou agency_agent selon le modele existant
companyId: company_test_teliya
agencyId: agency_test_bamako
```

#### Comptable Test

```text
email: comptable.test@teliya-staging.local
role: agency_accountant
companyId: company_test_teliya
agencyId: agency_test_bamako
```

#### Chef Comptable Test

```text
email: chef.comptable.test@teliya-staging.local
role: company_accountant ou chief_accountant selon le modele existant
companyId: company_test_teliya
agencyId: null
```

#### Agent Courrier Test

```text
email: courrier.test@teliya-staging.local
role: courier_agent
companyId: company_test_teliya
agencyId: agency_test_bamako
```

#### Operateur Digital Test

```text
email: digital.test@teliya-staging.local
role: digital_operator
companyId: company_test_teliya
agencyId: null
```

### Donnees metier fictives a preparer plus tard

Sans creation en Phase 1.3.2:

- villes fictives: Bamako, Segou;
- trajet fictif: Bamako -> Segou;
- vehicule fictif;
- conducteur fictif;
- reservations fictives;
- paiements fictifs;
- session guichet fictive;
- courrier fictif;
- comptes financiers initiaux fictifs.

---

## 8. Checklist de creation

Cette checklist est pour la phase future validee. Ne rien executer pendant la Phase 1.3.2 sans validation humaine.

### Avant creation

- [ ] confirmer que le depot Git est propre;
- [ ] confirmer le commit de reference;
- [ ] confirmer que la production reste `monbillet-95b77`;
- [ ] confirmer le nom `teliya-staging`;
- [ ] verifier la disponibilite du project ID dans Firebase Console;
- [ ] valider l'alternative si le nom est indisponible;
- [ ] confirmer la region Firestore avant activation;
- [ ] confirmer le plan de facturation necessaire pour Functions;
- [ ] confirmer les administrateurs du projet Firebase.

### Creation Firebase

- [ ] creer le projet Firebase `teliya-staging`;
- [ ] activer Firestore en mode Native;
- [ ] activer Authentication;
- [ ] activer Storage;
- [ ] preparer Cloud Functions;
- [ ] preparer App Check;
- [ ] verifier les quotas et limites;
- [ ] verifier les domaines autorises Auth.

### Configuration locale future

- [ ] mettre a jour `.firebaserc` avec `prod` et `staging`;
- [ ] ne plus utiliser `default` pour les operations critiques;
- [ ] creer les fichiers `.env` locaux necessaires sans les commiter;
- [ ] renseigner les variables Netlify staging;
- [ ] verifier que `.env.staging` n'est pas suivi par Git.

### Netlify staging

- [ ] creer le site Netlify staging;
- [ ] configurer `npm run build`;
- [ ] configurer `dist` comme dossier publie;
- [ ] definir Node `20`;
- [ ] renseigner les variables `VITE_*` staging;
- [ ] connecter le site a la branche ou au flux valide;
- [ ] verifier le domaine Netlify par defaut;
- [ ] ajouter un domaine custom seulement apres validation.

---

## 9. Checklist post-creation

Apres creation reelle du staging:

- [ ] verifier que le projet Firebase visible est bien `teliya-staging`;
- [ ] verifier que le projet production reste intact;
- [ ] verifier que `.firebaserc` ne pointe plus production via `default`;
- [ ] verifier que les variables staging pointent vers `teliya-staging`;
- [ ] verifier que Netlify Staging ne contient aucune variable production;
- [ ] verifier que Netlify Production n'a pas ete modifie;
- [ ] verifier que Auth staging accepte les domaines staging;
- [ ] verifier que Storage staging est separe;
- [ ] verifier que Firestore staging est vide ou contient uniquement des donnees fictives;
- [ ] verifier qu'aucune donnee production n'a ete copiee;
- [ ] verifier que App Check staging ne bloque pas prematurement les tests;
- [ ] documenter les valeurs non sensibles creees.

---

## 10. Checklist de validation

### Validation environnement

- [ ] l'application locale utilise les emulateurs;
- [ ] l'application staging utilise `teliya-staging`;
- [ ] l'application production utilise `monbillet-95b77`;
- [ ] aucun environnement ne depend d'un alias `default`;
- [ ] les variables `VITE_USE_EMULATORS` sont coherentes:
  - local: `true`;
  - staging: `false`;
  - production: `false`.

### Validation Firebase

- [ ] Firestore staging accessible;
- [ ] Auth staging accessible;
- [ ] Storage staging accessible;
- [ ] Functions staging deployables quand la phase de deploiement sera validee;
- [ ] App Check staging configure sans bloquer la validation initiale.

### Validation Netlify

- [ ] build staging OK;
- [ ] site staging accessible;
- [ ] variables staging chargees;
- [ ] aucun secret production utilise;
- [ ] domaine staging autorise dans Firebase Auth;
- [ ] frontend staging ne pointe pas vers production.

### Validation donnees fictives

- [ ] compagnie test creee uniquement en staging;
- [ ] agences test creees uniquement en staging;
- [ ] utilisateurs test crees uniquement en staging;
- [ ] roles coherents;
- [ ] isolation agence Bamako / Segou verifiee;
- [ ] aucun compte ou utilisateur reel present.

### Validation metier minimale future

A executer seulement apres creation et configuration complete:

- [ ] connexion CEO Test;
- [ ] connexion Chef Agence Test;
- [ ] connexion Guichetier Test;
- [ ] connexion Comptable Test;
- [ ] connexion Chef Comptable Test;
- [ ] connexion Agent Courrier Test;
- [ ] connexion Operateur Digital Test;
- [ ] creation d'une reservation fictive;
- [ ] validation d'une session fictive;
- [ ] verification d'un flux courrier fictif;
- [ ] verification qu'aucune ecriture ne touche production.

---

## 11. Decision de fin de Phase 1.3.2

Nom Firebase cible:

```text
teliya-staging
```

Fallback si indisponible:

```text
teliya-platform-staging
```

Alias cibles:

```text
prod    -> monbillet-95b77
staging -> teliya-staging
```

Site Netlify staging cible:

```text
teliya-staging
```

Services Firebase staging:

```text
Firestore
Authentication
Storage
Cloud Functions
App Check
```

Donnees:

```text
fictives uniquement
```

Etat attendu a la fin de cette phase:

```text
Plan pret.
Projet non cree.
Alias non modifies.
Configuration active non modifiee.
Netlify non cree.
Donnees non creees.
```

STOP.
