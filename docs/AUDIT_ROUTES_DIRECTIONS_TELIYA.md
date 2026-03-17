# Audit — Gestion des routes et directions TELIYA

## Contexte des bugs signalés

1. **Création trajet** : Départ autorisé Gao, route Bamako ↔ Gao, direction Retour (Gao → Bamako) → après enregistrement le système affiche **Bamako → Gao** (incorrect).
2. **Guichet** : Le trajet affiché devient parfois **Gao → Gao** (incorrect).

---

## 1. Stockage des routes

- **Format** : Les routes sont des documents Firestore dans `companies/{companyId}/routes/{routeId}`.
- **Champs** : `startCity`, `endCity`, `origin`, `destination`, `departureCity`, `arrivalCity` (aliases). Pas de chaîne unique type `"Bamako-Gao"` ; les villes sont des champs séparés.
- **Exemple** : Une route Bamako–Gao a `startCity: "Bamako"`, `endCity: "Gao"`, `origin: "Bamako"`, `destination: "Gao"`.

Fichiers : `src/modules/compagnie/routes/routesService.ts`, `routesTypes.ts`.

---

## 2. Gestion de la direction

- **Constantes** : `ROUTE_DIRECTION.FORWARD` (aller), `ROUTE_DIRECTION.REVERSE` (retour) dans `routesTypes.ts`.
- **Helper** : `getRouteOriginAndDestination(route, direction)` dans `routeStopsService.ts` :
  - `forward` → `origin = startCity`, `destination = endCity`
  - `reverse` → `origin = endCity`, `destination = startCity`
- **Problème** : Lors de l’enregistrement du trajet dans `AgenceTrajetsPage.tsx`, la direction **n’est pas utilisée**. On envoie toujours les villes canoniques de la route.

---

## 3. Logique de transformation (cause du bug Bamako → Gao)

### Fichier : `src/modules/agence/pages/AgenceTrajetsPage.tsx`

**Lignes 250–269 (handleSubmit, création) :**

```ts
const dep = (selectedRoute.departureCity ?? '').trim();
const arr = (selectedRoute.arrivalCity ?? '').trim();
// ...
await generateWeeklyTrips(
  user.companyId,
  dep,   // ← Toujours startCity (ex. Bamako)
  arr,   // ← Toujours endCity (ex. Gao)
  priceNum,
  horairesFiltres,
  placesNum,
  user.agencyId,
  {
    routeId: selectedRouteId,
    departureCity: dep,  // ← Idem, ignore la direction
    arrivalCity: arr,
    seats: placesNum,
  }
);
```

- `selectedRoute.departureCity` / `arrivalCity` viennent du document route (sens canonique start → end).
- La variable **`tripDirection`** (Aller / Retour) n’est **jamais** passée à `generateWeeklyTrips`, et **`getRouteOriginAndDestination(selectedRoute, tripDirection)`** n’est pas utilisée pour `dep` / `arr`.
- **Conséquence** : Même en choisissant "Retour" (Gao → Bamako), on enregistre toujours Bamako → Gao.

### Affichage dans le formulaire (correct)

- Lignes 72–77 : `displayDeparture` et `displayArrival` utilisent bien `getRouteOriginAndDestination(selectedRoute, tripDirection)` → l’utilisateur voit Gao → Bamako.
- À l’enregistrement, on n’utilise pas ces valeurs, d’où l’incohérence.

---

## 4. Comparaison des fichiers

| Fichier | Rôle | Problème / statut |
|--------|------|--------------------|
| **AgenceTrajetsPage.tsx** | Création trajets | N’utilise pas `tripDirection` pour `dep`/`arr` à l’enregistrement. |
| **generateWeeklyTrips.ts** | Écriture weeklyTrip | Reçoit `dep`/`arr` du caller ; si le caller envoie les mauvaises valeurs, le document est faux. Pas de validation `dep !== arr`. |
| **AgenceGuichetPage.tsx** | Recherche / affichage trajets | Utilise `ti.departureCity`, `ti.arrivalCity` (trip instance) et `w.departure`, `w.arrival` (weekly trip). Si les weekly trips sont mal créés, les instances et l’affichage sont faux. |
| **tripInstanceService** | Création trip instance | Reçoit `departureCity` / `arrivalCity` du weekly trip ; pas de recalcul à partir de la route. |

