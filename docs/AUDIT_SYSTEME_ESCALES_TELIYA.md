# Audit ciblé — Système des escales TELIYA

Document d'analyse de ce qui est implémenté pour les escales, les rôles escale, la vente depuis escale, les routes/stops et les interfaces. **Aucune modification de code n'a été effectuée.**

---

## 1. Structure des escales

### 1.1 Représentation Firestore

Une **escale** n’est pas une collection dédiée : c’est une **agence** dont le type est `"escale"` et qui est reliée à une **route** et à un **stop** (ordre) sur cette route.

- **Chemin** : `companies/{companyId}/agences/{agencyId}`
- **Champs utilisés pour l’escale** :
  - **`type`** : `"principale"` | `"escale"`. Si `"escale"`, l’agence est un point d’escale.
  - **`routeId`** : ID du document dans `companies/{companyId}/routes/{routeId}`. Obligatoire pour une escale.
  - **`stopOrder`** : entier = ordre du stop sur la route (1 = origine, 2, 3, … = escales intermédiaires, dernier = destination). Obligatoire pour une escale.

Les autres champs d’agence (nomAgence, ville, pays, quartier, emailGerant, nomGerant, telephone, statut, etc.) sont communs aux agences principales et aux escales.

### 1.2 Comment une agence devient une escale

1. Dans **CompagnieAgencesPage**, à la création ou à l’édition d’une agence, l’utilisateur choisit le **Type d’agence** : « Principale » ou « Escale ».
2. Si **Escale** est sélectionné, deux champs supplémentaires apparaissent :
   - **Route (escale)** : liste déroulante des routes actives de la compagnie (`listRoutes(companyId, { activeOnly: true })`). Valeur stockée dans `routeId`.
   - **Ordre de l’escale sur la route** : champ numérique (min 1). Valeur stockée dans `stopOrder` (1 = origine, 2+ = escales).
3. À l’enregistrement (création ou mise à jour), le document agence est écrit avec `type: "escale"`, `routeId` et `stopOrder` renseignés. Pour une agence principale, `routeId` et `stopOrder` sont mis à `null`.

### 1.3 Liaison escale ↔ route

- L’agence de type escale stocke **`routeId`** qui pointe vers `companies/{companyId}/routes/{routeId}`.
- La route définit **origin** et **destination** et possède une sous-collection **stops** (`routes/{routeId}/stops`). Chaque stop a un **`order`** unique et croissant.
- L’escale est associée au stop dont **`order`** est égal à **`stopOrder`** de l’agence. La ville de l’escale (pour affichage et règles de vente) est celle du stop : `getStopByOrder(companyId, routeId, stopOrder)`.

### 1.4 Correspondance escale ↔ stop

- **stopOrder** de l’agence = **order** du stop sur la route.
- Exemple : route Bamako → Bougouni → Sikasso avec stops order 1 (Bamako), 2 (Bougouni), 3 (Sikasso). Une agence escale avec `routeId` = cette route et `stopOrder = 2` représente l’escale **Bougouni**. La ville d’origine pour la vente depuis cette escale est « Bougouni », et les destinations autorisées sont les stops avec `order > 2` et `dropoffAllowed !== false` (ici Sikasso).

---

## 2. Routes et stops

### 2.1 Collection routes

- **Chemin** : `companies/{companyId}/routes/{routeId}`
- **Champs principaux** : `origin`, `destination`, `distanceKm`, `estimatedDurationMinutes`, `status` (ACTIVE / DISABLED). Champs de compatibilité : `departureCity`, `arrivalCity`, `distance`, `estimatedDuration`.
- Les noms de villes sont normalisés (capitalisation) via `capitalizeCityName` dans `routesService`.

### 2.2 Sous-collection stops (escales de la route)

