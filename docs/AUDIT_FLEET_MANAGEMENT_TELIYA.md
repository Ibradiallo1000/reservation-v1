# Audit: Fleet Management System — TELIYA

**Date:** 2025-03  
**Scope:** Vehicle model, trip–vehicle linking, status/location updates, agency queries, support for 300+ buses.

---

## Executive summary

TELIYA has **two parallel fleet representations**:

1. **Company-level `vehicles`** (collection `companies/{companyId}/vehicles`): city-based, used by the Garage / Responsable logistique (VehicleDoc, vehiclesService, affectations).
2. **Company-level `fleetVehicles`** (collection `companies/{companyId}/fleetVehicles`): agency-based, used by Agence flotte (FleetVehicleDoc, fleetStateMachine, assignment/boarding).

Neither is fully aligned with the requested canonical fields. Agency-side flows (assign, depart, arrive) update **fleetVehicles** and fleetMovements; company-side flows use **vehicles** + affectations. **weeklyTrips** do not store `vehicleId`; linkage is via affectations or `fleetVehicles.currentTripId`. Scaling to **300+ buses** is limited by full collection scans, no server-side filtering by city/agency, and duplicated data across two models.

---

## 1. What is already implemented

### 1.1 Vehicle model (company `vehicles` — VehicleDoc)

| Field / capability | Status | Notes |
|--------------------|--------|--------|
| **currentCity** | ✅ | Present and updated on arrival (`confirmArrival`, `confirmArrivalAffectation`). |
| **currentAgencyId** | ❌ | Not on VehicleDoc. Exists only on **FleetVehicleDoc** (fleetVehicles). |
| **status** (legacy) | ✅ | Values: `GARAGE`, `EN_SERVICE`, `EN_TRANSIT`, `EN_MAINTENANCE`, `ACCIDENTE`, `HORS_SERVICE`. Naming differs from requested (e.g. no `AVAILABLE` / `ON_TRIP`). |
| **technicalStatus** | ✅ | `NORMAL`, `MAINTENANCE`, `ACCIDENTE`, `HORS_SERVICE`. |
| **operationalStatus** | ✅ | `GARAGE`, `AFFECTE`, `EN_TRANSIT`. |
| **driverId** | ❌ | Not on vehicle. Driver info is on **AffectationDoc** (`driverName`, `driverPhone`) and **FleetVehicleDoc** (`chauffeurName`). |
| **lastTripId** | ❌ | Not on VehicleDoc. **FleetVehicleDoc** has `currentTripId`. |
| **destinationCity** | ✅ | Set on departure, cleared on arrival. |
| **statusHistory** | ✅ | Logs technical/operational/archived changes. |

### 1.2 Vehicle model (company `fleetVehicles` — FleetVehicleDoc)

| Field / capability | Status | Notes |
|--------------------|--------|--------|
| **currentAgencyId** | ✅ | Used for agency-scoped queries and transitions. |
| **destinationAgencyId** | ✅ | Set when `in_transit`, cleared on arrival. |
| **status** | ✅ | `garage`, `assigned`, `in_transit`, `arrived`, `maintenance` (different enum from requested). |
| **currentTripId** | ✅ | Links vehicle to trip. |
| **chauffeurName / convoyeurName** | ✅ | Driver/crew; no `driverId` (user ref). |
| **currentDeparture / currentArrival / currentDate / currentHeure** | ✅ | Trip context on the vehicle. |

### 1.3 Trips / schedules and vehicle linkage

| Item | Status | Notes |
|------|--------|--------|
| **weeklyTrips** | No vehicleId | Stored per agency (`agences/{agencyId}/weeklyTrips`). No `vehicleId` field; linkage via **affectations** (vehicleId + tripId) or **fleetVehicles.currentTripId**. |
| **routeSchedules** | busId | `RouteScheduleDoc.busId` optional vehicle id; company-level. |
| **tripCosts** | vehicleId | `vehicleId` optional; used for cost/revenue by vehicle. |
| **AffectationDoc** | vehicleId + tripId | Agency-level affectations link vehicleId, tripId, driverName, status (AFFECTE, DEPART_CONFIRME, ARRIVE). |

### 1.4 Trip start / finish → vehicle updates

| Flow | Collection updated | Implemented |
|------|--------------------|-------------|
| **Company vehicles + affectations** | `vehicles` + `affectations` | ✅ `confirmDeparture` / `confirmArrival` (vehiclesService) update vehicle status and currentCity; `confirmDepartureAffectation` / `confirmArrivalAffectation` update vehicle + affectation status. |
| **Fleet (agence)** | `fleetVehicles` + `fleetMovements` | ✅ `fleetStateMachine`: assigned → in_transit (e.g. boarding closure), in_transit → arrived (destination), arrived → garage. fleetMovements logged. |
| **Assignment (agence)** | `fleetVehicles` | ✅ FleetAssignmentPage sets status `assigned`, currentAgencyId, currentTripId, chauffeurName, etc. |

