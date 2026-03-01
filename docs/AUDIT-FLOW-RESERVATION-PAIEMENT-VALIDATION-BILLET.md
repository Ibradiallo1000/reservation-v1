# AUDIT COMPLET — Flux Réservation → Paiement → Validation → Billet

**Périmètre :** Cycle de vie complet de la réservation en ligne, de la création à la délivrance du billet.  
**Objectif :** Compréhension structurelle sans modification de code. Redesign uniquement après validation de cet audit.

---

## 1. Description étape par étape du flux actuel

### 1.1 Entrée dans le parcours

| Étape | Fichier / Route | Comportement |
|-------|------------------|--------------|
| **A. Recherche trajet** | `PublicCompanyPage` ou `ResultatsAgencePage` | L’utilisateur choisit départ / arrivée. Soit lien direct `/:slug/booking?departure=...&arrival=...`, soit recherche → `ResultatsAgencePage` (`/:slug/resultats?departure=...&arrival=...`). |
| **B. Choix horaire** | `ResultatsAgencePage` | Liste des trajets (Firestore: `weeklyTrips` + calcul des places restantes via `reservations` avec statut `confirme`/`paye`). Clic « Réserver » → `navigate(\`/${company.slug}/booking\`, { state: { tripData, companyInfo } })`. **Aucune réservation créée ici.** |
| **C. Page booking** | `RouteResolver` → `ReservationClientPage` (`/:slug/booking`) | Réception de `location.state.tripData` et `companyInfo`. Pas d’`id` en URL : mode **création**. Si `location.state` est vide (refresh, lien partagé sans state), la page recharge trajets/company via Firestore à partir de `slug` + query `departure`/`arrival` (et optionnellement `sessionStorage` pour preload). Le code prévoit un mode « existing » si `useParams().id` est fourni avec `state.companyId/agencyId`, mais les routes actuelles n’exposent pas `/:slug/booking/:id`. |

### 1.2 Création de la réservation

| Étape | Fichier | Comportement |
|-------|---------|--------------|
| **D. Saisie passager** | `ReservationClientPage` | Nom, téléphone (format Mali 8 chiffres). Validation côté client. |
| **E. Création Firestore** | `ReservationClientPage` — `createReservationDraft()` | `addDoc(companies/{companyId}/agences/{agencyId}/reservations`, payload). Payload : `statut: 'en_attente_paiement'`, `canal: 'en_ligne'`, `holdUntil: now + 15 min`, `referenceCode` (généré), `trajetId`, etc. Puis `updateDoc` pour ajouter `publicToken` et `publicUrl`. |
| **F. Persistance locale** | Même écran | `sessionStorage.setItem('reservationDraft', ...)` et `companyInfo`. `localStorage.setItem(PENDING_KEY, { slug, id, referenceCode, status: 'en_attente_paiement', companyId, agencyId })`. `setReservationId(refDoc.id)`, affichage de la section paiement, popup « Paiement ». |

### 1.3 Paiement et preuve

| Étape | Fichier | Comportement |
|-------|---------|--------------|
| **G. Choix moyen de paiement** | `ReservationClientPage` — `PaymentProofSection` | Clic sur un moyen (Orange Money, Moov, etc.) → ouverture URL ou `tel:` USSD. `saveLastPaymentMethod(reservationId, key)` et `savePaymentTriggeredAt(reservationId, now)` dans `localStorage`. Aucune écriture Firestore. |
| **H. Envoi justificatif (même page)** | `ReservationClientPage` — `submitProofInline()` | Référence message ≥ 4 caractères. `updateDoc` sur le document réservation : `statut: 'preuve_recue'`, `preuveVia`, `preuveMessage`, `auditLog` (arrayUnion). Puis `navigate(\`/${slug}/reservation/${reservationId}\`, { state: { companyId, agencyId } })`. |
| **H'. Envoi justificatif (page dédiée)** | `UploadPreuvePage` (`/:slug/upload-preuve`) | **Entrée :** `location.state.draft` + `companyInfo` ou `sessionStorage.reservationDraft` + `companyInfo`. Pas d’`id` dans l’URL côté RouteResolver (route = `/:slug/*`, sous-chemin `upload-preuve`). Après envoi : `updateDoc` même structure, puis `sessionStorage.removeItem('reservationDraft'|'companyInfo')`, écran succès, puis redirection après 1,2 s vers `/:slug/reservation/${reservationDraft.id}`. **Note :** La route `/:slug/upload-preuve/:id` dans AppRoutes pointe vers `LegacyUploadRedirect` qui redirige vers `/:slug/reservation/:id`. |