- **Chemin** : `companies/{companyId}/routes/{routeId}/stops/{stopId}`
- **Structure des stops** (RouteStopDoc) :
  - **`city`** : nom de la ville.
  - **`cityId`** : optionnel, référence à un document ville.
  - **`order`** : entier strictement croissant (1 = origine, dernier = destination).
  - **`distanceFromStartKm`** : optionnel.
  - **`estimatedArrivalOffsetMinutes`** : décalage en minutes par rapport au départ (origine = 0). Utilisé pour afficher l’heure de passage du bus à l’escale.
  - **`boardingAllowed`** : montée autorisée à ce stop (défaut `true`).
  - **`dropoffAllowed`** : descente autorisée à ce stop (défaut `true`).

Les stops sont toujours retournés triés par **`order`** (asc) par `getRouteStops`.

### 2.3 Définition des escales dans une route

- Les escales sont des **stops** avec `order` entre 2 et (dernier - 1). L’ordre 1 est l’origine, le dernier ordre est la destination.
- Contraintes dans `routeStopsService` (addStop / updateStop) :
  - Pas de doublon d’`order`.
  - Order 1 ⇒ ville doit être l’origine de la route.
  - Dernier order ⇒ ville doit être la destination de la route.
- Une route peut n’avoir que 2 stops (origine + destination) = trajet direct sans escale intermédiaire.

### 2.4 Usage de l’ordre pour la vente depuis une escale

- Pour une agence escale avec **stopOrder = X** :
  - **Origine de vente** : la ville du stop dont `order === X` (obtenue via `getStopByOrder`).
  - **Destinations autorisées** : tous les stops avec **`order > X`** et **`dropoffAllowed !== false`** (fonction `getEscaleDestinations`). Ainsi, l’agent ne peut vendre que vers les villes « en aval » sur la route où la descente est autorisée.

---

## 3. Rôle escale

### 3.1 Rôles liés aux escales

| Rôle | Accès escale |
|------|----------------|
| **escale_agent** | Rôle dédié : tableau de bord escale, guichet (vente depuis escale), réservations, boarding. Pas d’accès à la gestion des routes ni à toute la compagnie. |
| **chefAgence** | Peut accéder au tableau de bord escale et au guichet comme un escale_agent, plus le reste du shell agence (dashboard, finances, équipe, etc.). |
| **admin_compagnie** | Accès complet, y compris tableau de bord escale et vue compagnie. |

### 3.2 roles-permissions.ts

- **escale_agent** est défini dans le type `Role` avec les modules : `dashboard`, `guichet`, `reservations`, `boarding`. Il n’a pas `finances`, `personnel`, `fleet`, `parametres`, etc.

### 3.3 routePermissions.ts

- **guichet** : guichetier, chefAgence, **escale_agent**, admin_compagnie.
- **boarding** : chefEmbarquement, chefAgence, **escale_agent**, admin_compagnie.
- **escaleDashboard** : **escale_agent**, chefAgence, admin_compagnie.

### 3.4 Ce que peut faire escale_agent

- Se connecter et être redirigé vers **/agence/escale** (ROLE_LANDING dans AppRoutes).
- Consulter le **tableau de bord escale** (EscaleDashboardPage) : bus du jour pour la route de son agence, heure de passage à l’escale, places restantes, bouton « Vendre billet ».
- Ouvrir le **guichet** (AgenceGuichetPage) en mode escale (depuis le bouton « Vendre billet » du dashboard) : origine fixée à la ville de l’escale, destinations = stops suivants avec descente autorisée.
- Voir et gérer les **réservations** de son agence (onglet réservations / historique guichet).
- Accéder au **boarding** (scan QR, marquer embarqué).
- Utiliser la **caisse** (CashSummaryCard sur le dashboard escale : ventes du jour, clôture).

### 3.5 Pages accessibles

- **/agence/escale** : EscaleDashboardPage (landing pour escale_agent).
- **/agence/guichet** : avec state `fromEscale`, `routeId`, `stopOrder`, `originEscaleCity` (et éventuellement `tripInstanceId`).
- Accès aux zones protégées par les permissions **guichet**, **boarding**, **escaleDashboard** (pas d’accès compagnie, pas de gestion des routes, pas de gestion du personnel ni de la flotte).

