# Centre Stratégique V2 — Livrable technique

## 1. Fichiers modifiés

- **`src/modules/compagnie/pages/CEOCommandCenterPage.tsx`**
  - Imports ajoutés : `useNavigate`, `PaymentProposalDoc`, constantes de `commandCenterThresholds`, composants Recharts (`ResponsiveContainer`, `AreaChart`, `Area`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`).
  - State : `pendingProposals` (liste des propositions de paiement en attente) pour calculer les paiements > 48h.
  - Agences : type étendu avec `nomAgence` ; chargement avec `nomAgence ?? nom` ; affichage systématique via `agencyNames(id)` qui utilise `nomAgence ?? nom` (jamais l’ID Firestore).
  - Calculs centralisés : `pendingPaymentsOver48h`, `revenueVariationPercent`, `revenueDropPercent`, `accountsBelowCritical`, `accountsBelowWarning`, `agenciesAtRiskCount`, `healthStatus`, `prioritizedRisks`, `top3Agencies`, `bottom3Agencies`, `agenciesWithDropOver15`, `sessionsPendingByAgency`.
  - Rendu : cinq blocs « Centre Stratégique V2 » en tête de page (État global, Risques prioritaires, Performance consolidée, Santé du réseau, Actions rapides) ; suppression de la section dupliquée « Revenu global (période) » ; le reste des sections (Activité agences, Flotte, Alertes, Position financière, Top agences, Intelligence, etc.) est conservé.

## 2. Fichiers créés

- **`src/modules/compagnie/commandCenter/commandCenterThresholds.ts`**  
  Fichier de configuration des seuils (voir section 4).

- **`src/modules/compagnie/commandCenter/CENTRE_STRATEGIQUE_V2_LIVRABLE.md`**  
  Ce document (livrable en français).

## 3. Logique de calcul du statut santé (Indice et Statut global)

### Indice Santé Réseau (0–100)

- Inchangée : calculée par `computeHealthScore(healthScoreInput)` à partir de la marge, taux de remplissage, ratio d’écarts, retard transit, tendance de croissance du CA, ratio charges/CA, ratio créances. Affichée dans le bloc **État global**.

### Statut global (Stable / Attention / Critique)

- Calculé dans un `useMemo` `healthStatus`, à partir des seuils définis dans `commandCenterThresholds.ts`.

- **CRITIQUE** si au moins une des conditions suivantes :
  - Baisse de CA vs période précédente ≥ 15 % (`revenueDropPercent >= REVENUE_CRITICAL_DROP_PERCENT`) ;
  - Au moins un paiement en attente de validation CEO depuis plus de 48 h (`pendingPaymentsOver48h > 0`) ;
  - Au moins un compte sous le seuil critique (`accountsBelowCritical > 0`) ;
  - Au moins 2 agences à risque (`agenciesAtRiskCount >= AGENCIES_AT_RISK_CRITICAL_COUNT`). Une agence est considérée à risque si elle a un revenu nul sur la période (proxy « agences en baisse / sans revenu »).

- **ATTENTION** si non critique et au moins une des conditions suivantes :
  - Baisse de CA entre 8 % et 15 % (`revenueDropPercent` entre `REVENUE_WARNING_DROP_PERCENT` et `REVENUE_CRITICAL_DROP_PERCENT`) ;
  - Au moins une session en attente de validation (`closedPendingSum > 0`) ;
  - Au moins un compte sous le seuil d’avertissement (`accountsBelowWarning > 0`).

- **STABLE** dans tous les autres cas.

La variation de CA utilisée est `trendResultsByType.revenue?.percentageChange` (tendance déjà calculée sur la période, ex. 7j vs 7j).

## 4. Emplacement de la configuration des seuils

- **Fichier :** `src/modules/compagnie/commandCenter/commandCenterThresholds.ts`

- **Constantes :**
  - `REVENUE_CRITICAL_DROP_PERCENT` = 15  
  - `REVENUE_WARNING_DROP_PERCENT` = 8  
  - `SESSION_CRITICAL_DELAY_HOURS` = 48  
  - `SESSION_WARNING_DELAY_HOURS` = 24  
  - `ACCOUNT_CRITICAL_THRESHOLD` = 50 000  
  - `ACCOUNT_WARNING_THRESHOLD` = 100 000  
  - `AGENCIES_AT_RISK_CRITICAL_COUNT` = 2  

Modifier ce fichier pour adapter les seuils sans toucher à la logique métier de la page.

## 5. Confirmation : aucune route cassée

- Aucune route n’a été supprimée ni renommée.
- Les liens d’action des blocs (Risques prioritaires, Actions rapides) pointent vers les routes existantes : `/compagnie/:companyId/payment-approvals`, `revenus-liquidites`, `dashboard`, `operations-reseau`, `command-center`.
- La page « Poste de Pilotage » reste la même route (ex. `command-center` dans le layout compagnie). Les pages « Performance Réseau » et « Revenus & Liquidités » n’ont pas été modifiées.

## 6. Confirmation : aucune logique métier supprimée

- Tous les hooks, requêtes Firestore, calculs (revenus, position financière, tendances, alertes, flotte, anomalies, etc.) sont conservés.
- La section « Revenu global (période) » a été remplacée par les blocs V2 qui réutilisent les mêmes données (CA, liquidités, variation) ; les autres sections (Activité des agences, Flotte, Alertes, Position financière détaillée, Top agences, Intelligence, etc.) sont intactes.
- Aucune structure Firestore ni règle de permissions n’a été modifiée.
