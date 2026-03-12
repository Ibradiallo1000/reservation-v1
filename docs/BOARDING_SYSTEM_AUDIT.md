# TELIYA — Boarding / QR / Ticket Validation Audit

**Type:** Architecture audit only (no code modification).  
**Objective:** Understand the current boarding and ticket validation model before implementing an anti-fraud boarding system.

---

## 1. Current QR Code Usage

### 1.1 Data Encoded in the QR Code

The QR code encodes a **URL** of the form:

```
{origin}/r/{receiptNumber}
```

- **`origin`**: `window.location.origin` (e.g. `https://example.com`).
- **`receiptNumber`**: Either the reservation’s `referenceCode` or `id` (fallback). Example: `BIL-XXXX` or a Firestore document ID.

So the QR carries a **receipt/ticket identifier**, not the full reservation payload. The scanner parses this URL to extract the code used to look up the reservation.

### 1.2 Where the QR Is Generated

- **`TicketOnline.tsx`** (public ticket component): Receives `qrValue` as a prop, typically `${origin}/r/${receiptNumber}`.
- **`ReceiptModal.tsx`** (guichet receipt): Builds `qrValue` as `${window.location.origin}/r/${receiptNumber}`.
- **`ReceiptEnLignePage.tsx`**: Builds the same URL for the receipt page and PDF.
- **`ReservationDetailsPage.tsx`**: Passes `qrValue={`${origin}/r/${encodeURIComponent(reservation.referenceCode || reservation.id)}`}` to the ticket component.

All use the **`react-qr-code`** library to render the QR from this string.

### 1.3 Where the QR Is Displayed

- Client-facing: **TicketOnline** (in “Mes billets”, receipt page, reservation details).
- Guichet: **ReceiptModal** after a counter reservation.
- Public receipt: **ReceiptEnLignePage** (and PDF export).

### 1.4 Validation Purpose

The QR is **not** used for “opening” the ticket in a browser. The public router (`RouteResolver.tsx`) has no `case "r"`; a path like `/:slug/r/{receiptNumber}` would hit `default` and show **PageNotFound**. The QR is used **only for scanning at boarding**: the scanner reads the URL, extracts `receiptNumber`, and the boarding flow uses that to find the reservation and update status to “embarqué”.

---

## 2. Ticket Validation Logic

### 2.1 Reservation Statuses

Defined in `src/utils/reservationStatusUtils.ts`:

- **Canonical (written in DB):** `confirme`, `paye`, `preuve_recue`, `annulation_en_attente`, `annule`, `rembourse`, `embarque`, `expire`, `refuse`, `verification`.
- **Display-only:** `expire` can be derived from date (trip date + 30 days) for UI; it is **not** written to the reservation document.

### 2.2 Statuses That Allow QR Display

- **`isTicketValidForQR(statut)`** returns true only for canonical `confirme` or `paye`.
- So: QR is shown only for **confirmed** or **paid** tickets. Expired (effective) or other statuses do not get a valid QR in the UI.

### 2.3 Statuses That Allow Boarding Scan

- **`canEmbarkWithScan(effectiveStatut)`** returns true only for `confirme` or `paye`.
- If the effective status is already `embarque`, or is `annule`, `rembourse`, `expire`, etc., the scan is **rejected** (“Déjà embarqué” or equivalent).

### 2.4 “Used” Status

- When a ticket is scanned for boarding, the reservation is updated to:
  - `statut` → `"embarque"`,
  - `statutEmbarquement` → `"embarqué"`,
  - `checkInTime` → server timestamp.
- So “used” is represented by **`embarque`** (and the presence of a `boardingLocks` document and optional `boardingLogs` entry). There is no separate “used” enum; “used” = embarked.

### 2.5 Lifecycle Summary

```
en_attente_paiement → preuve_recue → confirme | refuse
confirme | paye → embarqué (via scan) | annulation_en_attente | expire (UI only)
annulation_en_attente → annule → rembourse
```

QR is shown and scan is allowed only in `confirme` or `paye`. After a successful scan, the ticket becomes `embarque` and cannot be scanned again.

---

## 3. Boarding / Scanning System

### 3.1 Existence of a Boarding System

Yes. The main implementation is in **`AgenceEmbarquementPage.tsx`** (agency boarding page).

### 3.2 QR Scanning

