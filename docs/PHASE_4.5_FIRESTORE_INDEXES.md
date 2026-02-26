# Phase 4.5 — Index composites Firestore (documentation uniquement, ne pas déployer automatiquement)

Les index listés ci-dessous sont recommandés pour optimiser les requêtes introduites ou utilisées en Phase 4.5. Les créer dans la console Firebase (Firestore > Index) si les requêtes déclenchent une erreur d’index manquant.

## 1. Réservations (agence)

- **Collection** : `companies/{companyId}/agences/{agencyId}/reservations`
- **Champs** : `date` (Ascending), `statut` (Ascending)
- **Usage** : requêtes type « réservations du jour par statut » (ex. liste des réservations payées/validées du jour).

## 2. Fleet vehicles

- **Collection** : `companies/{companyId}/fleetVehicles`
- **Champs** : `status` (Ascending), `currentAgencyId` (Ascending)
- **Usage** : filtrage par statut et par agence (ex. véhicules en transit pour une agence).

## 3. Shifts (agence)

- **Collection** : `companies/{companyId}/agences/{agencyId}/shifts`
- **Champs** : `status` (Ascending), `agencyId` (Ascending) — ou requête sur `status` seul avec `in`
- **Usage** : écoute des postes actifs/clôturés/validés (Manager Dashboard).

## 4. Shift reports (optionnel)

- **Collection** : `companies/{companyId}/agences/{agencyId}/shiftReports`
- **Champs** : `startAt` (Ascending), `status` (Ascending)
- **Usage** : rapports du jour par statut (déjà utilisé en Phase 2).

## 5. Phase 5 — Collection group (CEO Command Center)

- **Collection group** : `dailyStats`
- **Champs** : `companyId` (Ascending), `date` (Ascending)
- **Usage** : requête CEO sur tous les dailyStats de la compagnie pour une date (centre de commande).

- **Collection group** : `agencyLiveState`
- **Champs** : `companyId` (Ascending)
- **Usage** : requête CEO sur tous les états en direct des agences.

---

Ne pas déployer les index via CLI sans validation préalable (coût stockage/écritures). Créer au besoin depuis la console après vérification des requêtes.
