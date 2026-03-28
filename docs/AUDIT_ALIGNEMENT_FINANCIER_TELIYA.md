# 🧾 AUDIT GLOBAL — ALIGNEMENT FINANCIER COMPLET TELIYA

**Règle : analyse du code réel uniquement, aucune modification.**

**Objectif :** Vérifier que tous les rôles qui manipulent de l’argent sont alignés autour du système unique **payment → financialMovement**.

---

## 🧩 PARTIE 1 — CARTOGRAPHIE DES ACTIONS PAR RÔLE

### 1. Guichetier

| Question | Réponse (code) |
|----------|----------------|
| **Pages accessibles** | `routePermissions.guichet` → Guichet agence (`AgenceGuichetPage`). Landing `/agence/guichet`. |
| **Actions financières** | Crée des réservations via `guichetReservationService.createGuichetReservation` → appelle **createCashTransaction**, **createPayment** (status `confirmed`), **createMovementFromPayment**. |
| **Données visibles** | Ses ventes (réservations de sa session), poste de caisse. |

**Fichiers :** `src/modules/agence/services/guichetReservationService.ts` (L277–324), `routePermissions.ts` (guichet).

---

### 2. Agent courrier

| Question | Réponse (code) |
|----------|----------------|
| **Pages accessibles** | `routePermissions.courrier` → pages courrier (sessions, colis, réception). `routePermissions.cashControl` → Caisse. Pas d’accès CompanyAccountantLayout. |
| **Actions financières** | **Ne crée ni Payment ni cashTransaction.** Encaissement colis = statut shipment (`PAID_ORIGIN` / `PAID_DESTINATION`). La **validation de session courrier** (par le comptable agence) appelle `validateCourierSession` → crée un **financialMovement** (`referenceType: "courier_session"`) **sans** passer par une entité Payment. |
| **Données visibles** | Ses sessions, colis, montants attendus. Pas d’accès direct aux `payments` ni `financialMovements`. |

**Fichiers :** `src/modules/logistics/services/courierSessionService.ts` (L240–263), `createShipment.ts` (paymentStatus sur shipment uniquement). **Aucun appel à `createPayment` ni `createCashTransaction` dans le module courrier.**

---

### 3. Opérateur digital

| Question | Réponse (code) |
|----------|----------------|
| **Pages accessibles** | `routePermissions.digitalCash` → `/compagnie/:companyId/digital-cash` (`DigitalCashPage`). Landing explicite vers `digital-cash` (`AppRoutes.tsx` L227–231). |
| **Actions financières** | Liste les **payments** `pending` via `getPaymentsByStatus(companyId, "pending")`. **Valide** → `confirmPayment` (qui met à jour le payment et appelle **createMovementFromPayment**). **Rejette** → `rejectPayment`. **Ne crée pas** de financialMovement lui‑même : c’est `confirmPayment` dans `paymentService.ts` qui le fait. |
| **Données visibles** | Uniquement les payments en attente (online). Pas d’accès aux cashTransactions, shiftReports, ni à la comptabilité globale. |

**Fichiers :** `src/modules/compagnie/finances/pages/DigitalCashPage.tsx`, `src/services/paymentService.ts` (confirmPayment → createMovementFromPayment).

---

### 4. Comptable agence

| Question | Réponse (code) |
|----------|----------------|
| **Pages accessibles** | `routePermissions.comptabilite` → `/agence/comptabilite` (`AgenceComptabilitePage`). Contrôle, Réceptions, Rapports, Caisse, Réconciliation, Courrier. |
| **Actions financières** | Active/pause/continue sessions guichet ; **validateSessionByAccountant** (réception caisse, cashReceipts) ; **validateCourierSession** (→ financialMovement `courier_session`) ; initie dépense/versement/payable. **Réconciliation** calculée à partir de **getCashTransactionsByLocation** (cashTransactions), pas de payments. |
| **Données visibles** | cashTransactions (par agence/date), shiftReports, courierSessions, rapports détaillés, caisse agence. |

**Fichiers :** `AgenceComptabilitePage.tsx` (L1113–1163 : `getCashTransactionsByLocation`), `sessionService.ts`, `courierSessionService.ts`.

---

### 5. Chef d’agence

