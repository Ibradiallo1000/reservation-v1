# TELIYA — Audit des modules du système

**Date :** 7 mars 2025  
**Objectif :** Vérifier quels modules existent, lesquels sont partiels et lesquels manquent.

---

## 1. Identification des modules fonctionnels

| # | Module | Statut | Commentaire |
|---|--------|--------|-------------|
| 1 | **Ticketing / Réservations** | **EXISTS** | Guichet, en ligne, réservations par agence, statuts, dailyStats. |
| 2 | **Boarding (Embarquement)** | **EXISTS** | Scan, absents, reports, boardingLogs, boardingClosures, boardingStats. |
| 3 | **Courrier / Colis** | **EXISTS** | Sessions, shipments, lots, réception, remise, rapports, revenus courrier. |
| 4 | **Gestion des agences** | **EXISTS** | CRUD agences, personnel par agence, invitations, paramètres. |
| 5 | **Gestion de la flotte** | **EXISTS** | Véhicules compagnie + agence, garage, maintenance, mouvements, affectations. |
| 6 | **Comptabilité / Finance** | **EXISTS** | Trésorerie, comptes, mouvements, dépenses, payables, validations, rapports. |
| 7 | **Dashboard compagnie (CEO / analytique)** | **EXISTS** | Poste de pilotage, revenus & liquidités, performance réseau, trip costs. |
| 8 | **Planification / Horaires trajets** | **PARTIAL** | weeklyTrips par agence, horaires/prix/places ; pas de calendrier global ni de planification avancée. |
| 9 | **Gestion clients (CRM)** | **MISSING** | Pas de module CRM dédié ; clients uniquement dans les réservations (nom, tél, email). |
| 10 | **Gestion du personnel / rôles** | **EXISTS** | Rôles, invitations, équipe agence, comptable/chef/courrier/guichet/embarquement/flotte. |

---

## 2. Détail par module

### MODULE: Ticketing / Réservations

**Statut:** EXISTS

**Pages principales:**
- `ReservationClientPage.tsx` (réservation en ligne publique)
- `ReservationDetailsPage.tsx` (détail billet public)
- `AgenceGuichetPage.tsx` (POS guichet)
- `ReceiptGuichetPage.tsx`, `ReservationPrintPage.tsx` (reçus)
- `ReservationsEnLignePage.tsx` (comptable — vérification preuves)
- `DashboardAgencePage.tsx` (stats réservations)
- `CompagnieReservationsPage.tsx` (vue compagnie)
- `FindReservationPage.tsx`, `ClientMesReservationsPage.tsx`, `ClientMesBilletsPage.tsx` (client)

**Services:**
- `guichetReservationService.ts` (création/modif résa guichet)
- `reservationStatutService.ts` (mise à jour statut)
- `resolutions.ts` (réservations) — logs
- `resolveReservation.ts` (résolution publicReservations → réservation interne)

**Collections Firestore:**
- `companies/{companyId}/agences/{agencyId}/reservations`
- `publicReservations` (accès public par slug/token)
- `companies/{companyId}/agences/{agencyId}/reservationLogs` (optionnel)
- `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` (référence billet)

**Dashboards connectés:**
- Dashboard agence (ventes, revenus billets, top trajets)
- CEO (CA via dailyStats issu des validations)
- Chef comptable (finances, réservations en ligne)

**Rôles interagissant:** guichetier, chefAgence, superviseur, agency_accountant, company_accountant, admin_compagnie, admin_platforme.

---

### MODULE: Boarding (Embarquement)

**Statut:** EXISTS

**Pages principales:**
- `AgenceEmbarquementPage.tsx` (scan, liste, absents, reports)
- `BoardingDashboardPage.tsx`, `BoardingScanPage.tsx`
- `ManagerCockpitPage.tsx` / `ManagerOperationsPage.tsx` (vue trajets / clôtures)

**Services:**
- Agrégats : `boardingStats.ts`, `agencyLiveState.ts`, `dailyStats.ts` (boardingClosedCount)
- Mise à jour statut réservation (embarqué, absent, report) dans les pages

