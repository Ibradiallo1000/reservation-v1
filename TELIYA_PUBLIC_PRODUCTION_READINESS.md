# Teliya — Préparation production du parcours public

## Validé statiquement

- deux lectures Marketplace ponctuelles et parallèles ;
- maximum 300 trajets et 100 compagnies publiques ;
- zéro listener, zéro N+1 Marketplace, zéro requête par frappe ;
- pages tenant accessibles directement ;
- Marketplace et pages publiques indexables ;
- résultats `noindex, follow` ;
- booking, paiement et reçu `noindex, nofollow` ;
- manifest/start URL existants conservés ;
- aucune donnée de réservation ajoutée au cache PWA.

## Bloquants avant production

Recette staging multi-compagnies, validation du pays réel, domaine personnalisé, PWA installée, Lighthouse mobile, paiements et billets. La page tenant conserve un chargement par agence de ses `weeklyTrips` : dette N+1 bornée au tenant, à corriger seulement avec un contrat de requête/index prouvé.
