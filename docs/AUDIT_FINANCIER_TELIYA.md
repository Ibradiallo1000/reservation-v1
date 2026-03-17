# Audit financier complet — TELIYA

**Objectif :** Identifier toutes les sources de données liées à l’argent dans l’application afin d’établir une source unique de vérité financière.

**Périmètre :** Lecture du code uniquement — aucune modification. Compréhension du flux financier complet.

---

## 1. Collections Firestore liées à l’argent

### 1.1 Réservations (billets)

| Chemin Firestore | Rôle |
|------------------|------|
| `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}` | Source de vérité par réservation. |

**Champs financiers :**
- `montant` — montant de la réservation (billet).
- `ticketRevenueCountedInDailyStats` — garde-fou pour ne compter qu’une fois le montant dans `dailyStats` (résa en ligne).
- `canal` — `guichet` | `en_ligne` (impacte qui met à jour dailyStats : session vs transition statut).
- `shiftId` — présent pour les ventes guichet (lien vers le poste).
- `cashTransactionId` — optionnel, lien vers une entrée `cashTransactions` (guichet).

**Relation :** Chaque réservation est la source du montant ; les agrégats (dailyStats, shiftReports, cashTransactions) en dérivent.

---

### 1.2 Envois courrier (shipments)

| Chemin Firestore | Rôle |
|------------------|------|
| `companies/{companyId}/logistics/data/shipments/{shipmentId}` | Envoi colis avec frais et assurance. |

**Champs financiers :**
- `transportFee` — frais de transport.
- `insuranceAmount` — montant assurance.
- `paymentStatus` — PAID_ORIGIN | PAID_DESTINATION | etc. (détermine si le revenu courrier compte).
- `sessionId` — session courrier d’origine (pour agrégation à la validation).

**Relation :** Revenu courrier agrégé à la validation de la session courrier (`validateCourierSession`) à partir des shipments avec statut payé.

---

### 1.3 Caisse (company-level)

| Collection | Chemin | Champs financiers |
|------------|--------|-------------------|
| **cashTransactions** | `companies/{companyId}/cashTransactions/{txId}` | `amount`, `currency`, `paymentMethod`, `date`, `status` (paid/refunded), `reservationId`, `locationId` |
| **cashClosures** | `companies/{companyId}/cashClosures/{closureId}` | `expectedAmount`, `declaredAmount`, `difference`, `date`, `locationId` |
| **cashRefunds** | `companies/{companyId}/cashRefunds/{refundId}` | `amount`, `reservationId`, `date`, `locationId` |
| **cashTransfers** | `companies/{companyId}/cashTransfers/{transferId}` | `amount`, `transferMethod`, `date`, `locationId` |

**Relation :**  
- `cashTransactions` : une entrée par réservation guichet payée (liée par `reservationId`).  
- Pas de mise à jour de `dailyStats` ni de trésorerie lors de la création ; la reconnaissance revenu guichet se fait à la **validation du poste** (shift).

---

### 1.4 Postes guichet et rapports

| Collection | Chemin | Champs financiers |
|------------|--------|-------------------|
| **shifts** | `companies/{companyId}/agences/{agencyId}/shifts/{shiftId}` | `totalRevenue`, `amount`, `totalCash`, `totalDigital`, `tickets`, `totalReservations`, `closedAt` |
| **shiftReports** | `companies/{companyId}/agences/{agencyId}/shiftReports/{reportId}` | `montant`, `totalRevenue`, `totalReservations`, `totalCash`, `totalDigital`, `billets`, `details[]` (trajet, billets, montant), `status` (pending_validation | validated) |

**Relation :**  
- À la **clôture** du poste : totaux calculés à partir des `reservations` du poste (`shiftId` + `canal === 'guichet'`) et écrits dans `shifts` et `shiftReports`.  
- Revenu comptabilisé dans `dailyStats` et trésorerie uniquement à la **validation comptable** du rapport (shift).

