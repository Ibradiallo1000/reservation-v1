# Teliya — Fondations du Design System

## Principes

Interface dense, professionnelle, traçable et mobile-first. L’orange Teliya identifie les actions globales; les portails publics continuent d’utiliser les variables de marque de leur compagnie. Aucune primitive ne connaît Firebase ou un statut métier.

## Source autoritative

- Variables runtime : `src/index.css` (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--control-*`, `--z-*`, `--duration-*`).
- Contrat TypeScript : `src/ui/foundation/tokens.ts`.
- Classes composables : `src/ui/foundation/*`.
- Composants : import depuis `@/ui`.

`src/app/design-system.ts`, `src/theme.ts` et les composants `src/shared/ui` restent compatibles pendant la migration, mais ne doivent plus recevoir de nouveaux tokens concurrents.

## Identité et couleurs

Primaire `#ff6600`, hover `#e55c00`, surface blanche/neutre, texte ardoise sombre. Les états succès, avertissement, erreur et information ont un texte explicite; la couleur seule ne porte jamais le sens. Les variables de compagnie (`--brand-primary`, `--teliya-primary`) restent prioritaires dans les espaces concernés.

## Typographie et densité

Police système/Inter, titres compacts, corps 14–16 px, labels 14 px, légendes 12 px, KPI tabulaires. Une seule hiérarchie H1/H2/H3 par page. Les contrôles utilisent 36/44/48 px; 44 px est la cible tactile normale.

## Espacement, rayons, ombres

Échelle 4/8/12/16/24/32 px. Pages et cartes utilisent des valeurs fluides bornées. Rayons : contrôle 8 px, carte 12 px, dialog 16 px, pill complet. Ombres limitées à trois niveaux.

## Primitives consolidées

- `ActionButton` : primary, secondary, outline, ghost, danger; sm/default/lg/icon; disabled/loading.
- `IconButton` : nom accessible TypeScript obligatoire.
- `Input`, `StatusBadge`, `AppCard`, `SectionCard`, `MetricCard`, `PageHeader`, `EmptyState`, `AlertMessage`.
- `Dialog`/`Sheet` : Headless UI gère focus trap, Escape, fermeture et restauration du focus.
- `TableShell` : région nommée, focusable et scroll local.
- `Spinner`, Skeleton et Tabs existants.

## Responsive

Profils : 320–374 compact, 375–479 mobile, 480–1023 tablette, 1024–1439 desktop, 1440+ large. Aucun overflow global; tables/code défilent localement; dialogs deviennent bord bas sur mobile et centrés dès `sm`. L’impression conserve ses feuilles dédiées.

## Accessibilité

Focus visible global, labels associés, erreurs reliées par `aria-describedby`, boutons icône nommés, statuts textuels, landmarks et titres ordonnés. `prefers-reduced-motion: reduce` réduit les transitions/animations. La conformité WCAG complète reste à prouver par audit manuel.

## Mouvement

Durées 120–200 ms, principalement couleurs, opacité et ombres. Aucun mouvement bloquant ou décoratif long.

## Anti-patterns

- Couleur hardcodée lorsqu’un token existe.
- Nouveau composant Button/Card/Badge local sans audit de `@/ui`.
- Calcul, listener ou mutation Firebase dans une primitive.
- Statut exprimé uniquement par couleur.
- `outline: none` sans remplacement `focus-visible`.
- Migration visuelle qui modifie callback, payload, statut ou ordre d’écriture.

## Stratégie de migration

Migrer écran par écran à partir de la Phase 2 : inventaire, capture du contrat, remplacement visuel, tests fonctionnels/responsive/accessibilité, rapport et gel. Aucun remplacement massif.
