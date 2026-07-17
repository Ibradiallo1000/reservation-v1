# TELIYA — Référence d'implémentation navigation

## Architecture

`src/shared/layout/InternalLayout.tsx` reste le shell commun. Les espaces spécialisés Courrier et Guichet conservent leur cadre opérationnel. Les configurations sont dans `src/navigation/` : types, utilitaires purs et fichiers par espace.

## Source de vérité

`NavigationItem` définit `id`, `label`, `to`, `icon`, rôles d'affichage, aliases de matching, priorité mobile, flag et enfants. `resolveNavigation()` filtre visuellement ; `toNavSections()` adapte vers le contrat historique d'`InternalLayout`.

Cette source ne remplace jamais `PrivateRoute`, `ProtectedRoute`, `TenantGuard` ou les Rules.

## Rôles et aliases

`normalizeNavigationRole()` reconnaît seulement deux variantes prouvées. Ajouter un alias exige une preuve dans les rôles/guards existants, une entrée dans le registre sécurité et un test démontrant qu'aucune destination supplémentaire n'est exposée.

## Desktop et mobile

La sidebar desktop consomme toutes les destinations résolues. `mobilePriority` produit jusqu'à quatre destinations principales ; le bouton « Plus » ouvre le `Sheet` accessible. Le bouton menu ouvre le même `Sheet`. Headless UI fournit focus trap, Escape, fermeture et restauration du focus. Les cibles font au moins 44 px et la barre respecte `safe-area-inset-bottom`.

## État actif et routes canoniques

`isNavigationItemActive()` retire query/hash, respecte `end`, reconnaît sous-routes et chemins `match`. Une route canonique est utilisée dans le menu ; les aliases ne sont que des chemins de correspondance/compatibilité.

## Breadcrumbs et titres

Les labels de configuration sont la base fiable des futurs breadcrumbs. La Phase 3 n'invente pas de données dynamiques et ne réécrit pas les titres internes des pages métier. Une page détail doit compléter le label de section avec une donnée effectivement chargée.

## Feature flags et états

`featureFlag: false` retire l'entrée de toutes les navigations. Un rôle inconnu ou sans contexte reçoit une liste vide des utilitaires ; les guards et landings existants restent responsables de la destination fonctionnelle. Les modules différés ne doivent pas être ajoutés à une configuration active.

## Ajouter une destination

1. Prouver route, guard, rôle et action.
2. Choisir l'espace et une route canonique.
3. Ajouter un `id` stable et, si nécessaire, `match`/`featureFlag`.
4. Définir une priorité mobile seulement si la tâche est quotidienne.
5. Ajouter tests rôle, état actif et mobile.
6. Mettre à jour les deux registres si un alias ou écart existe.

## Tests

`navigation.utils.test.ts` couvre aliases de rôle, absence d'élargissement, feature désactivée, sous-route/alias actif, priorité mobile, rôle et contexte absents. Les primitives `Sheet` sont déjà couvertes structurellement par Headless UI ; la recette navigateur focus/Escape reste requise.

## Limitations

- Les menus historiques des rôles agence autres que chef restent en place tant que leur matrice n'est pas confirmée.
- La comptabilité agence et le courrier ne sont pas migrés intérieurement car ils sont gelés.
- Les redirections sans compagnie/agence restent celles des guards/landings actuels.
- Aucune capture multi-largeur ni lecteur d'écran réel n'est produit automatiquement par ces tests.