### 3.6 Ce qu’il ne peut pas faire

- Créer ou modifier des **routes** ni des **stops** (réservé à responsable_logistique / chef_garage / admin).
- Accéder au **dashboard agence complet** (shell manager), à la **comptabilité agence** (agency_accountant), à la **flotte**, au **courrier** (sauf si rôle additionnel).
- Gérer le **personnel** (équipe) de l’agence.
- Vendre un trajet dont le **départ n’est pas** la ville de son escale, ni une **destination** hors des stops autorisés (contrôlé côté service par `validateEscaleAgentReservation`).

---

## 4. Tableau de bord escale

### 4.1 Fichier analysé

**EscaleDashboardPage.tsx** (`src/modules/agence/escale/pages/EscaleDashboardPage.tsx`).

### 4.2 Chargement de la route

1. L’utilisateur connecté doit avoir `user.companyId` et `user.agencyId`.
2. Lecture du document agence : `doc(db, "companies", user.companyId, "agences", user.agencyId)`.
3. Extraction de `type`, `routeId`, `stopOrder`. Si `type !== "escale"` ou `!routeId`, la page affiche une erreur (« Cette agence n’est pas configurée en escale »).
4. Chargement de la route : `getRoute(user.companyId, routeId)` → document dans `companies/{companyId}/routes/{routeId}`. Si la route est introuvable, erreur.

### 4.3 Identification du stop (escale)

1. Chargement des stops : `getRouteStops(user.companyId, routeId)` → liste triée par `order` asc.
2. Le stop de l’escale : `stops.find((s) => s.order === stopOrder)`. Si aucun stop n’a cet ordre, erreur (« Escale (stopOrder) introuvable sur cette route »).
3. Ce stop donne la **ville** de l’escale et **estimatedArrivalOffsetMinutes** pour calculer l’heure de passage du bus.

### 4.4 Récupération des trajets du jour

- Appel à **`listTripInstancesByRouteIdAndDate(user.companyId, routeId, today)`** où `today = new Date().toISOString().split("T")[0]`.
- Cette fonction (tripInstanceService) interroge `companies/{companyId}/tripInstances` avec les filtres `routeId == routeId` et `date == today`, tri par `departureTime` asc. Un index composite `(routeId, date, departureTime)` est requis.

### 4.5 Calcul du passage du bus à l’escale

- Pour chaque tripInstance, l’heure de **départ à l’origine** est `departureTime` (ex. "08:00").
- Le stop a un champ **`estimatedArrivalOffsetMinutes`** (ex. 150 pour Bougouni si l’origine est à 0).
- Fonction **`addMinutesToTime(timeStr, minutesToAdd)`** : prend une heure "HH:mm", la convertit en minutes, ajoute l’offset, reconvertit en "HH:mm".
- **Heure de passage à l’escale** = `addMinutesToTime(departureTime, stop.estimatedArrivalOffsetMinutes ?? 0)`.

Les lignes du tableau affichent : trajet (origine → destination), départ à l’origine, **passage escale**, places restantes, bouton « Vendre billet ».

### 4.6 Caisse

- **CashSummaryCard** est affiché avec `locationType="escale"`, `locationId=user.agencyId`, `canClose=true`. L’escale a ainsi le même dispositif de caisse (ventes du jour, clôture) que les agences principales.

### 4.7 Navigation vers le guichet

- Au clic sur « Vendre billet » pour un tripInstance : `navigate("/agence/guichet", { state: { fromEscale: true, tripInstanceId, routeId: agencyRouteId, stopOrder: agencyStopOrder, originEscaleCity: stop?.city } })`. Le guichet s’ouvre en **mode escale** avec le contexte nécessaire.

---

## 5. Vente depuis escale

### 5.1 Mode escale du guichet (AgenceGuichetPage)

