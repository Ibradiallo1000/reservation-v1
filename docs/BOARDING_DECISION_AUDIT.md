# BOARDING_DECISION_AUDIT (audit uniquement)

> Complément de décision pour la refonte UI embarquement (Phase 1) basé sur le code existant.
> Contraintes: **aucune modification de code** et **pas de modification de règles/Firestore**.

Périmètre: module **agence/boarding** + **agence/embarquement** (hors escales).

---

## 1) Décision: la liste passagers dépend-elle obligatoirement de `tripAssignments` ?

### Verdict
**Non, pas obligatoirement.**

### Pourquoi
- La liste passagers affichée dans `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` est un **listener realtime sur** :
  - `companies/{companyId}/agences/{agencyId}/reservations`
- Le filtrage utilise:
  - `date == selectedDate`
  - `depart == selectedTrip.departure`
  - `arrivee == selectedTrip.arrival`
  - `heure == selectedTrip.heure`
  - `statut in [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"]`
- `tripAssignments` intervient **indirectement** uniquement pour:
  - fournir la sélection du créneau (via navigation) et
  - fournir `vehicleId` / capacité (`vehicleCapacity`) et
  - démarrer la session/lock embarquement.

Donc: **les passagers peuvent être listés depuis les `reservations` vendues** en utilisant le trip/date/heure (ce que la page embarquement possède déjà via `selectedTrip`).

---

## 2) Peut-on afficher une liste passagers directement depuis les réservations vendues ?

### Verdict
**Oui.**

### Preuve dans le code
- `AgenceEmbarquementPage` charge/filtre les passagers uniquement depuis `reservations`.
- Les mises à jour (embarqué/absent) sont également centrées sur les documents `reservations/{reservationId}`.

### Limites
- La page “official print” (impression) et la capacité/contrôle embarquement sont liés à l’assignation véhicule (capacité), mais la **liste** elle-même ne dépend pas de `tripAssignments`.

---

## 3) Où se fait la confirmation départ ?

### Verdict
La **confirmation départ véhicule** se fait **dans** `AgenceEmbarquementPage.tsx`.

### Emplacement concret
- Bouton bas d’écran: `handleBusParti()`.
- `handleBusParti()` appelle:
  - `markOriginDeparture(companyId, tripInstanceIdForSlot, uid)`

### Conditions d’activation
- `tripInstanceIdForSlot` doit être résolu (résolution basée sur trip slot / progress)
- rôle chef d’agence (`canLaunchTripAfterAgencyValidation`)
- tripInstance `tripStatutMetier === "validation_agence_requise"`
- présence d’au moins un passager “boarded”
- interdit si `scanOn` (doit arrêter le scan)

---

## 4) Où se fait la confirmation arrivée ?

### Verdict
Dans ce périmètre (boarding “principal agence”, hors escales):
- l’“arrivée” n’est pas confirmée via un bouton séparé.
- la clôture de l’embarquement déclenche la progression (et la sortie fleet) et marque l’exécution trajet à “boarding completed”.

### Où dans le code
- `cloturerEmbarquement()` (clôture/confirmation d’étape)
  - marque absents
  - écrit `boardingClosures/{tripKey}`
  - écrit `boardingLogs` result `CLOSURE`
  - transition fleet assigned → in_transit
  - et ensuite appelle `markTripExecutionBoardingCompleted(...)` si `tripInstanceIdForSlot`.

### Donc: mapping “arrivée” (métier)
- Le “fait d’avoir clôturé l’embarquement” est le point d’engagement de l’étape suivante.
- L’arrivée/assortiment “in transit/arrived” est géré plus loin par la chaîne trip execution / trip progress.

---

## 5) Quelles parties flotte/garage/logistique peuvent être masquées sans casser le scan ?

