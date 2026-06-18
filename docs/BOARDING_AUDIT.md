# BOARDING_AUDIT — Embarquement (module agence)

> Audit **uniquement** du périmètre strict :
> - `/agence/boarding`
> - `/agence/boarding/scan`
> - `/agence/boarding/live`
> - `src/modules/agence/boarding/*`
> - `src/modules/agence/embarquement/*`
>
> Exclu : `modules/agence/escale/*` et `BoardingEscalePage` / `BusPassengerManifestPage`.

---

## 0) Résumé exécutif (architecture actuelle)
L’embarquement “chef d’embarquement principal agence” est implémenté par une combinaison :

1. **Planification des départs** (source unique) :
   - `tripAssignments` (statuts `planned` et `validated`) + `weeklyTrips` + capacité véhicule via `fleetVehicles` / `vehicleRef`.
2. **Session d’embarquement** (scan/list) :
   - Page “embarquement” monolithique : `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx`.
   - Dépendance centrale : un **créneau opérationnel** (assignmentId + vehicleId + statut `planned|validated`).
3. **Hors-ligne** :
   - File d’attente IndexedDB (`boardingQueue.ts`).
   - Snapshot local du créneau `boardingSlotSnapshot.ts` (localStorage).
4. **Déduplication & agrégats** (anti double scan) :
   - `boardingEmbarkDedup` (doc par reservationId et tripAssignment).
   - `boardingStats` (embarkedSeats / absentSeats).
5. **Clôture** (absents + logs + stats + fleet mouvement) :
   - `boardingClosures/{tripKey}` sert de lock d’idempotence de clôture.
   - Ajout `boardingLogs` (CLOSURE / ABSENT_REPROG).
   - Transition fleet `fleetVehicles assigned → in_transit` + `fleetMovements`.

---

## 1) Identifier toutes les pages “embarquement”
### 1.1 Routes /agence/boarding
- **`/agence/boarding`**
  - Page : `src/modules/agence/boarding/BoardingDashboardPage.tsx`
  - Rôle : **départs planifiés** (filtre date) basés sur `tripAssignments`.
- **`/agence/boarding/scan`**
  - Page : `src/modules/agence/boarding/BoardingScanPage.tsx` (wrapper)
  - Rôle : vérifie affectation + capacité, prend un lock embarquement (best-effort), persiste snapshot puis rend `AgenceEmbarquementPage`.
- **`/agence/boarding/live`**
  - Page : `src/modules/agence/boarding/BoardingLiveOpsPage.tsx`
  - Rôle : **non audité en détail** dans ce passe (non lu dans le présent échange).

### 1.2 Pages directes “embarquement” (module agence/embarquement)
- **`src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx`**
  - Rôle : scan QR + liste + update statuts embarquement + clôture + impression.

---

## 2) Identifier tous les composants “embarquement”
Périmètre strict côté UI : l’implémentation est majoritairement **dans une page unique**.

### 2.1 Composants explicites
- `StandardLayoutWrapper` (UI shared)
- `DatePickerButton` (component local dans `AgenceEmbarquementPage`)

### 2.2 Composants/sections intégrées (pas des fichiers séparés)
Dans `AgenceEmbarquementPage.tsx` :
- Overlay scan success/error (feedback 1.2s)
- Boutons mobile : “SCAN” / “LISTE”
- Form scan manuel (input code billet + “Valider”)
- Caméra QR (zxing `BrowserMultiFormatReader`)
- Tableau liste passagers (filtre recherche, cases “case” pour bascule embarqué/absent)
- Zone impression (`#print-area`) + bouton “Imprimer”
- Bouton “Valider et lancer le trajet” (départ véhicule)

---

## 3) Identifier tous les hooks “embarquement”
Dans le périmètre lu, il n’y a pas de “hooks embarquement” isolés exportés.
Tout est géré via React hooks **dans `AgenceEmbarquementPage`**.

### 3.1 Hooks locaux importants
- `useEffect` (charge départs/assignments, listeners reservations, lock/session lifecycle, offline hydration, QR scanner lifecycle, auto-départ, clôture surveillance)
- `useCallback` ( `updateStatut`, `markAllEmbarked`, `submitManual`, `handleBusParti`, `cloturerEmbarquement`, etc.)
- `useMemo` (totaux, filtered reservations, rows départs, champs impression)
- `useRef` (dédup scan, offline snapshot ref, lockHeldRef, inflight scan ids, generation decoder)

