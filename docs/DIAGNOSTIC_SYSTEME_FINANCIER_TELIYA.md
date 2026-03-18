# Diagnostic complet du système financier TELIYA

**Objectif** : Comprendre exactement pourquoi les données affichées sont incohérentes entre Ventes temps réel, Encaissements et Revenus validés, **sans modifier le code**.

**Exemple observé** :
- Ventes temps réel : 47 500 FCFA (cohérent)
- Encaissements : 97 500 FCFA (incohérent)
- Revenus validés : 22 500 FCFA (incompréhensible)

Certaines réservations ont été supprimées mais semblent toujours présentes dans certaines sources.

---

## 1. Cartographie des sources

### 1.1 Réservations

| Élément | Détail |
|--------|--------|
| **Emplacement** | `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}` (sous-collection par agence). Requêtes via `collectionGroup("reservations")` avec `companyId`. |
| **Structure** | Champs clés : `companyId`, `agencyId`, `createdAt` (Timestamp), `statut` (ex. `confirme`, `paye`, `annule`), `montant`, `cashTransactionId` (optionnel, lien vers la transaction caisse), `date` (date du trajet YYYY-MM-DD), `ticketRevenueCountedInDailyStats` (bool, pour idempotence en ligne). |
| **Lien** | Une réservation peut référencer une `cashTransactionId`. Pas de clé étrangère inverse sur la cashTransaction (seul `reservationId` côté caisse). |

**Utilisation** :
- **Ventes temps réel (live)** : `unifiedFinanceService` filtre par `companyId`, `createdAt` dans la plage (Bamako), et ne garde que les réservations « vendues » via `isSoldReservation(statut)` → `statut === "confirme"` ou `"paye"`. Somme des `montant` de ces réservations.
- **networkStatsService** : même collection pour compter les billets vendus (`totalTickets`, `reservationsToday`) mais le **CA** dans ce service vient des **cashTransactions** (voir ci‑dessous), pas des réservations.

### 1.2 Paiements (cashTransactions)

| Élément | Détail |
|--------|--------|
| **Emplacement** | `companies/{companyId}/cashTransactions/{transactionId}` (collection au niveau compagnie, toutes agences). |
| **Structure** | `reservationId`, `amount`, `currency`, `date` (string YYYY-MM-DD), `status` (`paid` \| `refunded`), `locationType` (agence \| escale), `locationId` (agencyId), `createdBy`, `createdAt` (Timestamp). Pas de champ `agencyId` explicite ; l’agence est déduite via `locationId`. |
| **Lien** | `reservationId` pointe vers la réservation. La réservation stocke `cashTransactionId` après création de la transaction. |

**Création** :
- **Guichet** : `guichetReservationService.ts` appelle `createCashTransaction` après création de la réservation, avec **`date: params.date ?? new Date().toISOString().split('T')[0]`** → `params.date` = **date du trajet** (pas la date de vente).
- **En ligne** : `ReservationsEnLignePage.tsx` appelle `createCashTransaction` à la confirmation, avec **`date: (data?.date ?? new Date().toISOString().slice(0, 10)).toString().slice(0, 10)`** → again **date du trajet** (ou date du jour si absent).

**Remboursement** :
- `markCashTransactionRefunded(companyId, transactionId)` : met `status` à `refunded`. Appelé dans `reservations.ts` (annulation) si `cashTransactionIdToRefund` est renseigné, et dans `AgenceGuichetPage.tsx` (remboursement manuel).

**Utilisation** :
- **Encaissements (cash)** : `getCashTransactionsByDateRange(companyId, dateFrom, dateTo)` filtre sur le champ **`date`** (string), puis somme des `amount` pour `status === "paid"`. Donc les encaissements sont agrégés par **date du champ `date`** (pour guichet et en ligne = date du trajet), pas par date de vente.

### 1.3 dailyStats

