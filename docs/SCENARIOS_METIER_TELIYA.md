# Scénarios métier TELIYA — Implémentés dans le code

Document décrivant les **scénarios métier réellement présents** dans l’application TELIYA (routes, pages, services, Firestore, rôles et transitions de statut).

---

## 1. Rôles utilisateurs (constants)

| Rôle | Accès principal |
|------|------------------|
| **admin_platforme** | Admin plateforme : dashboard, compagnies, plans, finances, médias |
| **admin_compagnie** / **company_ceo** | Compagnie : command center, flotte, agences, comptabilité, trésorerie |
| **company_accountant** / **financial_director** | Espace comptabilité compagnie : `/compagnie/:companyId/accounting` |
| **agency_accountant** | Comptabilité agence : `/agence/comptabilite` |
| **responsable_logistique** / **chef_garage** | Garage : flotte, maintenance, logistique |
| **chefAgence** / **superviseur** | Agence : dashboard, opérations, finances, trésorerie, équipe, courrier, guichet, flotte |
| **chefEmbarquement** | Embarquement : `/agence/boarding` (liste, scan) |
| **guichetier** | Guichet : vente de billets au comptoir |
| **agency_fleet_controller** | Flotte agence : tableau de bord, exploitation, affectations, véhicules, équipage |
| **agentCourrier** | Courrier : session, envois, réception, remise, rapports |

---

## 2. Réservation en ligne (client public)

### Rôle
**Client** (non authentifié ou via portail public).

### Suite d’actions
1. Accéder à la page de réservation (ex. `/:slug/reserver`).
2. Choisir trajet, date, heure, nombre de places.
3. Saisir nom, téléphone, (email).
4. Soumettre → création d’une réservation en statut **en_attente_paiement**.
5. (Optionnel) Soumettre une preuve de paiement (Cloud Function `submitProof`) → statut **preuve_recue**.
6. Un comptable / chef agence peut passer la réservation en **confirme** ou **paye** (via `reservationStatutService`).
7. Le client consulte son billet (QR) via `/:slug/reservation/:id` ou `/:slug/mon-billet` (token public).

### Pages impliquées
- `ReservationClientPage` (`/:slug/reserver`)
- `ReservationDetailsPage` (`/:slug/reservation/:id`, `/:slug/mon-billet`)
- `UploadPreuvePage` (upload preuve)
- `ClientMesReservationsPage`, `ClientMesBilletsPage`

### Collections Firestore
- **companies/{companyId}/agences/{agencyId}/reservations** : réservation réelle (création via `addDoc` dans `ReservationClientPage`).
- **publicReservations** : entrée pour résolution par `slug` + `publicToken` ou par `reservationId` (miroir pour accès client).

### Changements d’état (réservation)
- **en_attente_paiement** → **preuve_recue** (Cloud Function `submitProof`).
- **preuve_recue** / **verification** → **confirme** ou **refuse** (comptable / back-office).
- **confirme** / **paye** → **embarque** (scan embarquement).
- **confirme** / **paye** → **annulation_en_attente** → **annule** → **rembourse** (workflow annulation/remboursement, géré via `reservationStatutService` et `reservationStatusUtils`).
- **paye** : possible aussi en création directe au guichet (voir ci‑dessous).

---

## 3. Vente au guichet (poste guichetier)

### Rôle
**Guichetier** (et activation par **comptable agence**).

### Suite d’actions
1. Guichetier ouvre un **poste** (session) → statut **PENDING** (`sessionService.createSession`).
2. Comptable agence **active** le poste → **ACTIVE** (`sessionService.activateSession`).
3. Guichetier **revendique** le poste sur l’appareil (`claimSession`) pour verrouiller l’appareil.
4. Guichetier vend des billets : chaque vente crée une réservation avec `canal: 'guichet'`, `statut: 'paye'`, `shiftId`, `guichetierId` (`guichetReservationService.createGuichetReservation`).
5. Optionnel : contrôle caisse (session caisse ouverte, `addToExpectedBalance` via `cashSessionService`).
6. Guichetier **clôture** le poste → **CLOSED** (`sessionService.closeSession`).
7. Comptable **valide** le poste → **VALIDATED** ; enregistrement du revenu en trésorerie (mouvement `revenue_cash` sur `agency_cash`) et mise à jour des agrégats (`dailyStats`, `agencyLiveState`).

