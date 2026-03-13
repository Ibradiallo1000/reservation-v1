# Matrice des flux métier TELIYA (A à Z)

Document de référence des **cycles opérationnels réellement implémentés** dans le code, utilisable pour les tests Playwright et la recette.

Pour chaque flux : **utilisateur initial**, **action de départ**, **étapes**, **pages**, **modifications Firestore**, **résultat final**.

---

## Légende

- **U** = Utilisateur qui effectue l’action
- **Page** = Route / page React
- **Firestore** = Collections et opérations (écritures)
- **Résultat** = État final attendu

---

## Flux 1 — Réservation client (en ligne)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Client (non connecté) |
| **Action initiale** | Réserver un trajet et payer (ou soumettre une preuve) |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Client | Accède au site (sous-domaine ou `/:slug/`) | `RouteResolver` → accueil / recherche | Lecture `companies`, `agences`, `weeklyTrips`, etc. |
| 2 | Client | Choisit trajet, date, heure, places ; saisit nom, téléphone | `/:slug/reserver` (`ReservationClientPage`) | — |
| 3 | Client | Soumet le formulaire « Passer au paiement » | `ReservationClientPage` | `companies/{companyId}/agences/{agencyId}/reservations` : **addDoc** (statut `en_attente_paiement`, canal `en_ligne`, trajetId, montant, referenceCode, holdUntil, etc.). **updateDoc** même doc : `publicToken`, `publicUrl`. **setDoc** `publicReservations/{reservationId}` (slug, companyId, agencyId, publicToken). Optionnel : `incrementReservedSeats` sur trip instance. |
| 4 | Client | Redirigé vers choix du mode de paiement | `/:slug/payment/:reservationId` (`PaymentMethodPage` via RouteResolver) | Lecture `reservations`, `paymentMethods` |
| 5 | Client | Choisit un moyen de paiement (ex. Orange Money) | `PaymentMethodPage` | — |
| 6 | Client | Redirigé vers upload de preuve | `/:slug/upload-preuve/:id` (`UploadPreuvePage`) | — |
| 7 | Client | Saisit référence de paiement et envoie la preuve | `UploadPreuvePage` | Appel Cloud Function **submitProof** → **updateDoc** sur `companies/.../reservations/{id}` : `statut: 'preuve_recue'`, `canal: 'en_ligne'`, `preuveVia`, `preuveMessage`, `preuveUrl`, `paymentHint`. |
| 8 | Comptable / back-office | (Optionnel) Valide la réservation (confirme ou refuse) | Espace comptabilité / outil interne | **transitionToConfirmedOrPaidWithDailyStats** ou **updateReservationStatut** : `statut: 'confirme'` ou `'paye'`, `ticketRevenueCountedInDailyStats`, `auditLog`. **dailyStats** : increment `ticketRevenue`, `totalRevenue`. |
| 9 | Client | Consulte son billet (QR) | `/:slug/reservation/:id` ou `/:slug/mon-billet?r=TOKEN` (`ReservationDetailsPage`) | Lecture via `resolveReservationById` / `resolveReservationByToken` (`publicReservations` puis `companies/.../reservations`) |

### Résultat final

- Réservation en statut **confirme** ou **paye** (après preuve + validation si applicable).
- Document dans `companies/.../reservations` et entrée dans `publicReservations`.
- Billet affiché avec QR ; client peut embarquer si statut confirme/paye.

---

