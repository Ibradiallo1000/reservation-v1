# Rapport Phase B4 — Strategic Monetized Intelligence & Scalability Consolidation

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/core/intelligence/revenueProjection.ts` | Moteur de prévision fin de mois : `calculateDailyAverage`, `projectEndOfMonthRevenue`, `projectEndOfMonthProfit`, `projectEndOfMonth`. Confiance (low/medium/high) selon le nombre de jours d’historique (< 5, 5–14, > 14). |
| `src/core/intelligence/simulationEngine.ts` | Simulation what-if pure : `simulateMarginChange`, `simulateOccupancyIncrease`, `simulateFuelCostVariation`. Entrée/sortie en mémoire, pas d’écriture Firestore. |
| `src/core/intelligence/healthScoreEngine.ts` | Score santé 0–100 et catégorie (Critical / Fragile / Stable / Strong / Elite) à partir de marge, remplissage, ratio écarts, ratio retard transit, tendance revenus. |
| `src/core/aggregates/companyAggregates.ts` | Schéma du document `companies/{companyId}/aggregates/current` et fonction pure `computeAggregatesFromSnapshot` pour calculer les agrégats à partir des données déjà chargées (fallback sans lecture du doc). |
| `src/core/aggregates/index.ts` | Barrel export des types et de `computeAggregatesFromSnapshot`. |
| `src/core/ui/UpgradeBanner.tsx` | Composant d’upsell : message « Fonctionnalité premium » avec `planRequired` et `featureName`. |

## 2. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/core/permissions/capabilities.ts` | Ajout des capacités : `view_anomaly_engine`, `view_predictive_insights`, `use_simulation_engine`. |
| `src/core/subscription/plans.ts` | **Starter** : inchangé (pas de profit, anomalie, prédictif). **Growth** : ajout `view_profit_analysis`, `view_anomaly_engine`. **Enterprise** : ajout `view_predictive_insights`, `use_simulation_engine` (en plus de Growth). |
| `src/core/permissions/roleCapabilities.ts` | `admin_compagnie` et `financial_director` : ajout des 3 nouvelles capacités. |
| `src/core/intelligence/index.ts` | Export de revenueProjection, simulationEngine, healthScoreEngine. |
| `src/core/hooks/useCapabilities.ts` | Cache mémoire 5 minutes (timestamp) pour le plan d’abonnement par `companyId` ; lecture Firestore évitée si cache valide. |
| `src/core/index.ts` | Export de `./aggregates`. |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Intégration : prévision fin de mois (section « Prévision fin de mois »), simulation (panel avec 3 sliders : remplissage, carburant, prix billet), indice de santé (section « Indice de santé entreprise »). Verrouillage par capacité : Financial Intelligence → `view_profit_analysis`, Anomalies → `view_anomaly_engine`, Strategic Insights + Prévision → `view_predictive_insights`, Simulation → `use_simulation_engine`. Affichage de `<UpgradeBanner>` lorsque la capacité est absente. |

## 3. Stratégie de monétisation

- **Différenciation par paliers** : Starter = tableaux de bord de base ; Growth = moteur de profit, coûts trajets, moteur d’anomalies ; Enterprise = tendances, prévision, simulation, seuils de risque avancés.
- **Valeur perçue** : les directions voient d’abord les indicateurs de base, puis le profit et les alertes (Growth), puis la prévision et le what-if (Enterprise), ce qui justifie la montée en gamme.
- **UpgradeBanner** : message unique « Disponible sur le plan X » sans lien de paiement (à brancher plus tard sur la page abonnement ou un CTA externe).

## 4. Logique de différenciation des plans

- **Starter** : accès agence (dashboard, guichet, réservations, etc.) ; pas de vue globale profit/anomalies/insights.
- **Growth** : vue globale + Financial Intelligence (profit, marge, coûts trajets) + Risques et anomalies ; pas de prévision ni simulation.
- **Enterprise** : tout Growth + Strategic Insights (tendances 7j vs 7j, recommandations, évolution agences) + Prévision fin de mois + Simulation what-if. Les rôles `admin_compagnie` et `financial_director` ont les capacités dans la matrice rôle ; le plan débloque ou non.

## 5. Gains de scalabilité