### Verdict (UI Phase 1)
Pour que le scan/list continue de fonctionner, il faut conserver **uniquement**:
1) la capacité embarquement (`vehicleCapacity`),
2) la sélection du créneau (selectedTrip.date/heure/depart/arrivee),
3) l’identifiant d’assignation et `vehicleId` nécessaires au lock/session offline snapshot,
4) la logique d’activation du scanner (scanOn).

Tout le reste peut être “masqué” en UI tant qu’on ne supprime pas les données requises.

### Parties potentiellement masquables (au niveau UI)
- Les détails affichés sur:
  - “chauffeur/convoyeur” (ils sont reconstitués via affectation et/ou fleet/crew documents)
- La table “départs planifiés” (sauf si c’est votre écran principal)
- L’écran “live ops” (supervision) peut être masqué en Phase 1 si vous ne l’exposez pas.

### Parties non masquables (fonctionnelles)
- Les dépendances de scan/validate qui déclenchent la mise à jour Firestore et offline queue :
  - `effectiveBoardingAssignmentRef` (assignmentId + vehicleId + status planned/validated)
  - capacity check (`vehicleCapacity`)
  - caméra QR / input code
  - offline queue (`boardingQueue`) et snapshot (`boardingSlotSnapshot`)

---

## 6) Quelles actions sont réellement nécessaires pour Phase 1 ?

### Verdict
Actions UI minimales (sans toucher au métier):

1) **Choisir clairement la page principale** du flow scan:
   - l’écran principal scan doit exposer : sélection créneau, mode scan/liste, capacité, bouton embarqué.
2) **Réduire la complexité UI** de `AgenceEmbarquementPage` en conservant uniquement :
   - scan camera + scan manuel
   - liste passagers (listener reservations)
   - feedback overlay
   - impression (si chef agence)
   - clôture + départ véhicule
3) **Maintenir offline**:
   - conserver snapshot + queue + hydratation offline identique
4) **Maintenir le contrôle capacity / dédup**:
   - pas de changement de logique, uniquement présentation.

---

## 7) Quelle page doit devenir la page principale : `/agence/boarding` ou `/agence/boarding/scan` ?

### Verdict
**Pour Phase 1 (centrée scan/list embarquement):** choisir **`/agence/boarding/scan`** comme page principale.

### Justification
- `/agence/boarding` = écran “départs planifiés” orienté navigation.
- Le scan/list (fonction métier principale embarquement) est dans :
  - `AgenceEmbarquementPage` rendu depuis `/agence/boarding/scan`.
- Le choix de `/agence/boarding/scan` comme page principale permet d’éviter:
  - navigation par `location.state` comme prérequis implicite
  - dépendance UI à la liste des départs si l’objectif Phase 1 est “scanner efficacement”.

### Alternative (si vous voulez un écran unique)
- Vous pouvez utiliser `/agence/boarding` comme “shell” et inclure une sous-vue scan dans la même page, **mais** sans changer les routes, le plus simple côté refonte UI est:
  - garder `/agence/boarding/scan` comme page d’embarquement active.

---

## 8) Apports de `BoardingLiveOpsPage` (décision)

- `BoardingLiveOpsPage` affiche un tableau supervisé à partir de `tripAssignments`.
- Il n’apporte pas la mécanique scan elle-même.

### Donc (Phase 1)
- cette page peut être **optionnelle** (masquable) sans casser le scan.

---

## Résumé décisions (check-list)
- [x] Liste passagers: **ne dépend pas obligatoirement** de `tripAssignments`.
- [x] Oui, on peut afficher la liste depuis `reservations`.
- [x] Confirmation départ: `handleBusParti()` → `markOriginDeparture(...)`.
- [ ] Confirmation arrivée: pas un bouton séparé ici; elle est indirectement matérialisée via clôture/boarding completed.
- [x] Masquable UI: chauffeur/convoyeur/détails live, live ops.
- [x] Non masquable fonctionnel: capacity + selectedTrip + effective assignment + scan/queue/snapshot.
- [x] Page principale Phase 1 recommandée: **`/agence/boarding/scan`**.

