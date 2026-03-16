# Audit des sources des statistiques — Billets vendus

## Problème

- **Page Réservations** (source réelle) : 0 réservation aujourd'hui.
- **Dashboard** : 7 billets vendus aujourd'hui.

Les deux ne lisaient pas la même source / le même critère.

---

## Cause identifiée

| Source | Filtre utilisé | Collection |
|--------|----------------|------------|
| **Page Réservations** (CompagnieReservationsPage) | `createdAt` entre début et fin de période | `companies/{companyId}/agences/{agencyId}/reservations` |
| **Dashboard** (avant correction) | `date` (date du trajet) = aujourd'hui | `collectionGroup("reservations")` avec `date` |

Donc : les "7 billets" venaient de réservations dont la **date de trajet** est aujourd'hui, alors que la page Réservations affiche les réservations **créées** aujourd'hui (createdAt).

---

## Correction appliquée

**Décision : billets vendus = réservations créées.** Une seule logique pour toutes les périodes (jour, semaine, mois).

- **Collection** : `companies/{companyId}/agences/{agencyId}/reservations` (via `collectionGroup("reservations")`).
- **Filtre** : `createdAt` entre début et fin de la période (en Africa/Bamako pour les bornes de jour).
- **Billets vendus** = nombre de réservations **créées** dans la période (statut ≠ annulé), pour **toutes** les périodes.
- **Réservations aujourd'hui** = réservations créées aujourd'hui (createdAt dans la journée Bamako).
- **Agences actives** = agences ayant au moins une réservation créée dans la période.

Les périodes semaine / mois utilisent `getStartOfDayInBamako(dateFrom)` et `getEndOfDayInBamako(dateTo)` pour la plage createdAt, comme pour le jour.

---

## Logs de debug (console)

Dans `networkStatsService.getNetworkStats()` :

- `networkStats [date tz]` : today, startOfDay, endOfDay, dateFrom, dateTo, isTodayPeriod.
- `reservations source [by date]` : collection, filtre par `date`, docsCount, échantillon.
- `reservations source [by createdAt today]` : collection, filtre par `createdAt`, docsCount, sourceDocuments (si aujourd’hui).
- `networkStats [reservations today]` : reservationsTodayCount, totalTickets, source (createdAt vs date).
- `reservationsTodayCount` : valeur du compteur.
- `sourceDocuments (created today)` : nombre et liste des docs (créés aujourd’hui).
- `networkStats source` : objet stats complet.

Dans `ReservationsReseauPage` (après chargement des stats) :

- `reservations source [ReservationsReseauPage]` : totalTickets, reservationsToday, source.

---

## Pas de cache intermédiaire

Les indicateurs "billets vendus" et "réservations aujourd’hui" ne passent **pas** par :

- dailyStats
- statsCache
- aggregatedStats

Ils sont calculés à partir des **reservations** (collectionGroup) avec filtre `createdAt` pour aujourd’hui.

---

## Index Firestore

- **collectionGroup "reservations"** : `companyId` (ASC), `createdAt` (ASC) — déjà présent dans `firestore.indexes.json`.

---

## Résultat attendu

Quand aucune réservation n’est **créée** aujourd’hui :

- Page Réservations (période Aujourd’hui) : **0** réservation.
- Dashboard (Poste de pilotage / Réservations réseau, période Aujourd’hui) : **0** billets vendus, **0** réservations aujourd’hui.

Les deux écrans utilisent la même collection et le même critère (createdAt aujourd’hui en Bamako).
