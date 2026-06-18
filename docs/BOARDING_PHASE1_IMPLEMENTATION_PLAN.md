# BOARDING_PHASE1_IMPLEMENTATION_PLAN — Refondre l’espace Chef d’embarquement (Phase 1)

> Plan **d’implémentation UI only** (sans modification code), basé sur :
> - `docs/BOARDING_AUDIT.md`
> - `docs/BOARDING_PRODUCT_SIMPLIFICATION.md`
>
> Contraintes :
> - **Ne modifier aucun code**
> - **Ne modifier aucune règle Firestore**
> - Audit + plan uniquement.

---

## 0) Objectif Phase 1 (cible produit)
Refondre l’espace chef d’embarquement autour du flux minimal :
1. Départs du jour
2. Liste passagers
3. Scan QR
4. Embarqué / absent / reporté
5. Impression liste
6. Confirmer départ
7. Confirmer arrivée
8. Historique

### Contraintes produit à respecter (explicitement)
- Ne pas exposer flotte/garage/logistique avancée.
- Ne pas obliger l’affectation véhicule.
- Ne pas obliger chauffeur/convoyeur.
- Plaque véhicule et chauffeur : champs texte optionnels.
- Chef doit pouvoir travailler même sans `tripAssignment` “complexe”.
- Liste passagers doit venir des **réservations vendues guichet + en ligne**.
- Regroupement par **trajet / date / heure**.
- Desktop/tablette : liste + impression.
- Mobile : scan QR prioritaire.

---

## 1) Hypothèse de modélisation “front” (view-model minimal)
Objectif : construire un “manifeste” UI minimal à partir de données existantes (Firestore), **sans** changer les données.

### Manifeste (UI)
- `journeyKey` = { tripId, date, heure } (au minimum : départ/arrivée/heure/date depuis sélection)
- `passagers[]` provenant de `reservations` (statuts embarquables)
- `totaux` : embarqués / absents / total
- `etatEmbarquement` : pending / boarding / cloturé (derivé)
- `champs optionnels` :
  - `vehiclePlateText?`
  - `driverNameText?`
  - `convoyeurNameText?`

---

## 2) Fichiers à modifier (UI) — mais **sans exécuter ici**
Phase 1 vise à réduire le “monolithe” actuel `AgenceEmbarquementPage` en composants UI + orchestration simple.

### Modifier (probable)
- `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx`
  - Découper l’UI en sous-composants :
    - Header & sélection créneau
    - Composant manifeste (liste/table)
    - Composant scan mobile (camera + input code)
    - Composant actions (mark all, impression, confirm departure/arrival)
    - Zone impression

- `src/modules/agence/boarding/BoardingDashboardPage.tsx`
  - Ajuster l’affichage “Départs du jour” pour coller au regroupement métier : trajet/date/heure.
  - Conserver la source `tripAssignments`, mais simplifier la surface UI (moins d’infos, plus de clarté).

- `src/modules/agence/boarding/BoardingScanPage.tsx`
  - Garder les préconditions (capacité/lock best-effort) en arrière-plan.
  - Simplifier les paramètres passés si besoin côté UI (ex: ne rendre optionnelles que les champs texte).

### Modifier (optionnel)
- `src/modules/agence/boarding/BoardingLayout.tsx`
  - Ajuster libellés/ordre des sections :
    - “Départs du jour”
    - “Liste & scan”
    - éventuellement “Live” masqué en Phase 1.

---

## 3) Fichiers à ne pas toucher
- Tout **code métier/Firestore** :
  - `src/modules/agence/planning/tripAssignmentService.ts`
  - `src/modules/agence/aggregates/boardingStats.ts`
  - `src/modules/agence/aggregates/agencyLiveState.ts`
  - `src/modules/agence/embarquement/boardingQueue.ts`
  - `src/modules/agence/embarquement/boardingSlotSnapshot.ts`
  - `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` (structure modifiée, mais les appels services doivent rester)

- `docs/*` déjà produits (sauf création du nouveau plan).

- Aucune règle Firestore : `firestore.rules`.

---

## 4) Composants à créer (UI uniquement)
### 4.1 `BoardingPhase1TripPicker`
- Rôle : sélectionner “trajet + date + heure”.
- Source : ce que fournit déjà l’UI de `AgenceEmbarquementPage` via `departureRows`.
- Sur mobile : compact en haut.

### 4.2 `BoardingPhase1PassengerList`
- Rôle : liste passagers + totaux.
- Utiliser l’existant `reservations` déjà chargé.
- Afficher colonnes minimales :
  - Nom
  - Téléphone (optionnel)
  - Référence
  - Places
  - Etat (Embarqué/Absent)

### 4.3 `BoardingPhase1ScanPanel`
- Rôle : scan QR prioritaire mobile.
- Utiliser le scanner zxing existant (caméra + input code billet).

### 4.4 `BoardingPhase1HeaderMeta`
- Rôle : afficher champs optionnels : plaque, chauffeur.
- Ne pas obliger : si absent, afficher “—”.

### 4.5 `BoardingPhase1PrintActions`
- Rôle : bouton impression + déclenchement `window.print()`.
- N’afficher que sur desktop/tablette.

