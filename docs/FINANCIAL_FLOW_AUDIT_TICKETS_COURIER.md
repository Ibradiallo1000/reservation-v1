# Audit complet du flux financier — Billets & Courrier (TELIYA)

**Date :** 2025-03-10  
**Objectif :** Vérifier si les ventes de billets et le revenu courrier suivent la même logique de contrôle de trésorerie.  
**Périmètre :** Analyse uniquement — aucune modification d’architecture.

---

## 1. Flux financier actuel — Billets (référence)

### 1.1 Modèle de session guichet (tickets)

Le système utilise **deux modèles de session** pour le guichet :

| Modèle | Collection / entité | Cycle de vie | Rôle |
|--------|---------------------|--------------|------|
| **Shifts (postes)** | `shifts` + `shiftReports` | PENDING → ACTIVE/PAUSED → CLOSED → VALIDATED | Workflow opérationnel : ouverture par l’agent, activation par le comptable, ventes, clôture, validation. |
| **Cash sessions** | `cashSessions` (type GUICHET) | OPEN → CLOSED → VALIDATED | Réconciliation espèces : expectedBalance (incrémenté à chaque vente), countedBalance à la clôture, discrepancy. |

**Flux des ventes guichet :**

1. **Création réservation** (`guichetReservationService.createGuichetReservation`)  
   - Réservation liée à un **shift** (`shiftId` / `createdInSessionId`).  
   - Si montant > 0 : `addToExpectedBalance(..., 'GUICHET', montant)` → met à jour la **cash session** ouverte (expectedBalance/expectedCash).  
   - `updateDailyStatsOnReservationCreated` → incrémente uniquement **totalPassengers** et **totalSeats** dans `dailyStats` (pas de revenu).

2. **Clôture du poste**  
   - Shift → CLOSED, rapport éventuel dans `shiftReports`.

3. **Validation comptable (chemin principal)**  
   - **AgenceComptabilitePage** appelle `validateSessionByAccountant` (`sessionService.ts`).  
   - Dans la même transaction :  
     - Shift et rapport → status VALIDATED.  
     - **`updateDailyStatsOnSessionValidated(tx, ..., totalRevenue)`** → `dailyStats.ticketRevenue` et `totalRevenue` incrémentés.  
     - **`updateAgencyLiveStateOnSessionValidated`** → compteurs live (closedPendingValidationCount, etc.).  
     - **`recordMovementInTransaction`** → mouvement trésorerie (revenue_cash) vers le compte caisse agence.

**Conclusion billets :**  
Le revenu billets n’est écrit dans **dailyStats** qu’au moment de la **validation du poste** par le comptable (sessionService), pas à la vente. Les cash sessions (GUICHET) servent au suivi expected/counted et à la détection d’écarts ; leur **validation** (`validateCashSession`) **ne met pas à jour dailyStats** (voir risques ci‑dessous).

### 1.2 Billets en ligne

- **Source :** `reservationStatutService` — transition réservation vers `confirme`/`paye`.  
- **Écriture dailyStats :** `addTicketRevenueToDailyStats` (transaction) dès que le statut devient payé, avec garde‑fou `ticketRevenueCountedInDailyStats` pour éviter les doubles incréments.  
- **Pas de session guichet** : le revenu en ligne ne passe pas par shift ni cash session ; il est directement agrégé dans `dailyStats`.

---

## 2. Flux financier actuel — Courrier

### 2.1 Modèle de session courrier

| Modèle | Collection / entité | Cycle de vie | Rôle |
|--------|---------------------|--------------|------|
| **Courier session (logistics)** | `courierSessions` (sous `agences/{agencyId}`) | PENDING → ACTIVE → CLOSED → VALIDATED | Workflow : création par l’agent, activation par le comptable, envois créés, clôture, validation. |
| **Cash sessions** | `cashSessions` (type COURRIER) | OPEN → CLOSED → VALIDATED | Optionnel : `addToExpectedBalance(..., 'COURRIER', amount)` à la création d’envoi payé à l’origine. |

**Flux des envois courrier :**

