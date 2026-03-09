# Audit du système de revenus — Plateforme TELIYA

**Date :** 7 mars 2025  
**Périmètre :** Revenus billets, revenus courriers/colis, revenus globaux, comptabilité, flotte.

---

## Synthèse exécutive

| Point | Statut | Résumé |
|-------|--------|--------|
| 1. Revenus billets | **PARTIEL** | Calcul et stockage présents ; CA global basé sur dailyStats (sessions validées) et non sur agrégation réservations. |
| 2. Revenus courriers | **PARTIEL** | Données prix/sessions présentes ; non intégrés aux statistiques globales ni à dailyStats. |
| 3. Revenus globaux compagnie | **MANQUANT** | Tous les dashboards affichent **billets uniquement**. Courriers absents du CA. |
| 4. Intégration comptabilité | **PARTIEL** | Comptabilité valide sessions courrier ; les vues revenus (Finances, Revenus & Liquidités) = billets uniquement. |
| 5. Intégration flotte | **PARTIEL** | Coûts (tripCosts) utilisés pour marge ; pas de revenus « par bus » ni « par trajet » dédiés flotte. |

**Formule cible :** Revenus totaux = Revenus billets + Revenus courriers  
**État actuel :** Revenus affichés = Revenus billets uniquement (et pour le CEO/Revenus, uniquement via dailyStats = sessions guichet validées).

---

## PARTIE 1 — Réservations billets

### 1.1 Où sont stockées les réservations (Firestore)

- **Chemin :** `companies/{companyId}/agences/{agencyId}/reservations`
- Il n’existe **pas** de collection réservations au niveau compagnie ; tout est sous chaque agence.
- **Fichiers de référence :** `ReservationsEnLignePage.tsx`, `AgenceEmbarquementPage.tsx`, `sessionService.ts`, `guichetReservationService.ts`, `DIAGNOSTIC_V2_INDICATEURS_VS_DONNEES.md`.

### 1.2 Champs liés au revenu (réservations)

| Champ | Présent | Usage |
|-------|---------|--------|
| `montant` | Oui | Montant de la réservation (revenu billet). |
| `price` | Non | Non utilisé dans le schéma. |
| `amount` | Non | Utilisé dans shiftReports / session, pas dans la réservation. |
| `total` | Non | Non utilisé dans la réservation. |
| `revenue` | Non | Non utilisé ; le revenu est `montant`. |

**Type :** `src/types/reservation.ts` — interface `Reservation` avec `montant?: number`.

### 1.3 Comment les revenus billets sont calculés

- **Dans l’agrégat dailyStats :**
  - **À la création d’une réservation** (`updateDailyStatsOnReservationCreated` dans `dailyStats.ts`) : seuls `totalPassengers` et `totalSeats` sont incrémentés ; **aucun `totalRevenue`** n’est écrit.
  - **À la validation d’une session guichet** (`updateDailyStatsOnSessionValidated`) : le `totalRevenue` du shift (somme des `montant` des réservations du poste) est ajouté au document dailyStats du jour.
- **Source du CA affiché (CEO, Revenus compagnie) :** `collectionGroup("dailyStats")` → somme des champs `totalRevenue`. Donc le CA « officiel » ne provient **pas** d’une agrégation directe des réservations mais des **sessions validées** (guichet).
- **Dashboard agence :** lit directement la collection `reservations` (filtre `statut` payé), somme des `montant` → cohérent avec les réservations mais limité aux billets.
- **Page Finances (chef-comptable) :** lit les `reservations` avec `statut === 'confirme'`, somme des `montant` → billets uniquement.

**Fichiers clés :** `src/modules/agence/aggregates/dailyStats.ts`, `src/modules/agence/services/sessionService.ts` (closeSession, validateSessionByAccountant), `CEOCommandCenterPage.tsx`, `CompanyFinancesPage.tsx`, `DashboardAgencePage.tsx`, `Finances.tsx`.

### 1.4 Dashboards utilisant les revenus billets

