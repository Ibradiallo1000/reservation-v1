# Routes et escales TELIYA

Ce document décrit le système de **routes réseau** et **escales** (stops) implémenté pour préparer l’évolution vers un réseau de transport avec segments.

---

## 1. Architecture Firestore

### 1.1 Collection routes

**Chemin :** `companies/{companyId}/routes/{routeId}`

| Champ | Type | Description |
|-------|------|-------------|
| `origin` | string | Ville d’origine (départ). |
| `destination` | string | Ville de destination (arrivée). |
| `distanceKm` | number \| null | Distance totale en km. |
| `estimatedDurationMinutes` | number \| null | Durée estimée en minutes. |
| `departureCity` | string | Alias de `origin` (compatibilité, requêtes agence). |
| `arrivalCity` | string | Alias de `destination`. |
| `status` | "ACTIVE" \| "DISABLED" | Statut de la route. |
| `createdAt` / `updatedAt` | timestamp | Audits. |

### 1.2 Sous-collection stops (escales)

**Chemin :** `companies/{companyId}/routes/{routeId}/stops/{stopId}`

| Champ | Type | Description |
|-------|------|-------------|
| `city` | string | Ville de l’escale. |
| `order` | number | Ordre sur la route (1 = origine, N = destination). |
| `distanceFromStartKm` | number \| null | Distance depuis l’origine (km). |
| `estimatedArrivalOffsetMinutes` | number \| null | Délai d’arrivée estimé depuis le départ (min). |

**Règles :**

- Ordre strictement croissant, pas de doublon d’`order`.
- Premier stop (`order === 1`) = `origin` de la route.
- Dernier stop = `destination` de la route.
- Minimum 2 escales par route (origine + destination).

---

## 2. Services

### 2.1 routesService.ts

- **createRoute(companyId, routeData)** — Crée une route (origin, destination, distanceKm, estimatedDurationMinutes). Écrit aussi `departureCity`/`arrivalCity` pour compatibilité.
- **getRoutes(companyId)** — Alias de **listRoutes(companyId)**.
- **listRoutes(companyId, options?)** — Liste toutes les routes (option : `activeOnly`).
- **getRoute(companyId, routeId)** — Récupère une route par id.
- **updateRoute(companyId, routeId, data)** — Met à jour une route.
- **deleteRoute(companyId, routeId)** — Supprime la route et toutes ses escales.
- **setRouteStatus(companyId, routeId, status)** — Active/désactive la route.

### 2.2 routeStopsService.ts

- **getRouteStops(companyId, routeId)** — Liste les escales triées par `order`.
- **getStopsWithOrderGreaterThan(companyId, routeId, order)** — Stops avec ordre strictement supérieur à `order`.
- **getEscaleDestinations(companyId, routeId, stopOrder)** — Destinations autorisées pour la vente depuis une escale : `order > stopOrder` **et** `dropoffAllowed !== false`.
- **getStopByOrder(companyId, routeId, order)** — Retourne le stop à l’ordre donné (ex. ville d’origine de l’escale).
- **addStop(companyId, routeId, stop)** — Ajoute une escale (validation : ordre 1 = origin, dernière = destination, pas de doublon d’ordre).
- **updateStop(companyId, routeId, stopId, data)** — Modifie une escale.
- **deleteStop(companyId, routeId, stopId)** — Supprime une escale.

---

## 3. Interface logistique

**Page :** `CompanyRoutesPage` (Garage → Routes réseau).

- **Liste des routes** : tableau avec itinéraire (origine → destination), distance, durée estimée, lien « Voir / gérer » pour les escales, statut, actions (modifier, activer/désactiver, supprimer).
- **Création / édition de route** : formulaire origine, destination, distance (km), durée estimée (min).
- **Gestion des escales** : modal par route avec liste des stops (ordre, ville, distance, offset), ajout, modification, suppression. Rappel : minimum 2 escales (origine + destination).

---

## 4. weeklyTrips et routeId

- **weeklyTrips** peut contenir un **routeId** (référence vers `companies/{companyId}/routes/{routeId}`).
- Quand **routeId** est renseigné, l’agence choisit une route existante ; **origin** et **destination** viennent de la route.
- Les champs **departure** et **arrival** restent stockés sur le weeklyTrip (pour affichage et compatibilité) mais sont dérivés de la route lorsque **routeId** est présent.
- Sur **AgenceTrajetsPage**, l’agence sélectionne une route (liste filtrée par ville de l’agence = `departureCity`), puis renseigne horaires, prix, véhicule, capacité ; la création du weeklyTrip utilise **routeId**, **departureCity** et **arrivalCity** de la route.

---

## 5. Escales optionnelles et trajets directs

- Une route peut avoir **2 stops uniquement** (origine + destination) = **trajet direct**.
- Ou **plusieurs stops** = trajet avec escales. Contraintes : min 2 stops, ordre 1 = origin, dernier = destination.

## 6. Champs stops (boardingAllowed, dropoffAllowed, cityId)

- `boardingAllowed` (défaut true), `dropoffAllowed` (défaut true), `cityId` (optionnel).

## 7. Rôle escale_agent

- **Peut** : voir tripInstances de son escale, vendre billets, scanner QR, voir ses ventes.
- **Ne peut pas** : créer routes, modifier trajets, voir toute la compagnie. Landing : `/agence/escale`.

## 8. Agences type escale

- Type d'agence : **principale** | **escale**. Pour escale : **routeId** et **stopOrder** obligatoires.

## 9. Tableau de bord escale (EscaleDashboardPage)

- Bus à venir aujourd'hui, heure passage escale, places restantes, bouton Vendre billet → guichet (state fromEscale).

## 10. Vente depuis escale (sécurisée)

- **Destinations autorisées** : escales avec **order > stopOrder** de l’agence **et** **dropoffAllowed = true** (`getEscaleDestinations(companyId, routeId, stopOrder)`).
- **Guichet en mode escale** (`fromEscale` dans `location.state`) : origine fixée à la ville de l’escale (stop à `stopOrder`), liste d’arrivées = destinations autorisées uniquement. Les trajets sont chargés via `listTripInstancesByRouteIdAndDate(routeId, date)` ; la route du tripInstance doit correspondre à `agency.routeId`.
- **Validation côté service** (`guichetReservationService.createGuichetReservation`) : pour une agence de type **escale**, avant création de la réservation :
  - `depart` doit être égal à la ville du stop à `stopOrder` (origine de l’escale).
  - `arrivee` doit être une des villes retournées par `getEscaleDestinations` (order > stopOrder et dropoffAllowed).
  - Si `tripInstanceId` est fourni, le `tripInstance.routeId` doit être égal à `agency.routeId`.
- Un **escale_agent** ne peut donc vendre **que depuis son escale** vers les **escales suivantes autorisées** (descente autorisée).

## 11. Index Firestore

- `tripInstances` : index composite `(routeId, date, departureTime)` pour `listTripInstancesByRouteIdAndDate`.

## 12. Évolutions futures

- Segments, sièges par segment.

---

*Document mis à jour avec escales optionnelles, rôle escale_agent, tableau de bord escale.*
