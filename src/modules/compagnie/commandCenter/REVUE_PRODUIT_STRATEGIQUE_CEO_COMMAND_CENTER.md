# Revue produit stratégique – Centre de commande CEO

**Contexte :** Teliya vise à être un **système d’exploitation du transport** pour compagnies de bus de taille moyenne et grande. Le Centre de commande CEO doit être un **poste de pilotage décisionnel**, lisible en 30–60 secondes, rapide, structuré, non surchargé, et orienter le CEO vers les modules pour l’analyse approfondie.

---

## 1. Analyse de l’implémentation actuelle

### Inventaire des blocs visibles (état actuel)

| # | Bloc | Contenu | Condition |
|---|------|---------|-----------|
| A | État global | CA période, liquidités, variation %, indice santé, statut (Stable/Attention/Critique) | Toujours |
| B | Risques prioritaires | Liste risques + liens « Corriger » | Toujours |
| C | Performance consolidée | CA, liquidités, écart, évolution + **AreaChart** (CA/jour) | Toujours |
| D | Santé du réseau | Top 3 / Bottom 3 agences, agences en baisse, sessions en attente | Toujours |
| E | Actions rapides | 4 boutons (paiements, sessions, agences à risque, export) | Toujours |
| 2 | Activité des agences | Sessions actives, en attente validation, embarquements ouverts, nb agences | Toujours |
| 3 | Flotte globale | Garage, affectés, transit, avec destination, maintenance | Toujours |
| 4 | Alertes | Liste jusqu’à 15 alertes (sessions, véhicules, activité) | Toujours |
| 4.5 | Indice de santé entreprise | Score / 100 + catégorie (Elite → Critical) | `view_profit_analysis` |
| 4.6 | Position financière | Paiements en attente CEO + Banque, Mobile money, Caisse, Payables, Position nette | `view_profit_analysis` |
| 5 | Top agences | Tableau rang / agence / revenu (période) | Toujours |
| 6 | Intelligence financière | Profit total, marge, coûts opérationnels, agence +/- rentable, top 5 trajets (profit, marge faible) | `view_profit_analysis` |
| 7 | Risques et anomalies | Liste par sévérité (élevé, moyen, faible) | `view_anomaly_engine` |
| 7.5 | Prévision fin de mois | Revenu/profit projetés, deltas, confiance | `view_predictive_insights` |
| 7.6 | Simulation (et si) | 3 sliders (remplissage, carburant, billet) ou bannière upgrade | `use_simulation_engine` |
| 8 | Insights stratégiques | Tendances 7j, recommandations, évolution agences | `view_predictive_insights` |

**Total : 16 blocs** (dont plusieurs conditionnels par plan). Avec filtre de période (Jour / Semaine / Mois / Année / Personnalisé) en tête de page.

---

## 2. Évaluation critique

### 2.1 Alignement avec la vision « poste de pilotage décisionnel »

| Critère | Verdict | Commentaire |
|---------|--------|-------------|
| **Décision en 30–60 s** | ❌ Non | Trop de blocs : impossible de tout parcourir et décider en une minute. Le CEO doit scroller longtemps et trier mentalement l’important. |
| **Cockpit, pas rapport** | ❌ Partiel | Les blocs A–E + Activité + Flotte + Alertes + Actions vont dans le bon sens. Le reste (Intelligence financière, Anomalies, Prévision, Simulation, Insights) ressemble à un **rapport d’analyse** intégré dans la même page. |
| **Orientation vers les modules** | ⚠️ Partiel | B (Risques) et E (Actions) envoient bien vers des pages. Mais Top agences, Intelligence financière, Anomalies, Insights sont des **analyses détaillées in-page** au lieu de « un chiffre + lien vers le module ». |
| **Rapidité / légèreté** | ❌ Non | 30 useState, 53+ useMemo, 14+ requêtes, Recharts, calculs lourds → page lente et coûteuse. |

