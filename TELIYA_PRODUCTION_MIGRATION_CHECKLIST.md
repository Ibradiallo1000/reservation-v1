# Checklist migration production

- [ ] Validation technique et revue de code terminées.
- [ ] Staging disponible, sauvegardé et restaurable.
- [ ] Dry-run réel exporté et relu ligne par ligne.
- [ ] Ambiguïtés résolues par source métier autorisée.
- [ ] Backfill staging limité à `countryCode`, puis second dry-run idempotent.
- [ ] E2E Mali et autres pays réellement alimentés.
- [ ] Mobile, accessibilité, Lighthouse, PWA, sous-domaine et domaine personnalisé validés.
- [ ] Réservations, paiements, confirmations et billets vérifiés sans changement d’écriture.
- [ ] Autorisation production séparée obtenue.
- [ ] Sauvegarde production vérifiée avant toute écriture.
- [ ] Fenêtre, responsable, rollback et rapport après migration définis.
- [ ] Aucun déploiement ou backfill production couplé automatiquement à cette Phase 8.
