# Plan de test complet — Phase B (SPARK)

**Objectif :** Valider toute la chaîne billet en conditions réelles.

**Références code :**
- Statut effectif / expiration : `src/utils/reservationStatusUtils.ts` (`getEffectiveStatut`, `getWalletDisplayState`, `isTicketValidForQR`, `canBoard`)
- Portefeuille : `src/modules/compagnie/public/pages/ClientMesBilletsPage.tsx` (sections À venir, Voyages effectués, En vérification, Annulés / Remboursés)
- Embarquement : `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` (scan, refus "Déjà embarqué")
- Règles Firestore : `firestore.rules` (transitions `validReservationStatutTransition`, `boardingOfficerAllowedKeysOnly`)

---

## 1. Test guichet — cas standard

**Précondition :** Utilisateur guichetier connecté.

**Actions :**
- [ ] Créer une réservation au guichet (trajet, date, client, paiement).
- [ ] Choisir **canal : guichet**, **modePaiement : espèces**.
- [ ] Finaliser la vente.

**Statut attendu en base :** `paye` (canonique).

| Vérification | Attendu | PASS / FAIL | Note |
|--------------|---------|-------------|------|
| Wallet (client) → section **À venir** | Billet visible, badge "Valide" | ☐ | |
| Receipt (lien reçu) → QR visible | QR affiché, pas "En attente de confirmation" | ☐ | |
| Scanner embarquement | Billet accepté, statut → `embarque` | ☐ | |

**Console / capture :** _si erreur_

---

## 2. Test embarquement

**Précondition :** Billet guichet créé (statut `paye`), reçu avec QR.

**Actions :**
- [ ] Scanner le billet une première fois (embarquement).

**Statut attendu après 1er scan :** `embarque`.

| Vérification | Attendu | PASS / FAIL | Note |
|--------------|---------|-------------|------|
| Deuxième scan du même billet | Refus avec message type **"Déjà embarqué"** | ☐ | |
| Wallet (client) → section **Voyages effectués** | Billet dans "Voyages effectués", badge "Voyage effectué" | ☐ | |
| Receipt (même URL) → QR | QR considéré non valide pour embarquement (affichage cohérent) | ☐ | |

**Console / capture :** _si erreur_

---

## 3. Test annulation guichet

**Précondition :** Billet guichet créé (statut `paye`).

**Actions :**
- [ ] En tant que guichetier, demander l’annulation du billet (demande annulation).

**Statut attendu en base :** `annulation_en_attente`.

| Vérification | Attendu | PASS / FAIL | Note |
|--------------|---------|-------------|------|
| Wallet (client) → **En vérification** | Section "En attente d'annulation" ou "En vérification" | ☐ | |
| QR / embarquement | QR **non** valide pour embarquement ; scanner refuse | ☐ | |

**Console / capture :** _si erreur_

---

## 4. Test validation chef

**Précondition :** Billet en `annulation_en_attente` (demande annulation faite au guichet).

**Actions :**
- [ ] En tant que chef d’agence (ou admin_compagnie), valider l’annulation.

**Statut attendu en base :** `annule`.

| Vérification | Attendu | PASS / FAIL | Note |
|--------------|---------|-------------|------|
| Wallet (client) → **Annulés / Remboursés** | Billet dans section Annulés, badge "Annulé" | ☐ | |
| Scanner | Refus (billet annulé) | ☐ | |

**Console / capture :** _si erreur_

---

## 5. Test remboursement comptable

**Précondition :** Billet en statut `annule` (annulation validée par le chef).

**Actions :**
- [ ] En tant que comptable agence (ou admin_compagnie), enregistrer le remboursement.

**Statut attendu en base :** `rembourse`.

| Vérification | Attendu | PASS / FAIL | Note |
|--------------|---------|-------------|------|
| Wallet (client) → **Annulés / Remboursés** | Billet affiché, badge "Remboursé" | ☐ | |
| QR / scanner | Toujours invalide | ☐ | |
| `auditLog` (Firestore) | Contient la transition complète (paye → annulation_en_attente → annule → rembourse) | ☐ | |

