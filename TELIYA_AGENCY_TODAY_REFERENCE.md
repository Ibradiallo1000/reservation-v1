# TELIYA — Référence agence « Aujourd’hui »

## Objectif

`/agence/activite` est la vue quotidienne canonique du chef d’agence et des profils disposant de `agency.dashboard.view`. Elle répond aux besoins de supervision sans embarquer d’action métier.

## Contexte et sécurité

La page exige un rôle reconnu, `companyId` et `agencyId` avant de monter le hook de données. Aucune requête n’est lancée si ce contexte manque. Le hook existant filtre toutes ses sources par la compagnie et l’agence du profil. Aucun choix de première agence n’existe.

## Sections

- en-tête avec agence, date et fuseau du profil ;
- quatre KPI : départs, billets, postes ouverts, points d’attention ;
- liste en lecture seule des départs du jour ;
- alertes existantes ;
- synthèses guichet, réservations en ligne et courrier ; embarquement explicitement indisponible faute d’indicateur distinct chargé ;
- activité commerciale uniquement si `agency.cash.read` ;
- accès rapides filtrés par capacités.

Actions autorisées : consulter et ouvrir une route canonique. Actions interdites : vente, ouverture/fermeture de poste, validation, mutation, embarquement, clôture, expédition, remise et modification de réservation.

Les états distinguent chargement, aucun départ, aucune anomalie, contexte manquant, rôle inconnu et accès interdit. La recette visuelle authentifiée reste nécessaire.
