# Optimisation structurelle – CEOCommandCenterPage

## 1. Nombre de requêtes : avant / après

| Contexte | Avant | Après |
|----------|--------|--------|
| **Chargement initial (N = 10 agences)** | 44 requêtes | **42 requêtes** |
| **Chargement initial (N = 30 agences)** | 104 requêtes | **102 requêtes** |

**Réduction :** 2 requêtes en moins (suppression des doublons dailyStats et tripCosts).

- **dailyStats** : chargé une seule fois ; le même résultat est utilisé pour `dailyStatsList` et `dailyStats14`.
- **tripCosts** : chargé une seule fois ; le même résultat est utilisé pour `tripCostsList` et `tripCosts14`.

---

## 2. Appels séquentiels : avant / après

| Phase | Avant | Après |
|-------|--------|--------|
| **Chargement initial (agences, dailyStats, liveState, expenses, tripCosts, riskSettings)** | 6 appels **séquentiels** | **1** round-trip (Promise.all des 6) |
| **Boucle shiftReports (par agence)** | Jusqu’à 50 appels **séquentiels** | **1** round-trip (Promise.all sur toutes les agences) |
| **Boucle shifts + reservations (par agence)** | Jusqu’à 60 appels **séquentiels** (2 × 30) | **1** round-trip (Promise.all ; par agence : Promise.all([shifts, reservations])) |
| **Finances (accounts, payables, proposals, settings)** | Déjà en Promise.all | Inchangé (1 round-trip) |

**Avant (ex. N = 10) :** 6 + 10 + 20 = **36** allers-retours séquentiels, puis 5 en parallèle, puis 1 onSnapshot.

**Après (ex. N = 10) :** 1 (batch initial) + 1 (shiftReports) + 1 (shifts+reservations) + 1 (finances) + 1 (onSnapshot) = **5** round-trips au total (dont 4 vagues de requêtes parallèles).

---

## 3. Nombre final de round-trips réseau

- **Chemin nominal (collectionGroup OK) :**  
  - 1 round-trip : Promise.all(agences, dailyStats, agencyLiveState, expenses, tripCosts, riskSettings).  
  - 1 round-trip : Promise.all(shiftReports pour toutes les agences).  
  - 1 round-trip : Promise.all(shifts+reservations pour toutes les agences).  
  - 1 round-trip : Promise.all(listAccounts, listUnpaidPayables, listPendingPaymentProposals, getFinancialSettings).  
  - 1 lecture initiale : onSnapshot(fleet).  

**Total : 5 round-trips** (au lieu d’une longue chaîne de 36+ appels séquentiels).

- **Fallback (si collectionGroup échoue) :**  
  - 1 getDocs(agences).  
  - 1 Promise.all(agences × getDoc(dailyStats), agences × getDoc(agencyLiveState)).  
  - Puis getRiskSettings, getDocs(tripCosts), getDocs(expenses) en séquence ou parallèle selon le code.  
  - Puis les mêmes 3 round-trips que ci-dessus (shiftReports, shifts+reservations, finances) + onSnapshot.

---

## 4. Gain de performance estimé

- **Suppression des doublons :** ~5 % de requêtes en moins et 2 RTT en moins.
- **Parallélisation du chargement initial :** les 6 premiers appels passent de 6 RTT séquentiels à 1 RTT → **réduction forte** du temps d’attente du premier bloc (souvent ~80 % sur cette phase).
- **Parallélisation des boucles agences :**  
  - shiftReports : de N RTT séquentiels à 1 RTT.  
  - shifts + reservations : de 2×N RTT séquentiels à 1 RTT.  
  → Pour N = 10 : de 30 RTT à 2 RTT ; pour N = 30 : de 90 RTT à 2 RTT.

**Estimation globale :** le temps de chargement de la page peut être **3 à 10 fois plus court** selon le nombre d’agences et la latence réseau, avec un temps perçu souvent **5 à 8 fois plus court** pour un périmètre typique (10–30 agences).

---

## 5. Confirmation : logique métier inchangée

- **Données lues :** mêmes collections, mêmes chemins, mêmes filtres (companyId, date, status, etc.).
- **Sémantique :**  
  - CA, dailyStats, dailyStats14, tripCostsList, tripCosts14, shiftReports, shifts, reservations, finances, fleet : calculs et usages identiques.  
  - Fallback quand collectionGroup échoue : même stratégie (agences puis getDoc par agence pour dailyStats et agencyLiveState), avec parallélisation interne (Promise.all) au lieu de boucles séquentielles.
- **État final :** les mêmes states sont mis à jour avec les mêmes valeurs ; seul l’ordre d’exécution et le regroupement des requêtes ont changé.
- **Structure Firestore :** aucune modification.
- **Index :** ajout d’un index pour `collectionGroup("agencyLiveState")` sur `companyId` (voir ci-dessous) pour que la requête soit correctement indexée.

---

## Index Firestore – agencyLiveState

La requête `collectionGroup(db, "agencyLiveState")` avec `where("companyId", "==", companyId)` nécessite un index composite sur le collection group.

**Configuration ajoutée dans `firestore.indexes.json` :**

```json
{
  "collectionGroup": "agencyLiveState",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "companyId", "order": "ASCENDING" }
  ]
}
```

Après déploiement des index (`firebase deploy --only firestore:indexes`), la requête agencyLiveState pourra s’exécuter sans erreur d’index et avec de bonnes perfs.