**Collections Firestore:**
- `companies/{companyId}/agences/{agencyId}/reservations` (lecture/écriture statut)
- `companies/{companyId}/agences/{agencyId}/boardingStats/{tripKey}`
- `companies/{companyId}/agences/{agencyId}/boardingClosures`
- `companies/{companyId}/agences/{agencyId}/boardingLogs`
- `companies/{companyId}/agences/{agencyId}/agencyLiveState/current`
- `companies/{companyId}/agences/{agencyId}/dailyStats/{date}`
- `companies/{companyId}/agences/{agencyId}/weeklyTrips`
- `companies/{companyId}/fleetVehicles`, `fleetMovements`

**Dashboards connectés:**
- Manager agence (cockpit, opérations) — trajets du jour, clôtures
- CEO — agencyLiveState (vehiclesInTransitCount, etc.)

**Rôles interagissant:** chefEmbarquement, chefAgence, admin_compagnie.

---

### MODULE: Courier / Parcels

**Statut:** EXISTS

**Pages principales:**
- `CourierSessionPage.tsx` (session, activation)
- `CourierCreateShipmentPage.tsx` (nouvel envoi)
- `CourierBatchesPage.tsx` (lots)
- `CourierReceptionPage.tsx`, `CourierPickupPage.tsx`
- `CourierReportsPage.tsx` (rapports session)
- `AgenceComptabilitePage.tsx` (activation/validation sessions courrier)

**Services:**
- `createShipment.ts`, `markShipmentArrived.ts`, `confirmPickup.ts`, `confirmArrival.ts`
- `courierSessionService.ts` (create, activate, close, validate)
- `recordLogisticsLedgerEntry.ts`
- `courierBatches/*` (add/remove shipment, confirm departure)

**Collections Firestore:**
- `companies/{companyId}/logistics/data/shipments`
- `companies/{companyId}/logistics/data/batches`
- `companies/{companyId}/logistics/data/events`
- `companies/{companyId}/logistics/data/sessions` (logistics central)
- `companies/{companyId}/logistics/data/ledger`
- `companies/{companyId}/agences/{agencyId}/courierSessions`
- `companies/{companyId}/agences/{agencyId}/batches` (phase 3 lots par agence)
- `companies/{companyId}/agences/{agencyId}/counters/shipmentSeq`, `counters/agentCourrier`

**Dashboards connectés:**
- Dashboard agence (revenus courrier)
- CEO / Chef comptable (courierRevenue dans dailyStats)

**Rôles interagissant:** agentCourrier, chefAgence, agency_accountant, admin_compagnie.

---

### MODULE: Agencies management

**Statut:** EXISTS

**Pages principales:**
- `CompagnieAgencesPage.tsx` (liste, ajout agences)
- `AjouterAgenceForm.tsx`
- `CompagnieParametresTabsPage.tsx` (paramètres dont agences)
- Admin : `AdminCompagniesPage.tsx`, `AdminCompagnieAjouterPage.tsx`, `AdminModifierCompagniePage.tsx`

**Services:**
- CRUD agences via Firestore (collection agences)
- `createInvitationDoc.ts` (invitations pour rattacher des utilisateurs aux agences)

**Collections Firestore:**
- `companies/{companyId}/agences`
- `companies/{companyId}/agences/{agencyId}` (document agence)
- `invitations` (globale, avec companyId/agencyId/role)

**Dashboards connectés:**
- CEO (liste agences, performance par agence)
- Admin plateforme (toutes compagnies et leurs agences)

**Rôles interagissant:** admin_compagnie, admin_platforme, chefAgence (équipe de son agence).

---

### MODULE: Fleet management

**Statut:** EXISTS

**Pages principales:**
- Compagnie : `CompanyGlobalFleetPage.tsx`, `GarageDashboardPage.tsx`, `GarageDashboardHomePage.tsx` (garage layout)
- Agence : `FleetDashboardPage.tsx`, `FleetVehiclesPage.tsx`, `FleetAssignmentPage.tsx`, `FleetMovementLogPage.tsx`, `AgenceFleetOperationsPage.tsx`
- `TripCostsPage.tsx` (coûts par trajet)

