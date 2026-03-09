# Trip Instance System — Implementation Report (TELIYA)

This document summarizes the implementation of the **daily trip instance** system alongside the existing **weeklyTrips** architecture. Trip instances represent real departures; weeklyTrips and current reservation flows remain intact.

---

## 1. Files Created

| File | Purpose |
|------|--------|
| `src/modules/compagnie/tripInstances/tripInstanceTypes.ts` | Types, status enum, and collection name for trip instances. |
| `src/modules/compagnie/tripInstances/tripInstanceService.ts` | Firestore CRUD: create, find by slot, getOrCreate, list by route+date, status updates, reservedSeats increment/decrement, vehicle assignment. |

---

## 2. Files Updated

| File | Changes |
|------|--------|
| `firestore.indexes.json` | Two composite indexes for `tripInstances`: (departureCity, arrivalCity, date, departureTime) and (agencyId, date, departureTime, departureCity, arrivalCity). |
| `firestore.rules` | Rules for `companies/{companyId}/tripInstances/{tripInstanceId}`: public read; create only with initial state (reservedSeats 0, SCHEDULED); update allowed for authenticated company/platform **or** unauthenticated when only `reservedSeats` and `updatedAt` change and reservedSeats does not decrease (public reservation flow). |
| `src/types/reservation.ts` | Optional `tripInstanceId?: string \| null` added to reservation type. |
| `src/modules/compagnie/public/pages/ResultatsAgencePage.tsx` | Date-first search: horizontal date selector (Today, Tomorrow, etc.); loads only trip instances for selected date; lazy creation from weeklyTrips when none exist; “No departure on this date” + suggest another date. |
| `src/modules/compagnie/public/pages/ReservationClientPage.tsx` | Reservation payload includes `tripInstanceId`; on create, calls `incrementReservedSeats`. For direct-URL flow (synthetic trip id), resolves real trip instance via `getOrCreateTripInstanceForSlot` before creating reservation and incrementing seats. |
| `src/modules/compagnie/fleet/vehiclesService.ts` | **assignVehicle**: after creating affectation, gets or creates trip instance for slot and calls `assignVehicleToTripInstance`. **confirmDepartureAffectation**: finds trip instance by slot, sets status to DEPARTED and assigns vehicle. **confirmArrivalAffectation**: finds trip instance by slot, sets status to ARRIVED. |

---

## 3. Firestore Schema

### Collection

`companies/{companyId}/tripInstances/{tripInstanceId}`

### Document fields

| Field | Type | Description |
|-------|------|-------------|
| `routeId` | string \| null | Optional route reference. |
| `agencyId` | string | Agency owning the departure. |
| `departureCity` | string | Departure city. |
| `arrivalCity` | string | Arrival city. |
| `date` | string | Date (YYYY-MM-DD). |
| `departureTime` | string | Time (HH:mm). |
| `vehicleId` | string \| null | Assigned vehicle (optional). |
| `seatCapacity` | number | Total seats. |
| `reservedSeats` | number | Booked seats. |
| `status` | string | One of: SCHEDULED, BOARDING, DEPARTED, ARRIVED, CANCELLED. |
| `price` | number \| null | Optional price per seat. |
| `weeklyTripId` | string \| null | Optional source weekly trip. |
| `createdAt` | timestamp | Creation time. |
| `updatedAt` | timestamp | Last update. |

### Status model

- **SCHEDULED** — Default when created.
- **BOARDING** — Optional future use.
- **DEPARTED** — Set when agency confirms departure (vehicle EN_TRANSIT).
- **ARRIVED** — Set when destination agency confirms arrival (vehicle GARAGE, currentCity updated).
- **CANCELLED** — Cancelled departure.

---

## 4. Services Created

**Module:** `src/modules/compagnie/tripInstances/`

