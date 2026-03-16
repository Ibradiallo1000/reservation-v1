# Audit complet du système d’événements de trajet TELIYA

**Objectif** : Comprendre comment TELIYA gère le cycle de vie d’un bus (embarquement, départ, arrivée, descente, progression entre escales) pour l’agence d’origine, les escales et la destination finale.  
**Périmètre** : Lecture seule, aucune modification de code.

---

## 1. Événements existants et stockage

### 1.1 Vue d’ensemble

| Événement / Champ      | Où c’est stocké (Firestore) | Valeurs / Rôle |
|------------------------|-----------------------------|----------------|
| **boarding** (embarquement) | `reservations` (agences) | Via `statutEmbarquement` **ou** `boardingStatus` + `journeyStatus` (double système) |
| **dropoff** (descente) | `reservations` (agences) | `dropoffStatus`, `journeyStatus` |
| **departure** (départ bus) | `tripInstances/{id}/progress/{stopOrder}` | `departureTime` (Timestamp) par escale |
| **arrival** (arrivée bus) | `tripInstances/{id}/progress/{stopOrder}` | `arrivalTime`, `delayMinutes`, `confirmedBy` |
| **journeyStatus** | `reservations` | `booked` \| `boarded` \| `in_transit` \| `dropped` |
| **boardingStatus** | `reservations` | `pending` \| `boarded` \| `no_show` |
| **dropoffStatus** | `reservations` | `pending` \| `dropped` |

### 1.2 Détail par événement

#### Boarding (embarquement)

- **Stockage** :
  - **Chemin** : `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}`.
  - **Champ agence (origine)** : `statutEmbarquement` = `"embarqué"` | `"absent"` | `"en_attente"`.
  - **Champs escale / nouveau** : `boardingStatus` = `"pending"` | `"boarded"` | `"no_show"`, `journeyStatus` = `"in_transit"` (si embarqué).
- **Écriture** :
  - **Agence origine** : `AgenceEmbarquementPage.tsx` → `updateStatut(resId, "embarqué", ...)` → écrit `statutEmbarquement`, `checkInTime`, `statut: "embarque"`, `boardingLogs`. **N’écrit pas** `boardingStatus` ni `journeyStatus`.
  - **Escales** : `BoardingEscalePage.tsx` → `boardingService.markBoarded()` / `markNoShow()` → écrit `boardingStatus`, `journeyStatus`.
  - **Création résa** : `guichetReservationService.ts` et `ReservationClientPage.tsx` initialisent `boardingStatus: 'pending'`, `dropoffStatus: 'pending'`, `journeyStatus: 'booked'`.
- **Lecture** :
  - Manifeste / segments : `passengerManifestService.ts`, `segmentOccupancyService.ts` → lisent **`boardingStatus`** (et ignorent `no_show` pour l’occupation).
  - Agence / résultats : `AgenceEmbarquementPage`, `ManagerOperationsPage`, `AgenceGuichetPage`, etc. → lisent **`statutEmbarquement`**.

#### Dropoff (descente)

- **Stockage** : `reservations` → `dropoffStatus` = `"pending"` | `"dropped"`, `journeyStatus` = `"dropped"` quand descendu.
- **Écriture** : `dropoffService.markDropped()` (appelé depuis `BoardingEscalePage`, `BusPassengerManifestPage`).
- **Lecture** : `dropoffService.getPassengersToDrop()`, `passengerManifestService.getPassengersOnBoard()` (exclut `dropped`), `detectOvertravelPassengers()`.

#### Departure (départ du bus à une escale)

- **Stockage** : `companies/{companyId}/tripInstances/{tripInstanceId}/progress/{stopOrder}` → `departureTime` (Timestamp), `confirmedBy`.
- **Écriture** : `tripProgressService.markDeparture()` (uniquement depuis l’UI).
- **Lecture** : `tripProgressService.getTripProgress()`, `getProgressStatusAtStop()` ; `EscaleDashboardPage` pour afficher "Parti de l’escale".

