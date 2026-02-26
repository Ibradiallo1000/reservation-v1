# Debug React critique – CEO Command Center (~12 s de rendu)

## 1. load() est-il déclenché plus d’une fois ?

**Oui, en développement.**  
Le projet utilise **`<React.StrictMode>`** (`src/index.tsx`). En mode développement, React exécute les effets deux fois : exécution → cleanup → exécution. Donc :

- L’effet dont dépend `load()` est exécuté une première fois → `load()` démarre (Promise.all des 9 requêtes).
- Puis le cleanup du même effet est appelé (`unsubFleet?.()`).
- Puis l’effet est exécuté une deuxième fois → **un second `load()` démarre**.

Résultat : **deux `load()` en parallèle**. Chacun fait ensuite son propre `await` puis une grosse série de `setState`. Les mises à jour des deux appels se mélangent et provoquent **plusieurs vagues de re-renders** (plus de 2), chacune coûteuse (55+ useMemos + gros arbre). C’est une cause majeure du délai (~12 s) et du surcroît de rendus.

---

## 2. Une dépendance d’effet provoque-t-elle une boucle ou des exécutions répétées ?

**Pas de boucle infinie**, mais des exécutions doubles à cause de Strict Mode (voir ci‑dessus).

L’effet de chargement dépend de :  
`[companyId, periodRange.startStr, periodRange.endStr]`.

- `periodRange` vient d’un `useMemo` avec `[period, customStart, customEnd]` → **objet stable** tant que période/dates personnalisées ne changent pas.
- `periodRange.startStr` et `periodRange.endStr` sont des **chaînes** (valeurs primitives) → comparaison par valeur, pas de nouvelle exécution tant que la plage ne change pas.
- Après les `setState` de `load()`, ni `companyId` ni `periodRange` ne sont modifiés par ce code → **l’effet ne se re-déclenche pas** à cause des données.

Donc : **pas de boucle**, mais **double exécution en dev** à cause de Strict Mode.

---

## 3. Objets recréés à chaque render et utilisés dans les tableaux de dépendances ?

- **`periodRange`** : créé dans un `useMemo` avec `[period, customStart, customEnd]`. **Stable** tant que ces trois valeurs ne changent pas. Pas de recréation à chaque render.
- **`blocksAtoEData`** : `useMemo` avec une grosse liste de deps (globalRevenue, prioritizedRisks, etc.). Se recrée uniquement quand ces données changent (après un `load()` réussi). **Pas de recréation à chaque render** tant que les données sont stables.

Aucun de ces objets n’est recréé **à chaque** render de façon à faire repartir les effets en boucle.

---

## 4. Cascades de setState

**Oui, plusieurs vagues de setState dans un même `load()` :**

1. **`setLoading(true)`** → 1 re-render (ou 2 en Strict Mode si deux `load()` ont démarré).
2. **Après `await Promise.all([...9 requêtes])`** : une vingtaine de `setState` (setAgencies, setDailyStatsList, setLiveStateList, setExpensesList, setDiscrepancyReports, setTripRevenues, setPendingRevenue, setTripCostsList, setRiskSettings, setDailyStats14, setTripCosts14, setFinancialAccounts, setUnpaidPayables, setPendingPaymentsCeoCount, setPendingProposals, setPendingPaymentsTotalAmount, setPendingPaymentsCumulative24hExceeded, setFinancialSettings, setCollectionGroupOk). En React 18, ils sont **batchés** entre eux → **1 re-render** par `load()` à ce stade.
3. **Après `await Promise.all([...4 financières])`** : les 4 setState financiers sont dans le même `load()` que le bloc ci‑dessus ; en fait ils sont **après** le premier await, donc dans la même “tâche” asynchrone que le gros bloc. Donc en théorie même batch. Mais le code actuel fait **deux `await`** (un pour les 9, un pour les 4) → **deux “microtasks”** → possibilité de **deux batches** et donc **deux re-renders** par `load()` pour les données.
4. **`onSnapshot(qFleet, ...)`** : au premier snapshot, **`setFleetVehicles`** → 1 re-render supplémentaire.
5. **`setLoading(false)`** → 1 re-render supplémentaire.

Avec **un seul** `load()` : au moins **4–5 re-renders** (loading true, données 1, données 2, flotte, loading false).  
Avec **deux** `load()` (Strict Mode) : **8–10+ re-renders**, avec en plus un arbre très lourd (55+ useMemos, Recharts, etc.) à chaque fois → **~12 s** facilement.

---

## 5. Boucles synchrones coûteuses au mount

Pas de boucle infinie synchrone. Les calculs lourds sont dans des **useMemo** (agencyProfits, anomalies, trends, etc.) ; ils s’exécutent à chaque **re-render** (pour comparer les deps), donc **à chaque vague de setState** ci‑dessus. Avec 8–10 re-renders, on exécute 8–10 fois toute la chaîne de useMemos → coût CPU énorme.

---

## 6. Plusieurs rendus avant stabilisation

**Oui.** Séquence typique en dev (Strict Mode) :

