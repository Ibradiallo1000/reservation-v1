# Rôles et permissions TELIYA

Analyse du système de rôles, des routes protégées et des accès par rôle dans l’application TELIYA.

---

## 1. Sources de vérité

| Fichier | Rôle |
|--------|------|
| **`src/constants/routePermissions.ts`** | Rôles autorisés par zone (layout / route). Utilisé par `AppRoutes` et `PrivateRoute` / `ProtectedRoute`. |
| **`src/roles-permissions.ts`** | Type `Role`, modules (`ModuleKey`), et `permissionsByRole` (modules par rôle). Utilisé pour la logique métier (ex. menus, `hasPermission` côté back-office). |
| **`src/modules/auth/components/PrivateRoute.tsx`** | Guard : utilisateur authentifié + `user.role` dans `allowedRoles`. Sinon redirection vers `defaultLandingByRole[role]` ou `/login`. |
| **`src/modules/auth/components/ProtectedRoute.tsx`** | Wrapper autour de `PrivateRoute` + option `AuthCurrencyProvider` (devise compagnie). |
| **`src/modules/auth/components/TenantGuard.tsx`** | Vérification multi-tenant : `user.companyId` doit correspondre au tenant (URL ou sous-domaine). `admin_platforme` peut contourner. |
| **`src/contexts/AuthContext.tsx`** | `landingTargetForRoles`, `hasPermission(permission)` (admin_platforme = tout autorisé, sinon `user.permissions`), `isPlatformAdmin`. |

---

## 2. Liste des rôles (canoniques)

Rôles reconnus par l’app (normalisation dans `PrivateRoute` et `AuthContext`) :

| Rôle | Description | Alias / normalisation |
|------|-------------|------------------------|
| **admin_platforme** | Admin plateforme SaaS | — |
| **admin_compagnie** | CEO / direction compagnie | `company_ceo` → admin_compagnie |
| **company_accountant** | Comptable compagnie | — |
| **financial_director** | DAF (superviseur financier) | — |
| **responsable_logistique** | Responsable logistique / flotte | — |
| **chef_garage** | Alias garage | → responsable_logistique |
| **chefAgence** | Chef d’agence | chefagence → chefAgence |
| **superviseur** | Superviseur agence | — |
| **agency_accountant** | Comptable agence | — |
| **guichetier** | Guichetier | — |
| **chefEmbarquement** | Chef embarquement | chefembarquement, agency_boarding_officer, embarquement → chefEmbarquement |
| **agency_fleet_controller** | Contrôleur flotte agence | — |
| **agentCourrier** | Agent courrier | agentcourrier → agentCourrier |
| **unauthenticated** | Non connecté (sentinelle) | — |
| **user** | Rôle par défaut (fallback) | — |

**Client** : pas de rôle ; accès public (réservation, billet, preuve) sans être dans ce tableau.

---

## 3. routePermissions (zones / routes)

Chaque clé est utilisée comme `allowedRoles` sur une ou plusieurs routes.

| Clé | Rôles autorisés |
|-----|------------------|
| **adminLayout** | admin_platforme |
| **compagnieLayout** | admin_compagnie, admin_platforme |
| **garageLayout** | responsable_logistique, chef_garage, admin_compagnie, admin_platforme |
| **logisticsDashboard** | responsable_logistique, chef_garage, admin_compagnie, admin_platforme |
| **companyAccountantLayout** | company_accountant, financial_director, admin_compagnie, admin_platforme |
| **agenceShell** | chefAgence, superviseur, agentCourrier, admin_compagnie |
| **boarding** | chefEmbarquement, chefAgence, admin_compagnie |
| **fleet** | agency_fleet_controller, chefAgence, admin_compagnie |
| **guichet** | guichetier, chefAgence, admin_compagnie |
| **comptabilite** | agency_accountant, admin_compagnie |
| **validationsAgence** | chefAgence, superviseur, admin_compagnie |
| **receiptGuichet** | chefAgence, guichetier, admin_compagnie |
| **courrier** | agentCourrier, chefAgence, admin_compagnie |
| **cashControl** | guichetier, agentCourrier, agency_accountant, chefAgence, admin_compagnie |
| **tripCosts** | chefAgence, company_accountant, financial_director, admin_compagnie, admin_platforme |

---

## 4. Routes protégées (résumé)

