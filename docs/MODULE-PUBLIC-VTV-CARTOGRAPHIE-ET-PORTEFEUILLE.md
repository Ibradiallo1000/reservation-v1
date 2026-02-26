# Module public VTV — Cartographie, billet, portefeuille et auth

Document unique : cartographie complète du module public, analyse du rendu billet, unification portefeuille, auth téléphone et refactor UX.

---

# PROMPT 1 — Cartographie complète du module public VTV

## Vue d’ensemble du flux

```
Recherche → Résultats (date/heure) → Réservation (draft) → Preuve → Validation (admin) → Billet → Consultation portefeuille
   │              │                        │                    │              │                │
   ▼              ▼                        ▼                    ▼              ▼                ▼
Accueil      ResultatsAgencePage    ReservationClientPage  submitProof   ReservationsEnLigne  ReceiptEnLignePage
(PublicCompanyPage)  ou                createReservationDraft  (preuve_recue)  statut confirme   TicketOnline
                 ReservationClientPage     (en_attente_paiement)                    │
                 (recherche intégrée)                                              ▼
                                                                          ReservationDetailsPage
                                                                          → redir. /receipt/:id
                                                                                    │
                                                                          ClientMesReservationsPage
                                                                          (par téléphone)
```

## Liste détaillée des fichiers

### 1. Page d’accueil publique

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/pages/PublicCompanyPage.tsx` |
| **Rôle** | Vitrine compagnie : hero recherche, trajets suggérés, agences, avis, footer. Point d’entrée `/:slug`. |
| **Composants utilisés** | `VilleSuggestionBar`, `LanguageSuggestionPopup`, `HeroSection` (plateforme), `CompanyServices`, `WhyChooseSection`, `Footer`, `AgencyList`, `AvisListePublic`, `Header` (CompanyPublicHeader) |
| **Firestore** | `companies` (slug), `companies/{id}/agences`, `companies/{id}/agences/{aid}/weeklyTrips` (suggestions), pas de `reservations` |
| **Routes** | `/:slug` (via RouteResolver, `subPath === null`) |
| **Utilisé** | ✅ Actif |

### 2. Page recherche / résultats

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/pages/ResultatsAgencePage.tsx` |
| **Rôle** | Affiche les trajets disponibles (date + heure) pour départ/arrivée (query params). Sélection puis redirection vers booking. |
| **Composants** | LazyLoadImage, icônes (Clock, MapPin, Ticket, etc.) |
| **Firestore** | `companies` (slug), `companies/{id}/agences`, `weeklyTrips`, `reservations` (pour places restantes : statut `payé` uniquement) |
| **Routes** | `/:slug/resultats?departure=...&arrival=...` (RouteResolver, `subPath === "resultats"`) |
| **Utilisé** | ✅ Actif (lien depuis PublicCompanyPage peut aller en `/booking` avec query aussi) |

### 3. Page sélection date + heure (intégrée)

La sélection date/heure n’a **pas** de page dédiée : elle est dans **ReservationClientPage** (et aussi dans ResultatsAgencePage).  
Depuis l’accueil, on peut aller soit en `/:slug/resultats?departure=&arrival=`, soit en `/:slug/booking?departure=&arrival=` (RouteResolver `booking` = ReservationClientPage).

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/pages/ReservationClientPage.tsx` (contient recherche + dates + créneaux + formulaire perso + paiement) |
| **Rôle** | Recherche (départ/arrivée), chargement trajets + places, sélection date/heure, formulaire client, « Passer au paiement » → création draft, puis envoi preuve (inline). |
| **Composants** | VilleSuggestionBar / CityInput (recherche), cartes trajets, formulaire nom/tél, popup moyens de paiement, pas de TicketOnline |
| **Firestore** | `companies`, `agences`, `weeklyTrips`, `reservations` (getDocs pour calcul places : `confirme` + `payé`), `paymentMethods`. Écriture : `addDoc` + `updateDoc` sur `companies/{cid}/agences/{aid}/reservations` (draft `en_attente_paiement`), pas de Cloud Function appelée. |
| **Routes** | `/:slug/reserver` (AppRoutes direct), `/:slug/booking` (RouteResolver) |
| **Utilisé** | ✅ Actif |

### 4. ReservationClientPage (détail)

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/pages/ReservationClientPage.tsx` |
| **Rôle** | Recherche → résultats (dates + horaires) → formulaire perso → « Passer au paiement » → création résa `en_attente_paiement` → choix moyen de paiement → envoi preuve (référence) → navigation vers détail résa. |
| **Statuts gérés** | `en_attente_paiement`, `preuve_recue`, `confirme` (affichage / blocage). Calcul places : `confirme` + `payé` uniquement. |
| **Dépendances Firestore** | Voir ci‑dessus. Pas d’`onSnapshot` (pas de temps réel). |