#### Arrival (arrivée du bus à une escale)

- **Stockage** : même sous-collection `progress/{stopOrder}` → `arrivalTime`, `delayMinutes`, `confirmedBy`, `city`, `stopOrder`.
- **Écriture** : `tripProgressService.markArrival()` (calcul du retard via `computeDelay()`).
- **Lecture** : idem que departure ; dashboard escale (prévu / réel / retard).

#### journeyStatus / boardingStatus / dropoffStatus

- **Stockage** : uniquement dans `reservations`.
- **Écriture** : `boardingService` (boarded → `in_transit`, no_show), `dropoffService` (dropped → `dropped`), création résa (booked). `AgenceEmbarquementPage` ne met **pas** à jour ces champs.
- **Lecture** : manifeste, segment occupancy (boardingStatus pour exclure no_show), affichages escale.

---

## 2. Structure Firestore liée au suivi de trajet

### 2.1 tripInstances

| Champ            | Rôle | Écrit par | Lu par |
|------------------|------|------------|--------|
| `departureTime`  | Heure de départ (ex. "08:00") | `tripInstanceService.createTripInstance` | Guichet, escale, progression (calcul heure prévue) |
| `date`           | Date du trajet (YYYY-MM-DD) | Création tripInstance | Idem |
| `status`         | scheduled \| boarding \| departed \| arrived \| cancelled | `tripInstanceService.updateTripInstanceStatus` (appelé par `vehiclesService` pour flotte) | Types, filtres |
| `routeId`        | Route réseau | Création / mise à jour | Progress, stops, segments |
| `seatCapacity`, `reservedSeats` | Capacité et places réservées | Création, `incrementReservedSeats` / `decrementReservedSeats` | Fallback si pas de segments |

Aucun champ `arrivalTime` ou `departureTime` “réel” au niveau du document `tripInstance` : les heures réelles sont uniquement dans **progress**.

### 2.2 progress (sous-collection)

**Chemin** : `companies/{companyId}/tripInstances/{tripInstanceId}/progress/{stopOrder}`.

| Champ            | Rôle | Écrit par | Lu par |
|------------------|------|-----------|--------|
| `stopOrder`      | Ordre de l’escale sur la route | `tripProgressService.markArrival` | Tous les usages progress |
| `city`           | Ville de l’escale | `markArrival` | Affichage dashboard |
| `arrivalTime`    | Heure réelle d’arrivée | `markArrival` | Retard, affichage "Réel" |
| `departureTime`  | Heure réelle de départ | `markDeparture` | Statut "Parti" |
| `confirmedBy`    | UID utilisateur | `markArrival` / `markDeparture` | Audit |
| `delayMinutes`   | Retard (réel − prévu) | `markArrival` (via `computeDelay`) | Dashboard, alertes |
| `createdAt` / `updatedAt` | Horodatage | Service | Audit |

**Règles Firestore** : lecture publique ; create/update pour utilisateurs authentifiés de la compagnie ou admin plateforme ou escale (même logique que le reste compagnie).

### 2.3 reservations (par agence)

| Champ | Rôle | Écrit par | Lu par |
|-------|------|-----------|--------|
| `boardingStatus` | pending \| boarded \| no_show | boardingService, guichet/resa client à la création | Manifeste, segmentOccupancy |
| `dropoffStatus`  | pending \| dropped | dropoffService | Dropoff, manifeste, overtravel |
| `journeyStatus`  | booked \| boarded \| in_transit \| dropped | boardingService, dropoffService, création | Manifeste, logique “à bord” |
| `originStopOrder` / `destinationStopOrder` | Segment (route avec escales) | Guichet, résa client | Segments, boarding/dropoff, manifeste |
| `statutEmbarquement` | embarqué \| absent \| en_attente | AgenceEmbarquementPage, guichet (init) | Embarquement agence, guichet, manager |
| `tripInstanceId` | Lien trajet réel | Guichet, résa en ligne | Toutes les requêtes par trajet |

