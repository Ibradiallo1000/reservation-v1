# BOARDING_DEPARTURES_AUDIT (audit décisionnel)

> Audit uniquement : aucune modification de code / routes / règles.

## 0) Fichiers analysés (strict)
- `src/modules/agence/boarding/BoardingDashboardPage.tsx`
- `src/modules/agence/boarding/BoardingScanPage.tsx`
- `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx`
- services utilisés par le dashboard/scan via import :
  - `@/modules/agence/planning/tripAssignmentService`
  - `@/modules/agence/embarquement/boardingQueue`
  - `@/modules/agence/embarquement/boardingSlotSnapshot`
- sources Firestore référençées explicitement dans ces fichiers.

---

## 1) Comment la page “Départs planifiés” construit sa liste ?

### 1.1 Construction (observé)
Dans `BoardingDashboardPage.tsx`, la liste `departures` est construite comme suit :

1) **Récupération des agences**
- `getDocs(collection(db, companies/{companyId}/agences))`

2) **Récupération de weeklyTrips (pour enrichissement UI)**
- `getDocs(collection(db, companies/{companyId}/agences/{agencyId}/weeklyTrips))`
- puis `tripById` sert uniquement à obtenir `departure` et `arrival` par `tripId`.

3) **Récupération des “départs” = tripAssignments pour la date**
- `listBoardingTripAssignmentsForDate(companyId, agencyId, selectedDate)`
- ces “assignments” fournissent :
  - `assignmentId` (= doc id)
  - `tripId`
  - `date` / `heure`
  - `vehicleId`
  - `status` (planned/validated)

4) **Capacité/infos véhicule (pour affichage plaque)**
- lecture des véhicules : `vehicleRef(companyId, vid)` via `getDoc` pour `plateNumber`.

### 1.2 Verdict réponse Q1
- **tripAssignments** : **oui, c’est la source des départs** (créneaux).
- **weeklyTrips** : **oui, mais uniquement pour afficher departure/arrival** à partir du `tripId`.
- **réservations** : **non** dans cette page (le dashboard n’utilise pas `reservations`).

➡️ **Réponse Q1 (catégories)** : **combinaison des trois ?**
- Départs (créneaux) : **tripAssignments uniquement**
- Texte/attributs voyage : **weeklyTrips** (mapping tripId → departure/arrival)
- Passagers : **reservations** : **absent du dashboard**.

---

## 2) Un départ peut-il apparaître dans l’embarquement sans tripAssignment ?

### Verdict Q2
**Non (pour l’embarquement “chef d’embarquement principal agence” dans ce scope), au sens “sélection créneau opérable”.**

### Justification (observé)
- Le scan/list (`AgenceEmbarquementPage`) opère sur :
  - `selectedTrip` (departure/arrival/heure/date)
  - et surtout sur une **affectation opérationnelle** effective :
    - `activeBoardingAssignment` / `fallbackBoardingAssignment`
    - qui dépend de `tripAssignments` chargés via `listBoardingTripAssignmentsForDate`.
- En offline, le snapshot (`boardingSlotSnapshot`) encode `assignmentId` et `vehicleId`.
- Le verrou/session (`startBoardingSessionLock`) et snapshot requièrent `assignmentId`.

Donc, un départ “fonctionnel” pour scan/list ne peut pas être ouvert sans `tripAssignments` dans l’architecture actuelle.

---

## 3) Peut-on reconstruire les départs du jour uniquement depuis reservations et weeklyTrips sans casser scan/impression/embarqué/absent/clôture/départ ?

### Verdict Q3
**Pas dans l’architecture actuelle, en l’état.**

### Pourquoi (dépendances non substituables)
Pour que le scan/list fonctionne, il faut :

1) **assignmentId**
- utilisé pour : lock/session, dedup embarquement, liveStatus, boardingStats keying par trip slot, snapshot offline.

2) **vehicleId / capacité**
- indispensable pour le contrôle capacity (`vehicleCapacity`).
- `vehicleCapacity` est résolue via `getVehicleCapacity(companyId, vehicleId)`.

3) **status planned|validated**
- contrôle l’ouverture/usage de l’embarquement.

Ces informations ne sont pas portées par `reservations` (qui représentent passagers/billets) ni uniquement par `weeklyTrips` (modèle horaire).