### 5. UploadPreuvePage

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/pages/UploadPreuvePage.tsx` |
| **Rôle** | Formulaire alternatif pour envoyer la preuve de paiement (fichier + message). Met à jour la résa en `preuve_recue`. Données depuis `location.state` ou `sessionStorage` (reservationDraft, companyInfo). |
| **Composants** | Upload, formulaire, pas de TicketOnline |
| **Firestore** | `companies`, `paymentMethods`, puis `updateDoc` sur la réservation (statut `preuve_recue`, preuveUrl, etc.) |
| **Routes** | `/:slug/upload-preuve` (RouteResolver), `/:slug/upload-preuve/:id` (AppRoutes → LegacyUploadRedirect) |
| **Utilisé** | ⚠️ Legacy / alternatif. Flux principal = envoi preuve **inline** dans ReservationClientPage (`submitProofInline`). |

### 6. Page détail réservation actuelle

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/pages/ReservationDetailsPage.tsx` |
| **Rôle** | Détail d’une réservation : résolution par `id` + `slug` ou par `publicToken` (mon-billet?r=xxx). Timeline « Suivi de paiement » (en ligne), bandeau statut, détails voyage. Si billet disponible → redirection auto vers `/receipt/:id`. Bouton « Voir mon billet » (actif seulement si `confirme` ou guichet). |
| **Composants** | ChevronLeft, MapPin, Clock, Calendar, CheckCircle, XCircle, Loader2, Ticket, Confetti, LazyLoadImage, pas de composant billet (TicketOnline) ici ; le billet est sur ReceiptEnLignePage. |
| **Firestore** | `companies` (slug), `collectionGroup('reservations')` (by id ou by publicToken), puis `onSnapshot` sur le doc réservation. |
| **Routes** | `/:slug/reservation/:id`, `/:slug/mon-billet` (AppRoutes), `/:slug/details`, `/:slug/reservation` (RouteResolver) |
| **Utilisé** | ✅ Actif. Utilisée comme **page détail** avant/après billet ; **pas** comme rendu billet (le billet = ReceiptEnLignePage + TicketOnline). |

### 7. Page billet (reçu)

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/pages/ReceiptEnLignePage.tsx` |
| **Rôle** | Affiche le **billet** (TicketOnline) : header compagnie, statut, trajet, paiement, **QR**. PDF + imprimer. Chargement résa par `id` (referenceCode ou __name__). |
| **Composants** | `TicketOnline` (avec QR), ChevronLeft, Download, Printer, Home |
| **Firestore** | `collectionGroup('reservations')` (referenceCode ou id), `companies/{companyId}` (companyInfo). Pas de condition sur statut pour afficher la page : la résa est chargée telle quelle. |
| **Routes** | `/:slug/receipt/:id` (logique ; rendu via RouteResolver pour `subPath === "receipt"` ou `"confirmation"` ; id = segment suivant dans l’URL). |
| **Utilisé** | ✅ Actif. C’est la **page qui rend le billet** (en ligne et guichet). |

### 8. Page mes réservations

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/pages/ClientMesReservationsPage.tsx` |
| **Rôle** | Saisie **téléphone** → recherche de toutes les réservations (tous statuts, tous canaux) pour ce numéro (optionnellement filtré par slug). Liste avec statut, canal, « Voir billet » → `/:slug/reservation/:id`. |
| **Composants** | ChevronLeft, Search, Phone, Calendar, MapPin, Users, CreditCard, FileText, StatusPill |
| **Firestore** | `companies` (slug), puis pour chaque agence `reservations` avec `where('telephone','==', phone)`. |
| **Routes** | `/:slug/mes-reservations`, `/mes-reservations` (AppRoutes) |
| **Utilisé** | ✅ Actif. Pas de page « Mes Billets » distincte : une seule liste « Mes réservations » avec lien « Voir billet ». |