| Élément | Détail |
|--------|--------|
| **Emplacement** | `companies/{companyId}/agences/{agencyId}/dailyStats/{date}` avec `date` au format YYYY-MM-DD (ID du document). |
| **Structure** | `companyId`, `agencyId`, `date`, `ticketRevenue`, `courierRevenue`, `ticketRevenueAgency`, `ticketRevenueCompany`, `courierRevenueAgency`, `courierRevenueCompany`, `totalRevenue`, `validatedSessions`, `totalPassengers`, `totalSeats`, etc. Mises à jour **uniquement par incréments** (increment()), jamais recalcul global. |
| **Date** | La date du document est : (1) pour validation de session guichet : **`toDailyStatsDate(closedAt)`** (date de clôture du poste, en **heure locale serveur** via `Timestamp.toDate()` puis `getFullYear/getMonth/getDate`) ; (2) pour en ligne : **`formatDateForDailyStats(data?.date ?? data?.createdAt)`** (date du trajet ou date de création). |

**Mises à jour** (toutes incrémentales) :
- Création réservation : `updateDailyStatsOnReservationCreated` (passagers, sièges uniquement).
- Session fermée : `updateDailyStatsOnSessionClosed` (closedSessions).
- Session validée agence : `updateDailyStatsOnSessionValidatedByAgency` → `ticketRevenueAgency`.
- Session validée chef comptable : `updateDailyStatsOnSessionValidatedByCompany` → `ticketRevenueCompany`, `ticketRevenue`, `totalRevenue`, `validatedSessions`.
- Réservation en ligne passée à confirme/paye : `addTicketRevenueToDailyStats` (une fois par réservation, via `ticketRevenueCountedInDailyStats`).
- Session courrier validée : `updateDailyStatsOnCourierSessionValidated` → `courierRevenue`, `totalRevenue`.
- Boarding fermé : `updateDailyStatsOnBoardingClosed`.

**Utilisation** :
- **Revenus validés** : dans `unifiedFinanceService`, somme sur les dailyStats de la période (`date` entre `dateFrom` et `dateTo`) de `ticketRevenue + courierRevenue` (ou `totalRevenue` en fallback). Aucun recalcul à partir des réservations ou des cashTransactions.

---

## 2. Flux de données

### 2.1 Création d’une réservation

| Canal | Collections modifiées | Données persistées |
|-------|------------------------|--------------------|
| **Guichet** | `reservations` (création), `cashTransactions` (création avec **date = date du trajet**), `dailyStats` (totalPassengers, totalSeats pour une date dérivée du contexte). Réservation reçoit `cashTransactionId`. | Réservation avec statut vendu ; une cashTransaction `paid` avec `date` = date du trajet. |
| **En ligne** | Réservation créée d’abord (ex. en_attente), puis à confirmation : mise à jour réservation (statut confirme/paye), `cashTransactions` (création, **date = date du trajet**), `dailyStats` via `addTicketRevenueToDailyStats` (si canal ≠ guichet). | Même schéma : réservation vendue, une cashTransaction `paid`, dailyStats incrémentés pour la date utilisée (trajet/création). |

### 2.2 Paiement

- Déjà couvert ci‑dessus : la création de la réservation (guichet) ou la confirmation (en ligne) crée la cashTransaction en `paid`. Pas de collection « paiements » séparée ; la caisse = cashTransactions.

### 2.3 Validation

- **Guichet** : les revenus n’entrent dans les dailyStats (ticketRevenue, totalRevenue) qu’à la **validation de la session** (comptable agence puis chef comptable). Jusque‑là, les ventes sont dans live et dans cash, mais **pas** dans validated.
- **En ligne** : à la transition vers confirme/paye, `addTicketRevenueToDailyStats` est appelé une fois ; les revenus validés sont donc reflétés sans attendre une session.

### 2.4 Annulation / suppression