1. **Création envoi** (`createShipment`)  
   - Envoi lié à une **courier session** ACTIVE (`sessionId`).  
   - Si `paymentStatus === 'PAID_ORIGIN'` : `addToExpectedBalance(..., 'COURRIER', transportFee + insuranceAmount)` → met à jour une **cash session** ouverte (type COURRIER) si elle existe.  
   - Aucune écriture dans `dailyStats` à ce stade.

2. **Clôture session courrier** (`closeCourierSession`)  
   - Session → CLOSED.  
   - **expectedAmount** calculé à partir des envois de la session (transportFee + insuranceAmount), pas stocké par entrée de ledger.

3. **Validation comptable** (`validateCourierSession`)  
   - Session CLOSED → VALIDATED.  
   - **`updateDailyStatsOnCourierSessionValidated(tx, ..., courierRevenue)`** → `dailyStats.courierRevenue` et `totalRevenue` incrémentés (envois avec paymentStatus PAID_ORIGIN/PAID_DESTINATION).  
   - **Aucun** appel à `agencyLiveState` (pas d’équivalent `updateAgencyLiveStateOnCourierSessionValidated`).

**Conclusion courrier :**  
Le revenu courrier n’est écrit dans **dailyStats** qu’à la **validation de la session courrier** par le comptable. La logique session (PENDING → ACTIVE → CLOSED → VALIDATED) est alignée sur le guichet, et l’agrégation vers `dailyStats` est bien prévue à la validation.

---

## 3. Agrégation et consolidation

### 3.1 Structure dailyStats

- **Chemin :** `companies/{companyId}/agences/{agencyId}/dailyStats/{date}` (date = YYYY-MM-DD).  
- **Champs utilisés pour le revenu :**  
  - `ticketRevenue`  
  - `courierRevenue`  
  - `totalRevenue` (doit refléter ticket + courrier ; des incréments séparés sont utilisés dans le code).

### 3.2 Qui alimente dailyStats

| Événement | Méthode | Champs dailyStats |
|-----------|---------|-------------------|
| Création réservation (guichet) | `updateDailyStatsOnReservationCreated` | totalPassengers, totalSeats uniquement |
| Validation poste guichet | `updateDailyStatsOnSessionValidated` | ticketRevenue, totalRevenue, validatedSessions |
| Paiement en ligne (confirme/paye) | `addTicketRevenueToDailyStats` | ticketRevenue, totalRevenue |
| Validation session courrier | `updateDailyStatsOnCourierSessionValidated` | courierRevenue, totalRevenue |

### 3.3 Utilisation dans les dashboards

- **CEO (CEOCommandCenterPage) :**  
  - Lit `collectionGroup("dailyStats")` (filtré companyId + période).  
  - Calcule **globalTicketRevenue**, **globalCourierRevenue**, **globalTotalRevenue**.  
  - Affiche dans les blocs : CA total, Billets, Courrier, Liquidités, etc.  
  - **Top agences** par revenu total (dailyStats), pas de détail ticket/courrier par agence dans ce bloc.  
  - Alertes sur **cash sessions** avec écart (listClosedCashSessionsWithDiscrepancy).

- **Finances compagnie (CompanyFinancesPage) :**  
  - Même source `dailyStats`.  
  - **Par agence :** today, week, month, **ticket**, **courier** (sumTicket, sumCourier, sumTotal).  
  - Revenus du jour / semaine / mois avec répartition billets / courrier.

- **Dashboard agence (DashboardAgencePage) :**  
  - Charge `dailyStats` pour la période ; affiche ticketRevenue, courierRevenue, total.

- **Backfill :**  
  - `backfillDailyStatsRevenue` permet de recalculer ticketRevenue/courierRevenue à partir des réservations et des envois et d’écrire les dailyStats (utile pour historique ou correction).

**Conclusion :**  
La consolidation **ticketRevenue**, **courierRevenue**, **totalRevenue** est prévue et utilisée dans dailyStats, CEO, et pages finances. Le courrier est bien inclus dans la même structure que les billets.

