# TELIYA — Plateforme SaaS de gestion de transport

TELIYA est une plateforme SaaS permettant aux compagnies de transport de gérer leurs opérations :

* réservation de billets (en ligne et au guichet)
* embarquement des passagers
* gestion des colis / courrier
* gestion des véhicules et de la flotte
* trésorerie et comptabilité
* supervision en temps réel par la direction (CEO)

La plateforme est conçue pour les réseaux de transport multi-agences.

---

# Fonctionnalités principales

### Réservation

* réservation en ligne (portail client)
* vente au guichet
* génération de billets avec QR code

### Embarquement

* scan QR code
* validation des passagers
* statistiques d’embarquement

### Courrier / Colis

* création d’envois
* suivi des colis
* réception et remise

### Flotte

* affectation des véhicules
* suivi des trajets
* gestion de l’exploitation

### Finance

* sessions de caisse
* trésorerie
* gestion des dépenses
* comptabilité compagnie

### Supervision

* tableau de bord agence
* command center CEO
* statistiques temps réel

---

# Architecture

TELIYA suit une architecture en 4 couches :

Client → Operations → Finance → Supervision

Technologies utilisées :

* React 18
* TypeScript
* Vite
* Firebase Authentication
* Cloud Firestore
* Tailwind CSS
* Netlify

---

# Démarrage

Installer les dépendances :

```bash
npm install
```

Lancer le serveur de développement :

```bash
npm run dev
```

Ouvrir :

```
http://localhost:5192
```

---

# Scripts principaux

| Commande         | Description                    |
| ---------------- | ------------------------------ |
| npm run dev      | serveur de développement       |
| npm run build    | build production               |
| npm run preview  | preview du build               |
| npm run test:e2e | exécution des tests Playwright |

---

# Structure du projet

```
src/
  modules/       modules métier (agence, compagnie, plateforme)
  components/    composants UI
  utils/         utilitaires
  services/      logique métier
  types/         types TypeScript

docs/
  scénarios métier
  plan de tests
  standards projet
```

---

# Qualité et standards

Les conventions de développement sont définies dans :

```
docs/STANDARDS-PROJET.md
```

Le projet inclut :

* tests Playwright
* documentation des flux métier
* plan de tests E2E

---

# Licence

Projet privé.
