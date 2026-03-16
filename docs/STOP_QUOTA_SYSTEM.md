# Système de quota souple pour les escales

## Objectif

Permettre aux escales de vendre des billets à l’avance pour les bus qui passent, tout en laissant l’agence d’origine (ex. Bamako) vendre toutes les places si nécessaire. Le système est **souple** : pas de blocage dur, priorité à l’origine, protection temporaire des escales, compatible avec les segments dynamiques.

---

## 1. Principe métier

Un bus peut avoir des escales, par exemple :

**Bamako → Segou → Mopti → Douentza → Gao**

- Les escales doivent pouvoir vendre des billets à l’avance.
- Bamako peut aussi vendre toutes les places si la demande est forte.

On utilise un **quota souple (soft quota)** par escale : chaque escale a un nombre maximal de places qu’elle peut vendre à l’avance ; au-delà, les places restantes restent vendables par l’origine jusqu’à la libération automatique du quota.

---

## 2. Structure Firestore

Sous-collection : `companies/{companyId}/tripInstances/{tripInstanceId}/inventory/quota`

| Champ | Type | Description |
|-------|------|-------------|
| `originPriority` | number | Priorité agence origine (0–1). Ex. 0.7. |
| `stopSoftQuotaPercent` | number | Part de la capacité réservée par escale (0–1). Ex. 0.2 = 20 %. |
| `quotaReleaseHoursBeforeArrival` | number | Heures avant arrivée prévue à l’escale à partir desquelles le quota est libéré. Ex. 4. |
| `updatedAt` | timestamp | Dernière mise à jour. |

**Exemple :**

```json
{
  "originPriority": 0.7,
  "stopSoftQuotaPercent": 0.2,
  "quotaReleaseHoursBeforeArrival": 4,
  "updatedAt": "<timestamp>"
}
```

Si le document n’existe pas, les valeurs par défaut sont utilisées (définies dans `DEFAULT_INVENTORY`).

---

## 3. Calcul du quota souple

- **Capacité bus** : `seatCapacity` du tripInstance (ex. 60).
- **Pourcentage escale** : `stopSoftQuotaPercent` (ex. 0.2).

**Quota nominal par escale :**

`quota = floor(seatCapacity * stopSoftQuotaPercent)`  
Ex. 60 × 0.2 = **12 places** par escale.

Chaque escale peut vendre jusqu’à ce nombre de places à l’avance (sous réserve des places réellement restantes sur le segment).

---

## 4. Règle de priorité origine

- L’agence **origine** (`stopOrder = 1`) peut vendre **toutes** les places.
- Le quota escale est une **protection temporaire** : il ne bloque pas l’origine.
- Donc : **Bamako peut vendre même si les escales n’ont pas encore vendu.**

Dans le code :
- Pour `stopOrder === 1`, `getRemainingStopQuota` retourne directement `getRemainingSeats()` (aucune limite quota).
- Pour une escale (`stopOrder > 1`), le nombre de places vendables est `min(remainingSeats, quotaStopRemaining)`.

---

## 5. Intégration avec les segments dynamiques

La vente repose toujours sur :

- `remainingSeats = getRemainingSeats(companyId, tripInstanceId)`  
  (calcul par segments : `seatCapacity - max(segmentOccupancy)`).

Règle finale selon le point de vente :

- **Vente depuis l’origine** :  
  `remainingAllowedSeats = remainingSeats` (pas de plafond quota).
- **Vente depuis une escale** :  
  `remainingAllowedSeats = min(remainingSeats, quotaStopRemaining)`  
  avec libération automatique du quota si on est dans la fenêtre « avant arrivée » (voir §6).

Le système reste compatible avec les segments dynamiques : les places restantes réelles sont toujours calculées par `getRemainingSeats()` ; le quota n’est qu’une limite supplémentaire côté escale jusqu’à libération.

---

## 6. Libération automatique du quota

Les quotas escales sont **libérés** lorsque l’arrivée prévue à l’escale est proche.

**Règle :**

Si  
`(heure d’arrivée prévue à l’escale) - now < quotaReleaseHoursBeforeArrival`  
(alors l’arrivée est dans moins de X heures)

