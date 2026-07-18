# Teliya — Architecture Marketplace

## Flux cible fondation

`/` → formulaire départ/arrivée/date → `/resultats?from&to&date` → sélection d’une compagnie → `/compagnie/:slug/resultats?departure&arrival&date` → alias historique `/:slug/resultats` → bouton Réserver → tunnel compagnie existant.

## Responsabilités

- `MarketplaceHomePage` fournit l’entrée publique, l’accessibilité et les contenus éditoriaux stables.
- `publicRoutes.ts` est la source typée des constructeurs d’URL et de la conservation des paramètres.
- `PlatformSearchResultsPage` conserve ses lectures Firestore et son regroupement existants ; seule sa destination de sélection change.
- `ResultatsAgencePage` conserve la construction des départs réels, prix, places et le passage de `tripData` au tunnel.
- `RouteResolver` conserve la résolution compagnie par slug, sous-domaine et domaine personnalisé.

## Données

La fondation n’affiche aucune destination ou compagnie fictive. Les destinations populaires et partenaires enrichis sont différés à la Phase 7.2, où ils devront être alimentés uniquement par les données existantes et avec des requêtes bornées.

## Limites intentionnelles

La date est transportée de bout en bout mais le service historique des résultats compagnie conserve sa fenêtre métier actuelle de 14 jours. Aucun filtre, calcul, listener, statut ou workflow de réservation n’a été modifié.

