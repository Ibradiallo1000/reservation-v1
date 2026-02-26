# Diagnostic : indicateurs V2 à 0 / vides vs données réservations existantes

## 1. Collections et chemins Firestore utilisés par les indicateurs V2

Les indicateurs exécutifs V2 (CA, variation %, indice santé, top/bottom agences, etc.) s’appuient sur les sources suivantes :

| Indicateur V2 | Source Firestore | Chemin exact | Champs lus |
|---------------|------------------|--------------|------------|
| **CA période** (globalRevenue) | `collectionGroup("dailyStats")` | Documents dans toute sous-collection nommée `dailyStats` | `companyId`, `date`, `totalRevenue`, `agencyId` (et éventuellement totalPassengers, totalSeats) |
| **Liquidités réelles** | `listAccounts(companyId)` + `listUnpaidPayables(companyId)` | Pas de collection `reservations` | Comptes trésorerie, payables |
| **Variation %** | Même source que le CA : `dailyStats14` (même requête que dailyStats) + moteur de tendances | Idem `dailyStats` | `totalRevenue` par date, pour calcul 7j vs 7j |
| **Indice Santé Réseau** | Dérivé de globalRevenue, dailyStats, etc. | Idem | — |
| **Top 3 / Bottom 3 / Agences en baisse** | `dailyStatsList` (même requête) | Idem | `agencyId`, `totalRevenue` |
| **Sessions en attente** | `collectionGroup("agencyLiveState")` | `companies/{companyId}/agences/{agencyId}/agencyLiveState/current` | `closedPendingValidationCount` |

Chemin effectif des documents **dailyStats** utilisés pour le CA et la période :

- **Path :** `companies/{companyId}/agences/{agencyId}/dailyStats/{date}`
- **date** = ID du document, format **YYYY-MM-DD** (ex. `2025-02-19`).
- Chaque document contient au minimum : `companyId`, `agencyId`, `date`, `totalRevenue`, `totalPassengers`, `totalSeats`, etc.

Les indicateurs V2 **ne lisent jamais** la collection `reservations` pour le CA. Ils lisent **uniquement** la sous-collection **dailyStats** par agence.

---

## 2. Structure réelle des réservations dans le projet

- **Chemin :** `companies/{companyId}/agences/{agencyId}/reservations`
  - Il n’existe **pas** de collection `companies/{companyId}/reservations` au niveau compagnie.
- **Champs pertinents :**
  - `date` : string (date du trajet, format cohérent YYYY-MM-DD dans guichetReservationService).
  - `montant` : number (revenu de la réservation).
  - `createdAt` : Timestamp.
  - `statut` : ex. `'payé'`, etc.

Confirmé dans : `guichetReservationService.ts`, `useManagerAlerts.ts`, `sessionService.ts`, `CEOCommandCenterPage.tsx` (boucle tripRevenues).

---

## 3. Où se situe le décalage

### 3.1 Source du CA : dailyStats, pas reservations

- Le **CA affiché** (blocs A et C) est `globalRevenue` = somme des `totalRevenue` des documents **dailyStats** (dailyStatsList).
- La collection **reservations** contient bien les montants (`montant`) mais n’est **pas utilisée** pour calculer ce CA.
- Donc : **toute donnée existant uniquement dans `reservations`** (données de test, imports, etc.) **n’apparaît pas** dans les indicateurs V2.

### 3.2 Alimentation de dailyStats

- **dailyStats** est mis à jour uniquement par le code applicatif, dans des transactions :
  - **À la création d’une réservation** (`updateDailyStatsOnReservationCreated`) : seuls **totalPassengers** et **totalSeats** sont incrémentés. **Aucun totalRevenue** n’est écrit.
  - **À la validation d’une session** (`updateDailyStatsOnSessionValidated`) : **totalRevenue** et **validatedSessions** sont alors incrémentés.
- Conséquences :
  - Si les données de test sont des **réservations** sans **sessions validées**, les documents dailyStats peuvent exister (si les réservations ont été créées via l’app) mais avec **totalRevenue = 0**.
  - Si les données de test ont été insérées **directement** dans Firestore (script, console, autre outil) dans `reservations` sans passer par l’app, **aucun document dailyStats** n’est créé pour ces jours → CA = 0.

Résumé du décalage : **la source des indicateurs V2 (dailyStats) n’est pas alimentée par une agrégation des réservations** ; elle est alimentée uniquement par les écritures liées aux sessions validées (et aux créations de réservation pour passagers/sièges uniquement).

---

## 4. Filtrage par date

### 4.1 Période utilisée (Poste de Pilotage)

- `periodRange` = `getDateRangeForPeriod(period, new Date(), customStart, customEnd)`.
- Par défaut **period = "month"** → `startStr` et `endStr` = premier et dernier jour du **mois en cours** (format `yyyy-MM-dd`).
- Les requêtes **dailyStats** utilisent :
  - `where("date", ">=", startStr)`
  - `where("date", "<=", endStr)`

Donc seuls les jours dont la **date** (string YYYY-MM-DD) est dans le mois courant (ou la période choisie) sont pris en compte.

### 4.2 Impact sur les données de test

- Si les **réservations de test** ont un champ `date` (ou des dailyStats) avec des dates **en dehors du mois courant** (ex. mois dernier, année dernière), elles sont **exclues** par ce filtre.
- Même en incluant les réservations dans le calcul (voir section 6), il faudrait utiliser le **même** champ de date (date du trajet) et la **même** plage (startStr / endStr) pour rester cohérent.