→ **quotaStopRemaining = remainingSeats**  
→ toutes les places restantes deviennent vendables depuis l’escale (plus de plafond quota).

L’heure d’arrivée prévue à l’escale est calculée à partir de :
- `tripInstance.date` + `tripInstance.departureTime`
- + `estimatedArrivalOffsetMinutes` du stop sur la route.

---

## 7. Calcul pour une vente

Lors d’un achat avec `departStopOrder` et `destinationStopOrder` :

1. `remainingSeatsSegment = getRemainingSeats(companyId, tripInstanceId)`.
2. Si `departStopOrder === 1` (origine) : vente autorisée selon `remainingSeatsSegment` uniquement.
3. Sinon (escale) : vente limitée par le quota escale, soit  
   `min(remainingSeatsSegment, getRemainingStopQuota(...))`,  
   avec libération automatique si on est dans la fenêtre définie par `quotaReleaseHoursBeforeArrival`.

---

## 8. Affichage dans les escales

Dans les dashboards escale (ex. **Bus du jour**) sont affichés pour chaque bus :

- **Places restantes globales** : `remainingSeats` / capacité.
- **Quota escale restant** : nombre de places encore vendables depuis cette escale (après quota et libération).
- Indication **« Quota libéré »** lorsque la fenêtre de libération est atteinte.
- **Passagers qui descendent ici** : nombre de places déjà vendues depuis cette escale (optionnel, selon les données exposées).

---

## 9. Services

**Fichier :** `src/modules/compagnie/tripInstances/inventoryQuotaService.ts`

| Fonction | Description |
|----------|-------------|
| `getInventory(companyId, tripInstanceId)` | Charge les paramètres d’inventaire (ou défauts). |
| `setInventory(companyId, tripInstanceId, data)` | Écrit les paramètres d’inventaire (config). |
| `getStopQuota(companyId, tripInstanceId, stopOrder)` | Quota nominal pour l’escale (ou capacité pour l’origine). |
| `getRemainingStopQuota(companyId, tripInstanceId, stopOrder)` | Nombre de places vendables depuis ce stop (avec libération si dans la fenêtre). |
| `releaseStopQuotaIfNeeded(companyId, tripInstanceId, stopOrder)` | Indique si le quota est libéré (arrivée dans moins de X heures). |
| `getStopQuotaDisplay(...)` | Retourne les infos pour l’affichage (remainingSeats, remainingStopQuota, quotaReleased, etc.). |

---

## 10. Intégration dans les pages

- **ReservationClientPage** : pour chaque trajet avec route, calcul de `originStopOrder` à partir de (départ, arrivée) ; utilisation de `getRemainingStopQuota(companyId, tripInstanceId, originStopOrder)` pour le nombre de places affichées et la limite de vente.
- **AgenceGuichetPage** : en mode escale, utilisation de `getRemainingStopQuota(companyId, tripInstanceId, stopOrder)` pour les places affichées et la limite de vente.
- **EscaleBusDuJourPage** : affichage des places restantes globales, du quota escale restant, et utilisation de `remainingStopQuota` pour activer/désactiver « Vendre billet ».

---

## 11. Analyse future (préparer)

Pour une évolution ultérieure (création de lignes, optimisation) :

- Stocker dans **dailyStats** (ou structure équivalente) un indicateur **cityDemand** par ville / escale.
- Cela permettra d’analyser la demande par point de vente et d’alimenter des propositions de nouvelles lignes ou d’ajustement des quotas.

---

## 12. Sécurité Firestore

- **Lecture** : `inventory` lisible par tous (comme les tripInstances).
- **Écriture** : `create, update` réservés aux utilisateurs authentifiés de la même compagnie ou `admin_platforme` (règle sous `tripInstances/{tripInstanceId}/inventory/{docId}`).

---

## Index Firestore requis

Pour le calcul « vendues depuis cette escale » (collection group **reservations**) :

- **Collection group** : `reservations`
- Champs : `companyId` (ASC), `tripInstanceId` (ASC), `originStopOrder` (ASC)

À créer dans la console Firebase si une erreur d’index apparaît.
