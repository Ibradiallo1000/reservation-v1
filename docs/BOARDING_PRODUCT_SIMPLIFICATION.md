# BOARDING_PRODUCT_SIMPLIFICATION — Embarquement (phase produit)

> Audit **produit** à partir de `docs/BOARDING_AUDIT.md`.
> Périmètre : strict **/agence/boarding** + `/agence/boarding/scan|live` + `src/modules/agence/*` + `src/modules/agence/embarquement/*`.
> Pas d’Escale.
> **Aucune modification de code.**

---

## 1) Définition : indispensable métier vs complexité technique héritée

Pour chaque fonctionnalité listée dans `BOARDING_AUDIT.md` :
- **Obligatoire** = essentiel au métier (transport) aujourd’hui, visible au besoin.
- **Utile** = apporte de la robustesse/qualité, peut rester visible ou passer en arrière-plan.
- **Optionnelle** = peut être simplifiée ou externalisée sans bloquer le flux.
- **Complexité inutile actuelle** = effort technique élevé sans valeur métier claire (ou non nécessaire à la réussite du parcours utilisateur).

### 1.1 Départs du jour
- **Obligatoire** : sélectionner un départ créneau/vehicule.
- **Utile** : filtrer par date, afficher statut **planned/validated**.
- **Optionnelle** : calculs enrichis (plaque via véhicules, détails driver/convoyeur).
- **Complexité inutile actuelle** : génération “plate” et agrégation multi-agences côté UI (peut être rendue passive/derivée).

**Raison** : le métier doit pouvoir choisir “quel départ je traite” rapidement.

### 1.2 Liste passagers
- **Obligatoire** : voir les passagers du créneau et leur état embarquement.
- **Utile** : recherche/tri, bascule visuelle “Embarqué / Absent”.
- **Optionnelle** : désactivation du listener pendant scan (perf), si le volume est faible.
- **Complexité inutile actuelle** : maintien de multiples sources d’état (filter recherche, compat legacy `statutEmbarquement`, et `boardingStatus` effectif) si la donnée métier n’a qu’une seule source de vérité.

### 1.3 Scan QR
- **Obligatoire** : accélérer la validation d’embarquement.
- **Utile** : feedback immédiat (overlay + beep + vibration).
- **Optionnelle** : offline queue (si le site a une connectivité stable).
- **Complexité inutile actuelle** :
  - logique de dédup scan (même réservation / même code) **et** dédup “Firestore” + locks : trop de couches si l’on accepte un risque résiduel.
  - dépendances à des mécanismes “overtravel escale” (non dans notre périmètre produit strict, mais historiquement présent).

### 1.4 Embarqué / absent / reporté
- **Obligatoire** :
  - Marquer un passager **embarqué** ou **absent**.
  - Réaliser “reporté” via reprogrammation à la clôture.
- **Utile** : capacité & contrôle anti-sur-occupation.
- **Optionnelle** : “reprogrammedOnce” et idempotence avancée côté batch, si l’opérateur n’a pas de duplications de clôture.
- **Complexité inutile actuelle** :
  - mécanismes de lock “boarding session” multi-appareils + hotfix lock désactivé (surcoût mental/robustesse incohérente) ; mieux vaut un modèle unique.

### 1.5 Impression liste
- **Obligatoire** : imprimer la liste officielle (signature/contrôle).
- **Utile** : champ chauffeur/convoyeur/véhicule.
- **Optionnelle** : personnalisation fine du rendu (CSS imprimable).
- **Complexité inutile actuelle** : dépendances indirectes au calcul complet des totaux + enrichissements ; l’impression pourrait consommer un “manifeste” consolidé serveur/arrière-plan.

### 1.6 Confirmation départ
- **Obligatoire** : lancer le trajet uniquement si le minimum “borded seats” est atteint.
- **Utile** : contrôle rôle “chef d’agence” et blocage si scan en cours.
- **Optionnelle** : condition hard sur `tripStatutMetier` (si ce statut métier est déjà géré autrement).
- **Complexité inutile actuelle** : dépendance à la résolution `tripInstanceIdForSlot` (nominalement nécessaire, mais peut être dérivée autrement).

### 1.7 Confirmation arrivée
- **Actuel** : “arrival” n’est pas un bouton direct ; la partie “arrivée” est indirecte via états trip/auto-départ + progressions.
- **Obligatoire (au sens produit)** : doit exister une étape métier visible ou au moins un statut/trace claire “arrivée confirmée / progression faite”.
- **Utile** : verrouiller l’enchaînement (embarquement → arrivée → historique).
- **Complexité inutile actuelle** : exposition insuffisante côté produit de ce qui correspond à “confirmation arrivée”.

