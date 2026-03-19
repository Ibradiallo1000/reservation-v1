# AUDIT TELIYA — FLUX AGENCE

**Date** : 2025-03  
**Objectif** : Vérifier où le flux casse entre  
**VENTE → SESSION → VALIDATION → CAISSE → RAPPORTS**

---

## 1. AUDIT VENTES (GUICHET) → cashTransactions

### Règle attendue
- Chaque réservation vendue (payée) a une cashTransaction associée.
- Lien : `reservation.id` → `cashTransaction.reservationId`.

### Constat
- **Création** : `guichetReservationService.createGuichetReservation()` crée la réservation puis appelle `createCashTransaction()` avec `reservationId: newId`, `sessionId: params.sessionId` (lignes 271-286). En cas de succès, `updateDoc(newRef, { cashTransactionId: cashTxId })`.
- **Anomalie possible** : Si `createCashTransaction()` **lance une exception**, le `catch` logue l’erreur mais **ne remonte pas** : la réservation existe déjà, **sans** `cashTransactionId`, et **aucune** cashTransaction n’est créée. Donc **réservation sans cashTransaction** possible.
- **Contrôle absent** : Aucun code ne vérifie qu’une réservation payée a bien une cashTransaction (pas de vérification 1:1 ni de réconciliation).

### Verdict
**KO** (risque) : Lien 1:1 non garanti en cas d’échec de `createCashTransaction`. Pas de détection des réservations orphelines ni des cashTransactions sans réservation.

---

## 2. AUDIT SESSION (SHIFT) / shiftReports

### Vérifications demandées
- totalAmount / totalTickets corrects
- agencyId présent
- status = CLOSED ou VALIDATED_AGENCY
- Comparaison avec somme des `cashTransactions.sessionId`

### Constat
- **Source des totaux** : `sessionService.closeSession()` calcule les totaux **uniquement à partir des réservations** (`where('shiftId', '==', params.shiftId)`, `where('canal', '==', CANAL_GUICHET)`). Il **ne lit pas** les cashTransactions.
- **shiftReport** : Rempli avec `billets`, `montant`, `totalRevenue`, `totalCash`, `totalDigital`, `details` (par trajet), `agencyId`, `status: 'pending_validation'` puis mis à jour en `validated_agency` / `validated`. Pas de champ `totalAmount` (on a `montant` et `totalRevenue`).
- **Comparaison avec cashTransactions** : **Aucune** fonction ne récupère les cashTransactions par `sessionId` / `sourceSessionId` et ne compare à `shiftReport.montant`. Donc **aucun contrôle** shiftReport vs somme(cashTransactions).

### Verdict
**KO** (incohérence de source) : shiftReport = somme(**réservations**), pas somme(**cashTransactions**). En cas d’échec création cashTransaction, shiftReport peut être supérieur à la caisse réelle.

---

## 3. AUDIT FERMETURE SESSION (POPUP)

### Vérifications demandées
- Le popup recalcule les données OU lit un state cohérent.
- Résultat attendu : `popup.total === somme(cashTransactions)`.

### Constat
- Après correction récente : le popup utilise le **retour** de `closeSession()` (`CloseSessionTotals`), converti en lignes via `detailsToSummaryRows(result.details)`. Donc **même source que le shiftReport** = **réservations** (pas cashTransactions).
- Donc **popup.total === somme(réservations du shift)**, pas nécessairement somme(cashTransactions). Si une réservation n’a pas eu de cashTransaction, le popup affiche quand même son montant.

### Verdict
**KO** (écart par rapport à l’objectif) : Popup aligné sur le **rapport de session** (réservations), pas sur la **caisse** (cashTransactions). Pour avoir popup = somme cashTransactions, il faudrait calculer les totaux à partir des cashTransactions liées à la session.

---

## 4. AUDIT VALIDATION COMPTABLE

### Vérifications demandées
- Quand status = VALIDATED_AGENCY : validatedAt rempli, validationAudit présent, montant cohérent.
- **CRITIQUE** : Un financialMovement est-il créé ?

### Constat
- **validateSessionByAccountant** (CLOSED → VALIDATED_AGENCY) :
  - Met à jour shift + report : `status: VALIDATED_AGENCY`, `validatedAt`, `validationAudit` (receivedCashAmount, computedDifference, etc.).
  - **Ne crée pas** de financialMovement (commentaire explicite : *« Pas de mouvement trésorerie ici : réservé à la validation chef comptable »*).
