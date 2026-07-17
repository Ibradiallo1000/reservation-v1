# TELIYA — Registre des risques Phase 0

Probabilité : H/M/B. Statut initial : ouvert sauf mention.

| ID | Domaine | Gravité | Prob. | Preuve / impact | Recommandation | Phase |
|---|---|---:|:---:|---|---|---|
| R-001 | sécurité/env | critique | H | cloud par défaut en local; prod/staging aliasés; risque données réelles | garde explicite prod, environnement dev isolé, procédure locale | P1 |
| R-002 | finance/règles | critique | M | Rules >4100 lignes, incidents limite 1000 expressions | tests Rules complets obligatoires et budget de complexité | P1/P5 |
| R-003 | CI | élevée | H | `test:rules` absent de `.github/workflows/ci.yml` | job émulateur bloquant | P1 |
| R-004 | QA | élevée | H | Playwright présent mais sans script npm/CI | script et smoke tests par rôle | P1/P10 |
| R-005 | permissions | élevée | H | rôles répartis entre 4 sources + aliases | registre canonique, test matrice UI/Rules | P2 |
| R-006 | routes | élevée | M | routes trésorerie agence avec guards différents | audit route/action/Rules avant shell | P2/P5 |
| R-007 | données | élevée | H | weeklyTrips/tripInstances et champs anciens/nouveaux | geler source tripInstances, documenter adapters | P4 |
| R-008 | finance | élevée | H | payments/cashTransactions/transactions/ledger coexistent | source canonique et réconciliation lecture seule | P5/P6 |
| R-009 | sécurité | moyenne | H | `/debug-auth` public | retirer/conditionner après validation | P2 |
| R-010 | PWA | moyenne | M | trois workers potentiels | audit enregistrement/cache puis un seul propriétaire | P1/P10 |
| R-011 | performance | élevée | M | nombreux listeners, collectionGroup, dashboards, vendor unique | bornes, unsubscribe, pagination, profiling | P3–P9 |
| R-012 | coût Firestore | élevée | M | agrégations réseau et listeners multi-agences | budgets requêtes, caches dérivés contrôlés | P6/P8 |
| R-013 | courrier | élevée | M | currentStatus/transportStatus + legacy | préserver double état et tests transitions | P4 |
| R-014 | accessibilité | élevée | H | modales/tables/contrastes non testés | checklist clavier, focus, zoom, contraste | P1–P10 |
| R-015 | responsive | élevée | H | POS/tables/dashboards denses, pas de preuve multi-largeur | matrice 320→1440 + PWA/impression | P3–P10 |
| R-016 | maintenance | moyenne | H | Tailwind/CSS/Emotion/styled-jsx + plusieurs UI libs | primitives internes progressives | P1 |
| R-017 | secrets | moyenne | M | scripts Admin consomment service accounts locaux | exécution contrôlée, credentials éphémères | P1 |
| R-018 | App Check | moyenne | M | initialisation optionnelle | politique par environnement et monitoring | P1 |
| R-019 | index | élevée | M | fichier relié mais état distant non prouvé | validation staging et inventaire deploy | P1 |
| R-020 | tests | moyenne | H | aucune couverture chiffrée, Functions/PWA non testées | seuil ciblé sur invariants, pas métrique cosmétique | P1/P10 |
| R-021 | UX | moyenne | H | aliases/redirections, navigation fragmentée | rationaliser navigation sans supprimer compat | P2 |
| R-022 | public/PII | élevée | M | détail réservation et tracking publics | tests Rules d’énumération/IDOR/minimisation | P7 |
| R-023 | déploiement | élevée | M | CI build mais pas de staging gate/release formalisé | preview, staging, approbation prod, rollback tagué | P10 |
| R-024 | documentation | faible | H | README port/scripts obsolètes | aligner après Phase 0, sans changer runtime | P1 |

Les preuves distantes (règles/index réellement déployés, variables Netlify, App Check et IAM) restent « à vérifier »; elles ne sont pas déclarées conformes.