**Services:**
- `vehiclesService.ts`, `vehicleModelsService.ts`
- `affectationService.ts`, `fleetStateMachine.ts`
- `tripCostsService.ts`, `fleetMaintenanceService.ts`
- `vehicleFinancialHistory.ts`, `expenses.ts` (dépenses liées véhicules)

**Collections Firestore:**
- `companies/{companyId}/fleetVehicles`
- `companies/{companyId}/fleetMovements`
- `companies/{companyId}/vehicleModels`
- `companies/{companyId}/agences/{agencyId}/affectations` (legacy)
- `companies/{companyId}/tripCosts`
- `companies/{companyId}/fleetMaintenance`
- `companies/{companyId}/vehicleFinancialHistory`

**Dashboards connectés:**
- CEO (poste de pilotage — flotte, coûts, marge)
- Chef garage (garage dashboard, maintenance, transit, incidents)
- Dashboard flotte agence (contrôleur flotte)

**Rôles interagissant:** chef_garage, agency_fleet_controller, chefAgence, admin_compagnie, company_accountant (trip costs), admin_platforme.

---

### MODULE: Accounting / Finance

**Statut:** EXISTS

**Pages principales:**
- `CompanyFinancesPage.tsx` (revenus consolidés)
- `RevenusLiquiditesPage.tsx` (revenus + liquidités)
- `CEOTreasuryPage.tsx` (trésorerie)
- `CompagnieComptabilitePage.tsx` (contrôle & audit)
- `AgenceComptabilitePage.tsx` (comptable agence — postes, courrier, réceptions)
- Chef comptable : `VueGlobale.tsx`, `Finances.tsx`, `Rapports.tsx`, `Parametres.tsx`, `ReservationsEnLignePage.tsx`
- `AgencyTreasuryPage.tsx`, `ManagerFinancesPage.tsx`, `ManagerReportsPage.tsx`
- `TripCostsPage.tsx`, `CEOPaymentApprovalsPage.tsx`

**Services:**
- `financialAccounts.ts`, `financialMovements.ts`, `companyBanks.ts`
- `treasuryTransferService.ts`, `expenses.ts`
- `payablesService.ts`, `paymentProposalsService.ts`, `paymentsService.ts`
- `financialSettingsService.ts`, `riskSettingsService.ts`
- `sessionService.ts`, `validateShiftWithDeposit.ts`, `shiftApi.ts` (validation postes → dailyStats)
- `dailyStats.ts` (ticketRevenue, courierRevenue, totalRevenue)
- `backfillDailyStatsRevenue.ts` (backfill historique)

**Collections Firestore:**
- `companies/{companyId}/financialAccounts`
- `companies/{companyId}/financialMovements`
- `companies/{companyId}/financialMovementIdempotency`
- `companies/{companyId}/companyBanks`
- `companies/{companyId}/expenses`
- `companies/{companyId}/agences/{agencyId}/expenses/current` (agrégat dépenses agence — si utilisé)
- `companies/{companyId}/payables`
- `companies/{companyId}/paymentProposals`
- `companies/{companyId}/financialSettings/current`
- `companies/{companyId}/agences/{agencyId}/dailyStats/{date}`
- `companies/{companyId}/agences/{agencyId}/shifts`, `shiftReports`
- `companies/{companyId}/riskSettings/current`

**Dashboards connectés:**
- CEO (revenus & liquidités, poste de pilotage)
- Chef comptable (Vue globale, Finances, Trésorerie, Rapports)
- Comptable agence (comptabilité agence)
- Chef agence (finances, rapports, trésorerie agence)

**Rôles interagissant:** admin_compagnie, company_accountant, financial_director, agency_accountant, chefAgence, superviseur, admin_platforme.

---

### MODULE: Company dashboard (CEO / global analytics)

**Statut:** EXISTS

**Pages principales:**
- `CEOCommandCenterPage.tsx` (poste de pilotage)
- `CompagnieDashboard.tsx` (performance réseau)
- `RevenusLiquiditesPage.tsx`
- `OperationsFlotteLandingPage.tsx`
- `useCompanyDashboardData.ts` (hook données dashboard)

