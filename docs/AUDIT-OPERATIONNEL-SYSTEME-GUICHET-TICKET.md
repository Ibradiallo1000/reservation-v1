# Audit opérationnel — Système Ticket (Guichet) — Module Agence

**Périmètre :** description stricte de l’existant. Aucune modification de code, aucune proposition d’évolution, aucun ajout de fonctionnalité.

**Date :** 2025.

---

## PARTIE 1 — Workflow guichetier

### 1. Que se passe-t-il lorsqu’un guichetier se connecte ?

- L’utilisateur possédant le rôle **`guichetier`** est reconnu dans `AuthContext` (rôles canoniques et `routeForRole`). La redirection après login envoie vers **`/agence/guichet`**.
- La route est protégée par `ProtectedRoute` avec `allowedRoles: routePermissions.guichet` (inclut `guichetier`). La page affichée est **`AgenceGuichetPage`**.
- Au chargement, le hook **`useActiveShift`** s’exécute : il interroge Firestore pour savoir si ce guichetier a déjà un poste **ouvert** (statuts `pending`, `active`, `paused`). La requête cible la collection `companies/{companyId}/agences/{agencyId}/shifts` avec `userId == user.uid` et `status in [pending, active, paused]`, tri par `createdAt` desc, limite 1.
- Si un tel poste existe, il est considéré comme « poste actif » et l’UI affiche la barre de session (PosSessionBar) avec les actions Pause / Continuer / Clôturer. Si aucun poste ouvert n’existe, le guichetier doit **ouvrir un poste** (voir ci‑dessous). Un **claim appareil** (device lock) est tenté lorsque le poste est `active` ou `paused` : seul l’appareil qui a revendiqué le poste peut l’utiliser ; sinon l’UI affiche que le poste est verrouillé par un autre appareil.

### 2. Comment un poste / une session est-il ouvert ?

- **Côté guichetier :** le guichetier clique sur « Ouvrir le comptoir » (ou équivalent) dans la barre de session. Cela appelle **`startShift()`** du hook `useActiveShift`.
- **Logique :** `startShift` appelle d’abord **`getOpenShiftId`** (service) pour vérifier qu’il n’existe pas déjà un poste ouvert pour cet utilisateur. S’il en existe un, aucune nouvelle session n’est créée. Sinon, **`createSession`** (sessionService) est appelé.
- **`createSession`** crée un **nouveau document** dans `companies/{companyId}/agences/{agencyId}/shifts` avec les champs : `companyId`, `agencyId`, `userId`, `userName`, `userCode` (staffCode/codeCourt/code ou `GUEST`), `status: 'pending'`, `startAt: null`, `endAt: null`, `startTime: null`, `endTime: null`, `dayKey` (YYYYMMDD du jour), `tickets: 0`, `amount: 0`, `totalRevenue: 0`, `totalReservations: 0`, `totalCash: 0`, `totalDigital: 0`, `accountantValidated: false`, `managerValidated: false`, timestamps `createdAt` / `updatedAt`. Le poste est donc créé en **PENDING**.
- Le passage à **ACTIVE** (ouverture effective pour vendre) n’est **pas** fait par le guichetier dans le flux principal : c’est le **comptable d’agence** qui **active** le poste depuis la page **Comptabilité** (`AgenceComptabilitePage`) en appelant **`activateSession`** (sessionService). Lors de l’activation, le service met à jour le document shift (`status: 'active'`, `startAt`, `startTime`, `activatedAt`, `activatedBy`) et crée ou met à jour le document **shiftReport** correspondant (`shiftReports/{shiftId}`) avec `status: 'pending_validation'`, et appelle **`updateAgencyLiveStateOnSessionOpened`**.

En résumé : le guichetier **crée** un poste PENDING ; le **comptable** l’**active** (PENDING → ACTIVE) pour que le guichetier puisse vendre.

### 3. Où le poste (shift) est-il stocké dans Firestore ?

- **Collection :**  
  **`companies/{companyId}/agences/{agencyId}/shifts`**
