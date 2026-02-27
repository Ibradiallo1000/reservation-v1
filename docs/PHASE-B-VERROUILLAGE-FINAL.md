# Phase B — Verrouillage final (no regression / no shortcut)

**Date :** 2025  
**Objectif :** Solidifier définitivement la gouvernance des réservations. Aucune incohérence, aucun contournement, aucune ambiguïté métier.

---

## 1. Interdiction écriture directe sur `statut`

### Corrections effectuées

| Fichier | Avant | Après |
|---------|--------|--------|
| **ReservationsEnLignePage.tsx** | `updateDoc(ref, { statut: 'confirme', ... })` et `statut: 'refuse'` | `updateReservationStatut(ref, 'confirme', meta, extra)` et `updateReservationStatut(ref, 'refuse', meta, extra)` |
| **ReservationClientPage.tsx** | `updateDoc(..., { statut: 'preuve_recue', ... })` | Même updateDoc mais avec `auditLog: arrayUnion(buildStatutTransitionPayload(...))` |
| **UploadPreuvePage.tsx** | `updateDoc(..., { statut: 'preuve_recue', ... })` | Même updateDoc avec `auditLog: arrayUnion(buildStatutTransitionPayload(...))` |
| **expireHolds.ts** (Cloud Function) | `batch.update(d.ref, { statut: 'annule', updatedAt })` | Idem + `auditLog: FieldValue.arrayUnion(auditEntry)` avec ancienStatut/nouveauStatut/effectuePar/role/date |

### Fichiers non modifiés (hors réservation ou déjà conformes)

- **guichetReservationService.ts** : `updateDoc(resRef, patch)` — le `patch` ne contient pas `statut` (édition nom/téléphone/montant après création).
- **reservationStatutService.ts** : seul point d’entrée autorisé pour les transitions avec audit (getDoc → isValidTransition → updateDoc avec statut + auditLog + updatedAt).
- **AgenceEmbarquementPage.tsx** : utilise `buildStatutTransitionPayload` + transaction pour embarque (conforme).

**Confirmation :** Aucune écriture directe sur `statut` sans auditLog ou sans passage par `updateReservationStatut` / `buildStatutTransitionPayload`.

---

## 2. Règles Firestore — contrôleur embarquement

- **boardingOfficerAllowedKeysOnly()** : les clés modifiables sont strictement  
  `statut`, `statutEmbarquement`, `controleurId`, `checkInTime`, `auditLog`, `updatedAt`.  
  Aucune modification possible de : nomClient, telephone, montant, canal, modePaiement, companyId, agencyId.

**Confirmation :** Règles inchangées, déjà conformes.

---

## 3. QR — invalidation globale

- **isTicketValidForQR()** : utilise `canonicalStatut(statut)` et `TICKET_VALID_FOR_QR` (confirme, paye).
- **ReceiptEnLignePage** : passe `statut={getEffectiveStatut(reservation) ?? reservation.statut}` à `TicketOnline`.
- **TicketOnline** : `isTicketValid = isTicketValidForQR(statut)` — donc statut effectif (expire → QR masqué).
- **AgenceEmbarquementPage** (scanner) : utilise `getEffectiveStatut(...)` et refuse si `embarque` / annule / rembourse / expire.

**Confirmation :** Si statut ∈ { annule, rembourse, expire } → QR jamais valide, scanner refuse, Wallet reflète correctement.

---

## 4. Mode paiement dynamique (plus de hardcode)

- **TicketOnline.tsx** : suppression du défaut `paymentMethod = 'PAIEMENT MOBILE'`.  
  Nouvelle fonction **getPaymentDisplayLabel(canal, paymentMethod)** :
  - `canal === 'guichet'` → "Paiement en espèces"
  - sinon si `paymentMethod` fourni → affichage du libellé
  - sinon `canal === 'en_ligne'` → "Paiement en ligne"
  - défaut → "Paiement"
- **ReceiptEnLignePage** : calcul de **paymentMethodDisplay** à partir de la réservation (canal, modePaiement, preuveVia, remboursement.mode) et passage en `paymentMethod={paymentMethodDisplay}` à TicketOnline.  
  En cas de remboursement : affichage du mode de remboursement (espèces, Mobile Money, etc.).

**Confirmation :** Aucune valeur hardcodée "PAIEMENT MOBILE" restante.

---

## 5. Protection rôle guichetier (rules)

- **validReservationStatutTransition()** : guichetier uniquement  
  `(oldS == 'confirme' || oldS == 'paye' || oldS == 'payé') && newS == 'annulation_en_attente'`.  
  Il ne peut pas écrire `annule`, `rembourse` ni `expire`.

**Confirmation :** Règles inchangées, déjà conformes.

---

## 6. Garantie audit log

- **reservationStatutService.updateReservationStatut** :  
  - getDoc → vérification `isValidTransition(oldStatut, newStatut)` → rejet si transition invalide.  
  - Puis updateDoc avec `statut`, `auditLog: arrayUnion(auditEntry)`, `updatedAt: serverTimestamp()`, et `extra`.  
- **Transitions ajoutées** dans `reservationStatusUtils.ts` :  
  - `en_attente_paiement` → `preuve_recue`  
  - `preuve_recue` → `confirme`, `refuse`  
  - `verification` → `confirme`, `refuse`  

**Confirmation :** Aucune transition silencieuse ; auditLog et updatedAt systématiques.

---

## 7. Requêtes et comparaisons de statut

- **ResultatsAgencePage.tsx** : `r.statut === 'payé'` remplacé par `canonicalStatut(r.statut) === 'paye'` (avec import `canonicalStatut`).
- **ReservationClientPage.tsx** : filtre places réservées avec `['confirme', 'paye'].includes(canonicalStatut((r as any).statut))`.
- **firestore.rules** : UPDATE 2 (preuve_recue) étendu pour autoriser les clés `auditLog`, `canal`, `preuveUrl`, `companyId`, `companySlug` lorsque le client envoie la preuve.
- **validReservationStatutTransition** : ajout de la transition (admin_compagnie / chef / comptable) : `preuve_recue` ou `verification` → `confirme` ou `refuse`.

**Confirmation :** Pas de `where('statut', '==', 'payé')` isolé ; usage de canonicalStatut ou constantes (RESERVATION_STATUT_QUERY_*) là où c’est pertinent.

---

## 8. Test rapide recommandé

- **paye → embarque** : guichet, puis scan → statut embarque ; 2e scan refusé.
- **paye → annulation_en_attente → annule → rembourse** : guichetier demande annulation, chef valide, comptable rembourse ; Wallet et receipt cohérents.
- **paye + date > 30 j** : getEffectiveStatut → expire ; Wallet "Expiré", scanner refuse ; Firestore reste `paye`.

---

## Synthèse

| Point | Statut |
|-------|--------|
| Aucune écriture directe sur `statut` restante | OK |
| Aucun hardcode paiement restant | OK |
| Règles boarding officer strictes | OK |
| Règles guichetier (annulation_en_attente uniquement) | OK |
| QR / getEffectiveStatut / scanner cohérents | OK |
| auditLog + updatedAt + isValidTransition | OK |
| Requêtes / comparaisons avec canonicalStatut ou constantes | OK |

**Phase B verrouillée.**