### 9. Page « Mes Billets »

**Inexistante.** Les billets sont consultés soit depuis « Mes réservations » (Voir billet → détail → receipt), soit via lien direct (mon-billet?r=token).

### 10. Header public

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/layout/CompanyPublicHeader.tsx` |
| **Rôle** | Barre publique : logo, nom compagnie, LanguageSwitcher, style couleurs. |
| **Composants** | User, LanguageSwitcher |
| **Firestore** | Aucun |
| **Routes** | Utilisé dans PublicCompanyPage (passé en `Header`) |
| **Utilisé** | ✅ Actif |

### 11. Hero section

Deux variantes :

- **Vitrine compagnie** : `src/modules/plateforme/components/HeroSection.tsx` — formulaire départ/arrivée, navigation `/resultats` (state). Utilisé par **PublicCompanyPage** via import `@/modules/plateforme/components/HeroSection`.
- **Public locale** : `src/modules/compagnie/public/components/HeroSection.tsx` — même idée, texte « Teliya », navigate vers `/resultats`. **Non utilisé** par PublicCompanyPage (qui utilise celui de plateforme).

Donc **Hero « actif »** = `src/modules/plateforme/components/HeroSection.tsx` sur la page d’accueil publique.

### 12. RouteResolver

| Attribut | Détail |
|----------|--------|
| **Chemin** | `src/modules/compagnie/public/router/RouteResolver.tsx` |
| **Rôle** | Résout `/:slug` → chargement compagnie (getDocs + getDoc, puis `onSnapshot` doc company). Gardes : `publicPageEnabled`, `onlineBookingEnabled`. Selon `subPath` (parts[1]) rend : resultats, booking, mes-reservations, mentions, confidentialite, receipt/confirmation, upload-preuve, details/reservation, ou accueil (null). Fournit CurrencyProvider + ErrorBoundary. |
| **Firestore** | `companies` (where slug / doc id), `onSnapshot(companies/{id})`. |
| **Routes** | Monté sur `/:slug/*` (AppRoutes). Subpaths : resultats, booking, mes-reservations, receipt, confirmation, upload-preuve, details, reservation, null (accueil). |
| **Utilisé** | ✅ Actif. Cœur du routage public par slug. |

### 13. Paramètres SEO / public

- **SEO** : Aucun composant dédié (Helmet/meta) trouvé dans le module public. Titre / meta à gérer au niveau app ou index.
- **Paramètres publics** :  
  - **Company** (Firestore) : `publicPageEnabled`, `onlineBookingEnabled` (RouteResolver + PublicCompanyPage).  
  - **Types** : `src/types/companyTypes.ts` — `publicPageEnabled`, `onlineBookingEnabled`, `footerConfig` (customLinks, showSocial, etc.).  
  - **Footer** : `src/modules/compagnie/public/components/Footer.tsx` — utilise `company.footerConfig` (showAbout, showContact, customLinks, etc.).  
- Pas de `publicSettings` ou bloc SEO dédié dans le module public.

### 14. Logique liée aux statuts

| Fichier | Statuts / logique |
|---------|-------------------|
| **ReservationClientPage** | Création : `en_attente_paiement`. Calcul places : `['confirme','payé']`. Blocage UI : `preuve_recue`, `confirme`. Envoi preuve → `preuve_recue`. |
| **ReservationDetailsPage** | `showTicketDirect(reservation)` = billet dispo si `canal === 'guichet'` ou `statut === 'confirme'`. Timeline + bandeau selon statut (confirme, verification, refuse, annule). Redir. vers receipt si billet dispo. |
| **ReceiptEnLignePage** | Affiche TicketOnline avec `reservation.statut` et `reservation.canal` ; pas de masquage conditionnel du billet (page chargée si on a l’URL). |
| **TicketOnline** | Reçoit `statut` en prop (affiché tel quel), pas de condition sur QR. |
| **ClientMesReservationsPage** | StatusPill selon statut (payé, confirmé, en attente, annulé, refusé). Pas de filtre statut pour la liste. |
| **expireHolds** (functions) | `en_attente_paiement` + `holdUntil < now` → `annulé`. |
| **submitProof** (functions) | `en_attente_paiement` → `preuve_recue`. |
| **ReservationsEnLignePage** (compagnie) | Admin : `preuve_recue` → `confirme`. |
| **seats.ts** | Places « occupées » : `payé`, `preuve_recue` (listenRemainingSeatsForDate). |

**Statuts canoniques** (types) : `en_attente`, `paiement_en_cours`, `preuve_recue`, `verification`, `confirme`, `payé`, `embarqué`, `refuse`, `annulé` (voir `src/types/reservation.ts`).

---

## Synthèse flux complet

1. **Recherche** : Accueil (PublicCompanyPage) ou ResultatsAgencePage → départ/arrivée.
2. **Réservation** : ReservationClientPage (booking/reserver) → date/heure, perso, « Passer au paiement » → création doc `reservations` (statut `en_attente_paiement`, `holdUntil` 15 min).
3. **Preuve** : Même page : choix moyen de paiement, référence → `submitProofInline` → `updateDoc` → `preuve_recue`, navigation vers `/:slug/reservation/:id`. (Alternative : UploadPreuvePage.)
4. **Validation** : Côté compagnie (ReservationsEnLignePage) : passage `preuve_recue` → `confirme`.
5. **Billet** : ReservationDetailsPage : si `confirme` ou guichet → redir. vers `/:slug/receipt/:id` → ReceiptEnLignePage → TicketOnline (QR + PDF/imprimer).
6. **Portefeuille** : ClientMesReservationsPage (téléphone) → liste résas → « Voir billet » → détail puis receipt.

---

# PROMPT 2 — Analyse actuelle du rendu billet

## Quand le billet est affiché

- **preuve_recue** : La **page détail** (ReservationDetailsPage) s’affiche ; le bouton « Voir mon billet » est **désactivé** (« Billet disponible après confirmation »). Aucun rendu TicketOnline pour ce statut depuis la détail.
- **confirme** : Billet considéré disponible. ReservationDetailsPage redirige vers `/:slug/receipt/:id`. **ReceiptEnLignePage** affiche **TicketOnline** (avec QR).
- **payé (guichet)** : Idem : `showTicketDirect` = true car `canal === 'guichet'`. Redirection receipt → ReceiptEnLignePage → TicketOnline avec QR.

## Composant qui rend le billet

- **ReceiptEnLignePage** : charge la réservation (par id ou referenceCode), charge company + agence, puis rend **TicketOnline** avec toutes les props (companyName, logoUrl, primaryColor, receiptNumber, statut, nomClient, telephone, depart, arrivee, date, heure, seats, canal, montant, **qrValue**, emissionDate, paymentMethod).
- **TicketOnline** (`src/modules/compagnie/public/components/ticket/TicketOnline.tsx`) : carte blanche avec header, statut, canal, client, trajet, paiement, **QR** (react-qr-code), messages officiels. Pas de condition sur statut pour afficher ou masquer le QR.

## QR conditionnel

- **Actuellement non.** TicketOnline affiche toujours le bloc QR avec `qrValue` (origine + receiptNumber). ReceiptEnLignePage n’est censée être atteinte que lorsque le billet est « disponible » (redirection depuis ReservationDetailsPage), mais la page ne vérifie pas le statut en entrée ; si on met l’URL receipt directement, le billet s’affiche quand même avec QR. Pour un vrai « QR uniquement si statut valide », il faudrait une condition dans ReceiptEnLignePage ou TicketOnline (ex. afficher QR seulement si `statut === 'confirme' || statut === 'payé'`).

## Guichet vs en ligne

| Aspect | Guichet | En ligne |
|--------|---------|----------|
| Statut initial | `payé` | `en_attente_paiement` → `preuve_recue` → `confirme` |
| Billet (showTicketDirect) | Oui (canal guichet) | Oui seulement si `statut === 'confirme'` |
| Page détail | Timeline « Suivi de paiement » masquée (canal !== 'en_ligne') | Timeline affichée |
| TicketOnline | Même composant ; `canal` = « guichet », `statut` = « payé » | `canal` = « en_ligne », `statut` = « confirme » ou « preuve_recue » selon chargement |
| Accès receipt | Possible directement (agence peut donner lien) | Après confirmation admin |

## Page détail réservation comme billet

- **Non.** La page détail (ReservationDetailsPage) affiche : timeline, bandeau statut, détails voyage, bouton « Voir mon billet ». Elle **ne rend pas** TicketOnline. Le billet est rendu **uniquement** sur ReceiptEnLignePage via TicketOnline.

## Où le statut influence l’UI

- **ReservationDetailsPage** :  
  - `showTicketDirect` → redirection receipt et état du bouton « Voir mon billet ».  
  - Bandeau couleur + icône (confirme, verification, refuse, annule).  
  - Timeline (étapes) pour canal en_ligne.  
- **ReservationClientPage** : blocage formulaire / étapes si `preuve_recue` ou `confirme` ; calcul des places (confirme + payé).  
- **TicketOnline** : affichage du libellé `statut` et `canal` ; pas de logique conditionnelle sur l’affichage du QR.

---

# PROMPT 3 — Unification en portefeuille « Mes Billets »

## Objectifs rappel

- Une seule page « Mes Billets » : tous les billets (canal en_ligne + guichet).
- Filtrer par téléphone.
- Statut dynamique.
- QR uniquement si statut valide (confirme ou payé).
- Transformer la page détail réservation en composant **TicketCard** réutilisable.

## Fichiers à modifier / créer

1. **Composant réutilisable TicketCard**  
   - **Créer** : `src/modules/compagnie/public/components/ticket/TicketCard.tsx`.  
   - Extraire de ReservationDetailsPage le bloc « détail réservation » (bandeau statut, détails voyage, bouton « Voir billet ») en un composant qui prend `reservation`, `companyInfo`, `onViewTicket`, `primaryColor`, etc.  
   - Utilisable dans : ReservationDetailsPage (page détail), ClientMesReservationsPage (liste), et future page « Mes Billets ».

2. **TicketOnline (QR conditionnel)**  
   - **Modifier** : `src/modules/compagnie/public/components/ticket/TicketOnline.tsx`.  
   - Ajouter une prop `showQr?: boolean` (défaut `true`) ou déduire de `statut` : n’afficher la section QR que si `statut` est `confirme` ou `payé`.  
   - **Modifier** : `ReceiptEnLignePage.tsx` — passer `showQr` selon `reservation.statut` (ou laisser TicketOnline le gérer en interne).

3. **Page « Mes Billets »**  
   - **Option A** : Étendre **ClientMesReservationsPage** pour avoir deux onglets / sections : « Mes réservations » (toutes) et « Mes billets » (filtré : `statut in ['confirme','payé']` ou canal guichet).  
   - **Option B** : **Créer** `ClientMesBilletsPage.tsx` : même entrée par téléphone, même source Firestore que ClientMesReservationsPage, mais filtrer côté affichage sur `statut === 'confirme' || statut === 'payé'` (et éventuellement canal). Afficher une liste de **TicketCard** avec « Voir billet » (lien receipt).  
   - Recommandation : **Option B** pour une page dédiée « Mes Billets » plus claire, en réutilisant la logique de fetch (téléphone + companies/agences/reservations) déjà dans ClientMesReservationsPage (ex. hook `useReservationsByPhone(phone, slug)`).

4. **ReservationDetailsPage**  
   - **Modifier** : Remplacer le bloc détail actuel par `<TicketCard reservation={reservation} companyInfo={...} onViewTicket={...} />` (+ header + CTA bas). Garder la résolution par id/token et l’effet de redirection vers receipt.

5. **ClientMesReservationsPage**  
   - **Modifier** : Pour chaque ligne, soit garder le bouton « Voir billet » actuel (vers reservation/:id), soit utiliser un mini TicketCard ou un lien direct « Voir billet » vers `/:slug/receipt/:id` si statut confirme/payé pour éviter le passage systématique par la détail.

6. **Routes**  
   - **AppRoutes.tsx** : Ajouter `/:slug/mes-billets` (et éventuellement `/mes-billets`) vers la nouvelle page Mes Billets.  
   - **RouteResolver** : Si on garde tout sous `/:slug/*`, ajouter le cas `subPath === "mes-billets"` → nouvelle page.

7. **Navigation / liens**  
   - Header ou footer public : lien « Mes Billets » vers `/:slug/mes-billets` (et conserver « Mes réservations » vers `/:slug/mes-reservations`).

## Approche recommandée (sans casser l’existant)

- Introduire **TicketCard** d’abord, l’utiliser dans ReservationDetailsPage (refactor léger).
- Ajouter **Mes Billets** comme nouvelle page qui réutilise le même modèle de données que Mes réservations (téléphone + Firestore), avec filtre `confirme` / `payé` et liste de TicketCard + lien receipt.
- Rendre le **QR conditionnel** dans TicketOnline (ou ReceiptEnLignePage) pour n’afficher le QR que si statut confirme ou payé.
- Garder ReservationDetailsPage et ReceiptEnLignePage telles quelles en termes de URLs ; Mes Billets devient un second point d’entrée « portefeuille » à côté de Mes réservations.

---

# PROMPT 4 — Auth légère téléphone (wallet sécurisé)

## Objectifs

- Réservation sans compte.
- Consultation billets via numéro téléphone.
- Sécurisation par OTP SMS.
- Session temporaire.
- Éviter l’exposition des billets d’un autre utilisateur.

## Architecture proposée

1. **Pas de compte obligatoire**  
   - La réservation reste sans auth (comme aujourd’hui).  
   - La consultation « Mes réservations / Mes billets » reste déclenchée par la saisie du numéro ; l’auth légère sert à **vérifier** que le demandeur est bien propriétaire du numéro avant d’afficher les données.

2. **Flux OTP proposé**  
   - Page d’entrée : saisie du **téléphone** (comme ClientMesReservationsPage actuelle).  
   - Au clic « Continuer » / « Voir mes billets » :  
     - Envoi d’un **OTP** par SMS (Firebase Auth `signInWithPhoneNumber` ou provider SMS type Twilio/autre).  
     - Affichage d’un écran « Saisir le code reçu par SMS ».  
     - Vérification du code → création d’une **session temporaire** (ex. token JWT custom ou session Firestore avec `phoneNumber` + `expiresAt`).  
   - Une fois la session validée : affichage de la liste des réservations pour ce numéro (comme aujourd’hui), sans ressaisir le téléphone à chaque fois pendant la durée de la session.

3. **Où intégrer la logique**  
   - **Nouveau** : `src/modules/compagnie/public/pages/PhoneAuthGate.tsx` (ou wrapper) : composant qui affiche soit le formulaire téléphone + envoi OTP + saisie code, soit les enfants (liste résas/billets) si la session téléphone est valide.  
   - **Modifier** : `ClientMesReservationsPage` et la future `ClientMesReservationsPage` / « Mes Billets » : au lieu d’afficher directement la liste après saisie du téléphone, envelopper dans `PhoneAuthGate` :  
     - Étape 1 : saisie téléphone.  
     - Étape 2 : envoi OTP + saisie code.  
     - Étape 3 : session valide → fetch réservations par téléphone (comme aujourd’hui) et affichage.  
   - **Backend** :  
     - Option A : Firebase Auth (signInWithPhoneNumber + RecaptchaVerifier) ; après succès, utiliser le token ou l’UID pour associer une « session wallet » (ex. document Firestore `walletSessions/{sessionId}` : phone, expiresAt).  
     - Option B : Cloud Function « sendOTP » (génère code, stocke hash + expiration en Firestore ou Redis), puis « verifyOTP » ; en cas de succès, émet un JWT ou session id avec phone + expiration. Le client envoie ce token dans les requêtes « Mes réservations » / « Mes billets ».

4. **Pages à « protéger »**  
   - **Mes réservations** (`/:slug/mes-reservations`, `/mes-reservations`) : après saisie téléphone, exiger OTP avant d’afficher la liste.  
   - **Mes billets** (`/:slug/mes-billets`, `/mes-billets`) : idem.  
   - **Détail réservation** (`/:slug/reservation/:id`) : actuellement accessible par id (et token public pour mon-billet). Pour un accès « depuis le portefeuille », on peut exiger que la requête provienne d’une session téléphone déjà validée (même numéro que la réservation) ; sinon, garder l’accès par lien direct (mon-billet?r=token) sans auth.  
   - **Receipt** (`/:slug/receipt/:id`) : idem — soit accès par lien direct (partage du lien billet), soit depuis portefeuille avec session téléphone.

5. **Éviter l’exposition des billets d’un autre utilisateur**  
   - Côté **liste** : ne retourner que les réservations dont `telephone` est égal au numéro de la session OTP validée (déjà le cas si on filtre par téléphone côté client ; côté serveur, si on expose une API « mes réservations », la filtrer par le numéro associé au JWT/session).  
   - Côté **détail / receipt** : si l’utilisateur ouvre `/:slug/reservation/:id` ou `/:slug/receipt/:id` depuis le portefeuille (après OTP), vérifier que la réservation `id` appartient bien au numéro de la session ; sinon 403. Pour l’accès par lien public (mon-billet?r=token), garder la résolution par token sans exiger OTP (le token secret suffit).

6. **Session temporaire**  
   - Durée de vie courte (ex. 15–30 min) pour la session « wallet ». Stocker en mémoire ou localStorage (ex. `walletSession: { phone, expiresAt, token }`). À l’expiration, réafficher la saisie téléphone + OTP.

---

# PROMPT 5 — Refactor UX portefeuille transport

## Pages attendues

- Accueil  
- Mes Réservations  
- Mes Billets  
- Aide  
- Page Billet dynamique  

## Correspondance avec l’existant

| Page attendue | Existant | Action |
|---------------|----------|--------|
| **Accueil** | PublicCompanyPage | Conserver ; éventuellement enrichir (liens Mes Réservations / Mes Billets / Aide). |
| **Mes Réservations** | ClientMesReservationsPage | Conserver ; ajouter auth OTP (Prompt 4) et lien depuis l’accueil. |
| **Mes Billets** | — | Créer (Prompt 3) ; filtre confirme/payé, liste TicketCard + lien receipt. |
| **Aide** | Pas de page dédiée | Créer `AidePage.tsx` (FAQ, contact, comment réserver, comment voir mon billet). |
| **Page Billet dynamique** | ReceiptEnLignePage + TicketOnline | Conserver ; s’assurer que l’URL est stable (/:slug/receipt/:id) et que le QR est conditionnel (Prompt 3). |

## Nouvelles pages à créer

1. **Mes Billets** : `ClientMesBilletsPage.tsx` (voir Prompt 3).  
2. **Aide** : `AidePage.tsx` (ou `HelpPage.tsx`) — contenu paramétrable si possible via `publicSettings` / SEO.

## Pages à modifier

1. **PublicCompanyPage** : Ajouter dans le header ou le footer des liens clairs vers « Mes Réservations », « Mes Billets », « Aide » (vers `/:slug/mes-reservations`, `/:slug/mes-billets`, `/:slug/aide`).  
2. **ClientMesReservationsPage** : Intégration auth OTP (Prompt 4) ; optionnel : utiliser TicketCard dans la liste.  
3. **ReservationDetailsPage** : Remplacer le bloc détail par TicketCard (Prompt 3).  
4. **ReceiptEnLignePage** / **TicketOnline** : QR conditionnel (Prompt 3).

## Navigation

- **Header public** (CompanyPublicHeader) : liens Accueil, Mes Réservations, Mes Billets, Aide (si on veut une nav globale).  
- **Footer** : déjà des liens ; ajouter « Mes Billets » et « Aide » dans `footerConfig.customLinks` ou en dur pour le portefeuille.  
- **RouteResolver** : ajouter `subPath === "mes-billets"` → ClientMesBilletsPage ; `subPath === "aide"` → AidePage.  
- **AppRoutes** : ajouter `/:slug/mes-billets`, `/:slug/aide` (ou tout laisser sous RouteResolver).

## Paramétrage (publicSettings / SEO)

- **Company** (Firestore) : déjà `publicPageEnabled`, `onlineBookingEnabled`. On peut ajouter un champ `publicSettings` (objet) avec par exemple :  
  - `helpPageContent` (texte ou bloc HTML/FAQ),  
  - `showMesBilletsLink`, `showAideLink`,  
  - `footerLinks` (label + url pour Mes Réservations, Mes Billets, Aide).  
- **SEO** : ajouter au niveau layout public ou par page des balises meta (titre, description) soit en dur, soit depuis `company` (ex. `company.accroche`, `company.description`). Idéalement un composant `PublicSEO` ou utilisation de react-helmet dans RouteResolver selon la page rendue.

---

# Ordre recommandé des implémentations

1. **Prompt 1** (cartographie) — fait ; ce document.  
2. **Prompt 2** (analyse billet) — fait ; ci‑dessus.  
3. **Prompt 3** — TicketCard, Mes Billets, QR conditionnel.  
4. **Prompt 4** — Auth OTP + protection Mes Réservations / Mes Billets.  
5. **Prompt 5** — Aide, liens navigation, publicSettings/SEO et cohérence UX portefeuille.

Fin du document.
