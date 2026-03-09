# Fleet architecture migration plan — TELIYA

**Canonical model:** `companies/{companyId}/vehicles/{vehicleId}`  
**Deprecated (kept for compatibility):** `companies/{companyId}/fleetVehicles/{vehicleId}`

---

## 1. Updated vehicle schema

**Path:** `companies/{companyId}/vehicles/{vehicleId}`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| country | string | Yes | Code pays ISO (ex. "ML"). |
| plateNumber | string | Yes | Plaque normalisée. |
| model | string | Yes | Modèle / libellé. |
| year | number | Yes | Année. |
| capacity | number | No | Nombre de places (siège). |
| status | VehicleStatus | No | Legacy: GARAGE, EN_SERVICE, EN_TRANSIT, EN_MAINTENANCE, ACCIDENTE, HORS_SERVICE. |
| canonicalStatus | CanonicalVehicleStatus | No | **Canonical:** AVAILABLE, ON_TRIP, MAINTENANCE, ACCIDENT, OUT_OF_SERVICE. |
| technicalStatus | TechnicalStatus | No | NORMAL, MAINTENANCE, ACCIDENTE, HORS_SERVICE. |
| operationalStatus | OperationalStatus | No | GARAGE, AFFECTE, EN_TRANSIT. |
| currentCity | string | Yes | Ville actuelle du véhicule. |
| currentAgencyId | string \| null | No | Agence où se trouve le véhicule (si modèle agence). |
| destinationCity | string \| null | No | Ville de destination (en transit). |
| driverId | string \| null | No | Id utilisateur / personnel du chauffeur. |
| currentTripId | string \| null | No | Trajet en cours (weeklyTrip id ou instance). |
| lastTripId | string \| null | No | Dernier trajet terminé. |
| statusHistory | StatusHistoryEntry[] | No | Historique des changements. |
| isArchived | boolean | No | Soft delete. |
| archivedAt, archivedBy | Timestamp, string | No | Archivage. |
| insuranceExpiryDate, inspectionExpiryDate, vignetteExpiryDate, purchaseDate, notes | various | No | Optionnels. |
| createdAt, updatedAt | Timestamp | Yes | Audit. |

**Canonical status enum:** `AVAILABLE` | `ON_TRIP` | `MAINTENANCE` | `ACCIDENT` | `OUT_OF_SERVICE`

**WeeklyTrip (optional link):**  
`companies/{companyId}/agences/{agencyId}/weeklyTrips/{tripId}` may contain optional `vehicleId` (reference to canonical vehicle). Existing trips without `vehicleId` remain valid.

---

## 2. Migration plan

### Step 1 — Compatibility layer (done)

- **fleetCompatibility.ts** maps `fleetVehicles` fields to vehicle shape:
  - `fleetVehicles.currentAgencyId` → `vehicles.currentAgencyId`
  - `fleetVehicles.currentTripId` → `vehicles.currentTripId`
  - `fleetVehicles.chauffeurName` → `driverId` (temporary string until user id)
  - `fleetVehicles.status` (garage/assigned/in_transit/arrived/maintenance) → `canonicalStatus`
- **fleetVehicles** marked deprecated in code comments; **not** removed.

### Step 2 — Gradual reads migration

- New code and new features use **vehicles** only:
  - `listVehicles`, `listVehiclesPaginated`, `listVehiclesByCity`, `listVehiclesByCurrentAgency`, `listVehiclesInTransitToCity`, `getVehicle` all read from `companies/{companyId}/vehicles`.
- Existing agence flows that still read **fleetVehicles** (e.g. FleetAssignmentPage, FleetDashboardPage) continue to work; no breaking change.
- When migrating a flow to canonical model:
  1. Switch reads to `vehicles` (and use compatibility layer if merging with legacy fleetVehicles data).
  2. Writes: update `vehicles`; optionally keep writing to `fleetVehicles` during transition (dual-write) then stop once all readers use vehicles.

### Step 3 — Deprecate fleetVehicles (later)

- Keep `fleetVehicles` collection and rules until all consumers use `vehicles`.
- Then: stop writing to `fleetVehicles`; after a safety period, document removal of the collection (or leave as read-only archive).

### Trip ↔ vehicle state (canonical)

- **When a trip starts:** call `setVehicleOnTripStart(companyId, vehicleId, tripId, arrivalCity)`:
  - `canonicalStatus = ON_TRIP`, `currentTripId = tripId`, `destinationCity = arrivalCity`, legacy `status`/`operationalStatus` updated.
- **When a trip finishes:** call `setVehicleOnTripEnd(companyId, vehicleId, arrivalCity, tripId)`:
  - `canonicalStatus = AVAILABLE`, `currentCity = arrivalCity`, `lastTripId = tripId`, `currentTripId = null`, `destinationCity = null`, legacy fields updated.
- Existing flows (affectations, confirmDeparture/confirmArrival, fleetStateMachine) remain; new flows should use the above helpers for the canonical document.

---

## 3. Required Firestore indexes

