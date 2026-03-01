# FLOW REFACTOR — Reservation as Single Source of Truth

**Objectif :** Refactorer le flux réservation → paiement → validation pour le rendre robuste, durable et piloté par l’URL. La page pivot unique est `/:slug/reservation/:id`.

---

## 1. Fichiers modifiés

| Fichier | Modifications |
|---------|----------------|
| **`src/modules/compagnie/public/utils/resolveReservation.ts`** | **Créé.** Résolution partagée par `slug` + `id` ou `slug` + `token` (resolveReservationById, resolveReservationByToken). |
| **`src/modules/compagnie/public/pages/ReservationClientPage.tsx`** | Après création Firestore : redirection immédiate vers `/:slug/reservation/:id` (replace). Suppression de l’écriture `sessionStorage` (reservationDraft, companyInfo), de `setReservationId`, `setCurrentStep`, `setShowPaymentPopup`, du scroll et du popup. Conservation de `rememberPending` pour la redirection depuis /booking. |
| **`src/modules/compagnie/public/pages/ReservationDetailsPage.tsx`** | Résolution **toujours** par slug + id (ou token) via le module partagé ; plus d’usage de `location.state` pour companyId/agencyId. Référence document stockée dans un `useRef` pour le submit de preuve. Chargement de `companyInfo` uniquement depuis Firestore. Section **paiement / justificatif** intégrée lorsque `statut === 'en_attente_paiement'` (moyens de paiement, référence, bouton « Envoyer le justificatif »). Avant envoi : relecture du document, vérification `statut === 'en_attente_paiement'`, puis `updateDoc`. Section **billet** toujours visible avec `TicketOnline` (badge « En attente de validation » ou « Réservation confirmée », QR géré par `isTicketValidForQR`). Redirection vers la page reçu **sans** `location.state`. Suppression des dépendances à `location`/`companyInfo` dans l’effet principal. |
| **`src/modules/compagnie/public/pages/ReceiptEnLignePage.tsx`** | Chargement de la réservation **uniquement** par `slug` + `id` : appel à `resolveReservationById(slug, id)` puis `getDoc(ref)`. Suppression du fallback par `location.state` (companyId/agencyId, reservationFromState) et suppression du fallback par `collectionGroup` (referenceCode / __name__). État initial sans state (loading true, reservation/companyInfo à null). |
| **`src/modules/compagnie/public/components/ticket/TicketOnline.tsx`** | Nouvelle prop optionnelle **`statusLabel`** pour le libellé du badge (ex. « Réservation confirmée », « En attente de validation »). Si absente, affichage de `statut`. |
| **`src/types/reservation.ts`** | Ajout de **`en_attente_paiement`** au type `ReservationStatus` pour cohérence avec Firestore et la logique d’affichage. |

---

## 2. Nouveau flux (description)

1. **Recherche / choix du trajet**  
   L’utilisateur va sur la page compagnie ou résultats, choisit un horaire, clique « Réserver » → navigation vers `/:slug/booking` (avec ou sans state tripData/companyInfo).

2. **Création de la réservation**  
   Sur `ReservationClientPage` (/:slug/booking), saisie passager + choix trajet → clic « Créer » → `addDoc` + `updateDoc` (publicToken, publicUrl) → **redirection immédiate** vers `/:slug/reservation/:id` (sans state). Aucun stockage `sessionStorage` pour le draft.

3. **Page pivot : `/:slug/reservation/:id`**  
   - **Résolution :** Toujours par URL : `resolveReservationById(slug, id)` ou `resolveReservationByToken(slug, token)` si accès via `?r=token`. Aucune dépendance à `location.state`.  
   - **Abonnement :** `onSnapshot(ref)` pour mises à jour en temps réel.  
   - **Si `statut === 'en_attente_paiement'` :** Affichage de la section « Justificatif de paiement » (boutons moyens de paiement, champ référence, bouton « Envoyer le justificatif »). Clic moyen de paiement → ouverture USSD/URL sans changer l’URL ; au retour sur l’app, la même URL reste valide.  
   - **Envoi du justificatif :** Relecture du document (`getDoc(ref)`), vérification que `statut === 'en_attente_paiement'`, puis `updateDoc` vers `preuve_recue`. En cas de statut déjà modifié (ex. expireHolds), message d’erreur explicite.  
   - **Billet :** Toujours affiché (section « Votre billet » avec `TicketOnline`). Si `statut !== 'confirme'` : QR non actif (texte de remplacement) et badge « En attente de validation ». Si `statut === 'confirme'` : QR actif et badge « Réservation confirmée ».  
   - **Reçu :** Quand le billet est disponible, redirection automatique vers `/:slug/receipt/:id` **sans** state. Le bouton « Voir mon billet » navigue aussi vers cette URL sans state.