### Pages impliquées
- `AgenceGuichetPage` (`/agence/guichet`)
- `AgenceComptabilitePage` (`/agence/comptabilite`) pour activation/validation des postes.
- `CashSessionsPage` (`/agence/cash-sessions`) pour les sessions caisse.

### Collections Firestore
- **companies/{companyId}/agences/{agencyId}/shifts** : postes (cycle PENDING → ACTIVE → CLOSED → VALIDATED).
- **companies/{companyId}/agences/{agencyId}/shiftReports** : rapports de poste (créés à l’activation, mis à jour à la validation).
- **companies/{companyId}/agences/{agencyId}/reservations** : réservations guichet (`canal: 'guichet'`, `shiftId`).
- **companies/{companyId}/agences/{agencyId}/dailyStats/{date}** : agrégats jour (ticketRevenue, totalRevenue, etc.).
- **companies/{companyId}/agences/{agencyId}/agencyLiveState/current** : état temps réel agence.
- **companies/{companyId}/financialAccounts** : comptes (dont `agency_cash`).
- **companies/{companyId}/financialMovements** : mouvements (revenue_cash à la validation).
- **companies/{companyId}/financialMovementIdempotency** : idempotence des mouvements.
- **companies/{companyId}/agences/{agencyId}/cashSessions** : sessions caisse (optionnel).

### Transitions de statut (poste)
- **PENDING** → **ACTIVE** (comptable).
- **ACTIVE** / **PAUSED** → **CLOSED** (guichetier).
- **CLOSED** → **VALIDATED** (comptable, `shiftApi.validateReportClient`).

---

## 4. Embarquement (scan billets)

### Rôle
**chefEmbarquement**, **chefAgence**, **admin_compagnie**.

### Suite d’actions
1. Accès à la liste des départs du jour (`/agence/boarding`).
2. Sélection d’un départ (trajet, date, heure) → navigation vers la liste d’embarquement (scan).
3. Scan du QR ou saisie du code réservation → recherche de la réservation (`findReservationByCode` ou équivalent dans `AgenceEmbarquementPage`).
4. Si billet valide (statut **confirme** ou **paye**), enregistrement **embarque** : mise à jour `reservations` (statut, `statutEmbarquement`, `checkInTime`, `controleurId`), `auditLog`, et agrégats **boardingStats** (embarkedSeats), **dailyStats** (boardingClosedCount si clôture), **agencyLiveState** (vehicle in transit si applicable).
5. Optionnel : clôture de l’embarquement pour ce départ → verrouillage liste, mise à jour `boardingStats.status = 'closed'`, `absentSeats`, et éventuellement enregistrement véhicule en transit (flotte).

### Pages impliquées
- `BoardingDashboardPage` (`/agence/boarding`)
- `BoardingScanPage` → `AgenceEmbarquementPage` (`/agence/boarding/scan`)

### Collections Firestore
- **companies/{companyId}/agences/{agencyId}/reservations** : mise à jour `statut: 'embarque'`, `statutEmbarquement`, `checkInTime`, `auditLog`.
- **companies/{companyId}/agences/{agencyId}/boardingStats/{tripKey}** : embarkedSeats, absentSeats, status (open/closed).
- **companies/{companyId}/agences/{agencyId}/dailyStats/{date}** : boardingClosedCount.
- **companies/{companyId}/agences/{agencyId}/agencyLiveState/current** : état embarquement / véhicule en transit.
- **companies/{companyId}/fleetVehicles** (optionnel, pour capacité véhicule sur la page scan).

### Transitions
- Réservation : **confirme** | **paye** → **embarque** (via `updateStatut` dans `AgenceEmbarquementPage`, avec `reservationStatutService` / `buildStatutTransitionPayload` et respect de la capacité véhicule via `boardingStats`).

