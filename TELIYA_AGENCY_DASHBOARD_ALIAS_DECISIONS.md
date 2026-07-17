# TELIYA — Décisions de routes Dashboard agence

| Usage | Route | Décision Phase 6 |
|---|---|---|
| Aujourd’hui / dashboard principal | `/agence/activite` | canonique, utilisée par la navigation |
| ancien dashboard | `/agence/dashboard` | alias conservé, redirection vers `/agence/activite` |
| ancienne synthèse opérations | `/agence/operations` | alias conservé vers `/agence/activite#activite-operations` |
| racine agence | `/agence` | redirection existante vers `activite` conservée |

Le composant historique `AgencyActivityDomainPage` n’est pas supprimé. La route canonique charge désormais `AgencyTodayPage`, vue de supervision stricte. Une suppression future de l’ancien composant ne devra intervenir qu’après recherche de toutes ses dépendances et recette fonctionnelle.
