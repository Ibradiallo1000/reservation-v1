# Fix — Proof submission (remove arrayUnion)

**Objectif :** Simplifier l’envoi de preuve : une seule preuve par réservation, plus d’`arrayUnion` ni d’historique.

---

## 1. Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| **`firestore.rules`** | UPDATE 2 (preuve) : `changedKeys().hasOnly([...])` limité à `statut`, `paymentReference`, `proofSubmittedAt`, `updatedAt`. Suppression de `auditLog`, `preuveVia`, `preuveMessage`, `canal`, etc. |
| **`src/modules/compagnie/public/pages/ReservationDetailsPage.tsx`** | Suppression des imports `arrayUnion` et `buildStatutTransitionPayload`. `submitProof` : après relecture du doc et vérification `statut === 'en_attente_paiement'`, `updateDoc(ref, { statut: 'preuve_recue', paymentReference: inputReference, proofSubmittedAt: serverTimestamp(), updatedAt: serverTimestamp() })`. |
| **`src/modules/compagnie/public/pages/ReservationClientPage.tsx`** | Suppression des imports `arrayUnion` et `buildStatutTransitionPayload`. `submitProofInline` : ajout d’un `getDoc` avant l’update pour valider le statut ; `updateDoc` avec uniquement `statut`, `paymentReference`, `proofSubmittedAt`, `updatedAt`. |
| **`src/modules/compagnie/public/pages/UploadPreuvePage.tsx`** | Import : `arrayUnion` remplacé par `serverTimestamp` ; suppression de `buildStatutTransitionPayload`. `handleUpload` : avant l’update, `getDoc(resRef)` puis vérification `statut === 'en_attente_paiement'` ; `updateDoc` avec `statut`, `paymentReference`, `proofSubmittedAt`, `updatedAt`. (Ancien bloc `updatePayload` / upload fichier laissé en place mais plus utilisé pour l’écriture.) |
| **`src/modules/compagnie/finances/pages/ReservationsEnLignePage.tsx`** | Affichage et recherche : utilisation de `paymentReference || preuveMessage` pour la référence / le message de preuve (rétrocompatibilité avec les anciens champs). |

---

## 2. Confirmation : plus d’arrayUnion dans le flux public

- **ReservationDetailsPage** : plus d’import ni d’usage de `arrayUnion` ou `buildStatutTransitionPayload`.
- **ReservationClientPage** : idem.
- **UploadPreuvePage** : idem.

Aucune occurrence de `arrayUnion` ou `proofHistory` dans `src/modules/compagnie/public`. Les autres usages de `arrayUnion` (agence, flotte, expireHolds, reservationStatutService) restent inchangés et hors flux public.

---

## 3. Logique d’update (preuve)

- **Validation avant update :**  
  `getDoc(ref)` → si le document n’existe pas ou si `statut !== 'en_attente_paiement'` → message d’erreur (« Réservation introuvable » ou « Cette réservation a expiré ou a déjà été traitée »), pas d’écriture.

- **Champs écrits :**  
  `statut: 'preuve_recue'`, `paymentReference` (référence saisie par le client), `proofSubmittedAt: serverTimestamp()`, `updatedAt: serverTimestamp()`.

- **Règles Firestore :**  
  Seuls ces quatre champs sont autorisés pour l’update 2 (passage à `preuve_recue` sans auth).

---

## 4. Rétrocompatibilité

- **Anciennes réservations** avec `preuveMessage` : côté Compagnie, `ReservationsEnLignePage` affiche et recherche via `paymentReference || preuveMessage`.
- **Nouvelles réservations** : seul `paymentReference` est écrit (et éventuellement `preuveMessage` sur d’anciennes données).

---

**Résumé :** Une seule preuve par réservation ; plus d’`arrayUnion` ni d’`auditLog` dans le flux public ; validation du statut avant update ; erreurs explicites si la réservation est expirée ou déjà traitée.
