# TELIYA - Architecture definitive des environnements

Phase: 1.3.1

Statut: conception uniquement

Date: 2026-07-10

---

## 1. Architecture retenue

L'architecture retenue pour Teliya est:

```text
LOCAL
-> Firebase Emulator Suite
-> donnees locales fictives
-> aucun acces aux donnees reelles

STAGING
-> projet Firebase separe
-> donnees fictives controlees
-> validation avant production

PRODUCTION
-> projet Firebase actuel monbillet-95b77
-> donnees reelles
-> utilisateurs reels
```

Architecture recommandee:

```text
Option C - Local + Staging + Production
```

Cette architecture est la plus adaptee a Teliya:

- un developpeur principal;
- une plateforme SaaS multi-compagnies;
- plusieurs centaines de compagnies a terme;
- plusieurs milliers d'utilisateurs;
- React + Vite;
- Firebase Auth, Firestore, Storage, Cloud Functions;
- Netlify pour le frontend.

Elle apporte une vraie separation des risques sans introduire une organisation trop lourde.

---

## 2. Justification

### Option A - Production uniquement

Description:

```text
PRODUCTION uniquement
```

Avantages:

- cout minimal;
- aucune configuration supplementaire;
- maintenance tres simple.

Inconvenients:

- risque permanent de modifier les vraies donnees pendant le developpement;
- tests manuels dangereux;
- impossibilite de valider les regles Firestore et Functions dans un environnement cloud de test;
- non adapte a une plateforme SaaS avec plusieurs compagnies;
- aucune zone de validation avant production.

Conclusion:

Cette option est trop risquee. Elle doit etre exclue.

### Option B - Local + Production

Description:

```text
LOCAL -> Emulator Suite
PRODUCTION -> monbillet-95b77
```

Avantages:

- cout faible;
- bonne protection pendant le developpement local;
- maintenance raisonnable;
- utile pour les tests unitaires et les tests de regles.

Inconvenients:

- pas de validation cloud avant production;
- les problemes lies a Auth, App Check, Storage, Functions deployees, CORS, domaines autorises ou configuration Netlify peuvent echapper aux tests locaux;
- les emulateurs ne reproduisent pas toujours exactement le comportement cloud;
- les migrations, index et fonctions seraient valides trop tard.

Conclusion:

Cette option est meilleure que production uniquement, mais insuffisante pour une plateforme SaaS exploitee par plusieurs compagnies.

### Option C - Local + Staging + Production

Description:

```text
LOCAL -> Emulator Suite
STAGING -> projet Firebase de test
PRODUCTION -> monbillet-95b77
```

Avantages:

- separation claire entre developpement, validation et production;
- protection forte des donnees reelles;
- validation cloud possible avant production;
- cout et maintenance encore raisonnables;
- architecture simple pour un developpeur principal;
- adaptee a une croissance progressive de Teliya;
- permet de tester Auth, Firestore, Storage, Functions et Netlify avant production.

Inconvenients:

- un projet Firebase supplementaire a maintenir;
- besoin de variables d'environnement separees;
- besoin d'une procedure de deploiement disciplinee;
- donnees de test staging a maintenir.

Conclusion:

Cette option est le meilleur equilibre entre securite, cout, simplicite et professionnalisme.

### Option D - Local + Dev + Staging + Production

Description:

```text
LOCAL -> Emulator Suite
DEV -> projet Firebase cloud developpement
STAGING -> projet Firebase preproduction
PRODUCTION -> monbillet-95b77
```

Avantages:

- separation tres fine;
- utile pour une equipe nombreuse;
- permet des tests cloud permanents sans impacter staging.

Inconvenients:

- complexite plus elevee;
- cout plus eleve;
- maintenance de trois projets Firebase cloud;
- risques de confusion entre dev et staging;
- surdimensionne pour un developpeur principal;
- plus de scripts, secrets, procedures et donnees a maintenir.

Conclusion:

