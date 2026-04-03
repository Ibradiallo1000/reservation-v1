# Audit Workflow Embarquement (gel UI)

Date: 2026-04-01  
Portée: audit fonctionnel et métier uniquement (aucune modification d'interface)

## 1) Cadre et décision

- Toute évolution UI est suspendue.
- Le présent document sert de base de validation métier avant reprise du développement.
- Référence technique auditée: `AgenceEmbarquementPage.tsx`, `BoardingDashboardPage.tsx`, `BoardingScanPage.tsx`, `tripProgressService.ts`, `tripExecutionService.ts`, `tripInstanceService.ts`, `BusPassengerManifestPage.tsx`, `firestore.rules`.

## 2) Cartographie du processus réel (as-is)

### A. Avant embarquement

1. Planification crée un `tripAssignment` (planifié/validé) avec véhicule.
2. L'agent ouvre "Départs planifiés" puis "Scan / Liste".
3. Le système vérifie affectation + capacité véhicule et tente un lock de session d'embarquement.
4. Si lock OK, snapshot local de créneau enregistré (support offline).

### B. Pendant embarquement

1. Scan QR ou saisie manuelle de code billet.
2. Résolution réservation par identifiant/code.
3. Contrôles:
   - réservation valide pour scan,
   - concordance trajet/date/heure,
   - non déjà embarqué,
   - capacité disponible.
4. Transaction Firestore:
   - réservation -> embarqué,
   - lock anti-doublon par réservation,
   - log embarquement,
   - agrégats (stats, live status).

### C. Fin embarquement

1. Action "Tout marquer embarqué" disponible (sur la liste filtrée "pending").
2. Action de clôture:
   - marque les non embarqués en absents,
   - écrit `boardingClosures`,
   - écrit log de clôture,
   - ferme stats d'embarquement,
   - transition flotte `assigned -> in_transit`,
   - tentative de reprogrammation absents.

### D. Validation agence

- Aujourd'hui, la validation est implicite et dispersée:
  - le chef embarquement pilote le scan + clôture + impression,
  - la "validation agence" n'est pas un état métier explicite unique dans le flux.

### E. Départ véhicule

1. Bouton "Terminer et lancer le trajet" appelle `markOriginDeparture`.
2. Écrit `tripInstances/{id}/progress/1` (`departureTime`, `confirmedBy`).
3. Met à jour `tripExecutions` en `departed`.
4. Auto-départ possible 30 min après clôture si oubli.

### F. Transit

1. `tripInstance.status` peut passer à `departed` puis `arrived`.
2. `tripExecutions` est upserté (`transit`, `arrived`) + checkpoints.
3. Escales suivent arrivées/départs via `progress` et dashboard escale.

### G. Historique

- Existant:
  - `boardingLogs` (scan/clôture/reprogrammation),
  - `agentHistoryService` (événements agent),
  - `tripExecutions` (timeline inter-agences),
  - `tripInstances/progress` (arrivées/départs par stop).
- Limite:
  - pas de registre métier unifié "workflow embarquement" signé/validé de bout en bout.

## 3) Qui fait quoi (RACI simplifié)

### Chef embarquement

- Ouvre session de scan.
- Scanne / saisit billet.
- Bascule embarqué/absent par passager.
- Peut utiliser "Tout marquer embarqué".
- Lance impression de la liste.
- Déclenche "Terminer et lancer le trajet".

### Chef agence

- Aujourd'hui: rôle de supervision/validation non matérialisé par un jalon métier unique obligatoire.
- Peut intervenir selon droits/règles, mais le flux opérationnel principal est porté par l'écran embarquement.

### Escale (hors agence origine)

- Suit exécutions trajet (tripExecutions).
- Gère progression locale (arrivée/départ escale).
- Gère manifeste descente.

## 4) Statuts métier EXACTS à retenir (to-be validé)

Statuts métier normatifs proposés (langage produit):

1. `planifie`
2. `embarquement_en_cours`
3. `embarquement_termine`
4. `en_transit`
5. `termine` (ou `archive` selon politique documentaire)

### Mapping avec l'existant technique

- `planifie` -> `tripAssignment.status = planned|validated` + pas de `boardingClosure`.
- `embarquement_en_cours` -> session scan active + boarding non clôturé.
- `embarquement_termine` -> document `boardingClosures/{tripKey}` présent.
- `en_transit` -> `progress[origin].departureTime` posé et/ou `tripExecution.status in (departed, transit)`.
- `termine/archive` -> `tripExecution.status = arrived|finished` + règles d'archivage.

Note: aujourd'hui plusieurs sources coexistent; il faut valider une source de vérité officielle.

## 5) Incohérences actuelles (diagnostic)

1. **Bouton "Trajet lancé"**
   - dépend de `markOriginDeparture` (permissions/règles peuvent bloquer),
   - le label UI masque la complexité multi-documents (`progress`, `tripExecutions`, flotte).

2. **Bouton "Tout marquer embarqué"**
   - action massive sensible,
   - peut contourner la discipline "scan réel par passager" (risque métier/contrôle).

3. **Checkboxes libres embarqué/absent**
   - toggles manuels disponibles ligne par ligne,
   - utile opérationnellement mais ouvre un écart potentiel avec "scan strict".

4. **Historique non consolidé**
   - logs présents mais fragmentés (`boardingLogs`, `agentHistory`, `tripExecutions`, `progress`),
   - absence de journal métier unique "qui a validé quoi et quand" sur un objet central.

5. **Impression non conforme au cadre documentaire cible**
   - "Liste d'embarquement" existe avec en-tête et signatures,
   - "Bon de route" officiel distinct non standardisé dans ce flux.

## 6) Séparation stricte des usages (règle cible)

## Règle produit à valider

- **Mobile** = scan uniquement
  - autoriser: scan caméra, validation QR, feedback scan.
  - interdire: "tout embarqué", toggles manuels, clôture, impression, lancement trajet.

- **Desktop** = validation + impression
  - autoriser: revue liste, écarts, clôture, validation agence, impression liste et bon de route.
  - limiter le scan desktop au besoin de secours (politique à valider).

Constat: l'état actuel mélange scan, toggles, actions massives, impression et lancement trajet dans le même écran.

## 7) Documents officiels à cadrer

### Document 1 — Liste passagers (obligatoire)

Contenu minimal à figer:
- compagnie (logo/nom),
- agence origine,
- date/heure,
- trajet (origine -> destination),
- véhicule (immat), chauffeur, convoyeur,
- tableau passagers (nom, tel, référence, places, statut),
- totaux (réservations, places, embarqués, absents),
- signatures (chef embarquement, chauffeur, visa agence),
- horodatage d'édition.

État actuel: proche de ce format, à normaliser officiellement.

### Document 2 — Bon de route (obligatoire)

Contenu minimal à définir:
- identifiant trajet/jour,
- véhicule + équipage,
- heure départ validée,
- checkpoints/escales prévues,
- passagers embarqués (total places),
- validation chef agence + conducteur,
- statut final (départ, transit, arrivée, clôture).

État actuel: non matérialisé comme document officiel unique dans le workflow embarquement.

## 8) Décisions de validation demandées (avant reprise dev)

1. Valider les 5 statuts métier normatifs (section 4).
2. Valider la séparation stricte mobile/desktop (section 6).
3. Décider du niveau d'autorité de "Tout marquer embarqué" (désactiver, restreindre, journaliser renforcé).
4. Décider si les toggles manuels restent autorisés, et sous quel rôle.
5. Valider le modèle documentaire officiel:
   - liste passagers,
   - bon de route.
6. Désigner la source de vérité du workflow (objet central métier) pour éviter les divergences entre `boarding*`, `progress`, `tripExecutions`.

## 9) Conclusion

- Le workflow embarquement fonctionne techniquement, mais il mélange aujourd'hui des responsabilités opérationnelles et de validation.
- La conformité métier attendue exige une normalisation explicite des statuts, des rôles, des actions autorisées par canal (mobile/desktop) et des documents officiels.
- Aucune reprise de développement UI ne doit être faite avant validation des décisions de section 8.
