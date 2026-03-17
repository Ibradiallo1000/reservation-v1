# Audit — Flux de réservation publique TELIYA

## Objectif
Parcours fluide (recherche → réservation → paiement → billet) sans blocage et sans faille de sécurité.

---

## 1. Firestore rules — État actuel et corrections

### 1.1 Lecture publique (autoriser sans auth)

| Collection / chemin | Règle actuelle | Conforme |
|---------------------|----------------|----------|
| **companies** | `get, list: if true` | ✅ |
| **companies/{id}/agences** | `get, list: if request.auth == null \|\| ...` | ✅ |
| **companies/{id}/tripInstances** | `get, list: if true` | ✅ |
| **companies/{id}/agences/{aid}/weeklyTrips** | `get, list: if request.auth == null \|\| ...` | ✅ |
| **collectionGroup weeklyTrips** | `get, list: if true` | ✅ |
| **collectionGroup agences** | `get, list: if true` | ✅ |

### 1.2 Création réservations

| Règle | État |
|-------|------|
| `companies/{cid}/agences/{aid}/reservations` create | `allow create: if request.auth == null \|\| ...` ✅ |

### 1.3 Lecture des réservations (sécurité)

**Problème actuel** :  
`allow get, list: if request.auth == null \|\| ...` → un visiteur non connecté peut **get** et **list** toutes les réservations d’une agence.

**Correction** :  
- Réserver **get** et **list** aux seuls utilisateurs authentifiés de la compagnie.  
- Accès public aux réservations **uniquement via** la collection **publicReservations** et le **publicToken** (accès par id de document = token, pas par id de réservation).

**Règle cible** :  
- `reservations` : `get, list: if isAuth() && (userCompanyId() == companyId || getUserRole() == 'admin_platforme')`.  
- `publicReservations` : `get, create, update: if true` ; **list et delete : if false** (accès uniquement par id = token).

### 1.4 publicReservations

- **Actuel** : `get, list, create: if true` → la **list** permet d’énumérer tous les documents.  
- **Correction** :  
  - Utiliser le **publicToken** comme **id** du document dans `publicReservations` (un doc par token).  
  - Autoriser **get** et **create** (et **update** pour synchroniser le statut), **interdire list** (et delete si non utile).

---

## 2. Création réservation (code)

- **publicToken** : généré (ex. `randomToken()`) et stocké sur la réservation + dans `publicReservations`. ✅ (ReservationClientPage)
- **publicUrl** : généré avec `r=${token}` et stocké sur la réservation. ✅
- **Stockage** :  
  - Réservation dans `companies/{cid}/agences/{aid}/reservations`. ✅  
  - Un document `publicReservations/{reservationId}` est créé avec `reservationId`, `companyId`, `agencyId`, `slug`, `publicToken`.  
- **Sécurisation** : en plus, écrire un document **publicReservations/{token}** (id = token) contenant le snapshot nécessaire au billet / paiement, et n’utiliser que ce doc pour l’accès public (pas de lecture directe de `reservations`).

---

## 3. Accès billet

- **Actuel** :  
  - Par token : `resolveReservationByToken` fait une **query** `publicReservations` sur `slug` + `publicToken`.  
  - Par id : `resolveReservationById` fait **getDoc(publicReservations, reservationId)**.  
- **Cible** :  
  - Accès **uniquement par token** : **getDoc(publicReservations, token)** (pas de query, pas d’accès par `reservationId` côté public).  
  - Pour les anciens liens avec `reservationId`, garder un document minimal **publicReservations/{reservationId}** contenant uniquement `{ token }` (et éventuellement companyId, agencyId, slug) pour rediriger vers l’URL avec `r=token` et utiliser ensuite **getDoc(publicReservations, token)**.

---

## 4. Pages publiques

