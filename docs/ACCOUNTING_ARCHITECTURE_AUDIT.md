# TELIYA — Full Accounting Architecture Audit

This document provides a financial architecture audit: sources of truth, integrations with aggregates, trip profitability, agency/CEO reporting, and recommendations for a full accounting system.

---

## 1. Financial Architecture Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           REVENUE SOURCES                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│  TICKET REVENUE                                                                  │
│  Path: companies/{companyId}/agences/{agencyId}/reservations                     │
│  Fields: montant, tripInstanceId (optional), canal, date, createdAt, statut       │
│  → dailyStats.ticketRevenue (only on session validation; see §2)                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  COURIER REVENUE                                                                  │
│  Path: companies/{companyId}/logistics/data/shipments                             │
│  Fields: transportFee, insuranceAmount, destinationCollectedAmount, paymentStatus │
│  → dailyStats.courierRevenue (on courier session validation)                      │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           COST SOURCES                                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│  FLEET EXPENSES                                                                   │
│  Path: companies/{companyId}/fleetCosts                                          │
│  Fields: vehicleId, type (fuel|maintenance|repair|insurance|salary), amount,       │
│          date (YYYY-MM-DD), agencyId, description                                  │
│  Used in: FleetFinancePage (per-vehicle); NOT in CEO agency profit formula          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  TRIP OPERATIONAL COSTS                                                           │
│  Path: companies/{companyId}/tripCosts                                           │
│  Fields: tripId, agencyId, date, vehicleId (optional), fuelCost, driverCost,       │
│          assistantCost, tollCost, maintenanceCost, otherOperationalCost           │
│  Used in: CEO agency profit, FleetFinancePage (per-vehicle via vehicleId)          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  AGENCY EXPENSES (other)                                                          │
│  Path: companies/{companyId}/agences/{agencyId}/expenses (collectionGroup)        │
│  Used in: CEO agency profit (expensesByAgency)                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AGGREGATES & LEDGERS                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│  dailyStats                                                                       │
│  Path: companies/{companyId}/agences/{agencyId}/dailyStats/{YYYY-MM-DD}           │
│  Fields: ticketRevenue, courierRevenue, totalRevenue, totalPassengers, etc.      │
│  Fed by: session validation (ticket), courier session validation (courier)        │
├─────────────────────────────────────────────────────────────────────────────────┤
│  financialAccounts + financialMovements (Treasury)                                │
│  Path: companies/{companyId}/financialAccounts, financialMovements                │
│  Purpose: Double-entry ledger for account balances (cash, bank, mobile_money).    │
│  Movement types: revenue_cash, revenue_online, expense_payment, etc.             │
│  Reference: referenceType + referenceId (e.g. shift, reservation, expense)       │
│  Not a unified “revenue/expense by type” log (see §8).                            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Ticket Revenues ↔ dailyStats.ticketRevenue

### Source: Reservations

- **Path:** `companies/{companyId}/agences/{agencyId}/reservations`
- **Relevant fields:** `montant`, `tripInstanceId` (optional), `canal`, `date`, `createdAt`, `statut`

### Integration with dailyStats

- **dailyStats.ticketRevenue** is updated only when a **guichet session** is validated:
  - `updateDailyStatsOnSessionValidated()` in `sessionService.ts` and `shiftApi.ts`
  - Called inside the same transaction as shift/session validation; receives total revenue for that session and increments `ticketRevenue` and `totalRevenue` for the session date.

### Gaps

1. **Online reservations (`canal === "en_ligne"`)**  
   Revenue from online paid/confirmed reservations does **not** automatically update dailyStats. CEO and Company Finances pages read **dailyStats** for ticket revenue, so online-only revenue can be missing until a backfill is run.

2. **Backfill**  
   `backfillDailyStatsRevenue.ts` recomputes `ticketRevenue` (and `courierRevenue`) from raw reservations and shipments and writes/merges dailyStats. It uses:
   - Reservations: any document with `montant > 0` and `date` (or `createdAt` fallback); **no filter** on `statut` or `canal`.
   - So backfill can include non-confirmed/non-paid reservations if they have a montant.

### Recommendations

- **Option A:** On reservation status transition to a “revenue” status (e.g. `confirme` / `payé`), update dailyStats (e.g. increment ticketRevenue for reservation `date` and `agencyId`), with idempotency (e.g. one update per reservation per day).
- **Option B:** Keep current design but run backfill regularly (e.g. nightly) and restrict backfill to `statut` in `['confirme','payé']` (and optionally `canal`).
- Use **tripInstanceId** when present for trip-level profitability; keep **trajetId** for backward compatibility.

---

## 3. Courier Revenues ↔ dailyStats.courierRevenue

### Source: Shipments