> Dans le périmètre strict audit, la confirmation “arrivée” dépend d’un enchaînement tripInstance / tripProgress / ensureAutoDepartIfNeeded / markTripExecution… (non entièrement audité ici).

### 1.8 Historique
- **Obligatoire** : trace “qui a scanné / qui a clôturé / résultats”.
- **Utile** : centraliser et agréger (par passager et par départ).
- **Optionnelle** : double logging (boardingLogs + agentHistoryEvent) si c’est redondant.
- **Complexité inutile actuelle** : divergence potentielle entre “boardingLogs” et “agentHistoryEvent” (non confirmé dans l’audit).

---

## 2) Analyse ciblée des composants techniques (ce qui pèse)

### 2.1 `tripAssignments`
- **Rôle métier** : le créneau opérateur (véhicule/assignment) sur lequel se fait l’embarquement.
- **Obligatoire** : oui (clé métier principale).
- **Complexité actuelle** : beaucoup d’informations d’interface (statuts, liveStatus, capacité attendue) mélangées dans un flux UI.
- **Suggestion produit** :
  - consommer `tripAssignments` comme **source unique de créneau**
  - exposer à l’UI un “view-model manifeste” : `assignmentId, tripId, vehicleId, expectedCount, status`.

### 2.2 `boardingLocks`
- **Rôle technique** : multi-appareil session active.
- **Obligatoire** : pas vraiment pour le métier si l’on n’a pas de multi-scan simultané requis.
- **Complexité inutile actuelle** :
  - lock désactivé temporairement (`BOARDING_LOCKS_DISABLED = true`) : donc le mécanisme est partiellement “faux” en prod.
- **Cible minimale** :
  - remplacer par un mécanisme unique : soit supprimer l’UI lock multi-appareil, soit le réduire à un verrou simple “clôture” (boardingClosures).

### 2.3 `boardingClosures`
- **Rôle métier** : idempotence de clôture.
- **Obligatoire** : oui (evite double clôture, garantit cohérence).
- **Complexité actuelle** : dépend de `tripKey` et d’un tripInstance de résolution.
- **Cible minimale** : garder en arrière-plan, ne pas surcharger l’UI.

### 2.4 `fleetVehicles`
- **Rôle métier** : transition véhicule vers en transit.
- **Obligatoire** : oui.
- **Complexité actuelle** : orchestration au moment de clôture.
- **Cible minimale** : exécuter au backend / transaction gérée derrière un bouton “Confirmer départ”.

### 2.5 `fleetMovements`
- **Rôle** : trace mouvement véhicule.
- **Obligatoire** : utile (audit), pas indispensable pour l’opération immédiate.
- **Cible minimale** : arrière-plan après transition `fleetVehicles`.

### 2.6 `tripExecution`
- **Rôle métier** : gérer progression trip/arrival.
- **Obligatoire** : peut être “technique nécessaire” mais à l’UI il ne faut pas voir sa complexité.
- **Complexité inutile actuelle** : trop de dépendances indirectes depuis l’embarquement (résolution tripInstance, ensure…).
- **Cible** : l’UI expose seulement “Confirmer départ / Confirmer arrivée”. Le backend dérive la progression tripExecution.

### 2.7 `boardingStats`
- **Rôle métier** : stats embarqués/absents et contrôle de cohérence.
- **Obligatoire** : si on s’en sert pour les chiffres d’interface et contrôles.
- **Complexité inutile actuelle** : double logique de “nombre embarqués” (computed local vs agrégat).
- **Cible** : une seule source vérité pour les totaux affichés.

### 2.8 `boardingLogs`
- **Rôle métier** : historique.
- **Obligatoire** : oui (audit).
- **Complexité inutile actuelle** : possible redondance avec “agentHistoryEvent”

### 2.9 Offline queue
- **Rôle métier** : continuité en cas de réseau.
- **Obligatoire** : optionnel selon contexte terrain.
- **Complexité actuelle** : double modèle (local snapshot + queue) et replay.
- **Cible** :
  - conserver si l’objectif est “zéro perte scan”.
  - sinon réduire à un buffer simple (local uniquement) sans replay complexe.

### 2.10 Scan QR
- **Obligatoire** : oui.
- **Complexité inutile actuelle** : dédup multi-couches.
- **Cible** : dédup minimale (idempotence transactionnelle) ; garder un seul mécanisme de dédup.

### 2.11 Impression liste
- **Obligatoire** : oui.
- **Cible** : impression consomme un “manifeste consolidé” (assignment + reservations + stats) généré en arrière-plan.

