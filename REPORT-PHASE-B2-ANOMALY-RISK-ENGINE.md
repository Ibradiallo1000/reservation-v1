# Rapport Phase B2 — Financial Anomaly & Risk Engine

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/core/intelligence/riskSettings.ts` | Types `RiskSettingsDoc`, constantes `DEFAULT_RISK_SETTINGS`, `mergeWithDefaults()`. Seuils : minimumMarginPercent (10), maxTransitHours (12), maxCashDiscrepancy (5000), minimumOccupancyRate (50). |
| `src/core/intelligence/riskSettingsService.ts` | Lecture Firestore : `getRiskSettings(companyId)` → document `companies/{companyId}/riskSettings/current`. Retourne les défauts si le document est absent. |
| `src/core/intelligence/anomalyEngine.ts` | Moteur pur : `detectAnomalies(input)` et `groupAnomaliesBySeverity(anomalies)`. Six règles (voir ci‑dessous). Aucun appel Firestore. |

## 2. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/core/intelligence/index.ts` | Export de `riskSettings`, `riskSettingsService`, `anomalyEngine` (types et fonctions). |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | État `riskSettings` ; dans `load()`, appel à `getRiskSettings(companyId)` ; `useMemo` pour construire l’entrée du moteur à partir de `tripProfitsSorted`, `agencyProfits`, `discrepancyReports`, `fleetVehicles`, `dailyStatsList`, `riskSettings` ; `useMemo` pour `anomalies` et `anomaliesBySeverity` ; nouvelle section UI « Risques et anomalies » (🔴 Élevé, 🟠 Moyen, 🟢 Faible). |

## 3. Règles d’anomalie (moteur pur)

1. **Trajet en perte** (profit &lt; 0) → **high** — `trip_negative_profit`, referenceId = tripId.
2. **Marge trajet &lt; seuil** (revenue &gt; 0 et margin &lt; minimumMarginPercent) → **medium** — `trip_low_margin`.
3. **Profit agence sous moyenne glissante 7 jours** → **medium** — `agency_below_rolling_avg`. *Exécutée uniquement si `agencyProfitHistory7d` est fourni ; aujourd’hui non alimenté par le CEO (pas de données 7 jours), donc règle inactive.*
4. **Écart de caisse &gt; maxCashDiscrepancy** (valeur absolue par agence) → **high** — `cash_discrepancy_high`.
5. **Véhicule en transit depuis &gt; maxTransitHours** (d’après `lastMovementAt`) → **medium** — `vehicle_transit_stale`.
6. **Taux de remplissage agence &lt; minimumOccupancyRate** (totalPassengers / totalSeats &lt; seuil) → **low** — `low_occupancy`.

Structure de sortie : `{ severity: "low"|"medium"|"high", type: string, message: string, referenceId?: string }`.

## 4. Flux de données

- **Paramètres** : au chargement du CEO, un seul `getDoc(companies/{companyId}/riskSettings/current)`. Si absent ou erreur → `DEFAULT_RISK_SETTINGS`. Aucun listener.
- **Entrée du moteur** : construite en mémoire à partir de données déjà chargées (dailyStats, tripCosts, tripProfitsSorted, agencyProfits, discrepancyReports, fleetVehicles). Aucune requête supplémentaire.
- **Calcul** : `detectAnomalies(input)` et `groupAnomaliesBySeverity(anomalies)` dans des `useMemo` dépendant de ces données et de `riskSettings`. Recalcul uniquement quand l’une de ces dépendances change.

## 5. Faux positifs et limites

- **Marge faible** : un trajet à forte valeur ajoutée mais marge volontairement basse (promo, longue distance) peut être signalé ; le seuil doit être ajusté par compagnie (riskSettings).
- **Transit long** : `lastMovementAt` peut ne pas être mis à jour à chaque mouvement ; un véhicule “en transit” longtemps peut être un oubli de mise à jour plutôt qu’un vrai retard.
- **Remplissage &lt; 50 %** : trajets en début/fin de journée ou lignes peu demandées génèrent des alertes “low” ; utile pour le pilotage, pas forcément pour une alerte critique.
- **Agence sous moyenne 7j** : règle désactivée tant que le CEO ne charge pas d’historique 7 jours (nécessiterait un autre fetch ou un agrégat pré-calculé).

## 6. Scalabilité

- **Moteur** : pure logique, O(n) sur les tableaux fournis (trajets, agences, véhicules, écarts). Pas de limite structurelle.
- **CEO** : une lecture `riskSettings` de plus par chargement ; agrégation et détection entièrement en mémoire. Pas de nouveau listener ni de N+1.
- **Document riskSettings** : un document par compagnie ; taille fixe. Pas d’impact sur la scalabilité des collections existantes.

## 7. Quand déplacer le moteur côté backend

- **Temps réel** : si les anomalies doivent être notifiées (email, push) ou mises à jour en continu sans rafraîchir la page, un job planifié ou une Cloud Function (trigger sur écriture dailyStats / shiftReports / tripCosts) est plus adapté.
- **Historique d’anomalies** : pour garder un journal (qui a été alerté, quand), il faut des écritures côté serveur (ex. `companies/{companyId}/anomalyLog`).
- **Règles lourdes** : corrélations multi-collections, ML, ou règles qui nécessitent des données non chargées dans le CEO (ex. 7 jours d’historique) → à traiter en backend pour éviter de surcharger le client et de multiplier les lectures.
- **Audit et conformité** : une exécution centralisée (Cloud Function planifiée) garantit que les mêmes règles tournent pour tous les utilisateurs et à intervalles définis.

## 8. Impact performance

- **CPU client** : quelques boucles sur des listes déjà en mémoire (trajets, agences, véhicules, dailyStats) ; négligeable pour des centaines d’entrées.
- **Lectures Firestore** : +1 `getDoc(riskSettings/current)` par chargement du CEO.
- **Re-renders** : les `useMemo` évitent de recalculer les anomalies tant que les données ou `riskSettings` ne changent pas.

## 9. Valeur métier

- **Trajet en perte / marge faible** : identification des trajets non rentables ou sous seuil de marge pour ajuster tarifs, coûts ou offres.
- **Écart de caisse élevé** : signalement des écarts au-dessus du seuil pour contrôle et réconciliation.
- **Véhicule en transit trop longtemps** : détection de retards ou de véhicules “oubliés” en statut transit pour suivi opérationnel.
- **Faible remplissage** : pilotage de l’occupation et des lignes à rationaliser ou à promouvoir.

Les seuils configurables (`riskSettings`) permettent d’adapter la sensibilité par compagnie sans toucher au code.

---

*Rapport Phase B2 — Financial Anomaly & Risk Engine. Aucune Cloud Function, aucun changement cassant, tout en additif.*
