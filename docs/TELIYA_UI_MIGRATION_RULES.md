# Teliya — Règles de migration UI

## Avant un écran

Identifier route, rôles, guard, providers, queries, listeners, mutations, callbacks, statuts, états loading/error/empty et formats impression. Pour un module gelé, lire `TELIYA_FROZEN_MODULES.md` et le protocole comptable si nécessaire.

## Séparation obligatoire

```text
contrôleur connecté existant → view-model pur → vue pure utilisant @/ui
```

La migration peut changer structure visuelle, ordre de lecture, classes, primitives et comportement responsive. Elle ne peut pas changer collection, requête, calcul, transition, callback, payload, permission, rôle, guard ou provider métier.

## Modules gelés

API publique compatible, comparaison avec le tag stable, test du rendu critique et rapport obligatoire. Toute anomalie métier découverte devient une tâche séparée; elle n’est pas corrigée dans le chantier UX.

## Responsive

Vérifier 320×568, 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900 et 1920×1080. Contrôler overflow global, scroll local, clavier mobile, actions primaires, modales/sheets, tables et impression.

## Accessibilité

Vérifier landmarks, H1/H2, labels, erreurs, noms des boutons icône, ordre clavier, focus visible, Escape/restauration de focus, contraste, zoom 200 %, statuts textuels et reduced motion.

## Exceptions

Documenter le composant, la raison métier/technique, le token ou comportement dérogatoire, les consommateurs, le risque et la phase de retrait. Une préférence esthétique n’est pas une exception.

## Validation

Typecheck, tests ciblés, build, lint disponible, diff/check et scénarios métier inchangés. Joindre captures ou préciser honnêtement qu’aucune validation visuelle réelle n’a été effectuée.