| Page | Accès | Dépendance auth / privé |
|------|--------|---------------------------|
| **ReservationClientPage** (`/:slug/reserver`) | Sans auth | Données publiques (companies, agences, tripInstances, weeklyTrips). ✅ |
| **PaymentMethodPage** (`/:slug/payment`) | Sans auth, id ou `r=token` dans state/URL | Lit `publicReservations` (par id ou token). À faire : n’utiliser que token + getDoc. |
| **ReservationDetailsPage** (`/:slug/mon-billet`, `/:slug/reservation/:id`) | Sans auth, token (query `r=`) ou id | Résolution via `resolveReservationByToken` ou `resolveReservationById`. À faire : afficher uniquement à partir de `publicReservations` (get par token). |
| **UploadPreuvePage** | Sans auth, id ou token | Lit `publicReservations` puis met à jour la réservation (et idéalement `publicReservations/{token}`). ✅ (après corrections) |

Aucune de ces pages ne doit dépendre d’un **user Firebase auth** ni d’un accès privé Firestore (get/list sur `reservations`).

---

## 5. Routes (companies) pour le calcul des places

- **Actuel** : `companies/{id}/routes` et `stops` : `get, list: if isAuth() && ...`  
- **Risque** : le flux public qui appelle `getRemainingStopQuota` → `getRouteStops` peut recevoir **permission-denied** pour un visiteur non connecté.  
- **Recommandation** : autoriser la **lecture** des routes et stops pour le calcul des places (données non sensibles) :  
  `allow get, list: if true` pour `routes` et `routes/{routeId}/stops`.

---

## 6. Résumé des corrections à appliquer

1. **Firestore**  
   - **reservations** : retirer l’accès public à get/list ; garder create et update (publicToken/publicUrl, preuve, etc.) pour les visiteurs.  
   - **publicReservations** : autoriser **get, create, update** ; **interdire list (et delete)**.  
   - **routes / stops** : autoriser **get, list** pour tous (lecture seule) si nécessaire pour le flux public.

2. **Code**  
   - Utiliser le **publicToken** comme **id** du document principal dans `publicReservations` (doc principal = `publicReservations/{token}` avec snapshot complet).  
   - Optionnel : garder un doc **publicReservations/{reservationId}** minimal (ex. `{ token }`) pour redirection depuis les anciens liens.  
   - Accès billet / paiement : **uniquement via getDoc(publicReservations, token)** (pas de getDoc sur `reservations` pour le public).  
   - À la soumission de preuve : mettre à jour la réservation **et** `publicReservations/{token}` (statut) pour garder le billet à jour sans lire `reservations`.

3. **Parcours**  
   - Recherche → réservation : sans auth, données publiques + création réservation + création/mise à jour publicReservations.  
   - Paiement / preuve : sans auth, accès par token via `publicReservations`.  
   - Billet : sans auth, accès par token via `publicReservations` uniquement.

---

## 7. Résultat attendu

- Aucun blocage utilisateur sur le parcours public.  
- Parcours fluide de bout en bout.  
- Sécurité maintenue : pas d’accès aux autres réservations (pas de list sur reservations ni sur publicReservations ; accès billet uniquement par token).

---

## 8. Corrections appliquées (résumé)

- **Firestore rules** : `reservations` get/list = auth uniquement ; `publicReservations` get, create, update autorisés, list/delete refusés ; collection group reservations = isAuth + company ; routes/stops = lecture publique.
- **Code** : ReservationClientPage écrit publicReservations/{token} (snapshot) + publicReservations/{reservationId} (token, ids, slug). resolveReservationByToken = getDoc(publicReservations, token) ; resolveReservationById retourne snapshot + publicToken. ReservationDetailsPage affiche et s’abonne via snapshot / onSnapshot(publicReservations, token) ; soumission preuve met à jour réservation + publicReservations. PaymentMethodPage, UploadPreuvePage, RouteResolver, ReservationClientPage (consultation) utilisent resolveReservationById + snapshot uniquement.