- **Library:** `@zxing/browser` (`BrowserMultiFormatReader`).
- **Flow:** User opens the boarding page, selects agency/trip/date; the scanner reads the QR; the decoded string is passed to `extractCode(scanCode)` to get the receipt/code; that code is used in `findReservationByCode(...)` to resolve the reservation.

### 3.3 Code Extraction

- **`extractCode(raw)`** (in `src/modules/agence/boarding/utils.ts` and duplicated inline in `AgenceEmbarquementPage.tsx`): If the raw string is a URL, parses it and returns the segment after `/r/` (decoded); otherwise returns the trimmed string. So both full URL and plain code are supported.

### 3.4 Reservation Lookup

- **`findReservationByCode(companyId, agencyId, code, context)`**:
  - Tries document ID = `code` in the given agency’s reservations, then `referenceCode == code` in that agency.
  - If no agency or not found, searches all agencies (by doc id then `referenceCode`), with a **relevance score** (tripId, departure, arrival, date, time) to pick the best match when several reservations share the same code (e.g. same referenceCode in different trips).

### 3.5 Boarding Events and Seat Validation

- **Capacity check:** Before setting status to “embarqué”, the code checks that the number of already embarked passengers for the selected trip (via `boardingStats`: `embarkedSeats`) plus the new seats does not exceed `vehicleCapacity`. Capacity is taken from the current affectation (vehicle) for the selected trip/date.
- **Concordance:** The reservation’s trip (date, time, route) must match the selected departure (id match, or normalized city/date/time match). Otherwise the user sees “Billet pour un autre départ (date/heure/trajet non concordants).”
- **Double-scan prevention:** See §4.

### 3.6 What Gets Updated on Successful Scan

In a single Firestore transaction:

- **Reservation document:** `statutEmbarquement`, `controleurId`, `checkInTime`; if status becomes “embarqué”, also `statut` → `"embarque"` and `auditLog` with transition payload.
- **`boardingLocks/{reservationId}`:** New document with `reservationId`, `by`, `at`, `tripId`, `date`, `heure` (prevents reuse).
- **`boardingStats`** (for the trip key): Created if missing, then `embarkedSeats` incremented.
- **`boardingLogs`:** New log document with `reservationId`, `trajetId`, `departure`, `arrival`, `date`, `heure`, `result: "EMBARQUE"`, `controleurId`, `scannedAt`.

---

## 4. Ticket Reuse Risk

### 4.1 Multiple Use of the Same QR

- **Prevented.** Before writing “embarqué”:
  1. **Reservation status:** If `statutEmbarquement === "embarqué"` or effective status is already `embarque`, the code throws “Déjà embarqué”.
  2. **Lock document:** The transaction reads `boardingLocks/{reservationId}`. If it exists and the new status is “embarqué”, it throws “Déjà embarqué”.
  3. Only if the lock does not exist does it create `boardingLocks/{reservationId}` and update the reservation.

So the same ticket cannot be set to “embarqué” twice for the same reservation.

### 4.2 Status Change After Scanning

- Yes: `statut` → `embarque`, `statutEmbarquement` → `embarqué`, plus `checkInTime` and audit log. Subsequent scans are rejected by `canEmbarkWithScan` (effective status `embarque`) and by the existing lock.

### 4.3 Edge Cases

- **Offline queue:** Scans can be queued in IndexedDB (`boardingQueue`) and replayed when back online. Replay uses the same `updateStatut(..., "embarqué", ...)`, so the same locking and “Déjà embarqué” checks apply; if the ticket was already embarked (e.g. by another device), the replayed scan fails and can be marked synced to avoid repeated retries.
- **Same code, different trips:** `findReservationByCode` uses context (trip, date, time) to disambiguate; concordance then ensures the reservation matches the selected departure. Using the same QR on a different trip is rejected by concordance, not by reuse per se.

---

## 5. Boarding Data Model

### 5.1 Collections and Paths

- **`boardingLocks`**  
  Path: `companies/{companyId}/agences/{agencyId}/boardingLocks/{reservationId}`  
  Document: `{ reservationId, by, at, tripId, date, heure }`.  
  Written only when setting status to “embarqué” (inside the same transaction as the reservation update). Read in that transaction to prevent double-scan.

- **`boardingLogs`**  
  Path: `companies/{companyId}/agences/{agencyId}/boardingLogs/{autoId}`  
  Document: `{ reservationId, trajetId, departure, arrival, date, heure, result, controleurId, scannedAt }`.  
  One log per scan (embarqué or absent). Used for traceability and possibly reporting.

