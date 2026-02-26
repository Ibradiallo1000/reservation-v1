# Rapport détaillé – Phase 1 TELIYA (Refactor structurel)

## 1. Fichiers modifiés

| Fichier | Modifications |
|---------|---------------|
| `src/constants/roles.ts` | Ajout du rôle `CHEF_GARAGE: 'chef_garage'`. |
| `src/constants/routePermissions.ts` | Ajout de `companyFleet: ["chef_garage", "admin_compagnie", "admin_platforme"]` ; `compagnieLayout` inclut déjà `chef_garage` pour l’accès au menu compagnie. |
| `src/contexts/AuthContext.tsx` | Redirection par défaut pour `chef_garage` vers `/compagnie` (landing avec companyId géré par RoleLanding). |
| `src/routes/RoleLanding.tsx` | Ajout de `chef_garage: "/compagnie/fleet"` dans `roleHome` ; utilisation de `useParams` pour injecter `companyId` dans les chemins `/compagnie/fleet` et `/compagnie/command-center`. |
| `src/AppRoutes.tsx` | Route `fleet` sous `/compagnie/:companyId` pointe vers `GarageDashboardPage` (lazy). Accès protégé par `PrivateRoute` avec `routePermissions.compagnieLayout` (inclut `chef_garage`). |
| `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` | Menu réorganisé : « Opérations & Flotte » supprimé ; entrées distinctes « Opérations » (BarChart2, `operations-reseau`) et « Flotte » (Truck, `fleet`). Ordre : Poste de Pilotage, Revenus & Liquidités, Performance Réseau, Opérations, Flotte, Contrôle & Audit, Avis Clients, Configuration. |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Nettoyage Cockpit : suppression des contrôles et métriques de validation des paiements (état et chargement `pendingProposals`, `pendingPaymentsCeoCount`, etc.) ; suppression du message technique sur les index collectionGroup ; suppression de la section « Activité opérationnelle » (métriques micro-opérationnelles) ; suppression des risques « Paiements en attente » et « Sessions non validées » dans la santé ; bloc Flotte basé sur `companies/{companyId}/vehicles` via `listVehicles` avec KPIs : Total, En service, En transit, Maintenance, Accidentés, Hors service, Garage ; bouton « Voir la flotte » vers `/compagnie/:companyId/fleet`. |
| `src/modules/compagnie/commandCenter/CEOCommandCenterBlocks.tsx` | Suppression de la ligne « Ventes en attente de validation » dans le bloc État global. Le bouton « Voir la flotte » était déjà présent dans Actions rapides. |
| `src/modules/compagnie/components/parametres/ParametresPersonnel.tsx` | Ajout du rôle `chef_garage` dans `CompanyRoleCreate` et `AnyRole` ; libellé « Chef garage (flotte) » dans `ROLE_LABELS` ; options « Chef garage (flotte) » dans les selects d’ajout et d’édition du personnel. |

---

## 2. Fichiers créés

| Fichier | Rôle |
|---------|------|
| `src/modules/compagnie/fleet/vehicleTypes.ts` | Types et constantes pour les véhicules au niveau compagnie : `VEHICLE_STATUS` (GARAGE, EN_SERVICE, EN_TRANSIT, EN_MAINTENANCE, ACCIDENTE, HORS_SERVICE), type `VehicleStatus`, interface `VehicleDoc`, `VEHICLES_COLLECTION = "vehicles"`. |
| `src/modules/compagnie/fleet/vehiclesService.ts` | Service Firestore pour `companies/{companyId}/vehicles` : `vehiclesRef`, `vehicleRef`, `listVehicles`, `getVehicle`, `updateVehicleStatus`, `updateVehicleCity`, `declareTransit`, `declareMaintenance`, `declareAccident`, `createVehicle`. Aucun `collectionGroup` ; écritures uniquement vers la collection compagnie. |
| `src/modules/compagnie/pages/GarageDashboardPage.tsx` | Tableau de bord Chef Garage : cartes (Total véhicules, En service, En transit, Maintenance, Accidentés, Hors service), tableau (Plaque, Modèle, Année, Statut, Ville actuelle, Destination), actions par véhicule (changer statut, ville, déclarer transit/maintenance/accident). Utilise `listVehicles` et le service flotte. Lien « Retour au centre de commande » vers `command-center`. |