- Le mode escale est actif si `location.state` contient **`fromEscale: true`**, **`routeId`** et **`stopOrder`** (et optionnellement `originEscaleCity`, `tripInstanceId`).
- **useEffect** d’initialisation : si `isEscaleMode` :
  - Appel à **`getStopByOrder(companyId, routeId, stopOrder)`** pour obtenir la ville d’origine de l’escale.
  - Appel à **`getEscaleDestinations(companyId, routeId, stopOrder)`** pour la liste des villes de destination autorisées (stops avec order > stopOrder et dropoffAllowed !== false).
  - L’**origine** (departure) est fixée à cette ville ; les **destinations** (allArrivals) sont ces villes. L’arrivée par défaut peut être la première destination.
- En mode escale, la **recherche de trajets** ne passe pas par origine/destination libres : elle utilise **`listTripInstancesByRouteIdAndDate`** pour la date et filtre les instances dont `routeId` correspond. Les créneaux affichés ont l’origine fixe (ville escale) et l’arrivée choisie parmi les destinations autorisées.
- Un **badge ou indicateur** « Depuis escale » peut être affiché (selon l’UI). L’utilisateur ne peut pas changer l’origine ; il choisit la destination et la date/créneau.

### 5.2 Origine fixée à la ville de l’escale

- `setDeparture(originCity)` avec `originCity = originStop?.city ?? locationState.originEscaleCity ?? ""`. Donc l’origine affichée et envoyée à `createGuichetReservation` est bien la ville du stop à `stopOrder`.

### 5.3 Destinations autorisées

- Calculées par **`getEscaleDestinations(companyId, routeId, stopOrder)`** dans `routeStopsService` : tous les stops de la route avec **`order > stopOrder`** et **`dropoffAllowed !== false`**. Les noms de villes sont exposés dans l’UI (liste déroulante ou équivalent) et utilisés pour la réservation.

### 5.4 Validation côté service (guichetReservationService)

- **`validateEscaleAgentReservation(companyId, agencyId, depart, arrivee, tripInstanceId?)`** est appelée au début de **`createGuichetReservation`**.
- Étapes :
  1. Lecture de l’agence ; si `type !== "escale"` ou pas de `routeId` / `stopOrder`, la fonction sort sans erreur (agence principale).
  2. Pour une agence escale : **getStopByOrder** pour l’origine autorisée. Si `depart` (normalisé en minuscules) !== ville du stop (minuscules), erreur : « Vente depuis l’escale uniquement : le départ doit être {ville} ».
  3. **getEscaleDestinations** pour les destinations autorisées. Si `arrivee` (normalisée) n’est pas dans cette liste, erreur : « Destination non autorisée pour cette escale ».
  4. Si `tripInstanceId` est fourni : lecture du tripInstance ; si son `routeId` est différent de celui de l’agence, erreur : « Ce trajet ne correspond pas à l’escale de cette agence ».
- En cas d’erreur, `createGuichetReservation` lance l’exception avant toute écriture. La réservation est créée avec `tripInstanceId` si fourni ; **incrementReservedSeats** et **createCashTransaction** utilisent `locationType: "escale"` si l’agence est de type escale.

---

## 6. Relation avec les tripInstances

### 6.1 Filtrage par routeId (tripInstanceService)

- **`listTripInstancesByRouteIdAndDate(companyId, routeId, date, options?)`** :
  - Requête sur `companies/{companyId}/tripInstances` avec `where("routeId", "==", routeId)` et `where("date", "==", date)`.
  - Tri `orderBy("departureTime", "asc")`, `limit(limitCount)` (défaut 100).
- Utilisée par l’**EscaleDashboardPage** (trajets du jour pour la route de l’escale) et par **AgenceGuichetPage** en mode escale (créneaux par date pour cette route).
- **Index Firestore requis** : composite sur `(routeId, date, departureTime)` pour la collection `tripInstances`.