---

## 5. Courrier (session + envois)

### Rôle
**agentCourrier** (création/envoi), **comptable agence** (activation et validation de session).

### Suite d’actions
1. Agent crée une **session courrier** → statut **PENDING** (`courierSessionService.createCourierSession`).
2. Comptable **active** la session → **ACTIVE** (`activateCourierSession`).
3. Agent crée des **envois** (colis) tant que la session est ACTIVE : `createShipment` (statut **CREATED**), liés à `sessionId`, avec numéro d’envoi (ex. COMPANY-AGENCY-AGENT-SEQ).
4. Optionnel : mise en lot (batches), réception, remise (services dédiés dans `logistics/`).
5. Agent **clôture** la session → **CLOSED** ; calcul de `expectedAmount` à partir des envois de la session (`closeCourierSession`).
6. Comptable **valide** la session avec montant compté → **VALIDATED** ; enregistrement revenu courrier (mouvement `revenue_cash` sur `agency_cash`), mise à jour **dailyStats** (courierRevenue), **agencyLiveState**.

### Pages impliquées
- `CourierSessionPage` (`/agence/courrier/session`)
- `CourierCreateShipmentPage` (`/agence/courrier/nouveau`)
- `CourierBatchesPage`, `CourierReceptionPage`, `CourierPickupPage`, `CourierReportsPage`
- Comptabilité agence pour activation/validation des sessions courrier

### Collections Firestore
- **companies/{companyId}/agences/{agencyId}/courierSessions** : cycle PENDING → ACTIVE → CLOSED → VALIDATED.
- **companies/{companyId}/logistics/data/shipments** : envois (sessionId, statut CREATED, puis autres statuts selon le flux).
- **companies/{companyId}/logistics/data/events** : événements envoi.
- **companies/{companyId}/agences/{agencyId}/counters/shipmentSeq** : séquence numéro d’envoi.
- **companies/{companyId}/agences/{agencyId}/dailyStats/{date}** : courierRevenue.
- **companies/{companyId}/agences/{agencyId}/agencyLiveState/current**.
- **companies/{companyId}/financialAccounts**, **financialMovements**, **financialMovementIdempotency**.

### Transitions (session courrier)
- **PENDING** → **ACTIVE** (comptable).
- **ACTIVE** → **CLOSED** (agent).
- **CLOSED** → **VALIDATED** (comptable, avec montant compté).

---

## 6. Flotte agence (affectation véhicules, exploitation)

### Rôle
**agency_fleet_controller**, **chefAgence**, **admin_compagnie**.

### Suite d’actions
1. Consulter le tableau de bord flotte (`/agence/fleet`), véhicules disponibles, affectations, mouvements.
2. **Affecter** un véhicule à un trajet/départ : création d’une affectation (statut **AFFECTE**) (`vehiclesService.assignVehicle`), liaison possible à un trip instance.
3. **Confirmer le départ** : statut affectation → **DEPART_CONFIRME**, mise à jour véhicule (opérationnel **EN_TRANSIT**), enregistrement mouvement flotte et optionnellement `agencyLiveState` (vehicle in transit).
4. **Confirmer l’arrivée** : statut affectation → **ARRIVE**, véhicule de nouveau disponible (opérationnel **DISPONIBLE**), mise à jour mouvement.
5. Consulter véhicules, équipage, historique des mouvements.

### Pages impliquées
- `FleetDashboardPage` (`/agence/fleet`)
- `AgenceFleetOperationsPage` (`/agence/fleet/operations`)
- `FleetAssignmentPage` (`/agence/fleet/assignment`)
- `FleetVehiclesPage`, `FleetCrewPage`, `FleetMovementLogPage`