---

### 1.5 Sessions caisse agent (cash control)

| Collection | Chemin | Champs financiers |
|------------|--------|-------------------|
| **cashSessions** | `companies/{companyId}/agences/{agencyId}/cashSessions/{sessionId}` | `openingBalance`, `expectedBalance`, `expectedCash`, `expectedMobileMoney`, `expectedBank`, `countedBalance`, `discrepancy`, `status` (OPEN | CLOSED | VALIDATED | REJECTED) |
| **cashSessionExpenses** | `companies/{companyId}/agences/{agencyId}/cashSessionExpenses/{expenseId}` | `amount`, `category`, `sessionId` |

**Relation :**  
- **Pas une source de vérité financière** : pas de mouvement de trésorerie ni de mise à jour `dailyStats` à la validation d’une cash session.  
- Revenus enregistrés côté trésorerie / dailyStats uniquement via **validation du poste guichet** ou **validation de la session courrier**.

---

### 1.6 Agrégats journaliers (dailyStats)

| Chemin | Champs financiers |
|--------|-------------------|
| `companies/{companyId}/agences/{agencyId}/dailyStats/{YYYY-MM-DD}` | `ticketRevenue`, `courierRevenue`, `totalRevenue`, `totalPassengers`, `totalSeats`, `validatedSessions`, `closedSessions`, `boardingClosedCount` |

**Relation :**  
- **ticketRevenue / totalRevenue** : incrémentés (1) à la validation d’un **poste guichet** (montant du shift), (2) à la transition d’une réservation **en_ligne** vers confirme/payé (`addTicketRevenueToDailyStats` + `ticketRevenueCountedInDailyStats`).  
- **courierRevenue / totalRevenue** : incrémentés à la validation d’une **session courrier** (`updateDailyStatsOnCourierSessionValidated`).

---

### 1.7 Trésorerie (Treasury)

| Collection | Chemin | Champs financiers |
|------------|--------|-------------------|
| **financialAccounts** | `companies/{companyId}/financialAccounts/{accountId}` | `currentBalance`, `currency`, `accountType`, `agencyId` |
| **financialMovements** | `companies/{companyId}/financialMovements/{movementId}` | `amount`, `currency`, `movementType`, `fromAccountId`, `toAccountId`, `referenceType`, `referenceId`, `agencyId`, `performedAt` |
| **financialMovementIdempotency** | `companies/{companyId}/financialMovementIdempotency/{key}` | Clé = `referenceType_referenceId` — évite les doublons (ex. double validation shift). |

**Relation :**  
- Mouvements créés notamment à : validation poste guichet (`revenue_cash`, referenceType `shift`), validation session courrier (`revenue_cash`, referenceType `courier_session`), paiement de dépenses, etc.  
- Les montants sans `reservationId` ni `shipmentId` existent par design : ex. `revenue_cash` pour un shift (référence = `shiftId`).

---

### 1.8 Autres collections avec montants

