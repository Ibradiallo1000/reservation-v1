# BOARDING_OPERATIONAL_DECISION (audit décisionnel)

> Audit uniquement, aucune modification de code / routes / règles.

## 0) Documents de base
- `docs/BOARDING_AUDIT.md`
- `docs/BOARDING_DECISION_AUDIT.md`
- `docs/BOARDING_PRODUCT_SIMPLIFICATION.md`
- `docs/BOARDING_PHASE1_IMPLEMENTATION_PLAN.md`

## 1) Rôle final du Chef d’embarquement — Phase 1 (verdict)

### Mission Phase 1 (corrigée/validée)
Le Chef d’embarquement Phase 1 doit :

1. **Voir les départs du jour**
   - (dashboard) `src/modules/agence/boarding/BoardingDashboardPage.tsx`.
2. **Ouvrir un départ**
   - navigation vers le flow scan/list (wrapper) `src/modules/agence/boarding/BoardingScanPage.tsx`.
3. **Voir la liste passagers**
   - `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` — listener temps réel sur `reservations` filtrées par date/trajet/heure.
4. **Imprimer la liste**
   - dans `AgenceEmbarquementPage.tsx` via `window.print()` + zone `#print-area`.
5. **Scanner les billets**
   - caméra QR (zxing) + scan manuel dans `AgenceEmbarquementPage.tsx`.
6. **Marquer embarqué / absent / reporté**
   - embarqué / absent : via `updateStatut(reservationId, "embarqué"|"absent"|...)`.
   - reporté : la mécanique de “report” correspond à la **reprogrammation des absents** lors de la clôture (`ABSENT_REPROG` + nouvelles reservations `canal:"report"`, `statut:"confirme"`).
7. **Confirmer le départ du bus**
   - bouton “Valider et lancer le trajet” → `handleBusParti()` → `markOriginDeparture(...)`.
8. **Confirmer l’arrivée du bus**
   - **non** comme action “Chef d’embarquement” distincte en Phase 1 dans ce périmètre.
   - le code confirme la **progression étape embarquement** à travers la **clôture** : `markTripExecutionBoardingCompleted(...)` (puis les étapes suivantes sont gérées par le module trip execution / progress).
9. **Consulter l’historique**
   - historique embarquement : `boardingLogs` écrit pendant scan (via updateStatut) et surtout pendant `CLOSURE` + `ABSENT_REPROG`.
   - supervision live : `BoardingLiveOpsPage` montre `tripAssignments.liveStatus`.

### Conclusion sur la liste demandée
- Mission Phase 1 **valide** sauf : **“confirmer l’arrivée du bus”** qui n’est pas un bouton Chef d’embarquement dans ce flux principal (hors escales/parties autres modules).

## 2) Verdict page principale (Phase 1)

### Verdict produit
✅ **Page principale : `/agence/boarding`**


### Justification opérationnelle
- `/agence/boarding` sert à **préparer** (départs planifiés) et à naviguer.
- Le **travail principal** (scan + liste + updates statuts + impression + clôture + départ) se fait dans `AgenceEmbarquementPage`, rendu à partir de `/agence/boarding/scan`.
- Choisir `/agence/boarding/scan` comme page principale simplifie le flux Phase 1 : le scan/list devient l’écran central.

### Attention UX
- Le scanner ne doit pas être la page principale si vous devez absolument conserver un accès très direct au tableau des départs + impression.
- Dans le code existant, **impression et liste** vivent dans `AgenceEmbarquementPage`, qui est accessible depuis `/agence/boarding/scan`.

## 3) Flux cible Phase 1 (structure UX)

### Desktop / tablette
1. **Tableau / carte “Départs du jour”**
2. **Carte par départ** : ouvrir le départ
3. **Écran Liste passagers + Impression**
4. **Écran Scan QR + scan manuel**
5. **Actions embarqué / absent / reporté (via clôture)**
6. **Confirmation départ**
7. **Historique embarquement** (boardingLogs + éventuellement live ops)

### Mobile
1. **Sélection départ** (déclenche navigation vers scan/list)
2. **Scan QR**
3. **Liste courte**
4. **Actions embarqué / absent / reporté** (reporté = clôture)