## Flux 2 — Vente au guichet (cycle poste)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Guichetier + Comptable agence |
| **Action initiale** | Ouvrir un poste, vendre des billets, clôturer, puis valider en comptabilité |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Guichetier | Se connecte et ouvre un poste | `/agence/guichet` (`AgenceGuichetPage`) + `useActiveShift` | **sessionService.createSession** → **addDoc** `companies/.../agences/.../shifts` : statut `PENDING`, userId, userCode, dayKey, tickets: 0, amount: 0, etc. |
| 2 | Comptable agence | Active le poste (liste des postes en attente) | `/agence/comptabilite` (`AgenceComptabilitePage`) | **activateSession** : **runTransaction** → **updateDoc** `shifts/{shiftId}` : `status: ACTIVE`, `startAt`, `activatedAt`, `activatedBy`. **setDoc** `shiftReports/{shiftId}` : status `pending_validation`, startAt, activatedBy. **updateAgencyLiveStateOnSessionOpened** (increment activeSessionsCount). |
| 3 | Guichetier | (Optionnel) Revendique le poste sur l’appareil | `AgenceGuichetPage` | **claimSession** : **updateDoc** `shifts` : `deviceFingerprint`, `deviceClaimedAt`. |
| 4 | Guichetier | Vend un ou plusieurs billets | `AgenceGuichetPage` (formulaire vente) | **createGuichetReservation** : **runTransaction** → vérif shift ACTIVE/PAUSED, **setDoc** `companies/.../agences/.../reservations` (canal `guichet`, statut `paye`, shiftId, guichetierId, referenceCode, etc.). **updateDailyStatsOnReservationCreated**. Optionnel : **addToExpectedBalance** (cashSessionService). |
| 5 | Guichetier | Clôture le poste | `AgenceGuichetPage` (bouton clôturer) | **closeSession** : **runTransaction** → lecture réservations du shift, **setDoc** `shiftReports/{shiftId}` (billets, montant, totalCash, totalDigital, details, status `pending_validation`), **updateDoc** `shifts/{shiftId}` (status `CLOSED`, endAt, tickets, amount, totalRevenue…). **updateDailyStatsOnSessionClosed**. **updateAgencyLiveStateOnSessionClosed**. |
| 6 | Comptable agence | Valide le poste (saisie du montant reçu) | `AgenceComptabilitePage` | **validateSessionByAccountant** : **runTransaction** → **updateDoc** `shifts` : status `VALIDATED`, `validationAudit`. **updateDoc** `shiftReports` : status `validated`, `validationAudit`. **updateDailyStatsOnSessionValidated** (ticketRevenue). **updateAgencyLiveStateOnSessionValidated**. **recordMovementInTransaction** : crédit `agency_cash` (revenue_cash), **financialMovementIdempotency**. **shiftApi.validateReportClient** peut être utilisé (aligné avec même logique). |

### Résultat final

- Poste en statut **VALIDATED** (verrouillé).
- Revenus billets enregistrés dans **dailyStats** et en trésorerie (**financialMovements**, solde `agency_cash`).
- **agencyLiveState** à jour (sessions actives / clôturées).

---

## Flux 3 — Embarquement passager (scan + clôture)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Chef embarquement / Chef agence |
| **Action initiale** | Contrôler les passagers d’un départ et marquer embarqués / absents |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Chef embarquement | Se connecte et accède à l’embarquement | `/agence/boarding` (`BoardingDashboardPage`) | Lecture `weeklyTrips`, départs du jour (ou affectations / trajets). |
| 2 | Chef embarquement | Sélectionne un départ (trajet, date, heure) | `BoardingDashboardPage` | — |
| 3 | Chef embarquement | Ouvre la liste d’embarquement (scan) | `/agence/boarding/scan` (`BoardingScanPage` → `AgenceEmbarquementPage`) | Lecture capacité véhicule (optionnel : `fleetVehicles`). Lecture `reservations` (date, heure, trajet), `boardingStats`, `affectations`. |
| 4 | Chef embarquement | Scanne le QR ou saisit le code du billet | `AgenceEmbarquementPage` | **runTransaction** : lecture réservation, vérif capacité (boardingStats + vehicleCapacity), **createBoardingStats** si absent, **incrementBoardingStatsEmbarked**. **setDoc** `boardingLocks/{reservationId}`. **updateDoc** `reservations/{id}` : `statut: 'embarque'`, `statutEmbarquement: 'embarqué'`, `checkInTime`, `controleurId`, `auditLog` (arrayUnion). **addDoc** `boardingLogs`. **updateAgencyLiveStateOnBoardingOpened** (si première ouverture pour ce trajet). |
| 5 | Chef embarquement | (Optionnel) Marque des passagers « Absent » à la main | `AgenceEmbarquementPage` (liste) | Même `updateStatut` avec statut « absent » : **updateDoc** `reservations` : `statutEmbarquement: 'absent'` (sans passage à `embarque`). |
| 6 | Chef embarquement | Clôture l’embarquement pour ce départ | `AgenceEmbarquementPage` (bouton « Clôturer ») | **runTransaction** : **setBoardingStatsClosed** (boardingStats : status `closed`, absentSeats). **updateDailyStatsOnBoardingClosed**. **updateAgencyLiveStateOnBoardingClosed**. Optionnel : **buildVehicleTransitionToInTransit** / **updateAgencyLiveStateOnVehicleInTransit** (flotte). |