- **Cache 5 min (useCapabilities)** : une lecture `subscription/current` par companyId au plus toutes les 5 minutes ; moins de lectures sur les pages répétées (CEO, paramètres, etc.).
- **Document agrégats** : le schéma `aggregates/current` (todayRevenue, todayProfit, todayPassengers, activeSessions, boardingOpenCount, vehiclesInTransit, updatedAt) est défini ; la mise à jour de ce document n’est pas implémentée dans cette phase (nécessiterait soit des Cloud Functions déclenchées par écriture de dailyStats/agencyLiveState/boardingStats, soit des transactions côté client dans les modules existants). Le CEO continue d’utiliser les lectures actuelles (collectionGroup dailyStats, agencyLiveState, etc.) ; `computeAggregatesFromSnapshot` permet de dériver les mêmes chiffres en mémoire si on charge déjà les données.
- **Réduction des lectures Firestore (estimation)** : une fois les agrégats alimentés (backend ou client), le CEO pourrait en théorie ne lire que `aggregates/current` + `fleetVehicles` (limité) + éventuellement les données d’intelligence (14 jours, paramètres risque). Aujourd’hui, aucune réduction effective des lectures n’est faite ; l’architecture est prête pour une migration ultérieure.

## 6. Estimation de réduction des lectures (après migration)

- **Actuel (CEO)** : 1 collectionGroup dailyStats (today), 1 collectionGroup agencyLiveState, 1 collectionGroup expenses, N lectures shiftReports par agence, N lectures reservations par agence, 1 collection tripCosts (today), 1 getDoc riskSettings, 1 collectionGroup dailyStats (14j), 1 collection tripCosts (14j), 1 onSnapshot fleetVehicles. Ordre de grandeur : dizaines de lectures + 1 listener.
- **Cible (avec agrégats)** : 1 getDoc `aggregates/current`, 1 query fleetVehicles (limité), 1 getDoc riskSettings, puis selon besoin : 1 query dailyStats 14j, 1 query tripCosts 14j. Réduction forte des lectures « temps réel » du jour (remplacées par un seul document).

## 7. Parcours de migration vers l’analytics backend

- **Quand migrer** : volume élevé (nombreuses agences, nombreux dailyStats/tripCosts), besoin de prévisions/scores en temps quasi réel à chaque écriture, ou audit reproductible des indicateurs.
- **Comment** : Cloud Functions (ou batch) qui, sur écriture de dailyStats / agencyLiveState / boardingStats, mettent à jour `aggregates/current` (increment / set avec merge). Optionnel : job nocturne pour recalculer prévisions et health score et les écrire dans un doc `companyInsights/current`.
- **Compatibilité** : les moteurs (revenueProjection, simulation, healthScore) restent purs et réutilisables côté backend (Node) ou dans un pipeline type Spark si besoin.

## 8. Positionnement avantage concurrentiel

- **Produit** : offre « intelligence stratégique monétisée » (prévision, simulation, indice de santé) en plus du reporting et des anomalies, avec verrouillage par plan.
- **Technique** : logique pure, pas de Cloud Functions dans cette phase, cache simple côté client, schéma d’agrégats prêt pour un passage backend progressif.

## 9. Améliorations architecturales suggérées

- **Alimentation des agrégats** : intégrer la mise à jour de `aggregates/current` dans les transactions existantes (dailyStats, agencyLiveState) ou via une Cloud Function pour éviter les lectures multiples au chargement CEO.
- **UpgradeBanner** : ajouter un lien vers la page abonnement ou un CTA « Passer à Enterprise » pour convertir.
- **Prévision** : aujourd’hui basée sur le mois en cours et les 14 derniers jours ; pour une prévision plus robuste, envisager un historique mensuel (ex. 3 mois) et un coefficient de saisonnalité.
- **Health score** : les seuils (85/70/50/30) et les poids (marge, remplissage, écarts, transit, croissance) sont fixes ; les rendre configurables (ex. dans riskSettings ou paramètres entreprise) permettrait d’adapter au secteur.

---

*Rapport Phase B4 — Strategic Monetized Intelligence & Scalability Consolidation. Aucune Cloud Function ; construction incrémentale ; compatible Spark. Positionnement : monétisation par paliers et préparation scalabilité.*
