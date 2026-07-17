# TELIYA — Référence Command Center CEO

## Positionnement

Le Command Center répond aux besoins de supervision réseau de `admin_compagnie`, protégé par `company.command.view`. Il ne remplace ni le Dashboard Chef d’Agence, ni le guichet, ni l’embarquement, ni la comptabilité agence.

## Contenu

- KPI réseau : chiffre d’affaires consolidé, billets, courrier, trésorerie, agences actives et alertes.
- performance réseau par canal et mini-tendance existante ;
- points d’attention calculés par les règles existantes ;
- synthèse financière strictement en lecture seule ;
- classement multi-agences ;
- accès canoniques vers activité réseau, finances, agences et paramètres.

Le filtre global supporte jour, semaine, mois et période personnalisée. Les dates personnalisées ont des labels accessibles. Les montants peuvent être masqués sans changer les données.

## Séparation des responsabilités

Le CEO ne reçoit aucune validation de caisse, approbation de dépense, mutation, vente, clôture ou validation de départ. Les liens sont uniquement consultatifs. La finance compagnie reste une synthèse de `getUnifiedCompanyFinance`; aucune règle ou écriture comptable n’est réimplémentée.

