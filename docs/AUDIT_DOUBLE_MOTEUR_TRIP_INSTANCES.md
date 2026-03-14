# Audit — Double moteur weeklyTrips / tripInstances et source de vérité des places

Objectif : corriger le double moteur (deux logiques concurrentes pour les places restantes) et définir une architecture claire où **weeklyTrips = template**, **tripInstances = trajet réel (source de vérité)**.

---

## 1. Fichiers qui utilisent weeklyTrips, tripInstances, reservations

### 1.1 weeklyTrips (lecture ou écriture)

| Fichier | Usage |
|---------|--------|
| **AgenceTrajetsPage.tsx** | CRUD weeklyTrips (liste, création, modification, suppression). Template uniquement. |
| **generateWeeklyTrips.ts** | Création d’un document weeklyTrip (service). |
| **ReservationClientPage.tsx** | **Lecture** : charge weeklyTrips de toutes les agences + reservations pour **construire la liste des créneaux** et calculer `remaining = capacity - sum(seatsGo)` côté client. N’utilise pas tripInstances pour l’affichage. |
| **ResultatsAgencePage.tsx** | **Lecture** : si `listTripInstancesByRouteAndDate` retourne vide, parcourt agences → weeklyTrips et appelle **getOrCreateTripInstanceForSlot** pour chaque créneau, puis re-requête tripInstances. weeklyTrips = source pour **générer** les tripInstances. |
| **AgenceGuichetPage.tsx** | **Lecture** : charge weeklyTrips de l’agence + reservations. Construit les créneaux (id = `weeklyTripId_date_heure`). **Places restantes = computeRemainingSeats(places, trajetId, reservations)**. N’utilise pas tripInstances. |
| **ManagerOperationsPage.tsx** | Lecture weeklyTrips pour affichage opérations (départs, créneaux). |
| **ManagerCockpitPage.tsx** | Idem, indicateurs. |
| **ManagerDashboardPage.tsx** | Idem. |
| **BoardingDashboardPage.tsx** | Lecture weeklyTrips pour liste des trajets à embarquer. |
| **AgenceEmbarquementPage.tsx** | Lecture weeklyTrips pour matching réservation / trajet. |
| **NextDepartureCard.tsx** | Lecture weeklyTrips (agence). |
| **useVilleOptions.ts** | Lecture weeklyTrips (toutes agences) pour suggestions de villes. |
| **FleetAssignmentPage.tsx** | Lecture weeklyTrips pour affectation véhicule. |
| **AffectationVehiculePage.tsx** | Idem. |
| **LogisticsDashboardPage.tsx** | Comptage weeklyTrips par agence. |
| **useManagerAlerts.ts** | Lecture weeklyTrips (cache). |
| **PublicCompanyPage.tsx** | Référence "weeklyTrips" (texte). |
| **PlatformSearchResultsPage.tsx** | collectionGroup('weeklyTrips') pour recherche plateforme. |
| **vehiclesService.ts** | Écriture optionnelle `vehicleId` sur le doc weeklyTrip lors d’une affectation. |

### 1.2 tripInstances (lecture ou écriture)

| Fichier | Usage |
|---------|--------|
| **tripInstanceService.ts** | CRUD tripInstances : createTripInstance, getOrCreateTripInstanceForSlot, listTripInstancesByRouteAndDate, incrementReservedSeats, decrementReservedSeats, updateTripInstanceStatus, assignVehicleToTripInstance, etc. |
| **tripInstanceTypes.ts** | Types TripInstanceDoc (seatCapacity, reservedSeats, passengerCount, etc.). |
| **ResultatsAgencePage.tsx** | **Source principale** : listTripInstancesByRouteAndDate → affichage ; remainingSeats = seatCapacity - reservedSeats. Si aucun instance, création lazy depuis weeklyTrips puis re-requête. |
| **ReservationClientPage.tsx** | À la **création** de résa : getOrCreateTripInstanceForSlot (si id contient '_'), puis **incrementReservedSeats**. La **liste** des créneaux ne vient pas des tripInstances mais des weeklyTrips + reservations. |
| **AgenceGuichetPage.tsx** | **Aucune** lecture ni écriture tripInstances. Référence `tripInstanceId` uniquement dans generateRef (compteur par trajet) : le paramètre passé est `selectedTrip.id` (= `weeklyTripId_date_heure`), pas l’id Firestore d’un tripInstance. |
| **guichetReservationService.ts** | Accepte `tripInstanceId` en paramètre et le stocke sur la réservation. **N’appelle pas incrementReservedSeats** après création. |
| **vehiclesService.ts** | Utilise tripInstanceService (findTripInstanceBySlot, updateTripInstanceStatus, assignVehicleToTripInstance). |
| **createShipment.ts** (courrier) | incrementParcelCount sur tripInstance si tripInstanceId fourni. |
| **referenceCode.ts** | Compteur par tripInstanceId (byTrip/trips/{tripInstanceId}). |
| **tickets.ts** | Référence tripInstanceId pour génération code. |

