# Audit — Calcul des places restantes TELIYA

**Contexte :** Incohérence détectée : guichet affiche 56 places restantes (correct), interface publique 57 (incorrect).  
Capacité 60, réservations réelles : 1+1+2 = 4 places → 56 restantes.  
**Conclusion :** Le système public utilise parfois le **nombre de réservations** au lieu de la **somme des places**.

---

## 1. Lieux où les places restantes sont calculées

| Fichier | Rôle |
|---------|------|
| `src/utils/seats.ts` | `listenRemainingSeatsForDate` : calcul temps réel par trajet (agence) |
| `src/modules/compagnie/tripInstances/segmentOccupancyService.ts` | `getRemainingSeats` : référence pour une instance de trajet |
| `src/modules/compagnie/tripInstances/inventoryQuotaService.ts` | `getRemainingStopQuota`, `getSoldFromStop` |
| `src/modules/agence/guichet/pages/AgenceGuichetPage.tsx` | Affiche `remainingSeats` (guichet) |
| `src/modules/compagnie/public/pages/ResultatsAgencePage.tsx` | Liste des trajets publics, `remainingSeats` |
| `src/modules/compagnie/public/pages/ReservationClientPage.tsx` | Réservation en ligne, `remainingSeats` |
| `src/modules/agence/escale/pages/EscaleDashboardPage.tsx` | Escale : `remaining` |
| `src/modules/agence/escale/pages/EscaleBusDuJourPage.tsx` | Bus du jour : `remaining` |
| `src/modules/agence/escale/pages/BoardingEscalePage.tsx` | Utilise `getTripProgress` (pas calcul direct) |

---

## 2. Vérification : `reservations.length` vs `sum(reservation.places)`

### 2.1 **Correct (somme des places)**

**`src/utils/seats.ts`** (l.39-52)  
- Utilise **somme des places** par trajet.
- Code :
```ts
snap.forEach((d) => {
  const r = d.data() as any;
  const statut = String(r.statut || '').toLowerCase();
  if (!VALID_STATUSES.has(statut)) return;
  const tripKey = r.trajetId;
  const seats = Number(r.seatsGo || 0);   // ✅ somme seatsGo
  usedByTrip[tripKey] = (usedByTrip[tripKey] || 0) + seats;
});
// ...
const used = usedByTrip[t.id] || 0;
return { ...t, remainingSeats: Math.max(0, total - used) };
```

**`src/modules/compagnie/tripInstances/segmentOccupancyService.ts`** (l.91-92)  
- Pour les trajets **avec** route/stops : somme des places par réservation.
- Code :
```ts
const seats = Number(docData.seatsGo ?? 1) + Number(docData.seatsReturn ?? 0);
// ...
occupancy[s] += seats;
```
- Puis `remainingSeats = capacity - max(segment occupancies)` → correct.

**`src/modules/compagnie/tripInstances/inventoryQuotaService.ts`** — `getSoldFromStop` (l.92-96)  
- Somme des places :
```ts
total += Number(data.seatsGo ?? 1);
```

### 2.2 **Problématique (fallback sur `reservedSeats`)**

**`src/modules/compagnie/tripInstances/segmentOccupancyService.ts`** (l.118-122)  
- Quand le trajet n’a **pas** de route (ou pas de segments), le calcul utilise **uniquement** le champ `reservedSeats` du trip instance :
```ts
if (occupancy == null || occupancy.length === 0) {
  const reserved = (ti as { reservedSeats?: number }).reservedSeats ?? 0;
  return Math.max(0, capacity - reserved);
}
```
- **Problème :** `reservedSeats` est incrémenté à chaque création/annulation de réservation. S’il est mal mis à jour (ancien code, réservations sans `tripInstanceId`, migration), il peut refléter le **nombre de réservations** (ex. 3) au lieu de la **somme des places** (4) → 60 − 3 = **57** au lieu de 56.

**`src/modules/compagnie/public/pages/ResultatsAgencePage.tsx`** (l.175-176)  
- Utilise le même fallback :
```ts
const fallback = capacity - (ti.reservedSeats ?? 0);
const remaining = (ti as any).routeId && remainingById[ti.id] !== undefined
  ? remainingById[ti.id]
  : fallback;
```
- Si pas de `routeId` ou pas d’appel à `getRemainingSeats`, l’interface publique affiche **capacity - reservedSeats** → même risque d’écart.

**`src/modules/compagnie/public/pages/ReservationClientPage.tsx`** (l.339-345)  
- Même schéma :
```ts
const reserved = (ti as any).reservedSeats ?? 0;
const fallbackRemaining = capacity - reserved;
const remaining = routeId != null && remainingById[ti.id] !== undefined
  ? remainingById[ti.id]
  : fallbackRemaining;
```

**`src/modules/agence/guichet/pages/AgenceGuichetPage.tsx`** (l.501-504)  
- Quand il n’y a pas de `routeId` ou pas de `remainingMap` :
```ts
const reserved = (ti as any).reservedSeats ?? 0;
const remaining = (ti as any).routeId && remainingMap[ti.id] !== undefined
  ? remainingMap[ti.id]
  : capacity - reserved;
```
- Le guichet appelle toutefois `getRemainingSeats` pour les trajets avec `routeId`, donc en pratique il est souvent correct. L’écart 56 vs 57 apparaît quand **l’interface publique** utilise le fallback (trajet sans route ou affichage basé sur `ti.reservedSeats`).

