# Comparaison : Plan & Abonnement vs Centre de commande CEO

**Référence :**  
- **Plan & Abonnement** = `ParametresPlan.tsx` (contenu de l’onglet « Plan & abonnement » dans les paramètres compagnie), ~368 lignes.  
- **Centre de commande CEO** = `CEOCommandCenterPage.tsx`, ~1918 lignes.

---

## 1. Nombre de requêtes Firestore

| Critère | Plan & Abonnement (ParametresPlan) | CEO Command Center |
|--------|-------------------------------------|--------------------|
| **Requêtes au chargement** | 2 abonnements temps réel (onSnapshot) + 2 `getCountFromServer` en parallèle | 9 `getDocs` (dont 6 collectionGroup) + 4 appels financiers + 1 `onSnapshot` (flotte) |
| **Total « round-trips »** | 2 listeners + 2 counts = **4 sources** (les counts en un seul `Promise.all`) | **14+** (9 + 4 + 1, sans compter les services qui peuvent faire plusieurs lectures) |
| **Par agence** | Aucune boucle : 1 doc compagnie, 1 collection plans, 2 counts (agences, personnel) | Aucune en chemin normal ; **fallback** : 2×N `getDoc` (dailyStats, agencyLiveState par agence) |

**Plan & Abonnement** : très peu de requêtes, pas de dépendance au nombre d’agences.  
**CEO** : beaucoup de requêtes, et en cas d’échec des collectionGroup le fallback fait exploser le nombre de lectures (2×N).

---

## 2. collectionGroup vs boucles par agence

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **collectionGroup** | Non (lecture doc `companies/{id}`, collection `plans`) | Oui : dailyStats, agencyLiveState, expenses, shiftReports, shifts, reservations |
| **Boucles par agence** | Aucune | Uniquement en fallback (catch) : N agences × 2 getDoc |
| **Scalabilité** | O(1) par rapport au nombre d’agences | O(1) en chemin normal, O(N) en fallback |

---

## 3. Nombre de useState

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **useState** | **5** (cmp, plans, counts, sending, loading) | **30** (données, loading, période, simulation, financier, etc.) |

Chaque `useState` peut déclencher un re-render. 30 états locaux = beaucoup de sources de mises à jour et de rendus.

---

## 4. Nombre de useEffect

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **useEffect** | **1** (chargement compagnie + plans + counts) | **2** (header ; chargement données avec dépendances periodRange) |

CEO a un effet lourd (load) qui refait tout le chargement dès que la période change, en plus de l’effet header.

---

## 5. Nombre de useMemo

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **useMemo** | **3** (planById, activePlan, otherPlans) | **53+** (agrégats, listes triées, anomalies, tendances, santé, etc.) |

Chaque render, React réévalue les 53+ useMemo (comparaison de deps + exécution si changement). Coût CPU important à chaque mise à jour d’état.

---

## 6. Calculs lourds

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **Calculs** | Map/filter légers (planById, otherPlans) | **Lourd** : detectAnomalies, computeAllTrends, generateStrategicInsights, computeHealthScore, chaînes reduce/map/sort sur de gros tableaux |
| **Librairies** | Aucune | `@/core/intelligence`, `@/core/finance`, etc. |

Plan & Abonnement reste dans du calcul simple. CEO enchaîne des moteurs (anomalies, tendances, santé, simulation) à chaque rendu où les deps changent.

---

## 7. Taille du composant (lignes)

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **Lignes (approx.)** | **~368** | **~1918** |

CEO est un composant monolithique : toute la logique et tout le JSX sont dans un seul fichier, ce qui aggrave le coût des re-renders et la complexité.

---

## 8. Présence de graphiques (Recharts)

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **Recharts** | **Non** | **Oui** : AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, etc. |

Recharts est coûteux en réconciliation et en layout. Chaque re-render du parent redessine le graphique.

---

