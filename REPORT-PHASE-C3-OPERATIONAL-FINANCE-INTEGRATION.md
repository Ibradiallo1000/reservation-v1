# Rapport Phase C3 — Couche d’intégration finance opérationnelle

## Résumé

Cette phase relie la finance aux opérations et à l’intelligence : classification des dépenses, injection des coûts dans le moteur de profit, historique financier par véhicule, extension des anomalies et du health score, et gouvernance optionnelle (maintenance, carburant). Aucune logique existante n’est supprimée ; tout est additif et compatible Spark.

---

## 1. Fichiers créés / modifiés

### Créés

| Fichier | Rôle |
|--------|------|
| `src/modules/compagnie/treasury/vehicleFinancialHistory.ts` | Collection `vehicleFinancialHistory`, get/list/set, agrégation client par véhicule (fuel, maintenance, operational). |
| `REPORT-PHASE-C3-OPERATIONAL-FINANCE-INTEGRATION.md` | Ce rapport. |

### Modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/modules/compagnie/treasury/expenses.ts` | `EXPENSE_CATEGORIES` (fuel, maintenance, salary, toll, operational, supplier_payment, other) ; champs optionnels `expenseCategory`, `vehicleId`, `tripId`, `linkedMaintenanceId`, `linkedPayableId`, `expenseDate` ; `createExpense` étendu ; `approveExpense` avec validation optionnelle maintenance (seuil + rôle company_accountant/admin_compagnie). |
| `src/modules/compagnie/finance/financialSettingsTypes.ts` | `maintenanceApprovalThreshold`, `fuelExpenseAnomalyLimit` ; valeurs par défaut. |
| `src/modules/compagnie/finance/financialSettingsService.ts` | Lecture/écriture des nouveaux champs avec repli sur les défauts. |
| `src/core/intelligence/riskSettings.ts` | `vehicleCostExplosionPercent`, `maintenanceSpikeCountThreshold`, `tripFuelCostMarginThreshold` ; `mergeWithDefaults` étendu. |
| `src/core/intelligence/anomalyEngine.ts` | Entrées optionnelles : `vehicleFinancialHistories`, `vehicleCosts30d`, `maintenanceCountByVehicle30d`, `tripProfitsWithFuel`, `fuelExpenseAnomalyLimit`, `recentFuelExpenseAmounts`. Nouvelles règles : vehicle cost explosion, maintenance frequency spike, trip fuel cost above margin, vehicle negative lifetime profit, fuel expense above limit. |
| `src/core/intelligence/healthScoreEngine.ts` | `HealthScoreInput` : `costDisciplineRatio`, `vehicleProfitabilityRatio`, `expenseToRevenueRatio`, `outstandingPayablesRatio`. Score 0–100 et catégories inchangés ; pondération 70 % base + 30 % Phase C3 lorsque les ratios sont fournis. |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | `ExpenseRow` étendu (tripId, vehicleId, expenseCategory, status) ; `costByTripId` inclut les dépenses liées par `tripId` (paid/approved) ; état `financialSettings` ; passage de `fuelExpenseAnomalyLimit` et `recentFuelExpenseAmounts` à `detectAnomalies` ; `healthScoreInput` avec `expenseToRevenueRatio` et `outstandingPayablesRatio`. |
| `firestore.rules` | Règles pour `vehicleFinancialHistory` (get, list, create, update pour authentifié ; delete interdit). |

---

## 2. Flux de données (schéma textuel)

```
                    ┌─────────────────┐
                    │   Firestore     │
                    │  (expenses,     │
                    │   tripCosts,    │
                    │   vehicleFin.)  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                    ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
  │ expensesList │   │ tripCostsList│   │ vehicleFinancial │
  │ (category,   │   │ (by trip)    │   │ History (client  │
  │  tripId,     │   │              │   │  aggregation)    │
  │  vehicleId)  │   │              │   └────────┬─────────┘
  └──────┬───────┘   └──────┬───────┘              │
         │                  │                      │
         └────────┬─────────┘                      │
                  ▼                                ▼
         ┌─────────────────┐             ┌─────────────────┐
         │ costByTripId    │             │ detectAnomalies  │
         │ (tripCosts +    │             │ (vehicle neg.    │
         │  expenses/trip) │             │  profit, fuel    │
         └────────┬────────┘             │  limit)          │
                  │                       └─────────────────┘
                  ▼
         ┌─────────────────┐             ┌─────────────────┐
         │ expensesByAgency│             │ computeHealthScore│
         │ (unchanged)      │             │ (+ expense/revenue│
         └────────┬────────┘             │  + payables ratio)│
                  │                       └─────────────────┘
                  ▼
         ┌─────────────────┐
         │ calculateTrip   │
         │ /Agency/Company  │  ← Moteurs purs (sans Firestore)
         │ Profit           │
         └─────────────────┘
```