| Question | Réponse (code) |
|----------|----------------|
| **Pages accessibles** | `agenceShell`, `validationsAgence`, `receiptGuichet`, `courrier`, `cashControl`, `comptabilite`, etc. → Dashboard (`ManagerCockpitPage`), opérations, finances, trésorerie, équipe, rapports. |
| **Actions financières** | Active des sessions guichet (`activateSession`). Pas de création directe de payment/cashTransaction/financialMovement. Consultation et pilotage. |
| **Données visibles** | **getAgencyStats** (networkStatsService) → repose sur **getCashTransactionsByDateRange** (cashTransactions) et réservations pour totaux. dailyStats, liveState, shifts. **Pas d’accès explicite** à la collection `payments` ni lecture directe de `financialMovements` dans ManagerCockpitPage. |

**Fichiers :** `ManagerCockpitPage.tsx`, `networkStatsService.ts` (getCashTransactionsByDateRange pour revenus).

---

### 6. Comptable compagnie

| Question | Réponse (code) |
|----------|----------------|
| **Pages accessibles** | `CompanyAccountantLayout` → Vue Globale, **Réservations en ligne** (ReservationsEnLignePage), Finances, Compta, Dépenses, Trésorerie, Rapports, Paramètres, **Caisse digitale** (DigitalCashPage). |
| **Actions financières** | Sur **ReservationsEnLignePage** : validation preuve → `transitionToConfirmedOrPaidWithDailyStats` + **createCashTransaction** + **confirmPayment** (si payment pending). Sur **DigitalCashPage** : comme opérateur digital (confirmPayment / rejectPayment). Peut initier dépenses/versements/payables (trésorerie). **Ne valide pas** les sessions guichet (validation chef = admin_compagnie). |
| **Données visibles** | Vue globale, réservations en ligne, finances (CompanyFinancesPage → useGlobalMoneyPositions, getUnifiedCompanyFinance, getNetworkSales). Les dashboards utilisent encore **cashTransactions** (via GlobalMoneyPositionsContext avec `USE_PAYMENTS_AS_SOURCE = false`) et **financialMovements** (centralised). |

**Fichiers :** `ReservationsEnLignePage.tsx` (L765–809), `DigitalCashPage.tsx`, `CompanyFinancesPage.tsx`, `GlobalMoneyPositionsContext.tsx`.

---

### 7. CEO (admin_compagnie)

| Question | Réponse (code) |
|----------|----------------|
| **Pages accessibles** | `CompagnieLayout` → command-center (CEOCommandCenterPage), finances, reservations-reseau, flotte, **comptabilite/validation** (CompagnieComptabiliteValidationPage), audit-controle, agences, paramètres. Accès aussi à `digitalCash` et tout le CompanyAccountantLayout. |
| **Actions financières** | **Validation chef comptable** des sessions guichet → `validateSessionByHeadAccountant` (sessionService) → crée **financialMovement** (`referenceType: "shift"`) avec idempotence. Approbations paiements fournisseurs, vision globale. **Ne valide pas** les paiements en ligne individuels en tant que flux principal (peut passer par Caisse digitale comme les autres rôles accounting). |
| **Données visibles** | Toutes les données compagnie. CEOCommandCenterPage et CompanyFinancesPage utilisent **useGlobalMoneyPositions** (donc cashTransactions ou financialMovements selon `USE_PAYMENTS_AS_SOURCE`), **getNetworkSales** / **getNetworkCash** (financialConsistencyService → **cashTransactions**), **getUnifiedCompanyFinance** (unifiedFinanceService → **cashTransactions**), listClosedCashSessionsWithDiscrepancy, listCourierSessionsWithDiscrepancy. |

**Fichiers :** `CEOCommandCenterPage.tsx`, `CompanyFinancesPage.tsx`, `sessionService.ts` (validateSessionByHeadAccountant), `financialConsistencyService.ts`, `unifiedFinanceService.ts`.

---

## 🧩 PARTIE 2 — FLUX D’ARGENT (CRITIQUE)

### Guichetier

| Question | Réponse |
|----------|---------|
| Crée-t-il un **payment** ? | **Oui.** `createPayment` avec `status: 'confirmed'`, `channel: 'guichet'` (`guichetReservationService.ts` L297–306). |
| Crée-t-il une **cashTransaction** ? | **Oui.** `createCashTransaction` avant le payment (L277–295). |
| Crée-t-il un **financialMovement** ? | **Oui**, indirectement : après `createPayment`, appel à **createMovementFromPayment** (L310–321). |

**Conclusion :** Flux guichet aligné **payment → financialMovement**, avec double écriture legacy (cashTransaction) conservée.