### Résultat final

- Réservations concernées : `statut: 'embarque'`, `statutEmbarquement: 'embarqué'` ou « absent ».
- **boardingStats** pour ce trajet : `status: 'closed'`, `embarkedSeats`, `absentSeats`.
- **dailyStats** : `boardingClosedCount` incrémenté.
- **agencyLiveState** et éventuellement véhicule en transit mis à jour.

---

## Flux 4 — Envoi de colis (courrier) + remontée comptable

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Agent courrier + Comptable agence |
| **Action initiale** | Ouvrir une session courrier, créer des envois, clôturer puis valider en comptabilité |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Agent courrier | Crée une session courrier | `/agence/courrier/session` (`CourierSessionPage`) | **createCourierSession** : **setDoc** `companies/.../agences/.../courierSessions` : status `PENDING`, agentId, agentCode, expectedAmount: 0. |
| 2 | Comptable agence | Active la session courrier | `/agence/comptabilite` | **activateCourierSession** : **runTransaction** → **updateDoc** `courierSessions/{sessionId}` : status `ACTIVE`, `openedAt`, `activatedBy`. **updateAgencyLiveStateOnCourierSessionActivated**. |
| 3 | Agent courrier | Crée un ou plusieurs envois | `/agence/courrier/nouveau` (`CourierCreateShipmentPage`) | **createShipment** : **runTransaction** → vérif session ACTIVE, **setDoc** `companies/.../logistics/data/shipments` (CREATED, sessionId, expéditeur, destinataire, transportFee, insuranceAmount, etc.). Incrément `agences/.../counters/shipmentSeq`. Événement dans `logistics/data/events`. Optionnel : **addToExpectedBalance** (cash session), **incrementParcelCount** (trip instance). |
| 4 | Agent courrier | Clôture la session | `CourierSessionPage` | **closeCourierSession** : **runTransaction** → calcul `expectedAmount` (somme des envois de la session), **updateDoc** `courierSessions` : status `CLOSED`, `closedAt`, `expectedAmount`. **updateAgencyLiveStateOnCourierSessionClosed**. |
| 5 | Comptable agence | Valide la session (montant compté) | `AgenceComptabilitePage` | **validateCourierSession** : **runTransaction** → **updateDoc** `courierSessions` : status `VALIDATED`, `validatedAt`, `validatedAmount`, `difference`, `validatedBy`. **updateDailyStatsOnCourierSessionValidated** (courierRevenue). **updateAgencyLiveStateOnCourierSessionValidated**. **recordMovementInTransaction** : crédit `agency_cash` (revenue_cash), idempotency. |

### Résultat final

- Session courrier **VALIDATED**.
- Envois en statut **CREATED** (ou autres statuts si flux avancés utilisés).
- Revenus courrier dans **dailyStats** et en trésorerie (**financialMovements**).

---

## Flux 5 — Réception de colis (marquer arrivé)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Agent agence de destination (ou chef agence) |
| **Action initiale** | Marquer un colis comme arrivé à l’agence de destination |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Agent | Consulte les envois à réceptionner | `/agence/courrier/reception` (`CourierReceptionPage`) ou page listant les shipments | Lecture `logistics/data/shipments` (destinationAgencyId = mon agence, currentStatus CREATED ou IN_TRANSIT). |
| 2 | Agent | Marque l’envoi comme « Arrivé » | Page courrier réception (bouton / action) | **markShipmentArrived** : **runTransaction** → vérif `destinationAgencyId === agencyId`, transition autorisée (CREATED ou IN_TRANSIT → ARRIVED). **updateDoc** `shipments/{id}` : `currentStatus: 'ARRIVED'`, `currentAgencyId`. **addDoc** `logistics/data/events` : eventType `ARRIVED`. |

### Résultat final

- Envoi en statut **ARRIVED** à l’agence de destination.
- Événement tracé dans `events`.

---

