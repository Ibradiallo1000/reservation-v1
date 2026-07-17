# TELIYA — Matrice d’autorisation des routes frontend

| Route | Canonique / alias | Espace | Capacité | Contexte | Guard / état |
|---|---|---|---|---|---|
| `/admin/*` | canonique | PLATFORM | `platform.view` | aucun | `PrivateRoute` |
| `/compagnie/:companyId/command-center` | canonique | COMPANY_COMMAND | `company.command.view` | compagnie | `PrivateRoute` + `TenantGuard` |
| `/compagnie/:companyId/accounting/*` | canonique | COMPANY_ACCOUNTING | `company.accounting.view` | compagnie | `PrivateRoute` + `TenantGuard` |
| `/compagnie/:companyId/digital-cash` | canonique | COMPANY_ACCOUNTING | `company.digital-payments.manage` | compagnie | `PrivateRoute` |
| `/compagnie/:companyId/garage/*` | canonique | COMPANY_COMMAND | `company.logistics.view` | compagnie | guard + feature inactive |
| `/agence/activite` | canonique | AGENCY | `agency.dashboard.view` | compagnie + agence | shell agence |
| `/agence/comptabilite` | canonique | AGENCY_ACCOUNTING | `agency.accounting.view` | compagnie + agence | `ProtectedRoute` |
| `/agence/comptabilite/treasury/*` | canonique | AGENCY_ACCOUNTING | `agency.treasury.mutate` | compagnie + agence | `ProtectedRoute` |
| `/agence/treasury/new-*` | alias compatible | AGENCY_ACCOUNTING | `agency.treasury.mutate` | compagnie + agence | même guard que canonique |
| `/agence/guichet` | canonique | COUNTER | `counter.sell` | compagnie + agence | `ProtectedRoute` |
| `/agence/boarding/*` | canonique | BOARDING | `boarding.manage` | compagnie + agence | `PrivateRoute` |
| `/agence/courrier/*` | canonique | COURIER | `courier.manage` | compagnie + agence | `ProtectedRoute` |
| `/agence/escale/*` | canonique | ESCALE | `escale.manage` | compagnie + agence | `PrivateRoute` |
| `/agence/fleet/*` | canonique différée | AGENCY | `fleet.view` | compagnie + agence | feature inactive explicite |
| routes CEO d’approbation/dépense historiques | conservées mais interdites | COMPANY_COMMAND | aucune prouvée | compagnie | `AccessDenied` |
| `/debug-auth` | développement seulement | diagnostic | n/a | session dev | composant et route inaccessibles en production via `import.meta.env.DEV` |

Les refus sont explicites : rôle inconnu, contexte compagnie/agence manquant, feature indisponible ou accès interdit. Aucun refus ne redirige vers `/`.