### 1.3 reservations (lecture ou écriture)

| Fichier | Usage |
|---------|--------|
| **ReservationClientPage.tsx** | Lecture (agences) pour calcul `reserved = sum(seatsGo)` par trajetId ; écriture (addDoc) à la création + updateDoc (publicToken). |
| **AgenceGuichetPage.tsx** | onSnapshot reservations → recalcul **computeRemainingSeats** pour chaque créneau (trajetId + statut paye/confirme). createGuichetReservation pour création. |
| **ResultatsAgencePage.tsx** | N’utilise pas les réservations pour les places : uniquement tripInstances (seatCapacity - reservedSeats). |
| **guichetReservationService.ts** | Écriture réservation (trajetId, tripInstanceId optionnel, etc.). |
| **AgenceEmbarquementPage.tsx** | Lecture réservations pour scan / liste passagers. |
| **ManagerOperationsPage.tsx** | Lecture pour indicateurs. |
| **CompanyFinancesPage.tsx**, **VueGlobale.tsx**, **CompagnieReservationsPage.tsx**, etc. | Lecture pour rapports / liste / stats. |

---

## 2. Endroits où les places restantes sont calculées

| Lieu | Formule | Source des données |
|------|--------|---------------------|
| **ReservationClientPage.tsx** (liste) | `remaining = (t.places \|\| 30) - reserved` | weeklyTrips + reservations ; `reserved` = somme des `seatsGo` des résa avec même `trajetId` et statut confirme/paye. |
| **AgenceGuichetPage.tsx** | `computeRemainingSeats(totalSeats, trajetId, reservations)` = `totalSeats - sum(seatsGo)` pour résa avec ce trajetId et statut paye/confirme. | weeklyTrips (places) + reservations (onSnapshot). |
| **ResultatsAgencePage.tsx** | `remainingSeats = (ti.seatCapacity ?? 0) - (ti.reservedSeats ?? 0)` | **tripInstances** uniquement (listTripInstancesByRouteAndDate). |
| **utils/seats.ts** | `remainingSeats: Math.max(0, total - used)` (générique) | Utilisé ailleurs si besoin ; pas dans les 3 pages principales ci-dessus. |

Résumé : **deux formules** en production pour les mêmes créneaux possibles :
- **Capacité − somme des seatsGo (réservations)** : ReservationClientPage, AgenceGuichetPage.
- **tripInstance.seatCapacity − tripInstance.reservedSeats** : ResultatsAgencePage.

---

## 3. Où le système calcule « places = capacité − réservations »

- **ReservationClientPage.tsx** (lignes ~306–311) :  
  `reserved = reservations.filter(r => trajetId match && statut confirme/paye).reduce(seatsGo)`  
  `remaining = total - reserved`

- **AgenceGuichetPage.tsx** (fonction **computeRemainingSeats**, lignes 91–96) :  
  `reserved = reservations.filter(r => r.trajetId === trajetId && statut paye/confirme).reduce(seatsGo)`  
  `return Math.max(0, totalSeats - reserved)`  
  Utilisée dans searchTrips, loadRemainingForDate, onSnapshot (recalcul des remainingSeats sur les trips).

Aucun de ces deux endroits n’utilise `tripInstance.reservedSeats`.

---

## 4. Où le système utilise tripInstance.reservedSeats

- **ResultatsAgencePage.tsx** :  
  - Filtre : `(ti.seatCapacity ?? 0) - (ti.reservedSeats ?? 0) > 0`  
  - Affichage : `remainingSeats: (ti.seatCapacity ?? 0) - (ti.reservedSeats ?? 0)`

- **tripInstanceService.ts** :  
  - **incrementReservedSeats** : met à jour `reservedSeats` (et passengerCount) à la création de résa.  
  - **decrementReservedSeats** : existe mais **n’est appelé nulle part** en cas d’annulation de réservation.