Cette option est trop lourde pour Teliya actuellement. Elle pourra etre reconsideree uniquement si une equipe technique plus large travaille en parallele.

### Decision finale

Teliya utilisera:

```text
LOCAL + STAGING + PRODUCTION
```

---

## 3. Noms definitifs

### Production

Nom existant:

```text
monbillet-95b77
```

Decision:

```text
conserver monbillet-95b77 comme projet Firebase de production
```

Justification:

- projet deja utilise;
- contient les vraies donnees;
- evite toute migration inutile;
- reduit le risque operationnel.

### Staging

Options comparees:

#### Option 1 - `teliya-staging`

Avantages:

- nom clair;
- standard technique courant;
- comprehensible pour les outils, la documentation et les futurs collaborateurs;
- indique explicitement un environnement de validation.

Inconvenients:

- terme anglais, mais acceptable dans une infrastructure technique.

#### Option 2 - `teliya-preprod`

Avantages:

- tres proche du vocabulaire francophone;
- indique une validation avant production.

Inconvenients:

- peut etre confondu avec un miroir quasi reel de production;
- peut encourager a copier des donnees reelles, ce qui est a eviter.

#### Option 3 - `teliya-testing`

Avantages:

- indique clairement un environnement de test.

Inconvenients:

- moins adapte aux validations fonctionnelles completes;
- peut sembler jetable ou moins stable qu'un vrai staging.

### Decision finale

Projet Firebase staging recommande:

```text
teliya-staging
```

Nom logique:

```text
Teliya Staging
```

Regle importante:

```text
Le staging ne doit contenir que des donnees fictives.
```

### Local

Le local ne doit pas etre un projet Firebase cloud.

Nom logique recommande pour les emulateurs:

```text
demo-teliya-local
```

Justification:

- le prefixe `demo-` est adapte aux emulateurs Firebase;
- signale clairement qu'il ne s'agit pas d'un projet cloud reel;
- reduit le risque de confusion avec production ou staging.

---

## 4. Alias definitifs

### Strategies comparees

#### Strategie A - Garder uniquement `default`

Exemple:

```json
{
  "projects": {
    "default": "monbillet-95b77"
  }
}
```

Avantage:

- simple a court terme.

Inconvenients:

- dangereux;
- deploys implicites vers production;
- ne distingue pas staging et production;
- mauvaise base pour une plateforme SaaS.

Conclusion:

Strategie refusee.

#### Strategie B - `default`, `staging`, `prod`

Exemple:

```json
{
  "projects": {
    "default": "teliya-staging",
    "staging": "teliya-staging",
    "prod": "monbillet-95b77"
  }
}
```

Avantages:

- `default` peut pointer vers staging pour reduire le risque production;
- commandes sans projet moins dangereuses.

Inconvenients:

- `default` reste ambigu;
- un developpeur peut croire qu'il deploie localement ou en production;
- la presence de `default` encourage les commandes implicites.

Conclusion:

Acceptable temporairement, mais pas ideale comme cible definitive.

#### Strategie C - Alias explicites uniquement

Exemple:

```json
{
  "projects": {
    "staging": "teliya-staging",
    "prod": "monbillet-95b77"
  }
}
```

Avantages:

- aucun environnement implicite;
- chaque commande doit choisir une cible;
- reduit fortement les erreurs humaines;
- clair et professionnel.

Inconvenients:

- demande plus de discipline;
- certaines commandes doivent toujours preciser `--project` ou l'alias.

### Decision finale

Alias Firebase definitifs:

```text
staging -> teliya-staging
prod    -> monbillet-95b77
```

Alias local:

```text
aucun alias Firebase cloud
```

Nom local utilise par les emulateurs:

```text
demo-teliya-local
```

Regle:

```text
Aucune commande Firebase ne doit dependre d'un alias default.
```

Pendant une phase de transition, `default` pourra etre conserve temporairement si necessaire, mais la cible definitive est de ne plus utiliser `default` pour les deploiements.

---

## 5. Variables d'environnement