---

### Agent courrier

| Question | Réponse |
|----------|---------|
| Encaissement crée-t-il un **payment** ? | **Non.** Aucun appel à `createPayment` dans le module courrier. Encaissement = mise à jour du statut du shipment (paymentStatus). |
| Lien colis ↔ **payment** existe ? | **Non.** Pas d’entité Payment pour les colis. |
| **financialMovement** généré ? | **Oui**, mais **sans Payment** : à la validation de la session courrier par le comptable agence, `validateCourierSession` crée un financialMovement `referenceType: "courier_session"`, `referenceId: sessionId`. |

**Conclusion :** Flux courrier **non aligné** avec la règle « tout argent = payment → financialMovement ». C’est **session courrier → financialMovement** direct.

---

### Opérateur digital

| Question | Réponse |
|----------|---------|
| Valide-t-il des **payments** ? | **Oui.** `confirmPayment` / `rejectPayment` sur la page Caisse digitale. |
| Crée-t-il des **financialMovements** ? | **Non.** C’est `confirmPayment` (paymentService) qui appelle `createMovementFromPayment`. L’opérateur ne fait que valider le payment. |

**Conclusion :** Conforme. Il ne crée pas de financialMovement lui‑même ; le flux est payment → confirmPayment → financialMovement.

---

### Comptable agence

| Question | Réponse |
|----------|---------|
| Utilise-t-il **cashTransactions** ou **payments** ? | **cashTransactions** pour la réconciliation (`getCashTransactionsByLocation`) et la vue caisse. Pas de lecture directe de la collection `payments` dans AgenceComptabilitePage. |
| Validation cohérente avec **financialMovements** ? | Pour le **guichet** : la validation de session (validateSessionByAccountant) crée des cashReceipts et met à jour le shift ; le **financialMovement** pour la centralisation est créé par le **chef comptable** (validateSessionByHeadAccountant), pas par le comptable agence. Pour le **courrier** : validateCourierSession crée directement un financialMovement (courier_session). Donc partiellement cohérent (courrier → movement), guichet → movement seulement après validation chef. |

---

### Chef d’agence

| Question | Réponse |
|----------|---------|
| Voit-il tous les **payments** de son agence ? | **Non.** ManagerCockpitPage et getAgencyStats n’utilisent pas la collection `payments`. Ils utilisent **getAgencyStats** (networkStatsService) qui s’appuie sur **cashTransactions** et réservations. |
| Voit-il uniquement son périmètre ? | **Oui** (agence via `user.agencyId`). |
| Accède-t-il à **financialMovements** ? | Pas en lecture directe dans le code du dashboard manager. Les totaux lui viennent via getAgencyStats (cashTransactions) et dailyStats. |

---

### Comptable compagnie

| Question | Réponse |
|----------|---------|
| Valide-t-il encore des paiements individuels ? | **Oui.** Sur ReservationsEnLignePage (résa par résa : createCashTransaction + confirmPayment) et sur DigitalCashPage (validation payments pending). |
| Utilise-t-il **financialMovements** ? | Via **useGlobalMoneyPositions** : si `USE_PAYMENTS_AS_SOURCE = true`, le contexte lit les financialMovements (referenceType payment) ; sinon cashTransactions. Actuellement **USE_PAYMENTS_AS_SOURCE = false** → les totaux « encaissés » viennent des **cashTransactions**. Il voit aussi la partie « centralised » qui est toujours basée sur financialMovements. |

---

### CEO

| Question | Réponse |
|----------|---------|
| Valide-t-il uniquement les flux globaux ? | **Non.** Il valide les **sessions guichet** (validateSessionByHeadAccountant) une par une, ce qui crée un financialMovement par shift. Il n’a pas de validation « globale » unique. |
| Accède-t-il aux **financialMovements** ? | **Oui**, via useGlobalMoneyPositions (centralised = mouvements vers comptes centraux), listClosedCashSessionsWithDiscrepancy, listCourierSessionsWithDiscrepancy, et via les services qui alimentent CEOCommandCenterPage / CompanyFinancesPage. Les indicateurs « cash » utilisent encore **getNetworkCash** / **getUnifiedCompanyFinance** → **cashTransactions**. |

---

## 🧩 PARTIE 3 — VÉRITÉ FINANCIÈRE

