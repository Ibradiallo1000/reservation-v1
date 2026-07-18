# Teliya — Audit accessibilité du booking

## Corrigé en Phase 7.5

- un seul `h1` dans le header de l’étape ;
- progression textuelle, non interactive ;
- erreurs de champs reliées par `aria-describedby` et `aria-invalid` ;
- focus existant sur la première erreur ;
- état indisponible en `role=alert`, changement de prix en `role=status` ;
- autocomplete nom/téléphone et clavier téléphone ;
- CTA et commandes accessibles au clavier.

## À vérifier en recette

Contraste des couleurs tenant, zoom 200 %, lecteur d’écran, reduced motion et cibles tactiles de 44 px. Aucun plan de sièges numérotés n’existe à auditer dans le workflow actuel.
