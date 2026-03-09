# TELIYA Fleet Workflow Verification — Agency Managers (chefAgence)

**Date:** Verification audit  
**Scope:** Agency vehicle visibility, vehicle assignment to trips, vehicle state transitions, multiple trips per day, safety rules.  
**Source of truth (canonical):** `companies/{companyId}/vehicles/{vehicleId}`

---

## 1. Agency vehicle visibility

### Implemented

- **ManagerOperationsPage** (chef agence operations):
  - Loads agency city from `companies/{companyId}/agences/{agencyId}` using **villeNorm** then **ville** (no `city` field used here).
  - Loads vehicles via **listVehicles(companyId)** (canonical `vehicles` collection), then filters **in memory** by:
    - `operationalStatus === GARAGE`
    - `technicalStatus === NORMAL`
    - `currentCity` (normalized) === agency city
    - vehicle not already in an active affectation
  - Result: agency managers **do** see vehicles located in their city that are available for assignment.

### Gaps

- The **exact** Firestore query `where currentCity == agency.city AND status == AVAILABLE` is **not** used. The app uses `listVehicles(companyId)` then filters in memory. The canonical API **listVehiclesByCity(companyId, currentCity)** exists but:
  - Does **not** filter by status in the query (only by `currentCity`); status filtering would need to be applied after the query (e.g. canonicalStatus === AVAILABLE or operationalStatus === GARAGE).
  - Is **not** used in the agency trip configuration workflow; ManagerOperationsPage uses `listVehicles` + in-memory filter instead.
- **FleetAssignmentPage** (alternative agency assignment UI) does **not** use the canonical `vehicles` collection. It uses **fleetVehicles** and does not show a “list of available vehicles in agency city” for selection; it either reuses an existing fleetVehicle linked to the slot or creates a new fleetVehicle document.

### Agency city field

- **ManagerOperationsPage:** `villeNorm ?? ville` (no `city`).
- **AgenceTrajetsPage:** `city ?? ville`.
- **Recommendation:** Use a single fallback everywhere, e.g. `city ?? villeNorm ?? ville`, so that if the agence document only has `city` (e.g. from another system), the operations page still gets the agency city.

---

## 2. Vehicle assignment to trips

### Implemented

- **ManagerOperationsPage:** Full workflow exists:
  1. Agency sees departures (from weeklyTrips + horaires) for the selected date.
  2. For each departure without an affectation, agency can open “Affecter” and see **available vehicles in agency city** (from listVehicles + filter above).
  3. Agency selects a vehicle; **assignVehicle()** is called, which creates an **affectation** document (vehicleId, tripId, departureCity, arrivalCity, departureTime, driver/convoyeur, etc.).
  4. **vehicleId** is stored in the **affectation** document, not in the weeklyTrip document.

### Gaps

- **vehicleId is not stored on the weeklyTrip document.**  
  The type `WeeklyTrip` has an optional **vehicleId** (`src/types/weeklyTrip.ts`), and the path is `companies/{companyId}/agences/{agencyId}/weeklyTrips/{tripId}`, but:
  - No UI or service currently **writes** vehicleId when creating/updating a weeklyTrip.
  - Trip–vehicle link is maintained only via **affectations** (by departure/arrival/time/date), not via `weeklyTrips.vehicleId`.
- **FleetAssignmentPage** writes to legacy **affectations** (by key) and **fleetVehicles**; it does not use canonical `vehicles` and does not set vehicleId on weeklyTrips. So the “assign vehicle to trip” flow that uses the canonical model is only in ManagerOperationsPage (affectation-based).

**Conclusion:** Vehicle assignment to trips **works** for agency managers in ManagerOperationsPage (via affectations). The requirement to store **vehicleId** on the **weeklyTrip** document is **not** implemented; only the affectation holds the vehicleId.

---

## 3. Vehicle status update (trip start / trip end)

### Implemented (legacy fields)

