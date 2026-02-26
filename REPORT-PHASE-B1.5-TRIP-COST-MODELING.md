# Rapport Phase B1.5 — Real Trip Cost Modeling

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/core/intelligence/tripCosts.ts` | Modèle de données : `TripCostDoc`, `TripCostDocCreate`, `totalOperationalCost()`, `tripCostDocToInput()` pour le moteur de profit. |
| `src/core/intelligence/tripCostsService.ts` | Service Firestore : `createTripCost`, `updateTripCost`, `listTripCosts`, `getTripCost`. Aucune suppression. |
| `src/modules/compagnie/pages/TripCostsPage.tsx` | Page interne `/compagnie/:companyId/trip-costs` : création, édition (même jour uniquement), historique. Pas de suppression. |

## 2. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/core/intelligence/types.ts` | `TripCostInput` : ajout de `toll`, `maintenance`, `otherOperational`. `AgencyProfitInput` : ajout de `tripCostsTotal`. |
| `src/core/intelligence/profitEngine.ts` | `calculateTripProfit` : somme de tous les champs de coût (dont toll, maintenance, otherOperational). `calculateAgencyProfit` : coût = expensesTotal + tripCostsTotal + discrepancyDeduction. |
| `src/core/intelligence/index.ts` | Export de `tripCosts`, `tripCostsService` (types et fonctions). |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Chargement `tripCosts` (date = aujourd’hui), agrégations `tripCostsByAgency`, `costByTripId`, intégration dans `agencyProfits` et `tripProfitsSorted`. Nouveaux KPIs : coût opérationnel trajets total, marge après coûts opérationnels, trajet le plus coûteux. |
| `src/constants/routePermissions.ts` | Nouveau : `tripCosts: ["chefAgence", "company_accountant", "admin_compagnie", "admin_platforme"]`. |
| `src/AppRoutes.tsx` | Route `/compagnie/:companyId/trip-costs` avec `PrivateRoute` + `TripCostsPage` (hors layout CEO). |
| `firestore.rules` | Bloc `match /tripCosts/{tripCostId}` : lecture si authentifié ; create/update via `canWriteTripCosts` (admin_compagnie, admin_platforme, company_accountant, financial_director, chefAgence limité à son agencyId) ; delete interdit. |
| `firestore.indexes.json` | Index pour `tripCosts` : (date, createdAt DESC), (agencyId, createdAt DESC), (date, agencyId, createdAt DESC). |

## 3. Flux de données

1. **Écriture**
   - **Création** : `TripCostsPage` → `createTripCost(companyId, data, uid)` → `setDoc` sur `companies/{companyId}/tripCosts/{id}` avec tripId, agencyId, date, fuelCost, driverCost, assistantCost, tollCost, maintenanceCost, otherOperationalCost, createdAt, createdBy.
   - **Mise à jour** : uniquement le même jour (contrôle UI) ; `updateTripCost(companyId, id, { fuelCost, ... })` → `updateDoc` (pas de modification de tripId, agencyId, date, createdAt, createdBy).

2. **Lecture**
   - **TripCostsPage** : `listTripCosts(companyId, { date, agencyId? })` → utilisée pour l’historique et le filtre par date ; si chefAgence, `agencyId` = agence de l’utilisateur.
   - **CEO Command Center** : dans `load()`, un `getDocs` sur `companies/{companyId}/tripCosts` avec `where("date", "==", TODAY)` ; les docs sont agrégés en mémoire par agence (`tripCostsByAgency`) et par trajet (`costByTripId`).

3. **Moteur de profit (inchangé en logique pure)**
   - **Trajet** : le caller (CEO dashboard) fournit `costs: { operational: total }` lorsque des `tripCosts` existent pour ce tripId ; sinon coût = 0.
   - **Agence** : le caller passe `tripCostsTotal` (somme des coûts opérationnels des tripCosts de l’agence) en plus de `expensesTotal` et `discrepancyDeduction`.