- Chaque document représente un poste. Identifiant = ID du document (généré par `addDoc` à la création). Champs principaux : `companyId`, `agencyId`, `userId`, `userName`, `userCode`, `status` (`pending` | `active` | `paused` | `closed` | `validated`), `startAt`, `endAt`, `startTime`, `endTime`, `dayKey`, `tickets`, `amount`, `totalRevenue`, `totalReservations`, `totalCash`, `totalDigital`, `accountantValidated`, `managerValidated`, `deviceFingerprint`, `deviceClaimedAt`, `sessionOwnerUid`, `createdAt`, `updatedAt`. Après clôture : `closedAt` ; après validation comptable (sessionService) : `validatedAt`, `validationAudit`. Une autre voie (validateShiftWithDeposit) peut écrire `lockedComptable`, `comptable`, `declaredDeposit`, `difference`, `discrepancyType`, etc.

### 4. Comment les ventes de billets sont-elles enregistrées ?

- Chaque vente est enregistrée comme une **réservation** via **`createGuichetReservation`** (guichetReservationService).
- Le document est créé dans **`companies/{companyId}/agences/{agencyId}/reservations`** avec : `trajetId`, `date`, `heure`, `depart`, `arrivee`, `nomClient`, `telephone`, `seatsGo`, `seatsReturn`, `montant`, `statut: 'payé'`, `statutEmbarquement: 'en_attente'`, `canal: 'guichet'`, `paiement: 'espèces'`, `paiementSource: 'encaisse_guichet'`, **`guichetierId`**, **`guichetierCode`**, **`shiftId`** (ID du poste en cours), `referenceCode`, `qrCode` (ID doc), `companyId`, `agencyId`, `compagnieNom`, `agencyNom`, etc., et `createdInSessionId` / `createdByUid`.
- La création se fait dans une **transaction** Firestore : lecture du document shift pour vérifier que le statut est `active` ou `paused`, que le poste n’est pas verrouillé, et que l’appareil (optionnellement passé en `deviceFingerprint`) correspond. Puis écriture de la réservation et appel à **`updateDailyStatsOnReservationCreated`** (incrément de `totalPassengers` et `totalSeats` pour la date dans `dailyStats`).
- Le **code de référence** du billet est généré par **`generateRef`** dans AgenceGuichetPage : il utilise un compteur par trajet `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` pour produire un numéro séquentiel et forme une référence du type `{companyCode}-{agencyCode}-{sellerCode}-{seq}` (ex. COMP-AGC-G01-001).

### 5. Comment est calculé l’expectedAmount ?

- Il n’y a **pas** de champ unique nommé `expectedAmount` stocké au moment de la clôture par le guichetier. Les montants « attendus » sont **dérivés** des réservations.
- **À la clôture du poste** (voir point 6), **`closeSession`** (sessionService) lit **toutes** les réservations du poste (`shiftId == shiftId` et `canal == 'guichet'`). Pour chaque réservation il calcule : `totalRevenue` (somme des `montant`), `totalCash` (somme des montants où `paiement` est « espèces » / « especes »), `totalDigital` (reste). Ces totaux sont écrits sur le **shift** et sur le **shiftReport** à la clôture.
- **Côté comptable** (AgenceComptabilitePage), pour les postes **closed**, un agrégat est recalculé en lecture : pour chaque poste clôturé, les réservations avec `shiftId == s.id` sont lues et on calcule `cashExpected` (montants des réservations guichet en espèces), `mmExpected` (mobile money), `onlineAmount` (canal en_ligne), etc. Le **montant espèces attendu** correspond donc à la somme des `montant` des réservations du shift avec `canal` guichet et paiement espèces.
- Lors de la **validation comptable** (voir partie 3), le comptable saisit le **montant espèces reçu** (`receivedCashAmount`). L’**expected** côté service est **`totalCash`** du document shift (ou `amount` en repli), calculé à la clôture à partir des réservations. La **différence** est `computedDifference = receivedCashAmount - expectedCash` et est stockée dans `validationAudit`.

### 6. Comment le poste est-il clôturé ?

