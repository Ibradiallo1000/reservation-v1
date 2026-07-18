# Phase 8 — Normalisation internationale des pays

## Livré

- Référentiel unique typé de 16 pays déjà prévus par le produit.
- `companies.countryCode` ISO alpha-2 canonique avec lecture ascendante de `pays`, `country`, `countryName` et `isoCountryCode`.
- Création et modification de compagnie par sélection contrôlée; maintien du libellé `pays` pour compatibilité.
- Valeurs historiques de devise/timezone/paiement préservées; avertissement lors d’une correction de pays.
- Marketplace filtrée localement par pays seulement si plusieurs pays publics résolvables existent; préférence ISO non sensible.
- Diagnostic pur non public et plan de backfill pur/idempotent, couverts par fixtures.

## Limites et sécurité

Les villes/trajets n’ont pas toujours un pays par extrémité : aucun support international n’est inventé. Les tables pays du paiement/téléphone restent une dette ciblée. Aucune Rule, collection, claim, Function, donnée Firebase, écriture métier, route tenant ou logique de réservation/paiement n’a été modifiée. Aucune migration ni aucun déploiement production n’a été exécuté.

La validation réelle staging, domaines, Lighthouse, PWA et matrices d’appareils reste bloquée par l’accès TLS de l’environnement et doit précéder toute Phase 9 de production.