### 1.4 Détails réservation et redirection vers le billet

| Étape | Fichier | Comportement |
|-------|---------|--------------|
| **I. Page Détails** | `ReservationDetailsPage` (`/:slug/reservation/:id` ou `?r=token`) | Résolution du document : si `id` + `location.state.companyId/agencyId` → `doc` direct ; sinon `resolveById(slug, id)` (collectionGroup `reservations` + `documentId() == id` puis filtre par companyId) ou `resolveByToken(slug, token)`. **Abonnement temps réel :** `onSnapshot(ref, ...)` pour mettre à jour l’état (statut, etc.). |
| **J. Redirection auto si billet dispo** | Même page | Si `showTicketDirect(reservation)` (canal guichet OU statut `confirme`) → `navigate(\`/${slug}/receipt/${reservation.id}\`, { replace: true, state: { reservation, companyInfo } })`. |
| **K. Billet / Reçu** | `ReceiptEnLignePage` (`/:slug/receipt/:id`) | Données depuis `location.state.reservation` / `companyInfo` ou chargement Firestore : si `state.companyId` + `agencyId` → `getDoc` path direct ; sinon `collectionGroup('reservations')` avec `referenceCode == id` ou `__name__ == id`. Pas d’`onSnapshot` : lecture ponctuelle. |

### 1.5 Validation côté Compagnie

| Étape | Fichier | Comportement |
|-------|---------|--------------|
| **L. Liste à vérifier** | `ReservationsEnLignePage` (Compagnie) | `onSnapshot` sur chaque agence avec `where('statut','==','preuve_recue')` → liste « En attente de validation ». Autres réservations chargées par pagination (statut `not-in ['preuve_recue']`). |
| **M. Confirmer / Refuser** | Même page | Confirmer : `updateReservationStatut(ref, 'confirme', meta, { validatedAt })`. Refuser : `updateReservationStatut(ref, 'refuse', meta, { refusedAt, reason })`. Le client, sur `ReservationDetailsPage` (déjà ouverte ou en rafraîchissant), reçoit la mise à jour via `onSnapshot` puis est redirigé vers receipt si `confirme`. |

### 1.6 Consultation « Mes réservations » / « Mes billets »

| Étape | Fichier | Comportement |
|-------|---------|--------------|
| **N. Mes réservations** | `ClientMesReservationsPage` | Saisie téléphone → requêtes Firestore par compagnie(s) avec `where('telephone','==', phone)`. Affichage liste ; clic « Voir billet » → `navigate(\`/${companySlug}/reservation/${id}\`, { state: { companyId, agencyId } })`. |
| **O. Mes billets** | `ClientMesBilletsPage` | Téléphone + indicatif pays → requêtes E.164 + national. Filtre par `shouldShowInWallet(statut)`. Clic « Voir » → `navigate(\`/${slug}/receipt/${id}\`, { state: { companyId, agencyId } })`. |

---

## 2. Statuts de réservation et lieux de changement

| Statut (canonique) | Où il est écrit | Qui / Quoi |
|--------------------|-----------------|------------|
| `en_attente_paiement` | `ReservationClientPage` (addDoc) | Création réservation |
| `preuve_recue` | `ReservationClientPage.submitProofInline` ou `UploadPreuvePage.handleUpload` | Client (updateDoc) |
| `confirme` | `ReservationsEnLignePage.handleConfirm` | Compagnie (updateReservationStatut) |
| `refuse` | `ReservationsEnLignePage.handleRefuse` | Compagnie (updateReservationStatut) |
| `annule` | `expireHolds` (Cloud Function), ou annulation manuelle (agence) | Cron (holdUntil dépassé) ou utilisateur |

**Transitions autorisées (reservationStatusUtils.ts) :**  
`en_attente_paiement` → `preuve_recue` ; `preuve_recue` / `verification` → `confirme` | `refuse` ; `confirme`/`paye` → `embarque` | `annulation_en_attente` | `expire` ; etc.