- Le guichetier clique sur **Clôturer** dans la barre de session (PosSessionBar). Cela déclenche **`handleSessionClose`** dans AgenceGuichetPage, qui appelle **`closeShift()`** du hook `useActiveShift`, puis affiche la modale de résumé de session (**SessionSummaryModal**) et bascule l’onglet sur « Rapport ».
- **`closeShift`** appelle **`closeSession`** du sessionService avec `companyId`, `agencyId`, `shiftId`, `userId`, `deviceFingerprint`. Le hook remet ensuite `activeShift` à `null`.
- **`closeSession`** (sessionService) : dans une **transaction** Firestore, il vérifie que le document shift existe, que son statut est clôturable (`pending`, `active`, `paused`), qu’il n’est pas déjà verrouillé (validated), et que l’appareil correspond. Puis il lit toutes les réservations du poste (refs pré-récupérées en dehors de la transaction), calcule les totaux (revenus, espèces, digital, billets, détails par trajet), écrit le **shiftReport** (ou le met à jour avec merge), met à jour le **shift** (status `closed`, `endAt`, `endTime`, `closedAt`, `tickets`, `amount`, `totalRevenue`, `totalReservations`, `totalCash`, `totalDigital`), appelle **`updateDailyStatsOnSessionClosed`** (incrément de `closedSessions` pour la date) et **`updateAgencyLiveStateOnSessionClosed`** (décrément `activeSessionsCount`, incrément `closedPendingValidationCount`). Aucune saisie de « montant compté » n’est demandée au guichetier à la clôture.

### 7. Quels champs sont enregistrés à la clôture ?

- **Sur le document shift :** `status: 'closed'`, `endAt`, `endTime`, `closedAt`, `tickets`, `amount`, `totalRevenue`, `totalReservations`, `totalCash`, `totalDigital`, `updatedAt`.
- **Sur le document shiftReport** (`shiftReports/{shiftId}`) : `shiftId`, `companyId`, `agencyId`, `userId`, `userName`, `userCode`, `startAt`, `endAt`, `closedAt`, `billets`, `montant`, `totalRevenue`, `totalReservations`, `totalCash`, `totalDigital`, `details` (tableau par trajet : trajet, billets, montant, heures), `accountantValidated: false`, `managerValidated: false`, `status: 'pending_validation'`, `createdAt` (repris du shift), `updatedAt`.

### 8. Que se passe-t-il si countedAmount ≠ expectedAmount ?

- Le guichetier **ne saisit pas** de « montant compté » à la clôture. La comparaison se fait **lors de la validation comptable** : le comptable saisit le **montant espèces reçu** (`receivedCashAmount`) dans AgenceComptabilitePage.
- **`validateSessionByAccountant`** calcule `computedDifference = receivedCashAmount - expectedCash` (où `expectedCash` = `totalCash` du shift, lui-même calculé à la clôture à partir des réservations). Cette différence est enregistrée dans l’objet **`validationAudit`** sur le shift et le shiftReport : `validatedBy`, `validatedAt`, `receivedCashAmount`, `computedDifference`, `accountantDeviceFingerprint`.
- La validation est **toujours enregistrée** (le poste passe en `validated`) même en cas d’écart. Après l’appel, l’UI affiche une **alerte** : « Validation enregistrée. Écart (reçu - attendu) : +X ou -X [devise] » si `computedDifference !== 0`, sinon « Validation enregistrée ✓ ». Aucune règle métier ne bloque la validation en cas d’écart ; le mouvement de trésorerie **revenue_cash** enregistré utilise le **montant reçu** (`receivedCashAmount`), pas le montant attendu.

---

## PARTIE 2 — Visibilité chef d’agence

### 1. Où le chef d’agence voit-il les sessions guichet ?

- **ManagerDashboardPage** (tableau de bord manager d’agence) : écoute la collection **`companies/{companyId}/agences/{agencyId}/shifts`** avec un filtre `status in ['active','paused','closed','validated']` (limit 100). Les postes sont affichés (actifs, en pause, clôturés, validés) avec indicateurs et comptages (revenus du jour par shift, etc.).
- **ManagerCockpitPage**, **ManagerFinancesPage**, **ManagerReportsPage** : chargent également les **shifts** de l’agence (même chemin Firestore) pour afficher les postes, dont ceux en attente d’approbation chef (validés par la compta mais pas encore par le chef).
- **ValidationChefAgencePage** (workflow partagé) : lit la collection **`companies/{companyId}/agences/{agencyId}/shiftReports`** avec `status == 'awaiting_manager'` pour afficher les rapports « en attente de validation du chef ». Ce flux utilise des statuts **différents** de ceux écrits par sessionService (qui écrit `pending_validation` puis `validated`), donc cette page peut rester vide si seul le flux sessionService est utilisé.

### 2. Peut-il voir les sessions OPEN ?

- Oui. Sur le **ManagerDashboardPage** (et pages manager similaires), la requête sur **shifts** inclut les statuts **`active`** et **`paused`**. Les postes ouverts (actifs ou en pause) sont donc visibles et comptés (ex. `activeShiftsCount`, listes `activeShifts` / `closedShifts` / `validatedShifts`).