| Question | Réponse (code) |
|----------|----------------|
| **Tous les encaissements passent-ils par payment ?** | **Non.** Encaissements **guichet** et **online** (résa) passent par Payment. Encaissements **courrier** ne passent pas par Payment : validation session → financialMovement direct. |
| **Tous les payments confirmés créent-ils un financialMovement ?** | **Oui.** `confirmPayment` appelle `createMovementFromPayment` (paymentService.ts L125). Idempotence via `findMovementByReference`. |
| **Existe-t-il des encaissements hors payment ?** | **Oui.** (1) **Courrier** : montant validé en session → financialMovement `courier_session` sans Payment. (2) **Validation chef comptable (shift)** : revenue_cash → financialMovement `shift` sans Payment (les ventes guichet ont déjà un payment + movement par vente ; le movement « shift » est une centralisation supplémentaire de la caisse session). |
| **Existe-t-il des financialMovements sans payment ?** | **Oui.** (1) `referenceType: "shift"` (validation chef comptable). (2) `referenceType: "courier_session"` (validation session courrier). (3) Mouvements trésorerie (versements, dépenses, payables) avec d’autres referenceType. |

---

## 🧩 PARTIE 4 — SÉPARATION DES RESPONSABILITÉS

| Vérification | Constat |
|--------------|---------|
| Un rôle **opérationnel** fait-il de la **comptabilité** ? | **Guichetier** : crée ventes + payment + movement → opérationnel, pas de comptabilité. **Opérateur digital** : valide payments → opérationnel, pas de comptabilité globale. **Courrier** : pas de création de payment/movement (c’est le comptable qui valide la session). **Comptable agence** : réception, validation sessions, réconciliation → contrôle local + opération de réception, pas de décision globale. **Comptable compagnie** : validation paiements en ligne + dépenses/trésorerie → exécution comptable, pas de validation « chef ». **CEO** : validation chef comptable (sessions) → décisionnel. Globalement la séparation est respectée, avec un flou : le comptable compagnie fait à la fois validation opérationnelle (paiements en ligne) et accès à la vue globale. |
| Un rôle **comptable** fait-il de l’**opérationnel** ? | **Comptable compagnie** valide les paiements en ligne (ReservationsEnLignePage et DigitalCashPage) → oui, opérationnel de validation. C’est voulu (et partagé avec operator_digital pour la Caisse digitale). |

**Attendu :** Opérationnel = guichetier, courrier, opérateur digital ; Contrôle local = chef d’agence ; Comptabilité = comptables ; Décision = CEO. **Conforme** pour guichetier, courrier, opérateur digital, chef d’agence, CEO. Comptable agence = contrôle local. Comptable compagnie = exécution + vision globale (pas de validation chef).

---

## 🧩 PARTIE 5 — VISIBILITÉ DES DONNÉES

| Rôle | Attendu | Code |
|------|---------|------|
| **Guichetier** | Uniquement ses ventes | Ventes liées à sa session (shiftId / createdInSessionId). Pas de lecture directe de payments/financialMovements dans l’UI guichet. |
| **Courrier** | Uniquement ses encaissements | Sessions et colis par agent. Pas de collection payments. |
| **Opérateur digital** | Payments online uniquement | DigitalCashPage : `getPaymentsByStatus(companyId, "pending")` → tous les pending de la compagnie (pas de filtre agence dans le code actuel). **À noter :** liste globale des payments pending, pas limitée à une agence. |
| **Chef d’agence** | Uniquement son agence | getAgencyStats avec agencyId, dailyStats par agence. Conforme. |
| **Comptable agence** | Données agence | getCashTransactionsByLocation(companyId, agencyId), shifts/courrier de l’agence. Conforme. |
| **Comptable compagnie** | Global | Vue globale, toutes agences. Conforme. |
| **CEO** | Global + validation | Toutes les données, validation chef. Conforme. |

**Rupture potentielle :** DigitalCashPage charge tous les payments `pending` de la compagnie ; si l’on souhaite restreindre l’opérateur digital à une agence, il faudrait filtrer par agencyId (non implémenté).

---

## 🧩 PARTIE 6 — COHÉRENCE DES DASHBOARDS