- **Path:** `companies/{companyId}/logistics/data/shipments`
- **Relevant fields:** `transportFee`, `insuranceAmount`, `destinationCollectedAmount`, `paymentStatus` (and `paymentType`)

### Integration with dailyStats

- **dailyStats.courierRevenue** is updated when a **courier session** is validated:
  - `courierSessionService`: on session VALIDATED, sums `transportFee + insuranceAmount` for shipments in that session with paid status (`PAID_ORIGIN` or `PAID_DESTINATION`), then calls `updateDailyStatsOnCourierSessionValidated(tx, companyId, agencyId, statsDate, courierRevenue)`.

### Consistency

- Backfill uses the same rule: paid shipments only, revenue = `transportFee + insuranceAmount`; date from `createdAt`.
- **destinationCollectedAmount** is used in UI (e.g. CourierReportsPage, CourierPickupPage) but is **not** part of the revenue formula for dailyStats (which uses transportFee + insuranceAmount). If “revenue” should include amounts collected at destination, the definition should be clarified and aligned (dailyStats vs reports).

### Recommendations

- Document whether courier revenue = transportFee + insuranceAmount only, or also destinationCollectedAmount.
- If destinationCollectedAmount is revenue, add it in the validation flow and in backfill and keep one consistent definition.

---

## 4. Fleet Expenses

### Source: fleetCosts

- **Path:** `companies/{companyId}/fleetCosts`
- **Fields (fleetCostsTypes):** `vehicleId`, `type` (fuel | maintenance | repair | insurance | salary), `amount`, `date` (YYYY-MM-DD), `agencyId`, `description`, `createdAt`, `createdBy`

### Usage

- **FleetFinancePage** and **fleetFinanceService**: per-vehicle costs = sum(fleetCosts for vehicle) + sum(tripCosts with that vehicleId). Per-vehicle revenue is derived from reservations linked via tripCosts (agencyId, date, tripId) and `trajetId` in reservations.

### Gap

- **CEO Command Center** agency profit uses:  
  `revenue (dailyStats) − expenses (collectionGroup expenses) − tripCosts − discrepancyDeduction`.  
  **fleetCosts are not included** in this formula. So:
  - Company/agency profit in CEO does not subtract fleet-level costs (fuel, maintenance, etc. at company level).
  - Trip-level costs are captured in tripCosts (and optionally vehicleId there); fleetCosts are a separate layer.

### Recommendations

- Decide whether “agency profit” or “company profit” should include fleetCosts (e.g. by agencyId or company-wide).
- If yes, add a dedicated aggregate or query (e.g. sum of fleetCosts by agencyId/date) and include it in the CEO profit calculation to avoid understating costs.

---

## 5. Trip Operational Costs

### Source: tripCosts

- **Path:** `companies/{companyId}/tripCosts`
- **Fields (tripCosts.ts):** `tripId`, `agencyId`, `date`, `vehicleId` (optional), `fuelCost`, `driverCost`, `assistantCost`, `tollCost`, `maintenanceCost`, `otherOperationalCost`, `createdAt`, `createdBy`  
  (Note: no single `otherCost`; the model uses `otherOperationalCost` and the above breakdown.)

### Usage

- **totalOperationalCost(doc)** sums: fuelCost + driverCost + assistantCost + tollCost + maintenanceCost + otherOperationalCost.
- CEO: tripCosts are summed by agencyId and subtracted in agency profit.
- FleetFinancePage: tripCosts with vehicleId are used for vehicle costs and matched to revenue via (agencyId, date, tripId) ↔ reservations (trajetId).

### Trip profitability (current vs desired)

- **Current:**  
  - Revenue: from reservations aggregated by `trajetId` (and in fleetFinanceService by agencyId + date + trajetId).  
  - Cost: tripCosts by `tripId` (and vehicleId).  
  - **tripId** in tripCosts is not the same as **tripInstanceId** in the new trip instance system. So “trip” in profitability is still the legacy trip/trajet identifier (e.g. weekly trip + date + time), not the Firestore trip instance id.

- **Desired (with trip instances):**  
  - profit = sum(reservations.montant where reservation.tripInstanceId = X) − tripCosts.totalOperationalCost where tripCosts.tripInstanceId = X (or linked by vehicleId + date + time).

### Gaps

1. **tripCosts** have **tripId**, not **tripInstanceId**. To support trip-instance-level profitability, tripCosts should support (or be linked to) **tripInstanceId**.
2. **fleetFinanceService** uses **trajetId** in reservations to join to tripCosts’ **tripId**. With trip instances, reservations carry **tripInstanceId**; the same join logic should be extended to tripInstanceId so that profit = revenue(tripInstanceId) − cost(tripInstanceId/vehicleId).

### Recommendations