- **On assignment (assignVehicle):** Only an affectation is created; vehicle stays GARAGE (no write to vehicle doc).
- **On trip start (confirmDepartureAffectation):**
  - Vehicle doc is updated: **operationalStatus = EN_TRANSIT**, **status = EN_TRANSIT**, **destinationCity = arrivalCity**.
  - Affectation status → DEPART_CONFIRME.
- **On trip end (confirmArrivalAffectation):**
  - Vehicle doc: **operationalStatus = GARAGE**, **currentCity = arrivalCity** (agency city), **destinationCity = null**.
  - Affectation status → ARRIVE.

### Gaps (canonical fields)

- **Canonical** vehicle state is **not** updated by these flows:
  - **Trip start:** **canonicalStatus**, **currentTripId** are not set (setVehicleOnTripStart exists in vehiclesService but is not called from confirmDepartureAffectation).
  - **Trip end:** **lastTripId** is not set, **currentTripId** is not cleared (setVehicleOnTripEnd is not called from confirmArrivalAffectation).
- So for reporting and “vehicles on trip” (e.g. logistics dashboard), the canonical fields **currentTripId** / **lastTripId** / **canonicalStatus** may be out of sync with the actual trip lifecycle. The **legacy** status/operationalStatus/currentCity/destinationCity are correct.

**Conclusion:** Vehicle state transitions **work** for the legacy model. Canonical state (ON_TRIP, currentTripId, lastTripId, AVAILABLE on end) is **not** updated by the agency workflow; recommend calling setVehicleOnTripStart/setVehicleOnTripEnd from confirmDepartureAffectation/confirmArrivalAffectation when the canonical model is required.

---

## 4. Multiple trips per day (same route)

### Implemented

- **weeklyTrips** supports multiple departures per day on the same route:
  - Each weeklyTrip has **horaires: { [dayName]: string[] }** (e.g. `lundi: ["07:00", "09:00", "12:00", "16:00"]`).
  - Each (trip, date, heure) is a distinct departure slot.
- **ManagerOperationsPage** builds one row per (departure, arrival, heure, date); each row can have its own **affectation** (different vehicle).
- So the scenario “Bamako → Sikasso at 07:00, 09:00, 12:00, 16:00 with different vehicles” is **supported**: each slot can be assigned a different vehicle via the affectation flow.

**Conclusion:** Multiple trips per day on the same route with different vehicle assignments are supported.

---

## 5. Agency safety rule (vehicle in agency city)

### Implemented

- **assignVehicle** in `vehiclesService.ts` enforces:
  - `vehicle.currentCity` (normalized) === `agencyCity` (normalized).
  - Vehicle must be GARAGE and NORMAL (operationalStatus, technicalStatus).
  - No existing active affectation for that vehicle.
- If the vehicle is not in the agency city, assignVehicle throws: *"Véhicule non assignable : doit être GARAGE, NORMAL et dans la ville de l'agence."*

**Conclusion:** The rule **vehicle.currentCity == agency.city** is enforced in the **ManagerOperationsPage** flow (assignVehicle). An agency cannot assign a vehicle that is not in its city when using this flow.

### Not implemented in FleetAssignmentPage

- **FleetAssignmentPage** does not select from a list of vehicles filtered by city. It uses fleetVehicles by currentAgencyId/currentDate/currentHeure/currentTripId or creates new fleetVehicle docs. There is no explicit check that the chosen vehicle’s currentCity matches the agency’s city in that page.

---

## 6. Summary table