Defined in **firestore.indexes.json** (collection `vehicles` under each `companies/{companyId}`):

| Index | Fields | Use case |
|-------|--------|----------|
| 1 | currentCity ASC, updatedAt DESC | listVehiclesByCity (vehicles in a city). |
| 2 | currentAgencyId ASC, updatedAt DESC | listVehiclesByCurrentAgency (vehicles assigned to an agency). |
| 3 | destinationCity ASC, status ASC, updatedAt DESC | listVehiclesInTransitToCity (vehicles in transit to a city, status = EN_TRANSIT). |

Deploy with:  
`firebase deploy --only firestore:indexes`

---

## 4. Updated fleet queries

All in **vehiclesService.ts**; target collection: `companies/{companyId}/vehicles`.

| API | Query | Pagination |
|-----|--------|------------|
| listVehicles(companyId, max) | orderBy plateNumber, limit | No cursor; max default 500. |
| listVehiclesPaginated(companyId, options) | orderBy (plate \| technicalStatus \| updatedAt), limit(pageSize+1), startAfter | pageSize default **50**; cursor-based. |
| listVehiclesByCity(companyId, currentCity, options) | where currentCity == city, orderBy updatedAt desc, limit | limitCount default 50; startAfterDoc. |
| listVehiclesByCurrentAgency(companyId, currentAgencyId, options) | where currentAgencyId == agencyId, orderBy updatedAt desc, limit | limitCount default 50; startAfterDoc. |
| listVehiclesInTransitToCity(companyId, destinationCity, options) | where destinationCity == city, where status == EN_TRANSIT, orderBy updatedAt desc, limit | limitCount default 50; startAfterDoc. |

- **Vehicles in their city:** `listVehiclesByCity(companyId, agencyCity)` (agency city from agence doc or config).
- **Vehicles assigned to an agency:** `listVehiclesByCurrentAgency(companyId, agencyId)`.
- **Vehicles in transit to a city:** `listVehiclesInTransitToCity(companyId, agencyCity)`.

---

## 5. Backward compatibility

- **Existing documents:** All new fields on VehicleDoc are optional. Existing vehicle docs without `canonicalStatus`, `currentAgencyId`, `driverId`, `currentTripId`, `lastTripId`, `capacity` continue to work; **normalizeVehicleDoc** derives `canonicalStatus` from legacy `status` / technicalStatus / operationalStatus when reading.
- **Legacy status:** `status` (VEHICLE_STATUS) and technical/operational status are still written and read; canonical helpers also set them so existing UI and rules keep working.
- **fleetVehicles:** No removal; no breaking change for agence flows that still read/write fleetVehicles. Migration is additive: new code uses vehicles; old code can stay until migrated.
- **weeklyTrips:** New optional field `vehicleId`; existing trips without it remain valid.
- **Firestore rules:** Existing rules for `vehicles` and `fleetVehicles` are unchanged; both remain readable/writable as before for authorized roles.
- **Roles:** responsable_logistique and CEO (admin_compagnie) have access to the logistics dashboard; permissions (read vehicles, fleetCosts, weeklyTrips, shipments; no write on accounting, dailyStats, financial reports) are unchanged.

---

## 6. Logistics dashboard data (implemented)

- **Fleet summary:** Total vehicles, Available, On trip, Maintenance, Accident (and Hors service count if > 0).
- **Fleet distribution by city:** Count of vehicles per currentCity (top 15 cities).
- **Active trips:** Count of vehicles with `currentTripId` set.
- **Weekly trips configured:** Count of weeklyTrips across agencies.
- **Maintenance alerts:** Vehicles in MAINTENANCE, ACCIDENTE, or HORS_SERVICE (list, max 10).
- **Courier (read-only):** Shipments today and in transit (unchanged).

---

## 7. File reference

| File | Change |
|------|--------|
| src/modules/compagnie/fleet/vehicleTypes.ts | Added CANONICAL_VEHICLE_STATUS, capacity, currentAgencyId, driverId, currentTripId, lastTripId, canonicalStatus on VehicleDoc. |
| src/types/weeklyTrip.ts | Added optional vehicleId. |
| src/modules/compagnie/fleet/fleetCompatibility.ts | New: map fleetVehicles → vehicle partial; deprecation note. |
| src/modules/compagnie/fleet/vehiclesService.ts | normalizeVehicleDoc derives canonicalStatus; listVehiclesByCity, listVehiclesByCurrentAgency, listVehiclesInTransitToCity; setVehicleOnTripStart, setVehicleOnTripEnd; listVehiclesPaginated default pageSize 50. |
| firestore.indexes.json | Three composite indexes for vehicles (currentCity; currentAgencyId; destinationCity+status). |
| src/modules/compagnie/pages/LogisticsDashboardPage.tsx | Fleet summary (available, on trip, maintenance, accident), distribution by city, active trips count. |
| src/constants/routePermissions.ts | garageLayout and logisticsDashboard include admin_compagnie (CEO). |

---

*End of migration plan.*
