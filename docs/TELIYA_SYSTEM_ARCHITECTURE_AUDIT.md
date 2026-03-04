# TELIYA SYSTEM ARCHITECTURE AUDIT

**Document type:** Full architecture audit (codebase-derived, no code modifications)  
**Platform:** Multi-tenant transport management system  
**Scope:** Frontend, routing, state, Firestore, roles, modules, public site, reservation lifecycle, security, scalability  

---

## 1. Platform architecture

### Global structure

- **Frontend framework:** React 18 with TypeScript; Vite as build tool.
- **Routing:** React Router v6 declarative routing in `AppRoutes.tsx`; `Routes`/`Route`, `Navigate`, `lazy()` for code-splitting. No `createBrowserRouter`; single `BrowserRouter` at app root.
- **State management:** No global store (Redux/Zustand). Auth and company context in React Context (`AuthContext`, `PageHeaderContext`). Per-page/local state with `useState`/`useRef`. Currency by company via `AuthCurrencyProvider`/`CurrencyProvider`. Subscription/plan guards via `useSubscriptionGuard` and `useCapabilities` (core/permissions).
- **Firestore:** Single Firebase app (Firestore, Auth, Storage, Functions europe-west1). Optional App Check and emulators (env-driven). All data access via Firebase SDK in components and services.
- **Backend integrations:** Firebase (Auth, Firestore, Storage, Cloud Functions). No separate REST backend; Firestore is the system of record.
- **i18n:** i18next with `react-i18next`; `locales/fr.json`, `locales/en.json`; `useTranslation` in UI.

### Project structure (main)

```
reservation-v1/
├── public/                 # Static assets, sw.js, manifest
├── src/
│   ├── main.tsx            # Bootstrap (initFirebase → index.tsx)
│   ├── index.tsx           # ReactDOM, BrowserRouter, I18nextProvider, App
│   ├── App.tsx             # AuthProvider, AppRoutes, UpdateBanner, GlobalConnectionBanner
│   ├── AppRoutes.tsx       # Central router, lazy pages, PrivateRoute/ProtectedRoute
│   ├── firebaseConfig.ts   # Firebase init, Firestore, Auth, Storage, Functions
│   ├── contexts/           # AuthContext, PageHeaderContext
│   ├── constants/          # routePermissions.ts
│   ├── roles-permissions.ts
│   ├── types/              # auth, company, reservation, etc.
│   ├── utils/              # phoneUtils, seats, createCompanyAdmin, etc.
│   ├── ui/                 # Foundation, layout, cards, controls, feedback
│   ├── shared/             # Currency, workflows (ValidationComptable/ChefAgence), auth (RequireRole), subscription
│   ├── core/               # permissions (capabilityEngine, roleCapabilities, useCapabilities), aggregates, intelligence
│   ├── modules/
│   │   ├── auth/           # Login, Register, PrivateRoute, ProtectedRoute, AcceptInvitation
│   │   ├── plateforme/     # Admin platform (dashboard, companies CRUD, plans, subscriptions, media, etc.)
│   │   ├── compagnie/      # Company back-office + public site
│   │   ├── agence/         # Agency operations (guichet, comptabilité, manager, courrier, boarding, fleet, garage)
│   │   └── logistics/      # Courier domain (shipments, batches, sessions, ledger)
│   ├── styles/, locales/, i18n.ts
├── firestore.rules
├── storage.rules
└── functions/              # Cloud Functions (e.g. syncDailyTrips)
```

### Modules organization (high level)

| Layer            | Path              | Role |
|-----------------|-------------------|------|
| Admin platform  | `modules/plateforme` | Platform admin: companies, plans, subscriptions, revenue, media, params |
| Companies       | `modules/compagnie`  | Company admin, CEO, garage, accounting, paramètres, **public** (RouteResolver + pages) |
| Agencies        | `modules/agence`    | Manager shell, guichet, comptabilité, courrier, boarding, fleet, personnel, shifts |
| Auth            | `modules/auth`       | Login, register, invitation accept, route guards |
| Logistics       | `modules/logistics`  | Courier domain (shipments, batches, events, sessions) |

