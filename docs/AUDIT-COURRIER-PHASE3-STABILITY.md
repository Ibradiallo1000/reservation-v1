# Audit stabilité — Courrier Phase 3 (Lots + Escales)

**Date :** 2025  
**Périmètre :** Services et gardes Phase 3 Courrier. Aucune modification de code, aucun correctif proposé.

---

## PARTIE 1 — Gardes d’état des lots

### 1.1 createCourierBatch

| Règle | Présent | Détail |
|-------|---------|--------|
| Création avec `status = DRAFT` uniquement | Oui | `status: "DRAFT"` en dur (ligne 27). Aucun autre statut possible. |
| Pas de création directe en READY / autre | Oui | Aucun paramètre de statut ; seul DRAFT est écrit. |

**Fichier :** `src/modules/logistics/services/courierBatches/createCourierBatch.ts`

---

### 1.2 addShipmentToCourierBatch

| Règle | Présent | Détail |
|-------|---------|--------|
| `batch.status === "DRAFT"` | Oui | Ligne 23 : `if (batch.status !== "DRAFT") throw ...` |
| `shipment.currentStatus === "CREATED"` | Oui | Ligne 24 : `if (shipment.currentStatus !== "CREATED") throw ...` |
| `shipment.batchId` vide ou égal au lot courant | Oui | Ligne 25 : `if (shipment.batchId != null && shipment.batchId !== params.batchId) throw ...` (refuse si déjà dans un autre lot). Si `batchId === params.batchId`, pas de throw (idempotent). |
| `shipment.originAgencyId === batch.originAgencyId` | Non | Non vérifié. Un envoi d’une autre agence pourrait être ajouté si on passe son `shipmentId` et un `batchId` de l’agence courante. |
| Envoi pas déjà dans le lot | Oui | Ligne 26 : `if (batch.shipmentIds.includes(params.shipmentId)) throw ...` |
| Transaction atomique (lot + envoi) | Oui | `runTransaction` : lecture lot + envoi, puis `tx.update(bRef, ...)`, `tx.update(sRef, ...)`, `tx.set(evRef, ...)`. |

**Fichier :** `src/modules/logistics/services/courierBatches/addShipmentToCourierBatch.ts`  
**Garde manquante :** vérification `shipment.originAgencyId === batch.originAgencyId` (ou équivalent).

---

### 1.3 removeShipmentFromCourierBatch

| Règle | Présent | Détail |
|-------|---------|--------|
| `batch.status === "DRAFT"` | Oui | Ligne 19 : `if (batch.status !== "DRAFT") throw ...` |
| Envoi présent dans le lot | Oui | Ligne 20 : `if (!batch.shipmentIds.includes(params.shipmentId)) throw ...` |
| Vérification explicite `shipment.batchId === batchId` | Non | Le document envoi n’est pas lu ; on s’appuie uniquement sur `batch.shipmentIds`. Après opération, `shipment.batchId` est supprimé, donc incohérence corrigée a posteriori. |
| Transaction (retrait du lot + clear `batchId`) | Oui | `runTransaction` : mise à jour du lot et `tx.update(sRef, { batchId: deleteField() })`. |

**Fichier :** `src/modules/logistics/services/courierBatches/removeShipmentFromCourierBatch.ts`  
**Remarque :** pas de lecture du document envoi ; cohérence assurée par la mise à jour du lot et la suppression de `batchId`.

---

### 1.4 markCourierBatchReady

| Règle | Présent | Détail |
|-------|---------|--------|
| `batch.status === "DRAFT"` | Oui | Ligne 16 : `if (batch.status !== "DRAFT") throw ...` |
| `shipmentIds.length > 0` | Non | Aucune vérification. Un lot vide peut être passé en READY. |
| Après READY, plus de modification | Oui | Aucun autre service ne met à jour un lot READY (add/remove exigent DRAFT). |

**Fichier :** `src/modules/logistics/services/courierBatches/markCourierBatchReady.ts`  
**Garde manquante :** refus de passer en READY si `batch.shipmentIds.length === 0`.