## 4) Dépendances à garder (nécessaires au scan)

### Indispensables
- **Sélection créneau** : `selectedTrip.{date, heure, departure, arrival, tripId}` (ou équivalent via `location.state`).
- **Affectation opérationnelle** : `assignmentId` + `vehicleId` + statut `planned|validated`.
- **Capacité** : `vehicleCapacity` (via `getVehicleCapacity`).
- **État online/offline** : snapshot (`boardingSlotSnapshot`) + queue (`boardingQueue`).
- **Écriture & cohérence** :
  - mises à jour sur `reservations`.
  - dédup/anti double scan (boardingEmbarkDedup + locks/bloquants).

### Dépendances “utiles” mais non cœur
- chauffeur/convoyeur : reconstitués via affectation / tripExecution / personnel — peuvent être affichés en option.

## 5) Dépendances à masquer (UI-only)

### Masquables sans casser le scan/list
- **Champs chauffeur / convoyeur détaillés** (optionnels en Phase 1, affichables seulement en zone texte courte).
- **Vue live ops complète** (`BoardingLiveOpsPage`) : utile pour supervision, mais peut rester hors écran principal Phase 1.
- Sections “flotte / garage / logistique avancée” non nécessaires au scan/list dans ce périmètre.

## 6) Données Firestore à réutiliser (minimum)

### Minimum pour Phase 1
- `companies/{companyId}/agences/{agencyId}/reservations`
  - filtre par `date/depart/arrivee/heure/trajetId` + `statut` boardable
  - update `boardingStatus`, `statutEmbarquement`, `controleurId`, `checkInTime`, `auditLog`, etc.
- `companies/{companyId}/agences/{agencyId}/weeklyTrips`
  - pour mapper `tripId` → `departure/arrival` (affichage/dashboard)
- `companies/{companyId}/agences/{agencyId}/tripAssignments`
  - source créneau et `vehicleId` + `liveStatus` (supervision)
- `companies/{companyId}/fleetVehicles/{vehicleId}`
  - capacité (et infos véhicules) utilisée pour contrôle capacity + impression

### Pour l’historique embarquement
- `companies/{companyId}/agences/{agencyId}/boardingLogs`
  - `CLOSURE`, `ABSENT_REPROG`, et logs de scan embarquement.

### Pour clôture/idempotence
- `companies/{companyId}/agences/{agencyId}/boardingClosures/{tripKey}`

## 7) Risques (issus du code existant)

1. **Locks embarquement potentiellement désactivés en prod**
   - observation dans le code : `BOARDING_LOCKS_DISABLED = true` dans le service de lock (donc le verrouillage Firestore peut être “best-effort”).
   - Risque : collisions multi-scanners si plusieurs appareils agissent en parallèle.
2. **Dépendance au créneau sélectionné**
   - scan/list dépend du contexte `selectedTrip` (et/ou trip slot résolu).
3. **Confusion “arrivée” vs “clôture embarquement”**
   - Phase 1 : l’UI Chef d’embarquement confirme essentiellement “boarding completed” via clôture.

## 8) Recommandations UI Phase 1 (audit décisionnel)

### Recommandation principale
- Réduire `AgenceEmbarquementPage` à un “mode opérationnel chef” :
  - Sélection départ (obligatoire)
  - Scan QR + scan manuel
  - Liste passagers
  - Impression
  - Actions embarqué/absent
  - Clôture (ce qui génère report des absents)
  - Départ bus (markOriginDeparture)

### Recommandation secondaire
- Garder la vue `BoardingDashboardPage` en “préparation” (départs du jour), mais ne pas la rendre nécessaire pour l’exécution scan une fois un départ ouvert.

---

## Verdict final
- **Rôle Phase 1 du Chef d’embarquement** : scan/list + statuts + impression + clôture + départ.
- **Arrivée bus** : pas un bouton Chef séparé dans ce flux principal ; elle est “résolue” via progression trip execution après `markTripExecutionBoardingCompleted`.
- **Page principale Phase 1** : `/agence/boarding`.
- **Page opérationnelle** : `/agence/boarding/scan`.
- **tripAssignments** : utile mais à masquer autant que possible dans l’UI.