Il n’existe **pas** de collection dédiée `boarding` ou `events` : tout est soit dans `reservations`, soit dans `progress`.

---

## 3. Flux actuel du bus dans le système

### 3.1 Agence d’origine

| Étape | Ce qui existe dans le code | Stockage / Service |
|-------|----------------------------|-------------------|
| Vente billet | `AgenceGuichetPage` → `guichetReservationService` | Réservation avec `tripInstanceId`, `boardingStatus: 'pending'`, `statutEmbarquement: 'en_attente'` |
| Embarquement | `AgenceEmbarquementPage` : scan QR / manuel | `updateStatut(..., "embarqué")` → `statutEmbarquement: "embarqué"`, `statut: "embarque"`, `boardingLogs`. **Pas** de mise à jour de `boardingStatus` / `journeyStatus` |
| Départ (bus quitte l’origine) | Aucun bouton “Départ” sur la page agence. Le statut “departed” du tripInstance peut être mis à jour par le **module flotte** (`vehiclesService`) lors d’un “départ véhicule”, pas par une action “bus parti” depuis l’écran trajet | `updateTripInstanceStatus(..., DEPARTED)` (flotte) ; **aucune** écriture dans `progress` pour l’origine (pas d’escale) |

Donc à l’origine : pas d’enregistrement explicite “arrivée / départ” dans `progress` (l’origine n’est pas une escale avec progress). Le “départ” trajet peut uniquement venir de la flotte, pas d’un workflow “embarquement → départ” dédié.

### 3.2 Escale intermédiaire

| Étape | Ce qui existe | Stockage / Service |
|-------|----------------|-------------------|
| Arrivée bus | `EscaleDashboardPage` : bouton **[ Arrivé ]** | `tripProgressService.markArrival()` → `progress/{stopOrder}` avec `arrivalTime`, `delayMinutes` |
| Descente passagers | `BoardingEscalePage` (onglet Descente) ou `BusPassengerManifestPage` : **[ Descendu ]** | `dropoffService.markDropped()` → réservation `dropoffStatus: "dropped"`, `journeyStatus: "dropped"` |
| Embarquement | `BoardingEscalePage` (onglet Embarquement) : **[ Embarqué ]** / **[ Absent ]** | `boardingService.markBoarded()` / `markNoShow()` → `boardingStatus`, `journeyStatus` |
| Départ bus | `EscaleDashboardPage` : bouton **[ Départ ]** | `tripProgressService.markDeparture()` → `progress/{stopOrder}.departureTime` |

Enchaînement attendu côté escale : Arrivée → (descente + embarquement) → Départ. Tout est manuel (boutons).

### 3.3 Destination finale

- Même modèle qu’une escale : la dernière escale de la route a un `stopOrder` ; l’équipe peut cliquer **Arrivé** puis **Descente** (passagers à destination) puis **Départ** (bus repart vide ou autre usage).
- Aucune distinction “destination finale” dans le code : c’est le dernier stop de la route, sans traitement spécifique (pas de statut “arrivée finale” ni “fin de trajet”).

---

## 4. Pages et actions

