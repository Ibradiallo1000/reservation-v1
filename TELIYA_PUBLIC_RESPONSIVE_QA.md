# Teliya — QA responsive public

## Contrôles réalisés par construction

- mobile : formulaire empilé, zones tactiles de 44 px minimum, aucun tableau horizontal ;
- tablette/desktop : formulaire sur une ligne à partir du breakpoint `md` ;
- navigation : landmarks `header`, `nav`, `main`, `footer` et libellé du formulaire ;
- titres : un seul `h1` sur la Marketplace ; sections en `h2`, cartes en `h3` ;
- clavier : champs natifs, bouton natif, focus visible et FAQ avec `details/summary` ;
- contraste : texte sombre sur blanc et CTA blanc sur fonds orange/sombre.

## Matrice de recette manuelle restante

| Largeur | Route | Contrôles |
|---|---|---|
| 320–430 px | `/`, `/resultats`, résultats compagnie | saisie, date, CTA, absence de débordement |
| 768–1024 px | mêmes routes | grille, focus, orientation |
| ≥1280 px | mêmes routes | largeur maximale, alignement, lisibilité |

La recette navigateur et les comptes/données réels restent nécessaires avant une validation production complète.