**Services:**
- Lecture agrégats : dailyStats (collectionGroup), agencyLiveState, expenses, shiftReports, tripCosts
- `calculateCompanyCashPosition`, `listAccounts`, `listUnpaidPayables`
- `calculateAgencyProfit`, `getRiskSettings`, `listVehicles`
- Moteurs : `trendEngine.ts`, `profitEngine.ts`, `anomalyEngine.ts`, `simulationEngine.ts`

**Collections Firestore:**
- `companies/{companyId}`
- `companies/{companyId}/agences`
- collectionGroup `dailyStats`, `agencyLiveState`, `expenses`, `shiftReports`, `shifts`
- `companies/{companyId}/agences/{agencyId}/reservations` (trip revenues)
- `companies/{companyId}/tripCosts`, `companies/{companyId}/fleetVehicles`
- `companies/{companyId}/financialAccounts`, payables
- `companies/{companyId}/riskSettings/current`

**Dashboards connectés:** C’est le dashboard CEO lui-même (poste de pilotage, revenus, liquidités, risques, top agences).

**Rôles interagissant:** admin_compagnie, admin_platforme (impersonation).

---

### MODULE: Trip planning / scheduling

**Statut:** PARTIAL

**Pages principales:**
- `AgenceTrajetsPage.tsx` (trajets par agence — weeklyTrips)
- `ManagerOperationsPage.tsx` (opérations du jour basées sur weeklyTrips)
- `generateWeeklyTrips.ts` (création trajets)
- Réservation publique : utilisation de `weeklyTrips` pour horaires/prix (via useVilleOptions, etc.)

**Services:**
- `generateWeeklyTrips.ts` (écriture weeklyTrips)
- Lecture : `weeklyTrips` dans plusieurs pages (guichet, embarquement, opérations, public)

**Collections Firestore:**
- `companies/{companyId}/agences/{agencyId}/weeklyTrips`

**Ce qui manque:**
- Pas de calendrier global compagnie (trajets définis par agence)
- Pas de planification de courses/jours (type “service” ou “ligne” récurrente)
- Pas de gestion centralisée des horaires à l’échelle réseau

**Rôles interagissant:** chefAgence, superviseur, admin_compagnie (trajets), guichetier (lecture), chefEmbarquement (lecture).

---

### MODULE: Customer management (CRM)

**Statut:** MISSING

**Constats:**
- Aucune collection dédiée “clients” ou “customers”
- Les données client existent uniquement dans les réservations : `clientNom`, `telephone`, `email`
- Pas de page “Fiche client”, “Historique client”, “Segmentation”
- Pas de service CRM dédié

**Rôles:** Aucun rôle n’interagit avec un module CRM car il n’existe pas.

---

### MODULE: Staff / roles management

**Statut:** EXISTS

**Pages principales:**
- `ChefAgencePersonnelPage.tsx`, `AgencePersonnelPage.tsx` (équipe agence)
- `CompagnieInvitationsPage.tsx` (invitations compagnie)
- `ParametresPersonnel.tsx` (paramètres personnel)
- `AcceptInvitationPage.tsx` (acceptation invitation)
- Admin : `AjouterPersonnelPlateforme.tsx`, gestion rôles dans Admin

**Services:**
- `createInvitationDoc.ts` (création invitation avec rôle, companyId, agencyId)
- AuthContext / PrivateRoute (normalisation rôles, redirection)
- `roleCapabilities.ts`, `capabilityEngine.ts`, `useCapabilities.ts`

**Collections Firestore:**
- `invitations`
- `users/{uid}` (profil, rôle, companyId, agencyId)
- `companies/{companyId}/agences/{agencyId}/counters/{role}` (codes agent)

**Dashboards connectés:**
- Manager agence (équipe)
- CEO (invitations, paramètres)
- Admin (utilisateurs / invitations plateforme)

**Rôles interagissant:** admin_platforme, admin_compagnie, chefAgence, agency_accountant (création invitation courrier côté équipe).

---

## 3. Structure des données Firestore

