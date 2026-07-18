# Teliya — Audit de la source de vérité des villes

| Source | Chemin | Champs | Pays | Usage public | Décision |
|---|---|---|---|---|---|
| trajets hebdomadaires | `companies/{companyId}/agences/{agencyId}/weeklyTrips` | `departureCity/arrivalCity`, aliases `departure/arrival`, `depart/arrivee` | hérité de la compagnie | création et recherche des trajets | source publique retenue |
| instances | `tripInstances` | mêmes concepts | compagnie/agence | disponibilité datée | pas de catalogue de villes |
| agences | `companies/{companyId}/agences` | `ville`, `pays` | agence | contexte d’exploitation | fallback documentaire, pas fusionné |
| villes globales | `villes` via `useVilles` | `nom` | ancien `country` possible | ancien autocomplete | rejetée pour Marketplace/tenant : desserte non garantie |
| composants historiques | `VilleCombobox`, `CityInput`, `useVilleOptions` | chaîne libre normalisée | absent | anciennes pages | logique de recherche réutilisée, source globale non réactivée |

La disparition fonctionnelle venait de la rupture entre l’ancien catalogue global `villes` et la nouvelle projection Marketplace, combinée à l’oubli des champs canoniques `departureCity/arrivalCity`. La Phase 7.6 consolide tous les aliases sans renommer Firestore.