### Principes

Les fichiers d'environnement doivent separer clairement:

- les exemples versionnes;
- les valeurs locales privees;
- les valeurs staging;
- les valeurs production.

Les fichiers contenant de vraies valeurs ne doivent pas etre commit.

### `.env.example`

Role:

```text
Modele public versionne.
```

Contenu:

- noms des variables attendues;
- valeurs vides;
- commentaires de documentation;
- aucune vraie cle;
- aucune vraie configuration projet.

Utilisation:

- reference pour les developpeurs;
- base pour creer `.env.local`, `.env.staging` ou `.env.production`.

### `.env.local`

Role:

```text
Configuration locale privee du developpeur.
```

Decision cible:

```text
VITE_USE_EMULATORS=true
```

Utilisation:

- lancement local de l'application;
- connexion a Firebase Emulator Suite;
- aucune donnee reelle;
- App Check debug local si necessaire;
- project id local de type `demo-teliya-local`.

Regle:

```text
.env.local ne doit jamais pointer volontairement vers la production.
```

### `.env.staging`

Role:

```text
Configuration de validation cloud non production.
```

Contenu:

- configuration Firebase Web App du projet `teliya-staging`;
- `VITE_USE_EMULATORS=false`;
- cles App Check staging si activees;
- variables propres au site Netlify staging.

Regles:

- non commite;
- stocke comme variables d'environnement Netlify staging;
- ne contient aucune valeur production;
- donnees fictives uniquement.

### `.env.production`

Role:

```text
Configuration production.
```

Contenu:

- configuration Firebase Web App du projet `monbillet-95b77`;
- `VITE_USE_EMULATORS=false`;
- cles App Check production;
- variables propres au site Netlify production.

Regles:

- non commite;
- gere via Netlify production environment variables;
- modifie uniquement avec validation explicite;
- ne doit jamais etre utilise pour le developpement local courant.

### Variables minimales attendues

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

## 6. Architecture Netlify

### Options comparees

#### Option 1 - Branch Deploy sur un seul site Netlify

Description:

```text
Un site Netlify unique.
Production depuis main.
Staging via branch deploy.
```

Avantages:

- simple a creer;
- moins de sites a maintenir;
- previews automatiques par branche.

Inconvenients:

- variables d'environnement plus difficiles a isoler proprement;
- risque de confusion entre contextes;
- separation moins nette pour une application SaaS;
- les domaines, secrets et controles de production/staging sont moins lisibles.

Conclusion:

Bien pour des sites simples, moins ideal pour Teliya.

#### Option 2 - Site staging independant

Description:

```text
Site Netlify production separe.
Site Netlify staging separe.
```

Avantages:

- separation claire des variables;
- domaines separes;
- deploiements plus explicites;
- rollback et validation plus lisibles;
- meilleure correspondance avec deux projets Firebase cloud;
- reduit les erreurs de configuration.

Inconvenients:

- un site Netlify supplementaire;
- configuration a maintenir en double;
- besoin d'une procedure de synchronisation des parametres.

Conclusion:

Meilleur choix pour Teliya.

#### Option 3 - Netlify Deploy Preview uniquement

Description:

```text
Chaque Pull Request genere une preview.
Pas de staging stable.
```

Avantages:

- pratique pour revue visuelle;
- peu de gestion manuelle.

Inconvenients:

- pas de staging stable;
- pas adapte aux tests fonctionnels complets avec Auth, Firestore, Storage et Functions;
- environnements ephemeres moins fiables pour validation metier.

Conclusion:

Utile en complement, pas comme strategie principale.

### Decision finale

Strategie Netlify retenue:

```text
Deux sites Netlify independants:

1. Teliya Production
2. Teliya Staging
```

Production:

```text
site: teliya-production
branche: main
Firebase: monbillet-95b77
donnees: reelles
```

Staging:

```text
site: teliya-staging
branche: staging ou release candidate validee
Firebase: teliya-staging
donnees: fictives
```