**Normalisation affichage :** `ReservationDetailsPage` mappe `preuve_recue`/`verif` → `verification`, et `pay`/`confirm`/`valid` → `confirme` pour l’UI uniquement (Firestore reste en `preuve_recue` ou `confirme`).

---

## 3. Structure Firestore impliquée

- **Companies :** `companies/{companyId}` — infos compagnie, slug.
- **Agences :** `companies/{companyId}/agences/{agencyId}`.
- **Réservations :** `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}`.
  - Champs clés : `statut`, `canal`, `holdUntil`, `referenceCode`, `publicToken`, `publicUrl`, `nomClient`, `telephone`, `depart`, `arrivee`, `date`, `heure`, `montant`, `seatsGo`, `trajetId`, `companyId`, `companySlug`, `preuveVia`, `preuveMessage`, `preuveUrl`, `auditLog`, `createdAt`, `updatedAt`, etc.
- **Trajets :** `companies/{companyId}/agences/{agencyId}/weeklyTrips/{tripId}` (horaires par jour).
- **Moyens de paiement :** `paymentMethods` (collection racine), filtré par `companyId`.

**Index :** collectionGroup sur `reservations` pour `documentId()`, `companySlug`, `publicToken` (résolution par token).

---

## 4. Points de perte d’état (app fermée / sortie USSD)

| Point | Risque |
|-------|--------|
| **Après création, avant envoi preuve** | `reservationDraft` et `companyInfo` sont en **sessionStorage**. Fermeture de l’onglet / app → perte. L’utilisateur ne retrouve la réservation que s’il a l’URL avec `id` (ex. `/slug/reservation/ID`) ou le lien `publicUrl` (mon-billet?r=token). Le **localStorage** `pendingReservation` garde slug, id, companyId, agencyId : permet de revenir sur `/slug/reservation/ID` avec state si on le restaure, mais pas le draft complet. |
| **Ouverture USSD / lien externe** | Clic moyen de paiement → `window.location.href = tel:...` ou `window.open(url)`. Selon l’appareil, l’app peut passer en arrière-plan ou être tuée. Au retour, si sessionStorage est vidé, **UploadPreuvePage** ne peut plus charger le draft ; **ReservationClientPage** en mode création n’a plus le `reservationId` si l’URL est restée `/booking` sans id. |
| **Refresh sur /booking après création** | `reservationId` est dans le state React uniquement. Refresh → state perdu. La page recharge trajets/company ; sans `id` en URL, pas de reprise de la réservation créée. Seul le `localStorage` pending donne id/slug/companyId/agencyId : la page pourrait rediriger vers `/slug/reservation/id` (ce qui est fait si `readPending()` retourne une réservation bloquante au clic « Créer »). |
| **Refresh sur /slug/reservation/ID** | Si l’utilisateur a ouvert le lien avec state (companyId, agencyId), au refresh **state est perdu**. ReservationDetailsPage utilise alors `resolveById(slug, id)` ou `resolveByToken` pour retrouver le document → pas de perte de données Firestore, mais premier chargement plus coûteant (collectionGroup / scan). |
| **Refresh sur /slug/receipt/ID** | Si `location.state` contenait reservation + companyInfo, au refresh tout est perdu. La page refait un `getDoc` si `companyId`/`agencyId` sont en state (eux aussi perdus), sinon fallback collectionGroup par `referenceCode` ou `__name__` → reçu récupérable mais sans companyId/agencyId dans l’URL. |

---

## 5. Faiblesses du flux

