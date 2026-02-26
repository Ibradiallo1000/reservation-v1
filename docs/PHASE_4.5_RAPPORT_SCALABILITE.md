# Phase 4.5 — Scalability Hardening — Rapport détaillé (Teliya)

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/modules/agence/aggregates/types.ts` | Types TypeScript pour `DailyStatsDoc`, `BoardingStatsDoc`, `AgencyLiveStateDoc` et helper `boardingStatsKey()`. |
| `src/modules/agence/aggregates/dailyStats.ts` | Mises à jour transactionnelles de `dailyStats` : réservation créée, session clôturée, session validée, boarding clôturé. Utilise `increment()` et `set(..., { merge: true })`. |
| `src/modules/agence/aggregates/agencyLiveState.ts` | Mises à jour de `agencyLiveState/current` par incréments : session ouverte/fermée/validée, boarding ouvert/fermé, véhicules en transit. |
| `src/modules/agence/aggregates/boardingStats.ts` | Création et mise à jour de `boardingStats/{tripKey}` : création si absent, incrément `embarkedSeats`, passage en `closed` avec `absentSeats`. |
| `src/modules/agence/aggregates/index.ts` | Réexport des modules agrégats. |
| `docs/PHASE_4.5_FIRESTORE_INDEXES.md` | Documentation des index composites recommandés (reservations, fleetVehicles, shifts). |
| `docs/PHASE_4.5_RAPPORT_SCALABILITE.md` | Ce rapport. |

---

## 2. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/modules/agence/services/sessionService.ts` | Dans la transaction de clôture de session : appel à `updateDailyStatsOnSessionClosed` et `updateAgencyLiveStateOnSessionClosed`. Dans la validation comptable : `updateDailyStatsOnSessionValidated` et `updateAgencyLiveStateOnSessionValidated`. Dans `activateSession` : `updateAgencyLiveStateOnSessionOpened`. |
| `src/modules/agence/services/shiftApi.ts` | Dans `validateReportClient` : après mise à jour shift/report, appel à `updateDailyStatsOnSessionValidated` et `updateAgencyLiveStateOnSessionValidated` (avec date et montant du shift). |
| `src/modules/agence/services/guichetReservationService.ts` | Dans la transaction de création de réservation guichet : `updateDailyStatsOnReservationCreated` (totalPassengers +1, totalSeats += places). |
| `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` | Embarquement : création éventuelle de `boardingStats`, vérification capacité dans la transaction, `incrementBoardingStatsEmbarked`, `updateAgencyLiveStateOnBoardingOpened`. Clôture : `updateDailyStatsOnBoardingClosed`, `setBoardingStatsClosed`, `updateAgencyLiveStateOnBoardingClosed`, `updateAgencyLiveStateOnVehicleInTransit` pour les véhicules passés en transit. |
| `src/modules/agence/pages/ManagerDashboardPage.tsx` | Écoute de `dailyStats/{today}` et `agencyLiveState/current`. KPIs (revenu, passagers) et compteurs de sessions/flotte basés sur ces documents en priorité, avec repli sur les données détaillées. Requêtes shifts et fleet limitées/filtrées (status, limit). |
| `firestore.rules` | Règles pour `dailyStats`, `boardingStats`, `agencyLiveState/current` : lecture et écriture pour utilisateurs authentifiés. |

---

## 3. Réduction des listeners et déplacement de l’agrégation

- **Avant** : Le Manager Dashboard écoutait toute la collection `shifts`, toute la collection `fleetVehicles`, et une requête sur `reservations` (date + statut). Les totaux du jour (revenu, passagers) et les compteurs (sessions actives, clôturées, validées, véhicules en transit) étaient calculés côté client à partir de ces données.
- **Après** :
  - **Un document** `dailyStats/{YYYY-MM-DD}` par agence et par jour : le dashboard lit ce document pour le revenu total, les passagers, les sièges, les sessions validées, les sessions clôturées, les boardings clôturés.
  - **Un document** `agencyLiveState/current` par agence : le dashboard lit ce document pour les compteurs en temps réel (sessions actives, en attente de validation, véhicules en transit, boardings ouverts).
  - Les listeners sur `shifts` et `fleetVehicles` sont conservés pour le détail (tableau des guichetiers, détail flotte) mais avec des requêtes **filtrées** (`status in [...]`, `limit(100)` / `limit(200)`), ce qui réduit le volume de documents lus.
