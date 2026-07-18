# Audit des environnements Phase 9

| Environnement | Projet/alias | Variables | Services/URL | Accès | Risque |
|---|---|---|---|---|---|
| local historique | `monbillet-95b77` via `.env` | présentes, valeurs non reproduites | Vite local → cloud production | démarrage bloqué par `environmentSafety` | critique si dérogation locale activée |
| émulateurs | `demo-teliya-local` | `.env.emulators.example` | Auth 9099, Firestore 8080, Functions 5001, Storage 9199 | disponible; Rules testées | Java 17 bientôt non supporté par CLI 15 |
| development | dépend du mode Vite et `.env` | `.env` charge production | localhost 5190 | volontairement bloqué sans dérogation | Playwright actuel démarre ce mode |
| staging | `teliya-staging`, alias `staging` | `.env.staging.local` cohérent | Firebase cloud; URL Netlify non établie | indisponible depuis Node CLI | certificat TLS non reconnu + token à réauthentifier |
| production | `monbillet-95b77`, alias `prod` | `.env` | Firebase/Netlify, `teliya.app` attendu | hors périmètre | aucun test/migration/déploiement autorisé |

Firebase CLI 14.25.0, Node 22.23.1, Java 17.0.17, horloge UTC correcte. Aucun proxy explicite détecté. Node échoue avec `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; Firebase avec `unable to verify the first certificate`. La correction sûre consiste à faire installer/importer par l’administrateur système le certificat racine/intermédiaire réellement utilisé, puis configurer si nécessaire `NODE_EXTRA_CA_CERTS` vers un bundle approuvé. Ne jamais employer `NODE_TLS_REJECT_UNAUTHORIZED=0`.