## Flux 6 — Gestion flotte (affectation → départ → arrivée)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Contrôleur flotte / Chef agence |
| **Action initiale** | Affecter un véhicule à un trajet, confirmer le départ puis l’arrivée |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Chef agence / Flotte | Accède à l’exploitation flotte | `/agence/fleet/operations` (`AgenceFleetOperationsPage`) | Lecture `vehicles`, `affectations` (par agence / compagnie). |
| 2 | Chef agence / Flotte | Affecte un véhicule (trajet, équipage, horaire) | `AgenceFleetOperationsPage` (modal / formulaire affectation) | **assignVehicle** : **createAffectation** → **setDoc** `companies/.../agences/.../affectations` (status `AFFECTE`). **updateDoc** `vehicles/{vehicleId}` : operationalStatus `AFFECTE`, status `EN_SERVICE`, currentTripId, destinationCity, statusHistory. Optionnel : **updateDoc** `weeklyTrips` (vehicleId), **getOrCreateTripInstanceForSlot** + **assignVehicleToTripInstance**. |
| 3 | Chef agence / Flotte | Confirme le départ du véhicule | `AgenceFleetOperationsPage` | **confirmDepartureAffectation** : **updateDoc** `vehicles` : operationalStatus `EN_TRANSIT`, status `EN_TRANSIT`, canonicalStatus `ON_TRIP`. **updateAffectationStatus** : status `DEPART_CONFIRME`, `departureConfirmedAt`. Optionnel : **updateTripInstanceStatus** (DEPARTED), **assignVehicleToTripInstance**, **syncCourierWithVehicleDeparture**. Éventuellement **updateAgencyLiveStateOnVehicleInTransit**. |
| 4 | Chef agence (destination) | Confirme l’arrivée du véhicule | `AgenceFleetOperationsPage` (agence d’arrivée) | **confirmArrivalAffectation** : **updateDoc** `vehicles` : operationalStatus `GARAGE`, status disponible, destinationCity effacée, statusHistory. **updateAffectationStatus** : status `ARRIVE`, `arrivalConfirmedAt`. Optionnel : **updateTripInstanceStatus**, **syncCourierWithVehicleArrival**. Éventuellement **updateAgencyLiveStateOnVehicleInTransit** (décrément). |

### Résultat final

- Affectation : **AFFECTE** → **DEPART_CONFIRME** → **ARRIVE**.
- Véhicule : **GARAGE** → **AFFECTE** → **EN_TRANSIT** → **GARAGE**.
- Trip instance et courrier (si utilisé) alignés avec le trajet.

---

## Flux 7 — Clôture / validation session caisse (cash session)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Guichetier / Agent courrier (ouverture et clôture) ; Comptable (validation si implémentée) |
| **Action initiale** | Ouvrir une session caisse, enregistrer des ventes (guichet/courrier), clôturer la session. |

### Étapes (implémentation actuelle)

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Guichetier / Agent | Ouvre une session caisse | `/agence/cash-sessions` (`CashSessionsPage`) | **openCashSession** : **setDoc** `companies/.../agences/.../cashSessions` : status `OPEN`, openingBalance, expectedBalance, expectedCash / expectedMobileMoney / expectedBank. |
| 2 | Guichetier / Agent | Vente au guichet ou envoi courrier payé à l’origine | Guichet ou Courrier | **addToExpectedBalance** (cashSessionService) : **updateDoc** `cashSessions/{id}` : increment expectedBalance (et répartition cash / mobile_money / bank selon paymentMethod). |
| 3 | Guichetier / Agent | Clôture la session (saisie des montants comptés) | `CashSessionsPage` | **closeCashSession** : **updateDoc** `cashSessions` : status `CLOSED`, countedCash, countedMobileMoney, countedBank, closedAt. Aucun mouvement trésorerie à cette étape (les mouvements viennent de la **validation du poste guichet** ou de la **validation de la session courrier**). |

### Résultat final

- Session caisse **CLOSED** avec montants comptés.
- Réconciliation possible côté UI ; les entrées en trésorerie restent déclenchées par la validation comptable du **poste guichet** ou de la **session courrier**.

---