---

## 2. Multi-tenant design

### Isolation model

- **Tenant = Company.** All company-scoped data lives under `companies/{companyId}`. Agencies are sub-collections: `companies/{companyId}/agences/{agencyId}`.
- **User document** (`users/{uid}`) stores `companyId` and optionally `agencyId`. AuthContext exposes `user.companyId`, `user.agencyId`; routes and services use these to scope reads/writes.
- **Public resolution:** Companies are resolved by **slug** (unique). RouteResolver queries `companies` where `slug == slug` (or uses slug as doc id). No cross-company data mixing in public URLs.

### Key collections and scope

| Data              | Location | Separation |
|-------------------|----------|------------|
| Companies         | `companies` (root) | By doc id; slug for public |
| Agencies          | `companies/{companyId}/agences` | By company |
| Agency users      | `companies/{companyId}/agences/{agencyId}/users` | By agency |
| Reservations      | `companies/{companyId}/agences/{agencyId}/reservations` | By agency |
| Weekly trips      | `companies/{companyId}/agences/{agencyId}/weeklyTrips` | By agency |
| Shifts / reports  | `companies/{companyId}/agences/{agencyId}/shifts`, `shiftReports` | By agency |
| Boarding          | `boardingClosures`, `boardingLogs`, `boardingLocks`, `dailyStats`, `boardingStats`, `agencyLiveState` under each agency | By agency |
| Fleet (company)   | `companies/{companyId}/fleetVehicles`, `fleetMovements`, `fleetMaintenance` | By company |
| Treasury          | `companies/{companyId}/financialAccounts`, `financialMovements`, `expenses`, `payables`, `financialSettings` | By company |
| Trip costs        | `companies/{companyId}/tripCosts` | By company (with agencyId on docs) |
| Public reservations | `publicReservations` (root) | By reservation id; links to company/agency via stored ids |
| Avis              | `companies/{companyId}/avis` | By company |
| Logistics         | `companies/{companyId}/logistics/...` | By company |
| Revenue           | `companies/{companyId}/revenue/...` | By company |

### Themes and settings

- Company document holds branding: `couleurPrimaire`, `couleurSecondaire`, `themeStyle`, `imagesSlider`, `footerConfig`, `devise`, etc. RouteResolver and public pages use `company` for theme and currency.
- Plan/feature flags (e.g. `publicPageEnabled`, `onlineBookingEnabled`) are checked in RouteResolver to enable/disable public site and online booking.

---

## 3. Roles and permissions

### Canonical roles (`roles-permissions.ts`)

| Role                  | Layer     | Description |
|-----------------------|-----------|-------------|
| `admin_platforme`     | Platform  | Platform admin; full access to admin layout |
| `admin_compagnie`     | Company   | CEO / company owner; compagnie layout, garage, validations |
| `financial_director`  | Company   | DAF; supervision finances, validations comptables |
| `company_accountant`  | Company   | Comptable compagnie; daily accounting, validations |
| `chef_garage`         | Company   | Fleet/garage; garage layout only |
| `chefAgence`          | Agency    | Agency manager; full agency shell, validations agence |
| `superviseur`         | Agency    | Agency supervisor; same shell as chefAgence |
| `agentCourrier`       | Agency    | Courier; dashboard, reservations, courrier module |
| `agency_accountant`   | Agency    | Comptable agence; comptabilité agence |
| `guichetier`          | Agency    | POS; guichet, reservations |
| `chefEmbarquement`    | Agency    | Boarding; boarding + embarquement, reservations |
| `agency_fleet_controller` | Agency | Fleet; fleet module only |
| `unauthenticated`     | Sentinel  | Unknown role → redirect to login |
| `user`                | Default   | Fallback; no module access |

AuthContext normalizes legacy role strings (e.g. `company_ceo` → `admin_compagnie`, `agency_boarding_officer` / `embarquement` → `chefEmbarquement`).

