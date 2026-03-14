# Migration — tripInstances comme source de vérité des places

Ce document décrit les changements appliqués pour que **tripInstances** soit la seule source de vérité pour les places restantes (remainingSeats = seatCapacity - reservedSeats). Les **weeklyTrips** ne servent plus qu’à générer les créneaux (templates).

---

## 1. Fichiers modifiés

| Fichier | Modifications |
|---------|----------------|
| **src/modules/compagnie/tripInstances/tripInstanceService.ts** | runTransaction pour increment/decrement reservedSeats ; id déterministe (buildTripInstanceId, createTripInstance(optionalId)) ; getOrCreateTripInstanceForSlot avec id déterministe quand weeklyTripId fourni. |
| **src/modules/compagnie/public/pages/ReservationClientPage.tsx** | Chargement des créneaux via listTripInstancesByRouteAndDate ; création lazy depuis weeklyTrips si vide ; affichage remainingSeats = seatCapacity - reservedSeats ; suppression du calcul à partir des réservations ; suppression de getOrCreate dans createReservationDraft (selectedTrip.id = tripInstanceId). |
| **src/modules/agence/guichet/pages/AgenceGuichetPage.tsx** | Chargement des créneaux via listTripInstancesByRouteAndDate + filtre agencyId ; création lazy depuis weeklyTrips de l’agence ; suppression de computeRemainingSeats ; passage de tripInstanceId à createGuichetReservation ; mise à jour optimiste de remainingSeats après vente ; listener réservations ne met plus à jour les places des trips. |
| **src/modules/agence/services/guichetReservationService.ts** | Après création de la réservation : appel à incrementReservedSeats(companyId, tripInstanceId, seats). Si tripInstanceId absent et trajetId au format weeklyTripId_date_heure, résolution via findTripInstanceBySlot puis increment. |
| **src/modules/agence/services/reservations.ts** | Dans cancelReservation : après la transaction, appel à decrementReservedSeats(companyId, tripInstanceId, seatsGo + seatsReturn) lorsque la réservation a un tripInstanceId. |
| **src/modules/compagnie/finances/pages/ReservationsEnLignePage.tsx** | Dans handleRefuse : après updateDoc (statut → refuse), appel à decrementReservedSeats(companyId, tripInstanceId, seats) lorsque la réservation a tripInstanceId et seats. |

---

## 2. Changements appliqués (détail)

### 2.1 tripInstanceService.ts

- **runTransaction** pour `incrementReservedSeats` : lecture du tripInstance, vérification capacité (pas de surréservation), puis update avec increment(seats).
- **runTransaction** pour `decrementReservedSeats` : lecture du tripInstance, delta = min(seats, reservedSeats), puis update avec increment(-delta) pour ne jamais passer en négatif.
- **buildTripInstanceId(weeklyTripId, date, departureTime)** : id déterministe `weeklyTripId_date_HH-mm` (heure avec `-` au lieu de `:`).
- **createTripInstance(companyId, params, optionalId?)** : si `optionalId` fourni, utilisation de cet id et création en transaction (get + set si absent) pour éviter les doublons.
- **getOrCreateTripInstanceForSlot** : si `weeklyTripId` + date + departureTime sont fournis, utilisation de l’id déterministe et création atomique ; sinon comportement inchangé (findTripInstanceBySlot + createTripInstance).

### 2.2 ReservationClientPage.tsx

- Remplacement de la logique « weeklyTrips + agrégat réservations » par :
  - Pour chaque date des 8 prochains jours : `listTripInstancesByRouteAndDate(companyId, depNorm, arrNorm, date)`.
  - Si aucun instance : pour chaque agence, chargement des weeklyTrips (actifs, même départ/arrivée), puis pour chaque créneau `getOrCreateTripInstanceForSlot` avec `weeklyTripId` ; puis nouvel appel à `listTripInstancesByRouteAndDate`.
  - Construction de la liste Trip à partir des instances : `remainingSeats = (seatCapacity ?? capacitySeats ?? 30) - (reservedSeats ?? 0)` ; filtre `remainingSeats > 0` et `status !== 'cancelled'`.
- À la création de réservation : `selectedTrip.id` est toujours l’id du document tripInstance ; plus de branchement « si id contient '_' alors getOrCreate ».

### 2.3 AgenceGuichetPage.tsx

- **searchTrips** : pour chaque date (8 jours), `listTripInstancesByRouteAndDate(companyId, dep, arr, date)` ; filtre `agencyId === user.agencyId`. Si aucune instance, chargement des weeklyTrips de l’agence (même dep/arr), création des instances via `getOrCreateTripInstanceForSlot` avec `weeklyTripId`, puis nouvel appel à `listTripInstancesByRouteAndDate`. Les Trip affichés ont `id = ti.id`, `remainingSeats = capacity - reserved`.
- **loadRemainingForDate** : plus de recalcul à partir des réservations ; simple filtre par date et heure non passée sur la liste déjà chargée.
- **onSnapshot(reservations)** : ne met plus à jour `remainingSeats` des trips (les places viennent des tripInstances).
- **handleReservation** : passage de `tripInstanceId: selectedTrip.id` à `createGuichetReservation` ; après succès, mise à jour optimiste des listes `trips` et `filteredTrips` (remainingSeats − placesAller pour le trip concerné).
- Suppression de la fonction **computeRemainingSeats** et de l’import **canonicalStatut**.