---

## 4) Identifier tous les services “embarquement” (au sens logique)
### 4.1 Services internes modules (imports directs dans `AgenceEmbarquementPage`)
- `@/modules/agence/planning/tripAssignmentService` (inclut locks & capacité)
  - `startBoardingSessionLock`, `closeBoardingSessionLock`
  - `ensureTripExecutionOnBoardingStart`
  - `getVehicleCapacity`
  - `countExpectedReservationsForTripSlot`
  - `boardingEmbarkDedupDocRef`
  - `listBoardingTripAssignmentsForDate`
  - `tripAssignmentDocId`
- `@/modules/compagnie/tripExecutions/tripExecutionService`
  - `ensureTripExecutionOnBoardingStart`
  - `markTripExecutionBoardingCompleted`
  - `tripExecutionRef`
- `@/modules/agence/aggregates/boardingStats`
  - `getBoardingStatsRef`, `createBoardingStats`, `incrementBoardingStatsEmbarked`, `setBoardingStatsClosed`
- `@/modules/agence/aggregates/agencyLiveState`
  - `updateAgencyLiveStateOnBoardingOpened`, `updateAgencyLiveStateOnBoardingClosed`
  - `updateAgencyLiveStateOnVehicleInTransit`
- `@/modules/compagnie/fleet/affectationService`
  - `getAffectationForBoarding` (chauffeur/convoyeur depuis affectation)
- `@/modules/agence/embarquement/boardingQueue`
  - `addToBoardingQueue`, `getUnsyncedBoardingQueue`, `markBoardingQueueSynced`
- `@/modules/agence/embarquement/boardingSlotSnapshot`
  - `persistBoardingSlotSnapshot`, `loadBoardingSlotSnapshot`, `clearBoardingSlotSnapshot`
  - `getOrCreateBoardingClientInstanceId`
- `@/modules/agence/services/agentHistoryService`
  - `logAgentHistoryEvent` (historique “BOARDING_SCANNED”)

### 4.2 Fonctions utilitaires “service-like”
- `@/utils/reservationStatusUtils`
  - `getEffectiveStatut`, `canEmbarkWithScan`, `RESERVATION_STATUT_QUERY_BOARDABLE`
- `@/modules/agence/services/reservationStatutService`
  - `buildStatutTransitionPayload`

---

## 5) Identifier toutes les collections Firestore utilisées
> Liste basée sur les chemins visibles dans le code de `AgenceEmbarquementPage`, `BoardingDashboardPage`, `BoardingScanPage`, et `tripAssignmentService.ts` + snapshot/queue.

### 5.1 Réservations / passagers
- `companies/{companyId}/agences/{agencyId}/reservations`
  - écoute realtime : filtres `date`, `depart`, `arrivee`, `heure`, `statut in [...boardable, "validé"]`
  - updates transaction : champs `boardingStatus`, `statutEmbarquement`, `controleurId`, `checkInTime`, etc.

### 5.2 Planification embarquement
- `companies/{companyId}/agences/{agencyId}/weeklyTrips`
  - lecture `departure/arrival` et `horaires` (jour)
- `companies/{companyId}/agences/{agencyId}/tripAssignments`
  - source unique : `status in planned|validated`
  - champs : `tripId`, `date`, `heure`, `vehicleId`, `status`, `boardingSession`, `liveStatus`.

### 5.3 Lock embarquement (multi-appareil)
- `companies/{companyId}/agences/{agencyId}/tripAssignments/{assignmentId}`
  - sous-champ `boardingSession` (pas une collection dédiée)

### 5.4 Dédup scan embarquement
- `companies/{companyId}/agences/{agencyId}/boardingEmbarkDedup/{dedupId}`
  - doc id format : `${tripAssignmentId}__emb__${reservationId}`

### 5.5 Agrégats embarquement
- `companies/{companyId}/agences/{agencyId}/boardingStats/{tripKey}`

### 5.6 Historique “embarquement”
- `companies/{companyId}/agences/{agencyId}/boardingLogs/{autoId}`
  - événements : `EMBARQUE`, `ABSENT_REPROG`, `CLOSURE`
- (côté agent history)
  - **collection exacte non confirmée** (service `agentHistoryService` non relu dans ce passe)

### 5.7 Clôture & lock clôture
- `companies/{companyId}/agences/{agencyId}/boardingClosures/{tripKey}`
  - sert de lock d’idempotence : existence ⇒ “DEJA_CLOTURE”.

