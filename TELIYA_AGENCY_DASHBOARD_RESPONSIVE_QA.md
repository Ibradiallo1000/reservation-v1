# TELIYA — QA responsive Dashboard agence

## Structure prévue

| Largeur | Comportement |
|---|---|
| 320–430 px | KPI en deux colonnes, départs en cartes/lignes empilées, accès rapides sur une colonne |
| 768 px | sections empilées, accès rapides sur deux colonnes |
| 1024–1440 px | départs et alertes en deux colonnes asymétriques, quatre KPI |
| 1920 px | largeur limitée par le shell, aucune carte étirée inutilement |

Les liens ont une hauteur minimale de 44 px, un focus visible et des libellés explicites. Les listes sont sémantiques, les statuts sont textuels et les skeletons Phase 5 respectent `prefers-reduced-motion`.

La recette réelle aux neuf dimensions demandées, au zoom 200 %, avec clavier mobile et safe areas n’a pas été exécutée faute de navigateur authentifié. Aucune validation visuelle non réalisée n’est revendiquée.
