# TELIYA — Phase 0 — Baseline audit

Date de référence : 2026-07-17. Portée : lecture statique du dépôt local, sans connexion aux données distantes et sans exécution applicative.

## État réel

Teliya est une SPA SaaS multi-tenant React 18.3 / TypeScript 5.8 / Vite 5.4 / Tailwind 3.4, routée par React Router 6.21. Firebase 10.14 fournit Auth, Firestore, Storage, Functions et App Check; Netlify héberge la SPA et une Edge Function de canonicalisation des sous-domaines. Le dépôt contient 1 094 fichiers, une PWA Workbox et des fonctions Firebase TypeScript.

L’application active couvre plateforme, portail public/Marketplace, compagnie/CEO, comptabilité compagnie, agence, guichet, embarquement, escale, courrier et caisse digitale. Flotte, garage/logistique et finance avancée restent dans le routeur mais sont en partie masqués par `src/config/featureFlags.ts`.

## Architecture et infrastructure

- Entrée : `src/main.tsx` / `src/App.tsx`; `AuthProvider` global; routes dans `src/AppRoutes.tsx`.
- Guards : `PrivateRoute`, `ProtectedRoute`, `TenantGuard`; devise via `AuthCurrencyProvider`.
- Providers spécialisés : période et snapshot réseau, positions financières, en-tête de page.
- Données : services Firestore distribués par module; absence d’une couche repository uniforme.
- PWA : `vite-plugin-pwa` génère `teliya-sw.js`, cache auto-update; deux autres workers statiques (`public/sw.js`, `public/service-worker.js`) créent un risque de concurrence/legacy.
- Hébergement : Netlify, `dist`, fallback SPA, sous-domaines dynamiques, Edge Function `redirect-www-subdomain`.
- Firebase : `firebase.json` relie bien `firestore.rules`, `firestore.indexes.json`, `storage.rules` et Functions; émulateurs Auth/Firestore/Functions/Storage configurés.

## Environnements et sécurité

- `.firebaserc` contient les alias `prod=monbillet-95b77` et `staging=teliya-staging`; aucun alias `default` ou `dev`.
- `.env`, `.env.local` et `.env.staging.local` existent localement et sont ignorés. Les valeurs n’ont pas été reproduites dans cet audit. Aucun secret évident n’est suivi; les exemples sont vides.
- La configuration Firebase n’est plus hardcodée : variables Vite obligatoires et erreur immédiate si absentes.
- Le mode normal et staging utilisent le cloud (`VITE_USE_EMULATORS=false`). Le code interdit d’activer les émulateurs avec un projectId non local, mais n’empêche pas un développeur d’utiliser directement prod/staging en local.
- App Check est optionnel : sans `VITE_RECAPTCHA_V3_KEY`, il n’est pas initialisé.
- Plusieurs scripts Admin attendent un service account local. Les chemins sont ignorés, mais leur exécution est à contrôler strictement.

## Git et rollback

- Branche au début de l’audit : `infra/phase-1.3.6-firestore-staging-deploy`, liée à `origin`.
- Dernier commit : `12726731 chore: prepare and validate firestore staging deployment`.
- Worktree initial : propre.
- Tags : `stable-billetterie-comptable-e97ed199`, `stable-courrier-v1`, `stable-phase0-2026-07-10`.
- Branches de sauvegarde/rollback présentes; possibilité de rollback par tag/commit, mais aucune stratégie de release automatisée formalisée dans la CI.
- `dist/`, `dev-dist/`, rapports Playwright, résultats de tests et logs Firebase/Firestore sont ignorés et non suivis.

## Tests et CI

| Domaine | État | Conclusion |
|---|---|---|
| Vitest unitaire/métier | présent | exécuté en CI via `test:run`, couverture non configurée |
| Rules Firestore | 5 scénarios ciblés + runner | présent et localement scriptable, absent de CI |
| Playwright | 10 specs métier | présent, aucun script npm `test:e2e`, absent de CI |
| Functions | pas de suite dédiée identifiée | insuffisant |
| PWA | pas de test automatisé identifié | absent |
| Build/typecheck | `tsc && vite build` | exécuté en CI si secrets disponibles |

La documentation README est obsolète sur le port (`5192` contre `5190`) et annonce `test:e2e`, absent de `package.json`.

## Règles et index

`firestore.rules` est volumineux (plus de 4 100 lignes), tenant-aware et contient des autorisations par rôles, champs et transactions. Les incidents connus montrent que des règles métier valides peuvent dépasser la limite de 1 000 expressions. Les index sont reliés à Firebase et couvrent réservations, paiements, finance, courrier, trajets, caisse et activité. Leur présence dans le fichier ne prouve pas leur déploiement sur chaque projet.

## Risques dominants

- Critique : accès local direct possible aux projets cloud, sans séparation dev complète ni garde de production.
- Critique : surface financière complexe protégée par des règles ayant déjà atteint la limite d’évaluation.
- Élevé : tests Rules et E2E absents de la CI.
- Élevé : quatre sources de rôles non parfaitement synchronisées (types, constante partielle, guards, Rules).
- Élevé : coexistence de modèles legacy/canoniques (statuts, dates, cashTransactions/payments, weeklyTrips/tripInstances).
- Moyen : route publique `/debug-auth` montée sans guard.
- Moyen : plusieurs service workers et gros chunk vendor unique; risque PWA/cache/performance.

## Limites de preuve

Audit statique seulement : aucune console Firebase/Netlify, donnée distante, métrique réelle, largeur d’écran, lecteur d’écran, test Rules, test E2E ou Lighthouse n’a été exécuté. Toute affirmation correspond au code versionné au 2026-07-17.