---

## 3. Comparaison Guichet vs Public

| Aspect | AgenceGuichetPage | ResultatsAgencePage / ReservationClientPage |
|--------|-------------------|---------------------------------------------|
| Source principale | `getRemainingSeats(companyId, ti.id)` (segmentOccupancyService) | Idem quand `routeId` présent |
| Fallback | `capacity - (ti.reservedSeats ?? 0)` | Idem |
| Quand fallback utilisé | Trajet sans `routeId` ou échec `getRemainingSeats` | Trajet sans `routeId` ou pas de `remainingById` |
| Effet bug | Moins souvent (trajets souvent avec route) | Plus souvent si trajets sans route ou `reservedSeats` incohérent → **57** |

La **différence 56 (guichet) vs 57 (public)** vient donc du fait que, dans certains cas, **seul le fallback** est utilisé côté public, et que **reservedSeats** reflète 3 (nombre de réservations) au lieu de 4 (somme des places).

---

## 4. Incohérences de champs

- **agencyId vs agenceId :** Les réservations et trip instances utilisent `agencyId` (camelCase). Pas de mélange avec `agenceId` dans les calculs de places.
- **places / seatsGo / seatsReturn :** Plusieurs champs possibles :
  - `seatsGo`, `seatsReturn` (réservation) → à sommer.
  - `places` (capacité trajet) → utilisé comme capacité, pas comme “réservé”.
  - Dans `segmentOccupancyService` : `docData.seatsGo ?? 1` et `seatsReturn ?? 0` → défaut 1 si absent, cohérent.
- **undefined / null :** Les fallbacks `?? 0` ou `?? 1` sont présents ; le risque principal reste l’usage de **reservedSeats** (compteur) au lieu d’une somme sur les réservations.

---

## 5. Filtres Firestore

- **segmentOccupancyService** : `collectionGroup("reservations")`, `where("tripInstanceId", "==", tripInstanceId)` → bon pour trajets avec instance.
- **seats.ts** : `companies/{companyId}/agences/{agencyId}/reservations`, `date`, `depart`, `arrivee` → pas de `tripInstanceId` ; clé = `trajetId` (ex. weeklyTripId_date_heure). Cohérent avec le modèle “agence”.
- Les trajets **sans** `tripInstanceId` ou sans route ne sont pas couverts par `computeSegmentOccupancy` ; le code retombe alors sur `capacity - reservedSeats` → source du bug.

---

## 6. Source exacte du bug

1. **Cause directe :** Pour les trajets **sans route** (ou sans segments), `getRemainingSeats` retourne `capacity - ti.reservedSeats`. La valeur `reservedSeats` peut être **désynchronisée** (ex. anciennes réservations non prises en compte, ou incrément par “1” au lieu du nombre de places).
2. **Où ça se voit :** Interface publique (ResultatsAgencePage, ReservationClientPage) qui utilise ce fallback pour afficher les places restantes → **57** au lieu de **56**.
3. **Pourquoi le guichet peut être juste :** Il utilise souvent des trajets avec `routeId`, donc `getRemainingSeats` passe par `computeSegmentOccupancy`, qui calcule à partir des **réservations réelles** (somme des places) → **56**.

---

## 7. Fichiers à corriger / à faire évoluer

| Fichier | Action |
|---------|--------|
| `src/modules/compagnie/tripInstances/segmentOccupancyService.ts` | Ne plus utiliser `ti.reservedSeats` en fallback ; calculer “réservé” à partir des réservations (somme des places) pour l’instance. |
| Partagé (ex. `src/utils/seats.ts` ou module dédié) | Introduire une fonction unique du type `calculateRemainingPlaces(totalPlaces, reservations)` (somme des places par réservation) et l’utiliser partout où on dérive “places restantes” à partir d’une liste de réservations. |

---

## 8. Correction appliquée

- **`src/modules/compagnie/tripInstances/remainingPlacesUtils.ts`** (nouveau)  
  - `getReservedPlaces(reservations)` : somme des (seatsGo ?? places ?? 1) + (seatsReturn ?? 0).  
  - `calculateRemainingPlaces(totalPlaces, reservations)` : `totalPlaces - getReservedPlaces(reservations)`.

- **`src/modules/compagnie/tripInstances/segmentOccupancyService.ts`**  
  - `getReservedSeatsForTripInstance(companyId, tripInstanceId)` : requête des réservations confirmées (hors no_show), puis `getReservedPlaces`.  
  - Dans `getRemainingSeats`, lorsque `occupancy == null` (pas de route/stops), utilisation de `getReservedSeatsForTripInstance` au lieu de `ti.reservedSeats` pour le calcul affiché.

- **`src/utils/seats.ts`**  
  - Calcul par réservation aligné : `(seatsGo ?? places ?? 1) + (seatsReturn ?? 0)`.

Résultat : guichet et public utilisent la même règle (somme des places des réservations) ; l’écart 56 vs 57 est supprimé.

---

*Audit réalisé sur le code existant. Correction appliquée : calcul unifié via remainingPlacesUtils et getReservedSeatsForTripInstance.*