**Console / capture :** _si erreur_

---

## 6. Test expiration (affichage)

**Précondition :** Possibilité de créer ou d’avoir un billet avec **date de voyage > 30 jours dans le passé**, statut en base restant `paye` (ou `confirme`).

**Actions :**
- [ ] Créer ou identifier un billet avec date voyage > 30 jours passée, statut = `paye`.
- [ ] Ne **pas** écrire `expire` en base (comportement actuel : expiration = affichage uniquement).

| Vérification | Attendu | PASS / FAIL | Note |
|--------------|---------|-------------|------|
| `getEffectiveStatut(reservation)` | Retourne **expire** | ☐ | |
| Wallet (client) | Affiche **Expiré**, section Annulés / Remboursés (ou équivalent) | ☐ | |
| Scanner | Refus (billet expiré) | ☐ | |
| Firestore (champ `statut`) | Reste **paye** (pas d’écriture `expire`) | ☐ | |

**Console / capture :** _si erreur_

---

## 7. Test en ligne

**Précondition :** Réservation créée en ligne (ex. statut initial `preuve_recue` après envoi preuve).

**Actions :**
- [ ] Créer / avoir une réservation en ligne avec statut **preuve_recue**.
- [ ] En tant qu’admin / validation, **confirmer** la réservation (passage à `confirme`).

| Vérification | Attendu | PASS / FAIL | Note |
|--------------|---------|-------------|------|
| Wallet | Billet bascule dans la bonne section (À venir une fois confirmé) | ☐ | |
| Receipt | Affiche QR après confirmation | ☐ | |
| Scanner | Autorise l’embarquement une fois statut `confirme` (ou `paye`) | ☐ | |

**Console / capture :** _si erreur_

---

## 8. Test rôles (Firestore Rules)

**Objectif :** Vérifier que les règles Firestore bloquent les écritures non autorisées.

| Test | Action | Attendu | PASS / FAIL | Note |
|------|--------|---------|-------------|------|
| Guichetier → `annule` | Guichetier tente d’écrire `statut: annule` sur une résa `paye` | **Refus** (seule transition guichetier : paye/confirme → annulation_en_attente) | ☐ | |
| Chef → `rembourse` | Chef tente d’écrire `statut: rembourse` | **Refus** (seul comptable : annule → rembourse) | ☐ | |
| Comptable → création résa | Comptable tente de créer une réservation | **Refus** (création résa hors périmètre comptable selon règles) | ☐ | |
| Contrôleur embarquement → champs | Contrôleur tente de modifier un champ non autorisé (ex. `montant`) | **Refus** (seuls : statut, statutEmbarquement, controleurId, checkInTime, auditLog, updatedAt) | ☐ | |

**Référence règles :** `validReservationStatutTransition()`, `boardingOfficerAllowedKeysOnly()` dans `firestore.rules`.

**Console / capture :** _erreur Firestore permission denied si attendu_

---

## Livrable — synthèse

### Résultats par scénario

| # | Scénario | Résultat | Commentaire |
|---|----------|----------|-------------|
| 1 | Guichet cas standard | ☐ PASS / ☐ FAIL | |
| 2 | Embarquement | ☐ PASS / ☐ FAIL | |
| 3 | Annulation guichet | ☐ PASS / ☐ FAIL | |
| 4 | Validation chef | ☐ PASS / ☐ FAIL | |
| 5 | Remboursement comptable | ☐ PASS / ☐ FAIL | |
| 6 | Expiration (affichage) | ☐ PASS / ☐ FAIL | |
| 7 | En ligne | ☐ PASS / ☐ FAIL | |
| 8 | Rôles (Rules) | ☐ PASS / ☐ FAIL | |

### Incohérences détectées

_(Liste des incohérences : comportement inattendu, libellés, statuts, règles, etc.)_

1. 
2. 
3. 

### Captures console / erreurs

_(Coller ou référencer les captures en cas d’erreur)_

- Test _ : 
- Test _ : 

---

*Document : Phase B (SPARK) — Chaîne billet. À remplir lors de l’exécution des tests.*
