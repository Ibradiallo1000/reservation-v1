# Trip Instance Model — TELIYA

This document describes the **TripInstance** layer: the real execution of a scheduled trip. It does not replace the existing architecture; it adds an operational layer for boarding, parcel loading, and trip monitoring.

---

## 1. Concepts

| Concept | Role |
|--------|------|
| **WeeklyTrip (schedule)** | Defines the recurring trip (route, times, days). Template for what runs. |
| **TripInstance** | One real execution of a trip on a given date. Created when a trip is confirmed for the day or when the first reservation for that date appears. |
| **Reservation** | Attaches to a **TripInstance** (optional `tripInstanceId`). Existing reservations without `tripInstanceId` remain valid. |
| **Shipment** | Can attach to a **TripInstance** (optional `tripInstanceId`). When assigned, the instance’s `parcelCount` is updated. |

---

## 2. Firestore collection

**Path:** `companies/{companyId}/tripInstances/{tripInstanceId}`

**Document structure:**

- `companyId` (string)
- `agencyId` (string) — primary / origin agency (backward compat and simple queries)
- `agenciesInvolved` (string[], optional) — all agencies on the route (e.g. Bamako → Sikasso → Bouaké). Enables intermediate parcel loading, en-route boarding, per-agency statistics.
- `routeDeparture` (string) — departure city
- `routeArrival` (string) — arrival city
- `weeklyTripId` (string | null)
- `vehicleId` (string | null)
- `departureDate` (Timestamp)
- `departureTime` (string)
- `status`: `"scheduled"` | `"boarding"` | `"departed"` | `"arrived"` | `"cancelled"`
- `passengerCount` (number) — from confirmed reservations
- `parcelCount` (number) — from assigned shipments
- `capacitySeats` (number, optional) — bus seat capacity for fill-rate (e.g. 34/50 = 68%)
- `capacityParcels` (number, optional) — parcel capacity for fill-rate
- `createdAt` (Timestamp)
- `createdBy` (string)

Backward-compatibility fields (optional): `departureCity`, `arrivalCity`, `reservedSeats`, `seatCapacity`, `date`.

---

## 3. WeeklyTrip → schedule, TripInstance → real execution

- **WeeklyTrip** (or equivalent schedule) defines *what* runs: route, departure time, days of the week, capacity, etc.
- **TripInstance** represents *one run* on a specific date:
  - Created when a trip is confirmed for that day, or when the first reservation for that date/slot appears.
  - Identified by company, agency, date, departure time, and route (departure/arrival cities).
  - Holds the current status and aggregated counts (passengers, parcels).

So: **schedule (WeeklyTrip) → instances (TripInstance) per date.**

---

## 4. Reservations and shipments attached to TripInstance

**Reservations**

- Optional field: `tripInstanceId?: string`
- When present, the reservation is linked to that trip instance.
- When a reservation is created and linked to an instance, the instance’s `passengerCount` (and backward-compat `reservedSeats`) is incremented; when cancelled, it is decremented.
- Existing reservations without `tripInstanceId` remain valid and are not required to be migrated.

**Shipments**

- Optional field: `tripInstanceId?: string`
- When a shipment is created (or assigned) with a `tripInstanceId`, it is attached to that instance and the instance’s `parcelCount` is incremented.
- Used for parcel loading and trip monitoring.

---

## 5. Creation logic

A TripInstance is created when:

1. A trip is confirmed for the day (operational flow), or  
2. The first reservation for that date/slot appears (lazy creation).

**Implementation:** `getOrCreateTripInstanceForSlot(companyId, params)` in `tripInstanceService`:

- Looks up an instance by agency, date, departure time, and route (departure/arrival cities).
- If none exists, creates one with `createTripInstance` and returns it.
- Callers (e.g. online reservation, guichet with slot, vehicle assignment) use this so that one instance per slot per date is used.

---

## 6. Status lifecycle

TripInstance statuses:

- **scheduled** — Created, not yet in progress.
- **boarding** — Passengers/parcels being loaded.
- **departed** — Vehicle left.
- **arrived** — Vehicle arrived at destination.
- **cancelled** — Trip instance cancelled.

Used by:

- Ticket boarding
- Parcel loading
- Trip monitoring (e.g. operations dashboard, fleet)

Status updates are done via `updateTripInstanceStatus(companyId, tripInstanceId, status)` (e.g. when departure or arrival is confirmed).

---

## 7. Aggregation (counters)

TripInstance maintains:

- **passengerCount** — Updated when reservations are confirmed (increment) or cancelled (decrement). Mirrored for backward compat in `reservedSeats`.
- **parcelCount** — Updated when shipments are assigned to the instance (increment) or unassigned (decrement).

**Capacity and fill rate:**

- **capacitySeats** (optional) — Bus seat capacity. Fill rate = `passengerCount / capacitySeats` (e.g. 34/50 = 68%). Used for CEO analysis and trip optimization.
- **capacityParcels** (optional) — Parcel capacity. Fill rate = `parcelCount / capacityParcels`.

When creating an instance, `capacitySeats` can be set from the weekly trip or vehicle; `capacityParcels` from operational rules. Existing instances without these fields remain valid.

Service helpers:

- `incrementReservedSeats` / `decrementReservedSeats` — update both `reservedSeats` and `passengerCount`.
- `incrementParcelCount` / `decrementParcelCount` — update `parcelCount`.

---

## 7b. Multi-agency trips (agenciesInvolved)

A trip can involve **several agencies** (e.g. Bamako → Sikasso → Bouaké). The optional field **agenciesInvolved** (string[]) lists all agency IDs on the route. This allows:

- **Intermediate parcel loading** — assign shipments at any agency on the route.
- **En-route passenger boarding** — board passengers at intermediate stops.
- **Per-agency statistics** — break down revenue or activity by agency.

When not set, **agencyId** remains the primary/origin agency and existing behaviour is unchanged.

---

## 8. Code references

- **Types:** `src/modules/compagnie/tripInstances/tripInstanceTypes.ts`
- **Service:** `src/modules/compagnie/tripInstances/tripInstanceService.ts`  
  - `createTripInstance`, `getOrCreateTripInstanceForSlot`, `findTripInstanceBySlot`, `updateTripInstanceStatus`, `incrementReservedSeats`, `decrementReservedSeats`, `incrementParcelCount`, `decrementParcelCount`
- **Reservation:** `tripInstanceId` optional on reservation payload and in `CreateGuichetReservationParams`; already present in `src/types/reservation.ts`.
- **Shipment:** `tripInstanceId` optional on shipment type and in `CreateShipmentParams`; `createShipment` writes it and calls `incrementParcelCount` when provided.

---

**Last updated:** 2025-03-10