### Ce qu’on pourrait reconstruire à partir de reservations+weeklyTrips
- l’affichage “il y a des passagers pour tel trajet à telle heure”
- et éventuellement la liste passagers

Mais **sans mapping stable vers une affectation véhicule** (assignmentId/vehicleId/status), on ne peut pas garantir :
- scan (online/offline)
- impression officielle liée aux champs véhicule
- capacité + dédup
- clôture embarquement (qui dépend de live/locks et de l’assignation)
- confirmation départ (via `markOriginDeparture` exige un tripInstance résolu et un contexte d’embarquement).

---

## 4) Quels champs sont réellement indispensables au chef d’embarquement ?

### Champs minimum “réalistes” (UI + opérations)
- **date**
- **heure**
- **départ**
- **arrivée**
- **nombre de passagers** (dérivé de `reservations` filtrées)
- **capacité** (dérivée de `vehicleCapacity` via affectation/vehicleId)

### Champs UI “dépendants” mais non nécessaires à la capacité
- `tripId` (nécessaire pour certaines correspondances internes si weeklyTrips n’est pas utilisé)
- plaque (optionnel)

---

## 5) Quels champs proviennent uniquement de tripAssignments et ne servent qu’à la logistique interne ?

### Champs tripAssignments (observés dans les dépendances)
- `assignmentId` (id doc)
- `vehicleId`
- `status` planned|validated
- `heure`, `date` (créneau)
- `liveStatus` (pour supervision live)

### Verdict logistique interne vs opération chef
- **assignmentId + vehicleId + status** : indispensables fonctionnellement (pas seulement logistique interne) car ils structurent :
  - le lock/session
  - la capacité
  - l’anti double scan et snapshot offline
- `liveStatus` : surtout supervision (peut être masqué en UI)
- (driver/convoyeur si présents) : logistique interne, affichage optionnel.

---

## 6) Verdict clair sur tripAssignments

### Réponse attendue (A/B/C)
✅ **B. tripAssignments utile mais invisible**

Raisonnement :
- Pour l’utilisateur (chef d’embarquement), l’écran “départs du jour” doit montrer date/heure/départ/arrivée et une estimation passagers.
- Toutefois, côté système, `tripAssignments` reste **indispensable** pour :
  - ouvrir le créneau (affectation opérationnelle)
  - calcul capacité
  - lock/dedup/snapshot
- En UI, on peut **masquer** la notion “assignmentId/status planned|validated”, mais pas les effets.

➡️ Donc : **tripAssignments indispensable en arrière-plan**, mais **peut être rendu invisible** dans l’interface.

---

## 7) Simulation écran métier : “Départs du jour”

Bamako → Sikasso 06h00 53 passagers
Bamako → Kayes   08h00 21 passagers
Bamako → Ségou    10h00 34 passagers

### 7.1 Réalisable avec l’architecture actuelle ?
**Oui pour l’affichage**, non pour supprimer totalement tripAssignments comme source d’ouverture opérationnelle.

### 7.2 Dépendances conservées
- `weeklyTrips` : pour afficher departure/arrival à partir d’un identifiant de trajet (tripId).
- `reservations` : pour calculer “passagers” (count/seats).
- `tripAssignments` : pour créer/ouvrir un départ opérationnel (scan/list) avec `vehicleId`/capacité et lock/session.

### 7.3 Risques techniques
- `selectedTrip` et matching trip/date/heure : si données weeklyTrips vs reservations ne convergent pas (normCity/normTime), la liste peut être incomplète.
- capacité dépend de `vehicleId` provenant d’assignation : si on restructure sans affectation, capacity check/correctness cassent.

---

## Verdict final concis
- La page “Départs planifiés” utilise `tripAssignments` comme **source des créneaux**, et `weeklyTrips` pour enrichir `departure/arrival` (UI).
- Un départ “opérationnel scan/list” ne peut pas exister sans `tripAssignments` (assignmentId/vehicleId/status).
- On peut construire un écran “Départs du jour” (date/heure/traject + passagers) via `reservations` + `weeklyTrips`, **mais** pour conserver scan/impression/capacité/clôture/départ, il faut garder `tripAssignments` en arrière-plan.

