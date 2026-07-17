# TELIYA — Carte des sources de données dashboards

| Dashboard | Bloc / indicateur | Source | Filtre compagnie | Filtre agence | Période / calcul | Accès | Validation |
|---|---|---|---|---|---|---|---|
| Plateforme | compagnies et statuts | listener `companies`, `normalizeCompanyRecord` | toutes, rôle plateforme | non | instantané | lecture | confirmée |
| Plateforme | MRR configuré | `adminSettings/plans` + compagnies facturables | toutes | non | mois courant configuré | lecture | estimation existante conservée |
| Plateforme | opérations du mois | `currentMonthOperations` des compagnies | toutes | non | somme pure | lecture | confirmée par champ existant |
| Plateforme | demandes en attente | listener `subscriptionRequests` | toutes | non | statut `pending` | lecture | confirmée |
| Plateforme | quotas | plans + `currentMonthOperations` | toutes | non | ratio pur ≥ 80 % | lecture | confirmée |
| CEO | activité commerciale | `getUnifiedCommercialActivity`, daily stats/activity logs | `companyId` obligatoire | consolidation réseau | période globale | lecture | existante |
| CEO | graphique | `getNetworkStatsChartData` ou activity logs | `companyId` | consolidation | période globale | lecture | existante |
| CEO | agences | `getNetworkActivityByAgency` + métadonnées agences | `companyId` | toutes les agences | période globale | lecture | existante |
| CEO | finance | `getUnifiedCompanyFinance` | `companyId` | consolidation | période et période précédente | lecture | existante |
| CEO | alertes | écarts et seuils déjà présents dans le Command Center | `companyId` | réseau | période globale et contrôles courts | lecture | logique préexistante conservée |

Aucune source Phase 5 n’écrit. Aucun nouveau listener ou agrégat Firestore n’a été ajouté.

