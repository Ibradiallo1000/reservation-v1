# Analyse performance frontend – CEO Command Center

## 1. Calculs lourds déclenchés au changement de période

Lors d’un clic sur « Personnalisé » ou « Jour » (sans changement de `startStr`/`endStr`), seul l’état UI change (`period`, `customStart`, `customEnd`). Pourtant :

- **`periodRange`** (useMemo `[period, customStart, customEnd]`) est recalculé à chaque changement de période → nouveau objet `{ startStr, endStr }`.
- Le **useEffect** de chargement dépend de `[companyId, periodRange.startStr, periodRange.endStr]`. Dès que la plage change, `load()` est relancé (Firestore). Si l’utilisateur considère que « custom ne déclenche pas de requêtes », c’est soit parce que la plage reste identique, soit parce que le blocage intervient avant la fin du chargement.
- Même **sans refetch** : un seul `setPeriod` (ou setCustomStart/setCustomEnd) provoque un re-render complet du composant. Tous les **~55 useMemo** sont réévalués (comparaison de deps + exécution du callback si les deps changent). Même quand la plupart renvoient le cache, le coût d’exécution de 55 callbacks et de la réconciliation du JSX (15+ sections, tableaux, Recharts) est élevé.

**Calculs réellement inutiles quand seule la période UI change (données inchangées) :**

- Tous les useMemos qui ne dépendent pas de `period` / `periodRange` : en théorie ils renvoient le cache, mais React exécute quand même la fonction useMemo pour comparer les deps. Avec 55 useMemos, le coût n’est pas négligeable.
- **Recalculs inutiles** : aucun useMemo ne dépend directement de `period`. Seul `periodRange` dépend de `period`. Donc après un clic « Jour », seule la création de `periodRange` est nécessaire ; tout le reste (globalRevenue, agencyProfits, anomalies, trends, etc.) pourrait ne pas être recalculé si les **données** (dailyStatsList, etc.) n’ont pas changé. Le problème n’est pas le recalcul des useMemos (ils renvoient le cache), mais le **re-render de tout l’arbre** : le composant parent re-render → tout le JSX (sections, graphiques, tableaux) est re-créé et réconcilié.

---

## 2. useMemos qui se recalculent quand la période (ou la plage) change

| useMemo | Dépendances | Recalcule quand period change ? |
|--------|-------------|----------------------------------|
| periodRange | period, customStart, customEnd | **Oui** (seul vraiment lié à la période) |
| agencyNames | agencies | Non (sauf si load a refetch) |
| globalRevenue, totalPassengers, totalSeats | dailyStatsList | Non |
| activeSessionsSum, closedPendingSum, boardingOpenSum | liveStateList | Non |
| fleetByStatus | fleetVehicles | Non |
| alerts | closedPendingSum, fleetVehicles, dailyStatsList, agencies | Non |
| topAgenciesByRevenue | dailyStatsList, agencyNames | Non |
| … (tous les autres) | données (dailyStatsList, tripRevenues, etc.) | Non tant que les données n’ont pas changé |

En pratique, **quand on change uniquement la période sans refetch**, seul `periodRange` change. Tous les autres useMemos ont des deps stables (références des state données inchangées), donc React garde le cache. Le blocage ne vient donc pas du recalcul des useMemos, mais du **re-render du composant monolithique** : réconciliation du très gros arbre JSX (sections, Recharts, listes).

---

## 3. Chaînes reduce / map / filter lourdes

- **agencyProfits** : `Array.from(agencyIds).map` + `calculateAgencyProfit` par agence.
- **tripProfitsSorted** : `tripRevenues.map` → `calculateTripProfit` → `.sort`.
- **anomalies** : `detectAnomalies` avec plusieurs `.map` / `.filter` sur tripProfitsSorted, agencyProfits, discrepancyReports, fleetVehicles, dailyStatsList, expensesList.
- **trends** : `computeAllTrends` avec boucles sur dailyStats14, tripCosts14, construction de Maps et tableaux.
- **strategicInsights** : `generateStrategicInsights(anomalies, trends, agencyNames)`.
- **healthScoreInput** : objet avec `Array.from(discrepancyDeductionByAgency.values()).reduce`, filtres sur fleetVehicles, etc.
- **prioritizedRisks** : plusieurs `.filter` sur agencyProfits, anomaliesBySeverity.

Ces calculs sont déjà mémoïsés ; ils ne se refont que si leurs entrées changent. Le coût CPU apparaît surtout au **premier render** après un `load()` (beaucoup de setState → un re-render avec toutes ces chaînes exécutées une fois).

