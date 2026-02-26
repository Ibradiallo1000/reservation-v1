# Comparaison Contrôle & Audit vs CEO Cockpit (pendingRevenue)

## 1. Requête Firestore exacte — Contrôle & Audit

**Fichier** : `src/modules/compagnie/pages/CompagnieComptabilitePage.tsx`  
**Fonction** : `loadPerformanceData` (lignes 257–296)

- **Chemin** : `collection(db, 'companies', user.companyId, 'agences', agency.id, 'reservations')`  
  → **Collection par agence** (pas de collectionGroup).
- **Requête** :
  ```ts
  query(
    reservationsRef,
    where('createdAt', '>=', Timestamp.fromDate(from)),
    where('createdAt', '<=', Timestamp.fromDate(to))
  )
  ```
- **Période** : `from` / `to` = dates de la période sélectionnée (jour, semaine, mois, custom), en `Date` ; converties en `Timestamp` pour Firestore.
- **Aucun filtre** sur `companyId`, `compagnieId`, `statut`, `shiftId`.  
- **Boucle** : une requête par agence (agences déjà chargées).

En résumé : Contrôle & Audit récupère **toutes les réservations dont la date de création (`createdAt`) est dans la période**, par agence, sans filtre sur la date de voyage ni sur companyId/compagnieId.

---

## 2. Requêtes Firestore exactes — CEO Cockpit (pendingRevenue)

**Fichier** : `src/modules/compagnie/pages/CEOCommandCenterPage.tsx`  
**Bloc** : `load()` (lignes 215–229)

**Requête 1 (companyId + date voyage)** :
```ts
query(
  collectionGroup(db, "reservations"),
  where("companyId", "==", companyId),
  where("date", ">=", startStr),
  where("date", "<=", endStr),
  limit(2000)
)
```

**Requête 2 (compagnieId + date voyage)** :
```ts
query(
  collectionGroup(db, "reservations"),
  where("compagnieId", "==", companyId),
  where("date", ">=", startStr),
  where("date", "<=", endStr),
  limit(2000)
)
```

- **Période** : `startStr` / `endStr` = `getDateRangeForPeriod(period, ...)` au format **string** `"yyyy-MM-dd"`.
- **Champ de date** : **`date`** (date du voyage / du trajet), pas `createdAt`.
- **Filtre compagnie** : `companyId` ou `compagnieId` égal à `companyId` (obligatoire pour la collectionGroup).
- **En mémoire** (après fusion des deux snapshots) : pour `pendingRevenueAccum`, seules les résa avec `statut === "payé"` et `shiftId` dans `nonValidatedShiftIds` sont comptées.

En résumé : le CEO ne voit que les réservations dont **la date de voyage (`date`) est dans la période** et dont le document a `companyId` ou `compagnieId` ; puis il filtre en mémoire par statut et shift.

---

## 3. Comparaison synthétique

| Critère | Contrôle & Audit | CEO Cockpit |
|--------|-------------------|-------------|
| **Scope** | Collection par agence : `companies/{id}/agences/{id}/reservations` | CollectionGroup `reservations` |
| **Filtre date** | **`createdAt`** (Timestamp) entre `from` et `to` | **`date`** (string yyyy-MM-dd) entre `startStr` et `endStr` |
| **Filtre statut** | Aucun (toutes les résa) | En mémoire : `statut === "payé"` pour pendingRevenue |
| **companyId / compagnieId** | Aucun (le chemin définit la compagnie/agence) | Obligatoire : `companyId` ou `compagnieId` == `companyId` |
| **shiftId** | Aucun | En mémoire : `shiftId` doit être dans `nonValidatedShiftIds` |

---

## 4. Différence logique exacte

La différence qui fait que Contrôle & Audit affiche 9 réservations guichet et le CEO 0 pour pendingRevenue est :

- **Contrôle & Audit** filtre sur **`createdAt`** (date de création de la réservation).
- **CEO Cockpit** filtre sur **`date`** (date du voyage / du trajet).

Donc :

- Les 9 réservations ont été **créées** dans la période (createdAt dans [from, to]) → Contrôle & Audit les inclut.
- Leur **date de voyage** (`date`) peut être **hors** de la période affichée dans le CEO (ex. voyage demain, ou autre format) → les requêtes CEO sur `date` ne les retournent pas → 0 réservation pour le calcul de pendingRevenue.

En plus, le CEO ne compte que les résa **payées** et dont le **shift n’est pas validé** ; si les requêtes ne renvoient déjà aucune résa à cause de `date`, ce filtre ne change rien au 0.

---

## 5. Pourquoi Contrôle & Audit voit 9 et le Cockpit 0

1. **Contrôle & Audit** utilise **createdAt** et un **chemin par agence** : il récupère toutes les réservations **créées** dans la période, donc les 9 résa guichet.
2. **CEO Cockpit** utilise **date** (voyage) et **collectionGroup** : il ne récupère que les réservations dont la **date de voyage** est dans [startStr, endStr]. Si les 9 ont une `date` hors de cette plage (ou absente / autre format), **aucune** n’est retournée → pendingRevenue = 0.

La cause est donc **le champ de date utilisé** : **createdAt** vs **date**, pas (ou pas seulement) companyId/compagnieId.

---

## 6. Correction minimale alignée avec la logique métier

**Logique métier** : « Ventes en attente de validation » = réservations **payées** dont la **session n’est pas validée**. La période pertinente est celle où la **vente a eu lieu** = **date de création** (comme en Contrôle & Audit).

**Correction** : Pour le calcul de **pendingRevenue**, inclure aussi les réservations dont **createdAt** est dans la période (en plus de celles filtrées par **date**), afin d’aligner la base avec Contrôle & Audit.

**Implémentation** :  
- Ajouter des requêtes CEO sur **createdAt** (Timestamp) pour la même période, avec `companyId` puis `compagnieId`.  
- Fusionner les résultats avec les snapshots existants (par id document) et calculer **pendingRevenue** sur cet ensemble fusionné (toujours avec `statut === "payé"` et `shiftId` dans `nonValidatedShiftIds`).

Voir les changements dans `CEOCommandCenterPage.tsx` (requêtes `qReservationsByCreatedAt`, `qReservationsCompagnieByCreatedAt`, fusion dans `resById`).