| Question | Réponse |
|----------|---------|
| Les dashboards financiers utilisent-ils **financialMovements** ? | **Partiellement.** GlobalMoneyPositionsContext : « centralised » = financialMovements (toAccountId in central accounts). Pour les **encaissements** (cash paid), si `USE_PAYMENTS_AS_SOURCE = true` → financialMovements (referenceType payment) ; sinon → **cashTransactions** (actuellement le cas). |
| Les dashboards opérationnels utilisent-ils **payments** ? | **Caisse digitale** : oui (payments pending). **Réservations en ligne** : réservations + cashTransactions + confirmPayment (payment). Les indicateurs « revenus / encaissements » des pages CEO / CompanyFinances / Manager viennent de **getNetworkSales** (réservations), **getNetworkCash** / **getUnifiedCompanyFinance** (cashTransactions), **getAgencyStats** (cashTransactions). Donc les dashboards opérationnels/stratégiques utilisent encore **cashTransactions** comme source encaissements, pas payments. |
| Y a-t-il mélange des deux ? | **Oui.** GlobalMoneyPositionsContext lit à la fois cashTransactions (ou financialMovements si flag), shiftReports (validated_agency), financialMovements (centralised), et **payments** (confirmés) en parallèle. financialConsistencyService et unifiedFinanceService utilisent **uniquement cashTransactions** pour les encaissements. D’où **deux sources** pour les totaux « encaissés » selon la page et le flag. |

---

## 🧩 PARTIE 7 — RUPTURES

### R1 — Courrier : encaissement hors Payment

- **Description :** Les encaissements courrier ne passent pas par l’entité Payment. Un financialMovement `courier_session` est créé à la validation de session sans Payment associé.
- **Cause :** Le module courrier n’a jamais été branché sur Payment ; il repose sur shipment (paymentStatus) + validation session → movement.
- **Fichiers :** `courierSessionService.ts` (validateCourierSession), `createShipment.ts`, absence de `createPayment` dans logistics.
- **Impact :** Impossible de tracer « 1 FCFA courrier = 1 payment → 1 movement ». Réconciliation payments/movements ne couvre pas le courrier.

---

### R2 — Double source encaissements (cashTransactions vs payments/movements)

- **Description :** Les totaux « encaissés » peuvent venir de cashTransactions (networkStatsService, financialConsistencyService, unifiedFinanceService, GlobalMoneyPositionsContext avec USE_PAYMENTS_AS_SOURCE = false) ou de financialMovements (GlobalMoneyPositionsContext avec USE_PAYMENTS_AS_SOURCE = true) et payments (paymentsConfirmedTotal).
- **Cause :** Migration progressive : ancienne source cashTransactions conservée, nouvelle source payments + financialMovements ajoutée en parallèle ; feature flag USE_PAYMENTS_AS_SOURCE = false.
- **Fichiers :** `GlobalMoneyPositionsContext.tsx`, `financialConsistencyService.ts`, `unifiedFinanceService.ts`, `networkStatsService.ts`, `featureFlags.ts`.
- **Impact :** Risque d’écarts affichés entre pages (ex. Caisse digitale vs Réconciliation agence) si les données ne sont pas parfaitement synchronisées. Plusieurs sources de vérité pour « encaissements ».

---

### R3 — Validation chef comptable (shift) → financialMovement sans Payment

- **Description :** validateSessionByHeadAccountant crée un financialMovement `referenceType: "shift"` pour centraliser la caisse de la session. Chaque vente guichet a déjà un payment + financialMovement (referenceType payment). Donc une même caisse session peut être reflétée à la fois par N movements « payment » (par vente) et 1 movement « shift » (à la validation).
- **Cause :** Conception historique : centralisation par session (shift) en plus des mouvements par payment. Idempotence sur movement shift évite le double, mais la règle « tout argent = payment → financialMovement » n’est pas respectée pour ce movement « shift » (il n’y a pas de Payment pour la session entière).
- **Fichiers :** `sessionService.ts` (validateSessionByHeadAccountant), `financialMovements.ts`.
- **Impact :** Si l’on considère que la seule source comptable doit être payment → financialMovement, le movement « shift » est un doublon conceptuel avec les N movements « payment » des ventes de la session. Blocage double centralisation déjà en place (hasMovementReferenceInTransaction).

---

### R4 — ReservationsEnLignePage : double écriture (cashTransaction + payment)

- **Description :** À la validation d’une résa en ligne, la page crée une cashTransaction **et** appelle confirmPayment (→ financialMovement). Donc chaque encaissement en ligne génère à la fois une entrée cashTransactions et un payment confirmé + financialMovement.
- **Cause :** Migration progressive : ancien flux (cashTransaction) conservé, nouveau flux (payment → movement) ajouté en parallèle.
- **Fichiers :** `ReservationsEnLignePage.tsx` (L773–809).
- **Impact :** Cohérent avec la règle payment → financialMovement, mais double source (cashTransaction + payment/movement) pour le même fait. Jusqu’à désactivation de cashTransactions, les deux existent.

