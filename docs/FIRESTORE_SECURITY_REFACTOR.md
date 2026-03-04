# Firestore security refactor summary

## Goal

Replace the dangerous **fallback rule** that allowed any authenticated user to read/write any collection with a **deny-by-default** strategy, and ensure every collection used by TELIYA is explicitly declared.

---

## Multi-tenant hardening (company isolation)

A later refactor added **tenant isolation**: an authenticated user can only access data for their own company (`user.companyId`), unless they are platform admin (`admin_platforme`).

- **Helper:** `userCompanyId()` returns `users/{uid}.companyId` (or `''` if missing).
- **Company-scoped reads (public vitrine):**  
  `get, list` on companies, agences, weeklyTrips, reservations, avis:  
  `request.auth == null || userCompanyId() == companyId || getUserRole() == 'admin_platforme'`  
  → Unauthenticated: public read. Authenticated: same company or platform admin only.
- **Company- and agency-scoped writes and authenticated reads:**  
  Every rule under `companies/{companyId}` and `companies/{companyId}/agences/{agencyId}` that used `isAuth()` now also requires `(userCompanyId() == companyId || getUserRole() == 'admin_platforme')`.
- **Public access unchanged:**  
  `publicReservations`, `villes`, `paymentMethods`, `plans`, `_meta`; unauthenticated reservation create/update (token, preuve) and company/agency/weeklyTrips/reservations read when not logged in.

## Change applied

**Before (dangerous):**
```js
match /{path=**} {
  allow get, list, create, update, delete: if isAuth();
}
```

**After (secure):**
```js
match /{path=**} {
  allow get, list, create, update, delete: if false;
}
```

Any path not matched by a more specific rule above is now **denied**. New collections are no longer automatically open to all authenticated users.

## Explicit rules added (previously covered only by fallback)

| Collection / path | Rule added |
|-------------------|------------|
| **Platform** | |
| `invitations` | get: true (accept link); list, create, update, delete: isAuth() |
| `medias` | get, list, create, update, delete: isAuth() |
| `plans` | get, list: true (catalog); create, update, delete: isAuth() |
| `_meta/{docId}` | get, list: true; create, update, delete: isAuth() |
| **Company-level** | |
| `companies/{companyId}/personnel` | read, write: isAuth() |
| `companies/{companyId}/planRequests` | read, write: isAuth() |
| `companies/{companyId}/billingRequests` | read, write: isAuth() |
| `companies/{companyId}/payments` | read, write: isAuth() |
| **Agency-level** | |
| `companies/{companyId}/agences/{agencyId}/cashMovements` | get, list, create, update: isAuth(); delete: false |
| `companies/{companyId}/agences/{agencyId}/personnel` | get, list, create, update: isAuth(); delete: false |
| `companies/{companyId}/agences/{agencyId}/counters` | get, list, create, update: isAuth(); delete: false |

## Rule tightened

| Path | Before | After |
|------|--------|--------|
| `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` | get, create, update: **true** | get, create, update: **isAuth()**; delete: false |

Counters are no longer writable without authentication.

## Unchanged (already explicit and correct)

- **Public:** villes, paymentMethods, publicReservations (get, list, create), companies (get, list), companies/avis (read public), agences (get, list), weeklyTrips (get, list), reservations (get, list, create + restricted updates).
- **Role-based:** All existing helpers (isAuth, getUserRole, isComptable, isGuichetier, isBoardingOfficer, isAgencyManager, canWriteTripCosts, canModifyFleet, canReadFleet, validReservationStatutTransition, boardingOfficerAllowedKeysOnly) are unchanged and still used where they were.
- **Users, logistics, revenue, collection groups:** Unchanged.

## Collections that remain accessible (checklist)

- **Platform:** users ✓, companies ✓, villes ✓, paymentMethods ✓, publicReservations ✓, invitations ✓, medias ✓, plans ✓, _meta ✓
- **Company:** companies/{id}, agences, fleetVehicles, fleetMovements, fleetMaintenance, tripCosts, financialAccounts, financialMovements, expenses, payables, financialSettings, vehicleFinancialHistory, paymentProposals, revenue, logistics, avis, personnel, planRequests, billingRequests, payments ✓
- **Agency:** reservations, weeklyTrips, users, shifts, shiftReports, boardingLocks, boardingLogs, boardingClosures, dailyStats, boardingStats, agencyLiveState, courierSessions, affectations, batches, cashMovements, personnel, counters ✓

## Result

- **Deny-by-default:** Any document or collection not explicitly allowed above is denied.
- **No behavior change** for existing features: every path the app uses is covered by an explicit rule.
- **Counters** and previously “implicit” paths (invitations, medias, plans, _meta, personnel, planRequests, billingRequests, payments, cashMovements, agency counters) are now explicitly scoped and, where appropriate, restricted to isAuth() or role-based logic.