---

## 4. Monitoring en temps réel

### 4.1 agencyLiveState (temps réel agence)

- **Chemin :** `companies/{companyId}/agences/{agencyId}/agencyLiveState/current`.  
- **Mis à jour uniquement pour le guichet :**  
  - `updateAgencyLiveStateOnSessionOpened` (sessionService, activation poste).  
  - `updateAgencyLiveStateOnSessionClosed` (sessionService, clôture poste).  
  - `updateAgencyLiveStateOnSessionValidated` (sessionService, validation poste).  
- **Aucune mise à jour** pour les sessions courrier (ouverture, clôture, validation).  
- **Conséquence :** Les indicateurs “sessions actives” / “en attente de validation” au niveau agence et CEO reflètent **uniquement les postes guichet**, pas les postes courrier.

### 4.2 Live sales / activité par agence

- **CompanyFinancesPage (liveSalesByAgency) :**  
  - Construit à partir de **shifts** (non validés) + **reservations** (payées, liées à ces shifts, date du jour).  
  - **Uniquement billets** : pas de prise en compte des sessions courrier ni des envois.  
- **AgenceComptabilitePage :**  
  - Affiche les postes guichet (actifs, en pause, clôturés) et les sessions courrier (PENDING, ACTIVE, CLOSED) dans des sections dédiées.  
  - Pas de “carte d’activité live” unifiée type “Guichet 1 : X billets, Y FCFA ; Courrier : Z envois, W FCFA”.

**Conclusion :**  
Le monitoring “live” (agencyLiveState, liveSalesByAgency) est **asymétrique** : guichet oui, courrier non. Il n’existe pas de vue temps réel unifiée “comptoirs billets + bureaux courrier” avec revenus et volumes par poste.

---

## 5. CEO — tableau de bord global

- **Sources :** dailyStats (collectionGroup), agencyLiveState, shifts non validés + réservations (pendingRevenue), cash sessions avec écart, trésorerie, etc.  
- **Revenus :**  
  - CA période = somme des dailyStats (totalRevenue).  
  - Billets / Courrier = sommes des champs ticketRevenue et courierRevenue.  
- **Par agence :**  
  - Top agences par revenu total (dailyStats).  
  - Pas de tableau détaillé “par agence : ticket / courrier / total” sur la page CEO (détail présent sur CompanyFinancesPage).  
- **Écarts caisse :**  
  - listClosedCashSessionsWithDiscrepancy (toutes agences) → alertes si écart dépasse le seuil (maxCashDiscrepancy).  
  - discrepancyReports (shiftReports) utilisés pour déduction dans le calcul du profit agence (discrepancyDeductionByAgency).

**Conclusion :**  
Le CEO a bien une vue consolidée billets / courrier / total et des alertes sur les écarts de caisse. La cohérence avec dailyStats est respectée pour l’affichage global.

---

## 6. Cohérence des sessions

### 6.1 Billets

- **Postes (shifts) :** obligatoires pour vendre au guichet ; validation via `validateSessionByAccountant` → dailyStats + trésorerie + agencyLiveState.  
- **Cash sessions (GUICHET) :** optionnelles ; chaque vente peut incrémenter expectedBalance ; **validateCashSession** ne met **pas** à jour dailyStats (seulement mouvement trésorerie + statut VALIDATED).  
- **Risque :** Si une agence utilisait uniquement les cash sessions (sans passer par la validation des postes via sessionService), le revenu billets ne serait **pas** enregistré dans dailyStats.

### 6.2 Courrier

- **Courier sessions (logistics) :** obligatoires pour créer des envois (session ACTIVE).  
  - Validation via `validateCourierSession` → dailyStats (courierRevenue, totalRevenue).  
- **Cash sessions (COURRIER) :** optionnelles ; création d’envoi PAID_ORIGIN appelle `addToExpectedBalance(..., 'COURRIER')` si une cash session est ouverte.  
  - **validateCashSession** ne met pas à jour dailyStats ; le revenu courrier ne vient que de **validateCourierSession**.

