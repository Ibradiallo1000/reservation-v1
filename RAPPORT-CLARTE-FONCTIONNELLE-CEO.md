# Rapport de clarté fonctionnelle — Module Compagnie (CEO)

**Périmètre :** État actuel après refactor de la navigation. Aucune proposition d’amélioration.  
**Date :** 19 février 2025.

---

## 1. Poste de Pilotage (Centre de commande)

**Page :** `CEOCommandCenterPage` — route `command-center`.

### A) Indicateurs actuellement affichés

- **Revenu global (période)** : Revenu total, Passagers, Taux de remplissage (sièges).
- **Activité des agences** : Sessions actives, En attente validation, Embarquements ouverts, Agences avec état.
- **Flotte globale** : En garage, Affectés, En transit, Avec destination, Maintenance.
- **Alertes** : Liste (sessions clôturées en attente, véhicules en transit depuis longtemps, agences sans activité aujourd’hui).
- **Indice de santé entreprise** (si capacité `view_profit_analysis`) : Score / 100, catégorie (Elite / Strong / Stable / Fragile / Critical).
- **Position financière** (si `view_profit_analysis`) : Paiements en attente d’approbation CEO (nombre, montant total, alerte si cumul 24h > seuil), Banque, Mobile money, Caisse agences, Comptes à payer, Position nette.
- **Top agences (revenu sur la période)** : Tableau Rang / Agence / Revenu.
- **Intelligence financière** (si `view_profit_analysis`) : Profit total aujourd’hui, Marge bénéficiaire, Coût opérationnel trajets, Agence la plus / moins rentable, Trajets les plus rentables, Trajets à marge la plus faible, Trajet le plus coûteux, Anomalies (liste), Tendances (revenu, occupation, coûts, performance agences), Projection fin de mois, Insights stratégiques, Simulateurs (occupation, carburant, ticket).

### B) Sources de données

- **Firestore** : `dailyStats` (collectionGroup ou par agence), `agencyLiveState` (collectionGroup ou doc `current` par agence), `fleetVehicles`, `companies/{id}/agences`, `shiftReports` (validated) par agence, `reservations` par agence (revenus par trajet), `expenses` (collectionGroup), `tripCosts`, `financialAccounts`, `financialMovements` (via services), `companies/{id}/agences/{aid}/reservations`.
- **Services** : `listAccounts`, `listUnpaidPayables`, `listPendingPaymentProposals`, `getFinancialSettings`, `getRiskSettings`, `detectAnomalies`, `computeAllTrends`, `generateStrategicInsights`, `computeHealthScore`, `calculateCompanyCashPosition`, `calculateAgencyProfit`, `calculateCompanyProfit`, `calculateTripProfit`, simulateurs.

### C) Décision concrète par indicateur

| Indicateur | Décision concrète possible |
|------------|----------------------------|
| Revenu total / Passagers / Taux remplissage | Évaluer le niveau d’activité et l’efficacité commerciale sur la période. |
| Sessions actives / En attente validation | Décider de prioriser les validations de sessions ou le suivi des guichets. |
| Embarquements ouverts | Savoir combien de points d’embarquement sont en cours. |
| Flotte (garage, transit, maintenance) | Ajuster affectations et maintenance. |
| Alertes (sessions, véhicules, agences sans activité) | Réagir aux retards de validation, véhicules bloqués, agences à risque. |
| Indice de santé | Juger la santé globale (score et catégorie). |
| Paiements en attente CEO | Aller sur « Voir toutes les demandes » (payment-approvals) pour approuver ou refuser. |
| Position nette / Banque / Caisse / Comptes à payer | Évaluer la trésorerie et les engagements. |
| Top agences (revenu) | Identifier les agences performantes. |
| Profit / Marge / Coût opérationnel | Évaluer la rentabilité et les coûts. |
| Agence la plus / moins rentable | Cibler soutien ou optimisation. |
| Anomalies / Insights / Tendances | Décider d’investigations ou d’actions correctives. |
| Simulateurs | Explorer des scénarios (occupation, carburant, prix). |

