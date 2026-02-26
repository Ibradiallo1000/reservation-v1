# TELIYA V2 – Centre Stratégique – Rapport final

## 1. Fichiers modifiés

- **`src/modules/compagnie/pages/CEOCommandCenterPage.tsx`**
  - Imports des seuils : passage de `commandCenterThresholds` vers **`strategicThresholds`** (constantes `REVENUE_CRITICAL_DROP`, `REVENUE_WARNING_DROP`, `SESSION_CRITICAL_DELAY`, `SESSION_WARNING_DELAY`, `ACCOUNT_CRITICAL_THRESHOLD`, `ACCOUNT_WARNING_THRESHOLD`, `AGENCIES_AT_RISK_CRITICAL_COUNT`).
  - Utilisation de ces constantes dans le calcul de `pendingPaymentsOver48h`, `healthStatus` et les libellés des risques prioritaires.
  - Titres des 5 blocs exécutifs renommés avec préfixes **A.** à **E.** (État global, Risques prioritaires, Performance consolidée, Santé du réseau, Actions rapides) et ajout d’attributs `aria-label` pour l’accessibilité.
  - Libellés des boutons « Actions rapides » alignés sur la spec : « Valider paiements », « Voir sessions ouvertes », « Voir agences à risque », « Export synthèse direction ».

---

## 2. Fichiers créés

- **`src/modules/compagnie/commandCenter/strategicThresholds.ts`**  
  Fichier de configuration des seuils du Centre Stratégique (voir section 4).

- **`src/modules/compagnie/commandCenter/RAPPORT_TELIYA_V2_CENTRE_STRATEGIQUE.md`**  
  Ce rapport.

---

## 3. Logique de calcul du statut santé (État global)

Le **statut global** (🟢 Stable / 🟡 Attention / 🔴 Critique) est calculé dans un `useMemo` `healthStatus`, à partir des indicateurs déjà présents sur la page et des constantes de **`strategicThresholds.ts`**.

### Règles

- **CRITIQUE** si au moins une des conditions suivantes :
  - Baisse de CA vs période précédente **≥ 15 %** (`revenueDropPercent >= REVENUE_CRITICAL_DROP`),
  - Au moins un **paiement en attente de validation CEO depuis plus de 48 h** (`pendingPaymentsOver48h > 0`),
  - Au moins un **compte trésorerie sous le seuil critique** (`accountsBelowCritical > 0`),
  - **Au moins 2 agences à risque** (`agenciesAtRiskCount >= AGENCIES_AT_RISK_CRITICAL_COUNT`). Une agence est considérée à risque si elle a un revenu nul sur la période (proxy « agences en baisse / sans revenu »).

- **ATTENTION** si le statut n’est pas critique et qu’au moins une des conditions suivantes est vraie :
  - Baisse de CA **entre 8 % et 15 %** (`revenueDropPercent` entre `REVENUE_WARNING_DROP` et `REVENUE_CRITICAL_DROP`),
  - **Sessions en attente de validation** (`closedPendingSum > 0`, proxy > 24 h),
  - Au moins un **compte sous le seuil d’avertissement** (`accountsBelowWarning > 0`).

- **STABLE** dans tous les autres cas.

L’**indice Santé Réseau** (0–100) reste calculé par `computeHealthScore(healthScoreInput)` (marge, remplissage, écarts, transit, tendance CA, etc.) et est affiché dans le bloc A. État global.

---

## 4. Configuration des seuils (strategicThresholds.ts)

- **Fichier :** `src/modules/compagnie/commandCenter/strategicThresholds.ts`

- **Constantes :**
  - `REVENUE_CRITICAL_DROP` = 15 (%)

  - `REVENUE_WARNING_DROP` = 8 (%)

  - `SESSION_CRITICAL_DELAY` = 48 (heures)

  - `SESSION_WARNING_DELAY` = 24 (heures)

  - `ACCOUNT_CRITICAL_THRESHOLD` = 50 000 (unité : devise compagnie, configurable)

  - `ACCOUNT_WARNING_THRESHOLD` = 100 000 (unité : devise compagnie, configurable)

  - `AGENCIES_AT_RISK_CRITICAL_COUNT` = 2

Pour adapter le comportement du Centre Stratégique sans toucher à la logique métier, il suffit de modifier les valeurs dans ce fichier.

---

## 5. Confirmation : aucune route cassée

- Aucune route n’a été supprimée ni modifiée.
- Les liens d’action (risques prioritaires et actions rapides) utilisent les routes existantes : `/compagnie/:companyId/payment-approvals`, `revenus-liquidites`, `dashboard`, `operations-reseau`, `command-center`.
- Les pages **Performance Réseau** et **Revenus & Liquidités** n’ont pas été modifiées et restent accessibles.

---

## 6. Confirmation : aucune logique métier supprimée

- Aucun module existant n’a été retiré.
- Les hooks, requêtes Firestore, calculs (revenus, position financière, tendances, alertes, flotte, anomalies, etc.) sont inchangés.
- Seuls des **indicateurs exécutifs** et une **structure en 5 blocs** ont été ajoutés ou clarifiés sur le Poste de Pilotage ; le reste de la page (activité agences, flotte, alertes, position financière, top agences, intelligence, etc.) est conservé.
- Les noms d’agences affichés utilisent **nomAgence** (jamais l’`agencyId`), via `agencyNames(id)` qui repose sur `nomAgence ?? nom`.