So: **when a trip starts or finishes, vehicle location and status are updated** in both the company `vehicles` flow (city + status) and the agency `fleetVehicles` flow (agency + status + currentTripId).

### 1.5 Agency queries

| Query | Implementation | Notes |
|-------|----------------|--------|
| **Vehicles in agency’s city** | ⚠️ In-memory only | GarageDashboardPage, ManagerOperationsPage, AgenceFleetOperationsPage filter `vehicles` by `currentCity === agencyCity` after loading full list. No Firestore `where("currentCity", "==", ...)`. |
| **Vehicles in transit to agency** | ⚠️ fleetVehicles only | FleetDashboardPage filters by `destinationAgencyId === currentAgencyId` (in memory). fleetVehicles can be queried with `where("destinationAgencyId", "==", agencyId)`. |
| **Vehicles assigned to trips** | ✅ fleetVehicles | `where("currentAgencyId", "==", agencyId)`, `where("currentTripId", "==", trip.id)`, etc. (FleetAssignmentPage). Affectations: `getActiveAffectationByVehicle` and queries by vehicleId/status. |

Summary: **Agency-level** filtering by agency/transit/trip is supported for **fleetVehicles** (with Firestore queries). **City-based** and **company-vehicles** views rely on loading a full (or large) list and filtering in memory.

### 1.6 Pagination and listing

- **vehicles**: `listVehicles(companyId, max)` (default max 500, internal limit 1500) and `listVehiclesPaginated` (page size 20, orderBy plateNumber | technicalStatus | updatedAt). No filter by city/agency at DB level.
- **fleetVehicles**: Fetched in full (e.g. getDocs(collection(fleetVehicles))) in FleetDashboardPage, CompanyGlobalFleetPage, etc. No pagination in the audited code.

---

## 2. What is missing

### 2.1 Canonical vehicle fields (requested)

- **currentCity** — Present on `vehicles`, **not** on `fleetVehicles` (which use currentAgencyId only).
- **currentAgencyId** — Present on `fleetVehicles`, **not** on `vehicles`.
- **status** with exact enum `AVAILABLE | ON_TRIP | MAINTENANCE | ACCIDENT | OUT_OF_SERVICE` — Not present as a single enum. Current split:
  - `vehicles`: legacy status + technicalStatus + operationalStatus (different labels).
  - `fleetVehicles`: garage | assigned | in_transit | arrived | maintenance (no ACCIDENT, OUT_OF_SERVICE).
- **driverId** — Not present; only driver names (driverName, chauffeurName). No link to `users` or personnel id.
- **lastTripId** — Not on `vehicles`. On `fleetVehicles` as `currentTripId` (current trip only).

### 2.2 Single source of truth

- Two collections (`vehicles` and `fleetVehicles`) with overlapping purpose and no formal sync. Risk of divergence (e.g. vehicle in one collection “in transit”, in the other “garage”).
- No single “vehicle” document that supports both city-based and agency-based views and all requested fields.

### 2.3 Trips storing vehicleId

- **weeklyTrips** do not store `vehicleId`. Link is reverse: affectation or fleetVehicle holds tripId. So “trips that have a vehicle” requires joining via affectations or fleetVehicles.
- **routeSchedules** store optional `busId`; not used consistently with weeklyTrips.

### 2.4 Agency queries (server-side)

- **Vehicles in their city**: No Firestore query; all vehicles (or a large slice) are loaded, then filtered by `currentCity`. Does not scale for 300+ buses.
- **Vehicles in transit to their city**: For `vehicles` (city-based) there is no `destinationAgencyId`; for `fleetVehicles` the query exists but may be used after loading a large set.
- **Vehicles assigned to trips**: Well supported for fleetVehicles via currentAgencyId + currentTripId.

### 2.5 Scale (300+ buses)

- **vehicles**: `listVehicles` caps at 500 (and 1500 internally); pagination is 20 per page. No composite indexes for “by city” or “by agency” + status. Full scans for large fleets.
- **fleetVehicles**: No pagination; full collection read. Same scalability issue.
- **Indexes**: No evidence of composite indexes for e.g. `(companyId, currentCity, status)` or `(companyId, currentAgencyId, status)` for the relevant collections.
- **Distributed operations**: No sharding, no “agency-owned” subset of vehicle docs, no offline/eventual-sync design for many locations.

---

## 3. What should be added to support 300+ buses and canonical model

### 3.1 Unify and extend the vehicle model (recommended)