| Collection | Chemin | Champs financiers | Rôle |
|------------|--------|-------------------|------|
| **expenses** | `companies/{companyId}/expenses/{expenseId}` | `amount`, `status`, `agencyId` | Dépenses (validation, paiement → financialMovements). |
| **payables** | `companies/{companyId}/payables/{payableId}` | Montants fournisseurs | Factures fournisseurs. |
| **paymentProposals** | `companies/{companyId}/paymentProposals/{proposalId}` | Montant, approbation | Demandes de paiement. |
| **tripCosts** | `companies/{companyId}/tripCosts/{tripCostId}` | Coûts par trajet/date | Coûts opérationnels. |
| **fleetCosts** | `companies/{companyId}/fleetCosts/{costId}` | Coûts flotte | Coûts véhicules. |
| **fleetMaintenance** | `companies/{companyId}/fleetMaintenance/{maintenanceId}` | Coûts maintenance | Maintenance flotte. |
| **fuelLogs** | `companies/{companyId}/fuelLogs/{fuelLogId}` | Quantité, coût | Carburant. |
| **vehicleFinancialHistory** | `companies/{companyId}/vehicleFinancialHistory/{docId}` | Historique financier véhicule | Agrégat côté client. |
| **payments** | `companies/{companyId}/payments/{paymentId}` | Paiements abonnement | Facturation plateforme. |
| **subscription** | `companies/{companyId}/subscription/{docId}` | Plan, état abonnement | Pas de montant direct dans l’audit. |
| **revenue/events** | `companies/{companyId}/revenue/events/{eventId}` | `amount`, `category`, `sourceType`, `sourceId` | Événements revenus (domaine minimal, backend). |
| **logistics/data/ledger** | `companies/{companyId}/logistics/data/ledger` | `amount`, `type` (TRANSPORT_FEE, INSURANCE, etc.), `shipmentId`, `sessionId` | Ledger courrier (détail par envoi/session). |
| **logistics/data/sessions** | `companies/{companyId}/logistics/data/sessions/{sessionId}` | `expectedAmount`, `countedAmount`, `difference` (côté courier session) | Session courrier (expectedAmount recalculé à la clôture à partir des shipments). |
| **cashReceipts** | `companies/{companyId}/agences/{agencyId}/cashReceipts/{receiptId}` | Encaissements agence (dashboard comptabilité). | Lu dans AgenceComptabilitePage, CompagnieComptabilitePage ; écriture non identifiée dans le code audité. |
| **cashMovements** | `companies/{companyId}/agences/{agencyId}/cashMovements/{movementId}` | Mouvements de caisse agence. | Idem : lu en comptabilité, écriture non trouvée dans l’audit. |
| **recettes** | `companies/{companyId}/agences/{agencyId}/recettes` | `montant`, `libelle`, `type`, `date` | Écrit par `AgenceRecettesPage` ; **non listée dans firestore.rules** (à vérifier accès). |

---

## 2. Pages / services qui écrivent de l’argent

### 2.1 Vente billet guichet

| Fichier | Action | Collections / champs écrits |
|---------|--------|-----------------------------|
| `src/modules/agence/services/guichetReservationService.ts` | `createGuichetReservation` | **reservations** : `montant`, `canal: 'guichet'`, `shiftId`, etc. |
| | | **dailyStats** : `updateDailyStatsOnReservationCreated` (totalPassengers, totalSeats uniquement — pas de revenu ici). |
| | | **cashSessions** : `addToExpectedBalance` (expectedCash / expectedBalance pour session GUICHET). |
| | | **cashTransactions** : `createCashTransaction` (amount, reservationId, locationId, date) + `updateDoc` résa avec `cashTransactionId`. |
| | | **customerService** : `upsertCustomerFromReservation` (totalSpent, etc. — CRM). |

Le **revenu** guichet n’est pas ajouté à `dailyStats.ticketRevenue` ni à la trésorerie à la vente ; il l’est à la **validation du poste** (voir ci-dessous).

---

### 2.2 Réservation en ligne

| Fichier | Action | Collections / champs écrits |
|---------|--------|-----------------------------|
| `src/modules/compagnie/public/pages/ReservationClientPage.tsx` | Création résa | **reservations** : `montant`, `canal: 'en_ligne'`, statut initial (ex. en_attente_paiement). Aucune écriture directe dans dailyStats. |
| `src/modules/agence/services/reservationStatutService.ts` | Transition → confirme/payé | **reservations** : `statut`, `ticketRevenueCountedInDailyStats: true`, `auditLog`. |
| | | **dailyStats** : `addTicketRevenueToDailyStats(tx, companyId, agencyId, dateStr, montant)` (une fois par résa, idempotence via `ticketRevenueCountedInDailyStats`). |

Aucune écriture dans `cashTransactions` ni dans `financialMovements` pour les résas en ligne (pas de mouvement caisse/trésorerie dans le code audité pour ce flux).