### Collections Firestore
- **companies/{companyId}/vehicles** (ou **fleetVehicles** selon contexte) : véhicules, statut opérationnel/technique.
- **companies/{companyId}/agences/{agencyId}/affectations** : affectations (AFFECTE → DEPART_CONFIRME → ARRIVE), vehicleId, tripId, départ/arrivée, équipage.
- **companies/{companyId}/fleetMovements** (ou équivalent) : historique des changements de statut.
- **companies/{companyId}/tripInstances** (ou intégration trajets) : liaison affectation ↔ trajet.
- **companies/{companyId}/agences/{agencyId}/agencyLiveState/current** : véhicules en transit, etc.

### Transitions (affectation)
- Création → **AFFECTE**.
- **AFFECTE** → **DEPART_CONFIRME** (`confirmDepartureAffectation`).
- **DEPART_CONFIRME** → **ARRIVE** (`confirmArrivalAffectation`).

---

## 7. Trésorerie agence (caisse, dépenses, versements)

### Rôle
**chefAgence**, **agency_accountant** (comptable agence), **admin_compagnie**.

### Suite d’actions
1. Consulter la **trésorerie agence** : position caisse (`agency_cash`), derniers mouvements, dépenses en attente (`/agence/treasury`).
2. **Soumettre une dépense** (caisse agence) : création d’un document dans **expenses** avec statut initial selon barèmes (`pending_manager`, `pending_accountant`, `pending_ceo`) (`expenses.createExpense`).
3. **Approuver / rejeter** une dépense : selon le rôle (manager, comptable, CEO) et les seuils (`expenses.approveExpense`, `rejectExpense`). Lors du passage en **paid**, enregistrement d’un mouvement financier (débit compte, crédit si applicable).
4. **Demande de versement** agence → banque compagnie : création d’une demande dans **treasuryTransferRequests** (`transferRequestsService.createTransferRequest`), validation par manager (`approveTransferRequest` / `rejectTransferRequest`), exécution par comptable/CEO → mouvement interne (trésorerie) et mise à jour des comptes.

### Pages impliquées
- `AgencyTreasuryPage` (`/agence/treasury`)
- `AgencyTreasuryNewOperationPage`, `AgencyTreasuryTransferPage`, `AgencyTreasuryNewPayablePage`
- `AgenceComptabilitePage` (accès trésorerie / validations)
- `AgencyManagerExpensesPage` (`/agence/expenses-approval`) pour validation des dépenses

### Collections Firestore
- **companies/{companyId}/financialAccounts** : comptes (agency_cash, banques compagnie, etc.).
- **companies/{companyId}/financialMovements** : tous les mouvements (revenue_cash, expense_payment, internal_transfer, etc.).
- **companies/{companyId}/financialMovementIdempotency** : clé d’idempotence par référence métier.
- **companies/{companyId}/expenses** : dépenses (agencyId, statut, approbations, paidAt).
- **companies/{companyId}/treasuryTransferRequests** : demandes de versement (pending_manager → approved/rejected → executed).

### Transitions (dépense)
- Création → **pending** | **pending_manager** | **pending_accountant** | **pending_ceo** (selon seuils).
- Pending → **approved** (après chaîne d’approbation).
- Pending → **rejected**.
- **approved** → **paid** (mouvement financier enregistré).

---

## 8. Comptabilité compagnie (Vue globale, trésorerie, dépenses)

### Rôle
**company_accountant**, **financial_director**, **admin_compagnie**, **admin_platforme**.

### Suite d’actions
1. Accès à l’espace comptabilité `/compagnie/:companyId/accounting` (Vue Globale, réservations en ligne, finances, compta, dépenses, trésorerie, rapports, paramètres).
2. **Vue Globale** : tableaux de bord, répartition paiements, top agences, alertes, réservations récentes.
3. **Trésorerie** : opérations, transferts, nouveaux payables, paiements fournisseurs (mêmes schémas que côté agence mais au niveau compagnie).
4. **Dépenses** : liste, approbation/rejet selon seuils, passage en paid (mouvements financiers).
5. **Rapports** et **paramètres** financiers.