### 3. Peut-il voir les sessions CLOSED ?

- Oui. La même requête inclut **`closed`** et **`validated`**. Les postes clôturés et validés sont listés (ex. `closedShifts`, `validatedShifts`).

### 4. Peut-il valider ou rejeter des sessions ?

- **Validation / approbation chef :** le service **`chefApproveShift`** permet d’enregistrer l’approbation du chef d’agence sur un poste **déjà validé par la comptabilité**. Il exige sur le document shift : `status === 'validated'`, `lockedComptable === true` et `comptable.validated === true`. Il met à jour le shift avec `chef: { validated: true, at, by, note }` et `lockedChef: true`.
- **Important :** **`validateSessionByAccountant`** (sessionService) ne met **pas** à jour `lockedComptable` ni `comptable`. Ces champs sont renseignés par l’ancien flux **`validateShiftWithDeposit`**. Donc l’approbation chef via **chefApproveShift** n’est possible que pour les postes validés via **validateShiftWithDeposit**. Pour les postes validés uniquement via **validateSessionByAccountant** (flux principal de AgenceComptabilitePage), la condition `lockedComptable` n’est pas remplie et le chef ne peut pas appeler **chefApproveShift** avec succès.
- **Rejet :** il n’existe pas dans le code de fonction dédiée « rejet » d’un poste par le chef (pas de passage à un statut « rejected » ou d’annulation de la validation).

### 5. Quelles collections Firestore sont lues pour cela ?

- **Shifts (postes) :**  
  **`companies/{companyId}/agences/{agencyId}/shifts`**  
  Requêtes typiques : `where('status', 'in', ['active','paused','closed','validated'])`, parfois `where('status', '==', 'validated')` ou `where('status', '!=', 'validated')`.
- **Rapports de poste (pour listes détaillées / validation chef legacy) :**  
  **`companies/{companyId}/agences/{agencyId}/shiftReports`**  
  Ex. `where('status', '==', 'awaiting_manager')` (ValidationChefAgencePage) ou `where('status', '==', 'validated')` (CEO).
- **Réservations** (pour détail des ventes par poste) :  
  **`companies/{companyId}/agences/{agencyId}/reservations`**  
  Ex. `where('shiftId', '==', shiftId)`.

---

## PARTIE 3 — Workflow comptable agence

### 1. Comment le comptable d’agence valide-t-il les postes ?

- Le comptable travaille sur **AgenceComptabilitePage** (Comptabilité d’agence). La page écoute en temps réel la collection **`companies/{companyId}/agences/{agencyId}/shifts`** (sans filtre de statut dans la sous-collection) et répartit les postes en listes : **pending**, **active**, **paused**, **closed**, **validated**.
- Pour les postes **pending**, le comptable peut **activer** le poste (bouton « Activer ») : appel à **`activateSession`** (sessionService), qui fait passer le shift de PENDING à ACTIVE et crée/met à jour le shiftReport.
- Pour les postes **closed**, le comptable voit un champ de saisie « Montant espèces reçu » et un bouton de **validation de la réception**. Au clic, **`validateReception`** est appelé : il récupère le montant saisi (`cashReceived`), puis appelle **`validateSessionByAccountant`** (sessionService) avec `receivedCashAmount`, `validatedBy` (id + nom du comptable connecté), et `accountantDeviceFingerprint`.

### 2. Quels changements de statut lors de la validation ?

- **validateSessionByAccountant** (sessionService) : le **shift** passe de **`closed`** à **`validated`**. Le **shiftReport** (même ID que le shift) passe à **`status: 'validated'`**. Aucun autre statut intermédiaire n’est écrit par ce service (pas de `awaiting_accountant` / `awaiting_manager`).
- **validateShiftWithDeposit** (autre flux) : le shift passe de **`closed`** à **`validated`** et reçoit en plus `lockedComptable: true`, `comptable: { validated, at, by }`.

### 3. Quels documents Firestore sont mis à jour ?

- **`companies/{companyId}/agences/{agencyId}/shifts/{shiftId}`**  
  Champs mis à jour par **validateSessionByAccountant** : `status: 'validated'`, `validatedAt`, `validationAudit` (objet contenant validatedBy, validatedAt, receivedCashAmount, computedDifference, accountantDeviceFingerprint), `updatedAt`.
- **`companies/{companyId}/agences/{agencyId}/shiftReports/{shiftId}`**  
  Mêmes champs : `status: 'validated'`, `validatedAt`, `validationAudit`, `updatedAt`.