- **`/admin/*`** : `PrivateRoute(adminLayout)` + `TenantGuard` non requis.
- **`/compagnie/:companyId/trip-costs`** : `PrivateRoute(tripCosts)` + TenantGuard.
- **`/compagnie/:companyId/notifications`** : admin_compagnie, company_accountant, financial_director, admin_platforme + TenantGuard.
- **`/compagnie/:companyId/*`** (layout CEO) : `PrivateRoute(compagnieLayout)` + TenantGuard.
- **`/compagnie/:companyId/garage/*`** : `PrivateRoute(garageLayout)` + TenantGuard ; sous-routes logistique : `logisticsDashboard`.
- **`/compagnie/:companyId/accounting/*`** : `PrivateRoute(companyAccountantLayout)` + TenantGuard.
- **`/agence/*`** (shell manager) : `PrivateRoute(agenceShell)` + TenantGuard ; sous-routes : trajets (agenceShell), expenses-approval (validationsAgence), courrier (courrier).
- **`/agence/boarding/*`** : `PrivateRoute(boarding)` (pas sous le shell agence).
- **`/agence/fleet/*`** : `PrivateRoute(fleet)`.
- **`/agence/guichet`** : `ProtectedRoute(guichet)`.
- **`/agence/comptabilite`** et trésorerie comptabilité : `ProtectedRoute(comptabilite)`.
- **`/agence/cash-sessions`** : `ProtectedRoute(cashControl)`.
- **`/agence/receipt/:id`**, **`/agence/reservations/print`** : `ProtectedRoute(receiptGuichet)`.
- **`/compagnie/:companyId/financial-settings`** : admin_compagnie, company_accountant, financial_director, admin_platforme + TenantGuard.

Les routes publiques (login, register, `/:slug/reserver`, `/:slug/reservation/:id`, etc.) ne sont pas protégées par rôle.

---

## 5. Redirection après login (landing par rôle)

- **admin_platforme** → `/admin/dashboard`
- **admin_compagnie** / **company_ceo** (avec companyId) → `/compagnie/:companyId/command-center`
- **company_accountant** / **financial_director** (avec companyId) → `/compagnie/:companyId/accounting`
- **agency_accountant** → `/agence/comptabilite`
- **chefAgence** / **superviseur** → `/agence/dashboard`
- **chefEmbarquement** → `/agence/boarding`
- **agency_fleet_controller** → `/agence/fleet`
- **guichetier** → `/agence/guichet`
- **agentCourrier** → `/agence/courrier`
- **responsable_logistique** / **chef_garage** (avec companyId) → `/compagnie/:companyId/garage/dashboard` (via LoginPage / defaultLandingByRole)

---

## 6. Tableau par rôle : pages accessibles, actions, modules

### Client (public, non authentifié)

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **Client** | `/`, `/:slug/reserver`, `/:slug/reservation/:id`, `/:slug/mon-billet`, `/resultats`, `/villes`, `/mes-reservations`, `/mes-billets`, `/login`, `/register`, `/:slug/mentions-legales`, etc. | Réserver, voir billet (QR), soumettre preuve de paiement, consulter mes réservations/billets | Portail public, réservation, preuve (Cloud Function) |

---

### admin_platforme (admin plateforme)

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **admin_platforme** | Tout `/admin/*` (dashboard, compagnies, plans, subscriptions, revenus, reservations, finances, statistiques, parametres-platforme, media). Accès **impersonation** à toute compagnie : `/compagnie/:companyId/*`, `/compagnie/:companyId/garage/*`, `/compagnie/:companyId/accounting/*`. Trip costs, notifications, financial-settings pour toute compagnie. | Créer/modifier compagnies, gérer plans et abonnements, voir métriques SaaS, accéder à une compagnie en mode inspection. `hasPermission` toujours true. Contourne TenantGuard. | Admin layout, CompagnieLayout (CEO), Garage, CompanyAccountantLayout |

---

### admin_compagnie / CEO (direction compagnie)

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **admin_compagnie** | `/compagnie/:companyId/*` (command-center, payment-approvals, ceo-expenses, revenus-liquidites, fleet, fleet-finance, dashboard, comptabilite, agences, paramètres, reservations, customers, images, payment-settings, avis-clients). Trip costs, notifications, financial-settings. **Agence** : tout le shell `/agence` (dashboard, operations, finances, treasury, team, reports, courrier), expenses-approval, guichet, comptabilite, cash-sessions, receipt, boarding, fleet. | Pilotage compagnie, approbations paiements, dépenses CEO, flotte, agences, paramètres, réservations, clients. Côté agence : poste de pilotage, opérations, finances, trésorerie, validation dépenses, guichet, comptabilité, courrier, embarquement, flotte. | CompagnieLayout, ManagerShellPage, BoardingLayout, FleetLayout, CourierLayout, AgenceComptabilitePage, AgenceGuichetPage, CashSessionsPage, ReceiptGuichetPage |