### 6.2 Trajets du jour pour une escale

- L’escale charge tous les tripInstances de la **route** pour la **date du jour**. Elle n’a pas à filtrer par ville : tout trajet de cette route passe par la même séquence de stops. L’heure de passage à l’escale est dérivée de `departureTime` + `estimatedArrivalOffsetMinutes` du stop correspondant à `stopOrder`.

### 6.3 Places restantes

- Pour chaque tripInstance : **`remainingSeats = (seatCapacity ?? capacitySeats ?? 0) - (reservedSeats ?? 0)`**. Les valeurs viennent du document tripInstance (source de vérité). Aucun calcul côté réservations. Les trajets avec 0 place restante ou statut "cancelled" peuvent être exclus de l’affichage ou du bouton « Vendre billet ».

---

## 7. Comptes utilisateurs escale

### 7.1 Création actuelle des comptes « escale »

- **CompagnieAgencesPage** : à la **création** d’une agence (principale ou escale), une **invitation** est créée via **`createInvitationDoc`** avec un rôle fixe : **`role: "chefAgence"`**. Le premier utilisateur de l’agence est donc toujours **chefAgence**, pas escale_agent.
- Il n’existe pas, dans cette page, de choix de rôle « escale_agent » pour la première invitation d’une agence escale. Donc aujourd’hui, le premier compte d’une escale est un **chef d’agence**, qui a accès au tableau de bord escale (car chefAgence est dans escaleDashboard) et au guichet en mode escale.

### 7.2 Chef d’escale

- Il n’y a pas de rôle **« chef d’escale »** distinct dans le code. Un **chefAgence** affecté à une agence de type escale joue le rôle de chef d’escale (accès escale + guichet + caisse + équipe si accès manager). Un **escale_agent** a des droits limités (pas de gestion d’équipe, pas de paramètres agence).

### 7.3 Plusieurs agents escale

- **ManagerTeamPage** permet d’inviter des agents et d’assigner des rôles. La liste **ALL_ASSIGNABLE_ROLES** contient : guichetier, controleur, agency_accountant, chefAgence, chefEmbarquement, agentCourrier. **escale_agent n’y figure pas**. Donc on ne peut pas aujourd’hui inviter un nouvel utilisateur avec le rôle **escale_agent** depuis l’interface Équipe. Seuls les rôles listés peuvent être assignés.
- Pour avoir plusieurs **escale_agent** sur une même escale, il faudrait soit ajouter **escale_agent** à la liste des rôles assignables dans ManagerTeamPage (et gérer l’invitation avec ce rôle), soit un flux dédié « Inviter un agent escale ».

### 7.4 Gestion de l’équipe escale

- La **gestion d’équipe** (ManagerTeamPage) est accessible aux **chefAgence** (et admin_compagnie). Un **escale_agent** n’a pas le module « personnel » et n’accède pas à cette page. Donc :
  - Une escale gérée par un **chefAgence** peut voir l’équipe et inviter des guichetiers, etc., mais pas des escale_agent (rôle absent de la liste).
  - Une escale avec uniquement des **escale_agent** (si on en créait par un autre biais) n’aurait personne pouvant inviter ou gérer l’équipe depuis l’app.

---

## 8. Interface de gestion des escales (CompagnieAgencesPage)

### 8.1 Création d’une escale

- L’admin compagnie va dans **Agences** (CompagnieAgencesPage).
- Clique sur « Ajouter une agence » (ou équivalent).
- Remplit le formulaire :
  - **Type d’agence** : choisit **« Escale »**.
  - **Route (escale)** : sélectionne une route dans la liste (routes actives chargées par `listRoutes(companyId, { activeOnly: true })`). Les options affichent `origin → destination` (ou departureCity → arrivalCity).
  - **Ordre de l’escale sur la route** : saisit un nombre (min 1). Le placeholder indique « 1 = origine, 2+ = escales ».
  - Autres champs : nom agence, ville, pays, gérant, email, téléphone, etc.
