# Fix — Reservation resolution architecture (publicReservations)

**Objectif :** Supprimer l’usage de `collectionGroup` + `documentId()` pour la résolution des réservations (source d’erreurs « odd number of segments ») et s’appuyer sur une collection dédiée `publicReservations`.

---

## 1. Fichiers modifiés

| Fichier | Modification |
|---------|---------------|
| **`src/modules/compagnie/public/utils/resolveReservation.ts`** | Réécrit : plus de `collectionGroup`, plus de `documentId()`. Résolution par lecture de `publicReservations/{reservationId}` (by id) ou par requête `publicReservations` avec `slug` + `publicToken` (by token). |
| **`src/modules/compagnie/public/pages/ReservationClientPage.tsx`** | À la création d’une réservation : après `addDoc` + `updateDoc` (publicToken/publicUrl), appel à `setDoc(doc(db, 'publicReservations', refDoc.id), { reservationId, companyId, agencyId, slug, publicToken, createdAt })`. Import de `setDoc` ajouté. |
| **`firestore.rules`** | Règles pour `publicReservations/{reservationId}` : `get, list` et `create` autorisés pour tous ; `update, delete` refusés. |
| **`firestore.indexes.json`** | Index composite sur la collection `publicReservations` : champs `slug` (ASC) et `publicToken` (ASC) pour la résolution par token. |

---

## 2. Confirmation : plus d’usage de collectionGroup / documentId pour la résolution

- **Avant :**  
  - `resolveReservationById` : `collectionGroup(db, 'reservations')` + `where(documentId(), '==', reservationId)` puis filtrage par companyId.  
  - `resolveReservationByToken` : `collectionGroup(db, 'reservations')` + `where('companySlug', '==', slug)` + `where('publicToken', '==', token)`.

- **Après :**  
  - Aucun `collectionGroup`.  
  - Aucun `documentId()`.  
  - Résolution uniquement par :  
    1. **Par id :** `getDoc(doc(db, 'publicReservations', reservationId))` → extraction de `companyId`, `agencyId` → construction de la ref `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}`.  
    2. **Par token :** `getDocs(query(collection(db, 'publicReservations'), where('slug', '==', slug), where('publicToken', '==', token), limit(1)))` → même construction de ref à partir du document trouvé.

Les autres usages de `collectionGroup` dans le projet (CEO, Admin, Plateforme, ReceiptGuichetPage, etc.) concernent des listes ou agrégats, pas la résolution d’une réservation par id/token ; ils ne sont pas modifiés par ce correctif.

---

## 3. Nouvelle logique de résolution

### Collection `publicReservations`

- **Chemin :** `publicReservations/{reservationId}` (l’id du document = id de la réservation).
- **Champs :**  
  `reservationId`, `companyId`, `agencyId`, `slug`, `publicToken`, `createdAt`.
- **Création :** Au moment de la création de la réservation dans `ReservationClientPage`, après l’`addDoc` dans `companies/.../reservations` et l’`updateDoc` (publicToken, publicUrl), un document est créé dans `publicReservations` avec ces champs.

### `resolveReservationById(slug, reservationId)`

1. `getDoc(doc(db, 'publicReservations', reservationId))`.  
2. Si le document n’existe pas → erreur « Réservation introuvable ou expirée. ».  
3. Lire `companyId`, `agencyId` (et optionnellement `slug` pour vérifier la cohérence).  
4. Si `slug` présent et différent du slug demandé → même erreur.  
5. Retourner `{ ref: doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId), companyId, agencyId }`.

### `resolveReservationByToken(slug, token)`

1. `getDocs(query(collection(db, 'publicReservations'), where('slug', '==', slug), where('publicToken', '==', token), limit(1)))`.  
2. Si aucun document → erreur « Réservation introuvable ou expirée. ».  
3. Prendre le premier document : `reservationId` = `data.reservationId ?? doc.id`, plus `companyId`, `agencyId`.  
4. Retourner `{ ref, companyId, agencyId, hardId: reservationId }`.

La lecture réelle de la réservation (détails, statut, etc.) reste :  
`getDoc(ref)` ou `onSnapshot(ref)` sur `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}`.

---

## 4. Rétrocompatibilité

- **Réservations créées avant ce correctif :** Il n’existe pas de document dans `publicReservations` pour elles.  
  Lors d’un appel à `resolveReservationById` ou `resolveReservationByToken`, la résolution échoue et le message **« Réservation introuvable ou expirée. »** est renvoyé (pas de crash, pas d’erreur « odd number of segments »).
- Aucune migration automatique des anciennes réservations n’a été ajoutée ; si besoin, un script peut peupler `publicReservations` à partir des réservations existantes.

---

**Résumé :** La résolution des réservations (détails, reçu, mon-billet) passe uniquement par la collection `publicReservations` et plus par `collectionGroup` ni `documentId()`.