Liste des collections/sous-collections utilisées par TELIYA et module associé.

| Chemin Firestore | Module(s) |
|------------------|-----------|
| `companies` | Agences, CEO, Admin, Abonnements |
| `companies/{companyId}/agences` | Agences, Réservations, Tous modules agence |
| `companies/{companyId}/agences/{agencyId}/reservations` | Ticketing / Réservations |
| `companies/{companyId}/agences/{agencyId}/dailyStats/{date}` | Réservations (revenus), Comptabilité, CEO |
| `companies/{companyId}/agences/{agencyId}/shifts` | Ticketing (guichet), Comptabilité |
| `companies/{companyId}/agences/{agencyId}/shiftReports` | Comptabilité, CEO |
| `companies/{companyId}/agences/{agencyId}/weeklyTrips` | Trip planning, Guichet, Embarquement |
| `companies/{companyId}/agences/{agencyId}/agencyLiveState/current` | Boarding, CEO |
| `companies/{companyId}/agences/{agencyId}/boardingStats/{tripKey}` | Boarding |
| `companies/{companyId}/agences/{agencyId}/boardingClosures` | Boarding |
| `companies/{companyId}/agences/{agencyId}/boardingLogs` | Boarding |
| `companies/{companyId}/agences/{agencyId}/courierSessions` | Courrier |
| `companies/{companyId}/agences/{agencyId}/batches` | Courrier (lots agence) |
| `companies/{companyId}/agences/{agencyId}/counters/*` | Courrier, Personnel (codes agent) |
| `companies/{companyId}/agences/{agencyId}/reservationLogs` | Réservations (logs) |
| `companies/{companyId}/agences/{agencyId}/affectations` | Flotte (legacy) |
| `companies/{companyId}/agences/{agencyId}/expenses/current` | Finance (agrégat dépenses agence) |
| `companies/{companyId}/logistics/data/shipments` | Courrier |
| `companies/{companyId}/logistics/data/batches` | Courrier |
| `companies/{companyId}/logistics/data/events` | Courrier |
| `companies/{companyId}/logistics/data/sessions` | Courrier (logistics central) |
| `companies/{companyId}/logistics/data/ledger` | Courrier |
| `companies/{companyId}/logistics/openSessions/byAgent/{agentId}` | Courrier |
| `companies/{companyId}/fleetVehicles` | Flotte |
| `companies/{companyId}/fleetMovements` | Flotte |
| `companies/{companyId}/vehicleModels` | Flotte |
| `companies/{companyId}/tripCosts` | Flotte / Coûts, CEO, Comptabilité |
| `companies/{companyId}/fleetMaintenance` | Flotte |
| `companies/{companyId}/vehicleFinancialHistory` | Flotte / Finance |
| `companies/{companyId}/financialAccounts` | Comptabilité / Trésorerie |
| `companies/{companyId}/financialMovements` | Comptabilité / Trésorerie |
| `companies/{companyId}/financialMovementIdempotency` | Comptabilité |
| `companies/{companyId}/companyBanks` | Comptabilité |
| `companies/{companyId}/expenses` | Comptabilité / Dépenses |
| `companies/{companyId}/payables` | Comptabilité |
| `companies/{companyId}/paymentProposals` | Comptabilité |
| `companies/{companyId}/financialSettings/current` | Comptabilité |
| `companies/{companyId}/riskSettings/current` | CEO / Intelligence |
| `companies/{companyId}/subscription/current` | Abonnements / Capabilities |
| `companies/{companyId}/avis` | Avis clients (modération) |
| `companies/{companyId}/imagesBibliotheque` | Média / Vitrine |
| `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` | Réservations (référence) |
| `publicReservations` | Réservations (accès public) |
| `invitations` | Staff / Invitations |
| `users/{uid}` | Auth / Staff |
| `plans` | Abonnements (plateforme) |
| `villes` | Référentiel (villes) |
| `messages` | Contact (si utilisé) |
| `notifications` | Notifications (si utilisé) |
| `mediaPlatform` | Média plateforme |

---

## 4. Analyse des dashboards par rôle

### CEO (admin_compagnie)

