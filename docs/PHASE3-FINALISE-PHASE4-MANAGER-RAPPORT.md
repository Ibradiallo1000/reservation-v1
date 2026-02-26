# Rapport — Finalisation Phase 3 & Phase 4 (Tableau de bord Manager)

**Contexte :** Phase 1 (Guichet) et Phase 2 (Comptabilité agence) terminées. Phase 3 (Boarding & Fleet) déjà en place. Ce livrable finalise la Phase 3 et amorce la Phase 4 (Agency Manager Command Center).

---

## 1. Fichiers créés

| Fichier | Description |
|---------|-------------|
| `src/modules/agence/fleet/fleetStateMachine.ts` | Machine d’état flotte : transitions autorisées, création des payloads `fleetMovements`, `transitionVehicleStatus()` avec écriture systématique d’un mouvement. |
| `src/modules/agence/pages/ManagerDashboardPage.tsx` | Tableau de bord Manager (Phase 4) : sessions guichet, embarquement du jour, flotte, alertes, indicateurs. |

---

## 2. Fichiers modifiés

| Fichier | Modifications |
|---------|----------------|
| `firestore.rules` | **Écriture flotte** : `canModifyFleet()` = `isFleetController()` **ou** `isAgencyManager()` (agency_fleet_controller, chefAgence, admin_compagnie peuvent CREATE/UPDATE `fleetVehicles`). **Lecture** inchangée (fleet_controller, agency_manager, boarding_officer). **Nouvelle collection** `fleetMovements` : get/list pour canReadFleet, create pour canModifyFleet ou isBoardingOfficer. Mise à jour `fleetVehicles` : champs autorisés étendus à `lastMovementBy`, `destinationAgencyId`. |
| `src/modules/agence/fleet/types.ts` | **Machine d’état** : `FLEET_STATUS_TRANSITIONS`, `canTransition()`. **Champs véhicule** : `destinationAgencyId`, `departureTime`, `estimatedArrivalTime`, `lastMovementBy`. **Type** `FleetMovementDoc` pour la collection `fleetMovements`. |
| `src/types/index.ts` | Champs optionnels sur `FleetVehicle` : `destinationAgencyId`, `departureTime`, `estimatedArrivalTime`, `lastMovementBy`. |
| `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` | **Clôture atomique** : pré-requête des véhicules concernés ; une seule transaction qui : vérifie le verrou, marque les absents, écrit `boardingClosures`, écrit un log `boardingLogs` (CLOSURE), met à jour chaque véhicule (assigned → in_transit) avec `lastMovementBy`, écrit un doc par véhicule dans `fleetMovements`. **Contrôle de capacité** : effectué avant la transaction (getDocs + getDoc) car Firestore n’accepte pas de requête dans `tx.get()`. |
| `src/modules/agence/fleet/FleetAssignmentPage.tsx` | Payload véhicule enrichi : `destinationAgencyId`, `departureTime`, `estimatedArrivalTime`, `lastMovementBy` (null à l’affectation). |
| `src/modules/agence/fleet/FleetDashboardPage.tsx` | Véhicules « approchant cette agence » : `destinationAgencyId === currentAgencyId` ou `currentArrival === currentAgencyId`. |
| `src/modules/agence/fleet/FleetVehiclesPage.tsx` | Changement de statut via `transitionVehicleStatus()` : validation des transitions, écriture d’un `fleetMovement` à chaque changement. Désactivation des options de statut non autorisées. |
| `src/modules/agence/fleet/FleetMovementLogPage.tsx` | Lecture de la collection `fleetMovements` (ordre `movedAt` desc, limite 100) au lieu de dériver l’historique depuis `fleetVehicles`. |
| `src/AppRoutes.tsx` | Route `/agence/manager-dashboard` (PrivateRoute chefAgence, admin_compagnie). Lazy import `ManagerDashboardPage`. RoleLanding : chefAgence → `/agence/manager-dashboard`. |
| `src/modules/agence/pages/AgenceShellPage.tsx` | Premier lien de la nav agence : « Tableau de bord Manager » → `/agence/manager-dashboard`. |

---

## 3. Nouvelles collections documentées

### `companies/{companyId}/fleetMovements/{movementId}`

Chaque document enregistre un changement d’état d’un véhicule (audit et traçabilité).

| Champ | Type | Description |
|-------|------|-------------|
| vehicleId | string | ID du véhicule dans `fleetVehicles`. |
| fromAgencyId | string \| null | Agence d’origine (avant transition). |
| toAgencyId | string \| null | Agence de destination (après transition, ex. arrivée). |
| tripId | string \| null | Trajet hebdo concerné. |
| date | string \| null | Date du créneau (yyyy-mm-dd). |
| heure | string \| null | Heure du créneau (HH:mm). |
| movedBy | string | UID de l’utilisateur ayant effectué la transition. |
| movedAt | Timestamp | Date/heure de l’action. |
| previousStatus | string | Statut avant (garage, assigned, in_transit, arrived, maintenance). |
| newStatus | string | Statut après. |

**Règles :** lecture pour canReadFleet ; création pour canModifyFleet ou isBoardingOfficer (clôture d’embarquement). Pas de update/delete.

---

## 4. Machine d’état véhicule

Transitions autorisées (documentées dans `src/modules/agence/fleet/types.ts`) :

- **garage** → assigned, maintenance  
- **assigned** → in_transit (à la clôture d’embarquement)  
- **in_transit** → arrived (à l’arrivée confirmée à l’agence de destination)  
- **arrived** → garage (remise en garage)  
- **maintenance** → garage  

