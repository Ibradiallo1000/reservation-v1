# Phase 4.5 — Notes de migration

## Comportement

- Aucune migration de données requise. Les documents `dailyStats`, `boardingStats` et `agencyLiveState` sont créés à la volée lors des opérations (réservation, session, boarding, flotte).
- Le tableau de bord Manager utilise en priorité ces agrégats ; si les documents sont absents (déploiement neuf ou ancienne agence), il retombe sur les calculs à partir de `shifts` et `reservations`.

## Déploiement

1. Déployer le code (build + hébergement client).
2. Déployer les règles Firestore : `firebase deploy --only firestore:rules` (si Firebase CLI configuré).
3. Créer les index Firestore si la console le demande (voir `PHASE_4.5_FIRESTORE_INDEXES.md`).

## Backfill optionnel

Pour alimenter les `dailyStats` des jours passés (ex. rapports historiques), exécuter un script unique (Node + Admin SDK) qui :

- Parcourt les `shiftReports` (ou shifts) par jour et agence ;
- Pour chaque jour, calcule totalRevenue, totalPassengers (à partir des réservations), validatedSessions, closedSessions, etc. ;
- Écrit ou met à jour le document `dailyStats/{YYYY-MM-DD}` avec ces valeurs.

Non fourni dans cette phase ; à faire si besoin de cohérence historique.