| Page | Actions utilisateur | Services appelés |
|------|---------------------|------------------|
| **AgenceGuichetPage** | Vente billets, annulation, choix trajet (mode escale : tripInstances par route + date) | `guichetReservationService`, `getRemainingSeats`, `listTripInstancesByRouteIdAndDate` (si escale) |
| **AgenceEmbarquementPage** | Scan QR / saisie code, marquer embarqué/absent, fermer liste, sync file offline | `updateStatut` (statutEmbarquement), `boardingStats`, `boardingQueue`, pas de `boardingService` |
| **BoardingEscalePage** | Onglet Embarquement : **[ Embarqué ]** / **[ Absent ]** ; Onglet Descente : **[ Descendu ]** ; choix du bus | `getPassengersForBoarding`, `markBoarded`, `markNoShow`, `getPassengersToDrop`, `markDropped`, `getNextSegmentInfo`, `getTripProgress` |
| **EscaleDashboardPage** | **[ Arrivé ]**, **[ Départ ]** par bus ; lien “Vendre billet” ; filtre date | `markArrival`, `markDeparture`, `getTripProgress`, `getLastProgressFromList`, `getRemainingSeats`, `listTripInstancesByRouteIdAndDate` |
| **BusPassengerManifestPage** | Liste à bord / à descendre / dépassement ; **[ Descendu ]** ; affichage correspondance et retard | `getPassengersOnBoard`, `getPassengersToDrop`, `detectOvertravelPassengers`, `markDropped`, `getNextSegmentInfo`, `getTripProgress` |
| **ResultatsAgencePage** | Consultation résultats / places par trajet | `getRemainingSeats`, listes tripInstances |
| **ReservationClientPage** | Réservation en ligne, choix créneau | `getRemainingSeats`, création résa avec `boardingStatus`/`dropoffStatus`/`journeyStatus` |

Résumé : **arrivée** et **départ** bus ne sont gérés que dans **EscaleDashboardPage** (progress). **Embarquement** agence = `AgenceEmbarquementPage` (statutEmbarquement) ; **embarquement/descente escale** = **BoardingEscalePage** + **BusPassengerManifestPage** (boardingStatus / dropoffStatus).

---

## 5. Services métiers

| Service | Fonctions principales | Effets Firestore | Lien trajet |
|---------|------------------------|------------------|-------------|
| **boardingService** | `getPassengersForBoarding(tripInstanceId, stopOrder)`, `markBoarded()`, `markNoShow()` | Update `reservations` : `boardingStatus`, `journeyStatus` | Filtre par `tripInstanceId` + `originStopOrder` |
| **dropoffService** | `getPassengersToDrop(tripInstanceId, stopOrder)`, `markDropped()` | Update `reservations` : `dropoffStatus`, `journeyStatus` | Filtre par `tripInstanceId` + `destinationStopOrder` |
| **tripProgressService** | `markArrival()`, `markDeparture()`, `getTripProgress()`, `getProgressStatusAtStop()`, `computeDelay()`, `getLastProgressFromList()` | Create/update `tripInstances/{id}/progress/{stopOrder}` | Un document par escale atteinte |
| **tripInstanceService** | `getTripInstance()`, `listTripInstancesByRouteIdAndDate()`, `updateTripInstanceStatus()` | Read/update `tripInstances` (status, reservedSeats, etc.) | Source des trajets et horaires |
| **segmentOccupancyService** | `computeSegmentOccupancy()`, `getRemainingSeats()`, `getStopOrdersFromCities()` | Lecture seule `reservations` (collection group) | Occupation par segment, places restantes |
| **passengerManifestService** | `getPassengersOnBoard()`, `getPassengersToDrop()`, `detectOvertravelPassengers()` | Lecture seule `reservations` | Liste à bord / à descendre / fraude |

Aucun service n’écrit d’“events” génériques : les événements sont soit des champs sur `reservations`, soit des documents dans `progress`.

---

## 6. Problèmes potentiels

### 6.1 Double système d’embarquement

- **Agence origine** : `statutEmbarquement` (embarqué/absent/en_attente) ; pas de `boardingStatus` ni `journeyStatus`.
- **Escales** : `boardingStatus` (boarded/no_show) et `journeyStatus` (in_transit/dropped).
- **Conséquence** : Un passager embarqué à l’origine via scan aura `statutEmbarquement = "embarqué"` mais pas forcément `boardingStatus = "boarded"`. Le **manifeste** et **segmentOccupancy** se basent sur `boardingStatus` → un passager “embarqué” à l’agence peut ne pas apparaître “à bord” dans le manifeste escale et peut encore compter dans les segments (sauf si une synchro ou une règle métier aligne les deux).

### 6.2 Départ non confirmé

