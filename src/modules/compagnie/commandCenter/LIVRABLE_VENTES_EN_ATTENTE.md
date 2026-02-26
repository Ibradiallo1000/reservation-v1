# Livrable : Ventes en attente de validation (Centre Stratégique V2)

## Fichiers modifiés

- **`src/modules/compagnie/pages/CEOCommandCenterPage.tsx`**
  - Type `ReservationRow` étendu avec `statut`, `shiftId`, `createdInSessionId`.
  - State `pendingRevenue` (number) et `setPendingRevenue` ajoutés.
  - Dans la boucle de chargement existante (par agence) : requête des shifts non validés, puis lors du parcours des réservations déjà chargées, cumul de `montant` si `statut === "payé"` et session non validée → `setPendingRevenue(pendingRevenueAccum)`.
  - Affichage sous le CA (blocs A et C) : ligne « Ventes en attente de validation : X » ou « 0 en attente » (police plus petite, couleur neutre `text-slate-500`).

---

## Requêtes utilisées

- **Réservations (existante, réutilisée)**  
  Pour chaque agence (déjà en place pour les revenus par trajet) :
  - Collection : `companies/{companyId}/agences/{agencyId}/reservations`
  - Filtres : `where("date", ">=", startStr)`, `where("date", "<=", endStr)`, `limit(500)`
  - Aucune requête réservations supplémentaire.

- **Sessions (shifts) non validées (ajout dans la même boucle)**  
  Pour chaque agence, avant la requête réservations :
  - Collection : `companies/{companyId}/agences/{agencyId}/shifts`
  - Filtre : `where("status", "!=", "validated")`, `limit(200)`
  - But : obtenir l’ensemble des IDs de sessions non validées pour cette agence, puis ne compter dans `pendingRevenue` que les réservations dont la session (shiftId / createdInSessionId) est dans cet ensemble.

---

## Détection du statut « session non validée »

- Une session est considérée **non validée** si le document **shift** correspondant a un champ **status** différent de **"validated"** (valeurs possibles : `pending`, `active`, `paused`, `closed`, `validated` — cf. `SHIFT_STATUS` dans `sessionLifecycle.ts`).
- Pour chaque réservation, la session est identifiée par **shiftId** ou **createdInSessionId** (aligné sur le payload des réservations guichet).
- Logique : on charge une fois par agence la liste des IDs de shifts avec `status != "validated"` ; pour chaque réservation avec `statut === "payé"` et dont l’ID de session appartient à cette liste, on ajoute `montant` à `pendingRevenue`. Aucune modification de la logique de validation des sessions ni des écritures dailyStats.

---

## Confirmation : aucune logique métier supprimée

- Le **CA consolidé** reste exclusivement la somme des **dailyStats.totalRevenue** (aucun changement).
- Aucune fusion de `pendingRevenue` dans le CA principal.
- Aucune modification de la logique de validation des sessions, des écritures dailyStats, ni de la structure Firestore.
- Les requêtes réservations existantes sont réutilisées ; seules des requêtes **shifts** par agence ont été ajoutées dans la boucle déjà en place, sans duplication de la requête réservations.