### Route permissions (`constants/routePermissions.ts`)

- **compagnieLayout:** admin_compagnie, admin_platforme  
- **garageLayout:** chef_garage, admin_compagnie, admin_platforme  
- **companyAccountantLayout:** company_accountant, financial_director, admin_platforme  
- **agenceShell:** chefAgence, superviseur, agentCourrier, admin_compagnie  
- **boarding:** chefEmbarquement, chefAgence, admin_compagnie  
- **fleet:** agency_fleet_controller, chefAgence, admin_compagnie  
- **guichet:** guichetier, chefAgence, admin_compagnie  
- **comptabilite:** agency_accountant, admin_compagnie  
- **validationsCompta:** company_accountant, financial_director, admin_platforme  
- **validationsAgence:** chefAgence, superviseur, admin_compagnie  
- **receiptGuichet:** chefAgence, guichetier, admin_compagnie  
- **adminLayout:** admin_platforme  
- **chefComptableCompagnie:** company_accountant, financial_director, admin_platforme  
- **tripCosts:** chefAgence, company_accountant, financial_director, admin_compagnie, admin_platforme  
- **courrier:** agentCourrier, chefAgence, admin_compagnie  

### Access by role (summary)

- **admin_platforme:** Admin layout, all platform pages (companies, plans, subscriptions, revenue, media, params).
- **admin_compagnie:** Compagnie layout (dashboard, agences, paramètres, reservations, images, payment settings, avis), CEO command center, payment approvals, garage, accounting layout, trip costs, and all agency routes (manager, guichet, comptabilité, boarding, fleet, courrier).
- **financial_director / company_accountant:** Company accounting layout (VueGlobale, ReservationsEnLigne, Finances, Rapports, Parametres), CEOTreasuryPage, validations comptables, trip costs (company_accountant + chefAgence for own agency).
- **chef_garage:** Garage layout only (fleet vehicles, maintenance, transit, incidents).
- **chefAgence / superviseur:** Agency manager shell (cockpit, operations, finances, team, reports, trajets, treasury), guichet, comptabilité, boarding, fleet, courrier, validations agence, receipt/print.
- **agentCourrier:** Agency shell + courrier (sessions, create shipment, reception, remise, lots, reports).
- **agency_accountant:** Agency comptabilité only.
- **guichetier:** Guichet page, reservations list, receipt/print.
- **chefEmbarquement:** Boarding layout (dashboard, scan), full embarquement page (list, close boarding).
- **agency_fleet_controller:** Fleet layout only (dashboard, operations, assignment, vehicles, movement log).

---

## 4. Operational modules