Il n’existe pas de logique basée sur un `split(route)` sur une chaîne "Bamako-Gao" ; le problème vient uniquement de l’**oubli de la direction** à la création.

---

## 5. Normalisation / inversion

- Aucune normalisation automatique qui réécrirait les villes à partir d’une chaîne.
- **Inversion** : La seule inversion “correcte” est dans `getRouteOriginAndDestination` pour le sens **reverse**. Elle n’est pas utilisée à l’enregistrement.

---

## 6. Pourquoi Gao → Bamako devient Bamako → Gao

- **Cause exacte** : Dans `AgenceTrajetsPage.handleSubmit`, pour la création, `dep` et `arr` sont pris sur **la route** (`selectedRoute.departureCity`, `selectedRoute.arrivalCity`), qui sont le sens canonique (Bamako, Gao). La direction choisie (`tripDirection`) n’est pas utilisée.
- **Correction** : Utiliser `getRouteOriginAndDestination(selectedRoute, tripDirection)` pour obtenir `origin` et `destination`, et passer **ces** valeurs comme `dep`/`arr` (et dans `departureCity`/`arrivalCity` dans les options).

---

## 7. Pourquoi Gao → Gao apparaît

- **Causes possibles** :
  1. Données incohérentes : un weekly trip ou une instance avec `departure === arrival` (saisie ou ancien bug).
  2. Affichage : réutilisation de la même variable pour départ et arrivée dans un fallback.
  3. Liste des arrivées dans le guichet : si tous les trajets sont enregistrés dans le même sens (ex. Bamako → Gao), une agence à Gao n’a que “Gao” en départ (ville agence) ; si un trajet mal créé a arrival = ville agence, on peut afficher Gao → Gao.
- **Correction** : Valider à la création que `departure !== arrival` (refus d’enregistrement si égal). À l’affichage (guichet, listes), ignorer ou signaler les trajets où `departure === arrival`.

---

## 8. Résumé

| Problème | Cause | Fichier concerné |
|----------|--------|------------------|
| Direction Retour enregistrée comme Aller | `dep`/`arr` pris sur la route sans tenir compte de `tripDirection` | `AgenceTrajetsPage.tsx` (handleSubmit) |
| Affichage Gao → Gao | Données ou fallbacks où départ = arrivée ; pas de garde-fou | `generateWeeklyTrips.ts` (pas de validation), guichet (pas de filtre) |

---

## Corrections appliquées

1. **AgenceTrajetsPage.tsx**
   - Calcul de `dep`/`arr` via `getRouteOriginAndDestination(selectedRoute, tripDirection)` au lieu de `selectedRoute.departureCity`/`arrivalCity`.
   - Validation : refus si `dep.toLowerCase() === arr.toLowerCase()` (éviter X → X).
   - Passage de `direction: tripDirection` et `route: routeLabel` (ex. "Bamako-Gao") dans les options.
   - Logs : `Route`, `Direction`, `Departure`, `Arrival`.

2. **generateWeeklyTrips.ts**
   - Validation : `if (dep.toLowerCase() === arr.toLowerCase()) throw new Error(...)`.
   - Stockage de `route` (libellé canonique) si fourni dans les options.
   - Log : `route`, `direction`, `departure`, `arrival`.

3. **AgenceGuichetPage.tsx**
   - Exclusion des weekly trips avec `wDep === wArr` lors de la création d’instances.
   - Exclusion des trajets affichés quand `tripDep === tripArr` (plus de Gao → Gao).

4. **Modèle (types/weeklyTrip.ts)**
   - Champ optionnel `route` (libellé canonique, affichage uniquement).
   - Partout : utiliser uniquement `departure` et `arrival` (ou `departureCity`/`arrivalCity`) ; ne jamais déduire départ/arrivée à partir de `route` ou d’un split.