- **Agrégation** : Les incréments et mises à jour des agrégats sont faits **dans les mêmes transactions** que les opérations métier (création réservation, clôture/validation de session, embarquement, clôture boarding, transition véhicule). La charge d’agrégation est donc déplacée vers Firestore (écritures atomiques) et le client ne refait plus ces calculs lourds.

---

## 4. Schémas des nouvelles collections

### dailyStats

- **Chemin** : `companies/{companyId}/agences/{agencyId}/dailyStats/{YYYY-MM-DD}`
- **Champs** : `date`, `totalRevenue`, `totalPassengers`, `totalSeats`, `validatedSessions`, `activeSessions`, `closedSessions`, `boardingClosedCount`, `createdAt`, `updatedAt`.

### boardingStats

- **Chemin** : `companies/{companyId}/agences/{agencyId}/boardingStats/{tripKey}` (tripKey = `departure_arrival_heure_date` normalisé).
- **Champs** : `tripId`, `date`, `heure`, `vehicleCapacity`, `embarkedSeats`, `absentSeats`, `status` ("open" | "closed"), `updatedAt`.

### agencyLiveState

- **Chemin** : `companies/{companyId}/agences/{agencyId}/agencyLiveState/current`
- **Champs** : `activeSessionsCount`, `closedPendingValidationCount`, `vehiclesInTransitCount`, `boardingOpenCount`, `lastUpdatedAt`.

---

## 5. Implications sécurité

- Les trois collections sont sous `companies/{companyId}/agences/{agencyId}/...`. Les règles Firestore restreignent l’accès aux utilisateurs authentifiés (`isAuth()`). Toute personne pouvant accéder aux shifts/rapports/boarding de l’agence peut lire/écrire ces agrégats (les écritures sont faites par le même client lors des transactions).
- Les écritures ne sont pas restreintes par rôle dans les règles actuelles (create/update si `isAuth()`). On pourrait affiner plus tard (ex. limiter l’écriture aux rôles guichetier/comptable/boarding/manager) si besoin.
- Aucune donnée sensible supplémentaire n’est exposée : les agrégats ne contiennent que des compteurs et montants déjà dérivés des données existantes.

---

## 6. Logique multi-agences et synchronisation

- Chaque agence a ses propres sous-collections `dailyStats`, `boardingStats`, `agencyLiveState`. Il n’y a pas de document global « toutes agences ».
- Les mises à jour sont **locales** à l’agence concernée (companyId/agencyId du contexte : session, réservation, boarding, flotte). Pour les véhicules en transit, seul le compteur de l’agence qui clôture le boarding est incrémenté (`vehiclesInTransitCount`). Une évolution ultérieure pourrait décrementer ce compteur lorsqu’un véhicule arrive à une autre agence (non implémenté en 4.5).
- Pas de synchronisation inter-agences pour les agrégats : chaque agence reste cohérente pour elle-même.

---

## 7. Goulots d’étranglement et risques de contention

- **dailyStats** : Un document par jour et par agence. En pic (beaucoup de réservations ou de clôtures le même jour), plusieurs transactions écrivent le même document avec `increment()`. Firestore gère bien les incréments atomiques ; la contention reste limitée au document du jour pour cette agence.
- **agencyLiveState/current** : Un seul document par agence, mis à jour à chaque ouverture/fermeture de session, validation, boarding et transition véhicule. Sous forte charge (nombreuses sessions et boardings en parallèle), ce document peut devenir un point de contention. Les écritures sont des `increment()` ou `set` avec merge ; en cas de besoin, on pourra envisager un sharding (ex. sous-documents par type d’événement) ou un traitement différé (hors scope 4.5).
- **boardingStats** : Un document par trajet (tripKey) et par agence. La contention est répartie entre les trajets ; risque plus élevé sur un trajet très chargé (nombreux embarquements simultanés). Les mises à jour sont déjà dans des transactions avec contrôle de capacité.
- **Limite Firestore** : 1 write/s/document en écritures soutenues. En pratique, pour des agences de taille raisonnable (< 100 sessions/jour, boardings étalés), on reste en dessous ; au-delà, il faudra surveiller les erreurs de contention et éventuellement introduire des files ou Cloud Functions (hors périmètre 4.5).