**Conclusion :** La page mélange **cockpit** (état, risques, actions, activité, flotte, alertes) et **modules d’analyse** (profit détaillé, anomalies, prévision, simulation, insights). Elle est surchargée et ne respecte pas le contrat « lisible en 30–60 s ».

### 2.2 Surcharge

**Oui, la page est surchargée.**

- **16 blocs** alors que l’objectif est 6–8.
- **Redondances** : CA / liquidités / variation apparaissent en A et en C ; « santé » en A (indice + statut), en 4.5 (indice entreprise), en D (santé réseau).
- **Analytique lourde in-page** : Intelligence financière (profit, marge, top trajets), Anomalies (liste détaillée), Prévision, Simulation, Insights = 5 blocs qui relèvent de **modules dédiés** (Finances, Contrôle, Prévisions), pas du cockpit.
- **Conditionnels par plan** : plusieurs blocs affichés ou masqués selon capabilities → expérience incohérente et maintenance compliquée.

### 2.3 Blocs essentiels pour un cockpit

**À garder sur le cockpit (indispensables pour « où en est le réseau ? » et « que faire ? ») :**

1. **État global** (résumé en 5 indicateurs : CA, liquidités, variation, indice santé, statut).
2. **Risques prioritaires** (liste courte + liens d’action).
3. **Activité opérationnelle** (sessions actives, en attente, embarquements, nb agences avec état).
4. **Flotte** (répartition garage / affectés / transit / maintenance).
5. **Alertes** (liste courte, lisible).
6. **Actions rapides** (boutons vers les modules clés : paiements, sessions, agences à risque, export).

**Optionnel sur le cockpit (si on reste à 6–8 blocs) :**

7. **Un seul indicateur financier de synthèse** (ex. position nette ou « à valider ») + lien « Voir trésorerie ».
8. **Top 3 agences / Bottom 3** (ou un seul bloc « Santé réseau » très compact) + lien « Voir performance réseau ».

### 2.4 Blocs à déplacer vers d’autres modules

| Bloc actuel | Problème | Où le mettre |
|-------------|----------|--------------|
| **C. Performance consolidée (avec graphique)** | Graphique + KPI détaillés = analyse, pas cockpit. | **Revenus & liquidités** (ou « Finances ») : page avec période, CA, graphique, écarts. |
| **D. Santé du réseau (détail)** | Top 3, bottom 3, agences en baisse, sessions par agence = détail. | **Performance réseau** / **Dashboard** : tableau agences, classement, détails. |
| **4.5 Indice de santé entreprise** | Un score peut rester en 1 ligne dans « État global » ; le détail (catégorie, explication) | Soit 1 ligne dans État global, soit dans une page **Santé / Contrôle**. |
| **4.6 Position financière (5 tuiles)** | Détail trésorerie. | **Revenus & liquidités** : détail des comptes, position, paiements en attente. |
| **5. Top agences (tableau complet)** | Liste détaillée. | **Performance réseau** / **Dashboard** : tableau avec filtres, export. |
| **6. Intelligence financière** | Profit, marge, coûts, top trajets = analyse. | **Finances** ou **Contrôle & audit** : section « Rentabilité » / « Profit par trajet ». |
| **7. Risques et anomalies** | Liste longue par sévérité. | **Contrôle & audit** : page « Anomalies et risques » avec filtres, historique. |
| **7.5 Prévision fin de mois** | Prévision = analyse. | **Finances** ou page dédiée « Prévisions ». |
| **7.6 Simulation (et si)** | Outil de simulation = module à part. | Page dédiée « Simulation » ou sous-section Finances. |
| **8. Insights stratégiques** | Tendances, recommandations, évolution = analyse. | **Contrôle & audit** ou « Insights » : page dédiée avec tendances et recommandations. |

Principe : **sur le cockpit = synthèse + liens. En profondeur = dans les modules.**

---