---

## 3) Flux cible minimal (proposition)

### 1. Départ du jour (UI)
- Afficher créneaux `tripAssignments` (planned/validated) pour la date.
- Quand l’opérateur choisit un créneau :
  - charger un **manifeste** consolidé (données nécessaires) en arrière-plan.

**Visible** : sélection départ.

**Back-end** (invisible) : résolution vehicle/expectedCount, droits rôles, etc.

### 2. Liste passagers (UI)
- Afficher les passagers du créneau avec état :
  - **Embarqué** / **Absent** / **Reporté (après clôture)**.
- Recherche simple.

**Visible** : liste + totaux (embarqué/absent).

### 3. Scan QR (UI)
- Scanner : déclenche une action “Mark embarqué” (idempotente).
- En cas offline (optionnel) : buffer local simple puis synchroniser.

**Visible** : feedback immédiat.

### 4. Embarqué / absent / reporté (UI)
- Action par passager : embarqué/absent.
- Reporté : uniquement après **Clôture**.

**Back-end** :
- capacité check (si requis)
- idempotence scan

### 5. Impression liste (UI)
- Bouton “Imprimer” (chef agence uniquement).
- L’impression se base sur l’état courant (embarqué/absent).

**Visible** : bouton.

### 6. Confirmation départ (UI)
- Bouton “Confirmer départ véhicule” (chef agence).
- Préconditions métier :
  - au moins N embarqués (ici >= 1)
  - éviter clôture en cours

**Back-end** : transition véhicule (fleetVehicles) + création/validation tripExecution.

### 7. Confirmation arrivée (UI)
- Exiger une étape produit claire :
  - soit un bouton “Confirmer arrivée”
  - soit une validation automatique avec statut visible (ex: “arrivée confirmée”)

**Back-end** : avancer tripExecution/progress.

### 8. Historique (UI)
- Vue historique minimal :
  - scan par passager
  - clôture + absents
  - départ véhicule + arrivée (si applicable)

**Back-end** : `boardingLogs` (et éventuellement agentHistoryEvent si non redondant).

---

## 4) Décisions de simplification : supprimer / garder arrière-plan / garder visible

### Ce qui peut être supprimé du parcours utilisateur
- Détails techniques :
  - `tripExecutionId` / `tripInstanceIdForSlot` (ne doivent pas être visibles)
  - `boardingSessionLock` multi-appareil (s’il n’est pas fiable ou pas nécessaire)
- Écrans “live ops” détaillés (dans ce flux minimal) : passer en arrière-plan.

### Ce qui doit rester uniquement en arrière-plan
- `boardingLocks` si non fiable (ou si conservé : non exposé).
- `boardingStats` : utilisé pour cohérence et totals, pas pour interaction.
- `boardingEmbarkDedup` : idempotence anti double scan, invisible.
- `fleetMovements` : trace.
- `offline queue` : si gardée, invisible.

### Ce qui doit rester visible dans l’interface
- Sélection départ.
- Liste passagers + statut embarqué/absent.
- Scan QR + feedback immédiat.
- Totaux (embarqué/absent).
- Impression.
- Confirmation départ.
- Confirmation arrivée (ou statut visible).
- Historique minimal (ou au minimum lien “voir détails”).

---

## 5) Tableau final par item (récap)

| Fonctionnalité | Obligatoire | Utile | Optionnelle | Complexité inutile actuelle |
|---|---|---|---|---|
| Départ du jour | ✓ | ✓ | ✓ | enrichissements multi-étapes UI |
| Liste passagers | ✓ | ✓ | — | multi-source de statut effectif/legacy |
| Scan QR | ✓ | ✓ | ✓ (offline) | dédup multi-couches |
| Emb / absent / report | ✓ | ✓ | — | locks multi-appareil/incohérence |
| Impression liste | ✓ | ✓ | — | dépendances totaux/manuel |
| Confirmation départ | ✓ | ✓ | — | dépendances indirectes tripInstance |
| Confirmation arrivée | ✓ (produit) | ✓ | — | manque de lisibilité côté produit |
| Historique | ✓ | ✓ | — | redondance boardingLogs vs agentHistory |

---

## 6) Flux cible : ce que “minimal” signifie concrètement
- 1 écran pour sélectionner le départ.
- 1 écran unique (manifeste) : liste + scan + bascule embarqué/absent.
- 1 action finale : clôture/confirmation départ (puis arrivée).
- Une trace historique fiable.

Tout le reste : état locks/dédub/stats/fleet tripExecution offline = **arrière-plan**.