### 2.4 guichetReservationService.ts

- Après la transaction (ou setDoc hors ligne) de création de la réservation :
  - Si `params.tripInstanceId` est fourni : `incrementReservedSeats(companyId, tripInstanceId, seats)` (seats = seatsGo + seatsReturn).
  - Si `tripInstanceId` est absent et `params.trajetId` au format `weeklyTripId_date_heure` : résolution du tripInstance via `findTripInstanceBySlot(companyId, agencyId, date, time, depart, arrivee)` puis `incrementReservedSeats` si trouvé.
- Les appels à increment sont en `.catch(...)` pour ne pas faire échouer la création de la réservation si la mise à jour du tripInstance échoue.

### 2.5 reservations.ts (cancelReservation)

- Avant la transaction : capture de `tripInstanceId` et `seatsToRelease = seatsGo + seatsReturn` depuis le document réservation.
- Après la transaction réussie : si `tripInstanceId && seatsToRelease > 0`, appel à `decrementReservedSeats(companyId, tripInstanceId, seatsToRelease)` en `.catch(...)`.

### 2.6 ReservationsEnLignePage.tsx (handleRefuse)

- Après `updateDoc` (statut → refuse) : lecture de `data.tripInstanceId` et `data.seatsGo` / `data.seatsReturn` ; si présents, appel à `decrementReservedSeats(user.companyId, tripInstanceId, seats)` en `.catch(...)`.

---

## 3. Points de vérification pour tester la migration

### 3.1 Portail public (ReservationClientPage)

- [ ] Recherche trajet (départ / arrivée) : les créneaux affichés proviennent des tripInstances (pas de calcul à partir des réservations).
- [ ] Les places affichées (X pl. dispo) correspondent à `seatCapacity - reservedSeats` du tripInstance.
- [ ] Création d’une réservation en ligne : après création, le document tripInstance a bien `reservedSeats` incrémenté (vérifier dans Firestore ou en refaisant une recherche : une place de moins).
- [ ] Aucun doublon de tripInstance pour un même (weeklyTripId, date, heure) après plusieurs recherches ou rechargements.

### 3.2 Guichet (AgenceGuichetPage)

- [ ] Recherche trajet (départ / arrivée) : les créneaux et places viennent des tripInstances (agence courante).
- [ ] Vente d’un billet : la réservation est créée avec `tripInstanceId` ; `incrementReservedSeats` est appelé (vérifier dans Firestore : `reservedSeats` du tripInstance augmente).
- [ ] Après une vente, l’affichage des places se met à jour (optimiste ou après changement de date/recherche).
- [ ] Annulation d’une réservation guichet (via le flux qui appelle `cancelReservation`) : `decrementReservedSeats` est appelé ; les places du tripInstance diminuent.

### 3.3 Résultats agence (ResultatsAgencePage)

- [ ] Comportement inchangé : la page utilisait déjà les tripInstances pour les places ; vérifier que les créneaux et places restants sont cohérents avec le portail et le guichet.

### 3.4 Réservations en ligne (refus)

- [ ] Refus d’une réservation (preuve reçue → refusée) : `decrementReservedSeats` est appelé ; le tripInstance concerné voit ses `reservedSeats` diminuer.

### 3.5 Concurrence et cohérence

- [ ] Deux réservations simultanées sur le même créneau : `incrementReservedSeats` en transaction doit refuser le dépassement de capacité (message d’erreur côté client ou côté service).
- [ ] Annulation après refus / expiration : si un chemin d’annulation ou d’expiration (hors `cancelReservation` / `handleRefuse`) existe, vérifier qu’il appelle aussi `decrementReservedSeats` lorsque la réservation a un `tripInstanceId` (ex. Cloud Function `expireHolds` à traiter séparément).

### 3.6 Firestore

- [ ] Index composite pour `tripInstances` : `(departureCity, arrivalCity, date, departureTime)` (ou équivalent selon les champs utilisés dans les requêtes) présent et sans erreur.
- [ ] Les documents tripInstances créés avec id déterministe ont bien les champs `seatCapacity`, `reservedSeats`, `date`, `departureTime`, `agencyId`, `weeklyTripId`.

---

## 4. Non couvert par cette migration

- **Cloud Function expireHolds** (`functions/src/expireHolds.ts`) : met les réservations « en_attente_paiement » expirées en « annule » sans appeler `decrementReservedSeats`. À traiter dans un second temps (lecture des réservations expirées, puis mise à jour des tripInstances côté Admin SDK).
- **Autres chemins d’annulation** : tout passage manuel ou automatique du statut d’une réservation à « annulé » ou « refusé » doit, si la réservation a un `tripInstanceId` et des places, appeler `decrementReservedSeats`.

---

*Migration effectuée — tripInstances comme source de vérité des places. Document à jour avec les fichiers modifiés et les points de vérification.*
