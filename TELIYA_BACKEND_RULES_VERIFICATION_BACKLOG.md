# TELIYA — Backlog de vérification des Rules backend

Cette Phase 4 n’a lu ni modifié les Rules. Les points suivants doivent être vérifiés dans une phase backend dédiée, avec émulateur et jeux de données de test.

| Priorité | Surface frontend corrigée | Vérification backend future |
|---|---|---|
| critique | `/agence/treasury/new-operation`, `transfer`, `new-payable` désormais réservées au comptable agence | confirmer que les écritures refusent CEO, chef d’agence, superviseur et guichetier |
| critique | routes CEO d’approbation et dépenses rendues inaccessibles | confirmer que les Rules n’accordent aucune mutation opérationnelle au CEO |
| haute | capacités comptables compagnie | vérifier séparation `financial_director` / `company_accountant` et périmètre compagnie |
| haute | comptable agence | vérifier strictement le périmètre agence et les opérations du workflow gelé |
| haute | contexte `companyId`/`agencyId` exigé dans les guards | confirmer que les Rules contrôlent l’appartenance réelle, pas seulement l’identifiant fourni |
| moyenne | aliases historiques de rôles acceptés sans capacité supplémentaire | vérifier les valeurs réellement persistées et les claims existants |
| moyenne | rôles escale | vérifier les permissions guichet/embarquement observées dans le frontend |
| différée | flotte et logistique désactivées | vérifier avant toute réactivation, sans réutiliser les capacités frontend comme preuve |

