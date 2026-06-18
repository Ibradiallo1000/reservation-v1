# BOARDING_FINAL_UI_SPEC (spécification UI finale — audit décisionnel)

> Spécification UI uniquement (Phase 1) : aucun code React / aucune route / aucune règle Firestore.

Références :
- `docs/BOARDING_AUDIT.md`
- `docs/BOARDING_PRODUCT_SIMPLIFICATION.md`
- `docs/BOARDING_PHASE1_IMPLEMENTATION_PLAN.md`
- `docs/BOARDING_DECISION_AUDIT.md`
- `docs/BOARDING_OPERATIONAL_DECISION.md`
- `docs/BOARDING_DEPARTURES_AUDIT.md`

Contraintes Phase 1 validées :
- conserver `tripAssignments` **en arrière-plan** ;
- masquer **totalement** la complexité `tripAssignments` (y compris statuts/ids) ;
- masquer `fleetVehicles`, `fleetMovements`, garage, logistique avancée ;
- conserver : scan QR, impression, capacité, clôture embarquement, confirmation départ.

---

## 1) Menu final recommandé (Chef d’embarquement Phase 1)

### Menu gauche / navigation (ou top nav)
1. **Départs du jour**
2. **Historique**

> Optionnel (dernière étape Phase 1.2) : **Activité live** seulement si l’organisation en a besoin ; sinon hors périmètre UI initial.

---

## 2) Écran principal : “Départs du jour”

### Objectif
Permettre au Chef d’embarquement de :
- sélectionner un départ,
- consulter la liste passagers,
- imprimer si nécessaire,
- démarrer le scan QR.

### Structure par sections (ordre exact)

#### Section 1 — KPI du jour
- KPI 1 : **Nombre de départs** (pour la date)
- KPI 2 : **Total passagers** (somme tickets/places embarquables sur les départs)
- KPI 3 : **Total embarqués** (somme des embarqués effectifs)
- KPI 4 : **Total absents** (somme no_show)

> Les KPI sont dérivés à partir des données déjà utilisées par l’écran actuel : `reservations` (et l’état embarquement effectif) ; `tripAssignments` uniquement pour le périmètre opérationnel.

#### Section 2 — Départs du jour (liste cartes)
Pour chaque départ :
- **Trajet** : `départ → arrivée`
- **Heure** : `HH:mm`
- **Passagers** : nombre de passagers (places) attendu
- **Embarqués** : count effectif
- **Absent** : count no_show
- **Statut visuel (simple)** :
  - “Planifié” (si pas encore commencé)
  - “En cours” (si embarquement en cours)
  - “Terminé / Clôturé” (si clôturé)

Chaque carte contient :
- bouton **“Ouvrir”**

> Tout ce que l’utilisateur voit doit être “métier” : aucune mention de `assignmentId`, `vehicleId`, planned/validated, liveStatus.

#### Section 3 — Alertes / blocages (contextuels)
- Si aucun départ disponible : message vide
- Si scan bloqué : explication courte (ex. “départ non ouvert”, “session expirée”, “dépassement capacité”, “billet introuvable”).

#### Section 4 — Historique récent (résumé)
- Limité à **3 éléments** (par défaut)
- Option : **collapsible** (réduit par défaut, non distractif)
- 3 derniers événements (scan/fermeture)
- format simple :
  - Heure + Trajet + Action (Embarqué / Absent / Clôture)

> Source UI : `boardingLogs` (et/ou un résumé basé sur l’existant). Si le design impose un historique plus détaillé, il passe via l’onglet “Historique”.

---

## 3) Écran “Ouvrir un départ”

### But
Confirmer que l’on passe sur le bon départ et rendre opérationnel le scan/list.

### Informations visibles
- Trajet : `départ → arrivée`
- Date : `dd/MM/yyyy`
- Heure : `HH:mm`
- Capacité : **capacité calculée** (valeur affichée)
- (Optionnel) Compteurs rapides : “Embarqués / Absents”