### Pages impliquées
- `CompanyAccountantLayout` (layout avec navigation).
- `VueGlobale` (index accounting), `ReservationsEnLigne`, `Finances`, `ComptaPage`, `DepensesPage`, `ExpenseDashboard`.
- `CEOTreasuryPage`, `TreasuryNewOperationPage`, `TreasuryTransferPage`, `TreasuryNewPayablePage`, `TreasurySupplierPaymentPage`.
- `Rapports`, `Parametres`.

### Collections Firestore
- **companies/{companyId}/financialAccounts**, **financialMovements**, **financialMovementIdempotency**.
- **companies/{companyId}/expenses**.
- **companies/{companyId}/agences** : données agences pour agrégats.
- **companies/{companyId}/agences/{agencyId}/reservations** (lecture pour rapports).
- Autres collections métier (trajets, revenus, etc.) selon les pages.

---

## 9. Admin plateforme (compagnies, plans, revenus)

### Rôle
**admin_platforme**.

### Suite d’actions
1. Dashboard admin : métriques SaaS (compagnies actives, abonnements, MRR, commission, GMV, réservations, croissance).
2. Gestion des **compagnies** : liste, ajout, modification (`/admin/compagnies`, `/admin/compagnies/ajouter`, `/admin/compagnies/:id/modifier`).
3. Gestion des **plans** et abonnements (`/admin/plans`, `/admin/subscriptions`).
4. Revenus, finances, réservations, statistiques, paramètres plateforme, médias.

### Pages impliquées
- `AdminDashboard` (`/admin/dashboard`)
- `AdminCompagniesPage`, `AdminCompagnieAjouterPage`, `AdminModifierCompagniePage`
- `PlansManager`, `AdminSubscriptionsManager`, `AdminRevenueDashboard`, `AdminReservationsPage`, `AdminFinancesPage`, `AdminStatistiquesPage`
- `AdminParametresPlatformPage`, `MediaPage`

### Collections Firestore
- **companies** : fiches compagnies.
- Collections liées aux abonnements, plans, revenus plateforme (selon implémentation dans `useAdminStats`, `usePlatformStats`, etc.).
- **publicReservations** (possible pour stats globales).

---

## 10. CEO Compagnie (command center, flotte, agences)

### Rôle
**admin_compagnie** / **company_ceo**.

### Suite d’actions
1. Accès au **command center** (`/compagnie/:companyId/command-center`), tableau de bord compagnie, approbations paiements, dépenses CEO.
2. Gestion **flotte** (véhicules, maintenance, transit, incidents) et **finance flotte**.
3. Gestion **agences**, **paramètres**, **réservations**, **clients**, **images**, **paiement**, **avis clients**.
4. Revenus / liquidités, opérations réseau, notifications.

### Pages impliquées
- `CEOCommandCenterPage`, `CEOPaymentApprovalsPage`, `CEOExpensesPage`
- `CompagnieDashboard`, `CompagnieAgencesPage`, `CompagnieParametresTabsPage`, `CompagnieReservationsPage`, `CompagnieCustomersPage`, etc.
- `GarageDashboardPage`, `FleetFinancePage`, `LogisticsDashboardPage`
- `RevenusLiquiditesPage`, `OperationsFlotteLandingPage`