| Dashboard | Source des revenus | Champs utilisés |
|-----------|--------------------|-----------------|
| **Dashboard agence** | `reservations` (agence) | `montant`, `statut` (payé) |
| **Dashboard compagnie** | `dailyStats` (CompanyFinancesPage) ou réservations (useCompanyDashboardData) | `totalRevenue` ou `montant` |
| **Dashboard CEO (Poste de pilotage)** | `dailyStats` (collectionGroup) | `totalRevenue` ; tripRevenues = réservations par trajet (`montant`, `date`) |
| **Dashboard comptable (Finances)** | `reservations` par agence | `montant`, `statut` confirme |

---

## PARTIE 2 — Courriers / colis

### 2.1 Collection Firestore

- **Shipments (envois) :** `companies/{companyId}/logistics/data/shipments`
- **Sessions courrier :** `companies/{companyId}/agences/{agencyId}/courierSessions`
- **Référence :** `src/modules/logistics/domain/firestorePaths.ts`, `shipment.types.ts`, `courierSessionPaths.ts`.

### 2.2 Création d’un courrier / envoi

- **Service :** `createShipment` (`src/modules/logistics/services/createShipment.ts`).
- Une session courrier doit être **ACTIVE** (activée par le comptable) pour créer un envoi ; `sessionId` et `agentCode` sont optionnels mais utilisés par le module courrier.
- Données enregistrées : `transportFee`, `insuranceAmount`, `paymentType`, `paymentStatus`, `createdAt`, etc.

### 2.3 Champs prix / montants (courriers)

| Champ | Présent | Usage |
|-------|---------|--------|
| `transportFee` | Oui | Frais de transport (revenu principal). |
| `insuranceAmount` | Oui | Montant assurance. |
| `price` | Non | Non utilisé ; équivalent = transportFee + insuranceAmount. |
| `amount` | Non | Utilisé dans ledger/session, pas sur le shipment. |
| `paymentStatus` | Oui | UNPAID / PAID_ORIGIN / PAID_DESTINATION. |
| `createdAt` | Oui | Date de création. |
| `destinationCollectedAmount` | Oui | Montant encaissé à destination (paiement destination). |

**Revenu par envoi (origine) :** `transportFee + insuranceAmount`.  
**Revenu destination :** `destinationCollectedAmount` (si paiement à destination).

### 2.4 Ledger et sessions

- **Ledger logistique :** `companies/{companyId}/logistics/data/ledger` — entrées par type (revenu, remboursement, etc.) ; **aucune écriture dans dailyStats**.
- **Sessions courrier :** `expectedAmount` (calculé à la clôture = somme transportFee + insuranceAmount des envois de la session), `validatedAmount` et `difference` à la validation comptable.

---

## PARTIE 3 — Revenus globaux

### 3.1 Formule actuelle dans les dashboards

Partout, le **revenu affiché** est :

- **Revenue = billets uniquement** (dailyStats ou réservations).
- **Aucun dashboard** ne calcule **Revenue = billets + courriers**.

### 3.2 Détail par écran

| Dashboard | Calcul actuel | Courriers inclus ? |
|-----------|----------------|--------------------|
| **CEO (Poste de pilotage)** | `globalRevenue` = somme des `dailyStats.totalRevenue` (période) | Non |
| **Revenus & Liquidités (compagnie)** | CompanyFinancesPage → dailyStats (totalRevenue) | Non |
| **Dashboard agence** | Somme des `montant` des réservations (payé) | Non |
| **Finances (chef-comptable)** | Somme des `montant` des réservations (statut confirme) par agence | Non |

Les revenus courrier existent uniquement dans le module Courrier (CourierReportsPage : revenus origine/destination par session), jamais agrégés au CA global ni aux indicateurs CEO/compagnie/agence/comptable.

---

## PARTIE 4 — Flux opérationnel courrier

### 4.1 Workflow implémenté

Le flux suivant **existe dans le code** :

