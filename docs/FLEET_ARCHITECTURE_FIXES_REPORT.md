# Fleet Architecture Fixes — Implementation Report

**Date:** Implementation of four architectural consistency fixes after agency workflow verification.  
**Constraint:** No breaking changes; legacy compatibility preserved.

---

## 1. Files modified

| File | Changes |
|------|--------|
| **src/modules/compagnie/fleet/vehiclesService.ts** | Added `listVehiclesAvailableInCity()`; extended `assignVehicle()` with optional `weeklyTripId` and weeklyTrip `vehicleId` update; canonical state already present in `confirmDepartureAffectation` / `confirmArrivalAffectation`. |
| **src/modules/agence/manager/ManagerOperationsPage.tsx** | Switched to `listVehiclesAvailableInCity()`; removed in-memory status filter; pass `weeklyTripId` into `assignVehicle()`; removed duplicate weeklyTrip `updateDoc`; dropped unused `updateDoc` import; already uses `getAgencyCityFromDoc`. |
| **src/modules/agence/pages/AgenceTrajetsPage.tsx** | Agency city now read with `getAgencyCityFromDoc(d)` (unified fallback). |
| **src/modules/agence/fleet/FleetAssignmentPage.tsx** | Import `getAgencyCityFromDoc`; added `agencyCity` state and effect to load normalized city for selected agency. |
| **firestore.indexes.json** | New composite index for `vehicles`: currentCity, operationalStatus, technicalStatus, updatedAt DESC. |
| **src/modules/agence/utils/agencyCity.ts** | No code change; already implements `city ?? villeNorm ?? ville`. |
| **src/types/weeklyTrip.ts** | No change; optional `vehicleId` already on type. |

---

## 2. Firestore queries updated

### New indexed query

- **Function:** `listVehiclesAvailableInCity(companyId, currentCity, options?)`
- **Location:** `vehiclesService.ts`
- **Firestore conditions:**
  - `where("currentCity", "==", currentCity)`
  - `where("operationalStatus", "==", "GARAGE")`
  - `where("technicalStatus", "==", "NORMAL")`
  - `orderBy("updatedAt", "desc")`
  - `limit(limitCount + 1)` with optional `startAfterDoc` for pagination
- **Index:** `vehicles` collection: `currentCity` ASC, `operationalStatus` ASC, `technicalStatus` ASC, `updatedAt` DESC (added in `firestore.indexes.json`).

### Usage in agency workflow

- **ManagerOperationsPage** now uses:
  - `listVehiclesAvailableInCity(companyId, agencyCity)` for fleet stats and for the assign-vehicle list (no more full-fleet load + in-memory filter).
- Only vehicles in the agency city that are GARAGE and NORMAL are read from Firestore; “already assigned” is still filtered in memory via `activeIds` (affectations).

---

## 3. Canonical vehicle state updates (already present)

Confirmed in place; no code change:

- **Trip start — `confirmDepartureAffectation`:**
  - Legacy: `operationalStatus = EN_TRANSIT`, `status = EN_TRANSIT`, `destinationCity = aff.arrivalCity`.
  - Canonical: `canonicalStatus = "ON_TRIP"`, `currentTripId = affectationId`.
- **Trip end — `confirmArrivalAffectation`:**
  - Legacy: `operationalStatus = GARAGE`, `currentCity = agencyCity`, `destinationCity = null`.
  - Canonical: `canonicalStatus = "AVAILABLE"`, `currentTripId = null`, `lastTripId = affectationId`.

Legacy `operationalStatus` / `status` logic is unchanged.

---

## 4. weeklyTrip vehicleId integration

- **Type:** `WeeklyTrip` in `src/types/weeklyTrip.ts` already has optional `vehicleId?: string | null`.
- **When it’s set:** When the agency assigns a vehicle in ManagerOperationsPage, `assignVehicle(..., { weeklyTripId: assignModalRow.tripId })` is called. If `weeklyTripId` is provided, after creating the affectation, the service updates:
  - Path: `companies/{companyId}/agences/{agencyId}/weeklyTrips/{weeklyTripId}`
  - Fields: `vehicleId`, `updatedAt`
- **Backward compatibility:** `vehicleId` remains optional; affectations remain the source of truth for per-slot assignment. Existing trips without `vehicleId` are unchanged.

---

## 5. Agency city normalization

- **Rule:** `agencyCity = agency.city ?? agency.villeNorm ?? agency.ville`
- **Helper:** `getAgencyCityFromDoc(data)` in `src/modules/agence/utils/agencyCity.ts` (unchanged).
- **Where it’s used:**
  - **ManagerOperationsPage:** Already used when reading the agency doc (no change).
  - **AgenceTrajetsPage:** Agency city is now set with `getAgencyCityFromDoc(d)` instead of `d.city ?? d.ville`.
  - **FleetAssignmentPage:** Added loading of the selected agency doc and `setAgencyCity(getAgencyCityFromDoc(...))` so the page has a normalized agency city for current and future logic.

---

## 6. Summary

| Fix | Status |
|-----|--------|
| 1. Indexed vehicle query (no full-fleet + memory filter) | Done: `listVehiclesAvailableInCity` + index; ManagerOperationsPage uses it. |
| 2. Optional vehicleId on weeklyTrips | Done: `assignVehicle(..., { weeklyTripId })` updates weeklyTrip; affectations kept. |
| 3. Canonical vehicle state on trip start/end | Already implemented; verified. |
| 4. Unified agency city field | Done: same fallback in ManagerOperationsPage, AgenceTrajetsPage, FleetAssignmentPage. |

**Deploy:** Run `firebase deploy --only firestore:indexes` so the new `vehicles` index is created before using `listVehiclesAvailableInCity` in production.