---

## 8. Concurrence et double incrément

- **dailyStats** : Toutes les mises à jour utilisent `increment()` dans un `set(..., { merge: true })` unique par événement. Pas de read-modify-write manuel, donc pas de double incrément lié à une lecture obsolète. Chaque événement (une réservation, une clôture, une validation, une clôture boarding) n’est traité qu’une fois dans une transaction métier unique.
- **boardingStats** : Création et incrément d’`embarkedSeats` sont faits dans la même transaction d’embarquement ; la clôture met à jour le même document dans la transaction de clôture. Pas de double compte si les transactions sont correctement séquencées (verrou boarding).
- **agencyLiveState** : Mises à jour par `increment()` (positif ou négatif). Idempotence garantie par le fait que chaque appel correspond à un seul événement métier (une session ouverte, une clôture, etc.) exécuté une fois. En cas de double soumission côté client (ex. double clic), la transaction métier (shift/reservation/boarding) ne s’exécute qu’une fois, donc les agrégats ne sont mis à jour qu’une fois.

---

## 9. Impact performance et capacité de montée en charge estimée

- **Lecture** : Le Manager Dashboard lit 2 documents fixes (dailyStats du jour, agencyLiveState) au lieu de recalculer sur N réservations et M shifts. Réduction nette des lectures et du travail client.
- **Écriture** : Chaque opération métier ajoute 1 à 3 écritures (dailyStats, agencyLiveState, éventuellement boardingStats). Coût supplémentaire modéré par opération.
- **Capacité estimée après Phase 4.5** :  
  - Ordre de grandeur : **quelques dizaines d’agences** (ex. 50–100), avec **quelques centaines de réservations/jour** par agence et **quelques dizaines de sessions/boardings** par jour, restent dans les limites raisonnables de Firestore Spark.  
  - Au-delà (très nombreuses agences ou très fort trafic par agence), il faudra surveiller la contention sur `agencyLiveState/current` et `dailyStats/{date}`, et envisager une montée en Blaze, des index supplémentaires, voire des Cloud Functions pour déporter une partie des agrégations (voir section 10).

---

## 10. Piste d’évolution (non implémentée)

- **Cloud Functions** : Déplacer les mises à jour des agrégats dans des triggers (onCreate/onUpdate sur reservations, shifts, boardingClosures, fleetVehicles) permettrait de décharger le client et de regrouper les écritures côté serveur. Nécessiterait le plan Blaze et des précautions (idempotence, gestion des retries).
- **Sharding** : En cas de contention sur `agencyLiveState/current`, un shard par type (sessions, fleet, boarding) ou par plage horaire pourrait répartir les écritures.
- **Backfill** : Pour des données historiques, un script unique (Node ou Admin SDK) pourrait peupler les `dailyStats` des jours passés à partir des réservations et rapports existants ; non fourni dans cette phase.

---

## 11. Notes de migration

- **Nouveaux documents** : Les agrégats sont créés à la volée (merge ou première écriture). Aucune migration de données existantes n’est requise pour que l’app fonctionne.
- **Rétrocompatibilité** : Le Manager Dashboard utilise les agrégats en priorité et retombe sur les anciennes sources (shifts, reservations) si les documents dailyStats ou agencyLiveState sont absents. Les anciens comportements restent valides pendant la montée en charge des agrégats.
- **Index** : Créer les index décrits dans `docs/PHASE_4.5_FIRESTORE_INDEXES.md` si les requêtes filtrées (shifts, fleetVehicles) le demandent dans la console Firebase.

---

*Rapport Phase 4.5 — Scalability Hardening — Teliya Transport SaaS.*