4. **Page reçu `/:slug/receipt/:id`**  
   Chargement **uniquement** par URL : `resolveReservationById(slug, id)` puis `getDoc(ref)`. Affichage du billet/reçu. Aucun fallback par state ou `collectionGroup`.

5. **Validation côté compagnie**  
   Inchangée : `ReservationsEnLignePage` écoute les réservations `preuve_recue`, confirme ou refuse. Le client voit la mise à jour en temps réel sur `ReservationDetailsPage` grâce à `onSnapshot`.

---

## 3. Dépendances supprimées

| Dépendance | Où c’était utilisé | Statut |
|------------|---------------------|--------|
| **`location.state` (companyId, agencyId)** | ReservationDetailsPage pour construire la ref Firestore | Supprimé : résolution systématique par `resolveReservationById` / `resolveReservationByToken`. |
| **`location.state` (companyInfo)** | ReservationDetailsPage pour affichage initial | Supprimé : chargement company depuis Firestore (ref.path). |
| **`location.state` (reservation, companyInfo, companyId, agencyId)** | ReceiptEnLignePage pour skip load ou path direct | Supprimé : chargement uniquement par slug + id. |
| **`sessionStorage.reservationDraft`** | ReservationClientPage après création ; UploadPreuvePage | Plus écrit après création (redirection immédiate). UploadPreuvePage non modifiée mais n’est plus une étape requise du flux. |
| **`sessionStorage.companyInfo`** | Idem | Plus écrit après création. |
| **Fallback collectionGroup (referenceCode / __name__)** | ReceiptEnLignePage | Supprimé : uniquement `resolveReservationById(slug, id)` + `getDoc`. |

**Conservé (volontairement) :**  
- **`localStorage.pendingReservation`** : utilisé pour rediriger depuis `/booking` vers `/:slug/reservation/:id` si une réservation « en cours » existe (éviter une deuxième création). Non utilisé pour charger les données de la réservation.

---

## 4. Rétrocompatibilité

- **Liens profonds `/:slug/reservation/:id`** : Fonctionnent sans state. Les anciens liens ou favoris avec la même URL restent valides.  
- **Liens `/:slug/mon-billet?r=token`** : Toujours gérés par `ReservationDetailsPage` via `resolveReservationByToken` ; l’URL est normalisée en `/:slug/reservation/:id` après résolution.  
- **`/:slug/upload-preuve/:id`** : Redirige déjà vers `/:slug/reservation/:id` (LegacyUploadRedirect). Aucun changement.  
- **Navigation depuis Mes réservations / Mes billets** : Ces pages peuvent toujours passer du state (companyId, agencyId) pour un affichage plus rapide, mais **ReservationDetailsPage** et **ReceiptEnLignePage** ne en dépendent plus ; si le state est absent (refresh, nouvel onglet), le chargement se fait par slug + id.  
- **Type `ReservationStatus`** : Ajout de `en_attente_paiement` ; les valeurs existantes restent valides.

---

## 5. Risques de migration et points d’attention

- **Premier chargement sans state :** Une requête de résolution (slug + id ou token) est faite à chaque chargement. En cas de forte charge, le coût Firestore (reads) peut augmenter par rapport au cas où state était fourni. Comportement fonctionnellement correct.  
- **UploadPreuvePage** : Reste disponible sous `/:slug/upload-preuve` (RouteResolver) ; elle s’appuie encore sur `sessionStorage` / state pour le draft. Si l’utilisateur arrive sans draft (ex. lien direct sans avoir créé la réservation sur cet onglet), la page peut ne pas afficher de réservation. Le flux principal ne passe plus par cette page.  
- **expireHolds (Cloud Function) :** Si la réservation passe en `annule` avant l’envoi du justificatif, le message « Cette réservation a expiré ou a déjà été traitée » s’affiche après relecture du document ; pas de mise à jour incorrecte.  
- **ReceiptEnLignePage sous RouteResolver :** L’URL est du type `/:slug/receipt/:id` ; `id` est dérivé du pathname (pathParts[2]). Aucun changement de routing ; le comportement reste cohérent avec l’extraction actuelle de `slug` et `id`.

---

**Fin du document.** Le flux est désormais centré sur l’URL `/:slug/reservation/:id` comme source de vérité, sans dépendance au state ou au sessionStorage pour le chargement des données de réservation et de reçu.
