# TELIYA — Rapport Phase 4 : rôles et autorisations frontend

## Périmètre et décisions

La Phase 4 centralise la normalisation des rôles, les capacités, les espaces, les destinations et une matrice de routes. Elle ne change aucun workflow métier ni aucune permission backend.

- 15 rôles canoniques et 10 aliases historiques confirmés.
- `comptable` reste ambigu et n’est pas accepté par la normalisation pure.
- les rôles inconnus ne reçoivent aucun fallback.
- les contextes compagnie/agence manquants produisent un état explicite.
- flotte et logistique restent désactivées.
- les aliases de trésorerie agence ont désormais le même guard que leurs routes canoniques.
- les anciennes pages CEO d’approbation/dépense sont conservées comme routes interdites, sans toucher aux services.
- `/debug-auth` reste inaccessible en production : son composant et son élément de route sont neutralisés par `import.meta.env.DEV` (la chaîne du chemin peut rester dans le bundle minifié).

## Inventaire brut consolidé

Canoniques observés : `admin_platforme`, `admin_compagnie`, `financial_director`, `company_accountant`, `operator_digital`, `responsable_logistique`, `chefAgence`, `superviseur`, `agentCourrier`, `agency_accountant`, `guichetier`, `chefEmbarquement`, `agency_fleet_controller`, `escale_agent`, `escale_manager`.

Aliases observés : `admin_company`, `company_ceo`, `chefagence`, `chef_garage`, `chefgarage`, `agentcourrier`, `agent_courrier`, `chefembarquement`, `agency_boarding_officer`, `embarquement`.

Ambigus/non prouvés : `comptable`, `gestionnaire`, `support`. Aucun n’accorde une permission implicite.

## Sécurité visuelle et actions sensibles

| Surface | Décision frontend | Backend |
|---|---|---|
| création/transfert/payable trésorerie agence | comptable agence seulement, canonique et alias | à vérifier ultérieurement |
| validation/approbation CEO | liens retirés du command center, routes en refus explicite | à vérifier ultérieurement |
| chef d’agence | aucune mutation/validation comptable ni vente guichet ajoutée | à vérifier ultérieurement |
| comptable agence | capacités existantes préservées sans modifier les composants gelés | à vérifier ultérieurement |
| rôles différés | reconnus, aucune destination active | à vérifier avant activation |

## Validation

Les tests unitaires d’autorisation sont purs et n’utilisent pas Firestore. La recette réelle par comptes n’est pas possible sans comptes de test fournis; aucune identité n’a été inventée. Les résultats définitifs des commandes sont consignés dans le rapport final du commit.