- **Double source de vérité pour « où en est la réservation » :** Firestore (statut) et localStorage/sessionStorage (pending, draft, lastPaymentMethod). En cas de désync (ex. validation côté compagnie alors que le client a encore un pending ancien), le comportement dépend du nettoyage manuel de `clearPending()` et de la lecture du statut réel depuis Firestore.
- **Création sans id dans l’URL :** Tant que la réservation n’est pas créée, l’URL reste `/booking?departure=...`. Après création, l’URL ne change pas ; l’id n’apparaît qu’après navigation vers `/reservation/:id`. Donc pas d’URL partageable « en cours de paiement » sans construire manuellement `publicUrl`.
- **UploadPreuvePage et routes :** Sous RouteResolver, l’URL est `/:slug/upload-preuve` (pas de `:id`). L’`id` ne peut venir que du draft (state ou sessionStorage). La route AppRoutes `/:slug/upload-preuve/:id` redirige vers reservation. Donc pas d’URL directe « upload preuve pour la réservation X » sans state/session.
- **expireHolds :** Les réservations `en_attente_paiement` avec `holdUntil` dépassé sont passées en `annule` par une Cloud Function (toutes les 5 min). Si le client envoie la preuve après expiration, Firestore a déjà `annule` ; la règle de sécurité n’autorise l’update que depuis `en_attente_paiement` vers `preuve_recue` → risque d’échec silencieux ou message d’erreur selon la gestion côté client.

---

## 6. Faiblesses UX

- **Pas de récapitulatif unique « lien de ma réservation »** affiché de façon persistante après création (ex. copier le lien, SMS). Le `publicUrl` est copié dans le presse-papier mais pas toujours affiché clairement.
- **Message d’erreur générique** (« L'envoi n'a pas abouti. Réessayez. ») sans distinguer refus règle Firestore, réseau, ou statut déjà annulé.
- **Redirection automatique vers receipt** peut surprendre si l’utilisateur voulait rester sur la page détails (pas de choix explicite « Voir mon billet » dans ce cas).
- **Mes réservations / Mes billets :** Pas de deep link par réservation (ex. `/slug/reservation/ID` avec id dans l’URL) ; la liste dépend du numéro de téléphone et peut mélanger plusieurs compagnies.
- **Hors ligne :** Aucune file d’attente pour envoi de preuve ; en cas d’échec réseau, l’utilisateur doit réessayer manuellement.

---

## 7. Fragilités techniques

- **Dépendance à `location.state` :** Résultats de recherche, companyInfo, companyId/agencyId pour reservation/receipt. Refresh ou ouverture dans un nouvel onglet sans state → fallback coûteux (collectionGroup) ou erreur.
- **SessionStorage unique par onglet :** Un deuxième onglet ne voit pas le draft ; un onglet fermé perd le draft.
- **Plusieurs clés localStorage** (`pendingReservation`, `lastPaymentMethod_${id}`, `paymentTriggeredAt_${id}`) à garder cohérentes avec la réservation courante et à nettoyer (clearPending, etc.).
- **ReservationDetailsPage :** Résolution par `resolveById` (collectionGroup + boucle) ou `resolveByToken` à chaque montage si pas de state ; pas de cache côté client.
- **ReceiptEnLignePage :** Fallback par `referenceCode == id` ou `__name__ == id` sur collectionGroup si pas de companyId/agencyId → ambiguïté si referenceCode réutilisé (peu probable mais possible).
- **Règles Firestore :** Update 2 (preuve) autorise uniquement un sous-ensemble de champs. Toute évolution (nouveaux champs, preuveUrl, etc.) nécessite de mettre à jour les règles.

---

## 8. Dépendances à l’état temporaire

| Donnée | Stockage | Utilisation |
|--------|----------|-------------|
| Réservation « en cours » (id, slug, companyId, agencyId, status) | localStorage `pendingReservation` | Redirection vers `/reservation/id`, évitement de créer une 2e réservation, nettoyage quand statut confirme/annule/refuse. |
| Draft complet (pour formulaire preuve) | sessionStorage `reservationDraft`, `companyInfo` | ReservationClientPage (après création), UploadPreuvePage. |
| Dernier moyen de paiement choisi | localStorage `lastPaymentMethod_${reservationId}` | Restauration du choix au rechargement de ReservationClientPage. |
| Timestamp « paiement déclenché » | localStorage `paymentTriggeredAt_${reservationId}` | Affichage / logique « vous avez déclenché un paiement ». |
| Préchargement trajets/company | sessionStorage `preload_${slug}_${departure}_${arrival}` | Réduction des requêtes au retour sur /booking avec même recherche. |
| Étape courante (détails) | localStorage `mb:lastStep:${slug}` | Indicatif uniquement. |
| Compagnie résolue (slug → company) | sessionStorage `company-${slug}`, memoryCache RouteResolver | Éviter de refaire getDocs à chaque navigation. |

