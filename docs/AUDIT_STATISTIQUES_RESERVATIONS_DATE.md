# Audit — Statistiques "aujourd'hui" et bug date (fuseau horaire)

## Problème observé

À minuit (nouvelle journée), les dashboards affichaient encore les réservations de la veille comme "réservations aujourd'hui" (ex. 16/03 à 00:05 : dashboard 7 billets, page réservations 0).

**Cause :** "Aujourd'hui" était calculé en **UTC** (`new Date().toISOString().slice(0, 10)`) ou en heure locale du navigateur, au lieu du fuseau **Africa/Bamako**.

---

## 1. Fonctions qui calculent les statistiques "aujourd'hui"

| Fichier | Indicateur | Ancienne logique | Nouvelle logique |
|---------|------------|------------------|------------------|
| **networkStatsService** | `reservationsToday` | `new Date().toISOString().slice(0, 10)` (UTC) | `getTodayBamako()` |
| **networkStatsService** | CA / billets période | `dateFrom` / `dateTo` passés par la page | Pour période "jour", les pages passent `getTodayBamako()` |
| **tripInstanceService** | `getBusesInProgressCountToday` | `new Date().toISOString().slice(0, 10)` | `getTodayBamako()` |
| **tripProgressService** | `getDelayedBusesCountToday` | `getFullYear/getMonth/getDate` (local navigateur) | `getTodayBamako()` |
| **CEOCommandCenterPage** | Période "Aujourd'hui" | `getDateRangeForPeriod("day", new Date())` → format local | Pour `period === "day"` : `startStr` / `endStr` = `getTodayBamako()` |
| **ReservationsReseauPage** | Filtre "jour" | `getDateKey(dateFrom)` (local) | Pour `range === "day"` : `getTodayBamako()` pour `startStr` / `endStr` |
| **OperationsFlotteLandingPage** | Réservations aujourd'hui (todayBookings) | `getDateKey(new Date())` + créneaux locaux | `getStartOfDayBamako()` / `getEndOfDayBamako()` pour les timestamps |
| **CashSummaryCard** | Caisse aujourd'hui (date par défaut) | `new Date().toISOString().split("T")[0]` | `getTodayBamako()` |
| **CompanyCashPage** | Date par défaut (caisse) | `new Date().toISOString().split("T")[0]` | `getTodayBamako()` |
| **ReservationsEnLignePage** | Filtre période "Aujourd'hui" | `new Date()` setHours(0/23) (local) | `getStartOfDayBamako()` / `getEndOfDayBamako()` |

---

## 2. Logique de date et fuseau

- **Avant :** `new Date().toISOString().slice(0, 10)` → date du jour en **UTC**.
- **Après :** `getTodayBamako()` → date du jour en **Africa/Bamako** (via `dayjs().tz("Africa/Bamako").format("YYYY-MM-DD")`).

Fichier utilitaire : **`src/shared/date/dateUtilsTz.ts`**  
- `getTodayBamako()` : `YYYY-MM-DD` du jour en Bamako  
- `getStartOfDayBamako()` / `getEndOfDayBamako()` : pour comparaisons si besoin  

---

## 3. Champs Firestore utilisés

- **Réservations "aujourd'hui" :** filtre sur le champ **`date`** (YYYY-MM-DD, en général date de trajet ou date de la réservation selon le contexte).
- **Cohérence :** le même jour logique "aujourd'hui" est utilisé partout via `getTodayBamako()`, donc aligné avec la page réservations si celle-ci utilise aussi la date Bamako pour "aujourd'hui".

---

## 4. Logs de debug

Dans **networkStatsService** :

- `console.log("networkStats [date tz]", { today, startOfDay, endOfDay })`
- `console.log("networkStats [reservations today]", { today, reservationsLoaded, reservationsToday })`
- `console.log("networkStats", stats)` (existant)

---

## 5. Vérification après correction

- À minuit (Bamako), "aujourd'hui" doit basculer sur le nouveau jour.
- Si aucune réservation n’est faite le jour J, tous les dashboards doivent afficher **0 réservation aujourd’hui** pour ce jour.
