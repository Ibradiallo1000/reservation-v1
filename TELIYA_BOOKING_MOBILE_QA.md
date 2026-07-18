# Teliya — QA mobile du booking

## Vérifications structurelles

- header compact et sticky, titre unique fourni par `ReservationStepHeader` ;
- progression textuelle non cliquable ;
- cartes bornées, champs et CTA pleine largeur ;
- contrôles de quantité de 40 px existants (écart restant avec la cible idéale 44 px) ;
- téléphone en `type=tel`, `inputMode=tel`, autocomplete ;
- erreurs inline et actions sûres pour un départ indisponible ;
- aucun identifiant ni passager ajouté à l’URL.

Les dimensions 320 à 1920 px n’ont pas fait l’objet d’une recette visuelle navigateur dans cet environnement. Elles restent à exécuter en Phase 7.6, notamment clavier virtuel, safe areas et CTA.
