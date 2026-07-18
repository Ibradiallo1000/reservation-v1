# Phase 9 — Staging et préparation production

## Résultat

La validation locale est saine, mais l’accès staging n’est pas opérationnel. La cause technique est une chaîne de certificats non reconnue par Node/Firebase CLI, doublée d’un token OAuth à réauthentifier après correction TLS. Aucun contournement TLS n’a été appliqué.

Un outil de sauvegarde, audit, dry-run et backfill staging à garde anti-production a été ajouté et testé sur fixtures. Il n’a pas été exécuté sur des données réelles. Les Rules passent sur émulateur. E2E, appareils, domaines, Lighthouse et PWA runtime restent non exécutés.

## Décision

**NO-GO**. Le build seul ne suffit pas. Conditions minimales : chaîne CA corrigée, identité staging vérifiée, backup et dry-run humains, backfill staging et contrôle idempotent, E2E réel sans paiement réel, domaines, mobile/accessibilité, Lighthouse/PWA, sécurité distante et exercice de rollback.