- **Données lues :** dailyStats (ticketRevenue, courierRevenue, totalRevenue), agencyLiveState, expenses, shiftReports, reservations (trip revenues), tripCosts, fleetVehicles, financialAccounts, unpaidPayables, riskSettings.
- **Modules qui alimentent :** Réservations (via dailyStats après validation), Courrier (via dailyStats après validation), Comptabilité (trésorerie, comptes), Flotte (véhicules, coûts), Agences (liste, performance).

### Chef comptable (company_accountant)

- **Données lues :** dailyStats (collectionGroup), reservations (par agence), shiftReports, financialAccounts, financialMovements, payables, expenses (agence/current pour Finances).
- **Modules qui alimentent :** Réservations (CA billets), Courrier (CA courrier), Comptabilité (trésorerie, rapports), Trip costs.

### Chef d’agence (chefAgence)

- **Données lues :** reservations, shifts, shiftReports, dailyStats, agencyLiveState, boardingClosures, weeklyTrips, courierSessions, shipments, fleet (agence), personnel, invitations (équipe).
- **Modules qui alimentent :** Réservations, Boarding, Courrier, Flotte agence, Staff, Trip planning (weeklyTrips).

### Comptable agence (agency_accountant)

- **Données lues :** shifts, shiftReports, reservations, courierSessions, trésorerie agence (comptes, mouvements).
- **Modules qui alimentent :** Réservations (validation postes → dailyStats), Courrier (activation/validation sessions → dailyStats), Comptabilité (réceptions, validations).

### Guichetier

- **Données lues :** weeklyTrips, shifts, reservations (son poste).
- **Modules qui alimentent :** Réservations (création ventes guichet), pas de dashboard analytique dédié (vue POS).

### Agent courrier

- **Données lues :** courierSessions, shipments (origine agence).
- **Modules qui alimentent :** Courrier uniquement (session, envois, rapports).

### Chef embarquement

- **Données lues :** reservations, weeklyTrips, boardingClosures, boardingLogs, fleetVehicles.
- **Modules qui alimentent :** Boarding, Réservations (statut), Flotte (contexte).

### Responsable logistique

- **Dans TELIYA :** Il n’y a pas de rôle explicite “responsable logistique”. Les rôles liés au courrier sont **agentCourrier** (opérations) et **chefAgence** (pilotage courrier). Le **comptable agence** valide les sessions. Un “responsable logistique” correspondrait à une vue consolidée courrier (multi-agences) — actuellement absente ; le CEO voit les revenus courrier agrégés via dailyStats, pas un dashboard logistique dédié.

---

## 5. Interconnexions entre modules

- **Réservations (guichet + en ligne)**  
  - Génèrent du revenu (montant) → enregistré dans les réservations.  
  - À la **validation du poste** par le comptable → **dailyStats** (ticketRevenue, totalRevenue).  
  - dailyStats → **Dashboard CEO**, **Revenus & Liquidités**, **Finances chef comptable**, **Dashboard agence**.

- **Courrier**  
  - Envois (shipments) avec transportFee + insuranceAmount (payés) → à la **validation de la session courrier** par le comptable → **dailyStats** (courierRevenue, totalRevenue).  
  - dailyStats → mêmes **dashboards finance** (CEO, chef comptable, agence).

- **Flotte**  
  - **Coûts** (tripCosts, dépenses, maintenance) → utilisés dans le **poste de pilotage** (CEO) pour calcul de marge / profit.  
  - Pas d’écriture de revenus par la flotte ; revenus = billets + courrier via dailyStats.

- **Boarding**  
  - Met à jour le **statut** des réservations (embarqué, absent, report) et **boardingStats** / **boardingLogs** / **boardingClosures**.  
  - **dailyStats** (boardingClosedCount) mis à jour à la clôture.  
  - Pas de flux financier direct ; les revenus restent ceux validés par la comptabilité.

