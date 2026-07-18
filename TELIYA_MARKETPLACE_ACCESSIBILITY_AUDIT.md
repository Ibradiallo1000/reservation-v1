# Teliya — Audit accessibilité Marketplace

## Couverture statique

- un `h1`, ordre H1/H2/H3 et landmarks explicites ;
- labels visibles et erreurs reliées par `aria-describedby` ;
- combobox avec `aria-expanded`, `aria-controls`, `aria-activedescendant`, listbox et options ;
- navigation flèches, Entrée et Échap ;
- menu mobile avec nom et état étendu ;
- FAQ native `details/summary` ;
- liens/boutons sémantiques, `aria-current` et cibles tactiles ;
- animations désactivables avec `motion-reduce`.

## À prouver manuellement

Contraste AA calculé, VoiceOver/NVDA, zoom 200 %, ordre réel du focus, clavier mobile, restauration du focus du menu et comportement dans chaque navigateur. Aucun de ces contrôles n’est déclaré validé sans recette.

