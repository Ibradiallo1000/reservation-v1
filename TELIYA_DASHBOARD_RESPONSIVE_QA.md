# TELIYA — QA responsive des dashboards

## Vérifications structurelles

| Dimension cible | Plateforme | CEO |
|---|---|---|
| 320–430 px | KPI en deux colonnes compactes, listes verticales, CTA pleine largeur possible | une colonne principale, sélecteur et dates repliables, cartes compactes |
| 768 px | cartes et listes sans largeur fixe | KPI en deux colonnes, sections empilées |
| 1024–1440 px | quatre KPI et grille contenu/alertes | grille exécutive et sections doubles |
| 1920 px | contenu contenu par le shell, aucune carte géante | six KPI maximum, sections à largeur maîtrisée |

Les composants utilisent des focus visibles, des cibles principales d’au moins 44 px, `motion-reduce`, des headings structurés et des listes plutôt que des tableaux larges.

## Recette non automatisable ici

Aucun navigateur graphique ni compte de test n’était disponible. Les dimensions, le zoom 200 %, les safe areas et la navigation complète au clavier doivent donc être confirmés lors d’une recette authentifiée. Aucune validation visuelle réelle n’est revendiquée.