- Add optional **tripInstanceId** to tripCosts. When a cost is entered for a concrete departure, set tripInstanceId (and keep tripId for backward compatibility).
- In FleetFinancePage and any trip-profit view, prefer grouping by tripInstanceId when present; fallback to (agencyId, date, tripId) or trajetId for old data.
- Ensure one trip instance has at most one tripCost document (or define rules for multiple cost lines per instance) so that “totalOperationalCost” per trip instance is unambiguous.

---

## 6. Agency Financial Reporting

### What exists

- **Dashboard Agence:**  
  - **ticketRevenue:** Sum of reservations (statut paye/confirme) `montant` for the selected period (from raw reservations, not dailyStats).  
  - **courierRevenue:** Sum of shipments (PAID_ORIGIN / PAID_DESTINATION) `transportFee + insuranceAmount` for the agency and period.  
  - **dailyStats:** Used for the daily breakdown (reservations count, revenue by day) in charts.

- **CEO Command Center (per agency):**  
  - **ticketRevenue / courierRevenue:** From dailyStats (ticketRevenue, courierRevenue, totalRevenue).  
  - **agencyProfit:** `calculateAgencyProfit`: revenueFromDailyStats − expensesTotal − tripCostsTotal − discrepancyDeduction.  
  - **expensesTotal** = sum(collectionGroup expenses for company).  
  - **tripCostsTotal** = sum(tripCosts for company in date range, by agencyId).  
  - **fleetCosts** are not included.

### Gaps

- Agency dashboard does not show **fleetCosts** or **tripCosts** explicitly; profit is not shown at agency level in the same way as in CEO.
- If dailyStats are not updated (e.g. online-only revenue), CEO agency figures are incomplete; agency dashboard is more accurate for tickets because it reads reservations directly.

### Recommendations

- Add an agency-level “financial summary” (e.g. ticketRevenue, courierRevenue, tripCosts, fleetCosts by agency, optional expenses) so that agency view and CEO view use the same definitions.
- Optionally add a small “profit” or “margin” indicator for the agency using the same formula as CEO (with fleetCosts if added).

---

## 7. CEO Financial Reporting

### What exists

- **totalRevenue:** Sum of dailyStats totalRevenue (or ticketRevenue + courierRevenue) over the period.
- **ticketRevenue / courierRevenue:** Sum of dailyStats.ticketRevenue and dailyStats.courierRevenue.
- **companyProfit:** Sum of per-agency profits: for each agency, revenue (from dailyStats) − expenses − tripCosts − discrepancy; then sum over agencies. **fleetCosts are not** in this formula.

### Data flow

- Revenue: **dailyStats only** (no direct sum over reservations/shipments in CEO).
- Costs: **expenses** (collectionGroup), **tripCosts** (company tripCosts by date), **discrepancyDeduction** (shift reports). **fleetCosts:** used only in FleetFinancePage (per vehicle), not in CEO profit.

### Gaps

- If dailyStats are stale (e.g. no session validation for online bookings), CEO revenue is understated.
- fleetCosts are not part of company profit; total cost is understated if fleet costs are material.

### Recommendations

- Align ticket revenue with actual revenue: either feed dailyStats from reservation status changes (and backfill) or add a CEO “revenue from reservations” fallback when dailyStats are missing for a day.
- Include **fleetCosts** in company/agency cost (e.g. by agencyId or company-wide) and document the profit formula clearly (revenue − agency expenses − tripCosts − fleetCosts − discrepancies).

---

## 8. Financial Transaction Logging (Unified Ledger)

### Current state

- **financialMovements** (companies/{companyId}/financialMovements): double-entry ledger for **treasury** (account balances). Each record: fromAccountId, toAccountId, amount, movementType, referenceType, referenceId, agencyId, etc. Used for cash/bank/mobile money movements and idempotency.
- There is **no** single collection that logs every financial event (ticket sale, courier sale, fleet expense, trip cost) in a unified, queryable way for reporting (e.g. “all revenue by type” or “all costs by tripInstanceId”).

### Proposed: financialTransactions (optional)

If a unified, report-oriented log is desired, a separate collection is recommended so that:

- Treasury (financialAccounts + financialMovements) remains the source of truth for balances and double-entry.
- Reporting and analytics can query one place for “all revenue and cost events” without scanning reservations, shipments, tripCosts, fleetCosts, expenses separately.

**Proposed collection:**  
`companies/{companyId}/financialTransactions/{transactionId}`

**Suggested fields:**

| Field         | Type   | Description |
|---------------|--------|-------------|
| type          | string | e.g. TICKET_REVENUE, COURIER_REVENUE, FLEET_COST, TRIP_COST, AGENCY_EXPENSE |
| amount        | number | Signed: positive = revenue, negative = cost (or use direction + amount) |
| agencyId      | string | Agency concerned (optional for company-level) |
| tripInstanceId| string | Optional; for ticket/trip cost linkage |
| vehicleId     | string | Optional; for fleet/trip cost linkage |
| date          | string | YYYY-MM-DD (business date) |
| referenceType | string | reservation, shipment, tripCost, fleetCost, expense |
| referenceId   | string | Document id of source |
| createdAt     | timestamp | |
| createdBy     | string | |