---

## 4. Tris coûteux

- **topAgenciesByRevenue** : `.sort((a, b) => b.revenue - a.revenue)` sur une copie de dailyStatsList.
- **tripProfitsSorted** : `.sort((a, b) => b.profit - a.profit)` sur la liste des profits par trajet.
- **bottom5TripsByMargin** : `.filter` + `.sort((a, b) => a.margin - b.margin)`.
- **bottom3Agencies** : `[...agencyProfits].filter(...).sort((a, b) => a.revenue - b.revenue)`.
- **dailyRevenueHistory** / **dailyProfitHistory** : `.sort((a, b) => a.date.localeCompare(b.date))`.

Tous sont dans des useMemos ; le coût est payé une fois par changement de données, pas à chaque clic sur la période.

---

## 5. État dérivé recalculé plusieurs fois

- **revenueVariationPercent** et **revenueDropPercent** : dérivés de `trendResultsByType.revenue?.percentageChange` (calculés à chaque render, mais lecture simple).
- **healthStatus** dépend de revenueDropPercent, pendingPaymentsOver48h, accountsBelowCritical, etc. Une seule source (useMemo).
- Pas de duplication évidente de calculs lourds ; les dérivés sont soit en useMemo soit simples.

---

## 6. Re-render complet du dashboard à chaque petit changement d’état

**Cause principale du blocage perçu :**

- Un seul composant (~1835 lignes) contient tout : ~30 useState, ~55 useMemo, et tout le JSX (header, 5 blocs Teliya V2, puis sections Activité agences, Flotte, Alertes, Santé, Position financière, Top agences, Intelligence financière, Anomalies, Prévision, Simulation, Insights).
- **Aucune frontière React.memo** : tout est rendu dans le même composant. Dès qu’un state change (period, customStart, customEnd, ou après load : dailyStatsList, tripRevenues, etc.), **tout** le corps du composant re-render : réexécution de tous les useMemo (comparaison de deps), puis reconstruction de tout l’arbre virtuel (sections, Recharts, tableaux, listes).
- **Recharts** (AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, etc.) est connu pour être coûteux en réconciliation et en calcul de layout. Les réafficher à chaque clic sur la période aggrave le coût.

Donc : **oui**, le dashboard entier re-render à chaque changement d’état (y compris un simple changement de période).

---

## 7. Création d’objets volumineux pendant le render

- **periodRange** : nouvel objet à chaque changement de période (voulu).
- **onPeriodChange** : nouvelle fonction à chaque render → PeriodFilterBar re-render (acceptable, composant léger).
- **margin={{ top: 8, right: 8, left: 8, bottom: 8 }}** dans AreaChart : nouvel objet à chaque render (coût faible).
- Les useMemos retournent des tableaux/objets stables tant que les deps sont stables ; pas de création massive répétée dans le render, sauf pour les quelques cas ci-dessus.

---

## 8. Estimation du coût CPU

- **Au premier render après load** : exécution de ~55 useMemo (anomalies, trends, strategicInsights, healthScore, etc.) + réconciliation d’un arbre avec 15+ sections, tableaux, listes, 2+ graphiques Recharts. Estimation : **~500 ms – 2 s** selon volume de données et appareil.
- **À chaque clic sur la période (sans refetch)** : réexécution des 55 useMemo (souvent cache hit) + réconciliation de tout l’arbre + Recharts. Estimation : **~200 ms – 1 s** (surtout réconciliation + Recharts).
- Si en plus le clic déclenche un **refetch** (changement de startStr/endStr), s’ajoutent le temps réseau puis un nouveau gros render → **6–7 s** total (réseau + setState en batch + un render complet).

---

## 9. Stratégie de découpage en composants

- **Extraire chaque bloc logique en composant dédié** (A. État global, B. Risques prioritaires, C. Performance consolidée, D. Santé du réseau, E. Actions rapides, puis Activité agences, Flotte, Alertes, Santé entreprise, Position financière, Top agences, Intelligence financière, Anomalies, Prévision, Simulation, Insights).
- **Passer uniquement les props nécessaires** (scalaires, tableaux/objets issus des useMemos, pas de fonctions créées dans le render si possible).
- **Envelopper chaque bloc dans React.memo** : quand seul `period` / `customStart` / `customEnd` change, les props des blocs (globalRevenue, lists, etc.) restent les mêmes références → les blocs ne re-render pas.
- **Garder dans le parent** : état, useMemos, PeriodFilterBar et la structure de layout (composition des sections). Le parent re-render toujours au clic sur la période, mais les sections mémoïsées évitent la réconciliation de tout l’arbre et le recalcul des graphiques/listes.