- Le “départ” du bus à une **escale** est enregistré uniquement si l’équipe clique **[ Départ ]** dans `EscaleDashboardPage`. Aucune automatisation (heure, géoloc, etc.).
- À **l’origine**, il n’y a pas de bouton “Départ” sur la page trajet/embarquement ; le statut `departed` du tripInstance peut venir du module flotte (`vehiclesService`), pas d’un workflow “bus parti de l’agence”.

### 6.3 Arrivée non confirmée

- L’arrivée à chaque escale n’existe que si on clique **[ Arrivé ]**. Si l’escale oublie, le bus reste “en route” pour les autres escales et le retard n’est pas enregistré.

### 6.4 Incohérence boarding vs departure

- Rien n’oblige à avoir cliqué “Arrivé” avant “Descente” ou “Embarqué” avant “Départ”. Les contraintes sont uniquement dans `tripProgressService` : on ne peut pas cliquer “Départ” sans “Arrivée” pour ce stop. En revanche, on peut faire descente/embarquement sans jamais cliquer Arrivée/Départ.

### 6.5 Progression du bus non fiable

- La progression dépend entièrement des clics manuels. Pas de détection “bus déjà parti” ni “bus déjà arrivé” (GPS, heure, etc.). Les escales suivantes ne voient que ce qui a été enregistré (getLastProgressFromList).

### 6.6 Statut tripInstance vs progress

- `tripInstance.status` (scheduled, boarding, departed, arrived) est mis à jour par le **module flotte** (véhicule), pas par les boutons Arrivée/Départ des escales. Donc deux sources de vérité potentielles : flotte (status) vs progress (arrivalTime/departureTime par escale).

---

## 7. Détection des oublis

| Situation | Le système peut-il le détecter ? |
|-----------|----------------------------------|
| Bus parti sans clic “Départ” | **Non** : pas de source externe (heure, GPS). L’UI affiche “Arrivé” tant qu’on n’a pas cliqué “Départ”. |
| Bus arrivé sans clic “Arrivée” | **Non** : même raison. |
| Embarquement sans départ | **Non** : pas de règle “tous les passagers embarqués ⇒ proposer Départ”. On peut avoir des “embarqués” et un bus toujours “Arrivé” à l’escale. |
| Descente sans arrivée | **Oui** côté données : on peut marquer “Descendu” sans avoir cliqué “Arrivé”. Le code ne bloque pas. Donc incohérence possible (descente enregistrée alors que le bus n’est pas marqué arrivé). |

En résumé : le système **ne détecte pas** les oublis d’arrivée/départ ; il **permet** des incohérences (ex. descente sans arrivée).

---

## 8. Relation avec les escales

### 8.1 Comment le système sait qu’un bus est arrivé / reparti à une escale

- **Arrivée** : document créé ou mis à jour dans `tripInstances/{id}/progress/{stopOrder}` avec `arrivalTime` (et optionnellement `delayMinutes`) **uniquement** lorsque l’escale clique **[ Arrivé ]**.
- **Reparti** : même document, champ `departureTime` renseigné **uniquement** lorsque l’escale clique **[ Départ ]**.
- Aucune autre source (GPS, heure système, flotte) n’alimente cette sous-collection pour l’instant.

### 8.2 Visibilité pour les autres escales

- `getTripProgress(tripInstanceId)` retourne tous les `progress` du trajet ; `getLastProgressFromList(progressList)` donne la dernière escale enregistrée (ville, départ ou non, retard).
- Les escales suivantes affichent par exemple “Bus parti de Segou” et “Retard : X min” à partir de ces données. Si une escale n’a pas cliqué Arrivée/Départ, les suivantes ne voient pas cette escale.

### 8.3 Descente des passagers

- Liste des passagers à faire descendre : `getPassengersToDrop(companyId, tripInstanceId, stopOrder)` (réservations avec `destinationStopOrder === stopOrder` et `dropoffStatus === "pending"`).
- Marquer “Descendu” : `markDropped()` → `dropoffStatus: "dropped"`, `journeyStatus: "dropped"`. Aucun lien obligatoire avec l’existence d’un document `progress` “Arrivée” pour ce stop.

---

