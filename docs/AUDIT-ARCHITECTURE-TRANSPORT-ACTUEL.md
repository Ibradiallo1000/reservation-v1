# Audit technique — Architecture transport actuelle (système de trajets)

**Date :** 2025  
**Objectif :** Documenter l’architecture actuelle du système de transport (trajets, réservations, véhicules) avant toute évolution vers un modèle segment-based. Aucune modification de code, aucune proposition d’architecture.

---

## PARTIE 1 — Structure actuelle des trajets

### 1.1 Où sont définis les trajets ?

- **weeklyTrips** : seule collection Firestore qui définit les trajets. Ce sont des **modèles hebdomadaires** (origine, destination, horaires par jour de la semaine, prix, capacité).
- **trips** : n’existe pas comme collection. Le terme « trip » en code désigne soit un `WeeklyTrip`, soit une **instance dérivée en mémoire** (weeklyTrip + date + créneau horaire).
- **tripInstances** : **aucune collection** dédiée. Une « instance de trajet » est un **identifiant logique** construit côté client : `weeklyTripId_YYYY-MM-DD_HH:mm` (ex. `abc123_2025-02-22_08:00`). Elle n’est pas persistée en tant que document.
- **Autres** : aucun autre stockage de trajets (pas de `dailyTrips`, pas de collection `voyages` utilisée pour les réservations courantes).

### 1.2 Chemins Firestore

| Entité | Chemin Firestore |
|--------|-------------------|
| **weeklyTrips** | `companies/{companyId}/agences/{agencyId}/weeklyTrips/{tripId}` |
| **Instances de trajet** | Non stockées ; dérivées en mémoire à partir de weeklyTrips + date + jour de la semaine |
| **Véhicules assignés (affectations)** | `companies/{companyId}/agences/{agencyId}/affectations/{affectationId}` |
| **Flotte (véhicules)** | `companies/{companyId}/fleetVehicles/{vehicleId}` |
| **Réservations** | `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}` |
| **Compteur référence billet** | `companies/{companyId}/counters/byTrip/trips/{tripInstanceId}` (tripInstanceId = `weeklyTripId_YYYY-MM-DD_HH:mm`) |

### 1.3 Champs d’un trajet (weeklyTrip)

Champs présents dans un document **weeklyTrips** (et dans le type `WeeklyTrip` / `generateWeeklyTrips`) :

| Champ | Description |
|-------|-------------|
| `id` | Identifiant du document (généré à la création) |
| `departure` / `depart` | Ville de départ (origine) |
| `arrival` / `arrivee` | Ville d’arrivée (destination) |
| `price` | Prix du trajet |
| `places` | Nombre de places (capacité) |
| `horaires` | Objet `{ [jourSemaine: string]: string[] }` (ex. `lundi: ["08:00", "14:00"]`) |
| `active` | Booléen (trajet actif ou non) |
| `createdAt`, `updatedAt` | Timestamps Firestore |

**Non présents sur le trajet :**  
- Pas de `vehicleId` (le véhicule est sur l’**affectation**, pas sur le weeklyTrip).  
- Pas de `agencyId` ni `companyId` dans le document (l’agence est dans le **chemin** Firestore).  
- Pas d’horodatage de départ réel (seulement jour de la semaine + heure dans `horaires`).

### 1.4 Nature des trajets : templates vs instances vs génération

- **A) Templates hebdomadaires** : Oui. Les **weeklyTrips** sont des modèles récurrents par jour de la semaine (lundi, mardi, etc.) et par créneau horaire.
- **B) Instanciation par date** : Oui, mais **uniquement en mémoire**. Pour une date donnée, le client :
  - détermine le jour de la semaine (ex. `lundi`) ;
  - filtre les weeklyTrips actifs ayant au moins un horaire ce jour-là ;
  - pour chaque (weeklyTrip, date, heure), construit l’id d’instance `weeklyTripId_YYYY-MM-DD_HH:mm`.
  - Aucun document « instance » n’est créé en base.
- **C) Génération dynamique** : Les « départs » affichés (guichet, recherche client, embarquement, opérations) sont **toujours dérivés à la volée** à partir de weeklyTrips + date + `horaires`, pas à partir d’une table de départs pré-générés.

**En résumé :** Modèle **template hebdo + dérivation côté client**. Pas de collection d’instances de trajets en Firestore.

---

## PARTIE 2 — Liaison réservation ↔ trajet

### 2.1 Comment une réservation est-elle liée à un trajet ?