1. Mount initial (loading = true).
2. Premier effet (header) → `setHeader` → re-render (contexte).
3. Premier effet (load) → `load()` #1 démarre → `setLoading(true)` (déjà true) → éventuel re-render.
4. Cleanup du premier effet (load) → `unsubFleet?.()` (rien encore).
5. Deuxième exécution de l’effet (load) → `load()` #2 démarre.
6. `load()` #1 ou #2 termine (9 requêtes) → grosse vague de setState → re-render.
7. Même `load()` ou l’autre continue (4 requêtes financières) → setState → re-render.
8. `load()` #2 (ou #1) termine à son tour → encore setState → re-renders.
9. `onSnapshot` (une ou deux fois) → `setFleetVehicles` → re-renders.
10. `setLoading(false)` (une ou deux fois) → re-renders.

On dépasse facilement **8–12 rendus** avant que la page soit stable.

---

## 7. Nombre de rendus avant stabilisation

En développement avec Strict Mode : **au moins 8–12 rendus** (double exécution de l’effet + plusieurs batches de setState par `load()` + flotte + loading). Chaque rendu refait 55+ useMemos et réconcilie tout l’arbre → **~1–2 s par rendu** → **~12 s** au total.

---

## 8. Boucle de rendu infinie ?

**Non.** Les dépendances de l’effet (`companyId`, `periodRange.startStr`, `periodRange.endStr`) ne sont pas modifiées par les setState de `load()`. Donc pas de re-déclenchement en chaîne de l’effet. En revanche, **double exécution en dev** + **multiples batches de setState** suffisent à expliquer le délai.

---

## Cause exacte du délai de ~12 s

1. **Strict Mode** : l’effet de chargement est exécuté deux fois → **deux `load()` en parallèle** → deux séries de setState qui se superposent → **nombre de re-renders doublé (ou plus)**.
2. **Plusieurs vagues de setState** dans chaque `load()` : deux `await` (9 requêtes puis 4 financières) → plusieurs batches → **plusieurs re-renders coûteux** par `load()`.
3. **Coût de chaque re-render** : 55+ useMemos + réconciliation d’un très gros arbre (dont Recharts) → **~1–2 s par rendu** sur machine moyenne.

Combinaison : **8–12 rendus × ~1–2 s ≈ 12 s**.

---

## Hook responsable

L’**effet** qui appelle `load()` (celui dont les dépendances sont `[companyId, periodRange.startStr, periodRange.endStr]`) :

- En dev : exécuté **deux fois** à cause de Strict Mode → deux `load()`.
- Chaque `load()` déclenche **plusieurs batches** de setState (loading, données 1, données 2, flotte, loading false).

C’est donc bien **cet useEffect** qui, par sa double exécution et la structure de `load()`, provoque le nombre excessif de re-renders.

---

## Plan de correction concret

1. **Ignorer les résultats d’un `load()` périmé (Strict Mode / changement de période)**  
   - Utiliser une **ref** (ex. `cancelledRef` ou `runIdRef`) dans l’effet.  
   - Au cleanup de l’effet : marquer la run comme annulée (ex. `cancelledRef.current = true`).  
   - Au début de l’effet : `cancelledRef.current = false`.  
   - **Après chaque `await`** dans `load()`, avant tout `setState` :  
     `if (cancelledRef.current) return;`  
   - Ainsi, seul le **dernier** `load()` (ou le seul en prod) applique des setState ; l’autre (ex. première run en Strict Mode) ne fait plus rien après son await → **plus de double application** des données.

2. **Réduire le nombre de batches de setState**  
   - Lancer les **4 requêtes financières en parallèle des 9** (un seul `Promise.all([...9, ...4])`).  
   - Faire **un seul bloc** de setState après ce `await` (toutes les données + `setLoading(false)`), puis enchaîner `onSnapshot` et le reste.  
   - Objectif : **au plus 2–3 re-renders** par `load()` (loading true, puis une grosse mise à jour, éventuellement flotte).

3. **(Optionnel)** Réduire le coût de chaque re-render en continuant à extraire des blocs en composants mémoïsés (comme pour les blocs A–E), pour que les sections qui ne changent pas ne refassent pas tout le travail.

En priorité : **1 (ref d’annulation)** et **2 (un seul await + un seul bloc setState)**. Cela doit suffire à supprimer la double exécution utile et à diviser fortement le nombre de re-renders, donc à faire passer le temps de rendu de ~12 s à quelques secondes au pire.

---

## Correctif appliqué

- **Ref `loadRunIdRef`** : à chaque exécution de l’effet, `runId = ++loadRunIdRef.current`. Dans `load()`, après chaque `await` et avant tout bloc `setState`, test **`if (loadRunIdRef.current !== runId) return`**. Ainsi, seul le **dernier** `load()` (ex. la 2ᵉ exécution en Strict Mode) applique les setState ; l’ancien `load()` ne fait plus rien après son await → plus de double application des données.
- **Vérifications** : une fois après le premier `await` (9 requêtes), une fois après le second `await` (4 financières), une fois avant le bloc principal `setState` (pour le chemin fallback), une fois dans le callback **onSnapshot** (avant `setFleetVehicles`), une fois avant **`setLoading(false)`**.
- Résultat attendu : en dev avec Strict Mode, **un seul** `load()` applique des setState → environ **4–5 re-renders** au lieu de 8–12, et temps de rendu nettement réduit (plus de double chargement ni de setState en double).
