# Phase 3 — Boarding & Fleet Architecture Refactor

**Rapport de livraison — Teliya Agency Operational Core**

---

## 1. Résumé

La Phase 3 sépare l’embarquement de l’espace Agency Manager, introduit un module Flotte dédié avec suivi inter-agences, et ajoute deux rôles RBAC : `agency_boarding_officer` et `agency_fleet_controller`. L’ensemble reste compatible Firebase Spark (pas de Cloud Functions requises).

---

## 2. Nouveaux fichiers

| Fichier | Description |
|--------|-------------|
| `src/modules/agence/boarding/BoardingLayout.tsx` | Layout dédié embarquement (nav: Départs du jour, Scan) |
| `src/modules/agence/boarding/BoardingDashboardPage.tsx` | Liste des départs du jour, lien vers scan par départ |
| `src/modules/agence/boarding/BoardingScanPage.tsx` | Page scan avec capacité véhicule (fleetVehicles) |
| `src/modules/agence/boarding/utils.ts` | Utilitaires partagés boarding |
| `src/modules/agence/boarding/index.ts` | Exports du module boarding |
| `src/modules/agence/fleet/types.ts` | Types FleetVehicle, FleetVehicleStatus, affectationKey |
| `src/modules/agence/fleet/FleetLayout.tsx` | Layout dédié flotte (Tableau de bord, Affectation, Véhicules, Mouvements) |
| `src/modules/agence/fleet/FleetDashboardPage.tsx` | Dashboard: garage, affectés, en transit, maintenance, approchant l’agence |
| `src/modules/agence/fleet/FleetAssignmentPage.tsx` | Affectation véhicule (écrit legacy affectations + fleetVehicles) |
| `src/modules/agence/fleet/FleetVehiclesPage.tsx` | Liste/filtre véhicules, changement de statut (sauf in_transit) |
| `src/modules/agence/fleet/FleetMovementLogPage.tsx` | Historique mouvements (lastMovementAt) |
| `src/modules/agence/fleet/migrateLegacyAffectations.ts` | Migration affectations → fleetVehicles, marquage migré |
| `src/modules/agence/fleet/index.ts` | Exports du module fleet |

---

