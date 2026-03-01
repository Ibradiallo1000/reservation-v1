# BRAND ELEVATION — Phase 1 (Structural brand cohesion)

## Objective

Align brand voice and textual consistency across the platform: clear, professional, direct, no technical jargon. No visual redesign; no logic or routing changes.

## Files modified

1. **src/modules/compagnie/public/pages/ReservationClientPage.tsx**
2. **src/modules/compagnie/public/pages/ReservationDetailsPage.tsx**
3. **src/modules/compagnie/public/pages/UploadPreuvePage.tsx**
4. **src/modules/compagnie/public/pages/ClientMesBilletsPage.tsx**
5. **src/types/reservations.ts**
6. **src/utils/reservationStatusUtils.ts**
7. **src/modules/compagnie/finances/pages/ReservationsEnLignePage.tsx**
8. **src/modules/compagnie/finances/pages/VueGlobale.tsx**

## Wording before / after

| Context | Before | After |
|--------|--------|--------|
| Status (success) | Paiement confirmé | **Réservation confirmée** |
| Status (pending check) | Preuve envoyée / En vérification / En cours de vérification / À vérifier | **En attente de validation** |
| Reassurance | Support disponible en cas de question | **Support disponible** |
| Reassurance | (unchanged) | **Paiement sécurisé** (kept) |
| Long phrase | Votre preuve de paiement est en cours de vérification par la compagnie. | **Votre justificatif a bien été reçu.** + **Confirmation par SMS ou email après validation.** |
| Long phrase | Confirmation envoyée par SMS/email dès validation par la compagnie. | **Confirmation par SMS ou email après validation.** |
| Error message | Échec de l'envoi de la preuve | **L'envoi n'a pas abouti. Réessayez.** |
| Offline banner | Connexion instable: certaines actions (chargement, paiement, envoi de preuve) peuvent échouer. | **Connexion instable. Certaines actions peuvent échouer.** |
| CTA / instruction | Veuillez effectuer le paiement et envoyer la preuve | **Veuillez envoyer votre justificatif de paiement.** |
| Section title | Preuve de paiement / Preuve envoyée | **Justificatif de paiement** / **Justificatif envoyé** |
| Section title (Compagnie) | Preuves de paiement à vérifier | **En attente de validation** |
| Badge (Compagnie) | X preuve(s) en attente / À vérifier | **X en attente de validation** |
| Toast (Compagnie) | Nouvelle preuve reçue / a envoyé une preuve de paiement | **Nouveau justificatif reçu** / **a envoyé un justificatif de paiement** |
| Table label (Compagnie) | Message de preuve | **Message** |
| Link (Compagnie) | Voir la preuve de paiement complète | **Voir le justificatif** |
| Types/reservations.ts | Preuve reçue, En vérification, Confirmé | **En attente de validation**, **Réservation confirmée** |
| reservationStatusUtils (wallet) | En vérification | **En attente de validation** |
| Refusée | Refusée par la compagnie | **Refusée** (short) |
| En attente de preuve | (step label) | **En attente de paiement** |

## Confirmation: no logic changed

- No changes to: booking flow, payment submission, Firestore fields, routing, or component logic.
- Only user-visible strings (labels, titles, messages, toasts, placeholders) were updated.
- Internal identifiers (`preuve_recue`, `preuveMessage`, `preuveUrl`, etc.) and code comments were left as-is.

## Wording that may require business decision

1. **« Justificatif » vs « preuve »**  
   "Preuve de paiement" was replaced by "Justificatif de paiement" in user-facing copy to sound more professional and less technical. If the brand prefers to keep "preuve" in client-facing text, it can be reverted in the same places.

2. **Filter / KPI labels (Compagnie)**  
   - Filter option: "En attente de validation (X)" and "Réservations confirmées (X)".  
   - MetricCard: "En attente de validation" for the verification count.  
   If the team prefers shorter dashboard labels (e.g. "À vérifier", "Confirmées"), these can be reverted only in ReservationsEnLignePage/VueGlobale.

3. **Refusée**  
   "Refusée par la compagnie" was shortened to "Refusée" on the reservation details page. If you want to keep the reason visible, the longer phrase can be restored.

4. **Confirmation SMS/email**  
   "Confirmation par SMS ou email après validation" is used in public and success screens. If the product does not send SMS/email on validation, this line should be removed or reworded.