- **Champ utilisé** : `trajetId` (en base et dans les types réservation).
- **Format de `trajetId`** : identifiant d’**instance logique** :  
  `weeklyTripId_YYYY-MM-DD_HH:mm`  
  (ex. `xyz789_2025-02-22_14:30`).
- **Pas de champ** `weeklyTripId` seul sur la réservation dans le flux principal ; le lien au weeklyTrip est implicite (préfixe de `trajetId`).
- **Pas de champ** `tripInstanceId` en tant que tel ; en pratique `trajetId` **est** l’id d’instance.

La réservation stocke aussi : `date`, `heure`, `depart`/`departure`, `arrivee`/`arrival` (redondants avec le trajet mais utilisés pour requêtes et affichage).

### 2.2 Où est calculée la disponibilité en places ?

| Contexte | Méthode |
|----------|--------|
| **Guichet (AgenceGuichetPage)** | En mémoire : `computeRemainingSeats(totalSeats, trajetId, reservations)` → somme des `seatsGo` des réservations dont `trajetId` correspond et statut payé/confirmé ; `remainingSeats = totalSeats - used`. |
| **Client (ReservationClientPage, ResultatsAgencePage)** | En mémoire : chargement des réservations (par compagnie/agence/date), puis pour chaque (weeklyTrip, date, heure) : `trajetId = weeklyTripId_date_heure`, somme des `seatsGo` pour ce `trajetId` et statut payé/confirmé, puis `remainingSeats = places - reserved`. |
| **Écoute temps réel (seats.ts)** | `listenRemainingSeatsForDate` : requête Firestore sur `reservations` (date, depart, arrivee), agrégation en mémoire par `trajetId` (usedByTrip), puis `remainingSeats = places - used` par instance. |
| **dailyStats** | Ne contient **pas** de détail par trajet ; uniquement des totaux jour (totalRevenue, totalPassengers, totalSeats, etc.). Pas utilisé pour les places restantes. |

Aucun champ « remainingSeats » ou « seatsSold » persisté sur un document trajet ou instance.

### 2.3 La décrémentation de places est-elle transactionnelle ?

**Non.**  

- **Création réservation guichet** : `createGuichetReservation` utilise une `runTransaction` pour :
  - vérifier la session (shift actif, non verrouillée, même appareil) ;
  - écrire le document réservation ;
  - mettre à jour `dailyStats` (totalPassengers, totalSeats).
  Il n’y a **aucune** lecture du nombre de places déjà vendues ni de « réserve » atomique de places dans cette transaction.
- **Création réservation en ligne** : `addDoc` sur la collection reservations puis `updateDoc` pour token/URL ; **aucune transaction** et aucun contrôle serveur des places.

La disponibilité est donc **uniquement** calculée côté client (ou listener) ; la décrémentation est implicite (une réservation en plus = une place en moins dans le calcul), mais **sans verrou ni condition atomique** à la création.

### 2.4 Qu’est-ce qui empêche la surréservation ?

- **Contrôle côté client** : avant d’appeler la création, le code vérifie `remainingSeats` (ex. guichet : `placesAller > selectedTrip.remainingSeats` → alerte).
- **Pas de garde-fou côté base** : aucune règle Firestore ni Cloud Function qui vérifie un quota de places par `trajetId` à la création de réservation.
- **Risque de course** : deux créations simultanées (deux guichets ou un guichet + un client en ligne) peuvent toutes deux passer la vérification `remainingSeats` et aboutir à un nombre total de places vendues supérieur à la capacité.

**Conclusion :** La prévention de la surréservation repose uniquement sur le calcul en mémoire et la vérification avant appel ; elle n’est **pas** transactionnelle et est vulnérable aux accès concurrents.

---

## PARTIE 3 — Affectation véhicule

### 3.1 Où est stocké le vehicleId ?

- **Sur l’affectation** : chaque document dans `companies/{companyId}/agences/{agencyId}/affectations/{affectationId}` contient notamment :
  - `vehicleId`, `vehiclePlate`, `vehicleModel`
  - `tripId`, `departureCity`, `arrivalCity`, `departureTime`
  - `status` (AFFECTE, DEPART_CONFIRME, ARRIVE, CANCELLED)
  - chauffeur, convoyeur, etc.
- **Sur le véhicule (fleetVehicles)** : le véhicule peut avoir un champ type `currentTripId` (suivi d’état opérationnel), mais le **lien trajet → véhicule** pour l’embarquement et les opérations passe par la table **affectations**, pas par le weeklyTrip.

**Pas de vehicleId sur** : weeklyTrip, réservation (sauf champs optionnels type `busId` dans certains types, non utilisés pour le flux principal actuel).

