# Teliya — Rapport Phase 7.2 Marketplace

## Livraison

La Marketplace est désormais une page de réservation mobile-first alimentée uniquement par les `weeklyTrips` actifs et les compagnies actives/publiées. Elle propose recherche accessible, destinations classées par fréquence réelle observée, partenaires publics, états indépendants, avantages prudents, FAQ, footer et navigation basse.

## Invariants

Deux lectures ponctuelles bornées remplacent tout besoin de listeners ou de cascades. Les sélecteurs projettent uniquement nom, slug, logo, description publique et compteur agrégé ; identifiants techniques et champs internes ne sont jamais rendus. Aucune donnée fictive n’est présente en production.

La convention Phase 7.1 `/resultats?from&to&date` est conservée. `RouteResolver`, `tenantResolver`, résultats détaillés compagnie et réservation ne sont pas modifiés.

## Limites

Le classement et les compteurs reflètent l’échantillon borné de 300 trajets publics, pas une statistique exhaustive. Aucune image hero n’a été ajoutée sans asset validé. La recette navigateur avec données réelles reste nécessaire.

