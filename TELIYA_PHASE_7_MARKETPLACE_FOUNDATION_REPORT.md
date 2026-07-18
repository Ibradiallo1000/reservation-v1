# Teliya — Rapport Phase 7.1

## Résultat

Le domaine principal ouvre désormais une Marketplace publique mobile-first. La landing marketing complète est disponible à `/landing`. La recherche transmet départ, arrivée et date à la comparaison, puis à la route de résultats compagnie, sans modifier la logique métier de réservation.

## Modifications

- nouvelle page Marketplace et formulaire accessible ;
- constructeurs de routes publics purs et testés ;
- migration de la landing par routage, sans suppression de composant ;
- alias de résultats compagnie et entrée `/reservation` avec contexte explicite ;
- sélection de compagnie redirigée vers ses départs réels avant réservation ;
- métadonnées SEO, canonical, OpenGraph, Twitter, robots et sitemap ;
- listes de segments réservés alignées entre fallback navigateur et routeur Edge Netlify.

## Compatibilité et sécurité

Les routes tenant, domaines personnalisés, sous-domaines, QR et tunnels existants sont conservés. La modification de l’Edge Function Netlify concerne uniquement la liste des chemins publics réservés ; aucune Firebase/Cloud Function, Rule, collection, donnée, claim ou index n’a été modifié.

## Écart architectural conservé

La route `/compagnie/:slug` demandée entre en collision exacte avec `/compagnie/:companyId`, espace interne protégé. Pour éviter toute régression d’autorisation, la présentation institutionnelle publique reste `/:slug`. La route plus spécifique `/compagnie/:slug/resultats` est sûre et active.

## Phase suivante

La Phase 7.2 pourra alimenter destinations populaires et partenaires depuis des agrégats/résultats réels, améliorer les cartes de comparaison et réaliser une recette navigateur avec données de test, sans nouvelle réorganisation des URLs.

