# TELIYA — Matrice routes, rôles et guards

Source montée : `src/AppRoutes.tsx`. Toutes les routes privées utilisent Auth; `TenantGuard` ajoute le contrôle de compagnie/agence quand indiqué. Les enfants héritent du guard du layout.

## Public

| Route(s) | Composant / effet | Guard | Données / mutations | Risque |
|---|---|---|---|---|
| `/`, `/a-propos`, `/:slug/*` | Home / `RouteResolver` | public, résolution sous-domaine | compagnies, trajets, contenus | wildcard large, SEO/canonical |
| `/resultats`, `/villes` | recherche plateforme | public | villes/trajets | requêtes et états vides |
| `/:slug/reserver` | réservation client | public | hold/réservation | concurrence places/paiement |
| `/:slug/reservation/:id`, `/:slug/mon-billet`, `/mes-*` | détail/billets | public avec preuve d’identité applicative | réservations | exposition par identifiant à vérifier Rules |
| `/track`, `/track/:trackingPublicId` | suivi courrier | public | tracking public | PII et legacy tracking |
| `/login`, `/register`, invitation, pages légales | auth/légal | public | users/invitations | validation tenant |
| `/debug-auth` | diagnostic Auth | aucun | état auth | route debug exposée |

## Plateforme et compagnie

| Préfixe / routes | Rôles UI | Guard/provider | Actions principales |
|---|---|---|---|
| `/admin/*` | `admin_platforme` | `PrivateRoute`, PageHeader | compagnies, plans, abonnements, paiements, médias, stats |
| `/compagnie/:companyId/*` | `admin_compagnie`, `admin_platforme` | `PrivateRoute` + tenant + période/snapshot | command center, agences, paramètres, finance consolidée, clients |
| `.../payment-approvals` | mêmes + `RequireRole` interne | double contrôle | approbations |
| `.../digital-cash` | `operator_digital`, admins | privé + tenant | valider/refuser preuves/paiements online |
| `.../notifications` | admins, `company_accountant`, `financial_director` | privé + tenant | lecture/état notifications |
| `.../financial-settings` | admins, comptables compagnie | privé + tenant | paramètres financiers |
| `.../trip-costs` | chef agence, comptables compagnie, admins | privé + tenant | coûts trajet |
| `.../garage/*` | responsable logistique, alias `chef_garage`, admins | privé + tenant | flotte/routes/maintenance/transit/incidents/logistique; différé MVP |
| `.../accounting/*` | `company_accountant`, `financial_director`, admins | privé + tenant | réseau financier, flux, dépenses, trésorerie, rapports, paramètres |

Aliases CEO : `dashboard→command-center`, `ceo-expenses`/`expenses-approvals→audit-controle`, `revenus-liquidites`/`caisse`/`treasury→finances`, `fleet*→flotte`, `operations-reseau→reservations-reseau`, `comptabilite→audit-controle`.

## Agence

| Route(s) | Rôles UI | Provider/guard | Actions |
|---|---|---|---|
| `/agence/{activite,caisse,trajets,...}` | chef, superviseur, courrier, escale, contrôleur flotte, admin compagnie | privé + tenant; devise sur sous-routes | lecture activité; certaines routes trésorerie mutent |
| `/agence/validation-departs`, `arrivees-attendues` | chef, superviseur, admin | protection interne | validation départ/arrivée |
| `/agence/planification-trajets` | chef, superviseur, contrôleur flotte, admin | protection interne | affectations |
| `/agence/fleet/*` | contrôleur flotte, admin | protection interne | flotte; différé MVP |
| `/agence/courrier/*`, `/scan*` | agent courrier, chef, admin | devise sur espace courrier | sessions, envois, lots, réception, remise, rapports |
| `/agence/boarding/*` | chef embarquement, escale agent/manager, admin | `PrivateRoute` | live, scan, embarquement |
| `/agence/escale/*` | escale agent/manager, chef, admin | privé + tenant | bus, embarquement, manifeste, caisse |
| `/agence/guichet` | guichetier, chef, escale, admin | devise | poste, vente, encaissement, clôture |
| `/agence/comptabilite` | comptable agence, guichetier, chef, superviseur, admin | devise | sessions, caisse, historique |
| `/agence/comptabilite/treasury/*` | comptable agence, admins | devise | mouvements/transfer/payable |
| `/agence/cash-sessions` | guichet, courrier, comptable, chef, escale manager, admin | devise | contrôle sessions |
| `/agence/receipt/:id`, `/agence/reservations/print` | chef, guichet, escale manager, admin | devise | lecture/impression |

## Matrice synthétique des capacités

| Rôle | Lecture | Écriture | Validation | Administration |
|---|---|---|---|---|
| admin_platforme | plateforme + tenants selon Rules | configuration plateforme | selon routes spécialisées | oui |
| admin_compagnie | toute compagnie + agence | structure/paramètres/opérations autorisées | oui selon route | compagnie |
| financial_director | finance compagnie | trésorerie selon Rules | supervision/approbation | non structure |
| company_accountant | finance compagnie | opérations comptables | flux autorisés | non |
| operator_digital | caisse digitale | statut preuve/paiement | paiement online | non |
| chefAgence / superviseur | agence | opérations/équipe/planification | départs et sessions selon Rules | agence |
| agency_accountant | compta agence | caisse/trésorerie | sessions agence | non |
| guichetier | guichet et ses sessions | vente/encaissement/clôture | non comptable | non |
| agentCourrier | courrier | envois/session/remise | clôture opérationnelle | non |
| chefEmbarquement | embarquement | statuts boarding | embarquement | non |
| escale_agent / manager | escale/guichet | vente/embarquement; manager équipe/caisse | limitée | escale manager |
| agency_fleet_controller | flotte/planification | affectations/flotte | logistique | non |

## Divergences prouvées

- `constants/roles.ts` omet les rôles finance, digital, superviseur et escale réellement utilisés.
- `PrivateRoute` normalise plusieurs alias; les Rules acceptent encore davantage d’alias boarding/legacy.
- Le shell agence autorise des rôles larges puis masque/redirige dans `ManagerShellPage`; navigation et route guard ne sont donc pas une seule matrice.
- Certaines routes trésorerie sous `/agence` héritent seulement du shell large, tandis que leurs équivalents sous `/agence/comptabilite` ont `comptabiliteTreasury`; revue ciblée nécessaire avant Phase 2.
