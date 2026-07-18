# Teliya — Contrat de passage à la réservation

| Élément | Contrat conservé |
|---|---|
| Route principale | `/:slug/booking?departure&arrival&date&time` |
| Sous-domaine/domaine personnalisé | `/booking?...` via `pathBase` vide |
| Alias `/reservation` | entrée générique Phase 7.1, non forcée ici |
| `location.state.tripData` | départ normalisé, `companyId`, `agenceId`, nom et logo compagnie |
| `location.state.companyInfo` | id, slug, nom et logo |
| Identifiants requis | instance/template et agence restent dans state, jamais dans l’URL |
| Session storage | le tunnel conserve son cache `preload_*` et ses pending pointers existants |
| Refresh | critères publics permettent au tunnel de recharger l’offre ; la sélection exacte issue de state peut revenir au premier créneau historique |
| Retour navigateur | URL des résultats conserve les critères |
| Données interdites | passagers, réservations, paiements, comptes, ledger, contacts internes |

Aucune écriture, transition ou payload de réservation n’a été modifié.