**Integration:** Write a `financialTransactions` document in the same transaction that creates/updates the source (e.g. on reservation confirm, shipment paid, tripCost create, fleetCost create, expense create). Optionally link to financialMovements via referenceId when a movement is created (e.g. revenue_cash).

**Alternative:** Keep current design and build reporting by querying reservations, shipments, tripCosts, fleetCosts, expenses (and dailyStats) separately; add a thin reporting service that aggregates by type, date, agency, tripInstanceId. The proposed collection is for simpler reporting and a single “journal” view.

---

## 9. Summary: Missing Components and Data Inconsistencies

### Missing or incomplete

1. **Ticket revenue → dailyStats:** No automatic update for online reservations (confirme/payé); CEO/Company Finances depend on dailyStats, so online revenue can be missing until backfill.
2. **tripInstanceId in tripCosts:** tripCosts use tripId only; trip-level profit with trip instances requires tripInstanceId (or a stable join key from trip instance to cost).
3. **fleetCosts in CEO profit:** Agency/company profit in CEO does not subtract fleetCosts; only expenses + tripCosts + discrepancies.
4. **Unified financial ledger:** No single “financialTransactions” (or equivalent) log for all revenue/cost events; reporting is done by aggregating multiple collections.
5. **Backfill scope:** Backfill uses any reservation with montant > 0; it does not filter by statut (confirme/payé), so numbers can differ from “confirmed revenue” logic.

### Inconsistencies

1. **Ticket revenue definition:**  
   - Session validation: only guichet session revenue.  
   - Backfill: all reservations with montant (any statut).  
   - Agency dashboard: reservations with statut paye/confirme.  
   → Align on “revenue = confirmed/paid only” and use the same rule in dailyStats update and backfill.

2. **Courier revenue:** dailyStats and backfill use transportFee + insuranceAmount; destinationCollectedAmount is used elsewhere in UI but not in revenue. Define whether it is part of “courier revenue” and align.

3. **Trip identifier:** Reservations have both trajetId (legacy) and tripInstanceId (new). Trip costs use tripId. Profit by “trip” is currently by trajetId/tripId; with trip instances it should be by tripInstanceId where available.

4. **Expenses vs fleetCosts:** “Expenses” in CEO = collectionGroup expenses (agency operating expenses). fleetCosts = vehicle-level costs (company collection). Both are costs but used in different places; fleetCosts not in profit formula.

---

## 10. Recommendations for a Full Accounting System

1. **Single definition of “revenue” and “cost”**  
   - Ticket revenue: e.g. reservations with statut in [confirme, payé] and montant; update dailyStats (or equivalent) on status change and in backfill.  
   - Courier revenue: fix definition (include or exclude destinationCollectedAmount); use same in validation and backfill.

2. **Feed dailyStats from reservation lifecycle**  
   - When a reservation becomes “revenue” (e.g. confirme/payé), increment dailyStats.ticketRevenue for (agencyId, date) with idempotency (e.g. per-reservation id or flag “counted in dailyStats”) so online and guichet revenue are consistent.

3. **tripInstanceId across the stack**  
   - Add tripInstanceId to tripCosts (optional).  
   - Use tripInstanceId (when present) for trip profitability: revenue = sum(reservations.montant where tripInstanceId = X), cost = sum(tripCosts for that instance or vehicleId + date/time).  
   - Keep trajetId/tripId for backward compatibility.

4. **Include fleetCosts in profit**  
   - Add fleetCosts (by agencyId or company) to CEO agency/company profit so that total cost = expenses + tripCosts + fleetCosts + discrepancies (and document the formula).

5. **Optional unified journal**  
   - Introduce `financialTransactions` (or equivalent) for reporting: one row per revenue/cost event (type, amount, agencyId, tripInstanceId, vehicleId, date, referenceType, referenceId). Write in the same transaction as the source event. Use for dashboards and exports without querying all source collections.

6. **Backfill and reconciliation**  
   - Restrict backfill to “revenue” statuses only (e.g. confirme, payé) for ticket; keep paid-only for courier.  
   - Add a simple reconciliation job or view: dailyStats.ticketRevenue vs sum(reservations.montant) by (agency, date) for paid/confirmed, and flag gaps.

7. **Documentation**  
   - Document in one place: data model (paths, fields), who writes dailyStats and when, profit formula (revenue − list of cost types), and how tripInstanceId and vehicleId link reservations, tripCosts, and fleetCosts.

---

*Audit performed on the TELIYA codebase. Paths and field names refer to the current Firestore schema and TypeScript types.*
