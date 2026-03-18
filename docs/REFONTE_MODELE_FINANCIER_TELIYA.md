# Refonte du modèle financier TELIYA

## Principes

- **Une source de vérité par concept** : Vente → reservation ; Paiement → cashTransaction liée à reservation ; Validation → statut/événement lié à reservation.
- **Règles de date** : Ventes temps réel → `createdAt` ; Encaissements → `paidAt` ; Revenus validés → `validatedAt`.
- **Lien obligatoire** : Chaque cashTransaction doit avoir un `reservationId` valide (réservation existante et vendue). Sinon, considérée orpheline et exclue des encaissements principaux.

## Modifications techniques

### 1. Cash (cashTypes + cashService)

- **paidAt** (string YYYY-MM-DD) : date réelle d’encaissement. Utilisée pour les requêtes par période. Nouvelle création : `paidAt = getTodayBamako()` (guichet et en ligne).
- **Statuts** : `paid` | `refunded` | `orphan` | `cancelled`. Les orphelines ne sont pas incluses dans le total encaissements.
- **markCashTransactionRefunded** : appelé systématiquement à chaque annulation de réservation (même si montant 0), et enregistre `refundedAt`.
- **getCashTransactionsByPaidAtRange** : requête par `paidAt` (index Firestore requis).

### 2. Réservations

- **validatedAt** (Timestamp) : renseigné lorsque la session guichet est validée par le chef comptable (`validateSessionByHeadAccountant`). Utilisé pour le calcul des « revenus validés ».

### 3. Calculs (financialConsistencyService)

- **getTotalSales(period)** : somme des réservations vendues (createdAt dans la période).
- **getTotalCash(period)** : somme des cashTransactions `paid` avec réservation valide, filtrées par `paidAt`. Retourne aussi `orphanAmount` et `orphanTransactions`.
- **getValidatedRevenue(period)** : somme des réservations ayant `validatedAt` dans la période.
- **detectFinancialInconsistencies(period)** : orphelines, réservations vendues sans encaissement, écart (encaissements > ventes).

### 4. Service unifié (unifiedFinanceService)

- **Live** : getTotalSales + revenus courrier (shipments).
- **Cash** : getTotalCash (sans orphelines) ; `orphanAmount` exposé dans la réponse.
- **Validated** : getValidatedRevenue (réservations) + courier depuis dailyStats (dérivé).

### 5. Decision Engine (CEO)

- Si **encaissements (total + orphelines) > ventes** : problème « Écart financier détecté », action « Vérifier transactions orphelines ».

### 6. Migration des données

- **Script** : `scripts/migrateFinancialConsistency.ts`.
  - Backfill **paidAt** : pour toute cashTransaction sans `paidAt`, mettre `paidAt = date` (ou date déduite de `createdAt`).
  - **Orphelines** : pour chaque transaction `paid`, si `reservationId` manquant ou réservation absente/annulée → `status = orphan`.
- Exécution : `npx ts-node scripts/migrateFinancialConsistency.ts <companyId>` (après configuration Firebase).

## Index Firestore

- `cashTransactions` : `paidAt` ASC (collectionGroup ou sous `companies/{id}` selon structure).
- `reservations` : `companyId` + `createdAt` ASC ; `companyId` + `validatedAt` ASC ; `companyId` + `agencyId` + `validatedAt` ASC.

Voir `firestore.indexes.json` à la racine du projet.

## Interdictions

- Ne pas utiliser dailyStats comme seule source pour les montants critiques (ils restent une vue dérivée).
- Ne pas corriger uniquement l’affichage : les calculs s’appuient sur les nouvelles sources (createdAt, paidAt, validatedAt) et le lien reservation ↔ cashTransaction.