### 4.3 Incohérence potentielle avec d’autres vues

- **useCompanyDashboardData** (dashboard compagnie) filtre les réservations sur **createdAt** (Timestamp), pas sur **date** (trajet). Le Poste de Pilotage, lui, filtre dailyStats sur **date**. Ce n’est pas la cause directe des 0 sur le Poste de Pilotage (car le Poste ne lit pas les réservations pour le CA), mais à noter pour une future unification.

---

## 5. Champs utilisés pour le revenu

| Contexte | Collection / source | Champ utilisé pour le “revenu” |
|----------|---------------------|---------------------------------|
| **Indicateurs V2 (CA)** | dailyStats (collectionGroup) | **totalRevenue** |
| **Réservations** | `companies/.../agences/.../reservations` | **montant** |
| **Trip revenues (même page CEO)** | reservations (par agence) | **montant** (agrégé par trajet) |

- Les **noms de champs** sont cohérents dans chaque source (totalRevenue dans dailyStats, montant dans reservations).
- Le problème n’est **pas** un mauvais nom de champ côté lecture, mais le fait que le **CA V2 ne lit que totalRevenue (dailyStats)** et que **totalRevenue n’est jamais rempli à partir des réservations** (uniquement à la validation de session).

---

## 6. Synthèse : ce qui est “incorrect” ou inadapté

| Élément | Statut | Détail |
|--------|--------|--------|
| **Chemin des réservations** | Correct dans le projet | `companies/{companyId}/agences/{agencyId}/reservations`. Pas de collection au niveau compagnie. |
| **Chemin dailyStats** | Correct pour la requête actuelle | `companies/{companyId}/agences/{agencyId}/dailyStats/{date}` ; la requête collectionGroup + companyId + date est correcte. |
| **Source du CA V2** | Inadaptée aux données “réservations seules” | Le CA est lu depuis **dailyStats.totalRevenue** alors que les données réelles (test ou autre) peuvent n’exister que dans **reservations** (champ **montant**). Aucune agrégation reservations → CA n’est utilisée. |
| **Filtre de période** | Correct mais peut exclure les tests | Filtre sur **date** (YYYY-MM-DD) entre startStr et endStr (mois courant par défaut). Les données de test avec des dates hors période donnent 0. |
| **Champ revenu** | Cohérent par source | totalRevenue (dailyStats) vs montant (reservations) : pas d’erreur de nom, mais **mauvaise source** pour afficher un CA basé sur les réservations. |

---

## 7. Correction exacte à apporter (sans rien modifier pour l’instant)

Pour que les indicateurs V2 affichent un CA cohérent avec les **réservations** existantes (y compris données de test) :

1. **Option A – En lecture (recommandé pour ne pas toucher à la structure Firestore)**  
   - Dans **CEOCommandCenterPage** (ou un hook dédié), en plus de la requête **dailyStats** :
     - Pour chaque agence (ou via une requête collectionGroup si index et schéma le permettent), interroger **reservations** sur la **même période** :  
       `companies/{companyId}/agences/{agencyId}/reservations`  
       avec `where("date", ">=", startStr)` et `where("date", "<=", endStr)`.
     - Filtrer côté client les réservations “payées” (ex. `statut === 'payé'` ou équivalent selon le schéma).
     - Calculer **CA à partir des réservations** = somme des `montant` de ces réservations.
     - Utiliser pour les blocs A et C :
       - soit **ce CA réservations** à la place de globalRevenue quand dailyStats est vide / totalRevenue nul,
       - soit une **combinaison** (ex. max(CA dailyStats, CA réservations) ou CA réservations si totalRevenue === 0).
   - Conserver le filtre de période actuel (startStr / endStr) et le champ **date** (date du trajet) pour rester aligné avec dailyStats.

2. **Option B – Backfill dailyStats**  
   - Écrire un script (ou Cloud Function) qui, pour les jours concernés et chaque agence, lit les réservations (même chemin, même filtre `date`), calcule la somme des `montant` (payés) et met à jour (ou crée) le document **dailyStats** correspondant avec **totalRevenue**.  
   - Les indicateurs V2 n’ont alors pas besoin de changer ; ils continuent de lire uniquement dailyStats.

3. **Vérifications à faire avant de coder**  
   - Confirmer le **nom exact du champ de statut** “payé” dans les réservations (ex. `statut`, valeur `'payé'` ou `'paid'`).  
   - Vérifier qu’un **index** Firestore existe pour une requête sur `reservations` avec `date` (ou companyId + date si collectionGroup), si vous passez par une requête collectionGroup réservations.

---

## 8. Confirmation des chemins et index

- **dailyStats** : l’index `collectionGroup("dailyStats")` avec `companyId` + `date` est présent dans `firestore.indexes.json` → requête actuelle valide.
- **Réservations** : le projet utilise `companies/{companyId}/agences/{agencyId}/reservations` avec filtre `date` (string) dans CEOCommandCenterPage pour **tripRevenues**. Une requête par agence avec `where("date", ">=", startStr)` et `where("date", "<=", endStr)` est donc déjà utilisée et cohérente avec le schéma.

Ce document ne modifie aucun code ; il décrit uniquement l’écart entre les indicateurs V2 et les données réservations, et la correction à apporter.