| Module | Location | Role |
|--------|----------|------|
| **Booking (online)** | compagnie/public | ReservationClientPage: trip selection, passenger, seats; creates reservation in agency subcollection; publicReservations + localStorage pending; redirect to payment. |
| **Ticketing (online)** | compagnie/public | ReservationDetailsPage, ReceiptEnLignePage, TicketOnline; resolve via publicReservations or slug+token. |
| **Payment (online)** | compagnie/public | PaymentMethodPage: method selection, USSD/tel; instructions modal; redirect to upload preuve. |
| **Proof upload** | compagnie/public | UploadPreuvePage: preuve_recue submission; recovery via pendingReservation / URL. |
| **Find reservation** | compagnie/public | FindReservationPage: search by phone (telephoneNormalized), show list, continue payment or view ticket. |
| **Guichet (POS)** | agence/guichet | AgenceGuichetPage: session, create reservation (guichetReservationService), ReceiptGuichetPage, ReservationPrintPage, shifts. |
| **Agency accounting** | agence/comptabilite | AgenceComptabilitePage: cash movements, shift reports. |
| **Agency manager** | agence/manager | ManagerShellPage: ManagerCockpitPage, ManagerOperationsPage, ManagerFinancesPage, ManagerTeamPage, ManagerReportsPage, AgenceTrajetsPage, AgencyTreasuryPage. |
| **Courier** | agence/courrier + logistics | CourierLayout: sessions, create shipment, reception, remise, batches, reports; logistics domain (shipments, batches, events, ledger). |
| **Boarding** | agence/boarding + embarquement | BoardingLayout: BoardingDashboardPage, BoardingScanPage; AgenceEmbarquementPage: list by trip/date, scan/manual, close boarding, offline queue, aggregates (boardingStats, dailyStats, agencyLiveState). |
| **Fleet (agency)** | agence/fleet | FleetLayout: FleetDashboardPage, FleetAssignmentPage, FleetVehiclesPage, FleetMovementLogPage, AgenceFleetOperationsPage; affectations, fleet state machine. |
| **Garage (company)** | compagnie + agence/garage | GarageLayout, GarageDashboardPage (maintenance, transit, incidents), GarageDashboardHomePage; AffectationVehiculePage. |
| **Company admin** | compagnie | CompagnieLayout: dashboard, agences, paramètres, reservations, images, payment settings, avis, trip costs, plan. |
| **CEO / command center** | compagnie | CEOCommandCenterPage, CEOPaymentApprovalsPage, RevenusLiquiditesPage. |
| **Company accounting** | compagnie/accounting + finances | CompanyAccountantLayout: VueGlobale, ReservationsEnLigne, Finances, Rapports, Parametres; CEOTreasuryPage; ChefComptableCompagnie; validation workflows. |
| **Treasury** | compagnie | financialAccounts, financialMovements, expenses, payables, paymentProposals, financialSettings, vehicleFinancialHistory. |
| **Validations** | shared/workflows | ValidationComptablePage (company), ValidationChefAgencePage (agency); reservationStatutService (transitions, auditLog). |
| **Trip costs** | compagnie | TripCostsPage; tripCosts collection; canWriteTripCosts by role. |
| **Platform admin** | plateforme | AdminSidebarLayout: dashboard, companies CRUD, plans, subscriptions, revenue, reservations, finances, stats, params, media. |
| **Platform public** | plateforme | HomePage, PlatformSearchResultsPage, ListeVillesPage. |

---

## 5. Public website architecture

### Slug system

- **URL pattern:** `/:slug/*` is handled by the **RouteResolver** (lazy). The first path segment is the company **slug** (e.g. `teliya`, `trans-express`). Reserved segments (login, register, admin, agence, villes, reservation, contact, compagnie) are not treated as slugs; RouteResolver returns 404 for them.
- **Resolution:** Memory cache → sessionStorage `company-${slug}` → Firestore: `companies` where `slug == slug`, else `getDoc(companies, slug)` (slug as doc id). Then `onSnapshot(doc(db, "companies", id))` for live updates. Result (and slug) stored in memory and sessionStorage.

### RouteResolver behavior

- **Inputs:** `pathname` → `slug` = parts[0], `subPath` = parts[1], `thirdSegment` = parts[2].
- **Guards:** If `company.publicPageEnabled === false` → “Site désactivé”. If `company.onlineBookingEnabled === false` and subPath is an online-booking path → “Réservation en ligne indisponible”.
- **Recovery:** On homepage (no subPath), if `pendingReservation` in localStorage and reservation status `en_attente_paiement`, show “Continuer ma réservation” and link to `/:slug/upload-preuve/:id`.
- **Routing by subPath:**

| subPath | Page |
|---------|------|
| `null` (home) | PublicCompanyPage + optional recovery banner |
| resultats | ResultatsAgencePage |
| booking | ReservationClientPage |
| payment | PaymentMethodPage |
| mes-reservations | ClientMesReservationsPage |
| retrouver-reservation | FindReservationPage |
| mes-billets | ClientMesBilletsPage |
| mentions, confidentialite | MentionsPage, ConfidentialitePage |
| receipt, confirmation | ReceiptEnLignePage |
| upload-preuve | UploadPreuvePage (reservationIdFromPath = thirdSegment) |
| details, reservation | ReservationDetailsPage |
| aide | AidePage |
| a-propos | CompanyAboutPage |