### 4.6 `BoardingPhase1DepartureActions`
- Rôle : bouton “Confirmer départ” + (Phase 1) “Confirmer arrivée”
- Dans le périmètre actuel, arrivée est indirecte :
  - en Phase 1, afficher un état/CTA qui reflète ce qui existe (ou une étape “Terminé” si déjà déclenché par clôture/départ).

### 4.7 `BoardingPhase1HistoryPanel`
- Rôle : afficher un résumé historique de la session.
- En Phase 1, peut se baser sur `boardingLogs` si déjà récupérable dans le composant courant ; sinon, afficher “en arrière-plan” et un lien “voir détails”.

---

## 5) Données Firestore à réutiliser (sans changer)
### 5.1 Sélection départs du jour
- `tripAssignments` + `weeklyTrips`
- Recommandation UI : afficher seulement trajet/date/heure + statut (planned/validated).

### 5.2 Liste passagers
- `reservations` via collection `companies/{companyId}/agences/{agencyId}/reservations`
- Filtres :
  - date/depart/arrivee/heure
  - statut embarquable (+ validé)

### 5.3 Embarqué/Absent/Reporté
- Mise à jour de `reservations` déjà gérée par `updateStatut` (boardingStatus/statutEmbarquement/statut/checkInTime)
- Clôture : `boardingClosures` + batch reprogramming.

### 5.4 Impression
- Réutiliser l’état UI actuel (reservations + totaux + champs optionnels)
- Ne pas ajouter de dépendance Firestore supplémentaire.

### 5.5 Historique
- `boardingLogs` (et/ou agent history si disponible)

---

## 6) Logique à garder en arrière-plan (backend/Firestore déjà en place)
- Capacité véhicule : `boardingStats` + check capacity dans `updateStatut`.
- Idempotence anti double scan : `boardingEmbarkDedup`.
- Clôture idempotente : `boardingClosures`.
- Transition véhicule : `fleetVehicles` + `fleetMovements`.
- Progrès trip (arrival) : `tripInstances` / `tripProgressService`.

### Objectif UI :
- Ne jamais exposer ces détails.
- Ne présenter que les états nécessaires au métier.

---

## 7) Logique à masquer de l’interface
À masquer pendant Phase 1 :
- Affichage “assignmentStatus” trop technique (garder un label simple).
- Toute logique fleet/garage/logistique avancée.
- Détails driver/convoyeur obligatoires : rendre optionnels.
- “tripExecution” / “tripInstanceIdForSlot” : aucun champ UI.

---

## 8) Risques Phase 1
1. **Dépendance tripAssignment** :
   - Le flux actuel requiert un `assignmentId` pour scanner/verrouiller.
   - Phase 1 demande “même sans tripAssignment complexe” :
     - risque = scan bloque si assignment introuvable.
   - Mitigation produit : accepter “assignment minimal” ou fallback de sélection (si possible côté UI) ; sinon, documenter une exigence de Phase 2.

2. **Arrivée “confirm”** :
   - Arrival n’est pas un bouton actuellement ; risque = promesse produit sans équivalent technique exact.
   - Mitigation : afficher “Arrivée confirmée” seulement quand le système marque l’état correspondant.

3. **Historique** :
   - Le panneau historique pourrait nécessiter lecture boardingLogs ; risque = latence/charges.
   - Mitigation : chargement à la demande (lazy) ou affichage minimal.

4. **Offline** :
   - Si offline conservé, UI doit rester cohérente (queue) ; sinon risque de mismatch.

---

## 9) Ordre de modification recommandé (UI)
> Même si aucun code ne sera modifié ici, l’ordre ci-dessous est la séquence d’exécution recommandée.

### Étape 1 — “Manifeste UI minimal”
- Refactor UI interne de `AgenceEmbarquementPage` pour séparer :
  - `PassengerList` et `ScanPanel`.
- Priorité mobile : `ScanPanel`.

### Étape 2 — “Départs du jour” alignés sur regroupement trajet/date/heure
- Ajuster `BoardingDashboardPage` pour être plus “métier” :
  - bouton minimal, texte clair.

### Étape 3 — “Embarqué / absent / reporté” visible
- Uniformiser l’affichage des statuts :
  - Embarqué = boarded
  - Absent = no_show
  - Reporté = apparaîtra après clôture (si déjà présent)

### Étape 4 — Impression liste
- Consolider la zone `#print-area` uniquement avec les champs autorisés (optionnels).
- S’assurer que desktop/tablette a un bouton visible.

### Étape 5 — Confirmation départ / arrivée
- Garder le bouton “Confirmer départ”.
- Ajouter une UI “Confirmer arrivée” seulement si état fiable existe (sinon afficher état). 

### Étape 6 — Historique minimal
- Ajouter un panneau résumé.
- Charger boardingLogs à la demande.

---

## 10) Livrables attendus (sans code ici)
- `docs/BOARDING_PHASE1_IMPLEMENTATION_PLAN.md` (ce document)
- Un checklist d’UI :
  - Desktop : liste + impression
  - Mobile : scan QR prioritaire
  - Statuts : embarqué / absent / reporté
  - Confirmation : départ
  - Arrivée : état/CTA
  - Historique : minimal

---

## 11) Note de conformité
Ce plan respecte :
- aucun changement de code
- aucun changement de règles Firestore
- uniquement cadrage d’implémentation UI Phase 1.