- **ReservationClientPage.tsx** : appelle **incrementReservedSeats** après création de la réservation (ligne 526). Ne **lit** pas reservedSeats pour l’affichage de la liste (la liste vient de weeklyTrips + reservations).

---

## 5. Vérification : création de réservation et mise à jour de tripInstance.reservedSeats

| Canal | Création réservation | tripInstanceId sur la résa | incrementReservedSeats appelé ? |
|-------|------------------------|-----------------------------|----------------------------------|
| **En ligne (ReservationClientPage)** | addDoc(reservations) + updateDoc(publicToken) | Oui (getOrCreateTripInstanceForSlot puis stocké) | **Oui** (après addDoc, avec tripInstanceId et seats). |
| **Guichet (AgenceGuichetPage)** | createGuichetReservation | **Non** : trajetId = `weeklyTripId_date_heure`, tripInstanceId non passé. | **Non**. createGuichetReservation ne appelle pas incrementReservedSeats. |

Conséquence : les ventes **guichet** n’incrémentent jamais `tripInstance.reservedSeats`. Seules les réservations **en ligne** (ReservationClientPage) le font. Donc pour un même créneau, ResultatsAgencePage (qui lit tripInstances) peut afficher plus de places que la réalité si des ventes guichet ont eu lieu.

---

## 6. Vérification : weeklyTrips utilisés uniquement pour générer les tripInstances ?

**Non.** Aujourd’hui weeklyTrips sont utilisés aussi pour :

- **Construire la liste des créneaux** et **calculer les places restantes** dans ReservationClientPage et AgenceGuichetPage (sans passer par tripInstances).
- Affichage opérations / dashboard (ManagerOperationsPage, ManagerCockpitPage, BoardingDashboardPage, AgenceEmbarquementPage, etc.), sans obligation d’utiliser tripInstances pour les places.

Donc weeklyTrips servent à la fois de **template** (génération tripInstances dans ResultatsAgencePage) et de **source directe** pour créneaux + places dans deux autres pages, d’où le double moteur.

---

## 7. Architecture actuelle (schéma)

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    ARCHITECTURE ACTUELLE                     │
                    └─────────────────────────────────────────────────────────────┘

  weeklyTrips (template)
       │
       │  ResultatsAgencePage : getOrCreateTripInstanceForSlot (lazy)
       │  AgenceTrajetsPage   : CRUD templates
       ▼
  tripInstances (trajet réel)
       │
       │  • ResultatsAgencePage  → liste + remainingSeats = seatCapacity - reservedSeats  ✓
       │  • ReservationClientPage → incrementReservedSeats à la création (en ligne)        ✓
       │  • AgenceGuichetPage     → N'utilise PAS tripInstances pour liste ni pour update  ✗
       │  • Annulation résa       → decrementReservedSeats jamais appelé                 ✗
       ▼
  reservations
       │  trajetId ( = weeklyTripId_date_heure ou tripInstanceId )
       │  tripInstanceId (optionnel, surtout en ligne)
       │
       │  ReservationClientPage : calcule remaining = capacity - sum(reservations)  → double moteur
       │  AgenceGuichetPage     : computeRemainingSeats(id, reservations)           → double moteur
       └────────────────────────────────────────────────────────────────────────────
