# Routes réseau & agency trip configuration — Implementation summary

**Goal:** Company defines transport network routes; agencies configure only operational details (price, seats, schedules). No breaking changes to existing weeklyTrips or reservation flows.

---

## 1. Files created

| File | Purpose |
|------|--------|
| **src/modules/compagnie/pages/CompanyRoutesPage.tsx** | CEO “Routes réseau” tab: list routes, create, edit, activate/deactivate. Uses `companies/{companyId}/routes`. |
| **docs/ROUTES_AND_TRIP_CONFIG_IMPLEMENTATION.md** | This summary. |

---

## 2. Files updated

| File | Changes |
|------|--------|
| **src/modules/compagnie/routes/routesTypes.ts** | Added `ROUTE_STATUS` (ACTIVE, DISABLED), `RouteStatus`; `RouteDoc` extended with optional `status`, `createdAt`, `updatedAt`. |
| **src/modules/compagnie/routes/routesService.ts** | `createRoute` sets `status: ACTIVE`, `createdAt`, `updatedAt`; added `updateRoute`, `setRouteStatus`; `listRoutesByDepartureCity` filters to ACTIVE (in memory for backward compat). |
| **src/modules/compagnie/pages/CompagnieParametresTabsPage.tsx** | New tab `routes-reseau` (“Routes réseau”) rendering `CompanyRoutesPage`. |
| **src/types/weeklyTrip.ts** | Added optional `routeId`, `departureCity`, `arrivalCity`, `seats`, `agencyId`, `status`, `updatedAt`; kept `departure`, `arrival`, `places` for backward compat. |
| **src/modules/agence/services/generateWeeklyTrips.ts** | New options param: `routeId`, `departureCity`, `arrivalCity`, `seats`; writes `departureCity`, `arrivalCity`, `seats`, `agencyId`, `status`, `updatedAt`; still writes `departure`, `arrival`, `places`. |
| **src/modules/agence/pages/AgenceTrajetsPage.tsx** | Removed ville départ/arrivée inputs; route selector (required for new trip); display “Départ / Arrivée” from route or editing trip; create uses route + price + seats + horaires; edit only price, seats, horaires (route locked); backward compat for trips without `routeId`. |
| **firestore.indexes.json** | Optional composite index for `routes` (departureCity, status) for future query use. |

---

## 3. Firestore schema used

### companies/{companyId}/routes/{routeId}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| departureCity | string | Yes | Ville de départ. |
| arrivalCity | string | Yes | Ville d’arrivée. |
| distance | number \| null | No | Distance (km). |
| estimatedDuration | number \| null | No | Durée estimée (minutes). |
| status | "ACTIVE" \| "DISABLED" | No (default ACTIVE) | État de la route. |
| createdAt | Timestamp | No | Création. |
| updatedAt | Timestamp | No | Dernière mise à jour. |

### companies/{companyId}/agences/{agencyId}/weeklyTrips/{tripId}

Existing fields unchanged. New/optional:

| Field | Type | Description |
|-------|------|-------------|
| routeId | string \| null | Référence à la route (companies/…/routes/{routeId}). Optionnel pour compat. |
| departureCity | string | Copié de la route (ou legacy departure). |
| arrivalCity | string | Copié de la route (ou legacy arrival). |
| seats | number | Nombre de places (opérationnel). |
| agencyId | string \| null | Agence propriétaire du trajet. |
| status | string | Ex. "ACTIVE". |
| updatedAt | Timestamp | Dernière mise à jour. |

**Backward compatibility:** Si un trajet n’a pas `routeId`, on utilise `departure` / `arrival` comme avant. Les réservations et flux existants ne sont pas modifiés.

---

## 4. UI components modified

### Compagnie Settings → Configuration

- **Onglet “Routes réseau”** (nouveau)  
  - Liste des routes (départ, arrivée, distance, durée, statut).  
  - Actions : Nouvelle route, Modifier, Activer / Désactiver.  
  - Modal création/édition : Ville de départ, Ville d’arrivée, Distance (optionnel), Durée estimée (optionnel).

### AgenceTrajetsPage (Gestion des trajets)

- **Message fixe :**  
  “Départs autorisés : {agencyCity} (ville de votre agence)”.
- **Formulaire nouveau trajet :**  
  - **Route** (liste déroulante obligatoire) : options = routes ACTIVE avec `departureCity == agencyCity` (ville agence : `city ?? villeNorm ?? ville`).  
  - Affichage automatique : “Départ : X — Arrivée : Y” après choix de la route.  
  - Plus de champs “Ville de départ” / “Ville d’arrivée”.  
  - Champs conservés : Prix, Nombre de places, Horaires (par jour).
- **Formulaire modification :**  
  - Route non modifiable (affichage en lecture seule “Route (non modifiable) : X → Y”).  
  - Édition possible : prix, places, horaires uniquement.
- **Trajets sans route (legacy) :**  
  - Affichage “Départ / Arrivée” via `departureCity ?? departure` et `arrivalCity ?? arrival`.  
  - Modification comme ci‑dessus (prix, places, horaires).
- **Aucune route disponible :**  
  - Message invitant à ce que le siège ajoute des routes (Paramètres → Routes réseau).

---

## 5. Architecture (résumé)

- **Compagnie** : Définit les routes dans Paramètres → Configuration → Routes réseau.  
- **Agence** : Choisit une route (départ = ville de l’agence), saisit prix, places, horaires.  
- **Flotte** : Affectations véhicules inchangées.  
- **Réservations** : Flux et données existants préservés ; les trajets continuent d’exposer départ/arrivée (departure/arrival + optionnellement departureCity/arrivalCity).

---

## 6. Déploiement

- Aucune migration obligatoire : les routes existantes sans `status` sont considérées ACTIVE ; les weeklyTrips sans `routeId` restent valides.  
- Déploiement des index Firestore (si besoin) : `firebase deploy --only firestore:indexes`.