---

### 1.5 confirmCourierBatchDeparture

| Règle | Présent | Détail |
|-------|---------|--------|
| `batch.status === "READY"` | Oui | Ligne 24 : `if (batch.status !== "READY") throw ...` |
| Réservé ChefAgence / admin_compagnie | Non | Aucun paramètre rôle ni vérification côté service. Tout utilisateur authentifié pouvant appeler le service peut exécuter l’action. |
| Tous les envois du lot → IN_TRANSIT | Oui | Boucle sur `batch.shipmentIds`, vérification `currentStatus === "CREATED"` (ligne 31), puis `tx.update(sRef, { currentStatus: "IN_TRANSIT", ... })`. |
| Transaction atomique | Oui | Une seule `runTransaction` : lecture lot, pour chaque envoi lecture + mise à jour + événement, puis mise à jour du lot (DEPARTED, departedAt). |

**Fichier :** `src/modules/logistics/services/courierBatches/confirmCourierBatchDeparture.ts`  
**Garde manquante :** contrôle de rôle (ChefAgence / admin_compagnie) côté backend.

---

### 1.6 confirmEscaleArrival

| Règle | Présent | Détail |
|-------|---------|--------|
| `shipment.currentStatus === "IN_TRANSIT"` | Oui | Ligne 29 : `if (shipment.currentStatus !== "IN_TRANSIT") continue` (ignore les autres). |
| `shipment.destinationAgencyId === params.agencyId` | Oui | Ligne 30 : `if (shipment.destinationAgencyId !== params.agencyId) continue`. Seule l’agence de destination peut confirmer l’arrivée pour cet envoi. |
| Vérification `shipment.batchId` cohérent avec un lot | Non | Aucune lecture de lot ; pas de vérification que l’envoi appartient à un lot. L’effet reste correct (IN_TRANSIT → ARRIVED uniquement pour l’agence de destination). |
| Mise à jour `currentLocationAgencyId` | Oui | Ligne 35 : `currentLocationAgencyId: params.agencyId`. |
| Pas de double confirmation | Oui | Après mise à jour, `currentStatus === "ARRIVED"` ; un second appel sur le même envoi fait `continue` (ligne 29), donc pas de deuxième écriture. |

**Fichier :** `src/modules/logistics/services/courierBatches/confirmEscaleArrival.ts`  
**Remarque :** pas de vérification explicite de `batchId` sur l’envoi ; comportement fonctionnel et cohérent.

---

### 1.7 closeCourierBatch

| Règle | Présent | Détail |
|-------|---------|--------|
| `batch.status === "DEPARTED"` | Oui | Ligne 20 : `if (batch.status !== "DEPARTED") throw ...` |
| Rôle autorisé (ex. ChefAgence) | Non | Aucune vérification de rôle dans le service. |
| `closedAt` renseigné | Oui | Ligne 21 : `closedAt: serverTimestamp()`. |
| Pas de double clôture | Oui | Après mise à jour, `status === "CLOSED"` ; un second appel lève (ligne 20). |

**Fichier :** `src/modules/logistics/services/courierBatches/closeCourierBatch.ts`  
**Garde manquante :** contrôle de rôle côté backend.

---

## PARTIE 2 — Cohérence des états envoi

### Transitions Phase 3 (flux lots)

- **CREATED → IN_TRANSIT** : uniquement dans `confirmCourierBatchDeparture` (tous les envois du lot), dans une transaction.
- **IN_TRANSIT → ARRIVED** : uniquement dans `confirmEscaleArrival` (avec `destinationAgencyId === agencyId`), dans une transaction.
- **ARRIVED → READY_FOR_PICKUP** : `markReadyForPickup` (hors Phase 3 lots), avec `canShipmentTransition`.
- **READY_FOR_PICKUP → DELIVERED** : `confirmPickup` (hors Phase 3 lots), avec `canShipmentTransition`.

### Vérifications demandées