- **Wrapping:** CurrencyProvider(company.devise), ErrorBoundary, PublicBottomNav(slug). Some legal pages are also mounted on explicit routes in AppRoutes (e.g. `/:slug/mentions-legales`).

### Company themes

- Company doc: `couleurPrimaire`, `couleurSecondaire`, `themeStyle`, `imagesSlider`, `footerConfig`. Public pages and PublicBottomNav use these. Currency from `company.devise`.

### URL → company mapping

- **Public:** Any `/:slug/...` with non-reserved slug → RouteResolver → Firestore company by slug → one of the public pages above. No auth required for public pages; plan flags restrict features.

---

## 6. Reservation lifecycle

### End-to-end flow (from code)

1. **Search / discovery**  
   - Public: PublicCompanyPage, ResultatsAgencePage; platform: PlatformSearchResultsPage, ListeVillesPage.  
   - Trips: `weeklyTrips` under agency; public read.

2. **Create reservation (online)**  
   - **File:** `modules/compagnie/public/pages/ReservationClientPage.tsx`.  
   - Trip + passenger + seats → `addDoc(companies/{companyId}/agences/{agencyId}/reservations)` (agency chosen or first), then `updateDoc` (publicToken, publicUrl), then `setDoc(publicReservations/{id})`.  
   - Stores `pendingReservation` in localStorage.  
   - Navigate to `/:slug/payment/:id`.

3. **Payment method (online)**  
   - **File:** `modules/compagnie/public/pages/PaymentMethodPage.tsx`.  
   - Loads reservation (from Firestore or session); shows PaymentInstructionsModal (once per user); user selects method (e.g. USSD); stores draft in sessionStorage, opens `tel:` or URL.  
   - User leaves app to pay; return handled by recovery (RouteResolver + pendingReservation) or FindReservationPage.

4. **Upload proof (online)**  
   - **File:** `modules/compagnie/public/pages/UploadPreuvePage.tsx`.  
   - Load reservation (location.state / sessionStorage / reservationIdFromPath + Firestore).  
   - Update reservation: statut → `preuve_recue`, paymentReference, proofMessage, proofSubmittedAt.  
   - Clear pendingReservation on success.

5. **Validation (comptable / chef agence)**  
   - **Files:** `shared/workflows/pages/ValidationComptablePage.tsx`, `ValidationChefAgencePage.tsx`; `modules/agence/services/reservationStatutService.ts`.  
   - Transitions preuve_recue/verification → confirmé/refusé; auditLog; role-based (validationsCompta, validationsAgence).

6. **Ticket / details (online)**  
   - **Files:** `modules/compagnie/public/pages/ReservationDetailsPage.tsx`, `ReceiptEnLignePage.tsx`; `modules/compagnie/public/utils/resolveReservation.ts`.  
   - Resolution: publicReservations by id or slug+token, then company/agency/reservation path. TicketOnline (QR, etc.) for display.

7. **Boarding**  
   - **Files:** `modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx`; `modules/agence/boarding/` (BoardingLayout, BoardingDashboardPage, BoardingScanPage); `boarding/utils.ts` (findReservationByCode).  
   - List by agency/trip/date; scan or manual code; updateStatut “embarqué” (transaction: reservation update, boardingLocks, boardingStats, dailyStats, agencyLiveState, boardingLogs, fleet movements).  
   - Offline: IndexedDB queue; sync on “online”; local duplicate set (offlineScannedIds).

8. **Guichet (agency)**  
   - **Files:** `modules/agence/services/guichetReservationService.ts`, `modules/agence/guichet/pages/AgenceGuichetPage.tsx`.  
   - Session-based; create reservation in same agency reservations subcollection; shift/dailyStats updates. ReceiptGuichetPage, ReservationPrintPage.

---

## 7. Firestore data model

### Root / platform