Deploy previews:

```text
optionnels, utiles pour revue UI, mais non suffisants pour validation Firebase complete.
```

---

## 7. Architecture Firebase

### Projets Firebase

#### Local

Type:

```text
Firebase Emulator Suite
```

Nom logique:

```text
demo-teliya-local
```

Services:

- Firestore Emulator;
- Auth Emulator;
- Functions Emulator;
- Storage Emulator;
- Emulator UI.

Donnees:

```text
fictives, locales, jetables ou seedables
```

#### Staging

Type:

```text
Projet Firebase cloud separe
```

Nom recommande:

```text
teliya-staging
```

Services:

- Firebase Auth;
- Firestore;
- Storage;
- Cloud Functions;
- App Check si active;
- rules et indexes deployes avant validation.

Donnees:

```text
fictives uniquement
```

#### Production

Type:

```text
Projet Firebase cloud existant
```

Nom:

```text
monbillet-95b77
```

Services:

- Firebase Auth;
- Firestore;
- Storage;
- Cloud Functions;
- App Check;
- donnees et utilisateurs reels.

### Regles de separation

1. Le local ne doit jamais utiliser les donnees production.
2. Le staging ne doit jamais recevoir une copie brute de production.
3. La production ne doit recevoir que du code valide localement et en staging.
4. Les deploiements Firebase doivent toujours preciser la cible.
5. Les rules, indexes et functions doivent etre deployes d'abord en staging.

---

## 8. Workflow Git

### Branches comparees

#### `main`

Role:

```text
branche production stable
```

Decision:

```text
doit exister
```

Regles:

- represente l'etat production;
- recoit uniquement du code valide;
- sert de base aux releases production.

#### `infra`

Role:

```text
travaux d'infrastructure
```

Decision:

```text
ne doit pas etre une branche permanente obligatoire
```

Regle:

- utiliser des branches nommees `infra/...` lorsque necessaire;
- ne pas maintenir une branche `infra` longue duree sans raison.

#### `feature`

Role:

```text
travail cible sur une fonctionnalite ou correction
```

Decision:

```text
doit exister sous forme de branches temporaires
```

Convention:

```text
feature/nom-court
fix/nom-court
infra/nom-court
docs/nom-court
```

#### `release`

Role:

```text
preparation d'une livraison production
```

Decision:

```text
utile seulement quand une livraison regroupe plusieurs changements
```

Convention:

```text
release/yyyy-mm-dd
```

Une branche release n'est pas obligatoire pour chaque petit changement.

### Decision finale

Branches reelles recommandees:

```text
main
feature/*
fix/*
infra/*
docs/*
release/* uniquement si necessaire
```

Branches permanentes recommandees:

```text
main uniquement
```

La branche staging permanente n'est pas obligatoire si le site Netlify staging peut etre deploye explicitement depuis une branche de validation ou une release candidate. Pour simplifier l'exploitation, une branche `staging` pourra etre creee si Netlify l'exige, mais elle ne doit pas devenir une deuxieme branche principale complexe.

---

## 9. Strategie de version

### Version Git

Objet:

```text
commits et tags Git
```

Decision:

```text
obligatoire
```

Usage:

- identifier chaque etat livrable;
- rollback;
- audit;
- releases.

Convention recommandee:

```text
vYYYY.MM.DD
vYYYY.MM.DD-rc.1
```

Exemples:

```text
v2026.07.10
v2026.07.10-rc.1
```

### Version Application

Objet:

```text
version visible ou diagnostiquee dans l'application
```

Decision:

```text
utile
```

Usage:

- support utilisateur;
- verification de l'environnement;
- diagnostic de deploiement.

Source recommandee:

```text
VITE_APP_VERSION
```

### Version Firebase

Objet:

```text
version des rules, indexes et functions deployes
```

Decision:

```text
a suivre via Git, pas via un systeme separe au depart
```

Usage:

- chaque changement Firebase doit etre lie a un commit;
- chaque deploy staging/production doit mentionner le commit source;
- les rules et indexes restent versionnes par Git.

### Version Database

Objet:

```text
evolution du modele Firestore et migrations de donnees
```

Decision:

```text
a suivre explicitement des qu'une migration existe
```

Regle:

- toute migration doit avoir un document ou script versionne;
- chaque migration doit etre idempotente ou avoir une procedure de rollback;
- aucune migration manuelle non documentee en production.

### Version Release

Objet:

```text
ensemble coherent de changements livres ensemble
```

Decision:

```text
recommandee pour production
```

Usage:

- notes de release;
- tag Git;
- commit de reference;
- liste des changements Firebase;
- etat Netlify deploye.

### Decision finale

Versions a suivre obligatoirement:

```text
Git version
Application version
Release version
Database migration version quand applicable
```

Version Firebase:

```text
suivie par association commit Git + historique de deploiement
```

---

## 10. Workflow de deploiement

### Regle generale

Aucun deploiement Firebase ne doit etre implicite.

Chaque deploiement doit preciser:

- environnement cible;
- projet Firebase cible;
- commit Git;
- services deployes;
- validation effectuee.

### Deploiement local

Objectif:

```text
developper sans toucher au cloud
```

Etapes:

1. demarrer Firebase Emulator Suite;
2. lancer l'application Vite avec `.env.local`;
3. verifier que `VITE_USE_EMULATORS=true`;
4. executer les tests unitaires;
5. executer les tests de rules si la modification touche Firestore;
6. valider manuellement les parcours critiques.

Services deployes:

```text
aucun
```

### Deploiement staging

Objectif:

```text
valider dans un environnement cloud isole
```

Etapes:

1. partir d'un commit propre;
2. construire l'application avec variables staging;
3. deployer les rules staging si elles ont change;
4. deployer les indexes staging si necessaire;
5. deployer les functions staging si elles ont change;
6. deployer le frontend Netlify staging;
7. valider Auth, Firestore, Storage, Functions et parcours metier;
8. documenter le commit valide.

Ordre recommande:

```text
Firestore Rules
-> Firestore Indexes
-> Cloud Functions
-> Netlify frontend
-> validation fonctionnelle
```

### Deploiement production

Objectif:

```text
livrer uniquement ce qui a ete valide en staging
```

Preconditions:

- commit identique ou tag release issu du commit valide en staging;
- tests locaux OK;
- validation staging OK;
- plan de rollback connu;
- aucune migration non documentee.

Ordre recommande:

```text
tag release
-> deploy Firestore Rules si changees
-> deploy Firestore Indexes si changes
-> deploy Cloud Functions si changees
-> deploy Netlify production
-> verification post-deploiement
```

### Quand deployer chaque service

#### Rules

Deployer quand:

- `firestore.rules` change;
- `storage.rules` change;
- une nouvelle collection ou permission necessite une regle.

Toujours:

- tester localement avec emulateurs avant staging;
- deployer staging avant production.

#### Indexes

Deployer quand:

- `firestore.indexes.json` change;
- une nouvelle requete Firestore exige un index compose;
- Firebase signale un index manquant et que la requete est validee.

Toujours:

- deployer avant le frontend qui depend de la requete;
- surveiller la construction de l'index avant validation finale.

#### Functions

Deployer quand:

- `functions/**` change;
- une variable d'environnement Functions change;
- une dependance Functions change.

Toujours:

- build local;
- validation staging;
- deploy production uniquement apres validation.

#### Hosting / Netlify

Teliya utilise Netlify pour le frontend.

Deployer quand:

- code React/Vite change;
- assets publics changent;
- configuration Netlify change.

Firebase Hosting:

```text
non retenu pour le frontend principal tant que Netlify est la plateforme d'hebergement.
```

---

## 11. Workflow de developpement

Cycle standard:

```text
1. Le developpeur cree une branche courte
   -> feature/*, fix/*, infra/* ou docs/*

2. Le developpeur ecrit le code
   -> changements limites au perimetre

3. Tests locaux
   -> npm run test:run
   -> npm run build

4. Validation Emulator Suite
   -> obligatoire pour rules, auth, firestore, storage ou functions sensibles

5. Revue locale
   -> verification des parcours critiques
   -> aucune donnee production utilisee

6. Commit Git
   -> message clair
   -> un scope coherent

7. Deploiement staging
   -> Firebase staging si necessaire
   -> Netlify staging

8. Validation fonctionnelle staging
   -> comptes fictifs
   -> compagnies fictives
   -> parcours client, agence, compagnie, plateforme selon impact

9. Preparation production
   -> tag ou release note
   -> controle des changements Firebase
   -> rollback connu

10. Deploiement production
    -> uniquement apres validation

11. Verification post-production
    -> logs
    -> parcours critique
    -> absence d'erreurs bloquantes
```

Regle importante:

```text
Le developpement quotidien se fait en LOCAL avec emulateurs.
Le STAGING sert a valider.
La PRODUCTION sert uniquement aux vrais utilisateurs.
```

---

## 12. Ce qui sera cree pendant la Phase 1.3.2

La Phase 1.3.2 pourra creer ou preparer, apres validation explicite:

1. Le projet Firebase staging

```text
teliya-staging
```

2. Les alias Firebase

```text
staging -> teliya-staging
prod    -> monbillet-95b77
```

3. Les variables d'environnement staging

- dans Netlify staging;
- localement si necessaire pour tests;
- jamais commitees avec de vraies valeurs.

4. Le site Netlify staging

Nom recommande:

```text
teliya-staging
```

5. Les procedures de deploiement staging

- deploy rules staging;
- deploy indexes staging;
- deploy functions staging;
- deploy Netlify staging.

6. Les protections contre les erreurs d'environnement

- verification que le local utilise les emulateurs;
- scripts explicites;
- suppression progressive des deploys implicites.

7. Les donnees fictives staging

- compagnies de test;
- agences de test;
- utilisateurs de test;
- reservations fictives;
- donnees comptables fictives minimales.

---

## 13. Ce qui restera a faire apres

Apres la Phase 1.3.2, il restera a:

1. Refactorer progressivement `src/firebaseConfig.ts`

- utiliser `import.meta.env.VITE_FIREBASE_*`;
- conserver le comportement existant;
- ajouter des gardes contre les erreurs d'environnement.

2. Clarifier `src/lib/firebaseClient.ts`

- verifier s'il est encore necessaire;
- l'aligner sur Vite ou le retirer dans une phase dediee.

3. Securiser les scripts Firebase

- supprimer les deploys implicites;
- ajouter des scripts explicites par environnement;
- documenter les commandes autorisees.

4. Mettre en place les tests de rules complets

- couvrir les parcours critiques;
- executer contre Emulator Suite;
- eviter toute dependance production.

5. Formaliser les releases

- tags Git;
- notes de release;
- version application;
- checklist de deploiement.

6. Mettre en place une procedure de seed staging

- donnees fictives reproductibles;
- aucun dump production;
- reset staging possible.

7. Renforcer la CI

- tests unitaires;
- build;
- eventuellement tests rules;
- controle des variables d'environnement attendues.

---

## Decision finale synthetique

Architecture definitive:

```text
LOCAL     -> Firebase Emulator Suite -> demo-teliya-local
STAGING   -> Firebase cloud          -> teliya-staging
PRODUCTION-> Firebase cloud          -> monbillet-95b77
```

Alias Firebase definitifs:

```text
staging -> teliya-staging
prod    -> monbillet-95b77
```

Netlify:

```text
site staging independant
site production independant
```

Git:

```text
main comme seule branche permanente obligatoire
branches temporaires feature/*, fix/*, infra/*, docs/*
release/* seulement si necessaire
```

Regle de securite centrale:

```text
Production ne doit jamais etre la cible implicite du developpement, des tests ou des deploiements.
```