- **Injection des coûts** : dans le CEO, `costByTripId` et `expensesByAgency` sont construits à partir de Firestore (expenses + tripCosts). Les moteurs de profit restent purs et ne font que sommer des coûts déjà agrégés.
- **Anomalies** : données optionnelles (historique véhicule, dépenses carburant, etc.) chargées côté client et passées à `detectAnomalies`.
- **Health score** : ratios optionnels dérivés des mêmes données (revenus, coûts, payables).

---

## 3. Considérations performance

- **Expenses** : requête `collectionGroup` avec `companyId` et limite (ex. 500). Les index existants suffisent. Les champs optionnels (tripId, vehicleId, expenseCategory) n’exigent pas de nouveaux index pour les requêtes actuelles.
- **Vehicle financial history** : écriture par véhicule (merge). Pas de requêtes composites ; lecture par `companyId` + liste des docs. Agrégation côté client à partir des dépenses déjà chargées.
- **CEO** : un chargement de plus (`getFinancialSettings` déjà fait pour les paiements) ; `detectAnomalies` et `computeHealthScore` restent des calculs en mémoire. Pas d’appel Firestore supplémentaire pour les nouvelles règles si les données optionnelles ne sont pas chargées.

---

## 4. Concurrence

- **Expenses** : création et mise à jour non transactionnelles avec d’autres collections. La validation « maintenance au-dessus du seuil » dans `approveExpense` est une lecture puis écriture séquentielle ; risque de course limité (au pire double approbation).
- **Vehicle financial history** : `setVehicleFinancialHistory` en merge ; plusieurs clients peuvent écrire le même `vehicleId` (dernier écrit gagne). Pour une agrégation cohérente à long terme, une Cloud Function pourrait centraliser les mises à jour.

---

## 5. Scalabilité

- **Volume dépenses** : limite de liste (500) dans le CEO ; au-delà, pagination ou filtres par période/agence/catégorie à prévoir.
- **Vehicle financial history** : un document par véhicule ; nombre de véhicules typiquement borné par compagnie. Agrégation client acceptable tant que le nombre de dépenses chargées reste raisonnable.
- **Anomalies** : nouveaux tableaux optionnels (vehicleCosts30d, maintenanceCountByVehicle30d, etc.) ; taille proportionnelle au nombre de véhicules/trajets. Pas de requête Firestore dans le moteur.

---

## 6. Avantage stratégique

- **Caméra financière** : chaque dépense est classifiable (fuel, maintenance, toll, operational, etc.) et reliée à un trip, un véhicule ou un payable. Les tableaux de bord et rapports peuvent segmenter par catégorie et par entité opérationnelle.
- **Profit réel** : le profit trajet/agence/compagnie intègre les dépenses liées (tripId, agencyId), pas seulement les tripCosts. Meilleure visibilité sur la rentabilité par trajet et par agence.
- **Rentabilité véhicule** : l’historique financier par véhicule (coûts fuel/maintenance/operational, revenus et profit si renseignés) permet au CEO d’identifier les actifs déficitaires et d’ajuster la flotte.
- **Alertes proactives** : anomalies sur explosion de coûts véhicule, fréquence de maintenance, dépassement du seuil carburant et rentabilité véhicule négative ; health score enrichi par la discipline des coûts et le ratio dépenses/revenus et payables.

---

## 7. Gouvernance (WAVE 6)

- **Maintenance** : si `expenseCategory === "maintenance"` et `amount > maintenanceApprovalThreshold` (financialSettings), `approveExpense` n’accepte que les rôles `company_accountant` ou `admin_compagnie`. Sinon erreur explicite.
- **Carburant** : si une dépense carburant a un montant > `fuelExpenseAnomalyLimit` (financialSettings), la règle « fuel_expense_above_limit » du moteur d’anomalies est déclenchée (données fournies par le CEO : `recentFuelExpenseAmounts`, `fuelExpenseAnomalyLimit`).
- Les seuils sont dans `companies/{companyId}/financialSettings/current` ; pas de suppression d’écriture côté UI (règles Firestore inchangées pour expenses : delete interdit).

---

## 8. Rétrocompatibilité

- **Expenses** : `category` conservé ; `expenseCategory` optionnel. Les dépenses existantes sans tripId/vehicleId restent prises en compte dans `expensesByAgency` ; elles n’alimentent `costByTripId` que si `tripId` est renseigné.
- **Profit engine** : signatures inchangées ; les nouveaux coûts sont injectés par le caller (CEO) dans les totaux déjà passés aux moteurs.
- **Anomaly / health score** : tous les nouveaux champs sont optionnels ; en leur absence, le comportement reste celui d’avant C3.

---

*Phase C3 — Operational Finance Integration Layer — Rapport de livraison.*