- À la soumission (création) : `addDoc` sur `companies/{companyId}/agences` avec `type: "escale"`, `routeId` (si type escale et routeId choisi), `stopOrder` (entier si type escale et stopOrder saisi). Puis création d’une invitation **chefAgence** pour le gérant.

### 8.2 Sélection de la route

- La liste des routes est chargée dans un **useEffect** : `listRoutes(companyId, { activeOnly: true })`. Elle est stockée dans `routesList` et affichée dans un `<select>` lorsque `formData.type === "escale"`. Chaque option a `value={r.id}` et le libellé `origin → destination` (ou champs de compatibilité).

### 8.3 Définition de l’ordre du stop

- Champ **« Ordre de l’escale sur la route »** : `<input type="number" min={1} value={formData.stopOrder} ... placeholder="1 = origine, 2+ = escales" />`. C’est une **saisie libre** : l’admin doit connaître l’ordre des stops sur la route (1 = première ville, 2 = deuxième, etc.). Il n’y a pas de liste déroulante des stops existants de la route pour choisir « quelle escale » ; on saisit uniquement le numéro d’ordre.
- À l’enregistrement, la valeur est parsée en entier et stockée dans `stopOrder`. Aucune vérification côté client que cet ordre existe bien dans `routes/{routeId}/stops`. Si l’ordre n’existe pas, l’EscaleDashboardPage et le guichet renverront des erreurs (stop introuvable, destinations vides, etc.).

---

## 9. Limitations actuelles

### 9.1 Ce qui manque pour gérer correctement les escales

- **Rôle escale_agent dans l’invitation / équipe** : impossible d’inviter un « agent escale » depuis l’UI (CompagnieAgencesPage crée un chefAgence ; ManagerTeamPage ne propose pas escale_agent). Les escales sont donc gérées en pratique par des chefAgence.
- **Choix du stop par liste** : à la création/édition d’une agence escale, l’ordre est saisi en nombre. Il n’y a pas de liste déroulante « Choisir l’escale » basée sur les stops réels de la route (ex. « Bamako », « Bougouni », « Sikasso »), ce qui éviterait des erreurs (ordre inexistant ou incohérent).
- **Validation côté création agence** : pas de contrôle que `stopOrder` existe bien dans la route sélectionnée avant d’enregistrer. Des agences « escale » peuvent être sauvegardées avec un ordre invalide.
- **Chef d’escale dédié** : pas de rôle « chef_escale » distinct ; on utilise chefAgence pour la première personne sur une escale.
- **Documentation utilisateur** : pas d’aide inline expliquant que l’ordre doit correspondre aux stops définis dans la fiche route (CompanyRoutesPage).

### 9.2 Incohérences possibles

- **Agence escale sans route / sans stop** : si on édite une agence et qu’on passe en « Principale », `routeId` et `stopOrder` sont mis à null. Si ensuite on repasse en « Escale » sans resélectionner une route ou sans stops créés sur cette route, l’escale peut rester dans un état incohérent (routeId présent mais stopOrder absent ou stop inexistant).
- **Route supprimée ou désactivée** : si une route est supprimée ou mise en DISABLED, les agences escales qui la référencent continuent d’avoir ce `routeId`. Les écrans escale peuvent échouer (route introuvable) ou afficher des données incohérentes. Aucune contrainte de clé étrangère ni de nettoyage automatique.
- **Ville agence vs ville du stop** : l’agence a un champ `ville` (ou `city`) et le stop a `city`. Rien ne force la cohérence entre les deux. Une agence escale peut avoir « Bougouni » en ville et un stopOrder pointant vers un stop « Bougouni » sur la route, mais ce n’est pas vérifié.

### 9.3 Problèmes potentiels