---

## 9. Risques d’incohérence

- **Statut annulé par expireHolds alors que le client envoie la preuve :** Race condition ; l’update client peut être rejeté par les règles.
- **Double soumission de preuve :** Pas de lock optimiste côté client ; deux onglets peuvent envoyer deux updates (dernier écrit gagne, auditLog en arrayUnion).
- **Pending vs Firestore :** Si l’utilisateur ouvre un lien `/reservation/ID` alors que le pending contient un autre ID, clearPending est appelé quand `pend.id !== snap.id`, ce qui est correct ; mais si le pending n’est jamais créé (ex. lien direct), il n’y a pas d’incohérence, juste pas de rappel du « même » parcours.
- **Référence de réservation :** `referenceCode` est généré à la création ; utilisé pour affichage et pour ReceiptEnLignePage en fallback. Pas de garantie d’unicité globale (même agence), seulement usage comme identifiant lisible.

---

## 10. Proposition d’architecture robuste

1. **URL comme source de vérité pour la réservation courante**  
   Après création : redirection immédiate vers `/:slug/reservation/:id` (ou page dédiée « paiement » `/:slug/reservation/:id/paiement`). Toute la suite (choix moyen, envoi preuve) se fait avec `id` (et slug) dans l’URL. Plus de dépendance au sessionStorage pour reprendre le flux.

2. **État minimal dans le stockage local**  
   - localStorage : uniquement un « dernier id consulté » ou token pour « reprendre où j’en étais » (optionnel), ou rien.  
   - sessionStorage : optionnel pour cache company/trajets ; pas pour le draft de réservation.  
   - Données de réservation : toujours rechargées depuis Firestore à partir de l’id (et slug).

3. **Un seul point d’envoi de preuve**  
   - Soit tout sur `ReservationDetailsPage` (section « En attente de paiement » avec formulaire preuve + même updateDoc), soit page dédiée `/:slug/reservation/:id/preuve` qui lit la réservation par id/slug.  
   - Supprimer la dépendance à un draft en sessionStorage pour l’upload ; le draft = document Firestore `en_attente_paiement` chargé par id.

4. **Résolution réservation par URL uniquement**  
   - Toujours résoudre par `slug` + `id` (ou token) : `resolveById` / `resolveByToken` une fois, puis utiliser la référence document pour onSnapshot et updates.  
   - Éviter de faire dépendre receipt ou détails de `location.state.companyId/agencyId` ; dériver companyId/agencyId du document résolution et les passer en state seulement pour éviter un 2e resolve (optimisation).

5. **Gestion explicite des conflits**  
   - Avant update preuve : relecture du document (getDoc) et vérification que `statut === 'en_attente_paiement'` et éventuellement `holdUntil > now`. Sinon afficher « Cette réservation a expiré ou a déjà été traitée » et proposer une nouvelle réservation ou un lien d’aide.  
   - Côté Cloud Function expireHolds : optionnellement exclure les réservations dont une preuve a été soumise récemment (ex. champ `preuveSubmittedAt`) pour réduire la race.

6. **Receipt et détails sans state**  
   - ReceiptEnLignePage : toujours résoudre par slug + id (collectionGroup ou resolveById) si state absent. Ne pas exiger companyId/agencyId dans l’URL ; les déduire du path du document trouvé.  
   - ReservationDetailsPage : idem ; déjà le cas avec resolveById/resolveByToken.

7. **Deep links et partage**  
   - Après création : afficher et permettre de copier/partager une URL unique `/:slug/reservation/:id` (ou avec token pour usage sans login).  
   - Email/SMS post-création (hors scope actuel) : envoyer ce lien pour « continuer le paiement » ou « voir ma réservation ».

8. **Audit et transitions**  
   - Conserver un seul point d’écriture des transitions (ex. `updateReservationStatut` + buildStatutTransitionPayload) pour confirme/refuse/annule, et garder les règles Firestore alignées sur ces transitions.  
   - Côté client : un seul chemin pour passer à `preuve_recue` (updateDoc avec les champs autorisés), avec relecture préalable si besoin.

---

**Fin de l’audit.** Aucune modification de code n’a été effectuée ; ce document sert de base pour une refonte ciblée du flux.