- **Comptabilité**  
  - **Valide les postes guichet** → alimente dailyStats (ticketRevenue).  
  - **Valide les sessions courrier** → alimente dailyStats (courierRevenue).  
  - Gère **trésorerie** (comptes, mouvements, virements, dépenses, payables).  
  - Tous les indicateurs “revenus” des dashboards CEO/compagnie/agence passent par dailyStats ou par les mêmes agrégats.

- **Trip planning (weeklyTrips)**  
  - Alimente le **guichet** (prix, horaires, places), l’**embarquement** (trajets du jour), la **réservation publique** (recherche trajets).  
  - Pas de module “planification” central au niveau compagnie.

---

## 6. Modules manquants ou incomplets

- **CRM / Gestion clients**  
  - Manquant. Pas de fiche client, historique, ni segmentation.  
  - Recommandation : soit un module “Clients” (fiche, historique de réservations, téléphone/email), soit au minimum un historique des réservations par téléphone/email (sans créer de collection clients dédiée).

- **Trip planning / Planification**  
  - Partiel : **weeklyTrips** par agence (départ, arrivée, horaires, prix, places).  
  - Manque : calendrier global, lignes/services récurrents, planification des courses à l’échelle réseau, gestion des capacités par véhicule.

- **Suivi des coûts flotte**  
  - Partiel : **tripCosts** (carburant, chauffeur, etc.) et **fleetMaintenance** existent.  
  - Manque possible : lien systématique coûts ↔ véhicule/trajet, tableau de bord “coût par bus” ou “coût par ligne”.

- **Comptabilité unifiée**  
  - Existant mais dispersé : trésorerie, comptes, mouvements, dépenses, payables, validations.  
  - Manque possible : plan comptable, écritures comptables standard (journal), export comptable (FEC / logiciels tiers), rapports réglementaires.

- **Responsable logistique (vue dédiée)**  
  - Pas de rôle ni dashboard “logistique” dédié.  
  - Recommandation : soit un rôle “responsable logistique” avec vue multi-agences (envois, lots, délais), soit étendre le dashboard CEO avec un onglet “Logistique” (courrier par agence, volumes).

---

## 7. Bilan d’architecture et priorités

### Modules pleinement implémentés

- Ticketing / Réservations (guichet + en ligne, statuts, revenus)
- Boarding (scan, absents, reports, clôtures)
- Courrier / Colis (sessions, envois, lots, revenus intégrés)
- Gestion des agences
- Gestion de la flotte (compagnie + agence, garage, coûts)
- Comptabilité / Finance (trésorerie, validations, dailyStats, rapports)
- Dashboard CEO (poste de pilotage, revenus, liquidités, risques)
- Gestion du personnel / rôles (invitations, rôles, capabilities)

### Modules partiellement implémentés

- **Trip planning / scheduling** : weeklyTrips par agence ; pas de planification centralisée ni de calendrier réseau.

### Modules manquants

- **Customer management (CRM)** : pas de module ni de collections dédiées.

### Recommandations “à construire en priorité”

1. **CRM léger**  
   - Objectif : retrouver un client (tél/email), voir son historique de réservations.  
   - Option simple : recherche par téléphone/email sur les réservations + page “Historique” sans nouvelle collection.  
   - Option complète : collection `clients` ou `customers` avec fiche et lien aux réservations.

2. **Planification des trajets (réseau)**  
   - Objectif : définir lignes/horaires à l’échelle compagnie, réutilisables par les agences.  
   - Pistes : collection “lignes” ou “services”, puis génération de weeklyTrips (ou équivalent) à partir de ces définitions.

3. **Vue “Logistique” (optionnel)**  
   - Si besoin d’un pilote logistique : dashboard ou onglet dédié (envois par agence, délais, écarts) sans forcément créer un nouveau rôle tout de suite.

4. **Comptabilité (approfondissement)**  
   - Si besoin d’un vrai référentiel comptable : plan comptable, écritures en journal, export FEC / intégration logiciels comptables.

5. **Coûts flotte (affinage)**  
   - Si besoin de “coût par bus” ou “coût par ligne” : renforcer le lien dépenses/tripCosts ↔ véhicule/trajet et ajouter des vues dédiées.

---

*Rapport d’audit des modules du système TELIYA — basé sur l’analyse du code existant.*
