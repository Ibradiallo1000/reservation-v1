# Agency Cash Control System — Implementation Summary

## 1. Files Created

| File | Purpose |
|------|--------|
| `src/modules/agence/cashControl/cashSessionTypes.ts` | Types: CASH_SESSION_COLLECTION, CASH_SESSION_TYPE (GUICHET, COURRIER), CASH_SESSION_STATUS (OPEN, CLOSED, VALIDATED, REJECTED), CashSessionDoc, CashSessionDocWithId. |
| `src/modules/agence/cashControl/cashSessionService.ts` | Service: openCashSession, getOpenCashSession, addToExpectedBalance, closeCashSession, validateCashSession, rejectCashSession, listCashSessions, getCashSession, listClosedCashSessionsWithDiscrepancy. |
| `src/modules/agence/cashControl/CashSessionsPage.tsx` | Agency UI: list open/closed sessions, open session (opening balance + type GUICHET/COURRIER), close session (counted balance, discrepancy computed), validate/reject (accountant). |
| `docs/CASH_CONTROL_IMPLEMENTATION.md` | This summary. |

---

## 2. Files Updated

| File | Changes |
|------|--------|
| `src/modules/compagnie/treasury/types.ts` | Added `cash_session` to REFERENCE_TYPES for financial movement idempotency. |
| `firestore.rules` | Added `match /cashSessions/{sessionId}` under agences: read/list/create for same company; update only for agentId == request.auth.uid or agency_accountant / admin_compagnie / admin_platforme. |
| `firestore.indexes.json` | Two composite indexes on `cashSessions`: (agentId, type, status); (status, openedAt desc). |
| `src/modules/agence/services/guichetReservationService.ts` | After creating a guichet reservation, calls `addToExpectedBalance(companyId, agencyId, userId, 'GUICHET', montant)` for open GUICHET cash session. |
| `src/modules/logistics/services/createShipment.ts` | When paymentStatus === PAID_ORIGIN, calls `addToExpectedBalance(companyId, originAgencyId, createdBy, 'COURRIER', transportFee + insuranceAmount)` for open COURRIER cash session. |
| `src/constants/routePermissions.ts` | Added `cashControl: ["guichetier", "agentCourrier", "agency_accountant", "chefAgence", "admin_compagnie"]`. |
| `src/AppRoutes.tsx` | Lazy import CashSessionsPage; route `/agence/cash-sessions` with ProtectedRoute allowedRoles cashControl. |
| `src/modules/agence/pages/AgenceShellPage.tsx` | Nav item "Contrôle caisse" with icon CircleDollarSign, path `/agence/cash-sessions`. |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Import listClosedCashSessionsWithDiscrepancy and CashSessionDocWithId; state cashDiscrepancyList; load closed sessions with discrepancy in main load; SectionCard "Contrôle caisse agences" with total agency cash, session discrepancy count, total discrepancy amount. |

---

## 3. Firestore Schema

### Collection

`companies/{companyId}/agences/{agencyId}/cashSessions/{sessionId}`

### Document fields

| Field | Type | Description |
|-------|------|-------------|
| agentId | string | User id of the agent who opened the session. |
| type | string | GUICHET \| COURRIER. |
| openedAt | timestamp | When the session was opened. |
| closedAt | timestamp \| null | When the session was closed (set on close). |
| openingBalance | number | Cash amount at opening (entered by agent). |
| expectedBalance | number | openingBalance + sum of cash transactions (ticket sales, courier payments). |
| countedBalance | number \| null | Cash amount entered by agent at closure. |
| discrepancy | number \| null | countedBalance - expectedBalance (set on close). |
| status | string | OPEN \| CLOSED \| VALIDATED \| REJECTED. |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| validatedAt | timestamp \| null | Set when accountant validates. |
| validatedBy | string \| null | User id of validator. |
| rejectionReason | string \| null | Set when accountant rejects. |

---

## 4. Session Flow

- **Opening:** Agent opens a session with `openingBalance`; `expectedBalance = openingBalance`, `status = OPEN`. Only one OPEN session per (agentId, type) per agency.
- **During session:** Each guichet ticket sale (guichetReservationService) and each courier payment at origin (createShipment PAID_ORIGIN) calls `addToExpectedBalance(companyId, agencyId, agentId, type, amount)` for the open session of that agent/type.
- **Closure:** Agent closes with `countedBalance`; system sets `closedAt`, `countedBalance`, `discrepancy = countedBalance - expectedBalance`, `status = CLOSED`. Only the agent who opened can close.
- **Validation:** Accountant validates → `recordMovementInTransaction` (revenue_cash to agency_cash, referenceType cash_session, referenceId sessionId), then `status = VALIDATED`, `validatedAt`, `validatedBy`. Reject → `status = REJECTED`, `rejectionReason`, `validatedBy`.

---

## 5. Security

- **Close:** Enforced in service: `data.agentId !== userId` → error. Firestore rules allow update if `resource.data.agentId == request.auth.uid` or accountant/admin.
- **Validate/Reject:** Only accountants (agency_accountant, admin_compagnie) can validate/reject; enforced in UI (buttons) and can be enforced in rules by restricting status transition to VALIDATED/REJECTED to those roles.

---

## 6. UI Pages

| Page | Route | Description |
|------|--------|-------------|
| **CashSessionsPage** | `/agence/cash-sessions` | Agency: metrics (open sessions, closed pending, total discrepancy); table of sessions (type, agent, balances, discrepancy, status); open session (opening balance + GUICHET/COURRIER); close session (counted balance); validate/reject (accountant). |
| **CEO Command Center** | (existing) | New section "Contrôle caisse agences": total agency cash (sum of agency_cash accounts), sessions with discrepancy count, total discrepancy amount. |

---

## 7. Services Created (summary)

- **openCashSession(companyId, agencyId, agentId, type, openingBalance)** → sessionId  
- **getOpenCashSession(companyId, agencyId, agentId, type)** → session or null  
- **addToExpectedBalance(companyId, agencyId, agentId, type, amount)**  
- **closeCashSession(companyId, agencyId, sessionId, countedBalance, userId)**  
- **validateCashSession(companyId, agencyId, sessionId, userId, userRole)**  
- **rejectCashSession(companyId, agencyId, sessionId, userId, rejectionReason?)**  
- **listCashSessions(companyId, agencyId, options?)**  
- **getCashSession(companyId, agencyId, sessionId)**  
- **listClosedCashSessionsWithDiscrepancy(companyId, agencyIds)** (for CEO)
