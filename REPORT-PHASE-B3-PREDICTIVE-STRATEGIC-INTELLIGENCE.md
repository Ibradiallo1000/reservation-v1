# Rapport Phase B3 — Predictive Strategic Intelligence

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/core/intelligence/trendEngine.ts` | Moteur de tendances pur : `computeRevenueTrend`, `computeOccupancyTrend`, `computeCostInflationTrend`, `computeAgencyPerformanceEvolution`, `computeAllTrends`. Entrée : séries 14 jours (revenus, remplissage, coûts, revenus par agence). Sortie : `TrendResult[]` (trend, percentageChange, insight, type). |
| `src/core/intelligence/strategicInsights.ts` | Générateur d’insights stratégiques : `generateStrategicInsights(anomalies, trends, agencyNames)` → `StrategicInsight[]` (level: info | warning | critical, message). `groupInsightsByLevel` pour l’affichage. |

## 2. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/core/intelligence/index.ts` | Export de `trendEngine` et `strategicInsights` (types et fonctions). |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Import `subDays`, `computeAllTrends`, `generateStrategicInsights`, `groupInsightsByLevel`, `Lightbulb`. États `dailyStats14`, `tripCosts14`. Dans `load()` : 2 requêtes (dailyStats 14 jours, tripCosts 14 jours). useMemos : `trendDates`, `trends`, `strategicInsights`, `insightsByLevel`, `trendResultsByType`. Nouvelle section « Strategic Insights » (Tendances, Recommandations, Évolution performance agences). |
| `firestore.indexes.json` | Index collectionGroup `dailyStats` (companyId ASC, date ASC) pour la requête sur 14 jours. |

## 3. Flux de données

- **Chargement 14 jours** : une fois par ouverture du CEO, sans listener.
  - `getDocs(collectionGroup("dailyStats"), companyId, date >= start14, date <= today, limit 500)`.
  - `getDocs(collection("tripCosts"), date >= start14, date <= today, limit 500)`.
- **Tendances** : en mémoire, à partir de `dailyStats14` et `tripCosts14`. Découpage en « derniers 7 jours » et « 7 jours précédents », puis calcul des écarts en % (revenus, remplissage, coûts) et évolution par agence.
- **Insights stratégiques** : combinaison des anomalies (B2) et des tendances ; règles métier (trajets en perte, écarts caisse, baisse revenus/remplissage, hausse coûts, agences en sur/sous-performance) pour produire des messages info / warning / critical.

## 4. Différenciation métier

- **Pilotage proactif** : le CEO voit non seulement l’état du jour (B1/B2) mais des tendances 7j vs 7j (hausse/baisse revenus, remplissage, coûts) et l’évolution par agence.
- **Recommandations actionnables** : les insights (ex. « Coûts opérationnels +18 % », « Agence X en baisse de 12 % ») orientent les décisions (tarifs, offre, affectation) sans avoir à interpréter des tableaux bruts.
- **Cohérence avec les anomalies** : les alertes (B2) et les tendances (B3) sont fusionnées dans une même section « Recommandations », ce qui évite une dispersion des signaux.

## 5. Avantage concurrentiel

- **Produit** : positionnement « intelligence financière + prédictif » plutôt que simple reporting : tendances et recommandations en temps quasi réel, sans BI externe.
- **Fidélisation** : valeur perçue accrue pour les directions (vision stratégique), ce qui renforce la rétention et la volonté de monter en gamme (plans supérieurs).
- **Scalabilité produit** : la même logique (trendEngine + strategicInsights) peut être réutilisée pour d’autres vues (par ligne, par période, exports) ou pour des notifications ciblées plus tard.

## 6. Impact scalabilité

- **Lectures** : +2 requêtes par chargement CEO (dailyStats 14j, tripCosts 14j), avec limite 500 docs. Pour des compagnies très grosses (nombreux dailyStats/tripCosts), la limite peut tronquer ; une pagination ou un pré-agrégat côté backend serait alors nécessaire.
- **Mémoire client** : agrégation de 500 docs max en séries par date/agence ; impact faible.
- **Index** : index composite `dailyStats` (companyId, date) requis pour la requête 14 jours ; sans lui, la requête échoue et les tendances restent vides (dégradation gracieuse).

## 7. Besoins en données

- **Obligatoire** : dailyStats avec `companyId`, `date`, `agencyId`, `totalRevenue`, `totalPassengers`, `totalSeats` sur les 14 derniers jours ; tripCosts avec `date` et champs de coût sur les 14 derniers jours.
- **Optionnel** : noms d’agences pour des messages plus lisibles dans les insights (déjà fournis par le CEO).
- **Non implémenté** : tendance « ligne Bamako–Kayes » (nécessiterait un découpage par trajet/ligne et des séries par ligne, à ajouter en extension).

## 8. Quand passer à un backend analytics

- **Volume** : au-delà de ~500 dailyStats ou tripCosts par requête, ou si l’on veut 30/90 jours, un job planifié (Cloud Function, BigQuery, etc.) qui pré-agrège par jour/semaine et écrit dans un document « companyInsights » est plus adapté.
- **Fréquence** : si les tendances doivent être recalculées à chaque écriture (temps réel), le calcul doit être côté serveur (trigger ou batch) pour éviter de refaire 2 grosses lectures à chaque changement.
- **Enrichissement** : prédictions ML, comparaison à des benchmarks sectoriels, ou corrélations multi-sources (météo, événements) impliquent des données et calculs qui ne peuvent pas rester uniquement dans le client.
- **Audit et reproductibilité** : un pipeline backend garantit que les mêmes règles et périodes sont appliquées pour tous les clients et pour l’historique (ex. « tendance du 12/02 »).

## 9. Impact performance

- **CPU** : calculs en mémoire (sommes, pourcentages, tris) sur des séries de taille bornée ; négligeable.
- **Réseau** : +2 lectures Firestore par chargement ; coût limité et une seule fois par visite.
- **UX** : pas de blocage ; les tendances et insights sont dérivés des mêmes données que le reste du dashboard, avec des useMemo pour éviter des recalculs inutiles.

---

*Rapport Phase B3 — Predictive Strategic Intelligence. Logique pure, ajout incrémental, aucune Cloud Function. Positionnement stratégique : différenciation par l’intelligence prédictive et recommandations actionnables.*
