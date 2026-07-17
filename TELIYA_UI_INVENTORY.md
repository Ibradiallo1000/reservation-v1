# TELIYA — Inventaire UI, responsive et accessibilité

Audit structurel statique; aucune capture multi-largeur ni lecteur d’écran réel n’a été exécuté.

## Inventaire

| Famille | Implémentations observées | Constat |
|---|---|---|
| Shells | admin, compagnie, comptable, agence, courrier, boarding, escale, garage | navigation dupliquée par rôle |
| Headers | PageHeader partagé + headers locaux | titres/actions incohérents |
| Navigation | sidebars, tabs, bottom nav public, redirections/hash anchors | nombreuses variantes et aliases |
| Cards/KPI | `AppCard`, `MetricCard`, `SectionCard` + cartes locales | primitives présentes mais adoption partielle |
| Tables | nombreuses tables métier | densité et overflow mobile probables |
| Formulaires | inputs partagés + contrôles Tailwind locaux | labels/erreurs non uniformes |
| Dialogs/sheets | Headless UI, Radix et modales maison | focus/Escape/restauration à vérifier par instance |
| Feedback | StatusBadge, EmptyState, AlertMessage, toast/sonner/react-hot-toast | deux moteurs toast et statuts concurrents |
| Tickets/PDF | reçus guichet/en ligne, QR, PDF/html2canvas | rendu impression séparé à préserver |
| Graphiques | Recharts dans dashboards | poids bundle et lisibilité mobile |

## Styles concurrents

Tailwind, CSS global, thème local, Emotion, `styled-jsx`, Headless UI et Radix coexistent. Une fondation existe sous `src/ui/foundation`, mais les pages historiques continuent leurs propres couleurs, espacements, rayons, ombres et badges. Deux bibliothèques d’icônes principales (Lucide/Heroicons) et React Icons sont présentes.

## Responsive

| Largeur / contexte | Risque structurel à tester |
|---|---|
| 320–430 px | tableaux, barres POS, formulaires réservation, modales, bottom nav/safe-area |
| 768 px | collision sidebar/contenu, grilles KPI, filtres |
| 1024 px | densité guichet/agence, scroll imbriqué, panneaux sticky |
| 1280–1440 px | lignes trop longues, dashboards surchargés, espace mural mal exploité |
| PWA standalone | safe areas, mise à jour SW, offline, clavier mobile |
| impression | ticket, reçu, billet/PDF sans navigation |

Les classes responsive sont nombreuses, mais cela ne prouve pas l’absence d’overflow. Priorité de test : guichet, réservation publique, caisse/comptabilité, courrier, command center.

## Accessibilité structurelle

Points positifs : sémantique et attributs `aria-*` existent; certaines primitives prévoient focus visible, états vides et erreurs. Risques : boutons icône sans nom accessible, labels non associés, modales maison sans focus trap/restauration, tableaux sans caption/headers exploitables, couleurs de statut seules, zones tactiles trop petites, animations Framer sans traitement systématique de `prefers-reduced-motion`, navigation clavier des tableaux/menus et zoom 200 % non prouvés.

## UX principale

- Trop de routes aliases et tabs/hash redirections rendent la position courante difficile à comprendre.
- Le rôle réel, la navigation affichée et le guard ne proviennent pas d’une seule source.
- Finance et trajets exposent plusieurs modèles legacy/canoniques; l’UI doit afficher la source sans recalcul caché.
- Les pages opérationnelles longues et denses doivent conserver actions primaires visibles, statut de session et erreurs concrètes.
- Les modules différés ne doivent pas réapparaître via liens directs ou recherche de navigation.

## Cible de la future refonte

Conserver contrôleurs/services connectés; extraire view-models purs puis vues pures. Normaliser tokens/primitives avant les shells, sans toucher aux écrans métier durant cette fondation.