---

### 2.3 Envoi de colis (courrier)

| Fichier | Action | Collections / champs écrits |
|---------|--------|-----------------------------|
| `src/modules/logistics/services/createShipment.ts` | Création envoi | **logistics/data/shipments** : `transportFee`, `insuranceAmount`, `paymentType`, `paymentStatus`, etc. |
| | | **cashSessions** : `addToExpectedBalance` (session COURRIER, si PAID_ORIGIN). |
| `src/modules/logistics/services/recordLogisticsLedgerEntry.ts` | Enregistrement entrée ledger | **logistics/data/ledger** : `amount`, `type`, `shipmentId`, `sessionId`. |
| `src/modules/logistics/services/courierSessionService.ts` | `validateCourierSession` | **logistics/data/sessions** : status VALIDATED, `validatedAmount`, `difference`. |
| | | **dailyStats** : `updateDailyStatsOnCourierSessionValidated` (courierRevenue, totalRevenue). |
| | | **financialMovements** : `revenue_cash` vers compte agency_cash (referenceType `courier_session`). |

---

### 2.4 Clôture de session guichet

| Fichier | Action | Collections / champs écrits |
|---------|--------|-----------------------------|
| `src/modules/agence/services/sessionService.ts` | `closeSession` | **shifts** : `totalRevenue`, `amount`, `tickets`, `totalCash`, `totalDigital`, `status: CLOSED`, `closedAt`. |
| | | **shiftReports** : `montant`, `totalRevenue`, `billets`, `details`, `status: pending_validation`. |
| | | **dailyStats** : `updateDailyStatsOnSessionClosed` (closedSessions +1 uniquement). |
| | | **agencyLiveState** : mise à jour. |

Aucun mouvement trésorerie ni ticketRevenue à la clôture ; uniquement à la **validation comptable**.

---

### 2.5 Validation comptable (poste guichet)

| Fichier | Action | Collections / champs écrits |
|---------|--------|-----------------------------|
| `src/modules/agence/services/sessionService.ts` | `validateSessionByAccountant` | **shifts** : `status: VALIDATED`, `validatedAt`, `validationAudit`. |
| | | **shiftReports** : (idem statut validé). |
| | | **dailyStats** : `updateDailyStatsOnSessionValidated(tx, …, totalRevenue)` → ticketRevenue + totalRevenue. |
| | | **financialMovements** : `revenue_cash` vers agency_cash (montant = `receivedCashAmount`). |
| `src/modules/agence/services/shiftApi.ts` | `validateReportClient` | Même logique : **shiftReports** + **shifts** → validated ; **dailyStats** (ticketRevenue, totalRevenue) ; **financialMovements** (revenue_cash). |

Deux chemins (sessionService et shiftApi) peuvent mener à la validation d’un même poste — à vérifier qu’ils ne sont pas appelés en double (risque de double mouvement si pas d’idempotence côté appelant).

---

### 2.6 Autres écritures financières

- **cashClosures** : `cashService.createCashClosure` (clôture journalière caisse — expectedAmount, declaredAmount, difference).  
- **cashRefunds** : `cashService.createCashRefund` (remboursement lié à une réservation).  
- **cashTransfers** : `cashService.createCashTransfer` (transfert point de vente → compagnie).  
- **cashSessions** : ouverture, clôture, validation/rejet, dépenses (`cashSessionService`).  
- **financialMovements** : en plus des cas ci-dessus, ex. paiement de dépenses (`expenses`), transferts internes, etc.  
- **expenses** : création / mise à jour (`treasury/expenses.ts`).  
- **payables**, **paymentProposals** : création/mise à jour par les services finance.  
- **AgenceRecettesPage** : écriture dans `recettes` (agence) — hors règles Firestore explicites pour `recettes`.

---

## 3. Synthèse par source : fichier, collection, champs, lien reservationId/shipmentId