| Action | Ce qui est modifié | Ce qui reste |
|--------|--------------------|--------------|
| **Annulation (cancelReservation)** | Réservation : `statut` → `annule`, libération des places, `createCashRefund` + **`markCashTransactionRefunded`** si `cashTransactionId` présent. | Réservation toujours en base (statut annulé). CashTransaction en `refunded` → exclue des encaissements. |
| **Suppression physique** (ex. suppression du document réservation, hors flux métier) | Aucun appel à `markCashTransactionRefunded` dans le code actuel. | Réservation disparaît des requêtes (donc plus dans « ventes temps réel »). La cashTransaction reste **paid** → toujours comptée dans « encaissements ». |
| **Remboursement manuel (AgenceGuichetPage)** | `markCashTransactionRefunded` appelé. | CashTransaction en `refunded`. La réservation peut rester en statut vendu si la logique métier ne la met pas à jour. |

Résultat : en cas de **suppression** (ou suppression de fait) de réservations **sans** passer par `cancelReservation` ou remboursement explicite, les encaissements continuent de compter ces montants → **Encaissements > Ventes temps réel**.

---

## 3. Analyse des incohérences

### 3.1 Réservation supprimée mais paiement conservé

- **Cause** : Aucune suppression physique de réservation n’appelle `markCashTransactionRefunded` dans le code analysé. Seules l’annulation (`cancelReservation`) et le remboursement manuel le font.
- **Exemple** : Si une réservation est supprimée (console Firestore, script, ou flux non couvert), la cashTransaction associée reste `paid`. Elle est exclue du « live » (réservation absente ou annulée) mais incluse dans « cash ».
- **Code** : `reservations.ts` — `cancelReservation` lit `cashTransactionIdToRefund = data.cashTransactionId` et appelle `markCashTransactionRefunded` ; il n’existe pas de chemin unique « suppression réservation → remboursement caisse ».

### 3.2 Paiement sans reservationId ou sans réservation correspondante

- Les cashTransactions sont **toujours** créées avec un `reservationId` (guichet et en ligne). Il n’y a pas de création « orpheline » dans le code. En revanche, après suppression de réservation, des cashTransactions peuvent exister avec un `reservationId` pointant vers un document inexistant → **paiement sans réservation visible** côté produit.

### 3.3 dailyStats non recalculés

- Les dailyStats sont **uniquement incrémentaux**. Il n’y a pas de recalcul à partir des réservations ou des cashTransactions. Conséquences :
  - Si une session n’est jamais validée (guichet), les ventes du jour n’entrent jamais dans les revenus validés pour cette date.
  - Toute erreur d’incrément (doublon, mauvaise date, annulation non déduite) reste figée.
- **Exemple** : Une réservation guichet vendue aujourd’hui n’apparaît dans « revenus validés » qu’après validation du poste par le chef comptable ; si la validation n’a pas lieu ou est faite avec une autre date (closedAt), les chiffres « validés » restent en dessous du live/cash.

### 3.4 Double comptage possible

- **Live** : une réservation vendue compte une fois (montant).
- **Cash** : une cashTransaction par réservation confirmée ; pas de double création dans le code.
- **Validated** : pour le guichet, le montant n’est ajouté qu’à la validation de la session (totalRevenue du poste), pas par réservation ; pour l’en ligne, `addTicketRevenueToDailyStats` est protégé par `ticketRevenueCountedInDailyStats` → une seule fois par réservation. Risque de double comptage limité si les règles sont respectées ; en revanche, **sous‑comptage** des validés par rapport au live/cash est structurel (validation asynchrone, sessions non validées).

### 3.5 Sémantique de date différente entre les trois indicateurs

