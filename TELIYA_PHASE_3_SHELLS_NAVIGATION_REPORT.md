# TELIYA — Phase 3 — Rapport shells et navigation

## État initial

Branche initiale `audit/phase-2-user-journeys`, worktree propre, commit Phase 2 `2799b1f2` et baselines `8c642a93`/`3c488acc` présents. Branche créée : `refactor/phase-3-shells-navigation`.

## Réalisation

- Consolidation d'`InternalLayout` comme cadre commun, sans bibliothèque supplémentaire.
- Configurations typées pour Plateforme, Command Center, Comptabilité compagnie, chef d'agence, Boarding et Escale.
- Barre mobile par priorités, bouton « Plus », `Sheet` accessible, labels visibles, safe area et cibles 44 px.
- État actif partagé pour route exacte, sous-route, query/hash et alias documenté.
- Plateforme : ajout visuel de Supervision vers les routes existantes ; diagnostics exclus.
- CEO : taxonomie de supervision ; approbations/dépenses/flotte différée absentes du menu ; routes conservées.
- Chef comptable : Tableau financier, Réseau financier, Trésorerie, Flux, Rapports, Anomalies.
- Chef d'agence : Aujourd'hui, Départs, Caisse, Guichets, Embarquement, Courrier, Équipe, Trajets, Rapports. Aucune réservation agence n'a été inventée faute de route confirmée dédiée.
- Escale : Équipe canonique sous `/agence/escale/equipe`, ancien `/agence/team` conservé.
- Boarding : navigation typée et mobile prioritaire.
- Courrier, Guichet et Comptabilité agence : workflows et écrans internes intacts.
- `/debug-auth` : import et route DEV uniquement, comme `/dev/ui`.

## Fichiers métier protégés

Aucun service comptable, callback métier, Rule, index, collection, statut, claim, paiement, réservation, reçu, billet, Cloud Function ou donnée n'est modifié. `AppRoutes.tsx` ne change que la condition DEV du diagnostic et l'ajout de la route Escale Équipe sous le guard existant.

## Responsive et accessibilité

La structure garantit sidebar desktop, navigation mobile fixe, contenu sans overflow horizontal global ajouté, safe area, cibles tactiles et sheet sémantique avec focus/Escape/restauration gérés par Headless UI. Aucune validation visuelle réelle aux neuf dimensions ni lecteur d'écran n'est annoncée ; elle reste une étape de recette.

## Validation

- `npm run typecheck` : réussi.
- `npm run build` : réussi, 5 377 modules transformés ; avertissement historique du chunk vendor supérieur à 1 500 kB.
- Bundle production : aucune occurrence de `DebugAuthPage`, `/debug-auth`, `UiFoundationsPage` ou `/dev/ui`.
- Tests Vitest : le démarrage sous sandbox a échoué avant exécution (`esbuild` ne pouvait pas lire/résoudre `vitest.config.ts`). La relance hors sandbox n'a pas été autorisée en raison de la limite d'usage du mécanisme d'approbation. Aucun test n'est déclaré réussi ou échoué.
- Lint des nouveaux fichiers `src/navigation/*.ts` : réussi.
- Lint de l'ensemble des fichiers touchés : 39 constats (37 erreurs, 2 avertissements), principalement dette préexistante dans `AppRoutes`, les layouts et `ManagerShellPage` (`any`, hooks conditionnels, imports historiques). Les défauts introduits détectés (`X` et `useLocation` inutilisés) ont été corrigés ; aucune correction massive hors périmètre.
- `git diff --check` : réussi.

## Risques et suite

Restent différés : routes de trésorerie agence aux guards divergents, matrice `superviseur`, rôle flotte sans destination active, normalisation globale des rôles, aliases CEO sensibles et cadre de la comptabilité agence. La Phase 4 doit migrer en premier un dashboard/synthèse en lecture seule utilisant ces shells, sans toucher aux sources métier.