## 9. Nombre d’appels setState (dans load / données)

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **Dans le chargement** | 3 (setCmp, setPlans, setLoading ; setCounts dans l’IIFE) | **~20** (setAgencies, setDailyStatsList, setLiveStateList, setExpensesList, setDiscrepancyReports, setTripRevenues, setPendingRevenue, setTripCostsList, setRiskSettings, setFinancialAccounts, setUnpaidPayables, setPendingPaymentsCeoCount, setPendingProposals, setPendingPaymentsTotalAmount, setPendingPaymentsCumulative24hExceeded, setFinancialSettings, setCollectionGroupOk, setDailyStats14, setTripCosts14, setFleetVehicles, setLoading) |
| **Cumul re-renders** | 2–3 mises à jour groupées possibles | Plusieurs vagues (batch React 18), chaque vague = 53+ useMemo + gros arbre |

Plan & Abonnement met à jour peu d’états et un arbre petit. CEO enchaîne de nombreux setState et un arbre très lourd.

---

## 10. Complexité de l’arbre de rendu

| | Plan & Abonnement | CEO Command Center |
|-|-------------------|---------------------|
| **Sections** | 2 (plan actuel, autres plans) | 15+ (état global, risques, performance, santé réseau, actions, activité agences, flotte, alertes, santé entreprise, position financière, top agences, intelligence financière, anomalies, prévision, simulation, insights) |
| **Listes / tableaux** | 1 grille de cartes (otherPlans) | Nombreux tableaux, listes, cartes KPI |
| **Composants mémoïsés** | 0 (arbre déjà petit) | 1 (CommandCenterBlocksAtoE) pour une partie du contenu |
| **Conditionnels** | Peu (loading, activePlan) | Beaucoup (hasCapability, longueurs de listes, etc.) |

CEO a un arbre de rendu très profond et large ; tout re-render réconcilie tout l’arbre sauf le bloc mémoïsé.

---

## Différences structurelles

1. **Surface de la page**  
   Plan & Abonnement : un composant court, 2 blocs principaux, 5 états, 3 useMemo.  
   CEO : un très gros composant, 30 états, 53+ useMemo, 15+ sections, graphiques.

2. **Données**  
   Plan & Abonnement : 1 doc + 1 collection + 2 counts, pas de collectionGroup, pas de boucle agences.  
   CEO : 9+4+1 sources Firestore, 6 collectionGroup, fallback en O(N) agences.

3. **Rendu**  
   Plan & Abonnement : peu de setState, arbre léger, pas de Recharts.  
   CEO : ~20 setState au chargement, arbre lourd, Recharts, beaucoup de useMemo réévalués à chaque rendu.

4. **Logique métier**  
   Plan & Abonnement : dérivation simple (plan actif, autres plans).  
   CEO : chaîne de calculs lourds (profits, anomalies, tendances, santé, simulation).

---

## Pourquoi Plan & Abonnement est rapide (~1 s)

- **Peu de requêtes** : 2 listeners + 2 counts, pas de vague de 9+4 requêtes.
- **Peu d’état** : 5 useState → peu de re-renders et peu de raisons de recalculer.
- **Peu de useMemo** : 3, légers (map/filter).
- **Pas de graphiques** : pas de coût Recharts.
- **Composant court** : réconciliation rapide.
- **Un seul effet de chargement** : dépend uniquement de `companyId`, pas de période.
- **Pas de boucle par agence** : temps constant par rapport à la taille du réseau.

---

## Pourquoi le Centre de commande CEO est lourd

- **Beaucoup de requêtes** : 14+ round-trips, plus coût des services (listAccounts, etc.).
- **Beaucoup d’état** : 30 useState → nombreuses mises à jour et re-renders.
- **Très nombreux useMemo** : 53+ réévalués à chaque rendu (deps + corps quand les deps changent).
- **Calculs lourds** : detectAnomalies, computeAllTrends, generateStrategicInsights, computeHealthScore, reduce/sort sur gros tableaux.
- **Recharts** : AreaChart et dépendances, coûteux en réconciliation.
- **Composant énorme** : ~1918 lignes, tout dans un seul composant.
- **Nombreux setState au chargement** : plusieurs vagues de mises à jour → plusieurs re-renders coûteux.
- **Arbre de rendu complexe** : 15+ sections, tableaux, listes, conditionnels.
- **Effet dépendant de la période** : changement de période = nouveau chargement + nouveau gros render.