---

### company_accountant (comptable compagnie)

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **company_accountant** | `/compagnie/:companyId/accounting/*` (Vue Globale, reservations-en-ligne, finances, compta, expenses, expenses-dashboard, treasury, rapports, paramètres). `/compagnie/:companyId/trip-costs`, notifications, financial-settings. | Vue globale, réservations en ligne, finances, compta, dépenses (approbation selon seuils), trésorerie (opérations, transferts, payables, fournisseurs), rapports. | CompanyAccountantLayout |

---

### financial_director (DAF)

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **financial_director** | Mêmes routes que **company_accountant** : `/compagnie/:companyId/accounting/*`, trip-costs, notifications, financial-settings. | Même périmètre que comptable compagnie (supervision financière et validation). | CompanyAccountantLayout |

---

### responsable_logistique / chef_garage

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **responsable_logistique** / **chef_garage** | `/compagnie/:companyId/garage/*` (dashboard, logistics, logistics/crew, compliance, emergency, fleet, maintenance, transit, incidents). | Dashboard garage, logistique, équipage, conformité, urgence, flotte, maintenance, transit, incidents. | GarageLayout |

---

### chefAgence

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **chefAgence** | **Shell agence** : `/agence/dashboard`, operations, trajets, finances, treasury (et sous-pages new-operation, transfer, new-payable), team, reports. **Courrier** : `/agence/courrier/*` (session, nouveau, lots, reception, remise, rapport). **Validation dépenses** : `/agence/expenses-approval`. **Guichet** : `/agence/guichet`. **Comptabilité agence** : `/agence/comptabilite` et trésorerie. **Cash** : `/agence/cash-sessions`. **Receipt** : `/agence/receipt/:id`, `/agence/reservations/print`. **Embarquement** : `/agence/boarding`, `/agence/boarding/scan`. **Flotte** : `/agence/fleet/*`. | Poste de pilotage, opérations, trajets, finances, trésorerie, équipe, rapports. Session/envois courrier. Valider dépenses (pending_manager). Activer/valider postes guichet et sessions courrier (via comptabilité). Ouvrir/fermer poste guichet, vendre billets. Sessions caisse. Voir reçus / imprimer. Liste et scan embarquement. Flotte : tableau de bord, exploitation, affectations, véhicules, équipage, mouvements. | ManagerShellPage, CourierLayout, BoardingLayout, FleetLayout, AgenceComptabilitePage, AgenceGuichetPage, CashSessionsPage, ReceiptGuichetPage |

---

### superviseur

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **superviseur** | **Shell agence** : `/agence/dashboard`, operations, trajets, finances, treasury, team, reports. **Validation dépenses** : `/agence/expenses-approval`. **Pas** d’accès guichet, comptabilité agence, courrier, cash-sessions, receipt, boarding, fleet (non inclus dans ces routePermissions). | Poste de pilotage, opérations, trajets, finances, trésorerie, équipe, rapports. Valider les dépenses (pending_manager). | ManagerShellPage, AgencyManagerExpensesPage |

---

### agency_accountant (comptable agence)

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **agency_accountant** | `/agence/comptabilite`, `/agence/comptabilite/treasury/new-operation`, transfer, new-payable. `/agence/cash-sessions`. **Pas** d’accès au shell `/agence` (dashboard, operations, etc.) sauf si rôle multiple ; landing = `/agence/comptabilite`. | Activer/valider postes guichet, activer/valider sessions courrier. Trésorerie agence (nouvelle opération, transfert, nouveau payable). Sessions caisse. | AgenceComptabilitePage, AgencyTreasuryNewOperationPage, AgencyTreasuryTransferPage, AgencyTreasuryNewPayablePage, CashSessionsPage |

---

### guichetier

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **guichetier** | `/agence/guichet`. `/agence/receipt/:id`, `/agence/reservations/print`. `/agence/cash-sessions`. **Pas** d’accès au shell manager (`agenceShell` ne contient pas guichetier). | Ouvrir poste (PENDING), vendre billets (poste actif), clôturer poste. Voir reçus, imprimer. Gérer sessions caisse. | AgenceGuichetPage, ReceiptGuichetPage, ReservationPrintPage, CashSessionsPage |

---

### chefEmbarquement

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **chefEmbarquement** | `/agence/boarding`, `/agence/boarding/scan`. **Pas** d’accès au shell `/agence` (dashboard, etc.). | Liste des départs du jour, liste d’embarquement, scan QR / code, marquer embarqué/absent, clôturer embarquement. | BoardingLayout, BoardingDashboardPage, BoardingScanPage → AgenceEmbarquementPage |