### D) Nature des indicateurs

- **Revenu global, Passagers, Taux de remplissage** : Informative.  
- **Sessions actives, En attente validation, Alertes, Paiements en attente CEO** : Decision-support à Critical (selon gravité).  
- **Flotte globale** : Informative.  
- **Indice de santé, Position financière** : Decision-support.  
- **Top agences, Profit, Marge, Anomalies, Insights** : Decision-support (certaines anomalies Critical).

---

## 2. Revenus & Liquidités

**Page :** `RevenusLiquiditesPage` — route `revenus-liquidites`. Deux onglets : **Revenus** (`CompanyFinancesPage`) et **Liquidités** (`CEOTreasuryPage`).

### 2.1 Onglet Revenus

#### A) Indicateurs affichés

- **Revenus consolidés (sessions validées)** : Aujourd’hui, 7 derniers jours, 30 derniers jours (valeurs numériques).
- **Tableau par agence** : Agence, Aujourd’hui, 7 jours, 30 jours (revenus).
- **Écarts comptables (computedDifference ≠ 0)** : Filtre par agence, tableau Agence / Shift / Écart, bouton Exporter CSV.

#### B) Sources de données

- **Firestore** : `companies/{id}/agences`, `dailyStats` (collectionGroup, companyId, date sur 30 jours), `companies/{id}/agences/{aid}/shiftReports` (status validated, limit 20 par agence).

#### C) Décision concrète

| Indicateur | Décision concrète possible |
|------------|----------------------------|
| Revenus aujourd’hui / 7j / 30j | Comparer l’activité récente et mensuelle. |
| Revenus par agence (tableau) | Comparer les agences entre elles. |
| Écarts comptables | Identifier les shifts avec écart et décider d’un contrôle ou d’une correction. |

#### D) Nature

- Revenus consolidés et par agence : **Informative**.  
- Écarts comptables : **Decision-support** (voire **Critical** si écarts importants).

### 2.2 Onglet Liquidités

#### A) Indicateurs affichés

- **Liquidité totale** : Montant total.
- **Répartition** : Caisse (agences), Banque, Mobile money, Réserve dépenses.
- **Par agence** : Tableau Agence / Solde (+ ligne « Niveau compagnie »).
- **Flux sur la période** : Montant (somme des mouvements dans la période).
- **Comptes à faible solde** (si solde < 50 000 et agencyId null) : Liste compte / solde.
- **Derniers mouvements** : Type, Montant, Agence (30 premiers).
- **Dépenses récentes** : Liste catégorie / montant / statut (10 plus élevées).

#### B) Sources de données

- **Firestore** : `companies/{id}`, `companies/{id}/agences`, `companies/{id}/financialAccounts` (isActive), `companies/{id}/financialMovements` (orderBy performedAt, limit 100), `listExpenses(companyId)` (service, 20 dernières).

#### C) Décision concrète

| Indicateur | Décision concrète possible |
|------------|----------------------------|
| Liquidité totale et par type | Évaluer la trésorerie disponible et sa répartition. |
| Solde par agence | Repérer les agences en tension ou à rééquilibrer. |
| Flux période | Voir l’évolution des entrées/sorties. |
| Comptes à faible solde | Décider de renflouement ou de vigilance. |
| Derniers mouvements / Dépenses récentes | Suivre les flux et les dépenses. |

#### D) Nature

- Liquidité totale, par type, par agence, flux : **Informative**.  
- Comptes à faible solde : **Decision-support** à **Critical** selon niveau de solde.

---

## 3. Performance Réseau

**Page :** `CompagnieDashboard` — route `dashboard`.

### A) Indicateurs affichés

- **KpiHeader** : CA (formaté, avec sous-texte « vs période précédente »), Billets vendus (tous canaux), Agences actives (X au total).
- **Carte Évolution** : Graphique `RevenueReservationsChart` (série `series.daily` : date, reservations, revenue).
- **Classement agences (CA période)** : Tableau Rang, Agence, CA.
- **Santé du réseau** : `NetworkHealthSummary` (totalAgences, healthyAgencies, atRiskAgencies, trend « stable »).
- **Alertes par agence** : `CriticalAlertsPanel` (liste alertes avec titre, description, level).