## 3. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/roles-permissions.ts` | Rôles `agency_boarding_officer`, `agency_fleet_controller` ; modules `boarding`, `fleet` ; permissions par rôle |
| `src/constants/roles.ts` | Constantes `AGENCY_BOARDING_OFFICER`, `AGENCY_FLEET_CONTROLLER` |
| `src/modules/auth/components/PrivateRoute.tsx` | KNOWN_ROLES et defaultLandingByRole pour les deux rôles |
| `src/contexts/AuthContext.tsx` | KNOWN_ROLES, landingTargetForRoles (boarding → /agence/boarding, fleet → /agence/fleet) |
| `src/routes/RoleLanding.tsx` | roleHome pour agency_boarding_officer, agency_fleet_controller |
| `src/AppRoutes.tsx` | routePermissions.boarding / .fleet ; routes /agence/boarding/* et /agence/fleet/* ; RoleLanding pour embarquement/fleet |
| `src/modules/agence/pages/AgenceShellPage.tsx` | Redirection boarding_officer → /agence/boarding, fleet_controller → /agence/fleet ; nav « Embarquement » → /agence/boarding, « Flotte » → /agence/fleet |
| `src/types/index.ts` | Types FleetVehicle, FleetVehicleStatus, champs currentDate/currentHeure, migratedFromAffectation |
| `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` | Prop vehicleCapacity ; contrôle capacité dans transaction ; à la clôture : mise à jour fleetVehicles status → in_transit ; import updateDoc |
| `firestore.rules` | isBoardingOfficer, isFleetController, canReadFleet, canModifyFleet ; règles boardingClosures, boardingLogs, boardingLocks, affectations, fleetVehicles ; mise à jour in_transit autorisée pour boarding officer |

---

## 4. Règles Firestore

- **boardingClosures** : lecture auth ; création/mise à jour pour boarding_officer ou agency_manager.
- **boardingLogs** : lecture auth ; création pour boarding_officer ou agency_manager.
- **boardingLocks** : lecture/création pour boarding_officer ou agency_manager.
- **affectations** (legacy) : lecture auth ; création/mise à jour pour canModifyFleet ou agency_manager (aligné avec ancien usage).
- **fleetVehicles** :
  - Lecture : canReadFleet (fleet_controller, agency_manager, boarding_officer).
  - Création : canModifyFleet (fleet_controller uniquement).
  - Mise à jour : (1) fleet_controller avec contraintes in_transit (champs limités), ou (2) boarding_officer uniquement pour passage assigned → in_transit (champs status, updatedAt, lastMovementAt).
  - Aucune suppression.

---

## 5. Logique de migration

- **Fichier** : `src/modules/agence/fleet/migrateLegacyAffectations.ts`.
- **Fonctions** :
  - `listLegacyAffectations(companyId)` : liste toutes les affectations legacy (toutes agences).
  - `migrateOneAffectation(companyId, agencyId, affectationId, capacity)` : crée un doc dans `companies/{companyId}/fleetVehicles` à partir de l’affectation, puis marque l’affectation avec `migratedToFleetAt` (merge).
  - `migrateAllLegacyAffectations(companyId, capacityDefault)` : migre toutes les affectations non encore migrées.
- Les docs legacy ne sont pas supprimés ; le flag permet d’éviter les doublons et de garder l’historique.

---

## 6. Impact performance

- **Lecture** : Boarding et Fleet ajoutent des lectures Firestore (weeklyTrips, reservations, fleetVehicles, agences). Pas de collection group coûteux.
- **Écriture** : À la clôture d’embarquement, une requête + N updates sur fleetVehicles (N = véhicules concernés, en pratique 1 par départ). Migration one-shot par compagnie.
- **Index** : Les requêtes fleetVehicles utilisent currentAgencyId, currentDate, currentHeure, status, currentTripId. Des index composites peuvent être requis (Firebase les propose dans la console en cas d’erreur).

---

## 7. Risques identifiés

- **Concurrence** : Deux utilisateurs qui assignent le même véhicule ou qui clôturent le même départ peuvent écraser des données. Les transactions côté boarding (verrou + absents) limitent une partie du risque ; pas de transaction cross-collection avec fleetVehicles.
- **Rôles Firestore** : Les règles s’appuient sur `users/{uid}.role`. Si le rôle est un tableau, la fonction `getUserRole()` (get('role','')) peut ne pas refléter un rôle multiple ; à valider selon le schéma utilisateur.
- **Migration** : Exécution manuelle ou via un bouton « Migrer » (non implémenté dans l’UI) ; à documenter pour l’opérationnel.

---

## 8. Scalabilité

- **Multi-agences** : Le modèle fleetVehicles par compagnie avec currentAgencyId/currentArrival permet le suivi inter-agences. Les requêtes sont scopées companyId.
- **Volume** : Pour un grand nombre de véhicules et de mouvements, FleetMovementLogPage (derniers 100) et listes non paginées peuvent devenir lentes ; pagination ou limite côté client recommandées à terme.
- **Synchronisation** : Pas de Cloud Functions ; la cohérence (ex. passage in_transit à la clôture) dépend du client. En cas d’échec réseau après clôture, le véhicule peut rester « assigned » ; un job ou une vérification manuelle peut être nécessaire.

---

## 9. Critical Analysis & Architectural Recommendations

### 9.1 Optimisations suggérées

- **Cache local** : Mettre en cache (React Query / SWR) les listes fleetVehicles et weeklyTrips pour réduire les lectures et améliorer la réactivité.
- **Pagination** : Paginer FleetVehiclesPage et FleetMovementLogPage dès que le nombre de véhicules ou de mouvements dépasse quelques dizaines.
- **Index Firestore** : Documenter et créer les index composites nécessaires pour les requêtes fleetVehicles (currentAgencyId + currentDate + currentHeure + status, etc.).

### 9.2 Goulots d’étranglement potentiels

- **Clôture d’embarquement** : Plusieurs updates séquentiels sur fleetVehicles après la transaction ; pour beaucoup de départs simultanés, regrouper en batch ou accepter une latence.
- **Dashboard flotte** : Une lecture complète de fleetVehicles par chargement ; avec des centaines de véhicules, filtrer côté serveur (par statut / agence) et paginer.

### 9.3 Risques de concurrence

- **Double affectation** : Un même véhicule (même plaque/code) peut être affecté à deux départs si deux contrôleurs travaillent en parallèle. Recommandation : vérifier en lecture que le véhicule n’est pas déjà « assigned » avant d’écrire, ou utiliser une transaction Firestore incluant la lecture du véhicule et l’écriture.
- **Clôture et fleet** : La mise à jour in_transit après clôture n’est pas dans la même transaction que le verrou de clôture. En cas de crash entre les deux, état incohérent ; un script ou une fonction « réconciliation » (par ex. vérifier les boardingClosures et mettre à jour les véhicules concernés) peut combler les trous.

### 9.4 Risques de synchronisation multi-agences

- **Vue partagée** : Plusieurs agences lisent/écrivent fleetVehicles. Les règles limitent les écritures (fleet_controller, boarding pour in_transit uniquement) ; les lectures sont larges (toute la flotte compagnie). Pas de verrou distribué ; le « dernier écrit gagne » reste le modèle.
- **Arrivée (arrived)** : La Phase 3 prévoit le passage à « arrived » et currentAgencyId = agence de destination en phase ultérieure. À implémenter avec une règle Firestore qui restreint les mises à jour (ex. seul un rôle « arrival_confirmer » ou fleet_controller peut passer in_transit → arrived et mettre à jour currentAgencyId).

### 9.5 Propositions d’architecture alternatives

- **Cloud Functions (hors Spark)** : Déplacer la mise à jour « assigned → in_transit » et « in_transit → arrived » dans des triggers (onCreate boardingClosures, ou onUpdate) pour garantir la cohérence et réduire la logique côté client.
- **Sous-collection par agence** : Au lieu de une collection fleetVehicles par compagnie, une sous-collection par agence (ex. `agences/{agencyId}/fleetAssignments`) pour les affectations courantes, avec un doc « état global » par véhicule ailleurs si besoin. Réduit les requêtes par agence mais complique la vue « flotte globale ».
- **Événements de mouvement** : Stocker les changements de statut dans une collection `fleetMovementEvents` (vehicleId, fromStatus, toStatus, at, userId) et dériver l’état actuel par agrégation ou par dernier événement. Utile pour audit et replay ; plus coûteux en lectures si l’état courant est souvent dérivé.

### 9.6 Roadmap d’amélioration long terme

1. **Court terme** : Ajouter un bouton « Migrer les affectations » dans l’UI Flotte (FleetDashboardPage ou paramètres) qui appelle `migrateAllLegacyAffectations(companyId)`.
2. **Moyen terme** : Implémenter le flux « Arrivée » (confirmation à l’agence de destination, passage in_transit → arrived, mise à jour currentAgencyId) et les règles Firestore associées.
3. **Long terme** : Si passage à un plan Blaze, introduire des Cloud Functions pour transitions de statut et pour réconciliation (boardingClosures vs fleetVehicles).
4. **UX** : Notifications ou indicateurs en temps réel (ex. « Véhicules approchant ») via onSnapshot sur fleetVehicles filtré par currentArrival = agencyId.

---

**Document généré dans le cadre de la Phase 3 — Boarding & Fleet Architecture Refactor.**