### 3.2 Un trajet peut-il changer de véhicule dynamiquement ?

Oui.  
- Le véhicule est attaché à une **affectation** (départ/arrivée/date/heure).  
- On peut annuler une affectation et en créer une nouvelle pour le même « slot » (même dép/arr/date/heure) avec un autre véhicule.  
- La correspondance trajet théorique (weeklyTrip + date + heure) ↔ véhicule se fait via la recherche d’une affectation dont (departureCity, arrivalCity, date, heure) correspondent (voir `getAffectationForBoarding`), pas via une clé unique immutable.

### 3.3 Existe-t-il une machine à états pour le cycle de vie du trajet ?

- **Trajet (weeklyTrip)** : pas d’état (uniquement `active` pour actif/inactif). Pas de statut OPEN / CLOSED / COMPLETED au niveau du trajet.
- **Affectation** : machine à états explicite :
  - `AFFECTE` → véhicule assigné au départ
  - `DEPART_CONFIRME` → départ confirmé (véhicule en transit)
  - `ARRIVE` → arrivée confirmée
  - `CANCELLED` → affectation annulée
- **Embarquement** :
  - **boardingClosures** : un document par « trajet » (clé type dep_arr_heure_date) indique que l’embarquement est clôturé pour ce départ.
  - **boardingStats** : par `tripKey` (dep_arr_heure_date), champs `embarkedSeats`, `absentSeats`, `status: "open" | "closed"`.
- Il n’y a pas d’état unique « trajet » (OPEN/CLOSED/COMPLETED) ; les états sont répartis entre affectation (véhicule) et embarquement (clôture, stats).

---

## PARTIE 4 — Limites liées à la route

### 4.1 Les trajets gèrent-ils des arrêts intermédiaires ?

**Non.**  
- Un weeklyTrip a uniquement **deux** champs de lieu : origine (départ) et destination (arrivée).  
- Aucun champ du type `stops`, `intermediateStops`, `segments` ou `etapes` n’existe dans le modèle ni dans le code métier.

### 4.2 Si non : destination partielle, segments ?

- **Destination partielle** : aucune notion. La réservation est toujours (départ, arrivée) = une paire de villes ; pas de « montée/descente » à une ville intermédiaire.
- **Logique segment-based** : absente. Aucun calcul de tarif par segment, aucune réservation « sur un segment » d’une ligne multi-étapes.

### 4.3 Un passager peut-il voyager d’origine à une ville intermédiaire, ou uniquement origine → destination complète ?

**Uniquement trajet complet origine → destination.**  
- Chaque réservation est liée à un trajet (instance) défini par une **paire (départ, arrivée)** et une date/heure.  
- Il n’est pas possible de réserver « Bamako → Ségou » sur un trajet affiché comme « Bamako → Kayes » ; il n’y a pas de trajet partiel ni de segment intermédiaire modélisé.

---

## PARTIE 5 — Dépendances de données

Modules / zones qui s’appuient sur les structures actuelles :

| Donnée | Modules / usages |
|--------|-------------------|
| **weeklyTrips** | AgenceTrajetsPage (CRUD), AgenceGuichetPage (recherche trajets, vente), ReservationClientPage / ResultatsAgencePage (offre client), AffectationVehiculePage, FleetAssignmentPage (liste départs pour affectation), ManagerOperationsPage, ManagerCockpitPage, ManagerDashboardPage (départs du jour, alertes), BoardingDashboardPage, AgenceEmbarquementPage (liste trajets, réservations par trajet), useVilleOptions (villes proposées), useManagerAlerts, NextDepartureCard, PlatformSearchResultsPage (collectionGroup weeklyTrips), PublicCompanyPage. |
| **Instances dérivées (weeklyTripId_date_heure)** | Guichet (trajet sélectionné, référence billet), Client (sélection trajet, trajetId réservation), referenceCode / tickets (compteur par tripInstanceId), seats.ts (remainingSeats par instance), Embarquement (sélection trajet, requêtes réservations par trajetId), Boarding (boardingStats, boardingClosures par tripKey). |
| **reservations** | Guichet (liste, création, annulation, édition), Client (création brouillon, paiement), Embarquement (liste par trajet, mise à jour statut embarqué/absent), BoardingDashboardPage, Manager (rapports, revenus), dailyStats (incréments à la création), CEO / Compagnie (revenus, anomalies), Comptabilité, useManagerAlerts. |
| **Affectations véhicules** | AffectationVehiculePage (legacy, par clé dep_arr_heure_date), ManagerOperationsPage (assignation, confirmation départ, annulation), FleetAssignmentPage, AgenceFleetOperationsPage, getAffectationForBoarding (embarquement), fleetStateMachine, migrateLegacyAffectations. |
| **Comptages de places** | AgenceGuichetPage (remainingSeats avant vente), ReservationClientPage / ResultatsAgencePage (remainingSeats pour affichage et choix trajet), seats.ts (listenRemainingSeatsForDate), Boarding (capacity / boardingStats). |