- **Ventes temps réel** : filtrées par **`createdAt`** (date/heure de création de la réservation) dans la plage en **Africa/Bamako** (`getStartOfDayInBamako` / `getEndOfDayInBamako`). → **Date de vente**.
- **Encaissements** : filtrés par le champ **`date`** des cashTransactions, qui est en pratique la **date du trajet** (guichet : `params.date`, en ligne : `data?.date`). → **Date de trajet**, pas date de vente.
- **Revenus validés** : agrégation des dailyStats dont l’ID (ou le champ `date`) est entre `dateFrom` et `dateTo`. Pour le guichet, cette date vient de **`toDailyStatsDate(closedAt)`** → **date de clôture du poste** (en heure locale serveur), pas nécessairement date de vente ni date de trajet.

Donc pour une **même période affichée** (ex. « Aujourd’hui ») :
- **Live** = ventes **créées** aujourd’hui (Bamako).
- **Cash** = encaissements dont le **trajet** est aujourd’hui (ou date par défaut).
- **Validated** = revenus **validés** dont la **session** est rattachée à la date du jour (closedAt en local).

Exemple concret : vente faite hier pour un trajet aujourd’hui → dans **cash** « aujourd’hui », pas dans **live** « aujourd’hui ». Inversement, vente faite aujourd’hui pour un trajet demain → dans **live** « aujourd’hui », pas dans **cash** « aujourd’hui ». D’où écarts possibles **47 500 vs 97 500** selon le mix de dates de vente et de trajet.

---

## 4. Source de vérité

| Indicateur | Source technique actuelle | Problème |
|------------|---------------------------|----------|
| **Ventes temps réel** | Collection `reservations` (collectionGroup), filtre `createdAt` + `isSoldReservation(statut)`, somme des `montant`. | Cohérent si aucune suppression hors flux ; incohérent si réservations supprimées ou statuts non alignés. |
| **Encaissements** | Collection `cashTransactions`, filtre `date` (string) + `status === "paid"`, somme des `amount`. | **Sémantique de date différente** (date de trajet, pas date de vente). Pas de mise à jour automatique si réservation supprimée. |
| **Revenus validés** | Collection `dailyStats` (collectionGroup), somme `ticketRevenue + courierRevenue` (ou `totalRevenue`) par document dans la plage. | Données **dérivées** et **incrémentales** ; pas de recalcul ; dépendent du processus de validation (sessions guichet) et du fuseau/date de closedAt. |

**Plusieurs sources en parallèle** : oui. Les trois indicateurs ne dérivent pas d’une seule table « vérité ». Live = réservations ; Cash = caisse ; Validated = agrégats dailyStats. Les règles de synchronisation (annulation → remboursement, date de la transaction = date de vente, validation → dailyStats) sont partielles ou sémantiquement différentes, ce qui explique les incohérences.

---

## 5. Problèmes structurels

1. **Incohérence de sémantique de date**  
   - Live = date de **vente** (createdAt).  
   - Cash = date de **trajet** (champ `date`).  
   - Validated = date de **clôture/validation** (closedAt en local).  
   Comparer les trois pour « la même journée » fausse les comparaisons.

2. **Pas de synchronisation suppression → caisse**  
   Toute suppression (ou perte) de réservation qui ne passe pas par `cancelReservation` laisse la cashTransaction en `paid`, donc encaissements > ventes affichées.

3. **Dépendance à des données dérivées non recalculables**  
   Les dailyStats sont la seule source des « revenus validés » et sont uniquement incrémentales. Aucun recalcul depuis les réservations ou la caisse n’est prévu → erreurs ou retards non corrigeables.

4. **Fuseau et date des dailyStats**  
   `toDailyStatsDate(t)` utilise `t.toDate()` puis `getFullYear/getMonth/getDate` → **heure locale du serveur**, pas Africa/Bamako. Décalage possible avec les plages « jour » affichées en Bamako pour live/cash.

5. **networkStatsService : CA vs billets**  
   Dans `networkStatsService`, le CA (`totalRevenue`) vient des **cashTransactions** (paid), alors que le nombre de billets vient des **reservations** (createdAt + isSoldReservation). Mélange de deux sources pour une même vue « réseau », cohérent avec les écarts possibles entre live et cash.

---

