# Rapport Phase B1 — Financial Intelligence: Profit Engine

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/core/intelligence/types.ts` | Types d’entrée/sortie du moteur de profit (ProfitResult, TripProfitInput, AgencyProfitInput, CompanyProfitInput). Aucune dépendance Firestore. |
| `src/core/intelligence/profitEngine.ts` | Fonctions pures : `calculateTripProfit`, `calculateAgencyProfit`, `calculateCompanyProfit`. Marge = profit / revenu (0 si revenu = 0). |
| `src/core/intelligence/index.ts` | Barrel export du module intelligence. |

## 2. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Chargement des agences déplacé dans `load()`. Ajout des états `expensesList`, `discrepancyReports`, `tripRevenues`. Dans `load()` : un `getDocs` sur `collectionGroup('expenses')` (companyId), puis une boucle par agence pour `shiftReports` (validated) et pour `reservations` (date = aujourd’hui), agrégation en mémoire. Nouveaux `useMemo` : `expensesByAgency`, `discrepancyDeductionByAgency`, `agencyProfits`, `companyProfit`, `tripProfitsSorted`, `top5TripsByProfit`, `bottom5TripsByMargin`, `mostProfitableAgency`, `leastProfitableAgency`. Nouvelle section UI « Financial Intelligence » (profit total, marge %, agence la plus/moins rentable, top 5 trajets par profit, top 5 trajets par marge la plus faible). |
| `src/core/index.ts` | Réexport de `./intelligence`. |

## 3. Flux de données

1. **Chargement (une fois par visite de la page)**  
   - `getDocs(companies/{companyId}/agences)` → liste des agences.  
   - `getDocs(collectionGroup('dailyStats'), companyId, date == TODAY)` → revenus du jour par agence (ou fallback N lectures par agence).  
   - `getDocs(collectionGroup('agencyLiveState'), companyId)` → état live.  
   - `getDocs(collectionGroup('expenses'), companyId)` → dépenses (si index présent).  
   - Pour chaque agence (jusqu’à 50) : `getDocs(shiftReports, status == validated)` → écarts comptables (computedDifference &lt; 0).  
   - Pour chaque agence (jusqu’à 30) : `getDocs(reservations, date == TODAY)` → agrégation par `trajetId` pour revenu par trajet.  

2. **Moteur de profit (pur, en mémoire)**  
   - **Trip** : `revenue` (réservations par trajet) − `cost` (structure prête pour fuel, chauffeur, convoyeur, opérationnel, commission mobile si canal en_ligne) ; aujourd’hui coût = 0.  
   - **Agency** : `revenueFromDailyStats` − `expensesTotal` (dépenses avec cet `agencyId`) − `discrepancyDeduction` (somme des |computedDifference| quand &lt; 0).  
   - **Company** : somme des résultats agence (revenu total, coût total, profit, marge).  

3. **Affichage**  
   - Profit total du jour et marge % (company).  
   - Agence la plus rentable / la moins rentable (max/min profit parmi les agences).  
   - Top 5 trajets par profit (revenu trajet, coût 0).  
   - Top 5 trajets par marge la plus faible (revenu &gt; 0, tri par marge croissante).  

## 4. Implications sécurité

- Aucune règle Firestore modifiée. Les lectures restent soumises aux règles existantes (accès compagnie/agence).  
- Les calculs de profit sont côté client ; les données sensibles (revenus, dépenses) sont déjà accessibles à l’utilisateur (CEO) via les collections existantes.  
- Aucune donnée nouvelle exposée : réutilisation de `dailyStats`, `expenses`, `shiftReports`, `reservations`.  

## 5. Concurrence

- Pas de Cloud Functions : tout est en lecture. Aucun write dans le Profit Engine.  
- Les agrégats (dailyStats, shiftReports) sont mis à jour ailleurs (guichet, validation de session). Les lectures du CEO peuvent voir un état légèrement dépassé le temps d’un rechargement de page.  
- Pas de verrou ni de transaction côté moteur de profit.  

## 6. Multi-agence

- Chaque agence contribue à un résultat agence (revenu dailyStats, dépenses par `agencyId`, écarts par agence).  
- Le profit compagnie = somme des profits agences ; support explicite de 50+ agences via une boucle unique (pas de boucles imbriquées par trajet).  
- Les dépenses sans `agencyId` (compagnie) sont regroupées sous `_company` ; actuellement non rattachées à une agence dans l’affichage « agence la plus / moins rentable » (uniquement agences avec au moins un dailyStats / dépense / écart).  

## 7. Plafond de scalabilité et charge

- **Lectures par chargement page (ordre de grandeur)**  
  - Succès collectionGroup : 1 (agences) + 1 (dailyStats) + 1 (agencyLiveState) + 1 (expenses) + 50 (shiftReports) + 30 (reservations) ≈ **84 lectures**.  
  - Fallback sans collectionGroup : 1 + 50×2 (dailyStats + liveState) + 1 (expenses) + 50 (shiftReports) + 30 (reservations) ≈ **182 lectures**.  

- **100 agences**  
  - Boucles limitées à 50 agences pour shiftReports et 30 pour réservations. Au-delà, une partie des agences est ignorée pour les écarts et les trajets. Pour 100 agences sans changer les limites : même nombre de lectures, mais couverture partielle. Pour couvrir 100 agences il faudrait augmenter les slices (50 → 100 pour shiftReports, 30 → 100 pour reservations) : ~250 lectures par chargement.  

- **500 trajets/jour**  
  - Les « trajets » affichés sont des `trajetId` agrégés à partir des réservations (max 200 par agence × 30 agences = 6000 réservations max). 500 trajets distincts sont supportés ; le tri et le slice(0, 5) restent O(n) en mémoire. Pas de listener par trajet.  

- **Goulots d’étranglement**  
  - Boucle `getDocs(shiftReports)` par agence : 50 lectures séquentielles ou en parallèle (actuellement en parallèle via une boucle async).  
  - Boucle `getDocs(reservations)` par agence : 30 lectures.  
  - Index Firestore manquant sur `collectionGroup('expenses').companyId` : les dépenses ne remontent pas, profit agence/compagnie sans dépenses (revenus seulement).  

- **Quand des Cloud Functions deviennent pertinentes**  
  - Agrégation quotidienne (profit par agence/compagnie) pré-calculée et stockée dans un document (ex. `companies/{id}/intelligence/daily/{date}`) pour éviter 80+ lectures à chaque ouverture du CEO.  
  - Dépassement des limites de lectures par page (ex. &gt; 100 agences avec couverture complète).  
  - Besoin de cohérence temps réel (écriture des agrégats à chaque validation de session / dépense).  
  - Mise en cache ou pré-agrégation des revenus par trajet pour éviter les 30 lectures réservations.  

## 8. Évolutions futures

- **Coûts par trajet** : étendre `TripCostInput` et les dépenses avec un champ optionnel `tripId` (ou `trajetId`) pour alimenter fuel, chauffeur, convoyeur, commission mobile.  
- **Période paramétrable** : aujourd’hui « aujourd’hui » uniquement ; ajouter un sélecteur de date ou de plage et adapter les requêtes (dailyStats par date, expenses par createdAt, shiftReports par plage).  
- **Export (CSV/PDF)** : réutiliser les mêmes `agencyProfits` et `companyProfit` pour générer des rapports.  
- **Alertes** : seuils sur marge ou profit (ex. alerte si marge &lt; 10 % ou profit &lt; 0) à partir des mêmes métriques.  
- **Index Firestore** : créer l’index composite pour `collectionGroup('expenses')` sur `companyId` (et éventuellement `createdAt`) pour activer le chargement des dépenses en production.  

---

*Rapport Phase B1 — Financial Intelligence (Profit Engine). Aucune logique existante supprimée, pas de Cloud Functions, compatible Firebase Spark.*