**Conclusion :**  
Pour les deux canaux, le revenu dans dailyStats dépend de la **validation de la session métier** (poste guichet ou session courrier), pas de la validation des cash sessions. Les cash sessions servent au contrôle expected/counted et aux alertes CEO.

---

## 7. Détection des écarts (expected vs déclared)

### 7.1 Guichet (postes)

- **Shift / shiftReport :** à la validation, expectedCash (totalCash/amount) vs receivedCashAmount → computedDifference.  
- **Stockage :** validationAudit (receivedCashAmount, computedDifference), discrepancyType (manquant/surplus).  
- **CEO :** discrepancyReports (shiftReports validés avec écart) → discrepancyDeductionByAgency pour le calcul du profit.  
- **AgenceComptabilitePage :** validation avec “espèces reçu” → alerte si écart ≠ 0.

### 7.2 Guichet / Courrier (cash sessions)

- **Clôture :** totalCounted − totalExpected → discrepancy (cashSessionService).  
- **Validation :** validateCashSession enregistre le mouvement trésorerie (counted) mais **pas** dailyStats.  
- **CEO :** listClosedCashSessionsWithDiscrepancy → liste des sessions (tous types) avec discrepancy ≠ 0 ; seuil maxCashDiscrepancy pour alertes.

### 7.3 Courrier (courier sessions)

- **Clôture :** expectedAmount calculé depuis les envois (transportFee + insuranceAmount).  
- **Validation :** validatedAmount (saisi par le comptable) → difference = validatedAmount − expectedAmount.  
- **Affichage :** CouriersReportsPage et AgenceComptabilitePage affichent attendu / différence.  
- **Pas d’agrégation** des écarts courrier dans les indicateurs CEO (discrepancyDeductionByAgency est basé sur shiftReports, pas sur courier sessions).

**Conclusion :**  
Le mécanisme “attendu vs déclaré” existe pour les deux (postes guichet et sessions courrier), mais les **écarts courrier** ne remontent pas dans le même indicateur CEO que les écarts guichet (shiftReports).

---

## 8. Points de non‑uniformité et risques

### 8.1 Revenus non enregistrés dans dailyStats

- **validateCashSession** (GUICHET ou COURRIER) : n’appelle ni updateDailyStatsOnSessionValidated ni updateDailyStatsOnCourierSessionValidated.  
  - **Risque :** utilisation exclusive des cash sessions pour “valider” sans passer par les sessions métier → CA manquant dans dailyStats et dans les vues CEO/Finances.

- **validateShiftWithDeposit** (ValidateShiftModal) : met à jour uniquement le shift (validated, declaredDeposit, difference) ; **n’appelle pas** updateDailyStatsOnSessionValidated ni trésorerie.  
  - **Risque :** si ce chemin était utilisé pour valider les postes au lieu de validateSessionByAccountant, aucun revenu ne serait envoyé à dailyStats ni en trésorerie.  
  - **État actuel :** AgenceComptabilitePage utilise bien validateSessionByAccountant (sessionService), pas validateShiftWithDeposit.

### 8.2 Monitoring temps réel asymétrique

- **agencyLiveState** : uniquement postes guichet (ouvertures, clôtures, validations).  
  - Pas de “activeCourierSessionsCount” / “closedCourierPendingValidationCount” dans ce document.  
- **liveSalesByAgency** : uniquement shifts + réservations (billets).  
  - Pas d’équivalent “live” pour les envois courrier par agence.  
- **Conséquence :** impossible d’afficher une “carte d’activité live” unifiée (ex. “Guichet 1 : 24 billets, 144 000 FCFA ; Courrier : 12 envois, 12 000 FCFA”) sans ajout de logique et de champs.

### 8.3 Deux modèles de session pour un même canal

- **Guichet :** shifts (workflow + dailyStats à la validation) + cash sessions (expected/counted, optionnel).  
- **Courrier :** courier sessions (workflow + dailyStats à la validation) + cash sessions COURRIER (expected/counted, optionnel).  
- **Risque de confusion :** deux façons de “fermer” ou “valider” (session métier vs cash session) ; si les procédures ne sont pas claires, risque de double comptage ou de CA non enregistré.

