# TELIYA — Référence Dashboard Plateforme

## Objectif et autorisation

La page `/admin/dashboard` donne à `admin_platforme` une vue SaaS en lecture seule. Elle dépend de `platform.view` via le guard Phase 4. Elle ne présente aucune donnée personnelle, aucun diagnostic et aucune donnée détaillée d’une compagnie.

## Sections

1. En-tête compact et accès canonique `/admin/compagnies`.
2. Quatre KPI issus des sources existantes : compagnies, revenu mensuel configuré, opérations du mois, quotas à surveiller.
3. Liste responsive des six compagnies les plus actives, avec plan, statut et utilisation.
4. Points d’attention prouvés : compagnie inactive, quota ≥ 80 %, demande d’abonnement en attente.
5. Nouvelles compagnies lorsque `createdAt` existe.

Les états distinguent chargement, erreur de la source compagnies, hors-ligne, liste vide et absence de signal. Les emails, téléphones, identifiants techniques et logs ne sont jamais rendus.

## Responsive et limites

Les KPI utilisent deux colonnes sur petit écran puis quatre sur desktop. Les listes remplacent les tableaux larges. Le nombre d’agences n’est pas affiché car aucune source déjà chargée ne le fournit. Les valeurs de plan par défaut restent celles du service de configuration existant.