### B) Sources de données

- **Hook** `useCompanyDashboardData` : Firestore `companies/{id}`, `companies/{id}/agences` (onSnapshot), sous-collections de réservations par agence (createdAt entre dateFrom et dateTo). KPIs et séries dérivés des réservations payées (statut paye/paid) : CA, nombre de réservations, agences actives, répartition par canal, alertes (réservations en attente > 50, preuves reçues à valider, agences sans vente).

### C) Décision concrète

| Indicateur | Décision concrète possible |
|------------|----------------------------|
| CA / Billets vendus | Mesurer la performance commerciale sur la période. |
| Agences actives | Savoir combien d’agences ont vendu. |
| Évolution (graphique) | Voir la tendance jour par jour. |
| Classement agences (CA) | Comparer les agences entre elles. |
| Santé du réseau (actives / à risque) | Repérer les agences sans revenu. |
| Alertes (attente, preuves, agences sans vente) | Prioriser validations ou soutien aux agences. |

### D) Nature

- CA, Billets, Agences actives, Évolution, Classement, Santé du réseau : **Informative**.  
- Alertes : **Decision-support** (agences sans vente, preuves à valider).

---

## 4. Opérations & Flotte

**Page :** `OperationsFlotteLandingPage` — route `operations-reseau`.

### A) Indicateurs affichés

- **Réservations aujourd’hui** : Nombre (réservations créées aujourd’hui, tous agences).
- **Sessions ouvertes** : Nombre (shifts status active ou paused, tous agences).
- **Véhicules disponibles** : X / Y (disponibles = garage ou arrived ou assigned, hors maintenance ; Y = total flotte).
- **Flotte totale** : Nombre de véhicules.
- **Accès** : Boutons « Réservations » (vers `reservations`) et « Flotte » (vers `fleet`).

### B) Sources de données

- **Firestore** : `companies/{id}/agences` ; pour chaque agence : `reservations` (createdAt entre 00:00 et 23:59 du jour), `shifts` (status in [active, paused], limit 20) ; `companies/{id}/fleetVehicles` (limit 500). Calcul « disponibles » côté client (status garage / arrived / assigned, exclusion maintenance).

### C) Décision concrète

| Indicateur | Décision concrète possible |
|------------|----------------------------|
| Réservations aujourd’hui | Avoir une idée du volume du jour. |
| Sessions ouvertes | Savoir combien de guichets sont ouverts. |
| Véhicules disponibles / Flotte totale | Évaluer la capacité opérationnelle. |
| Boutons Réservations / Flotte | Aller vers le détail pour agir. |

### D) Nature

- Tous les indicateurs de la synthèse : **Informative**.  
- Les boutons sont des **accès** à des pages de détail (pas des indicateurs de décision en soi).

---

## 5. Contrôle & Audit

**Page :** `CompagnieComptabilitePage` — route `comptabilite`. Titre « Contrôle & Audit », sous-titre « Sessions · Réconciliations · Validations CEO · Anomalies — {période} ».

### A) Indicateurs / contenu par onglet

- **Tableau de bord** : KPI CA (guichet + ligne), Argent en caisse / Solde total caisse, tableau ou synthèse des performances par agence (ventes, encaissements, écarts, statut caisse), alertes.
- **Réconciliation** : Données de réconciliation (ventes vs encaissements, écarts, validation).
- **Agences** : Liste agences avec performances et détail possible.
- **Mouvements** : Mouvements compagnie (companyMovements).
- **Rapports** : Rapports basés sur performanceData, totals, période.
- **Audit** : Contenu d’audit (selon rôle CEO / financial_director).

Données chargées : `companies/{id}/agences` ; par agence `reservations`, `cashReceipts`, `cashMovements` sur la période ; `companyMovements` ; calculs de ventes, encaissements, écarts, statut caisse, alertes.