```

---

## 8. Problèmes détectés

1. **Double moteur pour les places**  
   - ReservationClientPage et AgenceGuichetPage : places = capacité − agrégat réservations (par trajetId).  
   - ResultatsAgencePage : places = tripInstance.seatCapacity − tripInstance.reservedSeats.  
   → Risque d’écarts (délais, annulations, guichet vs en ligne).

2. **Guichet n’écrit pas dans tripInstances**  
   - createGuichetReservation ne reçoit pas tripInstanceId et n’appelle pas incrementReservedSeats.  
   → Les ventes guichet ne mettent pas à jour la source de vérité tripInstance.

3. **Annulation sans mise à jour tripInstance**  
   - decrementReservedSeats n’est appelé nulle part.  
   → En cas d’annulation, reservedSeats reste inchangé, les places ne se libèrent pas côté tripInstance.

4. **Liste des créneaux non alignée sur tripInstances**  
   - ReservationClientPage : liste construite à partir de weeklyTrips + reservations, pas à partir de tripInstances.  
   → Même si on incrémente reservedSeats à la création, l’affichage initial et le recalcul ne passent pas par la même source.

5. **Identifiant de créneau incohérent**  
   - Guichet et ReservationClientPage utilisent `trajetId = weeklyTripId_date_heure` (string composite).  
   - tripInstances ont un id Firestore (document id).  
   - ReservationClientPage fait getOrCreateTripInstanceForSlot quand `id.includes('_')` et utilise ensuite l’id du document. Pour la liste, l’id restant est le composite.  
   → Mélange de deux références (trajetId vs tripInstanceId) selon les écrans.

---

## 9. Architecture cible recommandée

```
  weeklyTrips (template uniquement)
       │  • Définition : liaison départ → arrivée, horaires par jour, prix, capacité.
       │  • Utilisation : génération / synchronisation des tripInstances (batch ou lazy).
       │  • Ne plus utiliser pour : affichage des créneaux ni calcul des places.
       ▼
  tripInstances (source de vérité trajet réel)
       │  • Un document = un créneau (date, heure, départ, arrivée, agencyId).
       │  • seatCapacity, reservedSeats (et passengerCount) = source de vérité pour les places.
       │  • remainingSeats = seatCapacity - reservedSeats (toujours dérivé de ces champs).
       │  • Toute création de réservation (en ligne ou guichet) doit :
       │    - être liée à un tripInstanceId ;
       │    - appeler incrementReservedSeats après écriture réservation ;
       │  • Toute annulation (ou refus) doit appeler decrementReservedSeats.
       ▼
  reservations
       │  • Champs obligatoires : tripInstanceId (référence au trajet réel).
       │  • trajetId peut rester en legacy (affichage / compat) mais la logique métier s’appuie sur tripInstanceId.
       └────────────────────────────────────────────────────────────────────────────