| Requirement | Status | Notes |
|-------------|--------|--------|
| Agencies see vehicles in their city | ✅ Yes | ManagerOperationsPage: listVehicles + filter by currentCity + GARAGE/NORMAL. Not using listVehiclesByCity; no DB-level status filter. |
| Query “currentCity == agency.city AND status == AVAILABLE” | ⚠️ Partial | Equivalent done in memory (currentCity + operationalStatus/technicalStatus). listVehiclesByCity(companyId, city) exists but is not used in agency workflow and does not filter by status in query. |
| Vehicle assignment to trips | ✅ Yes | Via affectations in ManagerOperationsPage. vehicleId stored in affectation, **not** in weeklyTrip document. |
| vehicleId on weeklyTrip document | ❌ No | Optional field exists in type; no UI/service writes it. |
| Vehicle state: ON_TRIP / currentTripId / destinationCity on start | ✅ Legacy only | operationalStatus/status/destinationCity updated. canonicalStatus/currentTripId not set. |
| Vehicle state: AVAILABLE / currentCity / lastTripId / currentTripId=null on end | ✅ Legacy only | currentCity, destinationCity=null, operationalStatus GARAGE. lastTripId/currentTripId not updated. |
| Multiple trips per day, same route | ✅ Yes | weeklyTrips.horaires[day] = multiple times; one affectation per slot. |
| Safety: vehicle.currentCity == agency.city | ✅ Yes | Enforced in assignVehicle (ManagerOperationsPage). Not in FleetAssignmentPage. |

---

## 7. Issues detected (no critical blocking; recommendations only)

1. **Canonical vehicle state not updated on trip start/end**  
   confirmDepartureAffectation and confirmArrivalAffectation do not call setVehicleOnTripStart/setVehicleOnTripEnd. Canonical fields (currentTripId, lastTripId, canonicalStatus) stay out of sync. **Recommendation:** From confirmDepartureAffectation, after updating the vehicle, call setVehicleOnTripStart(companyId, vehicleId, affectationId or tripId, arrivalCity). From confirmArrivalAffectation, call setVehicleOnTripEnd(companyId, vehicleId, arrivalCity, affectationId or tripId). Optional, for consistency with the canonical model.

2. **vehicleId not stored on weeklyTrip**  
   Assignment is only in affectations. If the product requirement is to have vehicleId on the weeklyTrip document for traceability or reporting, the create/update weeklyTrip flow (and optionally the assign flow) should persist vehicleId. Today the workflow is valid without it (affectations are the source of truth for “which vehicle for this departure”).

3. **Agency city field inconsistency**  
   ManagerOperationsPage uses villeNorm ?? ville; AgenceTrajetsPage uses city ?? ville. **Recommendation:** Use the same fallback (e.g. city ?? villeNorm ?? ville) in both so that all agence document shapes are supported.

4. **FleetAssignmentPage uses fleetVehicles only**  
   This page does not use the canonical vehicles collection and does not show “available vehicles in agency city” from `vehicles`. It is a separate, legacy flow. No change required for this audit unless you want to migrate this page to the canonical model and add city validation.

5. **Use of listVehiclesByCity in agency workflow**  
   Optional improvement: In ManagerOperationsPage, use listVehiclesByCity(companyId, agencyCity) then filter in memory by status (AVAILABLE or GARAGE/NORMAL) and exclude already-affected vehicles, instead of listVehicles(companyId), to avoid loading the full fleet when the agency only needs vehicles in one city.

---

## 8. Conclusion

- Agency managers **can** see vehicles in their city and **can** assign them to trip departures in **ManagerOperationsPage** (canonical vehicles + affectations).
- **Safety rule** vehicle.currentCity == agency.city is enforced in **assignVehicle**.
- **Multiple departures** per day on the same route with different vehicles are supported.
- **Vehicle state** is correctly updated for the **legacy** model (operationalStatus, status, currentCity, destinationCity); **canonical** fields (currentTripId, lastTripId, canonicalStatus) are not updated by the agency workflow.
- **vehicleId** is not stored on weeklyTrip documents; it is only in affectations.

No critical breaking issue was found. Recommended follow-ups are: align canonical vehicle state with trip start/end (optional), unify agency city fallback, and optionally use listVehiclesByCity in the agency workflow and persist vehicleId on weeklyTrips if required by product.