Toute transition invalide est refusée côté client et peut être renforcée côté règles si besoin. Chaque transition valide écrit un document dans `fleetMovements`.

---

## 5. Permissions d’écriture flotte — justification opérationnelle

**Pourquoi autoriser chefAgence et admin_compagnie à écrire dans `fleetVehicles` ?**

- En opération, l’affectation véhicule est souvent faite par le chef d’agence ou un responsable compagnie, pas uniquement par un rôle dédié « contrôleur flotte ».  
- Réduire l’écriture au seul `agency_fleet_controller` obligeait à donner ce rôle à des utilisateurs qui ont déjà chefAgence ou admin_compagnie, ou à bloquer l’affectation.  
- En gardant la **lecture** pour fleet_controller, agency_manager et boarding_officer, on préserve la séparation des droits (boarding voit la flotte pour la capacité, sans la modifier).  
- Les **écritures** (création / mise à jour de véhicules et mouvements) sont limitées à des rôles de supervision (fleet_controller, chefAgence, admin_compagnie), ce qui reste cohérent avec un modèle « transport SaaS » sans ouvrir la flotte à des rôles purement comptables ou guichet.

---

## 6. Implications sécurité

- **fleetVehicles** : les écritures sont limitées à des rôles identifiés ; les mises à jour en `in_transit` restent restreintes (champs limités) pour éviter des changements arbitraires en cours de route.  
- **fleetMovements** : création uniquement (pas de modification ni suppression), ce qui préserve l’audit.  
- **Clôture d’embarquement** : une seule transaction garantit que verrou, absents, log CLOSURE, véhicule(s) et mouvement(s) sont cohérents ; en cas d’échec, rien n’est partiellement appliqué.  
- **Tableau de bord Manager** : accès réservé à chefAgence et admin_compagnie ; pas d’écriture comptable, pas d’édition flotte depuis cette page, uniquement de la supervision.

---

## 7. Concurrence

- **Clôture** : la transaction lit d’abord `boardingClosures/{tripKey}` ; si le document existe déjà, elle lance `DEJA_CLOTURE` et s’arrête, ce qui évite les doubles clôtures.  
- **Contrôle de capacité** : fait avant la transaction (getDocs + getDoc). Un petit risque de course existe entre ce contrôle et l’écriture en transaction ; en cas de forte concurrence, un compteur dédié (ex. document `boardingCounts/{tripKey}` mis à jour dans la même transaction que l’embarquement) serait plus fiable.  
- **Transitions flotte** : `transitionVehicleStatus()` lit le véhicule dans une transaction puis met à jour le véhicule et écrit le mouvement ; deux mises à jour simultanées du même véhicule peuvent entrer en conflit (dernier écrit gagne), ce qui est acceptable pour un usage raisonnable.

---

## 8. Synchronisation multi-agences

- Les véhicules sont scopés par `companyId` ; `currentAgencyId` et `destinationAgencyId` permettent de savoir où est le véhicule et vers quelle agence il va.  
- La clôture d’embarquement ne met à jour que les véhicules dont `currentAgencyId` et le trajet correspondent ; les autres agences ne sont pas modifiées.  
- Aucun verrou distribué : le modèle reste « dernier écrit gagne ». Pour une cohérence forte entre plusieurs agences (ex. confirmation d’arrivée à l’agence B après un départ de l’agence A), il faudrait un workflow explicite (ex. bouton « Confirmer arrivée » à l’agence B avec mise à jour du véhicule et écriture d’un mouvement).

---

## 9. Goulots et limites possibles

- **Transaction de clôture** : le nombre de véhicules et de mouvements par clôture reste faible (souvent 1 véhicule) ; si plusieurs véhicules par départ, la transaction reste sous la limite de 500 opérations.  
- **Manager dashboard** : 4 listeners (shifts, reservations du jour, fleetVehicles, boardingClosures) + 1 getDocs (weeklyTrips). Pas de requêtes imbriquées par shift ; les métriques sont dérivées en mémoire. Pour un très grand nombre de réservations du jour, une pagination ou un agrégat côté serveur (Cloud Functions ou extension) pourrait être envisagé.  
- **fleetMovements** : croissance illimitée ; à long terme, une politique de rétention ou d’archivage (ex. export puis purge des mouvements > 1 an) peut être nécessaire.

---

## 10. Améliorations recommandées (hors périmètre actuel)

- **Compteur de capacité** : document dédié (ex. `boardingCounts/{tripKey}`) mis à jour dans la même transaction que l’embarquement pour un contrôle de capacité strict sans course.  
- **Alertes « véhicule en transit trop longtemps »** : utiliser `lastMovementAt` et un seuil configurable (ex. 12 h) et n’afficher l’alerte que si `status === 'in_transit'` et dépassement du seuil (ébauché dans le dashboard, à finaliser).  
- **Confirmations d’arrivée** : workflow explicite « Confirmer arrivée » à l’agence de destination (bouton ou page dédiée) qui appelle `transitionVehicleStatus(..., 'arrived', ..., { toAgencyId: agencyId })` et met à jour `currentAgencyId`.  
- **Durée de session configurable** : remplacer la constante `SESSION_DURATION_WARNING_HOURS` par un paramètre (ex. company ou agence) pour le seuil d’alerte « session trop longue ».

---

**Document généré dans le cadre de la finalisation Phase 3 et du démarrage Phase 4 (Agency Manager Command Center).**