### 5.8 Fleet & mouvements
- `companies/{companyId}/fleetVehicles/{vehicleId}`
  - lecture capacité (capacité véhicule)
  - update `status` vers `in_transit` à la clôture
- `companies/{companyId}/fleetMovements/{autoId}`
  - `createFleetMovementPayload` lors clôture

### 5.9 Exécution trip (boarding completion)
- `companies/{companyId}/tripInstances/{tripInstanceId}`
  - lecture progress via `tripInstanceRef` + `getTripProgress`
- (selon imports `tripExecutionService`)
  - `tripExecutionRef(companyId, tripExecutionId)` (collection exacte non listée ici, car `tripExecutionService.ts` non lu dans ce passe)

### 5.10 Personnel / affectation
- `companies/{companyId}/personnel`
  - query `assignedVehicleId == effectiveVehicleId`

### 5.11 Etat live agence
- `companies/{companyId}/agences/{agencyId}/agencyLiveState/current`

---

## 6) Flux complet (end-to-end)

### 6.1 Départs planifiés (dashboard)
1. UI /agence/boarding charge agences (selon rôle).
2. Pour chaque agence :
   - lit `weeklyTrips`
   - lit `tripAssignments` pour la date (planned|validated)
   - lit `fleetVehicles/{vehicleId}` pour récupérer `plateNumber`.
3. Affiche boutons par créneau : navigation vers `/agence/boarding/scan` avec `location.state` :
   - `agencyId`, `date`, `trajet`, `heure`, `tripId`, `assignmentId`, `vehicleId`, `assignmentStatus`, etc.

**Dépendance centrale : `tripAssignments`.**

### 6.2 Ouverture scan/list (scan page wrapper)
Sur `/agence/boarding/scan` (`BoardingScanPage`) :
1. Récupère paramètres `location.state`.
2. Déduit `assignmentId` via `tripAssignmentDocId(tripId,date,heure)` si absent.
3. Vérifie doc `tripAssignments/{assignmentId}` existe et status `planned|validated`.
4. Vérifie correspondance trip/date/heure.
5. Vérifie `vehicleId` existe.
6. Récupère capacité via `getVehicleCapacity(companyId, vehicleId)`.
7. Prend lock embarquement via `startBoardingSessionLock` (best-effort) **dans `tripAssignmentService.ts`**.
   - Important : `BOARDING_LOCKS_DISABLED = true` => dans le code actuel, le lock ne s’écrit pas réellement (voir section “cassée/partiellement”).
8. Persiste `boardingSlotSnapshot` en localStorage.
9. Rend `AgenceEmbarquementPage` avec `vehicleCapacity` et `boardingAssignmentStatus`.

### 6.3 Session embarquement (AgenceEmbarquementPage)
#### A) Hydratation offline / selection créneau
- Si offline : utilise `loadBoardingSlotSnapshot` pour restaurer `assignmentId`, `vehicleId`, `assignmentStatus` + préremplit `selectedTrip`.
- En ligne : lance `startBoardingSessionLock` et persiste snapshot si possible (mécanisme identique au wrapper, avec logic online/offline plus complexe).

#### B) Liste passagers (realtime)
- Active un `onSnapshot` sur `reservations` filtrant :
  - `date == selectedDate`
  - `depart == selectedTrip.departure`
  - `arrivee == selectedTrip.arrival`
  - `heure == selectedTrip.heure`
  - `statut in RESERVATION_STATUT_QUERY_BOARDABLE + "validé"`
- Deux listeners possibles :
  - via (depart/arrivee)
  - et/ou via `trajetId == selectedTrip.id` si disponible.
- Tant que scan cam est activé (`scanOn`), le listener est ignoré pour performance.

#### C) Statuts embarquement (mécanisme updateStatut)
Deux modes d’action :
- scan / saisie manuelle (appel `updateStatut(reservationId, "embarqué"|...)`)
- bascule depuis la liste (case click)

**updateStatut embarqué** :
1. Pre-check (si embarqué) : si `getEffectiveBoardingStatus` déjà `boarded` ⇒ ignore.
2. Capacity check avant transaction :
   - calcule `seatsEmbarques` à partir des réservations embarquées effectives du créneau.
   - compare avec `capacityLimit`.