- **Option A — Single collection (e.g. `vehicles`):**
  - Add to VehicleDoc (or new canonical type): `currentAgencyId`, `destinationAgencyId`, `driverId` (user/personnel id), `lastTripId` (last completed trip), and a single **status** enum aligned with product: e.g. `AVAILABLE | ON_TRIP | MAINTENANCE | ACCIDENT | OUT_OF_SERVICE` (with mapping from existing technical/operational/legacy).
  - Keep `currentCity` and optionally derive or sync from agency’s city for consistency.
  - Deprecate or phase out `fleetVehicles` by migrating agency flows to this single model and writing fleetMovements (or equivalent) from the same service.

- **Option B — Keep two collections but sync:**
  - Add `currentAgencyId`, `driverId`, `lastTripId` to company `vehicles` and keep them in sync with `fleetVehicles` (or vice versa) via shared service layer so both city and agency views are consistent.

### 3.2 Trips / schedules

- Add **vehicleId** (optional) to **weeklyTrips** (or to the trip instance / run document if it exists) so “trip → vehicle” is direct and indexable.
- Ensure **routeSchedules.busId** is used consistently when assigning vehicles to scheduled runs and that it references the chosen vehicle collection id.

### 3.3 Trip start/finish

- Keep existing update logic (location + status) but ensure it runs against the **canonical** vehicle store (and, if Option B, sync to the other). Ensure **lastTripId** is set when a trip finishes (and optionally clear or rotate when a new trip starts).

### 3.4 Agency queries (indexed, server-side)

- **Vehicles in agency’s city:**  
  - Add **currentCity** (and optionally currentAgencyId) to the canonical vehicle doc.  
  - Create Firestore index: e.g. `companyId` + `currentCity` + `status` (or operationalStatus).  
  - Implement `listVehiclesByCity(companyId, city, options?)` using `where("currentCity", "==", city)` and pagination.

- **Vehicles in transit to agency:**  
  - If using agency-based field: `where("destinationAgencyId", "==", agencyId)` (already possible for fleetVehicles).  
  - If staying city-based: add `destinationCity` (already on vehicles) and index `companyId` + `destinationCity`; add `listVehiclesInTransitToCity(companyId, city)`.

- **Vehicles assigned to trips:**  
  - Keep query by `currentAgencyId` + `currentTripId` (and status) on the canonical collection. Add composite index so this query is efficient at 300+ buses.

### 3.5 Scale and performance (300+ buses)

- **Pagination everywhere:** All list APIs for vehicles should be cursor-based (e.g. startAfter) with a bounded page size (e.g. 50–100). Remove any “load full collection” for fleet lists.
- **Indexes:** Define composite indexes for:
  - `companies/{companyId}/vehicles`: (currentCity, status), (currentAgencyId, status), (operationalStatus, updatedAt), etc., as needed by the new queries.
  - Same for `fleetVehicles` if retained: (currentAgencyId, status), (destinationAgencyId, status), (currentTripId).
- **Limit read scope:** Prefer agency-scoped or city-scoped queries over company-wide scans. Consider storing a minimal “agency view” (e.g. agencyId + vehicleId + status) in a subcollection per agency for very large fleets (e.g. `agences/{agencyId}/vehicleAssignments`) if needed for sub-50ms reads.
- **Caching / real-time:** For dashboards, use targeted listeners (e.g. by agency or city) rather than one listener on the whole fleet.

### 3.6 Driver and last trip

- Add **driverId** (reference to users or personnel) to the canonical vehicle document; keep driver display names for backward compatibility if needed.
- Add **lastTripId** and set it when a trip is completed (and optionally clear when starting a new trip). Use for reporting and “last assignment” UX.

---

## 4. Summary table (requested vs current)

| Requested | vehicles (VehicleDoc) | fleetVehicles (FleetVehicleDoc) | Notes |
|-----------|------------------------|----------------------------------|-------|
| currentCity | ✅ | ❌ | Only in vehicles. |
| currentAgencyId | ❌ | ✅ | Only in fleetVehicles. |
| status (AVAILABLE, ON_TRIP, …) | ⚠️ Different enum | ⚠️ Different enum | Map existing enums to canonical. |
| driverId | ❌ | ❌ | Only names (driverName, chauffeurName). |
| lastTripId | ❌ | currentTripId ✅ | lastTripId = “last completed” not implemented. |
| Trips store vehicleId | N/A | N/A | weeklyTrips: no; routeSchedules: busId. |
| Trip start/end updates vehicle | ✅ | ✅ | Both flows update location/status. |
| Query by city | ⚠️ In-memory | N/A | Need indexed server query. |
| Query by transit to city/agency | ⚠️ Partial | ✅ destinationAgencyId | vehicles: by destinationCity. |
| Query assigned to trips | Via affectations | ✅ currentTripId | Both supported, different models. |
| 300+ buses (indexed, paginated) | ❌ | ❌ | Full scans / no pagination on fleet. |

---

*End of audit.*
