# TELIYA — Carte du modèle de données

## Schéma fonctionnel

```text
companies/{companyId}
├── agences/{agencyId}
│   ├── users, weeklyTrips, tripAssignments, departures
│   ├── reservations, shifts, shiftReports
│   ├── courierSessions, batches, dailyStats, activityLogs
│   ├── cashSessions, cashReceipts, cashAudits, comptaEncaissements
│   └── agencyLiveState/current
├── routes/{routeId}/stops
├── tripInstances/{tripInstanceId}/{inventory,progress}
├── accounts/{accountId}/ledger
├── financialAccounts, financialMovements, financialTransactions
├── payments, expenses, payables, transferRequests
├── vehicles, fleet*, fuelLogs, tripCosts
└── logistics/data/shipments/{shipmentId}
racine: users, villes, paymentMethods, invitations, publicReservations,
        publicShipmentTrack, plans, subscriptionRequests, medias
```

## Collections principales

| Chemin / groupe | Source / consommateurs | Writers | Champs/statuts clés | Risque |
|---|---|---|---|---|
| `companies` | tenant, branding, auth, public | admin/functions | slug, devise, plan, config | document large/couplé |
| `companies/*/agences` | agence/CEO | admin compagnie | ville, timezone, active | duplication companyId |
| `weeklyTrips` | configuration horaire | admin/planification | route, jour, heure, prix | legacy face à tripInstances |
| `tripInstances` | exécution/inventaire | Function + opérations | routeId, date, status, capacité | anciennes formes de champs indexées |
| `reservations` (agence) | billet/guichet/public/finance | client, guichet, opérateur, boarding | canal, statut/lifecycle, montant, payment | statut et source financière multiples |
| `payments` | preuve/paiement online | client/opérateur | status pending/validated/refused, channel | cohérence avec réservation/transaction |
| `shifts`, `shiftReports` | poste guichet | agent/comptable | pending/active/paused/closed/validated_agency/validated | deux modèles de statut |
| `accounts/*/ledger` | source solde comptable critique | transactions contrôlées | balance, type, idempotence | double écriture/Rules complexes |
| `financialTransactions` | ledger analytique canonique | services financiers | type, debit/credit, reference, performedAt | concurrence sources legacy |
| `financialAccounts`, `financialMovements` | trésorerie | comptables | type, agencyId, performedAt | modèles parallèles à accounts |
| `cashTransactions` | trace terrain | guichet/online | sessionId, source, amount, createdAt | explicitement non source ledger |
| `dailyStats`, `agencyLiveState` | dashboards/cache | services secondaires | date, revenue, counts | dérive vs sources; écritures non critiques |
| `activityLogs`, `agentHistory` | audit/opérations | services métier | actor, action, createdAt | volume, requêtes groupées |
| `logistics/data/shipments` | courrier | agents courrier | currentStatus, transportStatus, sender/receiver, timestamps | PII + double statut + legacy |
| `courierSessions`, `batches` | poste et transport courrier | courrier/comptable | PENDING→ACTIVE→CLOSED→VALIDATED*; DRAFT→READY→DEPARTED→ARRIVED/CLOSED | cohérence financière |
| `publicShipmentTrack` | suivi client | sync contrôlée | publicId, label, données minimisées | anciens formats chiffrés/plain |
| `users` | rôle/tenant | admin/functions | role/roles, companyId, agencyId | divergence claims/document |

## Relations et invariants

- Réservation ↔ `tripInstanceId`; inventaire/places doivent évoluer atomiquement ou via hold contrôlé.
- Paiement validé ↔ réservation confirmée ↔ une `financialTransaction` et une clé d’idempotence.
- Shift clôturé ↔ shiftReport ↔ pending cash; validation agence augmente exactement `agency_cash` et crée un ledger unique.
- Shipment ↔ session courrier ↔ batch/tripInstance; `transportStatus` décrit le bus, `currentStatus` le workflow client.
- Agrégats `dailyStats`/`agencyLiveState` sont dérivés et ne doivent pas devenir source financière.

## Index et règles

`firestore.indexes.json` contient des index collection/collectionGroup pour réservations, paiements, shipments, finances, activité, trajets, caisse et affectations. `firebase.json` le relie correctement. Les Rules définissent explicitement ces chemins et un deny final. Déploiement réel non vérifié.

## Données sensibles

Réservations et shipments contiennent identité/téléphone; users contient rôle et rattachements; paiements/preuves et comptes sont financiers. Les lectures publiques doivent rester limitées aux profils/tracking dédiés, jamais aux documents internes.