### B) Sources de données

- **Firestore** : `companies/{id}/agences`, `companies/{id}/agences/{aid}/reservations`, `cashReceipts`, `cashMovements` (createdAt dans la période), `companies/{id}/companyMovements`.

### C) Décision concrète

- **Tableau de bord** : Comprendre CA, caisse, écarts et statuts par agence ; décider de contrôles ou de validations.
- **Réconciliation** : Vérifier la cohérence ventes / encaissements et valider.
- **Agences** : Comparer et creuser une agence.
- **Mouvements** : Suivre les mouvements compagnie.
- **Rapports / Audit** : Préparer rapports et contrôles.

### D) Nature

- KPI et tableaux : **Informative** à **Decision-support**.  
- Alertes et écarts : **Decision-support** à **Critical** selon seuils.

---

## Synthèse : déploiement pour un CEO de compagnie moyenne/grande

Réponse honnête et critique.

- **Comprendre la performance revenus clairement ?**  
  **Partiellement.** Les revenus sont visibles à plusieurs endroits (Poste de Pilotage, Revenus & Liquidités onglet Revenus, Performance Réseau, Contrôle & Audit). La distinction « revenus (CA, sessions validées) » vs « liquidités (cash réel) » est rappelée sur Revenus & Liquidités. En revanche, une seule vue consolidée « revenus vs liquidités vs écarts » avec les mêmes périmètres et périodes n’existe pas ; le CEO doit faire la synthèse mentalement entre les écrans.

- **Détecter les problèmes opérationnels ?**  
  **Oui, de façon limitée.** Poste de Pilotage donne sessions en attente, véhicules en transit longtemps, agences sans activité ; Opérations & Flotte donne réservations du jour, sessions ouvertes, véhicules disponibles ; Performance Réseau et Contrôle & Audit signalent agences sans vente et alertes. Il manque une vue unique « opérations à risque » (ex. départs en retard, sessions non validées depuis X heures) et des seuils explicites pour « critique ».

- **Identifier les risques financiers ?**  
  **Partiellement.** Liquidités (trésorerie, comptes à faible solde), position financière et paiements en attente CEO sont dans Poste de Pilotage / Revenus & Liquidités. L’indice de santé et les anomalies (Poste de Pilotage) aident, mais dépendent de la capacité `view_profit_analysis`. Les risques (ex. dépassement de seuil de paiement, trésorerie faible) ne sont pas regroupés dans une seule section « Risques financiers » avec niveaux de gravité homogènes.

- **Comparer les agences efficacement ?**  
  **Oui.** Comparaison par revenus/CA : Poste de Pilotage (top agences), Revenus & Liquidités (tableau par agence), Performance Réseau (classement CA, santé du réseau), Contrôle & Audit (performances détaillées). En revanche, pas de vue comparative unique (ex. tableau multi-critères : CA, liquidités, écarts, sessions en attente) ni d’export standardisé pour « comparaison agences ».

- **Agir immédiatement ?**  
  **Partiellement.** L’accès aux approbations de paiement (lien depuis Poste de Pilotage vers `payment-approvals`) est clair. Les liens depuis Performance Réseau vont vers Réservations et Paramètres ; depuis Opérations & Flotte vers Réservations et Flotte. En revanche, depuis une alerte (sessions en attente, agence sans activité, compte à faible solde), il n’y a pas systématiquement un bouton « Agir » ou une route directe vers la page où corriger (ex. validation de sessions, détail agence, détail compte). L’action reste souvent « aller chercher soi-même » la bonne page.

**Conclusion :** La version actuelle donne une base solide pour le suivi (revenus, liquidités, opérations, comparaison agences, contrôle). Un CEO de taille moyenne/grande peut s’y retrouver et prendre des décisions, mais la compréhension des revenus, la détection des problèmes opérationnels et des risques financiers, et le passage de l’information à l’action restent perfectibles (pas de vue unique de synthèse, pas d’actions guidées depuis chaque alerte).