---

## 10. Frontières de mémoïsation recommandées

| Bloc | Composant mémoïsé | Props (exemples) |
|------|-------------------|-------------------|
| A. État global | `CommandCenterStateGlobal` | globalRevenue, pendingRevenue, financialPosition, revenueVariationPercent, healthScore, healthStatus |
| B. Risques | `CommandCenterPrioritizedRisks` | prioritizedRisks, companyId |
| C. Performance | `CommandCenterPerformance` | globalRevenue, pendingRevenue, financialPosition, revenueVariationPercent, dailyRevenueHistory |
| D. Santé réseau | `CommandCenterNetworkHealth` | top3Agencies, bottom3Agencies, agenciesWithDropOver15, sessionsPendingByAgency |
| E. Actions rapides | `CommandCenterQuickActions` | companyId, navigate |
| Activité agences | `CommandCenterAgencyActivity` | activeSessionsSum, closedPendingSum, boardingOpenSum, liveStateList.length |
| Flotte | `CommandCenterFleet` | fleetByStatus |
| Alertes | `CommandCenterAlerts` | alerts |
| Santé entreprise | `CommandCenterHealthIndex` | healthScore, hasCapability |
| Position financière | `CommandCenterFinancialPosition` | financialPosition, pendingPaymentsCeoCount, … |
| Top agences | `CommandCenterTopAgencies` | topAgenciesByRevenue |
| Intelligence financière | `CommandCenterProfitIntelligence` | companyProfit, totalTripOperationalCost, mostExpensiveTripToday, … |
| Anomalies | `CommandCenterAnomalies` | anomalies, anomaliesBySeverity, hasCapability |
| Prévision | `CommandCenterProjection` | revenueProjection, hasCapability |
| Simulation | `CommandCenterSimulation` | simOccupancyPct, simFuelPct, simTicketPct, simOccupancy, simFuel, simTicket, setters, hasCapability |
| Insights | `CommandCenterStrategicInsights` | trendResultsByType, strategicInsights, insightsByLevel, hasCapability |

Chaque composant reçoit des primitives ou des références stables (tableaux/objets des useMemos). Quand seule la période change, ces références ne changent pas → **memo empêche le re-render** des sections et donc la réconciliation des graphiques et listes.

---

## Synthèse

- **Cause principale du blocage** : composant monolithique sans découpage ; un changement d’état (ex. période) provoque le re-render de tout le dashboard (55 useMemos + arbre JSX très gros avec Recharts).
- **Calculs inutiles au changement de période** : aucun useMemo métier ne dépend de la période ; seul `periodRange` change. En revanche, tout l’arbre est réconcilié et Recharts re-render, ce qui est inutile si les données affichées n’ont pas changé.
- **Stratégie** : extraire les blocs en composants mémoïsés (React.memo) avec des props stables ; garder la logique et les useMemos dans le parent.
- **Gain attendu** : sur un clic « période » sans refetch, seul le parent et éventuellement PeriodFilterBar re-render ; les 15+ sections mémoïsées ne re-render pas → réduction forte du temps de réconciliation et du coût Recharts. Objectif : passer de **~200 ms – 1 s** (voire plus) à **&lt; 50 ms** pour un simple changement de période, et amélioration sensible aussi du premier render après load si on mémoïse les sections les plus lourdes (graphiques, grosses listes).

---

## Implémentation (refactor structurel)

- **Blocs A à E** (État global, Risques prioritaires, Performance consolidée avec Recharts, Santé du réseau, Actions rapides) ont été extraits dans un composant **`CommandCenterBlocksAtoE`** enveloppé dans **`React.memo`**.
- Le parent calcule **`blocksAtoEData`** avec un **`useMemo`** dont les dépendances sont uniquement les valeurs dérivées (globalRevenue, prioritizedRisks, dailyRevenueHistory, etc.) — **sans** `period` ni `periodRange`.
- Lors d’un changement de période seul, `blocksAtoEData` garde la même référence → **`CommandCenterBlocksAtoE` ne re-render pas** → pas de réconciliation du bloc ni de recalcul Recharts pour la section C.
- Les autres sections (Activité agences, Flotte, Alertes, etc.) restent inline ; on peut les extraire à leur tour dans d’autres composants mémoïsés pour renforcer le gain.
