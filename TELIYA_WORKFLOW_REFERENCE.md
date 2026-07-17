# TELIYA — Référence des workflows implémentés

## Billetterie guichet

```text
shift PENDING → ACTIVE ↔ PAUSED → vente/réservation confirmée
→ billet/receipt + transaction/activité → CLOSED
→ VALIDATED_AGENCY (comptable agence) → VALIDATED (niveau final si utilisé)
```

Acteurs : guichetier, chef/escale selon route, comptable agence. Mutations critiques : réservation, inventaire, shift/report, financialTransaction, pending_cash, agency_cash, ledger. Timestamps serveur attendus. Erreurs : session absente/non active, place occupée, Rules, divergence totals. Invariant : aucune écriture dashboard ne doit bloquer le commit comptable.

## Réservation en ligne

```text
recherche départ/arrivée → tripInstance disponible → hold/inventaire
→ réservation + preuve/paiement pending → file opérateur digital
→ validation: payment validated + réservation confirme
→ transaction Mobile Money idempotente → billet
ou refus → libération/état refusé selon service
```

Acteurs : client puis `operator_digital`. Les détails de preuve sont récupérés par routes publiques/résolution de slug; la validation est dans `onlineReservationOperatorCommit`. Risques : expiration hold, double validation, incohérence payment/réservation/ledger.

## Départ et embarquement

```text
weeklyTrip/route → génération tripInstance SCHEDULED
→ affectation véhicule/équipage → préparation/departure
→ réservations + scan/check-in/boarding log
→ départ/progress → ARRIVED → clôture/validation
```

Acteurs : planificateur, contrôleur flotte, chef embarquement, escale, chef agence. Sources : tripInstances, tripAssignments, departures, reservations, boarding logs/stats/locks. La coexistence de weeklyTrips, tripAssignments et tripExecutions impose de ne pas inventer une transition unique avant migration.

## Courrier / colis

```text
session PENDING→ACTIVE → shipment CREATED (+ paiement/ledger)
→ batch DRAFT→READY → affectation ASSIGNED
→ départ: currentStatus/transportStatus IN_TRANSIT
→ arrivée transport: transportStatus ARRIVED + needsValidation
→ contrôle physique: currentStatus ARRIVED
→ READY_FOR_PICKUP → DELIVERED
→ session CLOSED → VALIDATED_AGENCY → VALIDATED
```

Acteurs : agent courrier origine/destination, chef/comptable pour validation. États incidents possibles : CANCELLED, LOST, CLAIM_PAID. Le double statut transport/client est intentionnel et ne doit pas être fusionné par l’UI.

## Comptabilité agence

```text
poste CLOSED → réception à valider
→ audit ventes/totaux → VALIDATED_AGENCY
→ pending_cash ajusté, agency_cash crédité, ledger unique
→ historique/solde; éventuelle validation finale
```

Les writes minimaux autorisés dans la transaction sont shift, shiftReport, pending_cash, agency_cash, ledger. `dailyStats`, live state et historiques d’affichage restent secondaires/non bloquants.

## Chef comptable / trésorerie

```text
agences → comptes caisse/banque/Mobile Money/clearing
→ mouvements, dépenses, payables, transferts
→ rapprochement/diagnostic → rapports
```

Les dashboards et rapports lisent/agrègent `financialTransactions`, comptes et mouvements. Ils ne doivent jamais réparer une écriture manquante depuis une réservation.

## CEO

```text
activité réseau + réservations + performance agences/trajets
→ positions financières consolidées
→ alertes/audit/approbations → décision
```

Le CEO est un espace de supervision. Les routes d’approbation existantes doivent rester explicites; aucune mutation cachée ne doit être introduite dans les cartes KPI.

## Erreurs transverses à préserver

- `permission-denied` avec `lastStep=null` peut signifier lecture initiale refusée/limite Rules, pas mauvais rôle.
- Toute transition réservation doit passer par le service de statut et créer l’auditLog.
- Toute écriture financière doit porter une référence/idempotence déterministe.
- Les timestamps legacy restent lisibles; les nouvelles requêtes doivent préférer timestamps serveur et timezone agence.