| Source métier | Fichier service principal | Collection(s) | Champs financiers | Lien reservationId / shipmentId |
|---------------|---------------------------|---------------|-------------------|----------------------------------|
| Vente billet guichet | `guichetReservationService.ts` | reservations, cashTransactions, dailyStats (passagers/places), cashSessions (expected) | montant, amount, totalPassengers, totalSeats | reservationId dans cashTransactions ; résa a shiftId |
| Résa en ligne (confirme/payé) | `reservationStatutService.ts` | reservations, dailyStats | montant → ticketRevenue/totalRevenue | Résa : pas de lien cashTransactions ; dailyStats par agencyId/date |
| Clôture poste guichet | `sessionService.ts` | shifts, shiftReports, dailyStats (closedSessions) | totalRevenue, amount, montant, billets | shiftReports/shifts agrègent les résas du shift (shiftId) |
| Validation poste guichet | `sessionService.ts`, `shiftApi.ts` | shiftReports, shifts, dailyStats, financialMovements | ticketRevenue, totalRevenue, revenue_cash | referenceId = shiftId |
| Envoi colis | `createShipment.ts`, `recordLogisticsLedgerEntry.ts` | logistics/data/shipments, logistics/data/ledger | transportFee, insuranceAmount, amount | shipmentId dans ledger ; sessionId dans shipment |
| Validation session courrier | `courierSessionService.ts` | logistics/data/sessions, dailyStats, financialMovements | courierRevenue, totalRevenue, revenue_cash | Revenu dérivé des shipments de la session (sessionId) |
| Caisse (encaissements) | `cashService.ts` | cashTransactions, cashClosures, cashRefunds, cashTransfers | amount, expectedAmount, declaredAmount, difference | cashTransactions.reservationId |

---

## 4. Agrégats financiers (dashboards et rapports)

### 4.1 Dashboards CEO / Compagnie

| Page / composant | Source des données | Collections / services utilisés |
|------------------|--------------------|----------------------------------|
| **CEOCommandCenterPage** | CA, revenus, dailyStats | dailyStats (collectionGroup), reservations (montant par résa), `getNetworkStats` (cashTransactions pour CA période). |
| **CompanyFinancesPage** | Revenus par jour/semaine/mois | dailyStats (ticketRevenue, courierRevenue, totalRevenue), réservations (montant live). |
| **CompagnieDashboard** | CA période, évolution | `networkStatsService.getNetworkStats` → totalRevenue basé sur **cashTransactions** (status paid). |
| **ReservationsReseauPage** | CA, billets, graphiques | `getReservationsInRange` (reservations) ; graphiques dérivés des mêmes résas (revenue = montant). |
| **useCompanyDashboardData** | KPIs, top trajets, revenus | reservations (collectionGroup), calculs montant / résas par agence, par trajet. |
| **companyAggregates** | Snapshot agrégé (todayRevenue, etc.) | dailyStats + agencyLiveState ; `computeAggregatesFromSnapshot`. |

**Incohérence potentielle :**  
- **CA réseau** selon la règle métier = **cashTransactions** (status paid) — `networkStatsService.getNetworkStats`.  
- **Revenus affichés** sur d’autres écrans (CompanyFinancesPage, CEO) peuvent reposer sur **dailyStats** (ticketRevenue + courierRevenue) ou sur **reservations** (somme des montants).  
- Les deux ne sont pas alignés par construction : cashTransactions = encaissements guichet enregistrés à la vente ; dailyStats.ticketRevenue = revenu reconnu à la validation du poste (guichet) ou à la transition confirme/payé (en ligne). Donc **décalage temporel et possible écart** entre “CA caisse” et “revenu comptable”.

### 4.2 Dashboards agence