| Point | Constat |
|-------|--------|
| Pas de CREATED → ARRIVED sans départ (dans les services Phase 3) | Respecté. Phase 3 ne fait pas CREATED → ARRIVED. En revanche, `markShipmentArrived` (autre module) autorise CREATED ou IN_TRANSIT → ARRIVED (simulation Phase 1) ; donc un contournement reste possible en appelant ce service. |
| Pas de IN_TRANSIT → DELIVERED | Respecté. Aucun service ne fait IN_TRANSIT → DELIVERED ; DELIVERED n’est atteint que via READY_FOR_PICKUP. |
| Pas de DELIVERED → autre état | La machine d’états (`logisticsStateMachine.ts`) autorise DELIVERED → CLOSED uniquement ; aucun service Phase 3 ne modifie un envoi DELIVERED. |
| Toutes les transitions de statut dans des transactions | Oui. `confirmCourierBatchDeparture` et `confirmEscaleArrival` modifient `currentStatus` uniquement à l’intérieur d’un `runTransaction`. |

**Fichiers :**  
- `src/modules/logistics/domain/logisticsStateMachine.ts`  
- `src/modules/logistics/services/markShipmentArrived.ts` (CREATED → ARRIVED possible, hors flux lots)

---

## PARTIE 3 — Intégrité des données

| Scénario de corruption | Gardes / comportement |
|------------------------|------------------------|
| Envoi reste IN_TRANSIT alors que le lot est CLOSED | Possible. Aucune règle n’impose que tous les envois du lot soient ARRIVED avant CLOSED. Le lot peut être clôturé avec des envois encore IN_TRANSIT (spécification Phase 3 : « Shipments not yet ARRIVED remain IN_TRANSIT until confirmed manually »). Pas considéré comme une corruption. |
| Envoi a un `batchId` mais le lot ne contient pas son `shipmentId` | Évité en Phase 3 : add/remove sont atomiques (lot + envoi). En cas de corruption manuelle, `removeShipmentFromCourierBatch` ne lit pas l’envoi ; si l’id est encore dans `batch.shipmentIds`, le retrait rétablit la cohérence. |
| Envoi retiré du lot mais statut resté IN_TRANSIT | Possible seulement si retrait après départ : remove n’est autorisé qu’en DRAFT, et au départ les envois passent IN_TRANSIT. Donc un envoi retiré en DRAFT n’est jamais passé IN_TRANSIT par ce lot. Pas de scénario où un envoi est retiré après départ. |
| Confirmation d’arrivée escale par une mauvaise agence | Empêchée : `confirmEscaleArrival` ne met à jour que si `shipment.destinationAgencyId === params.agencyId`. Une autre agence ne peut pas faire passer l’envoi en ARRIVED pour cette destination. |
| Double confirmation d’arrivée escale pour le même envoi | Empêchée : après la première mise à jour, `currentStatus === "ARRIVED"` ; le second appel fait `continue` (ligne 29), aucune seconde écriture. |

---

## PARTIE 4 — Atomicité des transactions

Services utilisant `runTransaction` :

| Service | Fichier | Contenu de la transaction |
|---------|---------|----------------------------|
| addShipmentToCourierBatch | `courierBatches/addShipmentToCourierBatch.ts` | Lecture lot + envoi ; mise à jour lot (`shipmentIds`) ; mise à jour envoi (`batchId`) ; création événement. Tout ou rien. |
| removeShipmentFromCourierBatch | `courierBatches/removeShipmentFromCourierBatch.ts` | Lecture lot ; mise à jour lot (retrait de l’id) ; mise à jour envoi (`batchId` supprimé). Tout ou rien. |
| markCourierBatchReady | `courierBatches/markCourierBatchReady.ts` | Lecture lot ; mise à jour lot (status READY). Une seule ressource. |
| confirmCourierBatchDeparture | `courierBatches/confirmCourierBatchDeparture.ts` | Lecture lot ; pour chaque envoi : lecture + mise à jour (IN_TRANSIT) + événement ; mise à jour lot (DEPARTED, departedAt). Tout ou rien. |
| confirmEscaleArrival | `courierBatches/confirmEscaleArrival.ts` | Pour chaque `shipmentId` : lecture envoi ; si IN_TRANSIT et destination = agencyId : mise à jour envoi + événement. Pas de mise à jour de lot. Tout ou rien. |
| closeCourierBatch | `courierBatches/closeCourierBatch.ts` | Lecture lot ; mise à jour lot (CLOSED, closedAt). Une seule ressource. |