- **`companies/{companyId}/agences/{agencyId}/dailyStats/{date}`**  
  Via **updateDailyStatsOnSessionValidated** (dans la même transaction) : `totalRevenue` incrémenté du `totalRevenue` du shift, `validatedSessions` incrémenté de 1, `updatedAt` (merge avec champs de base en increment(0)).
- **`companies/{companyId}/agences/{agencyId}/agencyLiveState/current`**  
  Via **updateAgencyLiveStateOnSessionValidated** : `closedPendingValidationCount` décrémenté de 1.
- **Trésorerie :** si le compte caisse agence existe, **recordMovementInTransaction** enregistre un mouvement **revenue_cash** (externe → caisse agence) pour le montant **receivedCashAmount**, avec `referenceType: 'shift'`, `referenceId: shiftId`.

### 4. La validation écrit-elle dans dailyStats ou un autre agrégat ?

- **Oui.** Dans la même transaction que la validation, **updateDailyStatsOnSessionValidated** est appelé : il fait un **set** avec **merge** sur le document **`dailyStats/{date}`** (date dérivée de `closedAt` / `endAt` du shift) en incrémentant **`totalRevenue`** du montant `totalRevenue` du shift et **`validatedSessions`** de 1. Les champs de base (totalPassengers, totalSeats, etc.) sont initialisés à 0 via `increment(0)` si besoin.

---

## PARTIE 4 — Comptable compagnie / CEO

### 1. Comment les revenus billets arrivent-ils aux tableaux de bord CEO ?

- **CEOCommandCenterPage** agrège les données par période (startStr / endStr). Les **revenus validés** proviennent principalement de la **collection group** **`dailyStats`** : requête `collectionGroup(db, 'dailyStats')` avec `companyId == companyId` et `date >= startStr`, `date <= endStr`. Chaque document dailyStats contient notamment **totalRevenue** (alimenté à la validation des postes, voir partie 3). Les totaux sont dérivés en sommant ces champs par agence / global.
- Les **revenus en attente** (ventes réalisées mais pas encore validées) sont calculés séparément : pour chaque agence, lecture des **shifts** avec `status != 'validated'`, constitution de l’ensemble des IDs de postes non validés, puis lecture des **reservations** de l’agence et sommation des **montant** des réservations **payées** dont le `shiftId` (ou `createdInSessionId`) appartient à cet ensemble. Ce total est affiché comme « PendingRevenue » ou équivalent.

### 2. Quelles collections sont utilisées pour l’agrégation des revenus ?

- **dailyStats** (collection group) :  
  `companies/{companyId}/agences/{agencyId}/dailyStats/{date}`  
  Champs utilisés : `companyId`, `agencyId`, `date`, `totalRevenue`, `totalPassengers`, `totalSeats`, `validatedSessions`, `closedSessions`, etc.
- **shifts** (par agence) :  
  `companies/{companyId}/agences/{agencyId}/shifts`  
  Pour distinguer postes validés / non validés et calculer les revenus en attente.
- **reservations** (par agence) :  
  `companies/{companyId}/agences/{agencyId}/reservations`  
  Pour associer montants et `shiftId` / `createdInSessionId` (revenus en attente).
- **shiftReports** (collection group) :  
  Requête `where('companyId','==', companyId)`, `where('status','==','validated')` pour des listes de rapports validés (ex. écarts / indicateurs).

### 3. Comment dailyStats est-il alimenté ?

- **À la création d’une réservation (guichet) :** **updateDailyStatsOnReservationCreated** (dans la transaction de création) incrémente **totalPassengers** et **totalSeats** du document **dailyStats/{date}**. La date utilisée est **params.date** (date du trajet de la réservation), passée au service par l’appelant (AgenceGuichetPage).
- **À la clôture d’un poste :** **updateDailyStatsOnSessionClosed** incrémente **closedSessions** pour la date (date dérivée de `endAt` par **toDailyStatsDate**).
- **À la validation comptable d’un poste :** **updateDailyStatsOnSessionValidated** incrémente **totalRevenue** du montant total du shift et **validatedSessions** de 1 pour la date du **closedAt** du shift.
- Le format de l’ID du document dailyStats est **YYYY-MM-DD** (ex. `2025-02-22`).

### 4. Quels services mettent à jour les calculs de profit ?