## 6. Impact produit

- **Chiffres affichés potentiellement faux** : les utilisateurs voient trois montants (ventes temps réel, encaissements, revenus validés) qui ne portent pas sur la même définition de « jour » ni sur le même périmètre (vente vs trajet vs validation). Les écarts (ex. 47 500 / 97 500 / 22 500) deviennent incompréhensibles sans cette analyse.
- **Décisions faussées** :  
  - Pilotage du CA sur « encaissements » peut surestimer ou sous‑estimer la journée selon le décalage vente/trajet.  
  - Comparaison « validé » vs « encaissé » ne reflète pas uniquement le retard de validation : elle mélange aussi des dates différentes.  
  - Toute analyse de cohérence caisse / ventes / validé est biaisée tant que les trois indicateurs n’ont pas une définition de date et de périmètre unifiée.

---

## 7. Plan de correction (sans coder)

### 7.1 Modèle cible cohérent

- **Une seule sémantique de date** pour les tableaux de bord « par jour » : soit **date de vente** (création/confirmation), soit **date de trajet**, mais identique pour les trois indicateurs. Recommandation : **date de vente** pour cohérence avec la trésorerie réelle (argent entré le jour J).
- **Cash** : le champ `date` des cashTransactions devrait refléter la **date de l’encaissement** (date de création de la réservation confirmée / du paiement), pas la date du trajet. Conserver éventuellement une date de trajet en champ séparé pour d’autres rapports.
- **dailyStats** : soit (A) définir clairement la date comme « date de clôture du poste » et l’afficher comme telle, soit (B) alimenter aussi des dailyStats par **date de vente** pour les comparaisons avec live/cash. Éviter de mélanger sans le dire.

### 7.2 Règles de synchronisation

- **Annulation / suppression** : tout flux qui supprime ou invalide définitivement une réservation ayant une `cashTransactionId` doit appeler `markCashTransactionRefunded` (ou équivalent) pour garder encaissements alignés avec les ventes.
- **Création cashTransaction** : à la création, fixer `date` = date du jour de l’encaissement (création ou confirmation), en timezone Bamako si possible ; ne pas utiliser la date du trajet pour les indicateurs « encaissements du jour ».
- **Revenus validés** : documenter clairement que la date des dailyStats = date de clôture/validation ; ou introduire un recalcul (batch) des revenus validés par date de vente à partir des réservations/sessions pour les comparaisons.

### 7.3 Corrections conceptuelles à apporter

1. **Aligner la date des cashTransactions** sur la date d’encaissement (création/confirmation), pas sur la date du trajet, pour les requêtes `getCashTransactionsByDateRange` utilisées dans les dashboards.
2. **Garantir** que toute suppression ou annulation de réservation qui a donné lieu à un encaissement met à jour la cashTransaction (refunded) et, si besoin, les dailyStats (déduction ou recalcul selon le modèle retenu).
3. **Clarifier ou corriger le fuseau** pour les dailyStats (closedAt → date en Africa/Bamako) pour que « aujourd’hui » soit cohérent avec live/cash.
4. **Documentation produit** : indiquer explicitement dans l’UI ce que représente chaque indicateur (date de vente / date de trajet / date de validation) pour éviter les interprétations erronées.
5. **Optionnel** : prévoir un recalcul périodique ou une vue « revenus validés » dérivée des réservations/sessions validées par date de vente, pour comparer à même périmètre que live et cash.

---

**Conclusion** : Les incohérences (47 500 / 97 500 / 22 500) s’expliquent par (1) des **définitions de date différentes** (vente vs trajet vs clôture), (2) des **réservations supprimées ou absentes** dont les encaissements restent comptés, et (3) des **revenus validés** purement incrémentaux et dépendants du processus de validation des sessions. Un modèle cible avec une date unique et des règles de synchronisation explicites (annulation/suppression → caisse, date d’encaissement pour cash) est nécessaire avant toute correction technique.