---

### R5 — Dashboards (CEO, CompanyFinances, Manager) basés sur cashTransactions

- **Description :** getNetworkSales, getNetworkCash, getUnifiedCompanyFinance, getAgencyStats s’appuient sur cashTransactions (et réservations / dailyStats), pas sur payments ni financialMovements pour les totaux encaissements.
- **Cause :** Ces services n’ont pas été migrés vers payments/financialMovements ; USE_PAYMENTS_AS_SOURCE reste false.
- **Fichiers :** `financialConsistencyService.ts`, `unifiedFinanceService.ts`, `networkStatsService.ts`, `CompanyFinancesPage.tsx`, `CEOCommandCenterPage.tsx`, `ManagerCockpitPage.tsx`.
- **Impact :** La « vérité » affichée pour les encaissements reste cashTransactions. Pour avoir une seule source payment → financialMovement, il faudrait activer USE_PAYMENTS_AS_SOURCE et faire évoluer ces services vers financialMovements (et éventuellement payments) et retirer la dépendance à cashTransactions.

---

## 🧩 PARTIE 8 — TEST FINAL

### 1. Peut-on tracer chaque FCFA ?

- **Guichet :** Oui : vente → payment (confirmed) → financialMovement (referenceType payment). En plus : cashTransaction (legacy) et, après validation chef, financialMovement (shift).
- **En ligne :** Oui : résa → payment (pending puis confirmed) → financialMovement (referenceType payment). En plus : cashTransaction à la validation (legacy).
- **Courrier :** Non : pas de Payment ; seulement session → financialMovement (courier_session). Le FCFA courrier n’est pas tracé via payment.

**Réponse :** Pas pour 100 % des FCFA : le flux courrier n’est pas tracé via Payment.

---

### 2. Un rôle fait-il deux choses incompatibles ?

- **Comptable compagnie** : validation des paiements en ligne (opérationnel) + accès vue globale (comptabilité). C’est assumé (partage avec operator_digital pour la caisse digitale).
- **CEO** : validation chef comptable (décisionnel) + vision globale. Pas d’incompatibilité.
- Aucun rôle ne crée à la fois des écritures « opérationnelles » et des écritures « comptables » de façon contradictoire.

**Réponse :** Non, pas d’incompatibilité identifiée entre rôles.

---

### 3. Existe-t-il plusieurs sources de vérité ?

- **Encaissements :** Oui. cashTransactions (paidAt, status paid) et payments (confirmed) + financialMovements (referenceType payment). Selon les pages et le feature flag, l’une ou l’autre est utilisée.
- **Centralisation (comptes centraux) :** financialMovements (toAccountId in central accounts) — une source.
- **Revenus « validés » (sessions) :** shiftReports (validationAudit), dailyStats, et financialMovements (shift / courier_session).

**Réponse :** Oui. Plusieurs sources de vérité pour les encaissements (cashTransactions vs payments/financialMovements), jusqu’à bascule complète sur payment → financialMovement et retrait de cashTransactions.

---

## 🎯 SYNTHÈSE — RÈGLE « TOUT ARGENT = payment → financialMovement »

| Flux | Conforme ? | Commentaire |
|------|------------|-------------|
| **Guichet (vente)** | Oui | createPayment (confirmed) + createMovementFromPayment. Double écriture cashTransaction conservée. |
| **En ligne (validation)** | Oui | confirmPayment → createMovementFromPayment. Double écriture cashTransaction conservée. |
| **Courrier** | Non | Aucun Payment ; validation session → financialMovement courier_session. |
| **Validation chef (shift)** | Non | financialMovement shift sans Payment (centralisation session). |
| **Trésorerie (dépenses, versements, payables)** | N/A | Mouvements hors « encaissement client » ; pas censés passer par Payment. |

**Contournements à la règle :**

1. **Courrier** : encaissement → financialMovement sans Payment.
2. **Validation chef comptable** : movement « shift » sans Payment (centralisation caisse session).
3. **Affichage des totaux** : beaucoup de dashboards utilisent encore cashTransactions comme source encaissements au lieu de payments/financialMovements.

---

**Document généré par analyse statique du code. Aucune modification du code n’a été effectuée.**
