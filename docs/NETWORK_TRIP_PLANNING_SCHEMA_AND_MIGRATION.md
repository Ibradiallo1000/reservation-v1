# Network-level trip planning — Firestore schema, queries, UI, migration

## 1. Firestore schema

### 1.1 Agency (existing, extended)

**Path:** `companies/{companyId}/agences/{agencyId}`

**Added / ensured field:**
- `city` (string) — City of the agency; **only trips departing from this city** can be created by the agency. Used for route filtering.

**Example:**
```json
{
  "nomAgence": "Agence Bamako",
  "ville": "Bamako",
  "city": "Bamako",
  "pays": "Mali"
}
```

**Backward compatibility:** If `city` is missing, the app uses `agency.ville` for the same rule.

---

### 1.2 Company routes (new)

**Path:** `companies/{companyId}/routes/{routeId}`

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `departureCity` | string | Departure city |
| `arrivalCity` | string | Arrival city |
| `distance` | number \| null | Distance in km (optional) |
| `estimatedDuration` | number \| null | Duration in minutes (optional) |

**Example:**
```json
{
  "departureCity": "Bamako",
  "arrivalCity": "Kayes",
  "distance": 600
}
```

---

### 1.3 Route schedules (new)

**Path:** `companies/{companyId}/routeSchedules/{scheduleId}`

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `routeId` | string | Reference to `routes/{routeId}` |
| `agencyId` | string | Agency operating this schedule |
| `busId` | string \| null | Optional vehicle id |
| `departureTime` | string | e.g. `"08:00"` |
| `daysOfWeek` | string[] | e.g. `["monday", "tuesday"]` |
| `status` | string | `"active" \| "inactive" \| "suspended"` |

---

### 1.4 Weekly trips (existing, extended)

**Path:** `companies/{companyId}/agences/{agencyId}/weeklyTrips/{tripId}`

**Added optional field:**
- `scheduleId` (string \| null) — Links this weekly trip to a document in `routeSchedules` when the trip was created from a network schedule.

Existing fields (`departure`, `arrival`, `price`, `places`, `horaires`, `active`, etc.) are unchanged. All existing behaviour (guichet, embarquement, réservation publique) continues to use `weeklyTrips` as before.

---

## 2. Queries used

| Purpose | Collection / path | Query |
|--------|--------------------|--------|
| Load agency (city) | `companies/{companyId}/agences/{agencyId}` | `getDoc(doc(...))` |
| Routes for agency trip config | `companies/{companyId}/routes` | `where("departureCity", "==", agencyCity)` |
| List all company routes | `companies/{companyId}/routes` | `getDocs(collection(...))` then sort in memory |
| List schedules by agency | `companies/{companyId}/routeSchedules` | `where("agencyId", "==", agencyId)` |
| List schedules by route | `companies/{companyId}/routeSchedules` | `where("routeId", "==", routeId)` |
| List weekly trips (unchanged) | `companies/{companyId}/agences/{agencyId}/weeklyTrips` | `getDocs(collection(...))` |

No composite index is required for the current queries (filter only on `departureCity` for routes; sort in memory).

---

## 3. UI updates

### 3.1 Agency creation / edit (Compagnie)

- **AjouterAgenceForm:** On create, set `city: ville.trim()` so the agency has a city for trip planning.
- **CompagnieAgencesPage:** On create and update, set `city: formData.ville.trim()`.

No new form field: `city` is derived from `ville` so existing flows stay the same.

### 3.2 Agency trip configuration (AgenceTrajetsPage)

- **Load agency city:** On mount, `getDoc(companies/{companyId}/agences/{agencyId})` and set `agencyCity = data.city ?? data.ville`.
- **Load allowed routes:** When `agencyCity` is set, `listRoutesByDepartureCity(companyId, agencyCity)` so the agency only sees routes where `departureCity === agency.city`.
- **Validation:** On submit, require `departure` (after normalize/capitalize) to equal `agencyCity`. Otherwise show an error and block creation.
- **Route dropdown (optional):** If there are allowed routes, show a “Préremplir depuis une route” dropdown; on select, prefill “Ville de départ” and “Ville d’arrivée” from the chosen route.
- **Info text:** Display “Départs autorisés : **{agencyCity}** (ville de votre agence)”.

Existing behaviour (list trajets, add/modify/delete, horaires, PDF export) is unchanged. Only the departure-city rule and optional route prefill are added.

---

## 4. Migration strategy

### 4.1 Existing agencies without `city`

- **Option A (recommended):** No one-off script. The app uses `agency.city ?? agency.ville` everywhere. So if `city` is missing, `ville` is used. When an agency is next edited and saved from Compagnie (create or update), `city` is written from `ville`.
- **Option B (backfill):** One-time script:
  1. For each `companies/{companyId}/agences/{agencyId}` document:
  2. If `city` is missing and `ville` is present, set `city = ville` (or normalized value).
  3. Run once per company/agency (e.g. Cloud Function or admin script).

### 4.2 Existing weeklyTrips

- No change required. The new field `scheduleId` is optional. Existing documents remain valid and all current readers (guichet, embarquement, réservation, manager) keep working.
- When you later create weekly trips from a “schedule” flow, you can set `scheduleId` to the corresponding `routeSchedules/{scheduleId}`.

### 4.3 Adding company routes

- Routes are created at company level (e.g. by admin or CEO). There is no automatic creation from existing weeklyTrips.
- To align with current trajets: create one `routes` document per distinct (departureCity, arrivalCity) you want to expose (e.g. Bamako → Kayes, Bamako → Sikasso, Kayes → Bamako). Agencies will then see only routes whose `departureCity` matches their `city` (or `ville`).

### 4.4 Route schedules

- `routeSchedules` are for future “network schedule” features (e.g. create a schedule from a route, then optionally create a weeklyTrip with `scheduleId`). Current AgenceTrajetsPage does not create `routeSchedules`; it only validates departure city and optionally prefills from routes.

---

## 5. Summary

| Item | Status |
|------|--------|
| Agency `city` | Added on create/update; fallback to `ville` when reading |
| Company `routes` | New collection + types + service; filtered by `departureCity` for agencies |
| `routeSchedules` | New collection + types + service for future schedule-driven trips |
| weeklyTrips `scheduleId` | Optional field added; `generateWeeklyTrips` accepts optional `scheduleId` |
| AgenceTrajetsPage | Loads city, loads routes by city, validates departure = agency city, optional route prefill |
| Existing weeklyTrips / guichet / embarquement | Unchanged; no breaking change |