```

Règle unique : **toutes** les pages qui affichent des créneaux et des places restantes doivent :
- lister les **tripInstances** (éventuellement créés à la volée à partir des weeklyTrips pour les créneaux à venir) ;
- afficher **remainingSeats = tripInstance.seatCapacity - tripInstance.reservedSeats** ;
- à la création de réservation : **incrementReservedSeats** ;
- à l’annulation (ou refus) : **decrementReservedSeats**.

---

## 10. Plan de migration (résumé)

### 10.1 ReservationClientPage

- **Objectif** : n’afficher que des créneaux issus de **tripInstances**, places = seatCapacity - reservedSeats.
- **Actions** :  
  - Pour (slug, departure, arrival, date) : au lieu de charger weeklyTrips + reservations et construire allTrips en mémoire, utiliser **listTripInstancesByRouteAndDate** (avec création lazy depuis weeklyTrips si vide, comme ResultatsAgencePage).  
  - Afficher uniquement les tripInstances avec `(seatCapacity - reservedSeats) > 0` et status !== 'cancelled'.  
  - Conserver getOrCreateTripInstanceForSlot + incrementReservedSeats à la création de réservation ; s’assurer que la réservation stocke bien le tripInstanceId (déjà le cas).  
  - Supprimer le calcul `remaining = capacity - sum(reservations)` pour l’affichage.

### 10.2 ResultatsAgencePage

- Déjà aligné sur tripInstances pour la liste et les places.
- À maintenir : création lazy de tripInstances à partir de weeklyTrips quand il n’y a aucun instance pour la date.
- Aucun changement majeur côté affichage ; vérifier que les filtres (status, remainingSeats > 0) restent cohérents.

### 10.3 AgenceGuichetPage

- **Objectif** : utiliser **tripInstances** pour la liste des créneaux et les places restantes ; mettre à jour reservedSeats à chaque vente.
- **Actions** :  
  - Remplacer la logique actuelle (weeklyTrips + searchTrips + computeRemainingSeats) par une requête sur **tripInstances** pour l’agence (et éventuellement ville départ/arrivée), avec filtre date/heure (au moins 8 jours comme aujourd’hui). Pour les créneaux non encore créés : soit **getOrCreateTripInstanceForSlot** au choix du créneau (comme ReservationClientPage), soit job/batch qui crée les instances à l’avance à partir des weeklyTrips.  
  - Afficher remainingSeats = tripInstance.seatCapacity - tripInstance.reservedSeats.  
  - À la vente : passer **tripInstanceId** (id Firestore du tripInstance) à createGuichetReservation et **appeler incrementReservedSeats(companyId, tripInstanceId, seats)** après création de la réservation (dans le service ou dans la page).  
  - Supprimer computeRemainingSeats et la dépendance à l’agrégat des reservations pour les places.

### 10.4 guichetReservationService

- **Actions** :  
  - Exiger ou fortement recommander **tripInstanceId** dans CreateGuichetReservationParams.  
  - Après écriture de la réservation (dans la transaction ou juste après), appeler **incrementReservedSeats(companyId, tripInstanceId, seats)**.  
  - Documenter que toute annulation de réservation doit appeler **decrementReservedSeats** (à faire côté appelant ou dans un service central d’annulation).

### 10.5 Annulation / refus de réservation

- **Actions** :  
  - Identifier tous les chemins où une réservation passe en statut annulé / refusé (UI + éventuelles Cloud Functions).  
  - Pour chaque chemin : si la réservation a un `tripInstanceId` et des `seatsGo` (et seatsReturn si pertinent), appeler **decrementReservedSeats(companyId, tripInstanceId, seats)**.

### 10.6 weeklyTrips : usage restreint

- **Conserver** : AgenceTrajetsPage (CRUD templates), ResultatsAgencePage et ReservationClientPage (création lazy de tripInstances à partir de weeklyTrips), FleetAssignmentPage / vehiclesService / autres usages « métadonnées » ou affectation.
- **Ne plus utiliser** pour :  
  - Construction de la liste des créneaux affichés à l’utilisateur dans ReservationClientPage et AgenceGuichetPage ;  
  - Calcul des places restantes (à remplacer par tripInstance.seatCapacity - reservedSeats partout).

---

## 11. Liste des fichiers à modifier (synthèse)

| Fichier | Modification |
|---------|--------------|
| **ReservationClientPage.tsx** | Remplacer la construction de la liste (weeklyTrips + reservations) par listTripInstancesByRouteAndDate + création lazy si vide. Afficher remainingSeats = seatCapacity - reservedSeats. Garder incrementReservedSeats à la création. |
| **AgenceGuichetPage.tsx** | Remplacer searchTrips / loadRemainingForDate (weeklyTrips + computeRemainingSeats) par chargement de créneaux basé sur tripInstances (avec getOrCreateTripInstanceForSlot si besoin). Passer tripInstanceId à createGuichetReservation et appeler incrementReservedSeats après création. Supprimer computeRemainingSeats pour l’affichage des places. |
| **guichetReservationService.ts** | Rendre tripInstanceId requis (ou fortement recommandé) pour les ventes avec sièges. Après création réservation, appeler incrementReservedSeats(companyId, tripInstanceId, seats). |
| **Annulation / refus** | Créer ou étendre un service (ou des appels ciblés) pour appeler decrementReservedSeats lorsque une réservation est annulée ou refusée (avec tripInstanceId et seats). |
| **ResultatsAgencePage.tsx** | Aucun changement structurel majeur ; déjà basé sur tripInstances. Vérifier cohérence des statuts et du filtre remainingSeats. |
| **tripInstanceService.ts** | Aucun changement nécessaire pour l’API ; s’assurer que listTripInstancesByRouteAndDate couvre les besoins (agence, date, route). Si besoin, ajouter une fonction listTripInstancesByAgencyAndDate pour le guichet. |
| **Autres (ManagerOperationsPage, BoardingDashboardPage, AgenceEmbarquementPage, etc.)** | À traiter en phase 2 si ces écrans affichent des « places restantes » ; les faire dériver de tripInstances plutôt que de weeklyTrips + reservations. |

---

## 12. Compatibilité réseau routes / escales / segments

En faisant de **tripInstances** la seule source de vérité pour les sièges :

- Chaque tripInstance représente déjà un **créneau réel** (date, heure, route A→B, capacité, réservé).  
- Une évolution vers **routes à escales** et **segments** pourra :  
  - soit garder un tripInstance par « trajet long » avec reservedSeats global (puis introduire un découpage par segment si besoin) ;  
  - soit faire évoluer le schéma tripInstance (ex. reservedSeats par segment, ou lien vers des segments).  
Dans les deux cas, la base « un document = un exécution de trajet avec capacité et réservé » reste adaptée ; les weeklyTrips (ou futurs « route schedules ») restent des **templates** pour générer ces instances.

---

*Rapport d’audit — double moteur weeklyTrips / tripInstances. Dernière mise à jour : mars 2025.*