- **`boardingStats`**  
  Path: `companies/{companyId}/agences/{agencyId}/boardingStats/{tripKey}`  
  `tripKey = departure_arrival_heure_date` (normalized).  
  Document: `{ tripId, date, heure, vehicleCapacity, embarkedSeats, absentSeats, status: "open"|"closed", updatedAt }`.  
  Created when the first “embarqué” is recorded for that trip; then `embarkedSeats` is incremented on each embark. Closed when boarding is closed (e.g. `setBoardingStatsClosed` with `absentSeats`).

### 5.2 Where Written / Read

- **Written:** All three are written from `AgenceEmbarquementPage` inside the `updateStatut` transaction (or in the “close boarding” flow for `boardingStats` status/absentSeats). `boardingStats` helpers live in `src/modules/agence/aggregates/boardingStats.ts`.
- **Read:** `boardingLocks` is read inside the same transaction before creating the lock. `boardingStats` is read in the same transaction for capacity check and to create/increment. `boardingLogs` is written only; no central “boarding dashboard” read of logs was audited (could exist elsewhere).

---

## 6. TripInstance Integration

- **Reservation:** The reservation type and guichet flow support optional `tripInstanceId` on the reservation document.
- **Boarding:** The boarding flow in `AgenceEmbarquementPage` does **not** use `tripInstanceId`. It uses:
  - Selected trip (weekly trip + date + time),
  - Affectation (vehicle, capacity),
  - `boardingStats` keyed by (departure, arrival, heure, date),
  - `boardingLogs` with `trajetId` (weekly trip id), not `tripInstanceId`.

So **TripInstance is not yet integrated into boarding logic**. Capacity and trip matching are based on weekly trip + affectation + date/time, not on TripInstance. Linking reservations to TripInstance is in place for the data model; the boarding UI and rules do not yet reference it.

---

## 7. Boarding Responsibility

- **Who controls boarding:** The boarding page is under the agency area and uses `useAuth`; access is role-based (e.g. agents with boarding permission, typically “Chef d’agence” or a dedicated boarding role).
- **Who can scan:** Any user who can open `AgenceEmbarquementPage` and pass permission checks can run the scanner and trigger `updateStatut`. There is no separate “controller” vs “driver” distinction in the code; the field `controleurId` is set to the current user’s uid.
- **Automation:** No automated scanning; the user must select trip/date and trigger the camera scan. No driver-only or device-bound flow was found.

---

## 8. Operational Flow Today

1. **Reservation** (guichet or online) → payment/confirmation → `confirme` or `paye`.
2. **Ticket:** Client receives a receipt/ticket (with QR `origin/r/receiptNumber`) or views it in “Mes billets”.
3. **At the agency:** Staff open the boarding page, select agency, trip, date (and vehicle/affectation for capacity).
4. **Scan:** Client presents QR; staff scan; scanner decodes URL → `extractCode` → `findReservationByCode` → reservation loaded.
5. **Validation:** Concordance (trip/date/time) and capacity are checked; if already embarked or lock exists, “Déjà embarqué”; otherwise transaction runs: lock created, reservation → “embarqué”, stats and log updated.
6. **After departure:** Manager confirms departure (vehicle “departed”); later, destination can confirm arrival. Boarding itself does not change TripInstance status; that is a separate flow.

The system **stops controlling** after the scan: it records who embarked and when, and prevents double use of the same ticket. It does not enforce that only one device can scan, or that the scanner is at the gate; it trusts that only authorized staff use the boarding page.

---

## 9. Fraud Risk Analysis

### 9.1 Where Ticket Fraud Could Occur

- **Reuse:** Mitigated by `boardingLocks` and status check; same QR cannot be set to “embarqué” twice.
- **Wrong trip:** Mitigated by concordance (date/time/route); a ticket for another departure is rejected.
- **Over-capacity:** Mitigated by `boardingStats` and vehicle capacity in the same transaction.
- **Fake or copied QR:** The QR only carries a reference; the server resolves it to a reservation and checks status/lock. A copied QR would still point to the same reservation, so the second scan would see “Déjà embarqué”. Creating a new reservation with the same `referenceCode` in another trip would be a data/process issue (uniqueness of referenceCode not enforced in this audit).
- **Controller bypass:** Anyone with access to the boarding page can scan. There is no device binding or “official scanner only” mechanism; fraud would require compromising an account with boarding access or using the UI manually (e.g. searching by code and marking embarked without scanning).