3. Transaction Firestore :
   - refuse si réservation ne passe pas `canEmbarkWithScan(effectiveStatut)`.
   - refuse si non concordant (départ/arrivée/date/heure/trajet).
   - refuse si lock/clés dedup existent.
   - met à jour :
     - `boardingStats` (embarkedSeats increment)
     - `tripAssignments/{id}.liveStatus` (boardedCount/expectedCount, boardingStartedAt)
     - dédup `boardingEmbarkDedup` doc
     - `boardingLocks/{reservationId}` doc
   - met à jour reservation :
     - `boardingStatus` {boarded|pending|no_show}
     - `statut` vers `"embarque"` si embarqué
     - `checkInTime` (serverTimestamp)
     - `auditLog` arrayUnion transition payload
   - ajoute `boardingLogs` doc.

**updateStatut absent** :
- pas de capacité check.
- patch reservation pour `no_show`, `statutEmbarquement=absent` + `checkInTime=null`.

#### D) Scan QR
- zxing decodeFromConstraints / decodeFromVideoDevice (selon caméra).
- Dédup scan local :
  - même code min interval 400ms
  - même reservation id min interval 350ms
- En offline :
  - lookup local dans `reservations` chargées
  - `addToBoardingQueue` IndexedDB (events non encore “synced”) 
- En ligne :
  - `findReservationByCode(...)` cherche doc reservation par `referenceCode` et/ou doc id exact.
  - pré-calcule “overtravel escale” (non utilisé ici car périmètre audit strict “boarding principal agence” — logique existe mais dépend `agencyInfo.type==='escale'`).
  - appelle `updateStatut(..., "embarqué")`.

#### E) “Tout marquer embarqué”
- parcourt **toutes** les réservations du créneau (pas le filtre de recherche)
- ne cible que statuts effectifs `pending`.
- appelle `updateStatut(..., "embarqué", suppressAlert:true)` en boucle séquentielle.

### 6.4 Confirmation départ véhicule (partie “confirm departure”)
Bouton en bas : `handleBusParti()`.
1. Exige `tripInstanceIdForSlot` résolu (voir section clôture)
2. Exige rôle chef d’agence via `canLaunchTripAfterAgencyValidation`.
3. Exige `tripStatutMetier === "validation_agence_requise"`.
4. Exige au moins 1 siège “boarded”.
5. Bloque si scanOn.
6. Appelle `markOriginDeparture(companyId, tripInstanceIdForSlot, uid)`.

### 6.5 Clôture embarquement (confirm arrivée + absents + historique)
Le composant lit :
- `boardingClosures/{tripKey}` (existence ⇒ fermé)
- `findTripInstanceBySlot(...)` pour résoudre tripInstanceId.

`cloturerEmbarquement` :
1. Vérifie contexte : agence, uid, selectedTrip, selectedDate, tripKey, réservations length.
2. Transaction :
   - lock clôture `boardingClosures/{tripKey}` (si exist ⇒ “DEJA_CLOTURE”).
   - marque ABSENT pour toutes les réservations non embarquées.
   - écrit `boardingClosures` doc.
   - écrit `boardingLogs` result `CLOSURE`.
   - met à jour agrégats quotidien `updateDailyStatsOnBoardingClosed` + `boardingStats` closed + `agencyLiveState`.
   - Transition fleet `fleetVehicles` assigned → in_transit + `fleetMovements`.
3. Si `tripInstanceIdForSlot` existe : `markTripExecutionBoardingCompleted`.
4. Batch : reprogrammer absents (création nouvelles reservations “report” + logs ABSENT_REPROG + flags reprogrammedOnce).
5. Ferme lock embarquement si détenu (`closeBoardingSessionLock`) si en ligne.
6. Nettoie snapshot local.

### 6.6 Auto-départ après clôture (optionnel)
- `useEffect` surveille `isClosed` et `tripInstanceIdForSlot`.
- Lit `boardingClosures/{tripKey}.closedAt` puis appelle `ensureAutoDepartIfNeeded(companyId, tripInstanceIdForSlot, closedAt)`.

---

## 7) Départs planifiés (demandé)
### 7.1 Existe ?
**Oui — entièrement.**

- UI : `BoardingDashboardPage`.
- Logique : `listBoardingTripAssignmentsForDate(companyId, agencyId, selectedDate)`.
- Statut : `status === "validated" ? "validated" : "planned"`.

### 7.2 Dépendances
- **TripAssignments** : obligatoire.
- **Réservations** : non.
- **Statuts embarquement** : non.