---

## 3. Structure Firestore

- **Nouvelle collection (company-level)**  
  `companies/{companyId}/vehicles/{vehicleId}`

  Schéma document :
  - `plateNumber` (string)
  - `model` (string)
  - `year` (number)
  - `status` : `"GARAGE"` | `"EN_SERVICE"` | `"EN_TRANSIT"` | `"EN_MAINTENANCE"` | `"ACCIDENTE"` | `"HORS_SERVICE"`
  - `currentCity` (string)
  - `destinationCity` (string, optionnel)
  - `createdAt`, `updatedAt` (Timestamp)

- **Aucune modification de structure existante** : pas de migration Firestore de prod. La collection `companies/{companyId}/fleetVehicles` (et les routes agence `/agence/fleet`) restent en place ; la flotte « officielle » Phase 1 est `companies/{companyId}/vehicles`.

- **Aucun `collectionGroup`** utilisé pour les véhicules.

- **Aucune référence** à `agences/{agencyId}/vehicles` (le projet utilisait déjà `companies/{companyId}/fleetVehicles`).

---

## 4. Rôles et accès

- **Nouveau rôle** : `CHEF_GARAGE` (`chef_garage`).
- **Permissions** :
  - `compagnieLayout` : accès au layout compagnie (menu avec Flotte) pour `admin_compagnie`, `admin_platforme`, `chef_garage`.
  - `companyFleet` : accès dédié à la flotte compagnie pour `chef_garage`, `admin_compagnie`, `admin_platforme`.
- **Landing** : utilisateur avec rôle `chef_garage` est redirigé vers `/compagnie` (AuthContext) puis, dans le layout compagnie, RoleLanding envoie vers `/compagnie/:companyId/fleet`.
- **Paramètres personnel** : le rôle « Chef garage (flotte) » est proposé à la création et à l’édition d’utilisateurs au niveau compagnie.

---

## 5. Ajustements CEO Cockpit

- **Supprimé** :
  - Contrôles de validation des paiements (lien « Voir » vers payment-approvals, bloc « X paiement(s) en attente »).
  - Métriques « en attente de validation » (ventes en attente dans le bloc État global, KPIs « En attente validation » dans l’ancienne section Activité opérationnelle).
  - Message technique « Index collectionGroup non disponible ».
  - Indicateurs de santé liés aux paiements (> 48h) et aux sessions non validées.
  - Section « 3. Activité opérationnelle » (sessions actives, en attente validation, embarquements ouverts, agences avec état).
  - Chargement de `listPendingPaymentProposals`, `getFinancialSettings` et états associés dans le Cockpit.

- **Ajouté / modifié** :
  - Bloc **3. Flotte** (company-level uniquement) : données via `listVehicles(companyId)` sur `companies/{companyId}/vehicles` ; KPIs : Total, En service, En transit, Maintenance, Accidentés, Hors service, Garage.
  - Bouton **« Voir la flotte »** dans ce bloc, redirigeant vers `/compagnie/:companyId/fleet` (GarageDashboardPage).
  - Renumérotation des blocs : 4. Alertes, 5. Position financière (résumé uniquement, sans bloc paiements).

---

## 6. Restructuration du menu compagnie

- **Ordre des entrées** :
  1. Poste de Pilotage (`command-center`)
  2. Revenus & Liquidités (`revenus-liquidites`)
  3. Performance Réseau (`dashboard`)
  4. Opérations (`operations-reseau`) — badge « preuves en ligne » conservé
  5. **Flotte** (`fleet`) — entrée indépendante
  6. Contrôle & Audit (`comptabilite`)
  7. Avis Clients (`avis-clients`)
  8. Configuration (`parametres`)

- **Supprimé** : l’entrée unique « Opérations & Flotte » ; Flotte est une entrée séparée avec icône Truck.

---

## 7. Résumé des contraintes respectées

- Aucune modification de la logique de réservations.
- Aucun `collectionGroup` pour les véhicules.
- Aucune implémentation de rentabilité (Phase 2).
- Aucune modification de la structure Firestore de prod sans migration contrôlée (nouvelle collection `vehicles` uniquement).
- Code typé, modulaire ; écritures Firestore limitées au service flotte.

---

*Rapport généré à l’issue de l’implémentation Phase 1 TELIYA.*
