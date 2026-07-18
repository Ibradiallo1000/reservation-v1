# Teliya — Rapport Phase 7.3

`/resultats` compare désormais une carte par compagnie réellement compatible avec `from`, `to` et `date`. La page valide les critères avant toute lecture, fusionne planning et instances datées, exclut les départs annulés/passés, déduplique, calcule prix minimum et prochain horaire, puis conserve les critères vers `/compagnie/:slug/resultats`.

Trois lectures publiques bornées remplacent les anciennes lectures globales de compagnies, trajets et réservations. Les erreurs partielles, chargement et absence de résultat sont explicites. Les places ne sont pas affichées faute de calcul exact global prouvé.

Les pages détaillées compagnie, le tunnel, les tenants et le backend restent inchangés. La route canonique utilise `from/to/date`; l’alias existant traduit ces paramètres pour la page détaillée historique jusqu’à sa refonte Phase 7.4.

