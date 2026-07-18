# Teliya — QA mobile Marketplace

## Validation effectuée

Validation structurelle par TypeScript, tests de source et build. Les classes couvrent 320 px sans largeur fixe globale, rails locaux `overflow-x-auto`, formulaire empilé, cibles de 44 px et safe area iOS.

## Recette réelle

| Taille | État |
|---|---|
| 320×568, 360×800, 375×812, 390×844, 412×915, 430×932 | non exécutée dans un navigateur |
| 768×1024, 1024×768 | non exécutée dans un navigateur |
| 1280×800, 1440×900, 1920×1080 | non exécutée dans un navigateur |

Les données Firebase et un navigateur interactif n’étaient pas disponibles pour prouver le rendu, le zoom 200 %, le hors-ligne ou les gestes tactiles. Ces contrôles restent obligatoires avant production.