---

### agency_fleet_controller

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **agency_fleet_controller** | `/agence/fleet`, `/agence/fleet/operations`, assignment, vehicles, crew, movements. **Pas** d’accès au shell manager. | Tableau de bord flotte, exploitation (affecter véhicules, confirmer départ/arrivée), affectation, véhicules, équipage, historique mouvements. | FleetLayout, FleetDashboardPage, AgenceFleetOperationsPage, FleetAssignmentPage, FleetVehiclesPage, FleetCrewPage, FleetMovementLogPage |

---

### agentCourrier

| Rôle | Pages accessibles | Actions possibles | Modules utilisés |
|------|-------------------|-------------------|------------------|
| **agentCourrier** | **Shell agence** : `/agence` (dashboard, operations, trajets, finances, treasury, team, reports). **Courrier** : `/agence/courrier/*` (session, nouveau, lots, reception, remise, rapport). **Pas** expenses-approval (validationsAgence). **Pas** guichet, comptabilité, boarding, fleet. Cash-sessions oui (cashControl). | Poste de pilotage (lecture), opérations, trajets, finances, trésorerie, équipe, rapports. Créer session courrier (PENDING), créer envois (session ACTIVE), clôturer session. Lots, réception, remise, rapports courrier. Sessions caisse. | ManagerShellPage (menu restreint : courrier + cash si utilisé), CourierLayout, CashSessionsPage |

---

## 7. Guards et conditions dans les pages

- **PrivateRoute** : vérifie `user` puis `user.role` (ou `user.role[]`) dans `allowedRoles` ; sinon redirection (defaultLandingByRole ou `/login`). Gère `responsable_logistique` → garage.
- **ProtectedRoute** : même chose + option `AuthCurrencyProvider`.
- **TenantGuard** : `user.companyId` = tenant (URL ou sous-domaine) ; `admin_platforme` autorisé malgré tout.
- **Layouts internes** :  
  - **FleetLayout** : si le rôle n’est pas dans ALLOWED_FLEET_ROLES → redirect (boarding, dashboard ou login).  
  - **BoardingLayout** : idem avec ALLOWED_BOARDING_ROLES.  
  - **CourierLayout** : rend `null` si pas dans ALLOWED_COURRIER_ROLES.  
  - **ManagerShellPage** : menu dynamique selon `user.role` (ex. courrier seul vs chef avec validation dépenses, équipage flotte).
- **Pages** : nombreuses lectures de `user?.role` pour afficher/masquer actions (ex. AgenceTrajetsPage : création trajets pour admin_platforme, admin_compagnie, chefAgence ; ManagerTeamPage : isChefAgence ; DepensesPage / CEOExpensesPage : approbation selon rôle ; transfer requests : initiatedByRole / managerRole).

---

## 8. Synthèse : qui utilise quoi

| Rôle | Espace principal | Accès secondaires |
|------|------------------|-------------------|
| **Client** | Portail public, réservation, billet | — |
| **admin_platforme** | Admin plateforme + impersonation compagnie/garage/compta | Tous les espaces |
| **admin_compagnie** | Compagnie (CEO) + Agence (manager) | Guichet, comptabilité agence, courrier, embarquement, flotte |
| **company_accountant** / **financial_director** | Comptabilité compagnie (accounting) | Trip costs, notifications, financial-settings |
| **responsable_logistique** / **chef_garage** | Garage (flotte, logistique) | — |
| **chefAgence** | Shell agence (dashboard, opérations, finances, trésorerie, équipe, rapports) | Courrier, validation dépenses, guichet, comptabilité agence, cash, receipt, embarquement, flotte |
| **superviseur** | Shell agence (dashboard, opérations, finances, trésorerie, équipe, rapports) | Validation dépenses uniquement (pas guichet, comptabilité, courrier, embarquement, flotte) |
| **agency_accountant** | Comptabilité agence + cash-sessions | — |
| **guichetier** | Guichet + receipt/print + cash-sessions | — |
| **chefEmbarquement** | Embarquement (liste + scan) | — |
| **agency_fleet_controller** | Flotte agence (dashboard, exploitation, affectations, véhicules, équipage, mouvements) | — |
| **agentCourrier** | Shell agence (lecture) + Courrier (session, envois, lots, réception, remise, rapports) + cash-sessions | — |

---

*Document dérivé de `routePermissions`, `roles-permissions`, `PrivateRoute`, `ProtectedRoute`, `TenantGuard`, `AppRoutes`, et des conditions `user.role` dans les layouts et pages.*