| Page | Source des données | Collections / services |
|------|--------------------|------------------------|
| **AgenceComptabilitePage** | Totaux jour, par poste, réconciliation, sessions | reservations, dailyStats, shifts, shiftReports, cashTransactions, cashReceipts, cashMovements, agencyStatsToday (dailyStats ou live). |
| **DashboardAgencePage** | Revenus billets / courrier | dailyStats (ticketRevenue, courierRevenue, totalRevenue). |
| **ManagerCockpitPage** | Revenu du jour, par poste | reservations (montant par shiftId), live listener. |
| **ManagerFinancesPage** | Revenu jour | dailyStats (totalRevenue). |
| **AgenceFinancesPage** | Revenu | dailyStats (totalRevenue). |
| **ShiftsControlWidget** | Montants live par session | reservations (agrégation par shiftId, amount). |

### 4.3 Sessions guichet

- **ShiftHistoryPage** : liste des réservations du poste, totaux (billets, montant) calculés côté client à partir des **reservations** (shiftId).  
- **shiftReports** : lus pour rapports validés / en attente (`shiftApi.listValidatedReports`, `listPendingReports`).

### 4.4 Rapports courrier

- Revenu courrier : **dailyStats.courierRevenue** (rempli à la validation de la session courrier).  
- Détail par envoi : **logistics/data/shipments** (transportFee, insuranceAmount) et **logistics/data/ledger**.

---

## 5. Incohérences possibles

### 5.1 Montants sans reservationId ni shipmentId

- **financialMovements** : nombreux mouvements sont volontairement sans reservationId/shipmentId (ex. `revenue_cash` pour un shift : referenceType = `shift`, referenceId = shiftId). Ce n’est pas une anomalie.  
- **cashTransactions** : normalement liées à une réservation guichet (`reservationId`) ; une entrée orpheline (sans résa ou résa supprimée) serait une anomalie.  
- **cashRefunds** : ont un `reservationId`.

### 5.2 Agrégats stockés sans recalcul

- **dailyStats** : incrémentaux (increment) à chaque événement (création résa, clôture session, validation session, transition confirme/payé en ligne, validation session courrier). En cas de bug (ex. double validation, annulation non déduite), les totaux peuvent rester faux. Il n’y a pas de recalcul automatique en temps réel ; un **backfill** existe (`backfillDailyStatsRevenue.ts`) pour recalculer ticketRevenue/courierRevenue à partir des réservations et des shipments.  
- **shifts** / **shiftReports** : totaux calculés une fois à la clôture à partir des réservations ; pas de recalcul si une résa est modifiée après clôture (non géré dans le code audité).  
- **financialAccounts.currentBalance** : dérivé uniquement des **financialMovements** (incréments dans une transaction) ; pas de recalcul global automatique.

### 5.3 Chiffres persistants après suppression de données

- Si une **reservation** est supprimée ou annulée après qu’une **cashTransaction** a été créée : la cashTransaction reste (status éventuellement refunded) ; **dailyStats** n’est pas décrémenté pour les résas guichet (le revenu a été ajouté à la validation du shift, pas à la vente). Pour l’en ligne, si la résa est annulée après avoir été comptée dans dailyStats, il n’y a pas de décrément automatique.  
- Si un **shift** est invalidé ou supprimé (règles Firestore interdisent la suppression) : les financialMovements et dailyStats déjà écrits restent.  
- **cashSessions** : la doc indique qu’elles ne sont pas une source de vérité financière ; leur validation ne crée pas de mouvement ni de dailyStats, donc pas de persistance de revenu erroné à ce niveau.

### 5.4 Double source de vérité pour le “CA”

- **networkStatsService** : CA = somme des **cashTransactions** (status paid) sur la période — aligné avec la règle “source unique” pour les indicateurs réseau.  
- **dailyStats** : ticketRevenue + courierRevenue = revenu “comptable” (reconnu à la validation poste ou à la confirmation en ligne).  
- **Réservations** : somme des `montant` (éventuellement filtrée par statut) utilisée sur plusieurs pages (ReservationsReseauPage, useCompanyDashboardData, etc.).  