---

## Leçons d’architecture à appliquer globalement

1. **Un écran = peu de sources de données**  
   Privilégier 1–2 lectures ou listeners par écran ; agréger côté backend ou via une couche service si besoin.

2. **État minimal**  
   Moins de useState = moins de re-renders. Grouper les données liées (ex. un seul état « données dashboard ») au lieu de 30 états séparés.

3. **Dérivation légère**  
   Peu de useMemo, et seulement pour des dérivations utiles ; éviter des chaînes de 50+ useMemo dans un même composant.

4. **Découpage en composants**  
   Un écran = plusieurs composants mémoïsés par bloc logique, chacun avec ses props stables pour limiter les re-renders.

5. **Graphiques isolés**  
   Les graphiques (Recharts) dans des composants mémoïsés qui ne re-render que quand leurs données changent.

6. **Pas de boucles par agence dans le front**  
   Utiliser collectionGroup + filtre companyId (ou API agrégée) plutôt que N requêtes par agence.

7. **Chargement unique et stable**  
   Effet de chargement avec deps stables (ex. companyId) ; la période peut filtrer côté client si les données sont déjà chargées, ou une seule requête paramétrée par période.

---

## Stratégie de refactor pour rapprocher CEO de la philosophie Plan & Abonnement

1. **Réduire les sources de vérité**  
   - Regrouper les données « dashboard » dans 1–2 états (ex. `dashboardData`, `dashboardMeta`) au lieu de 30 useState.  
   - Mettre à jour en un ou deux batches (ex. après un seul `Promise.all` ou après chargement principal + financier).

2. **Découper la page en blocs mémoïsés**  
   - Un composant par section (État global, Risques, Performance, Santé réseau, etc.).  
   - Chaque bloc reçoit uniquement les props dont il a besoin (primitives ou objets stables).  
   - Utiliser `React.memo` pour éviter de réconcilier les blocs quand leurs props sont inchangées (ex. changement de période seul).

3. **Isoler les graphiques**  
   - Extraire la section « Performance consolidée » (AreaChart) dans un composant mémoïsé qui ne reçoit que `dailyRevenueHistory` et les KPI affichés.  
   - Éviter que le re-render du parent redessine systématiquement Recharts.

4. **Réduire le nombre de useMemo**  
   - Grouper les dérivations dans des hooks ou des fonctions pures appelées par un petit nombre de useMemo (ex. un useMemo « indicateurs » qui retourne un objet avec globalRevenue, healthScore, etc.).  
   - Éviter 53 useMemo dans un seul composant.

5. **Chargement en une ou deux vagues**  
   - Lancer toutes les requêtes nécessaires (y compris financières) en un ou deux `Promise.all`.  
   - Appliquer tous les setState en un ou deux batches pour limiter les re-renders (déjà partiellement fait avec runId ; poursuivre le regroupement des mises à jour).

6. **Garder la période hors du re-render coûteux**  
   - S’assurer que le changement de période ne déclenche un nouveau chargement que si startStr/endStr changent.  
   - Une fois les données chargées, filtrer/agréger par période côté client si possible pour éviter de rappeler Firestore à chaque changement d’onglet (Jour/Semaine/Mois).

7. **Optionnel : couche données dédiée**  
   - Un hook du type `useCEOCommandData(companyId, startStr, endStr)` qui retourne un seul objet `{ loading, error, data }`.  
   - La page ne contient que la logique d’affichage et des blocs mémoïsés ; la complexité des requêtes et des agrégats reste dans le hook.

En appliquant ces principes, on se rapproche du modèle « Plan & Abonnement » : peu d’état, peu de requêtes, arbre de rendu découpé et dérivations maîtrisées, ce qui doit réduire fortement le temps de chargement et de rendu du Centre de commande CEO.
