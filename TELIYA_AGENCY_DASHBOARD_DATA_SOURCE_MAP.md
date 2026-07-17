# TELIYA — Carte des sources du dashboard agence

Toutes les sources restent celles de `useAgencyActionCockpit`; Phase 6 n’ajoute aucune lecture.

| Bloc / indicateur | Source existante | companyId | agencyId | Période | Calcul / capacité | Accès | Validation |
|---|---|---|---|---|---|---|---|
| postes guichet | `agences/{agencyId}/shifts` + réservations de session | requis | requis | actifs/paused, aujourd’hui | agrégation hook / `agency.dashboard.view` | lecture | confirmée |
| sessions courrier | `courierSessionsRef` | requis | requis | actives | comptage hook | lecture | confirmée |
| billets/réservations | `agences/{agencyId}/reservations` | requis | requis | date locale | normalisation existante | lecture | confirmée |
| réservations en ligne | même collection, timestamps/statuts existants | requis | requis | jour agence | confirmé/payé selon hook | lecture | confirmée |
| courrier | `shipmentsRef`, origine/destination agence | requis | requis | jour agence | frais/statuts existants | lecture | confirmée |
| départs planifiés | `weeklyTrips`, affectations et `tripInstances` | requis | requis | jour agence | `getTripsAnalysis` | lecture | confirmée |
| workflow départ | sous-collection de workflows de départ | requis | requis | jour agence | statut/confirmation existants | lecture | confirmée |
| caisse synthétique | audit caisse, ledger et soldes existants | requis | requis | jour agence | `agency.cash.read` | lecture | confirmée, aucune action |
| dépenses | `listExpenses` filtré agence et `paid` | requis | requis | aujourd’hui | calcul hook historique | lecture | non affiché comme action |
| alertes | `getAlerts` du hook | requis | requis | instantané/jour | sessions longues, retards, absence de vente | lecture | confirmée |