Trois représentations du “chiffre d’affaires” peuvent donc diverger : encaissements caisse (cashTransactions), revenu reconnu (dailyStats), et somme des montants des réservations. Décalages temporels (vente vs validation) et périmètre (guichet vs en ligne vs courrier) expliquent les écarts.

### 5.5 Validation poste : deux chemins

- **sessionService.validateSessionByAccountant** et **shiftApi.validateReportClient** tous deux mettent à jour shiftReports, shifts, dailyStats et financialMovements. Si les deux sont appelés pour le même shift, l’idempotence côté **financialMovements** (financialMovementIdempotency par referenceType_referenceId) évite un second mouvement, mais **dailyStats** pourrait être incrémenté deux fois (pas d’idempotence sur dailyStats pour la validation de poste). À confirmer dans les flux UI (un seul bouton “Valider” par chemin).

---

## 6. Où les chiffres peuvent diverger

1. **CEO / Compagnie : CA période**  
   - Vue “réseau” (getNetworkStats) = cashTransactions.  
   - Vue “finances” (dailyStats) = ticketRevenue + courierRevenue.  
   - Vue “réservations” = somme des montants des résas.  
   → Trois chiffres possibles pour “CA”.

2. **Agence : chiffre du jour**  
   - AgenceComptabilitePage peut afficher `agencyStatsToday.totalRevenue` (dailyStats) ou `liveTotalsGlobal.amount` (calcul live sur réservations).  
   → Risque d’afficher tantôt l’agrégat stocké, tantôt le recalcul live.

3. **Réconciliation guichet**  
   - Réconciliation basée sur ventes guichet (reservations canal guichet) vs encaissements (cashTransactions) ; les totaux peuvent diverger si des cashTransactions existent sans résa ou si des résas ne ont pas de cashTransaction (ex. erreur après création résa).

4. **Courrier**  
   - Revenu courrier = dailyStats.courierRevenue (à la validation de session).  
   - Détail = somme des (transportFee + insuranceAmount) des shipments “payés” de la session.  
   → Cohérent par construction pour une session donnée ; incohérence possible si backfill ou données historiques partielles.

5. **Trésorerie**  
   - Solde = somme des financialMovements ; pas de lien direct avec les réservations/shipments pour tous les types de mouvements.  
   - Revenus caisse = mouvements `revenue_cash` (shift ou courier_session).  
   → Pas de divergence directe avec dailyStats pour ces références, sous réserve d’un seul passage dans la validation.

---

## 7. Recommandations pour une source unique de vérité financière

1. **Définir un indicateur “CA” canonique** : soit cashTransactions (encaissements), soit dailyStats (revenu reconnu), soit somme des réservations (ventes), et faire que tous les dashboards (CEO, Compagnie, Agence) utilisent la même définition et le même service (ex. getNetworkStats pour le réseau, ou un service “finances” basé sur dailyStats).  
2. **Documenter et limiter le double chemin de validation** (sessionService vs shiftApi) pour éviter tout double incrément de dailyStats.  
3. **Backfill et contrôles** : utiliser `backfillDailyStatsRevenue` pour recoller historique si besoin ; envisager des contrôles périodiques (somme réservations vs dailyStats, cashTransactions vs shiftReports).  
4. **Règles Firestore** : vérifier la collection `recettes` (AgenceRecettesPage) et les écritures éventuelles vers `cashReceipts` / `cashMovements` pour les aligner avec les règles et le modèle de données cible.  
5. **Lien résa ↔ caisse** : s’assurer que chaque résa guichet payée a bien une cashTransaction et qu’aucune cashTransaction “paid” n’existe sans résa (ou avec résa annulée non remboursée), pour une réconciliation fiable.

---

*Rapport généré par audit du code — aucune modification appliquée. Dernière revue des chemins et fichiers : mars 2025.*