- Les **revenus** utilisés pour les indicateurs CEO proviennent des agrégats **dailyStats** et des réservations (voir ci‑dessus). Les **mouvements de trésorerie** (entrée caisse agence lors de la validation) sont enregistrés par **recordMovementInTransaction** dans **validateSessionByAccountant** (mouvement **revenue_cash**). Les modules « profit » ou « intelligence » (ex. **profitEngine**, **trip costs**) peuvent consommer ces mêmes données (dailyStats, shiftReports, réservations, dépenses) pour des calculs de marge ou de coûts ; les mises à jour directes des revenus ticket passent par **dailyStats** et **shifts/shiftReports** comme décrit, pas par un service unique dédié « profit » pour l’écriture des revenus billets.

---

## PARTIE 5 — Structure Firestore (module ticket uniquement)

Chemins **exacts** des collections utilisées par le système ticket (guichet) :

| Ressource | Chemin Firestore |
|-----------|------------------|
| **Shifts (postes)** | `companies/{companyId}/agences/{agencyId}/shifts` |
| **Shift reports** | `companies/{companyId}/agences/{agencyId}/shiftReports` |
| **Daily stats** | `companies/{companyId}/agences/{agencyId}/dailyStats/{date}` — date au format YYYY-MM-DD |
| **Réservations** | `companies/{companyId}/agences/{agencyId}/reservations` |
| **Agrégat live agence** | `companies/{companyId}/agences/{agencyId}/agencyLiveState/current` |
| **Compteur référence billet** | `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` |

- **Collection group** utilisée côté CEO / rapports : **`dailyStats`**, **`shiftReports`** (avec filtres `companyId`, `date`, `status`).
- Les **mouvements de trésorerie** (revenue_cash après validation) sont enregistrés dans le module trésorerie (comptes financiers et mouvements), pas dans les collections ci‑dessus.

---

## PARTIE 6 — Identification de l’agent

### 1. Comment le guichetier est-il identifié sur le billet ?

- Chaque réservation guichet stocke **guichetierId** (uid) et **guichetierCode** (code court). Le **guichetierCode** est passé à **createGuichetReservation** via le paramètre **userCode** (dérivé de `staffCode` ou `codeCourt` ou `code` du profil utilisateur, ou `GUEST`). Ces champs sont persistés sur le document réservation dans **reservations**.

### 2. Existe-t-il un code guichet ?

- Oui, au sens « code du guichetier » : c’est le **userCode** / **guichetierCode** (stocké sur la réservation). Il provient du profil **utilisateur** : collection **`users/{userId}`**, champs **`staffCode`**, **`codeCourt`** ou **`code`** (utilisés dans l’ordre par getSellerCode et dans AgenceGuichetPage : `staffCodeForSale`, `sellerCodeCached`). Il n’y a pas de « code guichet » au sens « numéro de guichet physique » distinct dans le modèle actuel.

### 3. Où est-il stocké ?

- **Réservation :** champs **`guichetierId`**, **`guichetierCode`** (et éventuellement `createdByUid`) sur chaque document de **`companies/{companyId}/agences/{agencyId}/reservations`**.
- **Utilisateur :** **`users/{uid}`** — champs **`staffCode`**, **`codeCourt`**, **`code`** (selon le schéma du profil).
- **Shift / shiftReport :** **`userCode`** (et `userName`, `userId`) pour identifier le guichetier du poste.

### 4. Comment est-il affiché sur les reçus ?

- **ReceiptModal** (guichet) : l’interface **ReservationData** inclut **guichetierCode** (et guichetierId), mais dans le rendu actuel du reçu (contenu imprimable / thermal), **aucune ligne n’affiche le code guichetier**. Seuls sont affichés notamment : référence, date d’émission, passager, téléphone, trajet, places, montant, paiement, QR code, messages de validité. Donc le code guichetier est **disponible dans les données** du reçu mais **n’est pas affiché** sur le ticket.
- **SessionSummaryModal** (résumé de session après clôture) : affiche **userName** et **userCode** (guichetier) dans l’en-tête : « {userName} ({userCode}) ».
- **PosSessionBar** : affiche le **userCode** du guichetier connecté dans la barre de session.
- **ShiftHistoryPage** et listes de rapports (comptabilité, chef) : affichent **guichetierCode** ou **userCode** à côté du nom du guichetier pour identifier la session.

---

*Fin du rapport d’audit — Système Ticket (Guichet), module Agence.*
