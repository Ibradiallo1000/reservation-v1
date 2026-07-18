# Teliya — Compatibilité des URLs publiques

## Garanties

- La landing historique n’est pas supprimée : elle est servie intacte à `/landing`.
- Les URLs tenant `/:slug/*` restent valides.
- Les sous-domaines et domaines personnalisés continuent de résoudre `/` avec `RouteResolver`.
- `/compagnie/:slug/resultats` conserve les critères puis rejoint `/:slug/resultats`.
- `/reservation?slug=...` rejoint le tunnel existant et conserve les autres paramètres.
- Sans slug, `/reservation` affiche un état explicite et ne choisit jamais une compagnie silencieusement.
- Les segments publics nouvellement réservés ne sont pas redirigés vers de faux sous-domaines.

## Invariants externes

Aucun format de QR, lien billet, reçu, paiement, confirmation, email ou SMS n’a été modifié. Aucun alias existant n’a été supprimé.

## Conflit de namespace documenté

`/compagnie/:companyId` appartient déjà au shell interne protégé. La page institutionnelle publique ne peut donc pas utiliser exactement `/compagnie/:slug` dans cette phase sans dispatcher de contexte ou migration des routes internes. Son URL publique stable reste `/:slug`.