- `users/{userId}` — Auth profile, companyId, agencyId, role, permissions.  
- `invitations` — By email/status for onboarding.  
- `villes/{id}` — Cities (public read).  
- `companies` — Company docs; query by slug for public.  
- `plans`, `_meta/plansCatalog` — Subscription/plan catalog.  
- `paymentMethods` — By companyId (public read).  
- `publicReservations/{reservationId}` — Public resolution (get/list/create; no update/delete in rules).  
- `medias/{id}` — Media references.

### Company-scoped

- `companies/{companyId}` — Company document (branding, plan flags, devise, etc.).  
- `companies/{companyId}/agences` — Agencies.  
- `companies/{companyId}/agences/{agencyId}/users` — Agency users.  
- `companies/{companyId}/agences/{agencyId}/weeklyTrips` — Schedules (public read).  
- `companies/{companyId}/agences/{agencyId}/reservations` — Reservations (public get/list/create; update/delete and statut transitions by rules).  
- `companies/{companyId}/agences/{agencyId}/shifts`, `shiftReports` — Shifts and reports.  
- `companies/{companyId}/agences/{agencyId}/courierSessions` — Courier sessions.  
- `companies/{companyId}/agences/{agencyId}/boardingClosures`, `boardingLogs`, `boardingLocks` — Boarding.  
- `companies/{companyId}/agences/{agencyId}/dailyStats`, `boardingStats`, `agencyLiveState/current` — Aggregates.  
- `companies/{companyId}/agences/{agencyId}/affectations` — Vehicle assignments.  
- `companies/{companyId}/agences/{agencyId}/batches` — Courier batches.  
- `companies/{companyId}/agences/{agencyId}/cashMovements` — Agency cash.  
- `companies/{companyId}/agences/{agencyId}/personnel` — Personnel (e.g. ChefAgencePersonnelPage).  
- `companies/{companyId}/avis` — Reviews (public read, auth write).  
- `companies/{companyId}/tripCosts` — Trip cost config.  
- `companies/{companyId}/fleetVehicles`, `fleetMovements`, `fleetMaintenance` — Fleet.  
- `companies/{companyId}/financialAccounts`, `financialMovements`, `financialMovementIdempotency`, `expenses`, `payables`, `financialSettings`, `vehicleFinancialHistory`, `paymentProposals` — Treasury.  
- `companies/{companyId}/counters/byTrip/trips` — Counters.  
- `companies/{companyId}/logistics/...` — Courier data (shipments, batches, events, sessions, ledger).  
- `companies/{companyId}/revenue/...` — Revenue events.  
- `companies/{companyId}/planRequests`, `billingRequests`, `payments` — Billing.  
- `companies/{companyId}/personnel` — Company-level personnel.

### Collection group rules

- `{path=**}/weeklyTrips/{tripId}` — get, list: true.  
- `{path=**}/reservations/{reservationId}` — get, list: true.  
- All other access is per-document or per-collection under companies/agencies with role checks.

---

## 8. Security model

### Firestore rules (summary)

- **Helpers:** `isAuth()`, `getUserRole()` from `users/{uid}`, `isComptable`, `isGuichetier`, `isBoardingOfficer` (agency_boarding_officer, embarquement), `isFleetController`, `isAgencyManager` (chefAgence, admin_compagnie), `getUserAgencyId()`, `validReservationStatutTransition()`, `boardingOfficerAllowedKeysOnly()`, `canWriteTripCosts()`, `canModifyFleet()`, `canReadFleet()`.
- **Public read:** villes, paymentMethods, companies (and sub agences, weeklyTrips), publicReservations (get/list/create; no update/delete). companies/avis: read true, write isAuth().
- **Reservations:** get/list/create public. Update: (1) unauthenticated limited to publicToken/publicUrl just after create, or (2) unauthenticated preuve_recue submission (limited keys), or (3) authenticated with validReservationStatutTransition and optional boardingOfficerAllowedKeysOnly. Delete and other updates follow same role logic.
- **Shifts, shiftReports, courierSessions, boardingClosures, boardingLogs, boardingLocks, dailyStats, boardingStats, agencyLiveState, affectations, batches:** read/write require isAuth() and often role (e.g. isComptable, isGuichetier, isBoardingOfficer, isAgencyManager). Batch status DEPARTED/CLOSED only isAgencyManager.
- **financialAccounts, financialMovements, expenses, tripCosts, payables, financialSettings, vehicleFinancialHistory, paymentProposals, fleetMaintenance, fleetVehicles, fleetMovements:** role-scoped (admin_compagnie, company_accountant, chefAgence, etc.); fleet update conditions for in_transit and boarding officer.
- **users:** get own doc; list auth; create/update restrict chefAgence creation (admin_compagnie or admin_platforme only). Same for companies/agences/users.
- **logistics, revenue:** read, write: isAuth().
- **Fallback:** `match /{path=**} allow read, write: if isAuth();` — any unmatched path requires auth (broad).

