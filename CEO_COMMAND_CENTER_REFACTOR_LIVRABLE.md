# Refactor CEO Command Center — CollectionGroup (livrable)

## 1. Nombre total de requêtes après refactor

- **Première vague (un seul round-trip)** : 9 requêtes en parallèle dans un même `Promise.all`  
  `agences`, `dailyStats` (collectionGroup), `agencyLiveState` (collectionGroup), `expenses` (collectionGroup), `tripCosts` (collectionGroup), `getRiskSettings`, `shiftReports` (collectionGroup), `shifts` (collectionGroup), `reservations` (collectionGroup).

- **Deuxième vague** : 4 requêtes en parallèle  
  `listAccounts`, `listUnpaidPayables`, `listPendingPaymentProposals`, `getFinancialSettings`.

**Total : 13 requêtes Firestore**, en **2 round-trips** (9 puis 4). Aucune boucle par agence : le nombre de requêtes ne dépend plus du nombre d’agences.

---

## 2. Boucles par agence supprimées

| Avant (par agence) | Après |
|-------------------|--------|
| `getDocs(companies/{companyId}/agences/{agencyId}/reservations)` pour chaque agence | **1** requête `collectionGroup("reservations")` avec `companyId` + filtre `date` (startStr → endStr). |
| `getDocs(…/agences/{agencyId}/shifts)` pour chaque agence | **1** requête `collectionGroup("shifts")` avec `companyId` (+ filtre `status != "validated"`). |
| `getDocs(…/agences/{agencyId}/shiftReports)` pour chaque agence | **1** requête `collectionGroup("shiftReports")` avec `companyId` et `status == "validated"`. |

En cas de fallback (si les collectionGroups échouent), la page peut encore utiliser des lectures par agence pour `dailyStats` et `agencyLiveState` uniquement, pour rester fonctionnelle sans index.

---

## 3. Index composites requis (Firestore)

Les index suivants ont été ajoutés dans `firestore.indexes.json` :

| Collection group   | Champs indexés        | Usage |
|-------------------|------------------------|--------|
| **shiftReports**  | `companyId` (ASC), `status` (ASC) | Requête `companyId == X` et `status == "validated"`. |
| **shifts**        | `companyId` (ASC), `status` (ASC) | Requête `companyId == X` et `status != "validated"`. |
| **reservations**  | `companyId` (ASC), `date` (ASC)   | Requête `companyId == X` et plage `date` (startStr → endStr). |

Déploiement des index :

```bash
firebase deploy --only firestore:indexes
```

**Réservations** : la requête utilise le champ **`companyId`**. Les nouvelles réservations (guichet) écrivent désormais `companyId` en plus de `compagnieId`. Pour les anciennes réservations qui n’ont que `compagnieId`, un backfill ajoutant `companyId` est recommandé si vous voulez les inclure dans cette requête.

---

## 4. Estimation du nouveau temps de chargement

- **Avant** : ~5 s, avec des requêtes séquentielles ou par agence (N agences × plusieurs lectures par agence).
- **Après** :  
  - 1ère vague : 6 requêtes en parallèle.  
  - 2e vague : 3 requêtes (shiftReports, shifts, reservations) — peuvent être mises en parallèle avec la 1ère vague pour un seul aller-retour.  
  - 3e vague : 4 requêtes financières en parallèle.  

En parallélisant la 1ère et la 2e vague (9 requêtes en un seul `Promise.all`), on obtient **2 allers-retours** (9 + 4) au lieu de N × plusieurs. Temps typique : **~300–800 ms** (selon latence Firestore et volume de docs), au lieu de ~5 s.

---

## 5. Réduction des round-trips (objectif 6–8)

L’objectif était « maximum 6–8 requêtes ». Aujourd’hui on est à **13 requêtes** (9 données principales + 4 financières), sans boucle par agence. Pour tendre vers 6–8 sans changer le produit :

- Regrouper les 9 requêtes du premier bloc en une seule vague parallèle (déjà possible en fusionnant le premier `Promise.all` avec shiftReports/shifts/reservations) : le **nombre** reste 13, mais le **temps** ne dépend que de 2 vagues.
- Réduire vraiment à 6–8 requêtes nécessiterait soit d’agréger des données côté serveur (Cloud Functions / documents agrégés), soit de supprimer ou fusionner certaines sources (ex. moins de champs financiers chargés d’un coup).

La logique métier (écarts, revenus par trajet, encaisses non validés, etc.) est inchangée ; seules les lectures Firestore passent en collectionGroup et ne dépendent plus du nombre d’agences.
