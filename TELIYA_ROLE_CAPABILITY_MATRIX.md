# TELIYA — Matrice rôle-capacité frontend

La matrice exécutable est `src/authorization/capabilities.ts`. `hasCapability` sert à la cohérence visuelle et aux guards frontend, jamais à remplacer les Rules.

| Rôle | Capacités autorisées | Justification / source |
|---|---|---|
| `admin_platforme` | `platform.view`, `platform.manage`, vues compagnie/agences/comptabilité | routes admin et supervision Phase 0–3 |
| `admin_compagnie` | command center, agences/settings, vues agence/caisse | rôle CEO en consultation/supervision ; aucune capacité opérationnelle |
| `financial_director` | vue et opérations comptabilité compagnie | espace financier dédié |
| `company_accountant` | vue et opérations comptabilité compagnie | espace comptable dédié |
| `operator_digital` | `company.digital-payments.manage` | caisse digitale confirmée |
| `responsable_logistique` | `company.logistics.view` | rôle reconnu, feature différée |
| `chefAgence` | dashboard, départs, caisse en lecture, équipe, voyages | supervision agence confirmée ; aucune mutation financière |
| `superviseur` | même socle minimal actuellement prouvé de supervision agence | accès existants observés, sans extension |
| `agentCourrier` | `courier.manage` | espace courrier |
| `agency_accountant` | vue/validation comptable agence, mutation trésorerie, caisse en lecture | workflow comptable agence gelé |
| `guichetier` | `counter.sell` | espace guichet |
| `chefEmbarquement` | `boarding.manage` | espace embarquement |
| `agency_fleet_controller` | `fleet.view` | rôle différé, feature inactive |
| `escale_agent` | escale, guichet, embarquement | usages existants de l’espace escale |
| `escale_manager` | escale, guichet, embarquement, équipe et caisse en lecture | usages existants de supervision escale |

Toute paire absente est interdite. En particulier, CEO et chef d’agence n’obtiennent ni `agency.accounting.validate`, ni `agency.treasury.mutate`, ni `counter.sell`.

