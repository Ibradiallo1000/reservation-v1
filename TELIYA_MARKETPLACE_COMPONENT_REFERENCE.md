# Teliya — Référence des composants Marketplace

| Composant | Responsabilité | Données/états | Responsive | Accessibilité | Dépendances/limites |
|---|---|---|---|---|---|
| `MarketplaceHomePage` | composition, recherche, sections publiques | formulaire, ressources indépendantes | mobile-first, grilles dès `sm/lg` | landmarks, H1 unique, navigation basse | ne connaît aucun workflow de réservation |
| `PublicCityCombobox` | saisie/sélection d’une ville réelle | liste bornée, filtre, activeIndex, erreur | pleine largeur | pattern combobox, flèches, Entrée, Échap | 8 suggestions maximum |
| `useMarketplaceData` | deux lectures ponctuelles et retry | loading/error/data par ressource | sans rendu | erreurs Firebase masquées | 300 trajets et 24 compagnies maximum |
| `marketplaceData` | normalisation, villes, routes, partenaires, validation | fonctions pures | n/a | libellés normalisés | la fréquence est celle de l’échantillon borné |
| `LoadingCards` | skeleton local | loading section | rail local | label de chargement, reduced motion | aucun faux contenu |

Les cartes destinations et partenaires utilisent des `button`/`Link`, jamais des `div` cliquables.