## 3. Proposition : structure minimale mais puissante (6–8 blocs)

### 3.1 Les 6–8 blocs visibles du cockpit V2

| # | Bloc | Contenu (minimal) | Lien « Aller plus loin » |
|---|------|-------------------|---------------------------|
| 1 | **État global** | CA période, liquidités, variation %, indice santé (1 score), statut (Stable / Attention / Critique). Pas de graphique. | — |
| 2 | **Risques prioritaires** | Liste courte (3–5 risques max) avec niveau + libellé + bouton « Corriger » (lien module). | Lien « Voir tous les risques » → Contrôle & audit ou page Risques. |
| 3 | **Activité opérationnelle** | 4 chiffres : sessions actives, en attente validation, embarquements ouverts, agences avec état. | Lien « Voir sessions » → Opérations & flotte / Sessions. |
| 4 | **Flotte** | 5 chiffres : garage, affectés, transit, avec destination, maintenance. | Lien « Voir flotte » → Opérations & flotte / Flotte. |
| 5 | **Alertes** | Liste courte (5–7 alertes max), niveau + message. | Lien « Voir toutes les alertes » si besoin (ou intégré dans Risques). |
| 6 | **Position financière (résumé)** | 1 ligne : Position nette + (optionnel) « X paiements en attente ». | Lien « Voir trésorerie » → Revenus & liquidités. |
| 7 | **Performance réseau (résumé)** | Top 3 agences (nom + CA) ou 1 indicateur (ex. « Meilleure / Plus faible agence »). | Lien « Voir performance » → Performance réseau / Dashboard. |
| 8 | **Actions rapides** | 4 boutons : Valider paiements, Voir sessions, Agences à risque, Export synthèse. | — |

**Période :** Garder le filtre Jour / Semaine / Mois / Année / Personnalisé en haut ; il ne doit déclencher qu’un rechargement léger (ou un filtrage côté client si les données le permettent).

**Pas sur le cockpit :** graphique CA, détail position financière (5 tuiles), tableau top agences complet, intelligence financière (profit, marge, top trajets), liste anomalies détaillée, prévision fin de mois, simulation, insights stratégiques. Tout cela vit dans les modules accessibles depuis le menu ou depuis les liens du cockpit.

### 3.2 Ce qui DOIT rester sur le cockpit principal

- **État global** (résumé 5 indicateurs + statut).
- **Risques prioritaires** (court + actions).
- **Activité** (sessions, embarquements).
- **Flotte** (répartition).
- **Alertes** (court).
- **Un résumé financier** (1 ligne + lien trésorerie).
- **Un résumé réseau** (top 3 ou 1 indicateur + lien).
- **Actions rapides** (boutons).

### 3.3 Ce qui doit être accessible par la navigation (pas sur le cockpit)

- **Revenus & liquidités** : graphique CA, position détaillée (banque, mobile, caisse, payables), paiements en attente, export.
- **Performance réseau / Dashboard** : tableau agences, classement, CA par agence, détails.
- **Contrôle & audit** (ou équivalent) : anomalies détaillées, risques complets, historique, insights / recommandations.
- **Prévisions** : prévision fin de mois, tendances (optionnel).
- **Simulation** : outil « et si » (optionnel, page dédiée ou sous-section).

---

## 4. Approche d’architecture stable et version V2 « figée »

### 4.1 Principes d’architecture

1. **Cockpit = synthèse + redirection.** Aucune analyse lourde in-page ; chaque bloc pointe vers le module adapté pour le détail.
2. **Données minimales.** Une seule vague de requêtes pour le cockpit (agrégats, risques, activité, flotte, alertes, 1 indicateur financier, 1 indicateur réseau). Pas de chargement des données nécessaires aux graphiques détaillés, anomalies, prévision, simulation, insights.
3. **Composant cockpit léger.** Peu d’états, peu de useMemo, pas de Recharts ni de moteurs lourds (anomalies, tendances, simulation) sur cette page.
4. **6–8 blocs fixes.** Pas de blocs conditionnels par plan sur le cockpit (les capabilities peuvent gérer l’accès aux **modules**, pas l’affichage de blocs supplémentaires sur le cockpit).
5. **Période simple.** Un filtre période pour les KPI (CA, etc.) ; pas de rechargement massif à chaque changement si l’architecture le permet (ex. données déjà chargées pour le mois, filtrage côté client pour Jour/Semaine).