### 9.2 QR Reuse

- Same QR scanned twice: second attempt gets “Déjà embarqué” and no second lock or stat update. **Risk: low** for reuse of the same ticket.

### 9.3 Controller Bypass

- Staff could, in theory, look up a reservation by code (if such a search exists in the UI) and trigger “embarqué” without a physical scan, or use another device that has access. The system does not distinguish “scanned” vs “manually marked” in the data model (both write the same lock and status). So **operational trust** is in who has access to the boarding page.

---

## 10. Gaps Before Implementing a “Real” Anti-Fraud Boarding System

1. **TripInstance:** Boarding does not use `tripInstanceId`. For a single source of truth per departure (e.g. one TripInstance per physical departure), boarding should validate and update against TripInstance and optionally write `tripInstanceId` in logs or reservation for analytics.

2. **QR URL when opened in browser:** The encoded URL `/:slug/r/{receiptNumber}` returns 404. If the product goal is “scan to open ticket”, a public route (e.g. `receipt` or a dedicated `r` handler) could resolve to a read-only ticket/receipt view.

3. **Proof of scan:** There is no cryptographic or device-bound proof that a real scan occurred (e.g. signature of scan time + device). Anti-fraud could add “scan proof” or restrict which roles/devices can perform boarding.

4. **Uniqueness of `referenceCode`:** If `referenceCode` can repeat across reservations (e.g. across companies or trips), `findReservationByCode`’s relevance logic might pick the “wrong” reservation in edge cases. Uniqueness constraints or scoping (e.g. by company and trip) would reduce that risk.

5. **Offline replay:** Offline scans are replayed with the same validation; if two devices scan the same ticket offline, both queues might later try to apply “embarqué”; one will succeed and one will get “Déjà embarqué”. Marking as synced on “Déjà embarqué” avoids infinite retry but could hide duplicate-scan attempts from reporting.

6. **Audit of “manual” vs “scan”:** All boarding updates look the same in Firestore (lock + status + log). For anti-fraud, an explicit “source: scan | manual” (and optionally device/session) in `boardingLogs` would help.

7. **Role and device:** No distinction between “controller at gate” and “agency manager” in the boarding flow; tightening roles or binding to a specific device/location would be a product/design choice on top of the current model.

---

## 11. Les vrais problèmes d’architecture (synthèse)

L’audit met en évidence **4 trous d’architecture** à traiter pour un système d’embarquement fiable et anti-fraude.

### Problème 1 — TripInstance non utilisé

Aujourd’hui le scan s’appuie sur :

- `weeklyTrip` + `date` + `time`

et **pas** sur :

- `tripInstanceId`

Conséquences : en cas de **bus remplacé**, **bus retardé** ou **bus supplémentaire**, le scan peut devenir ambigu (plusieurs instances pour le même créneau, ou instance différente du bus réel). Le scan devrait s’ancrer sur **TripInstance**, qui représente le bus réel du jour.

### Problème 2 — Contrôleur peut bypass

Le système suppose que l’agent **scanne toujours**. En réalité, un contrôleur peut **laisser monter quelqu’un sans scanner**. Résultat : bus plein côté terrain, mais le système affiche par exemple 30 passagers → écart entre réalité physique et données, et risque de surréservation non détectée.

### Problème 3 — Pas de preuve cryptographique

Aujourd’hui le log contient :

- `controleurId`, `timestamp`, `reservationId`

Il manque :

- `deviceId`
- `signature` (preuve que le scan a bien eu lieu sur un appareil donné)

Sans cela, un scan peut être **contesté** (qui a validé, depuis quel appareil, et était-ce bien un scan ?).

### Problème 4 — Aucune distinction scan / manuel

Le log ne précise pas si le billet a été validé par :

- **scan QR**, ou  
- **validation manuelle** (saisie de code, clic, etc.)

Or ce sont deux choses différentes du point de vue traçabilité, conformité et anti-fraude. Il faudrait un champ explicite (ex. `source: "scan" | "manual"`) dans les logs et éventuellement dans le lock.

---

**End of audit.** No code changes were made; this document describes the current architecture only. Les §10 et §11 servent de base pour les évolutions (TripInstance, preuve de scan, distinction scan/manuel, réduction du bypass contrôleur).
