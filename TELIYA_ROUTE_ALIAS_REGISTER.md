# TELIYA — Registre des aliases de routes

| Alias | Route canonique visuelle | Rôle/espace | Usage/lien | Risque | Décision Phase 3 | Suppression éventuelle |
|---|---|---|---|---|---|---|
| `/compagnie/:id/dashboard` | `/compagnie/:id/command-center` | CEO | compatibilité | faible | conservé, `match` actif | après télémétrie |
| `/compagnie/:id/operations-reseau` | `/compagnie/:id/reservations-reseau` | CEO | legacy | moyen | conservé, absent du menu | phase routes |
| `/compagnie/:id/treasury` | `/compagnie/:id/finances` | CEO | legacy | moyen | conservé, `match` Finance | phase routes |
| `/compagnie/:id/caisse` | `/compagnie/:id/finances` | CEO | legacy | moyen | conservé, `match` Finance | phase routes |
| `/compagnie/:id/revenus-liquidites` | `/compagnie/:id/finances` | CEO | legacy | moyen | conservé, `match` Finance | phase routes |
| `/compagnie/:id/ceo-expenses` | `/compagnie/:id/audit-controle?tab=depenses` | CEO | responsabilité contestée | élevé | route conservée, aucun lien | après audit sécurité |
| `/compagnie/:id/expenses-approvals` | `/compagnie/:id/audit-controle?tab=depenses` | CEO | responsabilité contestée | élevé | route conservée, aucun lien | après audit sécurité |
| `/compagnie/:id/comptabilite` | `/compagnie/:id/audit-controle?tab=controle` | CEO | terme ambigu | moyen | route conservée, aucun lien | phase routes |
| `/agence/dashboard` | `/agence/activite` | agence | compatibilité | faible | conservé, `match` Aujourd'hui | phase routes |
| `/agence/operations` | `/agence/activite#activite-operations` | agence | ancre | moyen | conservé, `match` Aujourd'hui | phase routes |
| `/agence/finances` | `/agence/caisse#caisse-sessions` | agence | legacy | moyen | conservé, `match` Caisse | phase routes |
| `/agence/treasury` | `/agence/caisse#caisse-tresorerie` | agence | legacy sensible | élevé | conservé, `match` Caisse ; mutations non liées | après audit sécurité |
| `/agence/team` | `/agence/escale/equipe` pour Escale | escale | ancien changement de shell | élevé | ancien chemin conservé ; nouveau menu canonique | après validation |
| `/agence/courrier/reception` | `/agence/courrier/arrivages` | courrier | compatibilité | faible | intact | phase courrier autorisée |

Aucun alias n'est supprimé par la Phase 3. Les nouvelles navigations utilisent uniquement les routes canoniques indiquées.