### Role checks in app

- **Routes:** PrivateRoute checks `user.role` in `allowedRoles` from routePermissions; redirect unauthenticated to `/login`, unauthorized to role landing (e.g. `/role-landing` or role-specific URL). ProtectedRoute wraps PrivateRoute and optionally AuthCurrencyProvider.
- **Features:** AuthContext `hasPermission(permission)`; admin_platforme treated as all permissions; else `user.permissions` (from doc + permissionsByRole).
- **Capabilities:** core/permissions (capabilityEngine, roleCapabilities, useCapabilities) combine role and company plan for feature flags.

### Potential weaknesses

- **Fallback rule:** `match /{path=**} allow read, write: if isAuth()` grants full read/write to any authenticated user for any path not matched by earlier rules; new collections are open unless explicitly restricted.
- **Company/agency in rules:** Many rules rely on `getUserRole()` and `getUserAgencyId()` but do not re-validate that the document’s companyId/agencyId matches the user’s; trust is on correct client use of companyId/agencyId. A misconfigured or malicious client could target another company’s doc if a bug exposed wrong ids.
- **publicReservations:** create allowed for everyone; no server-side check of reservation content (e.g. companyId/agencyId consistency). Reservations collection has stricter update rules; publicReservations is mainly a lookup table.
- **Counters:** `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` allow get, create, update: if true — no auth; potential abuse if used for critical state.

---

## 9. Scalability analysis

### Many companies

- **Pros:** Data isolated per company; Firestore queries by companyId or under companies/{companyId}; slug resolution is one doc or one query per company.  
- **Cons:** No server-side pagination of companies in a single global list; platform admin may load many companies. Indexes required for any cross-company query (e.g. by slug).

### Many agencies

- **Pros:** Agencies are subcollections; listing agencies is one collection read per company.  
- **Cons:** “Find reservation by phone” (FindReservationPage, ClientMesReservationsPage, ClientMesBilletsPage) iterates agencies and runs two queries per agency (telephoneNormalized, telephone); large agency count increases read cost and latency.

### Many reservations

- **Pros:** Reservations scoped by agency; list by date/trip/heure is indexed.  
- **Cons:** Real-time `onSnapshot` on full reservation list per trip/date can be heavy for large lists; AgenceEmbarquementPage pauses listener during scan. No server-side pagination on some list views.

### Many users

- **Pros:** Auth is Firebase Auth; user doc is one read per session. Role and permissions in one place.  
- **Cons:** `users` list allow is isAuth() only — listing all users is allowed to any authenticated user; no tenant scoping in that rule. Company/agency scoping is in app logic and agency subcollections.

### Bottlenecks (summary)

- Cross-agency search by phone (N agencies × 2 queries).  
- Unbounded real-time lists (reservations, etc.) without pagination.  
- Platform admin: loading all companies without pagination.  
- Fallback Firestore rule and counters rule as above.

---