### 8.4 Écarts courrier vs guichet dans le reporting CEO

- **CEO :**  
  - Écarts guichet : pris en compte via discrepancyReports (shiftReports) dans discrepancyDeductionByAgency et calcul du profit.  
  - Écarts courrier : non agrégés dans les mêmes indicateurs (difference sur courier sessions non utilisée dans les blocs CEO).  
- **Conséquence :** les écarts de caisse courrier ne réduisent pas le “profit agence” dans la vue CEO comme le font les écarts guichet.

### 8.5 Billets en ligne

- Revenu enregistré dans dailyStats **sans** session physique (addTicketRevenueToDailyStats à la transition paye).  
- Pas de contrôle “expected vs counted” par session pour l’en ligne ; traçabilité par réservation et par statut.

---

## 9. Synthèse des écarts par objectif

| Objectif | Billets | Courrier | Uniforme ? |
|----------|---------|----------|------------|
| Session contrôlée (agent → comptable) | Shifts + optionnel cash session | Courier sessions + optionnel cash session | Oui (modèle équivalent) |
| Revenu dans dailyStats à la validation | Oui (validateSessionByAccountant) | Oui (validateCourierSession) | Oui |
| Répartition ticketRevenue / courierRevenue / totalRevenue | Oui | Oui | Oui |
| CEO : CA global et par type | Oui | Oui | Oui |
| Trésorerie (mouvement revenue_cash) à la validation | Oui (sessionService) | Non (validateCourierSession ne crée pas de mouvement) | **Non** |
| agencyLiveState (sessions actives / en attente) | Oui | Non | **Non** |
| Live sales par agence (temps réel) | Oui (shifts + reservations) | Non | **Non** |
| Détection écart expected vs déclaré | Oui (shift + cash session) | Oui (courier session) | Oui |
| Écarts intégrés dans indicateurs CEO (profit, alertes) | Oui (shiftReports) | Non (sessions courrier) | **Non** |
| Validation cash session met à jour dailyStats | Non | Non | N/A (aucun des deux) |

---

## 10. Recommandations (sans changement d’architecture)

1. **Documenter clairement** le flux unique souhaité :  
   - Pour le guichet : validation des **postes** (sessionService) comme seule source de revenu dailyStats et trésorerie ; rôle des cash sessions (contrôle expected/counted) sans impact sur dailyStats.  
   - Pour le courrier : validation des **sessions courrier** comme seule source de revenu dailyStats ; idem pour cash sessions COURRIER.

2. **Ne pas utiliser** validateShiftWithDeposit comme unique validation des postes (ou l’enrichir pour appeler updateDailyStatsOnSessionValidated + trésorerie + agencyLiveState) pour éviter que le CA guichet ne soit absent de dailyStats.

3. **Envisager** d’étendre agencyLiveState (ou un équivalent) aux sessions courrier (actives, clôturées en attente) pour un monitoring temps réel unifié.

4. **Envisager** un indicateur “live” courrier par agence (envois créés dans des sessions actives, montant) et une carte d’activité unifiée “guichet + courrier” côté agence / CEO.

5. **Envisager** d’enregistrer un mouvement trésorerie (revenue_cash) à la validation d’une session courrier, comme pour les postes guichet, pour aligner la traçabilité trésorerie.

6. **Envisager** d’intégrer les écarts des sessions courrier (difference) dans les indicateurs CEO (profit par agence, alertes), de la même façon que les écarts guichet (shiftReports).

7. **Clarifier** si les cash sessions (GUICHET/COURRIER) doivent rester purement “contrôle caisse” (expected/counted) sans alimenter dailyStats, ou si une double validation (session métier + cash session) doit à terme mettre à jour dailyStats (auquel cas il faudrait éviter les doubles comptages).

---

**Fin du rapport d’audit.** Aucune modification n’a été apportée au code ; ce document sert de base pour décider des évolutions à mettre en œuvre.
