# Audit de performance – CEOCommandCenterPage.tsx

## Étape 1 – Nombre exact de requêtes Firestore

### Au chargement initial (chemin succès, N agences)

| # | Requête | Type | Nombre |
|---|---------|------|--------|
| 1 | Agences | getDocs(collection companies/{id}/agences) | 1 |
| 2 | dailyStats (période) | getDocs(collectionGroup dailyStats, companyId, date) | 1 |
| 3 | agencyLiveState | getDocs(collectionGroup agencyLiveState, companyId) | 1 |
| 4 | expenses | getDocs(collectionGroup expenses, companyId) | 1 |
| 5 | shiftReports | getDocs(shiftReports) **par agence** (boucle ags.slice(0, 50)) | **min(50, N)** |
| 6 | shifts (non validés) | getDocs(shifts, status != validated) **par agence** (boucle ags.slice(0, 30)) | **min(30, N)** |
| 7 | reservations | getDocs(reservations, date) **par agence** (même boucle) | **min(30, N)** |
| 8 | tripCosts | getDocs(companies/{id}/tripCosts, date) | 1 |
| 9 | riskSettings | getDoc(companies/{id}/riskSettings/...) | 1 |
| 10 | dailyStats14 | getDocs(collectionGroup dailyStats, **même filtre que #2**) | **1 (doublon)** |
| 11 | tripCosts14 | getDocs(tripCosts, **même filtre que #8**) | **1 (doublon)** |
| 12 | Promise.all | listAccounts (1) + listUnpaidPayables (2) + listPendingPaymentProposals (1) + getFinancialSettings (1) | **5** |
| 13 | fleetVehicles | onSnapshot(collection fleetVehicles) | 1 (lecture initiale) |

**Total chemin succès (exemple N = 10) :**  
1 + 1 + 1 + 1 + 10 + 10 + 10 + 1 + 1 + 1 + 1 + 5 + 1 = **44 requêtes**.

**Total avec N = 30 agences :**  
1 + 1 + 1 + 1 + 30 + 30 + 30 + 1 + 1 + 1 + 1 + 5 + 1 = **104 requêtes**.

### Par agence (dans les boucles)

- **Boucle 1 (discrepancyReports)** : 1 getDocs(shiftReports) par agence, jusqu’à 50 agences.
- **Boucle 2 (tripRevenues + pendingRevenue)** : 2 requêtes par agence (shifts + reservations), jusqu’à 30 agences.

Donc **jusqu’à 50 + 60 = 110 requêtes** uniquement dans les boucles (N = 50 et N = 30).

### Par re-render

- Aucune requête Firestore n’est lancée dans le rendu ou dans un effet dont les deps changent à chaque rendu.
- L’effet principal dépend de `[companyId, periodRange.startStr, periodRange.endStr]`. Un changement de période (ou de companyId) relance **tout** le `load()` → même nombre de requêtes qu’au chargement initial.

### Requêtes exécutées plusieurs fois inutilement

- **dailyStats** : chargé deux fois avec les **mêmes** paramètres (lignes ~226 et ~331) → une fois pour `dailyStatsList`, une fois pour `dailyStats14`. **Doublon net.**
- **tripCosts** : chargé deux fois avec les **mêmes** `startStr`/`endStr` (lignes ~314 et ~343) → `tripCostsList` et `tripCosts14`. **Doublon net.**

---

## Étape 2 – Flux asynchrone (blocage, séquence)

### await dans des boucles (séquentiel)

1. **Boucle shiftReports** (l.283–296)  
   `for (const a of ags.slice(0, 50))` avec **await getDocs(q)** à chaque itération → **jusqu’à 50 appels séquentiels**. Chaque tour attend la fin du précédent.

2. **Boucle shifts + reservations** (l.300–327)  
   `for (const a of ags.slice(0, 30))` avec à l’intérieur :
   - **await getDocs(qShifts)** puis
   - **await getDocs(q)** (reservations)  
   → **jusqu’à 30 × 2 = 60 appels séquentiels**.

### Ordre global du load()

Séquence réelle (une seule exécution de `load`) :

1. await getDocs(agences)  
2. await getDocs(dailyStats)  
3. await getDocs(agencyLiveState)  
4. await getDocs(expenses)  
5. **Série** : await getDocs(shiftReports) × N₁ (N₁ ≤ 50)  
6. **Série** : pour chaque agence (N₂ ≤ 30) : await getDocs(shifts), puis await getDocs(reservations)  
7. await getDocs(tripCosts)  
8. await getRiskSettings()  
9. await getDocs(dailyStats14)  
10. await getDocs(tripCosts14)  
11. await Promise.all([listAccounts, listUnpaidPayables, listPendingPaymentProposals, getFinancialSettings])  
12. onSnapshot(fleet) (non bloquant après première lecture)

Les étapes 1–4 sont déjà séquentielles (4 allers-retours). Puis 5 : N₁ requêtes en série. Puis 6 : 2×N₂ requêtes en série. Puis 7–10 : encore 4 requêtes en série. Seul le bloc 11 est parallélisé (4 requêtes en parallèle).

**Résumé :** avec 10 agences, on a au moins **4 + 10 + 20 + 4 = 38** allers-retours réseau **séquentiels** avant le Promise.all, puis 5 en parallèle. La lenteur perçue vient en grande partie de ce **grand nombre d’appels séquentiels** (multiplication des requêtes × exécution en série).

### Mises à jour de state dans les boucles

- `setAgencies(ags)` est appelé dans le premier try (après agences).
- Les autres `set*` sont appelés **après** les boucles (setDiscrepancyReports, setPendingRevenue, setTripRevenues, etc.). Aucun setState **à l’intérieur** d’une itération de boucle, donc pas de re-render par itération.

---

## Étape 3 – Re-renders et calculs coûteux

### Dépendances du useEffect principal

```ts
}, [companyId, periodRange.startStr, periodRange.endStr]);
```

- Un changement de période (ou de companyId) relance tout le chargement. Pas de boucle de re-exécution infinie.
- `periodRange` est en useMemo([period, customStart, customEnd]), donc stable tant que ces trois valeurs ne changent pas.

### Cascades de state

- Pendant `load()`, de nombreux `setState` sont appelés (setAgencies, setDailyStatsList, setLiveStateList, setExpensesList, setDiscrepancyReports, setPendingRevenue, setTripRevenues, setTripCostsList, setRiskSettings, setDailyStats14, setTripCosts14, setFinancialAccounts, setUnpaidPayables, … setLoading(false)).
- En React 18, les mises à jour dans le même tick sont batchées, mais il reste plusieurs lots (avant / après boucles, après Promise.all, onSnapshot, setLoading). Donc **plusieurs re-renders** pendant un même chargement.
- À chaque re-render, **tous les useMemo** sont évalués (dépendances comparées) ; ceux dont les deps ont changé se recalculent (agencyNames, globalRevenue, alerts, topAgenciesByRevenue, agencyProfits, companyProfit, anomalies, trends, healthScore, etc.). Beaucoup de useMemo dépendent de state qui vient d’être mis à jour → recalculs en chaîne jusqu’à stabilisation.

### Calculs coûteux dans le rendu

- Les calculs lourds sont dans des **useMemo** (anomalies, trends, strategicInsights, healthScore, etc.), pas en pur calcul dans le corps du composant. Donc pas de re-calcul à chaque ligne du rendu, mais **re-calcul à chaque re-render où les deps d’un useMemo changent**.
- `detectAnomalies`, `computeAllTrends`, `generateStrategicInsights`, `computeHealthScore` sont appelés depuis des useMemo ; le coût est lié au **nombre de re-renders** et aux **changements de deps** (nombreux states remplis progressivement pendant load).

### useCallback

- Aucun `useCallback` utilisé pour les callbacks passés aux enfants (ex. PeriodFilterBar, boutons). En l’état, si des enfants étaient mémoïsés (React.memo), ils pourraient se re-render inutilement. Pour cette page, le coût dominant reste le **premier chargement** (requêtes + séquence async), pas les re-renders d’enfants.

---

## Étape 4 – Structure des requêtes

### collectionGroup

- **dailyStats** : collectionGroup avec companyId + date → 1 requête pour toute la compagnie (index présent).
- **agencyLiveState** : collectionGroup avec companyId uniquement → 1 requête. **Aucun index listé** dans `firestore.indexes.json` pour ce collectionGroup → risque de requête lente ou d’échec si Firestore exige un index.
- **expenses** : collectionGroup avec companyId → 1 requête.

### Requêtes par agence (sous-collections)

- **shiftReports** : `companies/{companyId}/agences/{agencyId}/shiftReports` → 1 requête par agence (jusqu’à 50).
- **shifts** : `companies/{companyId}/agences/{agencyId}/shifts` avec `status != "validated"` → 1 requête par agence (jusqu’à 30).
- **reservations** : `companies/{companyId}/agences/{agencyId}/reservations` avec `date >= startStr`, `date <= endStr` → 1 requête par agence (jusqu’à 30).

Aucune de ces sous-collections n’est regroupée au niveau compagnie : il n’existe pas de collectionGroup pour shiftReports, shifts ou reservations avec un filtre companyId (ou alors non utilisée ici). Donc **obligation de boucler sur les agences** avec les requêtes actuelles.

### Regroupement possible

- **dailyStats** et **tripCosts** sont déjà au niveau compagnie (ou collectionGroup) ; la seule optimisation immédiate est de **ne les exécuter qu’une fois** (supprimer les doublons dailyStats14 / tripCosts14 en réutilisant dailyStatsList et tripCostsList).
- Pour **shiftReports**, **shifts**, **reservations** : sans ajout de collectionGroup (ou de structure agrégée côté Firestore), on ne peut pas réduire le nombre de requêtes sans garder une boucle ; en revanche, on peut **paralléliser** les requêtes par agence (Promise.all sur un tableau de promesses) au lieu de les faire en série.

---

## Étape 5 – Index et structure Firestore

### Index présents (firestore.indexes.json)

- **collectionGroup dailyStats** : (companyId, date) – OK.
- **collectionGroup expenses** : (companyId, …) / (agencyId, status) – OK pour la requête utilisée.
- **tripCosts** : (date, …) – OK pour la requête par date.
- **paymentProposals**, **financialAccounts**, **payables**, etc. – utilisés par Promise.all.

### Index manquants ou à vérifier

- **collectionGroup agencyLiveState** : requête `where("companyId", "==", companyId)`. Aucun index listé pour `agencyLiveState` dans le fichier. Si Firestore impose un index pour les collectionGroup, cette requête peut être **lente ou refusée** jusqu’à ajout d’un index (ex. collectionGroup `agencyLiveState`, champ `companyId`).
- **shifts** : `where("status", "!=", "validated")` sur une collection. Souvent un index single-field suffit pour une inégalité ; si des logs ou la doc Firestore indiquent un index manquant, il faudra l’ajouter.
- **reservations** (sous-collection par agence) : `where("date", ">=", startStr)`, `where("date", "<=", endStr)`. Index composite (date ASC ou date DESC) possible selon le SDK ; à confirmer si erreur d’index en console.

### Structure

- Pas de requête évidente “full collection scan” sans filtre. Les lenteurs viennent surtout du **nombre** et de l’**ordre** des requêtes (séquentielles), pas d’un index manquant unique identifié (hors agencyLiveState).

---

## Synthèse – Réponses demandées

### 1. Nombre exact de requêtes au chargement

- **Avec 10 agences (données minimales) :** **44 requêtes** (dont 2 doublons : dailyStats, tripCosts).
- **Avec 30 agences :** **104 requêtes** (toujours 2 doublons).
- En **effectif utile** (sans doublons) : **42** (N=10) et **102** (N=30).

### 2. Goulot d’étranglement exact

- **Requêtes en série dans les deux boucles** : jusqu’à 50 + (30×2) = **110 appels séquentiels** (avec N=50 et N=30). Avec N=10 : 10 + 20 = **30** appels séquentiels dans les boucles.
- Le reste du load est aussi majoritairement **séquentiel** (agences → dailyStats → agencyLiveState → expenses → boucle 1 → boucle 2 → tripCosts → riskSettings → dailyStats14 → tripCosts14 → Promise.all).  
→ Le goulot principal est la **multiplication des requêtes par agence** combinée à leur **exécution séquentielle** (await dans les for).

### 3. Nature de la lenteur

| Cause | Contribution |
|-------|--------------|
| **Multiplication des requêtes** | Oui : 44 à 104+ requêtes selon N, dont 30 à 110 dans les boucles. |
| **Async séquentiel** | Oui : boucles avec await → 30 à 110 allers-retours en série. |
| **Boucle de re-renders** | Partielle : plusieurs setState pendant load → plusieurs re-renders et recalculs de useMemo en chaîne ; pas de boucle infinie. |
| **Requête non indexée** | Possible : collectionGroup **agencyLiveState** sans index déclaré ; à confirmer en console. |
| **Agrégation lourde** | Modérée : beaucoup de useMemo (anomalies, trends, insights, healthScore) qui se recalculent quand leurs deps changent après les setState successifs. |

### 4. Plan d’optimisation concret

1. **Supprimer les doublons**
   - Ne plus faire une deuxième requête pour dailyStats14 : réutiliser **dailyStatsList** pour tout ce qui utilise dailyStats14 (trends, dailyRevenueHistory, etc.).
   - Ne plus faire une deuxième requête pour tripCosts14 : réutiliser **tripCostsList** pour tout ce qui utilise tripCosts14.
   - **Gain :** 2 requêtes en moins et 2 allers-retours séquentiels en moins.

2. **Paralléliser les requêtes par agence**
   - **Boucle shiftReports :** construire un tableau de promesses `ags.slice(0, 50).map(a => getDocs(query(...)))` puis `await Promise.all(...)`, puis fusionner les résultats (discList).
   - **Boucle shifts + reservations :** pour chaque agence, lancer en parallèle getDocs(shifts) et getDocs(reservations) avec `Promise.all([getDocs(qShifts), getDocs(qRes)])`, puis traiter les résultats ; et/ou lancer toutes les agences en parallèle (tableau de promesses par agence, puis Promise.all).
   - **Gain :** réduction forte du temps total (de l’ordre de 30–110 RTT à 1–2 RTT pour ces blocs, selon stratégie).

3. **Paralléliser le début du load**
   - Lancer en parallèle : getDocs(agences), getDocs(dailyStats), getDocs(agencyLiveState), getDocs(expenses). Attendre les 4 avec Promise.all. Puis enchaîner les boucles (elles-mêmes parallélisées comme ci-dessus).
   - **Gain :** les 4 premiers appels passent de 4 RTT séquentiels à 1.

4. **Index Firestore**
   - Ajouter un index pour **collectionGroup agencyLiveState** sur `companyId` (si requis ou pour de meilleures perfs).
   - Vérifier en console Firestore / logs si des erreurs d’index concernent shifts ou reservations et ajouter les index indiqués.

5. **Réduire les re-renders pendant le load (optionnel)**
   - Accumuler toutes les données dans un objet/state unique, puis faire **un seul** setState (ou un batch) à la fin de load() pour limiter le nombre de re-renders et de recalculs de useMemo. Attention à ne pas dégrader la lisibilité ni la maintenabilité.

### 5. Gain de performance estimé après optimisation

- **Suppression des 2 doublons :** gain modéré (~5–10 % du temps de load).
- **Parallélisation des deux boucles (shiftReports + shifts/reservations) :** **réduction majeure** du temps de load. Au lieu de 30–110 RTT séquentiels, 1–2 RTT (ou un petit nombre de vagues). Estimation : **réduction de 60 à 85 %** du temps total de chargement selon N et le réseau.
- **Parallélisation des 4 premières requêtes :** encore **~10–15 %** de réduction du temps total.
- **Index agencyLiveState (si manquant) :** évite une requête lente ou un échec ; gain variable (peut être très visible si la requête time-out ou scanne beaucoup de docs).

**Estimation globale :** avec parallélisation des boucles + suppression des doublons + parallélisation du début, le chargement peut passer d’un multiple de 40–100 RTT à l’équivalent de **quelques RTT** (5–15), soit un **temps perçu 3 à 10 fois plus court** selon le nombre d’agences et la latence réseau.

---

*Audit réalisé sur le code réel de CEOCommandCenterPage.tsx et des services appelés (financialAccounts, payablesService, paymentProposalsService, financialSettingsService, riskSettingsService). Aucune modification de code n’a été appliquée.*
