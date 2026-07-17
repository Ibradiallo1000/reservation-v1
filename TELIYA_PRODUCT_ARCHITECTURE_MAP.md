# TELIYA — Carte d’architecture produit

## Carte active

```text
Application
├── Public / Marketplace (HomePage, RouteResolver, recherche, réservation, billets, suivi colis)
├── Plateforme (AdminSidebarLayout)
├── Compagnie / CEO (CompagnieLayout + providers période/snapshot/finance)
├── Comptabilité compagnie (CompanyAccountantLayout)
├── Agence (ManagerShellPage)
│   ├── activité, trajets, caisse, équipe, rapports
│   ├── courrier (CourierLayout)
│   └── flotte (routée mais masquée dans le MVP)
├── Guichet (AgenceGuichetPage)
├── Embarquement (BoardingLayout)
├── Escale (EscaleLayout)
└── Garage / logistique (routé mais différé)
```

## Chaîne technique

```text
React view → hook/context/controller → service métier → Firebase SDK
                                               ├── Firestore
                                               ├── Auth
                                               ├── Storage
                                               └── callable/scheduled Functions
Netlify → SPA + sous-domaines → RouteResolver → identité compagnie
```

Les primitives UI ne constituent pas encore une frontière stricte : les pages mélangent fréquemment orchestration, listeners et rendu. Les services financiers et opérationnels sont toutefois identifiables et doivent rester contrôleurs/sources métier pendant la refonte.

## Providers et dépendances

| Zone | Shell / provider | Dépendances dominantes | Source de vérité |
|---|---|---|---|
| Global | `AuthProvider` | Auth + user/company | Auth + `users`, `companies` |
| Plateforme | `AdminSidebarLayout`, `PageHeaderProvider` | compagnies/plans | collections racine |
| CEO | `CompagnieLayout`, période, snapshot, positions | agrégats réseau/finance | transactions, activité, agences |
| Comptable compagnie | `CompanyAccountantLayout` | période/snapshot | ledger/transactions/comptes |
| Agence | `ManagerShellPage`, `TenantGuard` | agence active | sous-collections agence |
| Guichet/compta | `AuthCurrencyProvider` | session, réservations, comptes | shifts + financialTransactions |
| Courrier | `CourierLayout`, workspace | session/envois/lots | logistics/data + courierSessions |
| Public | `RouteResolver` | hostname/slug | company + trajets publics |

## Modules et dépendances métier

- Billetterie : `weeklyTrips` configure; `tripInstances` porte l’exécution/inventaire; réservations et paiements alimentent billet, activité et finance.
- Caisse : `shifts`/`shiftReports` pilotent le poste; `financialTransactions` et `accounts/ledger` sont financiers; `cashTransactions` reste une trace opérationnelle/legacy.
- Courrier : session → shipment → batch/transport → contrôle arrivée → remise; écritures financières créées à la vente et validées via la session.
- CEO/comptabilité : doivent lire/agréger les écritures sources, jamais reconstruire ou réparer des mouvements depuis l’UI.
- Marketplace : recherche départ/arrivée → trajets/compagnies → réservation → preuve/paiement → validation opérateur → billet.

## Sources de vérité et dettes

| Sujet | Source recommandée observée | Dette coexistante |
|---|---|---|
| Exécution trajet | `tripInstances` | `weeklyTrips`, `tripAssignments`, anciennes formes departure/time |
| Finance | `financialTransactions`, accounts/ledger | `cashTransactions`, `payments`, agrégats d’affichage |
| Session agence | `shifts` + `shiftReports` | statuts cash parallèles et libellés FR majuscules |
| Réservation | document agence + statut/lifecycle audité | champs et statuts legacy |
| Courrier | shipment `currentStatus` + `transportStatus` | anciens documents incomplets et tracking legacy chiffré |
| Rôle | user role(s) + claims | listes et alias répartis dans quatre sources |

## Cloud Functions

Functions identifiées : création compagnie/admin et agence, suppression compagnie, migrations, ping, synchronisation de trajets quotidiens, génération planifiée de `tripInstances`, validation paiement et contrôle d’expiration d’abonnement. Leur déploiement n’a pas été vérifié à distance.
