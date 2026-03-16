# Système de progression des trajets (Trip Progress)

Ce document décrit le cycle complet de vie d’un bus dans TELIYA et la logique d’automatisation (arrivée/départ).

---

## 1. Cycle complet

```
Vente (billet)
    ↓
Embarquement (boarding) — agence origine ou escale
    ↓
Départ origine — bouton "Bus parti" ou auto 30 min après clôture
    ↓
Arrivée escale — bouton "Arrivé" ou auto à la première action (boarding/dropoff/scan)
    ↓
Descente passagers (dropoff)
    ↓
Embarquement (escale)
    ↓
Départ escale — bouton "Départ" ou auto 30 min après arrivée
    ↓
… (répété pour chaque escale)
    ↓
Arrivée finale (dernière escale)
    ↓
Descente finale
```

---

## 2. Stockage (Firestore)

### 2.1 Progression bus

**Chemin** : `companies/{companyId}/tripInstances/{tripInstanceId}/progress/{stopOrder}`

- **stopOrder = 1** : agence d’origine. On enregistre uniquement le **départ** (`departureTime`).
- **stopOrder &gt; 1** : escales. On enregistre **arrivée** (`arrivalTime`, `delayMinutes`) puis **départ** (`departureTime`).

Champs principaux :

- `stopOrder`, `city`
- `arrivalTime`, `departureTime` (Timestamp)
- `confirmedBy` (uid ou `"auto"`)
- `delayMinutes` (retard en minutes, optionnel)
- `source` : `"manual"` (action agent) ou `"auto"` (créé automatiquement)

### 2.2 Embarquement unifié (réservations)

Une seule source de vérité : **`boardingStatus`** sur chaque réservation.

- `pending` : pas encore embarqué
- `boarded` : embarqué (et `journeyStatus = "in_transit"`)
- `no_show` : absent

L’agence d’origine et les escales écrivent toutes dans `boardingStatus` (plus de double système avec `statutEmbarquement` seul).

---

## 3. Départ à l’agence d’origine

- **Fonction** : `markOriginDeparture(companyId, tripInstanceId, confirmedBy)`  
  - Si `confirmedBy === null` → enregistrement **auto** (`source: "auto"`).
- **UI** : après clôture de l’embarquement, bouton **"Bus parti"** sur la page Embarquement (agence).  
  - Visible seulement si la liste est clôturée et qu’aucun départ origine n’a encore été enregistré pour ce trajet.

---

## 4. Automatisation

### 4.1 Auto-départ (oubli de clic "Départ")

- **Origine** : si la liste d’embarquement est **clôturée** et qu’**au moins 30 minutes** se sont écoulées depuis la clôture, et qu’aucun départ n’est enregistré en `progress/1`, le système crée automatiquement le départ (à l’ouverture d’une page qui charge ce trajet, ex. page Embarquement).
- **Escales** : si une **arrivée** est enregistrée pour un `stopOrder` et qu’**au moins 30 minutes** se sont écoulées sans enregistrement de **départ**, le système crée automatiquement le départ pour ce stop (au chargement du tableau de bord escale par exemple).

Fonctions concernées : `ensureAutoDepartIfNeeded` (origine), `ensureAutoDepartForStopIfNeeded` (escale).

### 4.2 Auto-arrivée (oubli de clic "Arrivé")

Avant toute action **passager** à une escale (embarquement, descente, scan billet), si l’**arrivée** du bus à cette escale n’est pas encore enregistrée, le système la crée automatiquement (`arrivalTime = now`, `source: "auto"`).

- **Embarquement escale** : `boardingService.markBoarded` appelle `ensureProgressArrival(companyId, tripInstanceId, originStopOrder)` avant de mettre à jour la réservation.
- **Descente** : `dropoffService.markDropped` appelle `ensureProgressArrival(companyId, tripInstanceId, destinationStopOrder)` avant de mettre à jour la réservation.
- **Scan à l’escale** : dans `AgenceEmbarquementPage`, avant `updateStatut(..., "embarqué")`, si l’agence est de type escale, appel à `ensureProgressArrival` pour le `stopOrder` de l’escale.

Cela évite les incohérences du type « descente sans arrivée » ou « embarquement sans arrivée ».

---

## 5. Statut bus affiché

Les écrans (ex. tableau de bord escale) peuvent afficher un **statut bus** dérivé de la progression :

- **scheduled** : bus pas encore parti de l’origine (pas de `progress/1` ou `progress/1.departureTime` vide).
- **in_transit** : bus parti de l’origine, pas encore arrivé à l’escale courante (ou pas encore reparti).
- **arrived** : bus arrivé à l’escale courante (arrivée enregistrée, pas de départ).
- **departed** : bus reparti de l’escale courante (départ enregistré).

Calcul : à partir de `getTripProgress(companyId, tripInstanceId)` et du `stopOrder` de l’escale (ou de l’origine).

---

## 6. Sécurité (règles Firestore)

Les **écritures** dans `progress` sont autorisées uniquement pour :

- `chefAgence`
- `escale_manager`
- `escale_agent`
- `admin_platforme`

(avec vérification compagnie / contexte escale selon les règles existantes.)

La **lecture** des documents `progress` reste publique pour permettre l’affichage des statuts et retards.

---

## 7. Fichiers principaux

- **Progression** : `src/modules/compagnie/tripInstances/tripProgressService.ts`  
  - `markArrival`, `markDeparture`, `markOriginDeparture`, `getTripProgress`  
  - `ensureProgressArrival`, `ensureAutoDepartIfNeeded`, `ensureAutoDepartForStopIfNeeded`
- **Embarquement** : `src/modules/compagnie/boarding/boardingService.ts` (utilisation de `ensureProgressArrival` avant `markBoarded`).
- **Descente** : `src/modules/compagnie/dropoff/dropoffService.ts` (utilisation de `ensureProgressArrival` avant `markDropped`).
- **UI agence origine** : `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` (bouton "Bus parti", auto-départ, auto-arrivée au scan escale).
- **UI escale** : `src/modules/agence/escale/pages/EscaleDashboardPage.tsx` (boutons Arrivé/Départ, auto-départ escale, affichage statut bus).

---

## 8. Résumé

- **Un seul champ d’embarquement** : `boardingStatus` (pending / boarded / no_show), utilisé partout (agence origine + escales).
- **Départ origine** : enregistré en `progress/1` via le bouton "Bus parti" ou automatiquement 30 min après clôture.
- **Arrivée escale** : enregistrée manuellement ou **automatiquement** dès qu’une action passager (boarding, dropoff, scan) a lieu à cette escale.
- **Départ escale** : enregistré manuellement ou **automatiquement** 30 min après l’arrivée si l’agent n’a pas cliqué "Départ".
- **Cohérence** : les actions passagers (descente, embarquement) déclenchent une arrivée auto si besoin, ce qui évite les incohérences de suivi.
