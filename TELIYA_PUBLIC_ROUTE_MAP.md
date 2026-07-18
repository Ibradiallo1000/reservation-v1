# Teliya — Carte des routes publiques

## Routes canoniques du domaine principal

| Route | Destination | Paramètres | Compatibilité |
|---|---|---|---|
| `/` | Marketplace publique | — | Sur un sous-domaine compagnie, `RouteResolver` reste prioritaire |
| `/landing` | Landing marketing historique | — | Nouveau chemin réservé à la plateforme |
| `/resultats` | Comparaison des compagnies | `from`, `to`, `date` optionnelle | Logique de lecture existante conservée |
| `/compagnie/:slug/resultats` | Entrée canonique des résultats compagnie | `departure`, `arrival`, `date` | Redirige vers l’alias tenant existant `/:slug/resultats` |
| `/reservation` | Entrée générique du tunnel | `slug` obligatoire, autres paramètres conservés | Redirige vers `/:slug/booking`; sans slug, aucun contexte n’est inventé |

`/compagnie/:companyId` reste l’espace interne protégé de la compagnie. Il ne peut pas être réaffecté à une page institutionnelle publique sans casser les routes internes. La présentation publique canonique reste donc `/:slug` et les domaines personnalisés/sous-domaines.

## Routes tenant historiques conservées

`/:slug`, `/:slug/resultats`, `/:slug/booking`, `/:slug/reserver`, `/:slug/reservation/:id`, `/:slug/mon-billet`, les pages légales, de paiement, confirmation, reçu et preuve restent résolues par `RouteResolver` ou leurs routes explicites existantes.

## Routes plateforme réservées à la canonicalisation

Les segments `landing`, `compagnie`, `resultats`, `reservation`, `track`, `scan`, `mes-reservations` et `mes-billets` ne sont jamais interprétés comme des slugs compagnie sur `teliya.app`.

## URLs externes auditées

- QR : identifiants et jetons de billets, reçus, embarquement et courrier ; aucune URL d’accueil réécrite.
- Emails/SMS : aucun générateur de lien public ne dépend de l’ancienne landing `/` dans le périmètre audité.
- Domaines : sous-domaines `:slug.teliya.app` et domaines personnalisés continuent d’utiliser `tenantResolver` et `RouteResolver`.

