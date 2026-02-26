# Diagnostic pendingRevenue (CEO Cockpit)

## 1. Récupérer une réservation qui devrait être comptée

Une réservation est comptée dans `pendingRevenue` si **toutes** les conditions suivantes sont vraies :

- La réservation est retournée par la requête `collectionGroup("reservations")` avec :
  - `companyId == companyId` (contexte CEO) **ou** `compagnieId == companyId` (correction V2)
  - `date >= startStr` et `date <= endStr`
- `statut === "payé"`
- `(shiftId ?? createdInSessionId)` est non vide
- Ce `shiftId` figure dans l’ensemble des shifts dont `status !== "validated"` (requête `collectionGroup("shifts")` avec `companyId == companyId` et `status != "validated"`)

Pour inspecter une réservation et son shift en base :

1. **Réservation** : dans la console Firestore, ouvrir `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}` (ou utiliser un script qui lit une réservation payée liée à une session ouverte).
2. Noter : `date`, `statut`, `shiftId`, `companyId`, `compagnieId`, `montant`.
3. **Shift** : ouvrir `companies/{companyId}/agences/{agencyId}/shifts/{shiftId}` avec le `shiftId` de la réservation.
4. Noter : `id` (id du document), `status`.

## 2. Champs à vérifier sur la réservation

- **date** : chaîne `yyyy-MM-dd` (ex. `2025-02-19`). Si c’est un Timestamp, la requête par `date >= startStr` / `date <= endStr` peut ne pas la retourner selon l’index.
- **statut** : exactement `"payé"` (avec accent).
- **shiftId** : id du document du shift (ex. `abc123`).
- **companyId** : si absent, la requête `where("companyId", "==", companyId)` ne retourne pas la réservation.
- **compagnieId** : présent sur les anciennes réservations ; si `companyId` est absent mais `compagnieId` présent, seule une requête sur `compagnieId` retourne la réservation.

## 3. Champs à vérifier sur le shift

- **id** : doit être égal à `reservation.shiftId` (ou `reservation.createdInSessionId`).
- **status** : doit être différent de `"validated"` pour que le shift soit dans `nonValidatedShiftIds`.

## 4. Conditions à valider

| # | Condition | Fait échouer si |
|---|-----------|------------------|
| 1 | `reservation.date` dans [startStr, endStr] | Date hors période ou format (Timestamp vs string) incohérent. |
| 2 | `reservation.statut === "payé"` | Statut différent (ex. `"paye"`, `"en_attente"`). |
| 3 | `shift.status !== "validated"` | Session déjà validée. |
| 4 | `reservation.shiftId === shift.id` | Référence shift incorrecte ou champ `createdInSessionId` utilisé à la place de `shiftId`. |
| 5 | Réservation retournée par la requête | Requête filtrée sur `companyId` alors que le document n’a que `compagnieId` → **cause la plus fréquente de pendingRevenue = 0**. |

## 5. Condition qui échoue le plus souvent

**La réservation n’est pas retournée par la requête** car elle n’a que le champ **`compagnieId`** et pas **`companyId`**.  
La requête actuelle est :

```ts
where("companyId", "==", companyId)
```

Les documents qui n’ont pas le champ `companyId` (ou qui ont seulement `compagnieId`) sont exclus, donc jamais pris en compte dans le calcul de `pendingRevenue`.

## 6. Correction minimale

- Inclure aussi les réservations identifiées par **`compagnieId`** : exécuter une deuxième requête `where("compagnieId", "==", companyId)` avec la même plage de dates, puis fusionner les deux listes par id de document (dédupliquer) et appliquer la même logique de calcul de `pendingRevenue`.
- Ajouter l’index Firestore nécessaire pour la requête sur `compagnieId` + `date` (collectionGroup `reservations`).

**Correction appliquée** dans `CEOCommandCenterPage.tsx` :

- Requête de secours `qReservationsCompagnie` : `where("compagnieId", "==", companyId)` + même plage `date`.
- Fusion des deux snapshots par id document (`resById`) pour éviter de compter deux fois une réservation qui a à la fois `companyId` et `compagnieId`.
- Calcul de `pendingRevenueAccum` sur la map fusionnée (même condition : `statut === "payé"`, `shiftId` dans `nonValidatedShiftIds`).
- Index Firestore ajouté dans `firestore.indexes.json` : `collectionGroup` `reservations` avec `compagnieId` (ASC) et `date` (ASC). Déployer les index si besoin : `firebase deploy --only firestore:indexes`.