- **validateSessionByHeadAccountant** (VALIDATED_AGENCY → VALIDATED) :
  - Crée un **financialMovement** via `recordMovementInTransaction` : `toAccountId = agencyCashId`, `movementType: 'revenue_cash'`, `referenceType: 'shift'`, `referenceId: shiftId`, `sourceType: "guichet"`, `sourceSessionId: params.shiftId`.
  - Montant = `receivedCashAmount` (validationAudit) ou totalRevenue.

### Verdict
**OK** pour validatedAt / validationAudit / cohérence montant.  
**OK** pour financialMovement **uniquement à la validation chef comptable** (niveau compagnie), pas à la validation comptable agence (choix de conception).

---

## 5. AUDIT CAISSE (financialMovements)

### Vérifications demandées
- Mouvements après validation, type = entry, accountType = agency_cash, sourceSessionId présent.
- somme(financialMovements) = montant validé.

### Constat
- Mouvement créé dans **validateSessionByHeadAccountant** : `toAccountId` = `agencyCashAccountId(agencyId)` (= compte `agency_cash`), `entryType` dérivé en "credit", `sourceSessionId: params.shiftId`, `sourceType: "guichet"`.
- Le document financialMovement ne stocke pas `accountType` ; le compte cible est bien le compte agency_cash (id `{agencyId}_agency_cash`).
- Un seul mouvement par shift (idempotence via `uniqueReferenceKey('shift', shiftId)`).

### Verdict
**OK** : Mouvement créé après validation chef, compte agency_cash crédité, sourceSessionId présent.

---

## 6. AUDIT COMPTES (financialAccounts)

### Vérifications demandées
- currentBalance mis à jour, accountType correct.

### Constat
- `recordMovementInTransaction` fait `increment(amount)` sur le compte cible (`toRef`). Aucune mise à jour de solde en dehors de ce module.
- Compte agency_cash créé / utilisé avec `accountType: "agency_cash"` (financialAccounts).

### Verdict
**OK** : Solde mis à jour uniquement via mouvements ; accountType cohérent.

---

## 7. AUDIT RAPPORTS AGENCE

### Vérifications demandées
- Source utilisée (shiftReports vs reservations), filtre status.
- Problèmes fréquents : mauvais statut (validated vs validated_agency), mauvais champ (status vs statut).

### Constat
- **Guichet (AgenceGuichetPage)** – "Sessions en attente de validation" :
  - Utilise **shiftReports** avec `where("userId", "==", user.uid)` et **`accountantValidated`** / **`managerValidated`**.
  - Or **sessionService** ne met **jamais** `accountantValidated: true` ni `managerValidated: true` sur le document shiftReport lors des validations. Il met uniquement `status: 'validated_agency'` / `validated` et `validationLevel` / `validatedByAgencyAt` / `validatedByCompanyAt`.
  - Donc les rapports restent avec `accountantValidated: false` et `managerValidated: false` **même après validation**. La liste "Sessions en attente de validation" est donc **faussée** (filtre sur des champs non maintenus).
- **Comptabilité (AgenceComptabilitePage)** :
  - Utilise la collection **shifts** (pas shiftReports), filtres `status === 'closed'` et `status === 'validated'`.
  - Le cycle de vie réel est : `closed` → `validated_agency` → `validated`. La page **ne filtre pas** sur `validated_agency`. Donc les shifts en `validated_agency` ne sont ni dans `closedShifts` ni dans `validatedShifts` → **invisibles** dans l’UI jusqu’à validation chef.

### Verdict
**KO** : (1) shiftReports : champs `accountantValidated` / `managerValidated` non mis à jour → mauvais filtres guichet. (2) Comptabilité : statut `validated_agency` non géré → sessions validées agence disparaissent de la liste.

---

## 8. AUDIT RÉCEPTION (ALERTE)

### Vérifications demandées
- Quand session = CLOSED : visible en réception, badge affiché.

### Constat
- "Réceptions de caisse à valider" = `closedShifts.filter(s => s.status === 'closed')`. Les shifts avec status CLOSED sont bien affichés. Après validation comptable agence, status passe à `validated_agency` donc le shift sort de `closedShifts` et n’apparaît plus en réception. Comportement cohérent.

### Verdict
**OK** : Session CLOSED visible en réception ; disparition après validation agence.

---

## 9. AUDIT CHEF AGENCE

### Vérifications demandées
- Statut attendu (validated_manager ?), filtres UI, données en base.