### Collections Firestore
- **companies/{companyId}/** : toute l’arborescence (agences, véhicules, affectations, reservations, expenses, financialAccounts, financialMovements, etc.).
- **companies/{companyId}/garage** (ou équivalent) selon structure réelle.

---

## 11. Garage / Logistique (flotte compagnie)

### Rôle
**responsable_logistique**, **chef_garage**, **admin_compagnie**, **admin_platforme**.

### Suite d’actions
1. Accès au garage `/compagnie/:companyId/garage` : dashboard, logistique, équipage, conformité, urgence, flotte, maintenance, transit, incidents.
2. Suivi des véhicules, statuts techniques et opérationnels, coûts flotte.

### Pages impliquées
- `GarageLayout`, `GarageDashboardHomePage`, `LogisticsDashboardPage`, `LogisticsCrewPage`
- `GarageDashboardPage` (vues fleet, maintenance, transit, incidents)

### Collections Firestore
- **companies/{companyId}/vehicles** (ou **fleetVehicles**).
- **companies/{companyId}/fleetMovements**, **companies/{companyId}/agences/{agencyId}/affectations**.
- Données logistique / équipage selon modules.

---

## 12. Poste de pilotage agence (dashboard manager)

### Rôle
**chefAgence**, **superviseur**, **admin_compagnie**.

### Suite d’actions
1. Accès au **poste de pilotage** (`/agence/dashboard`) : CA période, billets, taux de remplissage, trésorerie agence, colis créés/en transit, départs restants.
2. Actions rapides : opérations, finances, trésorerie, rapports.
3. Suivi des **guichets actifs** (postes ouverts, billets et revenus par session).
4. Alertes manager (dashboard, finances, opérations).

### Pages impliquées
- `ManagerCockpitPage` (`/agence/dashboard`)
- `ManagerOperationsPage`, `ManagerFinancesPage`, `ManagerTeamPage`, `ManagerReportsPage`

### Collections Firestore
- **companies/{companyId}/agences/{agencyId}/dailyStats/{date}**
- **companies/{companyId}/agences/{agencyId}/agencyLiveState/current**
- **companies/{companyId}/agences/{agencyId}/shifts** (guichets actifs)
- **companies/{companyId}/agences/{agencyId}/reservations**
- **companies/{companyId}/logistics/data/shipments** (colis)

---

## 13. Invitation et authentification

### Rôle
Utilisateur invité (lien par email).

### Suite d’actions
1. Clic sur lien **accept-invitation/:invitationId**.
2. Affichage de la page d’acceptation (contexte compagnie/agence/rôle).
3. Inscription / liaison du compte puis redirection selon le rôle.

### Pages impliquées
- `AcceptInvitationPage` (`/accept-invitation/:invitationId`)

### Collections Firestore
- **invitations** (ou chemin équivalent) : documents d’invitation (companyId, agencyId, rôle, etc.).

---

## Synthèse des collections Firestore principales

| Chemin | Usage principal |
|--------|------------------|
| **companies/{companyId}** | Données compagnie |
| **companies/{companyId}/agences/{agencyId}** | Données agence |
| **companies/{companyId}/agences/{agencyId}/reservations** | Réservations (guichet + en ligne) |
| **companies/{companyId}/agences/{agencyId}/shifts** | Postes guichet |
| **companies/{companyId}/agences/{agencyId}/shiftReports** | Rapports postes |
| **companies/{companyId}/agences/{agencyId}/courierSessions** | Sessions courrier |
| **companies/{companyId}/agences/{agencyId}/affectations** | Affectations véhicules |
| **companies/{companyId}/agences/{agencyId}/dailyStats/{date}** | Agrégats jour |
| **companies/{companyId}/agences/{agencyId}/agencyLiveState/current** | État temps réel |
| **companies/{companyId}/agences/{agencyId}/boardingStats/{tripKey}** | Stats embarquement |
| **companies/{companyId}/agences/{agencyId}/cashSessions** | Sessions caisse |
| **companies/{companyId}/logistics/data/shipments** | Envois courrier |
| **companies/{companyId}/logistics/data/batches** | Lots courrier |
| **companies/{companyId}/logistics/data/sessions** | Sessions logistiques (si utilisé) |
| **companies/{companyId}/vehicles** ou **fleetVehicles** | Véhicules |
| **companies/{companyId}/fleetMovements** | Mouvements flotte |
| **companies/{companyId}/financialAccounts** | Comptes financiers |
| **companies/{companyId}/financialMovements** | Mouvements financiers |
| **companies/{companyId}/financialMovementIdempotency** | Idempotence mouvements |
| **companies/{companyId}/expenses** | Dépenses |
| **companies/{companyId}/treasuryTransferRequests** | Demandes de versement |
| **publicReservations** | Résolution réservation par token / slug (accès client) |

---

*Document généré à partir de l’analyse du code source TELIYA (routes, pages, services, agrégats et types Firestore). Seuls les scénarios effectivement implémentés ont été décrits.*
