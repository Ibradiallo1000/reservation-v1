# Règle d'architecture — Source unique de vérité des indicateurs

Dans TELIYA, **chaque indicateur du dashboard doit avoir UNE SEULE source de vérité**.

Aucun indicateur ne doit être recalculé différemment dans plusieurs pages.  
Toutes les pages doivent utiliser les **mêmes services de calcul**.

---

## Source unique par indicateur

| Indicateur           | Source unique                          | Service / collection        |
|----------------------|----------------------------------------|-----------------------------|
| **CA réseau**        | `cashTransactions` (status = `"paid"`)  | `networkStatsService`       |
| **Billets vendus**   | `reservations` (statut ≠ cancelled)    | `networkStatsService`      |
| **Agences actives**  | `reservations` (locationId distincts) | `networkStatsService`      |
| **Véhicules disponibles** | `vehicles` (operationalStatus = GARAGE, technicalStatus = NORMAL) | `networkStatsService` |
| **Bus en circulation**   | `tripInstances` (status boarding / departed) | `networkStatsService`  |
| **Capacité réseau**  | `tripInstances` (seatCapacity / vehicle.capacity) | `networkStatsService` |
| **Réservations aujourd'hui** | `reservations` (date = today)   | `networkStatsService`      |

---

## Service à utiliser

**Toutes** les pages qui affichent ces indicateurs doivent appeler **uniquement** :

```ts
import { getNetworkStats } from "@/modules/compagnie/networkStats/networkStatsService";

const stats = await getNetworkStats(companyId, dateFrom, dateTo);
// Utiliser stats.totalRevenue, stats.totalTickets, stats.activeAgencies, etc.
```

---

## Pages concernées

Les pages suivantes **ne doivent JAMAIS recalculer** ces indicateurs localement (cashTransactions, reservations count, agences actives, véhicules disponibles, bus en circulation) :

- **CEOCommandCenterPage** — utilise `getNetworkStats`
- **ReservationsReseauPage** — utilise `getNetworkStats`
- **FinancesPage** — conteneur d’onglets ; les sous-pages (CA, Caisse) ne doivent pas recalculer CA réseau / billets en parallèle de `networkStatsService`
- **FlottePage** — pour tout indicateur partagé (ex. bus en circulation, véhicules disponibles), utiliser `getNetworkStats`
- **Composants Performance Réseau** — utiliser les données fournies par une page qui appelle `getNetworkStats`, ou appeler `getNetworkStats` eux-mêmes

Si un indicateur existe déjà dans `networkStatsService`, il **ne doit pas** être recalculé ailleurs dans le code.

---

## Objectif

Garantir la **cohérence des chiffres** dans toute l’application TELIYA :  
les mêmes indicateurs affichent les mêmes valeurs sur le Poste de pilotage, Réservations réseau, tableau agences et Flotte.