---

## PARTIE 6 — Analyse des risques (sans proposer de nouvelle architecture)

### 6.1 Ce qui casserait en introduisant un routage par segments

- **Identifiant de trajet** : aujourd’hui une réservation est liée à **une** instance `weeklyTripId_YYYY-MM-DD_HH:mm` = **une** paire (origine, destination) et **un** horaire. Avec des segments (A→B→C), il faudrait soit plusieurs « trajets » (A→B, B→C), soit un modèle où une réservation peut concerner un **segment** d’un trajet (ex. A→B sur un trajet A→B→C). Toute la logique qui suppose **un** `trajetId` = **un** départ + **une** arrivée serait à revoir (réservations, places, référence, embarquement).
- **Calcul des places** : le calcul actuel est par **instance** (un créneau = un trajet complet). Avec des segments, les places « prises » sur un segment (ex. A→B) et sur un autre (B→C) ne sont plus les mêmes ; il faudrait des quotas par segment ou par tronçon, et potentiellement une logique de « capacité par segment » au lieu d’une capacité globale par départ.
- **Affectation / véhicule** : l’affectation est aujourd’hui (departureCity, arrivalCity, date, heure). Avec des segments, un même véhicule peut faire plusieurs tronçons ; le lien affectation ↔ « trajet » ou « segment » deviendrait plus complexe (une affectation par segment ? une par ligne multi-étapes ?).
- **Embarquement** : boardingClosures et boardingStats sont indexés par une clé type (dep, arr, heure, date). Avec des arrêts intermédiaires, il faudrait définir à quel niveau on ferme l’embarquement (tout le trajet ? chaque segment ?) et adapter les clés et les agrégats.
- **Référence billet** : le compteur est par `tripInstanceId`. Si l’instance devient un « trajet segment » ou une combinaison segment + trajet, le périmètre du compteur (un par départ global vs un par segment) doit être redéfini.

### 6.2 Modules fortement couplés à la logique origine/destination

- **Guichet** : sélection (départ, arrivée), construction des instances à partir de weeklyTrips, enregistrement de `trajetId` (instance), calcul remainingSeats par instance, génération de la référence par tripInstanceId.
- **Réservation client** : même construction d’instances (départ, arrivée, date, heure), même `trajetId`, même calcul de places ; affichage des trajets en « grille » date/heure pour une paire de villes.
- **Résultats / recherche** : filtrage par départ/arrivée, construction des trajets et des remainingSeats par instance.
- **Embarquement** : sélection trajet (départ, arrivée, heure, date), requêtes réservations par (date, depart, arrivee, heure) et par `trajetId`, boardingClosures/boardingStats par tripKey (dep_arr_heure_date).
- **Affectation véhicule** : départs dérivés de weeklyTrips (dep, arr, horaires), clé d’affectation ou recherche par (departureCity, arrivalCity, date, heure).
- **referenceCode / tickets** : compteur par `tripInstanceId` (format actuel = un départ complet).

Ces modules supposent tous qu’**un trajet = une paire (origine, destination) + un horaire**, sans notion de segment ou d’étape intermédiaire.

### 6.3 Zone de plus fort risque

- **Réservation + disponibilité** : la combinaison (liaison réservation ↔ trajet, format `trajetId`, calcul des places, absence de transaction de réservation de places) est au cœur du modèle. Toute évolution vers des segments touche à la fois :
  - la structure des données (trajet, instance, segment),
  - les règles de capacité (par segment ou par trajet),
  - et l’identification unique d’un « départ » (référence, guichet, embarquement).
- **Embarquement et affectation** : ils reposent sur une clé (dep, arr, heure, date) et sur la correspondance réservation ↔ ce même « slot ». Dès qu’un trajet peut avoir plusieurs segments, la définition du « slot » et du « départ » à afficher et à fermer devient ambiguë sans refonte explicite.

---

**Fin du rapport.**  
Document de référence pour la phase de conception d’une évolution segment-based ; aucune modification de code ni proposition d’architecture n’est incluse.
