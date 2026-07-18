# Teliya — Carte des données Marketplace

| Bloc | Donnée | Source | Collection/service/provider | Filtre | Limite | Tri | Donnée publique | Mode | Fallback | Validation |
|---|---|---|---|---|---:|---|---|---|---|---|
| Recherche | villes départ/arrivée | trajets configurés | collection group `weeklyTrips` | `active/isActive !== false`, `disabled !== true`, libellés présents | 300 docs | alphabétique après déduplication accent/casse | oui, Rules publiques auditées | lecture ponctuelle | formulaire désactivé + état explicite | validé statiquement |
| Destinations | paire départ/arrivée + fréquence | même lecture `weeklyTrips` | sélecteur pur `derivePopularRoutes` | trajet actif, villes distinctes | 8 cartes | nombre de trajets décroissant, puis alphabétique | oui | aucune lecture supplémentaire | section vide/erreur | validé par tests |
| Compagnies | nom, slug, logo, description publique | `companies` | requête Firestore | `publicPageEnabled == true`, `status == actif` | 24 docs lus, 12 affichés | trajets actifs décroissants puis nom | uniquement projection whitelistée | lecture ponctuelle | logo neutre, section vide/erreur | validé par tests |
| Compagnies | nombre de trajets publics | `weeklyTrips` déjà chargé | `filterPublicCompanies` | groupement par companyId interne, jamais rendu | inclus dans limite 300 | décroissant | compteur agrégé seulement | calcul mémoire | zéro si absent | couverture partielle documentée |

Deux requêtes maximales, zéro listener, zéro lecture de réservations et zéro cascade par compagnie.