## 9. Relation avec les segments et remainingSeats

### 9.1 segmentOccupancyService

- **computeSegmentOccupancy** : lit toutes les réservations confirmées du `tripInstanceId` (collection group), utilise `originStopOrder` / `destinationStopOrder` (ou résolution via villes si absents), et **exclut** les réservations avec `boardingStatus === "no_show"`. Les “boarded” et “pending” comptent.
- **getRemainingSeats** : `seatCapacity - max(segmentOccupancy)` si la route a des stops ; sinon fallback `seatCapacity - reservedSeats`.

### 9.2 Dépendance boarding / dropoff

- **Occupation segments** : dépend des **réservations** (confirmées) et de **boardingStatus** (exclure no_show). Ne dépend **pas** de `dropoffStatus` pour compter l’occupation d’un segment : une réservation compte sur tout le segment origine→destination tant qu’elle n’est pas en no_show.
- **Places restantes** : idem, via `computeSegmentOccupancy` donc **boardingStatus** (no_show) est pris en compte ; **dropoffStatus** n’entre pas dans ce calcul.

En résumé : le système s’appuie sur **reservations** + **boardingStatus** pour les segments et remainingSeats ; **dropoffStatus** sert à la liste “à descendre” et au statut “dropped”, pas au calcul d’occupation.

---

## 10. Diagramme du cycle de vie (état actuel)

```text
[ AGENCE ORIGINE ]
  Vente billet     → reservation (tripInstanceId, boardingStatus: pending, statutEmbarquement: en_attente)
  Embarquement     → statutEmbarquement: "embarqué", statut: "embarque" (pas de mise à jour boardingStatus/journeyStatus)
  Départ bus       → pas d’action dédiée “Départ” ; possible update status “departed” côté flotte (vehiclesService)

[ ESCALE 1 ]
  Arrivée bus      → progress/{stopOrder}: arrivalTime, delayMinutes  [ manuel : Arrivé ]
  Descente         → reservation: dropoffStatus: dropped, journeyStatus: dropped  [ manuel : Descendu ]
  Embarquement     → reservation: boardingStatus: boarded, journeyStatus: in_transit (ou no_show)  [ manuel ]
  Départ bus       → progress/{stopOrder}: departureTime  [ manuel : Départ ]

[ ESCALE 2 … N ]
  (même boucle Arrivée → Descente → Embarquement → Départ)

[ DESTINATION FINALE ]
  (même modèle : dernière escale de la route ; pas de statut “fin de trajet” dédié)
```

---

## 11. Fichiers impactés (départ / arrivée / embarquement / descente)

### 11.1 Départ bus (progress)

- `src/modules/compagnie/tripInstances/tripProgressService.ts` (markDeparture, getTripProgress, getProgressStatusAtStop)
- `src/modules/agence/escale/pages/EscaleDashboardPage.tsx` (bouton Départ, affichage statut)

### 11.2 Arrivée bus (progress)

- `src/modules/compagnie/tripInstances/tripProgressService.ts` (markArrival, computeDelay, getTripProgress)
- `src/modules/agence/escale/pages/EscaleDashboardPage.tsx` (bouton Arrivé, affichage prévu/réel/retard)

### 11.3 Embarquement

- **Agence (statutEmbarquement)** :  
  `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx`,  
  `src/modules/agence/services/reservationStatutService.ts` (buildStatutTransitionPayload),  
  `src/modules/agence/services/guichetReservationService.ts` (init statutEmbarquement)
- **Escales (boardingStatus/journeyStatus)** :  
  `src/modules/compagnie/boarding/boardingService.ts`,  
  `src/modules/agence/escale/pages/BoardingEscalePage.tsx`
- **Création résa** :  
  `src/modules/agence/services/guichetReservationService.ts`,  
  `src/modules/compagnie/public/pages/ReservationClientPage.tsx`  
  (boardingStatus, dropoffStatus, journeyStatus init)

### 11.4 Descente