---

## 8) Liste passagers (demandé)
### 8.1 Existe ?
**Oui — entièrement** dans `AgenceEmbarquementPage`.

- Listener realtime reservations filtrée par créneau.
- Tri : par `canal/report` ou `sourceReservationId` pour “reports d’abord”, puis `nomClient`.

### 8.2 Statuts
- Colonnes “Embarqué / Absent” basées sur `getEffectiveBoardingStatus`.
- Les statuts effectifs sont :
  - `boarded` si `boardingStatus==='boarded'` ou `statutEmbarquement==='embarqué'`.
  - `no_show` si `boardingStatus==='no_show'` ou `statutEmbarquement==='absent'`.
  - sinon `pending`.

---

## 9) Scan QR (demandé)
### 9.1 Existe ?
**Oui — entièrement**.

- Caméra : zxing + decodeFromConstraints / decodeFromVideoDevice.
- Feedback overlay 1.2s + beep.

### 9.2 Mode offline
- Lookup dans `reservations` chargées.
- Ajout file `boardingQueue`.

### 9.3 Online
- `findReservationByCode` :
  - doc id match direct si `agencyId` connu
  - sinon query `where(referenceCode==code)`
  - sinon brute search par agences.

---

## 10) Impression liste (demandé)
### 10.1 Existe ?
**Oui — entièrement**.

- Bouton “Imprimer” dans mode mobile `liste`.
- Condition : `canPrintOfficialDocs` (chef agence).
- Impression via `window.print()`.
- Zone imprimée : `#print-area.boarding-official-print`.

### 10.2 Contenu imprimé
- Header : company logo, agence, téléphone, trajet, date, véhicule, chauffeur, convoyeur.
- Summary : réservations, places, embarqués, absents.
- Tableau : passagers avec X sur “Embarqué” / “Absent”.

---

## 11) Historique (demandé)
### 11.1 Existe ?
**Partiellement implémenté** (au sens “end-to-end confirmé”).

- **boardingLogs** : existe clairement.
  - `CLOSURE` (transaction)
  - `ABSENT_REPROG` (batch)
  - `EMBARQUE` / `ABSENT` (dans updateStatut via `boardingLogs`)
- **agentHistoryService** : `logAgentHistoryEvent` est appelé pour chaque embarquement valide.
  - **Mais la collection exacte n’est pas confirmée** dans ce passe (service non relu).

### 11.2 “Historique” demandé côté audit
- Scan événement : `boardingLogs` + agent history event.
- Clôture : `boardingLogs` result `CLOSURE`.

---

## 12) Statuts embarquement (demandé)
### 12.1 Existe ?
**Oui — mais avec compatibilité/transition legacy.**

- Champ de vérité principal : `boardingStatus` (`pending|boarded|no_show`).
- Champ legacy conservé : `statutEmbarquement` (`embarqué|absent|en_attente`).
- Champ legacy de statut : `statut` côté réservation (ex: `"embarque"`).

### 12.2 mapping effectif
- `boardingStatus` prioritaire.
- sinon `statutEmbarquement`.

### 12.3 Statut embarqué = logique de capacité & dédup
- capacité : compare `embarkedSeats + seatsGo` vs `vehicleCapacity`.
- dédup : absence du doc `boardingEmbarkDedup` + absence du lock `boardingLocks/{reservationId}`.

---

## 13) Analyse “Qualité / Robustesse” (existe / partiellement / cassée / non utilisée)

### 13.1 Locks multi-appareils
- **Partiellement implémenté / potentiellement cassé en prod** :
  - Dans `tripAssignmentService.ts` :
    - `const BOARDING_LOCKS_DISABLED = true;`
  - Conséquence : les fonctions `startBoardingSessionLock` / `closeBoardingSessionLock` retournent sans écrire.
  - `AgenceEmbarquementPage` gère des modes dégradés (skip lock quand permissions refusées), mais ici c’est un hotfix constant.

### 13.2 Départs planifiés
- **Existe** : dashboard basé sur `tripAssignments`.

### 13.3 Liste passagers
- **Existe** : listener realtime + mise à jour transaction.

### 13.4 Scan QR
- **Existe** : offline/online + dédup local + queue.

### 13.5 Impression
- **Existe** : UI + zone print + rôle.

### 13.6 Historique
- **Partiellement implémenté** : `boardingLogs` OK, `agentHistoryEvent` non validé (collection non confirmée).