### Informations cachées (système)
- identifiant d’affectation (`assignmentId`) et statut
- `vehicleId` (non affiché)
- résolution trip slot / matching interne
- mécanismes lock/session offline

### Boutons
- **“Continuer”** : ouvre l’écran opérationnel du départ (liste + scan)
- **“Retour”**

### Actions
- démarre (best-effort) le verrou/session
- charge snapshot/capacité pour offline

---

## 4) Écran “Scan” (opérationnel)

### Objectif
- Scanner rapidement (QR + manuel)
- Voir la liste passagers du départ
- Mettre à jour embarqué/absent/reporté
- Impression
- Clôturer embarquement et confirmer le départ

---

### 4.1 Version mobile (disposition exacte)

#### Header
- Trajet + heure
- bouton discret : **“Imprimer”** (visible seulement si chef agence)
- indicateur de capacité (texte)

#### Mode principal (priorité scan)
- Zone caméra QR (visible quand scan activé)
- bouton : **“SCAN : On/Off”** (priorité scan)

#### Barre d’actions visibles (actions principales)
- champ + bouton : **“Entrer code billet”** (scan manuel)
- résumé :
  - Embarqués : N
  - Absents : N
  - Restant / Capacité atteinte (si utile)

#### Liste passagers (version mobile : courte)
- table compacte :
  - Nom (ou “—”)
  - Réf billet
  - Statut (icône X) : embarqué / absent
- pas de filtres avancés (optionnel : recherche texte simple)

#### Actions embarquement
- boutons (ou icônes en ligne) :
  - Basculer “embarqué”
  - Basculer “absent”

#### Clôture
- bouton principal : **“Clôturer & préparer départ”**
  - après clôture : UI affiche un état “Clôturé”

#### Confirmation départ
- bouton : **“Valider et lancer le trajet”**
- **Conditions préalables visibles avant clic (sinon bouton désactivé)** :
  - départ en **mode scan désactivé** (ou départ prêt/fin scan)
  - **au moins 1 passager “Embarqué”**
  - départ en état requis par le flux (ex. **clôture embarquement faite** si applicable)
- **Message clair si désactivé** : “Terminer scan et s’assurer qu’au moins 1 passager est embarqué.”

> (Si le flux Phase 1 n’impose pas une clôture préalable distincte, l’UI adapte le texte de condition — le principe reste : afficher les prérequis.)

---

### 4.2 Version tablette / desktop (disposition exacte)

#### Header
- Trajet/date/heure
- bouton **Imprimer**
- indicateur “scan actif”

#### Layout en 2 colonnes

**Colonne A (gauche) — Scan & manuel (priorité)**
1. Carte/box caméra (quand scan activé)
2. Scan manuel (input + bouton valider)
3. Feedback overlay : succès/erreur (pendant ~1.2s)
4. Résumé counters : Embarqués / Absents / Capacité

**Colonne B (droite) — Liste passagers + actions**
1. Tableau liste passagers (toutes lignes du départ)
2. Colonnes minimales :
   - #
   - Client
   - Téléphone (ou optionnel)
   - Canal (optionnel)
   - Référence billet
   - Places
   - Embarqué (case)
   - Absent (case)
3. Boutons :
   - “Tout marquer embarqué” (optionnel si supporté et autorisé)

#### Zone impression
- cachée hors print, déclenchée via `window.print()`

---

## 5) Écran “Historique”

### But
Consulter les événements embarquement récents et rechercher.

### Colonnes
- Date/heure événement
- Trajet (départ → arrivée)
- Action (EMBARQUE / ABSENT / CLOSURE)
- Référence réservation (si présent)
- Agent (contrôleur) (si présent)

### Filtres
- date (jour)
- trajet (optionnel)
- type d’événement (scan / absent / closure)
- recherche texte (nom/téléphone/référence)

### Actions
- Détails événement (expand)
- Lien “Retour au départ” si disponible (optionnel)

---

## 6) Mapping des données visibles → sources