1. **Chef d’agence** : peut créer / gérer le rôle « Agent de courrier » (ChefAgencePersonnelPage — option `agent_courrier`).
2. **Agent courrier** : crée une session → statut **PENDING** (`createCourierSession`).
3. **Comptable** : active la session → **ACTIVE** (`activateCourierSession`), visible sur AgenceComptabilitePage (onglet Courrier).
4. **Agent courrier** : enregistre les colis (`createShipment`), puis clôture la session → **CLOSED** (`closeCourierSession` ; calcul de `expectedAmount` à partir des envois).
5. **Comptable** : valide la session avec le montant compté → **VALIDATED** (`validateCourierSession`).

**Fichiers :** `courierSessionService.ts`, `AgenceComptabilitePage.tsx` (sessions courrier PENDING/ACTIVE/CLOSED/VALIDATED), `CourierSessionPage.tsx`, `CourierCreateShipmentPage.tsx`, `CourierReportsPage.tsx`.

### 4.2 Lien revenu agence / compagnie

- **Revenu agence courrier :** calculé côté UI dans CourierReportsPage (origine + destination par session).
- **Revenu compagnie :** il n’existe **aucune** écriture des revenus courrier dans `dailyStats` ni dans une agrégation globale. La validation de session courrier (`validateCourierSession`) met à jour uniquement le document de session (VALIDATED, validatedAmount, difference) ; **aucun appel à `updateDailyStatsOnSessionValidated`** ni équivalent pour le courrier.

Donc : **courrier enregistré → revenu visible dans le module Courrier uniquement ; pas de remontée automatique vers revenu agence/compagnie dans les indicateurs communs.**

---

## PARTIE 5 — Comptabilité

### 5.1 Ce qui est pris en compte

- **Revenus billets :** oui — via réservations (Finances chef-comptable), dailyStats (CompanyFinancesPage, CEO), et validation des postes guichet (shiftReports → totalRevenue → dailyStats).
- **Revenus courriers :** partiellement :
  - Le **comptable** peut activer les sessions courrier (PENDING → ACTIVE) et les valider (CLOSED → VALIDATED) avec montant compté.
  - Les **écrans de synthèse revenus** (Finances, Revenus & Liquidités, CEO) n’utilisent **pas** les montants courrier ; ils ne montrent que les revenus billets.

### 5.2 Synthèse

- Comptabilité **opérationnelle** courrier : OK (activation + validation des sessions).
- Comptabilité **reporting / vue revenus** : **uniquement billets** ; les courriers ne sont pas inclus dans le CA ni dans les rapports financiers consolidés.

---

## PARTIE 6 — Flotte (bus)

### 6.1 Liens avec les revenus

- **Revenus par trajet :** dans le CEO, les « trip revenues » sont calculés à partir des **reservations** (champ `montant`, agrégé par `trajetId` / date), **pas** à partir d’une collection flotte. Les bus ne portent pas de revenus directs.
- **Coûts (tripCosts) :** collection `companies/{companyId}/tripCosts` — carburant, chauffeur, convoyeur, péage, maintenance, etc. Utilisés dans le Poste de pilotage pour le **profit** (revenu dailyStats − dépenses − tripCosts − écarts).
- **Revenus par bus / par véhicule :** non calculés dans le code ; pas d’attribution revenu → véhicule. La flotte est liée aux **coûts** et à l’état opérationnel, pas à un enregistrement des revenus par bus.

### 6.2 Synthèse

- **Revenus par trajet :** dérivés des réservations (trajetId), pas de la flotte.
- **Dépenses flotte (tripCosts) :** prises en compte pour la marge (CEO).
- **Revenus par bus / par trajet flotte :** non implémentés.

---

## Résultat attendu (grille)