- **tripInstanceTypes.ts**: `TRIP_INSTANCE_COLLECTION`, `TRIP_INSTANCE_STATUS`, `TripInstanceDoc`, `TripInstanceDocWithId`, `TripInstanceStatus`.
- **tripInstanceService.ts**:
  - `createTripInstance(companyId, params)` — Create one instance; returns id.
  - `findTripInstanceBySlot(companyId, agencyId, date, departureTime, departureCity, arrivalCity)` — Find by slot.
  - `getOrCreateTripInstanceForSlot(companyId, params)` — Lazy create if missing.
  - `listTripInstancesByRouteAndDate(companyId, departureCity, arrivalCity, date, options?)` — Query by route + date (indexed).
  - `updateTripInstanceStatus(companyId, tripInstanceId, status)` — Set status.
  - `incrementReservedSeats(companyId, tripInstanceId, seats)` — Atomic increment (e.g. on reservation create).
  - `decrementReservedSeats(companyId, tripInstanceId, seats)` — Atomic decrement (e.g. on cancel).
  - `assignVehicleToTripInstance(companyId, tripInstanceId, vehicleId)` — Set vehicleId.
  - `getTripInstance(companyId, tripInstanceId)` — Get by id.

---

## 5. UI Components Updated

| Component | Updates |
|-----------|--------|
| **ResultatsAgencePage** | Transport-style search: horizontal date selector (Today, Tomorrow, Fri 12, Sat 13, …). Selecting a date loads only trip instances for that date (and lazy-creates from weeklyTrips if needed). Results show time + available seats. Empty state: “Aucun départ à cette date” with suggestion to choose another date. |
| **ReservationClientPage** | Uses `tripInstanceId` when creating reservation; calls `incrementReservedSeats` after addDoc. For direct-URL entry (synthetic trip id), calls `getOrCreateTripInstanceForSlot` and uses returned id for reservation and increment. |

---

## 6. Reservations Integration

- New reservations store **tripInstanceId** (and keep **trajetId** for backward compatibility).
- On reservation create: **reservedSeats** on the trip instance are incremented via `incrementReservedSeats`.
- Existing reservations without `tripInstanceId` continue to work (fallback to departureDate + departureTime / trajetId).

---

## 7. Vehicle Assignment & Confirmation

- **Assignment:** When the agency assigns a vehicle (`assignVehicle`), a trip instance is get-or-created for the slot and **vehicleId** is stored on it via `assignVehicleToTripInstance`. Existing affectation creation and weeklyTrip vehicleId update are unchanged.
- **Departure confirmation:** `confirmDepartureAffectation` sets trip instance status to **DEPARTED** and assigns **vehicleId**; vehicle state is set to **EN_TRANSIT** (existing logic).
- **Arrival confirmation:** `confirmArrivalAffectation` sets trip instance status to **ARRIVED**; vehicle is set to **GARAGE** and **currentCity** to arrival city (existing logic).

---

## 8. Performance & Indexes

- Queries filter by **departureCity**, **arrivalCity**, **date** (and optionally agencyId, departureTime).
- Two composite indexes on `tripInstances` support:
  - Route + date listing: (departureCity, arrivalCity, date, departureTime).
  - Slot lookup by agency: (agencyId, date, departureTime, departureCity, arrivalCity).
- Trip instances are created **lazily** (on search, vehicle assignment, or reservation), not pre-generated in bulk.

---

## 9. Backward Compatibility

- **weeklyTrips** and all existing flows (affectations, vehicle status, reservations) are unchanged.
- Reservations without **tripInstanceId** still work (existing logic can use departureDate + departureTime / trajetId).
- Trip instances are created only when needed (search, assign vehicle, create reservation).

---

## 10. Security (Firestore Rules)

- **Read:** Public (get, list) for trip instances.
- **Create:** Allowed only with initial state (reservedSeats 0, status SCHEDULED, required fields set) so lazy creation from public search works.
- **Update:** Allowed if (1) authenticated and same company or platform admin, **or** (2) unauthenticated and the only changes are `reservedSeats` and `updatedAt` with reservedSeats not decreasing (public reservation increment).
- **Delete:** Disallowed.

---

*Report generated for the TELIYA daily trip instance implementation.*