## Flux 8 — Remontée comptable (versement agence → banque)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Comptable agence (initiateur) + Chef agence (validateur) |
| **Action initiale** | Demander un versement de la caisse agence vers la banque compagnie, puis valider et exécuter |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Comptable agence | Crée une demande de versement | `/agence/treasury/transfer` (`AgencyTreasuryTransferPage`) | **createTransferRequest** : **setDoc** `companies/.../treasuryTransferRequests` : status `pending_manager`, fromAccountId (agency_cash), toAccountId (banque compagnie), amount, currency, initiatedBy, initiatedByRole. |
| 2 | Chef agence | Approuve la demande | `AgencyTreasuryTransferPage` ou liste des demandes | **approveTransferRequest** : **updateDoc** `treasuryTransferRequests/{id}` : status `approved`, managerDecisionBy, managerDecisionAt. **agencyDepositToBank** (treasuryTransferService) : mouvements financiers (débit agency_cash, crédit banque), idempotence. **updateDoc** request : executedBy, executedAt, status `executed` (si fait dans la même logique). |
| 3 | (Optionnel) Chef agence | Rejette la demande | Même page | **rejectTransferRequest** : **updateDoc** : status `rejected`, managerDecisionBy, managerDecisionAt, managerDecisionReason. |

### Résultat final

- Demande en **approved** puis **executed** (ou **rejected**).
- Trésorerie : solde caisse agence diminué, solde banque compagnie augmenté (**financialMovements**).

---

## Flux 9 — Dépense agence (création → approbation → payée)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | Agent / Chef agence (création) ; Chef agence / Comptable / CEO (approbation selon seuils) |
| **Action initiale** | Soumettre une dépense (caisse agence), puis chaîne d’approbation jusqu’au paiement |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | Agent / Chef agence | Crée une demande de dépense | `/agence/treasury` ou `/agence/treasury/new-operation` (`AgencyTreasuryPage`, `AgencyTreasuryNewOperationPage`) | **createExpense** (treasury/expenses) : **setDoc** `companies/.../expenses` : agencyId, category, amount, accountId (agency_cash), status initial (`pending_manager` / `pending_accountant` / `pending_ceo` selon **expenseApprovalSettings**). createdBy, createdAt. Optionnel : notifications (createCompanyNotification). |
| 2 | Chef agence / Comptable / CEO | Approuve ou rejette (selon seuil) | `/agence/expenses-approval` (`AgencyManagerExpensesPage`) ou espace comptabilité compagnie | **approveExpense** : **updateDoc** `expenses` : status suivant (approved ou pending_accountant / pending_ceo), approvedBy, approvedAt. **rejectExpense** : status `rejected`, rejectedBy, rejectedAt, rejectionReason. Notifications possibles. |
| 3 | Comptable / CEO | Marque la dépense comme payée (si workflow prévu) | Espace dépenses compagnie / agence | **payExpense** (ou équivalent) : **updateDoc** `expenses` : status `paid`, paidAt. **recordMovementInTransaction** : débit compte (agency_cash ou banque), idempotence. |

### Résultat final

- Dépense en **approved** puis **paid** (ou **rejected**).
- Mouvement financier enregistré lors du passage à **paid**.

---

## Flux 10 — Supervision dashboard compagnie (lecture + navigation)

| Élément | Détail |
|--------|--------|
| **Utilisateur** | CEO / admin_compagnie |
| **Action initiale** | Consulter le command center et les tableaux de bord |

### Étapes

| # | U | Action | Page | Firestore |
|---|---|--------|------|-----------|
| 1 | CEO | Se connecte (companyId résolu) | Login → RoleLanding | Redirection vers `/compagnie/:companyId/command-center`. |
| 2 | CEO | Consulte le command center | `/compagnie/:companyId/command-center` (`CEOCommandCenterPage`) | Lecture agrégats (companies, agences, reservations, revenues, expenses, fleet, etc. selon les blocs). Pas d’écriture métier dans ce flux « supervision ». |
| 3 | CEO | Navigue vers approbations, revenus, flotte, etc. | Liens depuis le command center | `/compagnie/:companyId/payment-approvals`, `revenus-liquidites`, `dashboard`, `operations-reseau`, `fleet`, etc. Lecture + actions possibles (approbation dépenses, validation postes avec écarts, etc.) selon les pages. |

### Résultat final

- Vue de pilotage à jour ; pas de cycle d’écriture Firestore propre à ce flux (les écritures sont dans les flux « remontée comptable », « dépense », « guichet », etc.).

