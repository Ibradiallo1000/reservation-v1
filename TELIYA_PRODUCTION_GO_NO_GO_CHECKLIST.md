# Checklist bloquante de production

| Catégorie | Contrôle | Responsable | Preuve | Statut | Bloquant | Action |
|---|---|---|---|---|---|---|
| Git/CI | commit revu, typecheck/tests/build/lint/E2E | Tech lead | CI verte | partiel | oui | étendre CI |
| Firebase | identité et projet staging confirmés | DevOps | `projects:list` | bloqué TLS | oui | réparer CA puis réauthentifier |
| Firestore | backup + dry-run + backfill staging | Data owner | JSON, SHA-256, rapports | non fait | oui | exécuter outil approuvé |
| Rules/Indexes | tests locaux + erreurs index staging | Security | logs emulator/staging | Rules local OK | oui | vérifier distant |
| Functions | smoke tests staging | Backend | logs | non fait | oui | exécuter sans production |
| Netlify/Variables | build staging et variables vérifiées | DevOps | deploy preview | non fait | oui | créer preview |
| Domaines/TLS | racine, sous-domaine, custom domain | DevOps | captures DNS/TLS | non fait | oui | recette réelle |
| PWA/SEO | runtime, cache, metadata, sitemap/robots | Frontend/SEO | Lighthouse + navigateur | non fait | oui | exécuter matrice |
| Marketplace/Pays/Villes/Trajets | données réelles cohérentes | Product/Data | rapport E2E | non fait | oui | recette multi-pays |
| Booking/Paiement/Billet | parcours autorisé sans argent réel | QA/Finance | cas de test | non fait | oui | procédure sandbox |
| Sauvegarde/Rollback | restauration répétée | DevOps/Data | exercice staging | préparé | oui | tester restauration |
| Monitoring/Support | alertes et astreinte | Ops | runbook | non vérifié | oui | assigner responsables |

Décision : **NO-GO** tant qu’un seul contrôle bloquant reste ouvert.