### 13.7 Clôture
- **Existe** : transaction lock clôture + batch reprogrammation + stats + fleet.

### 13.8 Confirmation départ (véhicule)
- **Existe (dans le flow)** : `handleBusParti` + dépendances `tripStatutMetier`.
- “confirmation arrivée éventuelle” : le code lu implémente auto départ / arrivée indirecte via `tripProgressService` et `ensureProgressArrival` lors scan si type escale (mais Escale est exclu fonctionnellement dans ce périmètre strict ; néanmoins cette logique existe).

---

## 14) Identifier précisément les dépendances demandées
### 14.1 Ce qui dépend de `tripAssignments`
**Dépendances strictes :**
- Départs planifiés (/agence/boarding) :
  - `tripAssignments` sert de liste créneaux et de statut `planned|validated`.
- Sélection créneau scan/list :
  - `assignmentId` et `vehicleId` dépendent de `tripAssignments` (doc + liveStatus).
- Démarrage session embarquement :
  - lock embarquement et session boardingSession est stored **sur** `tripAssignments/{assignmentId}`.
- Live stats embarquement :
  - `tripAssignments/{assignmentId}.liveStatus` est mis à jour à chaque scan embarqué.
- Capacité attendue / expectedCount :
  - `countExpectedReservationsForTripSlot` est utilisé dans service planning (pendant création affectation).

**Dépendances optionnelles / indirectes :**
- Certains champs (driver/convoyeur) sont reconstitués via `tripExecutionRef` / affectation et pas uniquement tripAssignments.

### 14.2 Ce qui dépend des “réservations”
- Liste passagers : listener realtime sur `reservations`.
- Scan QR : lookup de reservation par `referenceCode` / doc id.
- update statuts : transaction modifie la réservation.
- Capacity check : calcule embarqués en lisant `reservations`.
- Clôture : parcourt `reservations` pour marquer absents et reprogrammer.

### 14.3 Ce qui dépend des statuts embarquement
(au sens : champs boardingStatus/statutEmbarquement + patch reservation)
- `getEffectiveBoardingStatus` dépend de `boardingStatus` prioritaire puis `statutEmbarquement`.
- `markAllEmbarked` ne cible que `pending` (effectif).
- La capacité / stats embarquement dépend du statut effectif (ne pas compter deux fois).
- La dédup embarquement empêche d’entraîner des stats sur un statut déjà “boarded”.

---

## 15) Ce qui reste à auditer (dans ce passe) — en rapport direct avec le scope strict
- `src/modules/agence/boarding/BoardingLiveOpsPage.tsx` n’a pas été relu :
  - potentiellement affiche “statuts embarquement / historique live”.
- `agentHistoryService.ts` n’a pas été relu :
  - pour confirmer où est stocké l’historique (collection exactes).
- `tripExecutionService.ts` n’a pas été relu dans ce passe :
  - pour confirmer collections exactes de `tripExecutionRef` / `tripExecution`.

---

## Annexes — Checklists demandées

### A) Architecture actuelle
- [x] Départs planifiés (BoardingDashboardPage)
- [x] Session scan/list (AgenceEmbarquementPage)
- [x] Offline queue + snapshot
- [x] Dédup + boardingStats + agencyLiveState
- [x] Clôture + reprogrammer absents
- [ ] Confirmer BoardingLiveOpsPage (non lu)

### B) Sources de données
- [x] tripAssignments
- [x] weeklyTrips
- [x] reservations
- [x] fleetVehicles + fleetMovements
- [x] boardingClosures + boardingLogs
- [x] boardingStats + agencyLiveState
- [x] personnel

### C) Flux complet
- [x] scan/list → updateStatut
- [x] scan QR + offline queue
- [x] impression
- [x] départ véhicule (markOriginDeparture)
- [x] clôture (transaction + batch)

### D) Départs planifiés
- [x] UI + lecture tripAssignments

### E) Liste passagers
- [x] UI + listener reservations

### F) Scan QR
- [x] UI + lookup + updateStatut

### G) Impression liste
- [x] zone print + permissions chef agence

### H) Historique
- [x] boardingLogs confirmé
- [ ] agentHistoryService collection à confirmer

### I) Statuts embarquement
- [x] mapping et patch transaction
- [x] liens avec stats & capacité

---

Fin du rapport (audit strict module Boarding / Embarkement agence).

