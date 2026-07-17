# TELIYA — Plan directeur de refonte

Nombre exact proposé : **10 phases après la Phase 0**. La structure initiale de 11 phases est raccourcie en fusionnant les interfaces agence opérationnelles et en intégrant administration/configuration avec Marketplace avant le gel final.

## P1 — Sécurisation et fondations UI

Objectif : sécuriser environnements/CI sans modifier les écrans, puis créer tokens et primitives accessibles. Livrables : garde environnements, CI Rules, script E2E, tokens, boutons/inputs/cards/table/dialog/feedback. Gel : typecheck, build, tests Rules, aucune mutation métier.

## P2 — Rôles, shells et navigation

Objectif : aligner matrice navigation/guard et shells desktop/mobile tout en conservant routes/aliases. Livrables : registre rôle-capacité, layouts, sidebar/header/bottom nav. Dépend de P1. Gel : tests de chaque rôle et refus.

## P3 — Dashboard et pilotage Agence

Objectif : activité, indicateurs, actions prioritaires, équipe et rapports. Contrôleurs existants conservés; aucune nouvelle écriture financière. Gel : responsive 320–1440 et cohérence des sources.

## P4 — Opérations agence : guichet, départs, embarquement, courrier

Objectif : harmoniser les postes opérationnels sans fusionner workflows. Livrables : guichet/billet/clôture, départ/scan, session/envoi/arrivée/remise courrier. Gel : scénarios E2E et statuts/idempotence inchangés.

## P5 — Caisse et comptabilité agence

Objectif : vues de session, validation, historique, écarts et trésorerie agence. Protocole comptable obligatoire. Gel : tests Rules billetterie+courrier+banque, invariants ledger vérifiés.

## P6 — Comptabilité compagnie et trésorerie

Objectif : réseau financier, comptes, mouvements, dépenses, rapprochements, rapports. Vues principalement lecture/agrégation. Gel : aucune reconstruction financière depuis réservations.

## P7 — Marketplace, réservation en ligne et opérateur digital

Objectif : parcours Départ+Arrivée → trajets → compagnies → choix → réservation → paiement → billet. Inclut preuve/refus/validation opérateur et SEO/PWA public. Gel : hold, paiement, billet, règles publiques et responsive.

## P8 — Command Center CEO

Objectif : activité réseau, finance consolidée, agences, alertes et décisions. Dépend de sources fiabilisées P3–P7. Gel : KPI traçables vers leur source et aucune mutation cachée.

## P9 — Plateforme, administration et configuration

Objectif : compagnies, agences, utilisateurs, plans, moyens de paiement, branding et médias. Les modules garage/flotte/logistique avancée restent masqués. Gel : isolation tenant et permissions admin.

## P10 — QA finale, staging et gel

Objectif : responsive complet, clavier/zoom/contraste, performance/coût Firestore, PWA, impression, E2E multi-rôle, staging, rollback puis production contrôlée. Livrables : rapport de preuve et registre de dettes. Gel : tous checks verts et tag stable.

## Règles obligatoires du chantier

1. Audit avant migration; aucune correction métier cachée dans une phase UX.
2. Primitives sans Firebase; contrôleur connecté conservé, view-model pur, vue pure.
3. Aucun écran métier modifié pendant P1 primitives.
4. Responsive mobile-first et accessibilité structurelle.
5. Aucun module non demandé; tout module validé est gelé.
6. Typecheck, build, tests pertinents et `git diff --check` obligatoires.
7. Rapport de phase et dette reportée explicite.
8. Toute écriture finance/Rules suit `ACCOUNTING_SAFETY_PROTOCOL.md` et passe par staging.
9. Aucun déploiement ou backfill implicite.
10. Chaque phase a une fin vérifiable; aucune nouvelle phase n’est ajoutée sans décision produit.