| Champ visible | Source | Notes |
|---|---|---|
| Trajet | `weeklyTrips` | mapping `tripId → departure/arrival` |
| Heure / date départ | `tripAssignments` (back) + `location.state` / mapping UI | non affiché comme “tripAssignments” |
| Passagers (attendu) | `reservations` | count places / tickets |
| Embarqués / Absents (effectif) | `reservations` (boardingStatus/statutEmbarquement) | via `getEffectiveBoardingStatus` |
| Capacité véhicule | `fleetVehicles` (back via getVehicleCapacity) | affichée seulement en KPI/contrôle |
| Statut de clôture | `boardingClosures/{tripKey}` (existence) | affiche “Clôturé” |
| Historique / événements | `boardingLogs` | logs scan + closure + absent-reprog |
| Feedback scan | calcul `updateStatut` / erreurs | UI only |
| Auth/autorisation “Imprimer”/“Lancer trajet” | rôles + état tripInstanceMetier | UI gating |

Autres sources (non affichées) :
- `tripAssignments.liveStatus` (si vous exposez un badge “En cours” dans l’UI)
- `tripInstances` / `tripExecution` : utilisés par les actions de progression, mais pas nécessaires pour afficher la liste passagers.

---

## 7) Wireframe textuel complet

### DÉPARTS DU JOUR (écran principal)

[HEADER]
- “Départs du jour — 17/06/2026”

[SECTION 1 — KPI]
- Départs : 12
- Passagers : 108
- Embarqués : 48
- Absents : 5

[SECTION 2 — CARTES]

---
[Bamako → Sikasso]
06h00
53 passagers
48 embarqués
5 absents

[Ouvrir]

---
[Bamako → Kayes]
08h00
21 passagers
12 embarqués
9 absents

[Ouvrir]

---
[Bamako → Ségou]
10h00
34 passagers
0 embarqués
0 absents

[Ouvrir]

---

[SECTION 3 — ALERTES]
- (optionnel) “Scanner non disponible : départ non ouvert”

[SECTION 4 — HISTORIQUE RÉCENT]
- 09:10 — EMBARQUE — Bamako → Sikasso — REF/nom
- 09:12 — ABSENT — Bamako → Sikasso — REF/nom
- 09:30 — CLOSURE — Bamako → Sikasso

> (Phase 1) Historique récent limité à 3 éléments/collapsé par défaut.

---

### OUVRIR UN DÉPART (préparation)

[HEADER]
- “Bamako → Sikasso — 06h00 — Capacité : 50”

[INFO]
- Date : 17/06/2026
- Embarqués : 48 / 53
- Absents : 5

[BOUTONS]
- [Continuer]
- [Retour]

---

### ÉCRAN SCAN (mobile)

[HEADER]
- “Bamako → Sikasso — 06h00”
- [Imprimer]

[SCAN]
- (camera)
- [SCAN ON/OFF]

[MANUEL]
- Input “code billet”
- Bouton “Valider”

[COMPTEURS]
- Embarqués : 48
- Absents : 5
- Capacité : 50

[LISTE COURTE]
- Nom A — Réf — [✓/X]
- Nom B — Réf — [✓/X]

[ACTIONS]
- case “Embarqué”
- case “Absent”

[CLOTURE]
- Bouton : “Clôturer embarquement”

[CONFIRM DÉPART]
- Bouton : “Valider et lancer le trajet”

---

### ÉCRAN HISTORIQUE

[FILTRES]
- date
- type d’événement
- recherche

[TABLE]
- Date/heure | Trajet | Action | Réf | Agent

---

## 8) Contraintes et exclusions (rappel Phase 1)
- Ne pas exposer : `assignmentId`, `vehicleId`, `fleetVehicles`, `fleetMovements`, “garage/logistique avancée”.
- Ne pas supprimer fonctionnellement : scan, capacité, clôture, confirmation départ.
- La confirmation arrivée physique du bus n’est pas traitée comme action “Chef d’embarquement Phase 1” dans ce périmètre (à prévoir en Phase 1.2).