- `src/modules/compagnie/dropoff/dropoffService.ts` (getPassengersToDrop, markDropped)
- `src/modules/agence/escale/pages/BoardingEscalePage.tsx` (onglet Descente)
- `src/modules/agence/escale/pages/BusPassengerManifestPage.tsx` (section “à descendre”, bouton Descendu)

### 11.5 Lecture / agrégation

- `src/modules/compagnie/manifest/passengerManifestService.ts` (à bord, à descendre, overtravel)
- `src/modules/compagnie/tripInstances/segmentOccupancyService.ts` (occupation, remainingSeats)
- `src/modules/compagnie/tripInstances/tripProgressService.ts` (getTripProgress, getLastProgressFromList)
- Types : `src/types/reservation.ts` (boardingStatus, dropoffStatus, journeyStatus, originStopOrder, destinationStopOrder)

### 11.6 Règles Firestore

- `firestore.rules` : `match /tripInstances/{tripInstanceId}/progress/{stopOrder}` (read/write selon compagnie / admin / escale).

---

## 12. Conclusion

### 12.1 Comment TELIYA gère aujourd’hui la progression des bus

- **Arrivée / départ** à chaque escale : enregistrement **manuel** via boutons **[ Arrivé ]** et **[ Départ ]** dans `EscaleDashboardPage`, stocké dans la sous-collection `tripInstances/{id}/progress/{stopOrder}` (arrivalTime, departureTime, delayMinutes).
- **Embarquement** : deux chemins non unifiés — agence origine utilise `statutEmbarquement` (et pas `boardingStatus`), escales utilisent `boardingStatus` et `journeyStatus`.
- **Descente** : un seul modèle (`dropoffStatus`, `journeyStatus`) utilisé aux escales et dans le manifeste.
- **Places restantes** : basées sur les segments (réservations + boardingStatus, no_show exclus), avec fallback reservedSeats si pas de route/escales.

### 12.2 Ce qui fonctionne déjà

- Enregistrement explicite arrivée/départ par escale avec retard.
- Visibilité “dernière escale” et retard pour les escales suivantes.
- Liste des passagers à embarquer/à descendre par escale et détection des dépassements (fraude).
- Calcul d’occupation par segment et remainingSeats en tenant compte des no_show.

### 12.3 Ce qui manque pour un suivi fiable

- **Unification embarquement** : soit faire écrire `boardingStatus`/`journeyStatus` depuis l’agence (ex. dans `updateStatut`), soit faire lire `statutEmbarquement` dans le manifeste/segments pour considérer “à bord” de façon cohérente.
- **Départ à l’origine** : action explicite “Bus parti” (et éventuellement écriture d’un progress pour l’origine si on veut un modèle uniforme).
- **Automatisation** : pas de détection “bus arrivé” / “bus parti” (heure, GPS, flotte) pour pré-remplir ou alerter en cas d’oubli.
- **Contraintes métier** : bloquer ou avertir si “Descente” sans “Arrivée”, ou “Départ” sans avoir traité les descentes/embarquements.
- **Lien flotte ↔ progress** : clarifier si `tripInstance.status` (departed/arrived) doit être synchronisé avec progress (ex. départ dernière escale → status arrived).

### 12.4 Risques d’oubli des actions

- **Élevés** : si l’équipe n’utilise pas les boutons Arrivée/Départ, la progression réelle du bus n’est pas reflétée ; les retards et la “dernière escale” sont faux ou manquants.
- **Moyens** : descente/embarquement possibles sans avoir cliqué Arrivée → incohérences possibles entre “qui est descendu” et “où le bus est censé être”.
- **Doublon embarquement** : passagers marqués embarqués à l’agence (statutEmbarquement) peuvent ne pas être considérés “à bord” par le manifeste/segments (boardingStatus), ce qui fausse les listes et statistiques si les deux champs ne sont pas alignés.

---

*Document généré pour préparer l’automatisation du départ, de l’arrivée et la consolidation de la progression du bus dans le réseau. Aucune modification de code n’a été effectuée.*