---

## Matrice synthétique pour tests Playwright

| Flux | Rôles | Page de départ | Pages clés | Écritures Firestore principales | Assertion finale |
|------|--------|----------------|------------|----------------------------------|------------------|
| **1. Réservation client** | Client | `/:slug/reserver` | reserver → payment → upload-preuve → reservation/:id | reservations (add + update), publicReservations, (submitProof → preuve_recue) | Billet visible, statut confirme/paye |
| **2. Vente guichet** | Guichetier, Comptable | `/agence/guichet`, `/agence/comptabilite` | guichet (vente, clôture), comptabilite (activation, validation) | shifts, shiftReports, reservations, dailyStats, agencyLiveState, financialMovements | Poste VALIDATED, revenus en trésorerie |
| **3. Embarquement** | Chef embarquement | `/agence/boarding` | boarding → boarding/scan (liste + scan + clôture) | reservations (embarque), boardingStats, boardingLocks, boardingLogs, dailyStats, agencyLiveState | boardingStats closed, réservations embarque |
| **4. Envoi colis + validation** | Agent courrier, Comptable | `/agence/courrier/session`, `/agence/comptabilite` | courrier/session, courrier/nouveau, comptabilite | courierSessions, shipments, dailyStats, agencyLiveState, financialMovements | Session VALIDATED, envoi(s) CREATED |
| **5. Réception colis** | Agent (destination) | `/agence/courrier/reception` | courrier/reception | shipments (ARRIVED), events | currentStatus ARRIVED |
| **6. Gestion flotte** | Chef agence / Flotte | `/agence/fleet/operations` | fleet/operations (affectation, confirmer départ, confirmer arrivée) | affectations, vehicles, statusHistory, tripInstances | Affectation ARRIVE, véhicule GARAGE |
| **7. Session caisse** | Guichetier / Agent | `/agence/cash-sessions` | cash-sessions (ouvrir, clôturer) | cashSessions (OPEN → CLOSED) | Session CLOSED, montants comptés |
| **8. Versement agence** | Comptable, Chef agence | `/agence/treasury/transfer` | treasury/transfer (créer demande, approuver) | treasuryTransferRequests, financialMovements | Request executed, soldes mis à jour |
| **9. Dépense agence** | Agent, Chef, Comptable, CEO | `/agence/treasury`, `/agence/expenses-approval` | treasury, treasury/new-operation, expenses-approval | expenses (pending → approved/rejected → paid), financialMovements | Dépense paid ou rejected |
| **10. Dashboard compagnie** | CEO | `/compagnie/:id/command-center` | command-center, payment-approvals, revenus-liquidites, dashboard | Lecture seule (agrégats) | Données affichées, liens actifs |

---

## Collections Firestore par flux

| Flux | Collections écrites |
|------|----------------------|
| 1. Réservation client | `companies/.../agences/.../reservations`, `publicReservations` ; (CF submitProof) ; optionnel dailyStats (confirme/paye) |
| 2. Vente guichet | `shifts`, `shiftReports`, `reservations`, `dailyStats`, `agencyLiveState`, `financialAccounts`, `financialMovements`, `financialMovementIdempotency` |
| 3. Embarquement | `reservations`, `boardingStats`, `boardingLocks`, `boardingLogs`, `dailyStats`, `agencyLiveState` ; optionnel fleetMovements / véhicule |
| 4. Courrier | `courierSessions`, `logistics/data/shipments`, `agences/.../counters/shipmentSeq`, `events`, `dailyStats`, `agencyLiveState`, `financialMovements`, `financialMovementIdempotency` |
| 5. Réception colis | `logistics/data/shipments`, `logistics/data/events` |
| 6. Flotte | `affectations`, `vehicles`, `weeklyTrips` (optionnel), tripInstances, fleetMovements (optionnel) |
| 7. Session caisse | `cashSessions` |
| 8. Versement | `treasuryTransferRequests`, `financialMovements`, `financialAccounts`, idempotency |
| 9. Dépense | `expenses`, `financialMovements`, `financialAccounts`, idempotency, notifications (optionnel) |
| 10. Dashboard | Aucune (lecture) |

---

*Document dérivé du code source TELIYA. Uniquement les flux présents dans l’implémentation actuelle ont été décrits.*