## 10. Architecture diagram (conceptual)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TELIYA PLATFORM                                    │
│  (Single SPA: React + Vite + Firebase Auth/Firestore/Storage/Functions)     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          ▼                             ▼                             ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Admin Platform   │         │ Public (no auth) │         │ Auth required     │
│ (admin_platforme)│         │                  │         │ (company/agency   │
│ • Companies CRUD │         │ • HomePage       │         │  users)           │
│ • Plans / subs   │         │ • Search results │         │                   │
│ • Revenue / media│         │ • ListeVilles     │         │ • /compagnie/:id  │
│ • Platform params│         │ • /:slug/*       │         │ • /agence/*       │
└──────────────────┘         │   → RouteResolver │         │ • /login, invite │
                              │   → Company site │         └─────────┬────────┘
                              └────────┬─────────┘                   │
                                       │                             │
                    slug → companies/{id}                             │
                    publicPageEnabled                                 │
                    onlineBookingEnabled                              │
                                       │                             │
          ┌────────────────────────────┴─────────────────────────────┴────────┐
          ▼                                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         COMPANIES (multi-tenant root)                             │
│  companies/{companyId}  • Branding, plan, devise, slug                           │
│  • agences, tripCosts, fleetVehicles, financialAccounts, treasury, logistics   │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         AGENCIES (per company)                                    │
│  companies/{companyId}/agences/{agencyId}                                         │
│  • users, weeklyTrips, reservations, shifts, boarding*, fleet affectations,    │
│    batches (courier), cashMovements, personnel                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    OPERATIONAL MODULES (by role)                                  │
│  Company:  CEO command center, garage, accounting (VueGlobale, Finances, etc.),  │
│            paramètres, trip costs, payment settings, avis                        │
│  Agency:   Manager shell (cockpit, operations, finances, team, reports),         │
│            guichet (POS), comptabilité, boarding/embarquement, fleet, courrier   │
│  Shared:   Validation comptable / chef agence, receipt/print                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Relationships:**

- **Platform** owns global config (villes, paymentMethods), platform admin, and public discovery. It does not own company data; it only manages company records and plans.
- **Companies** are the tenant boundary. All operational data (agencies, fleet, treasury, logistics, revenue) lives under one company doc or its subcollections. Public pages resolve company by slug and then read only what rules allow (companies, agences, weeklyTrips, publicReservations, avis).
- **Agencies** belong to one company. Reservations, shifts, boarding, and agency-level courier/fleet are per agency. A user has at most one companyId and one agencyId; role determines which company/agency routes they can open.
- **Operational modules** are entry points (layouts + pages) protected by route permissions; they read/write Firestore under the same company/agency hierarchy. No cross-tenant access is intended; security relies on rules + correct companyId/agencyId in requests.

---

## 11. Improvement recommendations

1. **Firestore rules:**  
   - Replace or narrow the fallback `match /{path=**} allow read, write: if isAuth()` with explicit deny or stricter default.  
   - Add companyId/agencyId checks where the doc has such fields (e.g. ensure resource.data.companyId == user’s companyId for company-scoped collections).  
   - Restrict `companies/{companyId}/counters/...` to auth and optionally role/company.

2. **Public reservations:**  
   - Validate creation (e.g. companyId/agencyId consistency, or create only via Cloud Function) and consider rate limiting or quotas per IP/identifier.

3. **Scalability:**  
   - Add pagination (or limit) for reservation lists and platform company list.  
   - Consider a single search index or Cloud Function for “reservations by phone” to avoid N×2 agency queries.  
   - Use pagination/cursor for large onSnapshot result sets.

4. **Security:**  
   - Restrict `users` list to platform admin or to same company/agency (e.g. with a Firestore rule that checks companyId/agencyId).  
   - Document and audit any client-side assumptions about companyId/agencyId so that new code does not bypass tenant isolation.

5. **Architecture:**  
   - Consider extracting reservation lifecycle (create → payment → proof → validation → boarding) into a small set of shared services or hooks to reduce duplication and keep rules consistent.  
   - Add integration tests or rule tests for critical paths (e.g. reservation updates by role, boarding, treasury).

---

*End of TELIYA System Architecture Audit. All content derived from the codebase; no code was modified.*