**createCourierBatch** n’utilise pas `runTransaction` (un seul `setDoc` sur un nouveau document ; pas de lecture conditionnelle).

Constats :

- Aucune mise à jour de lot sans mise à jour d’envoi dans la même transaction lorsque les deux sont liés (add/remove : les deux sont mis à jour).
- confirmCourierBatchDeparture : mise à jour du lot et de tous les envois dans la même transaction.
- Aucune écriture multi-étapes en dehors d’une transaction pour les opérations Phase 3 listées.

---

## PARTIE 5 — Contrôle des rôles

| Point | Constat |
|-------|--------|
| AgentCourrier ne peut pas confirmer le départ | Non appliqué côté backend. Le service `confirmCourierBatchDeparture` n’accepte pas de rôle et ne fait aucune vérification. Seule l’UI (CourierBatchesPage) masque le bouton si `!isChefAgence`. Un AgentCourrier peut appeler le service (ex. via console / API) et confirmer le départ. |
| AgentCourrier ne peut pas clôturer le lot | Même situation : `closeCourierBatch` n’a pas de contrôle de rôle ; seule l’UI restreint l’affichage du bouton. |
| Arrivée escale limitée à l’agence de destination | Appliqué côté backend : `confirmEscaleArrival` ne met à jour que si `shipment.destinationAgencyId === params.agencyId`. Aucune possibilité de contournement par l’UI seule. |
| Contournement par frontend uniquement | Les actions « Confirmer départ » et « Clôturer le lot » sont protégées uniquement par l’UI (affichage conditionnel). Les règles Firestore pour `batches` sont `allow create, update: if isAuth()` ; aucun contrôle de rôle côté règles. |

**Fichiers concernés :**  
- `src/modules/logistics/services/courierBatches/confirmCourierBatchDeparture.ts`  
- `src/modules/logistics/services/courierBatches/closeCourierBatch.ts`  
- `src/modules/agence/courrier/pages/CourierBatchesPage.tsx` (isChefAgence)  
- `firestore.rules` (match /batches/{batchId})

---

## PARTIE 6 — Scénarios de bord

| Scénario | Résultat |
|----------|----------|
| **A** : Ajouter un envoi, marquer READY, réessayer d’ajouter | Après READY, `addShipmentToCourierBatch` lit le lot ; `batch.status !== "DRAFT"` → throw. L’ajout est refusé. |
| **B** : Confirmer le départ deux fois | Premier appel : lot READY → DEPARTED, envois → IN_TRANSIT. Second appel : `batch.status !== "READY"` → throw. Refusé. |
| **C** : Confirmer l’arrivée escale deux fois pour le même envoi | Premier appel : envoi IN_TRANSIT → ARRIVED. Second appel : `shipment.currentStatus !== "IN_TRANSIT"` → continue, pas d’écriture. Aucune double mise à jour. |
| **D** : Clôturer le lot alors que certains envois sont encore IN_TRANSIT | Autorisé par le design. `closeCourierBatch` ne vérifie pas l’état des envois ; le lot passe CLOSED. Conforme à la spec (« Shipments not yet ARRIVED remain IN_TRANSIT until confirmed manually »). |
| **E** : Deux utilisateurs ajoutent le même envoi au même lot en parallèle | Les deux appels font `runTransaction`. Le premier ajoute l’envoi au lot et pose `batchId` sur l’envoi. Le second lit le lot (déjà mis à jour) et l’envoi (déjà avec ce `batchId`) ; `batch.shipmentIds.includes(params.shipmentId)` ou `shipment.batchId === params.batchId` selon l’ordre peut faire lever « Already in batch » ou accepter (idempotent). Si le second voit le lot avec l’id déjà présent : throw « Already in batch ». Si le second lit avant que le premier ait commit : les deux pourraient tenter d’ajouter ; le second verra soit « Already in batch » (si le premier a commit avant la lecture du second), soit réussite puis le premier échoue sur « Already in batch ». Au pire une seule des deux transactions réussit. Pas de duplication d’id dans `shipmentIds` grâce à la transaction. Comportement sûr. |