### Constat
- Le cycle défini est VALIDATED_AGENCY (comptable agence) puis VALIDATED (chef comptable). Il n’y a pas de statut "validated_manager" distinct.
- **Rupture** : Les shifts en **validated_agency** ne sont dans **aucune** liste de l’AgenceComptabilitePage (ni closed, ni validated). Donc le "chef" (ou toute vue agence) ne voit pas explicitement "validé agence, en attente validation compagnie". Les shifts réapparaissent seulement quand ils passent en `validated`.

### Verdict
**KO** : Statut `validated_agency` non exposé dans l’UI ; pas de liste dédiée "Validé agence (en attente chef)".

---

## 10. AUDIT CHAÎNE COMPLÈTE (UNE SESSION)

### Tracé
1. **Réservation** : créée avec `shiftId` / `createdInSessionId`. Si `createCashTransaction` réussit → cashTransaction avec `reservationId`, `sessionId` / `sourceSessionId`.
2. **Clôture** : `closeSession()` lit les **réservations** du shift → remplit shiftReport (montant, billets, details) et met le shift en CLOSED. **Aucune lecture** des cashTransactions.
3. **Popup** : Affiche le retour de `closeSession()` = même totaux que shiftReport (réservations).
4. **Validation comptable agence** : Shift → VALIDATED_AGENCY, report → status `validated_agency`. **Aucun** financialMovement. shiftReport : **accountantValidated** reste false.
5. **Validation chef** : financialMovement créé (agency_cash crédité, sourceSessionId). Shift → VALIDATED, report → status `validated`. shiftReport : **managerValidated** n’est pas mis à true.
6. **Rapports** : Guichet filtre sur accountantValidated/managerValidated (non maintenus). Comptabilité filtre sur status closed/validated → validated_agency ignoré.

### Verdict
**Plusieurs points de rupture** (voir livrable ci-dessous).

---

## LIVRABLE SYNTHÈSE

| # | Point | Statut | Commentaire |
|---|--------|--------|-------------|
| 1 | Ventes → cashTransactions | **KO** | Risque réservation sans cashTransaction si createCashTransaction échoue ; pas de contrôle 1:1. |
| 2 | Session cohérente (shiftReport vs caisse) | **KO** | shiftReport = somme réservations ; pas de comparaison avec somme(cashTransactions.sessionId). |
| 3 | Validation → mouvement créé | **OK** | Mouvement créé à la validation **chef** (VALIDATED_AGENCY → VALIDATED), pas à la validation agence. |
| 4 | Mouvement → caisse impactée | **OK** | Compte agency_cash crédité dans la même transaction. |
| 5 | Rapports lisent bonne source | **KO** | Guichet : filtres accountantValidated/managerValidated non maintenus. Comptabilité : validated_agency absent des filtres. |
| 6 | **POINT DE RUPTURE EXACT** | **Plusieurs** | Voir ci-dessous. |

---

## POINTS DE RUPTURE EXACTS (À TRAITER AVANT CORRECTIONS CIBLÉES)

1. **R1 – Réservation sans cashTransaction**  
   - **Où** : `guichetReservationService.createGuichetReservation()` après `createCashTransaction()` (catch sans remontée).  
   - **Effet** : Réservation en base sans lien caisse ; shiftReport et popup incluent ce montant, la caisse non.

2. **R2 – Source des totaux session / popup**  
   - **Où** : `closeSession()` et popup utilisent uniquement les **réservations** (shiftId).  
   - **Effet** : Totaux session et popup ≠ somme(cashTransactions) dès qu’il y a une résa sans cash ou une cash sans résa.

3. **R3 – shiftReports : accountantValidated / managerValidated**  
   - **Où** : `sessionService.validateSessionByAccountant` et `validateSessionByHeadAccountant` ne mettent jamais à jour `accountantValidated` ni `managerValidated` sur le document shiftReport.  
   - **Effet** : "Sessions en attente de validation" (guichet) repose sur des champs non maintenus → liste incohérente.

4. **R4 – Statut validated_agency invisible en comptabilité**  
   - **Où** : `AgenceComptabilitePage` : filtres `closedShifts` (status === 'closed') et `validatedShifts` (status === 'validated'). Aucune liste pour `validated_agency`.  
   - **Effet** : Les sessions validées par le comptable agence disparaissent de l’UI jusqu’à validation chef.

---

**Règle respectée** : Aucune correction appliquée ; uniquement identification des points de rupture.