- **Index Firestore** : sans l’index composite `tripInstances (routeId, date, departureTime)`, les requêtes `listTripInstancesByRouteIdAndDate` échouent en production.
- **Performance** : pour une compagnie avec beaucoup de tripInstances, la requête par routeId + date reste raisonnable ; en revanche, si on affichait toutes les routes pour une date, il faudrait plusieurs requêtes ou une structure différente.
- **Concurrence** : la vente depuis l’escale utilise les mêmes tripInstances et `incrementReservedSeats` (transaction) que le guichet principal ; pas de risque spécifique escale si tout passe par le même service.
- **Multi-escales même route** : plusieurs agences peuvent avoir le même `routeId` avec des `stopOrder` différents (ex. une agence à l’ordre 2, une autre à l’ordre 3). C’est le modèle attendu (une agence physique par escale). Aucune contrainte n’empêche deux agences d’avoir le même (routeId, stopOrder), ce qui serait une configuration erronée (deux agences pour la même escale logique).

---

## 10. Résultat attendu — Synthèse

### 10.1 Comment TELIYA gère les escales aujourd’hui

- Une **escale** est une **agence** avec `type: "escale"`, **`routeId`** et **`stopOrder`**. Elle est liée à un **stop** d’une **route** (companies/…/routes/…/stops). La route définit l’ordre des villes (stops) ; chaque stop a `order`, `boardingAllowed`, `dropoffAllowed` et optionnellement `estimatedArrivalOffsetMinutes`.
- Le **tableau de bord escale** charge la route et le stop correspondant, récupère les **tripInstances** du jour pour cette route, calcule l’heure de passage à l’escale (départ + offset) et affiche les places restantes. L’agent peut ouvrir le **guichet en mode escale** (origine = ville du stop, destinations = stops suivants avec descente autorisée). La **validation côté service** garantit que seules les ventes conformes (départ = escale, destination autorisée, tripInstance de la bonne route) sont enregistrées. La **caisse** (CashSummaryCard) et les **réservations** sont gérées comme pour une agence principale, avec `locationType: "escale"` pour les transactions.

### 10.2 Liaison escales ↔ routes

- Les escales sont définies par **route** + **ordre du stop**. Les routes et les stops sont gérés dans **CompanyRoutesPage** (côté compagnie / logistique). Les agences de type escale sont gérées dans **CompagnieAgencesPage** : on choisit une route et on saisit l’ordre. La cohérence (ordre présent dans la route, ville du stop) n’est pas vérifiée à la sauvegarde de l’agence.

### 10.3 Comment les agents escale travaillent

- **escale_agent** (si le rôle était assignable) : landing sur /agence/escale, consultation des bus du jour, vente au guichet depuis l’escale, boarding, caisse. Pas d’accès à la gestion des routes ni à l’équipe.
- **En pratique** : les comptes escale sont créés comme **chefAgence** (première invitation). Le chef d’agence a donc tous les droits agence + accès escale. Il n’existe pas encore de flux pour créer ou inviter un **escale_agent** depuis l’interface.

### 10.4 Ce qu’il faut améliorer pour un système d’escales complet

- **Rôle escale_agent** : l’ajouter aux rôles assignables (ex. ManagerTeamPage) et permettre l’invitation d’agents avec ce rôle pour les agences de type escale.
- **Création/édition agence escale** : proposer une liste de **stops** de la route sélectionnée (ville + ordre) pour choisir l’escale au lieu de saisir un numéro à la main ; vérifier côté client ou serveur que (routeId, stopOrder) existe.
- **Cohérence données** : à la désactivation/suppression d’une route, alerter ou bloquer si des agences escales l’utilisent ; optionnellement proposer de les repasser en « principale » ou de changer de route.
- **Documentation / aide** : rappeler dans le formulaire agence que l’ordre doit correspondre aux escales définies dans la fiche route (lien ou courte explication).
- **Validation** : à la sauvegarde d’une agence escale, vérifier que le stop (routeId, stopOrder) existe et éventuellement pré-remplir la ville de l’agence avec la ville du stop.

---

*Document généré par audit du code. Aucune modification des sources.*