| # | Point | Statut | Commentaire |
|---|--------|--------|-------------|
| 1 | Revenus billets | **PARTIEL** | Données et calculs présents ; CA global basé sur dailyStats (sessions validées) au lieu d’une agrégation réservations, ce qui peut sous-estimer le CA si beaucoup de réservations sans session validée. |
| 2 | Revenus courriers | **PARTIEL** | Prix et sessions bien enregistrés ; pas d’intégration dans dailyStats ni dans les indicateurs globaux. |
| 3 | Revenus globaux compagnie | **MANQUANT** | Aucun écran ne calcule « billets + courriers » ; tous = billets uniquement. |
| 4 | Intégration comptabilité | **PARTIEL** | Validation courrier OK ; vues revenus et rapports = billets uniquement. |
| 5 | Intégration flotte | **PARTIEL** | Coûts flotte utilisés ; pas de revenus « par bus » ni « par trajet flotte ». |

---

## Recommandations techniques

### Revenus billets

- **Option A (recommandée dans le diagnostic existant) :** En lecture, en plus de dailyStats, calculer un CA à partir des réservations (filtre date, statut payé/confirme) et l’utiliser en secours ou en combinaison (ex. max(CA dailyStats, CA réservations) ou backfill dailyStats).
- **Option B :** Backfill ou job qui alimente `dailyStats.totalRevenue` à partir des réservations (par jour/agence) pour aligner indicateurs et données réelles.

### Revenus courriers

- **Intégrer les revenus courrier dans les agrégats :**
  - Soit étendre **dailyStats** avec un champ dédié (ex. `totalRevenueCourier`) mis à jour à la **validation d’une session courrier** (dans `validateCourierSession`, appeler une fonction du type `updateDailyStatsOnCourierSessionValidated(companyId, agencyId, date, totalRevenueCourier)`).
  - Soit créer une **agrégation dédiée** (ex. `companies/{companyId}/agences/{agencyId}/dailyStatsCourier/{date}`) et l’agréger côté CEO/Revenus avec les dailyStats billets.
- **Dashboards :** dans CEO, CompanyFinancesPage, Finances (chef-comptable), ajouter la somme des revenus courrier (par période) et afficher **CA total = CA billets + CA courrier**, avec détail par source si besoin.

### Revenus globaux

- Définir une **source unique** pour le CA période (billets + courriers) : soit dailyStats étendus, soit un service qui agrège réservations + sessions courrier validées par date/agence.
- Utiliser cette source dans : CEO, Revenus & Liquidités, Dashboard compagnie, et rapports chef-comptable (Finances).

### Comptabilité

- Conserver le flux actuel (activation + validation sessions courrier).
- Inclure les montants courrier validés dans les vues « Revenus » et rapports (même agrégat que ci-dessus).

### Flotte

- Si besoin de « revenus par bus » : lier les trajets / courses aux véhicules (déjà partiellement présent via embarquement / fleetMovements) et agréger les revenus réservations par `vehicleId` ou par trajet.
- Les coûts (tripCosts) sont déjà intégrés ; garder la même logique profit = revenus − coûts une fois les revenus globaux corrigés (billets + courriers).

---

## Fichiers principaux référencés

- **Réservations / dailyStats :** `src/modules/agence/aggregates/dailyStats.ts`, `src/modules/agence/services/sessionService.ts`, `src/modules/agence/services/guichetReservationService.ts`, `src/types/reservation.ts`
- **Courrier :** `src/modules/logistics/domain/shipment.types.ts`, `src/modules/logistics/domain/firestorePaths.ts`, `src/modules/logistics/services/createShipment.ts`, `src/modules/logistics/services/courierSessionService.ts`, `src/modules/agence/courrier/pages/CourierReportsPage.tsx`
- **CEO / Revenus :** `src/modules/compagnie/pages/CEOCommandCenterPage.tsx`, `src/modules/compagnie/pages/CompanyFinancesPage.tsx`, `src/modules/compagnie/pages/RevenusLiquiditesPage.tsx`
- **Comptabilité :** `src/modules/compagnie/finances/pages/Finances.tsx`, `src/modules/agence/comptabilite/pages/AgenceComptabilitePage.tsx`
- **Diagnostic existant :** `src/modules/compagnie/commandCenter/DIAGNOSTIC_V2_INDICATEURS_VS_DONNEES.md`

---

*Rapport généré dans le cadre de l’audit du système de revenus TELIYA.*