---

## PARTIE 7 — Synthèse

### 1. Gardes présents

- createCourierBatch : statut DRAFT uniquement.
- addShipmentToCourierBatch : batch DRAFT, envoi CREATED, envoi pas dans un autre lot, pas déjà dans le lot ; transaction atomique.
- removeShipmentFromCourierBatch : batch DRAFT, envoi dans le lot ; transaction (lot + clear batchId).
- markCourierBatchReady : batch DRAFT ; transaction.
- confirmCourierBatchDeparture : batch READY, chaque envoi CREATED → IN_TRANSIT ; transaction globale.
- confirmEscaleArrival : envoi IN_TRANSIT, destination = agencyId ; currentLocationAgencyId mis à jour ; pas de double confirmation.
- closeCourierBatch : batch DEPARTED ; closedAt ; pas de double clôture.

### 2. Gardes manquants (audit uniquement, pas de correction)

| Garde | Service | Risque |
|-------|---------|--------|
| `shipment.originAgencyId === batch.originAgencyId` | addShipmentToCourierBatch | Moyen : un envoi d’une autre agence pourrait être ajouté à un lot (incohérence métier). |
| `batch.shipmentIds.length > 0` avant READY | markCourierBatchReady | Faible : lot vide peut être marqué READY puis départ (lot DEPARTED vide). |
| Vérification de rôle (ChefAgence / admin) | confirmCourierBatchDeparture | Moyen : tout utilisateur authentifié peut confirmer le départ. |
| Vérification de rôle (ChefAgence / admin) | closeCourierBatch | Moyen : tout utilisateur authentifié peut clôturer le lot. |

### 3. Niveau de risque global

- **Niveau : MOYEN.**  
- Logique métier et machine d’états globalement cohérentes ; transactions utilisées pour les opérations critiques.  
- Risques identifiés : absence de contrôle de rôle côté backend pour départ et clôture, absence de vérification d’agence d’origine à l’ajout d’un envoi, possibilité de lot READY vide.

### 4. Fichiers concernés

- `src/modules/logistics/services/courierBatches/createCourierBatch.ts`
- `src/modules/logistics/services/courierBatches/addShipmentToCourierBatch.ts`
- `src/modules/logistics/services/courierBatches/removeShipmentFromCourierBatch.ts`
- `src/modules/logistics/services/courierBatches/markCourierBatchReady.ts`
- `src/modules/logistics/services/courierBatches/confirmCourierBatchDeparture.ts`
- `src/modules/logistics/services/courierBatches/confirmEscaleArrival.ts`
- `src/modules/logistics/services/courierBatches/closeCourierBatch.ts`
- `src/modules/logistics/domain/logisticsStateMachine.ts`
- `src/modules/agence/courrier/pages/CourierBatchesPage.tsx`
- `firestore.rules` (match /batches/{batchId})

### 5. Niveau de sécurité

- **Cohérence des états et intégrité des données :** bonne (transactions, gardes de statut, pas de double confirmation escale, pas de double départ/clôture).
- **Rôle et périmètre agence :** partiels (arrivée escale correctement restreinte par le backend ; départ et clôture protégés uniquement par l’UI et les règles Firestore ne distinguent pas les rôles pour les batches).

---

*Rapport d’audit uniquement. Aucune modification de code, aucune évolution d’architecture ni nouvelle fonctionnalité proposée.*