## 4. Sécurité

- **Règles Firestore** : lecture `tripCosts` si `isAuth()`. Création / mise à jour via `canWriteTripCosts(isCreate)` :
  - admin_compagnie, admin_platforme : tous champs.
  - company_accountant, financial_director : tous champs.
  - chefAgence : création uniquement si `request.resource.data.agencyId == getUserAgencyId()` ; mise à jour uniquement si `resource.data.agencyId == getUserAgencyId()`.
- **Suppression** : `allow delete: if false` pour toute la collection.
- **Données utilisateur** : `getUserAgencyId()` lit `users/{uid}.agencyId` ; une lecture utilisateur par écriture pour un chefAgence.

## 5. Scalabilité

- **Collection** : un document par (trajet, agence, date) ; croissance linéaire avec le nombre de trajets × agences × jours.
- **Requêtes** : index sur (date, createdAt), (agencyId, createdAt), (date, agencyId, createdAt) pour éviter les full collection scans.
- **CEO dashboard** : une lecture `tripCosts` par chargement (where date == TODAY, limit 300) ; pas de listener.
- **Plafond** : 300 docs par jour par compagnie reste raisonnable pour Spark ; au-delà, pagination ou requêtes par plage de dates.

## 6. Performance

- **TripCostsPage** : une requête `listTripCosts` au chargement et après chaque create/update ; pas de temps réel.
- **CEO** : une requête getDocs supplémentaire dans le même `load()` ; agrégations en mémoire (useMemo) ; pas de N+1.
- **Index** : nécessaires pour les combinaisons date, agencyId et orderBy createdAt ; sans eux, les requêtes peuvent échouer ou dégrader.

## 7. Évolutions futures

- **Estimation automatique du carburant** : champ dérivé ou Cloud Function déclenchée par création de tripCost / fin de trajet (distance × consommation) ; mise à jour optionnelle de `fuelCost`.
- **Prédiction des coûts (IA)** : modèle entraîné sur historique (tripId, jour, agence) pour suggérer fuelCost, driverCost, etc. à la création ; reste une aide, pas de write automatique sans validation.
- **Mobile money** : commission par réservation en ligne ; aujourd’hui non stockée dans `tripCosts` ; possible champ `mobileMoneyCommission` par document ou calcul côté client à partir des réservations.
- **Audit** : champ `updatedAt` / `updatedBy` déjà prévus côté service ; règles pourraient imposer l’absence de modification de tripId/agencyId/date.

## 8. Goulots d’étranglement

- **Lecture user pour chefAgence** : chaque create/update par un chefAgence déclenche une lecture du document `users/{uid}` dans la règle (`getUserAgencyId()`). Coût : 1 read par write pour ce rôle.
- **Pas de cache côté client** : chaque ouverture de TripCostsPage refait un `listTripCosts` ; acceptable pour un usage interne.
- **CEO** : agrégation en mémoire de tous les tripCosts du jour ; au-delà de quelques centaines de docs, envisager une limite ou un pré-agrégat (ex. Cloud Function quotidienne).

## 9. Concurrence

- **Pas de transaction** : création et mise à jour de trip costs indépendantes ; pas de verrou sur un “trajet” donné ; deux utilisateurs peuvent créer deux coûts pour le même (tripId, agencyId, date) → doublon possible. À traiter en amont (contrainte métier ou règle “un document par (tripId, agencyId, date)” avec merge ou erreur).
- **Édition même jour** : la règle n’impose pas la date ; seule l’UI empêche l’édition des jours passés. Une modification directe de l’API pourrait changer un ancien document ; en cas de besoin, ajouter en règle : `resource.data.date == request.time.date()` ou équivalent.

---

*Rapport Phase B1.5 — Real Trip Cost Modeling. Aucune Cloud Function, compatible Spark, logique existante préservée.*