### 4.2 Version V2 « propre » à figer

- **Une seule page** : `CEOCommandCenterPage.tsx` (ou équivalent) qui affiche **au plus 8 blocs** listés ci-dessus.
- **Pas de** : AreaChart, tableau top agences complet, intelligence financière (profit détaillé, top trajets), liste anomalies, prévision, simulation, insights. Ces contenus sont dans des pages dédiées accessibles par le menu ou par les liens du cockpit.
- **Données** : un hook ou un service `useCommandCenterData(companyId, period)` qui retourne uniquement ce dont les 8 blocs ont besoin (agrégats, risques, activité, flotte, alertes, 1 indicateur financier, 1 indicateur réseau). Pas de chargement des données « analytiques » (anomalies, tendances, prévision, etc.) sur cette page.
- **Blocs** : chaque bloc peut être un composant mémoïsé recevant des props simples (chiffres, liste courte, lien). Pas de logique métier lourde dans la page.
- **Documentation** : un court doc produit (ce fichier ou un REFERENCE_CEO_COCKPIT_V2.md) qui décrit les 6–8 blocs, les liens, et précise que le cockpit est figé en V2 ; les évolutions se font dans les modules.

### 4.3 Ce qu’on arrête de faire sur cette page

- Ajouter de nouveaux blocs d’analyse sur le cockpit.
- Enchaîner les optimisations techniques pour « tout faire tenir » (useMemo, runId, etc.) : la bonne approche est de **réduire le périmètre**.
- Conditionner l’affichage de blocs entiers par plan (view_profit_analysis, view_anomaly_engine, etc.) sur le cockpit : soit un résumé neutre (ex. « — » + lien), soit accès aux modules selon le plan.

---

## 5. Synthèse et recommandation

### 5.1 Constat

- Le Centre de commande CEO actuel **dépasse** l’objectif « poste de pilotage décisionnel » : il agrège **cockpit + plusieurs rapports d’analyse** (performance, finance, anomalies, prévision, simulation, insights).
- Il est **surchargé** (16 blocs, redondances, calculs lourds, Recharts), **lent** et **illisible en 30–60 secondes**.
- Il ne respecte pas le principe « diriger le CEO vers les modules » pour l’analyse détaillée.

### 5.2 Recommandation produit

1. **Réduire le cockpit à 6–8 blocs** : État global, Risques prioritaires, Activité, Flotte, Alertes, Résumé financier (1 ligne), Résumé réseau (top 3 ou 1 indicateur), Actions rapides.
2. **Déplacer** tout le reste (graphique CA, position financière détaillée, top agences complet, intelligence financière, anomalies, prévision, simulation, insights) vers **Revenus & liquidités**, **Performance réseau**, **Contrôle & audit**, et éventuellement **Prévisions** / **Simulation**.
3. **Figer la structure** en V2 : pas de nouveau bloc sur le cockpit ; les évolutions se font dans les modules et dans la navigation.
4. **Alléger l’implémentation** : moins de requêtes, moins d’état, pas de Recharts ni de moteurs lourds sur cette page ; données servies par un hook/service dédié au cockpit.

Cela permet de **clore proprement** la page Centre de commande CEO et de recentrer l’équipe sur le reste du système (modules, parcours, autres rôles), tout en gardant un cockpit aligné avec la vision « Transport Operating System » : rapide, lisible, structuré, non surchargé, et orienté vers l’action et les modules.
