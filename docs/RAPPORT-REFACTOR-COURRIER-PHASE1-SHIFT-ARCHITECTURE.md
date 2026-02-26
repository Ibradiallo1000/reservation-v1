# Rapport — Refactor module Courrier (Phase 1 — Architecture type Guichet)

**Date :** 2025  
**Objectif :** Faire fonctionner les sessions Courrier comme les postes Ticket (Guichet), sans modifier le module Ticket, les tableaux de bord ni les réservations.

---

## 1. Résumé des changements

### 1.1 Nouvelle collection `courierSessions`

- **Chemin :** `companies/{companyId}/agences/{agencyId}/courierSessions`
- **Champs des documents :**
  - `sessionId` (égal à l’ID du document)
  - `companyId`, `agencyId`
  - `agentId`, `agentCode`
  - `status` : `"PENDING"` | `"ACTIVE"` | `"CLOSED"` | `"VALIDATED"`
  - `openedAt`, `closedAt`, `validatedAt`
  - `expectedAmount`, `validatedAmount`, `difference`
  - `createdAt`, `updatedAt`
  - `activatedBy`, `validatedBy` (optionnels, pour traçabilité)

### 1.2 Comportement des sessions (aligné Guichet)

| Étape | Acteur | Action | Statut |
|-------|--------|--------|--------|
| 1 | Agent | Crée une session | `PENDING` |
| 2 | Comptable d’agence | Active la session | `ACTIVE` |
| 3 | Agent | Crée des envois (uniquement si `ACTIVE`) | — |
| 4 | Agent | Clôture la session | `CLOSED` |
| 5 | Comptable d’agence | Valide la session (saisie du montant compté) | `VALIDATED` |

- **expectedAmount** : calculé à la **clôture** à partir des envois liés à la session (`sessionId`), somme de `transportFee + insuranceAmount` par envoi. Il n’est **pas** stocké ni incrémenté à chaque entrée de ledger.
- **validatedAmount** et **difference** : renseignés à la **validation** par le comptable (`validatedAmount` = montant compté, `difference` = validatedAmount − expectedAmount).

### 1.3 Revenus

- **recordLogisticsLedgerEntry** : suppression de la création automatique de **RevenueEvent**. Les revenus ne sont plus considérés comme définitifs avant la validation de la session.
- Aucune écriture dans un agrégat type dailyStats ou CEO dans cette phase (pas de dashboards, pas d’intégration CEO).

### 1.4 Envois (shipments)

- Chaque envoi créé depuis le module Courrier doit avoir :
  - **sessionId** : ID de la session courrier active
  - **agentCode** : code de l’agent
- La création d’envoi n’est autorisée que si la session courrier est **ACTIVE** (vérification dans `createShipment`).

---

## 2. Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| **Créés** | |
| `src/modules/logistics/domain/courierSession.types.ts` | Types `CourierSessionStatus`, `CourierSession` |
| `src/modules/logistics/domain/courierSessionPaths.ts` | Références Firestore pour `courierSessions` (agence) |
| `src/modules/logistics/services/courierSessionService.ts` | `createCourierSession`, `activateCourierSession`, `closeCourierSession`, `validateCourierSession`, `getOpenCourierSessionId` ; calcul de `expectedAmount` à la clôture à partir des envois |
| **Modifiés** | |
| `src/modules/logistics/services/recordLogisticsLedgerEntry.ts` | Suppression de la création de `RevenueEvent` ; suppression de la mise à jour de `session.expectedAmount` ; contrôle de la session sur **courierSessions** (statut `ACTIVE`) |
| `src/modules/logistics/services/createShipment.ts` | Paramètres `sessionId`, `agentCode` ; vérification que la session courrier est `ACTIVE` ; enregistrement de `sessionId` et `agentCode` sur l’envoi |
| `src/modules/logistics/domain/shipment.types.ts` | Champs optionnels `sessionId`, `agentCode` sur `Shipment` |
| `src/modules/agence/courrier/pages/CourierSessionPage.tsx` | Utilisation des sessions courrier (agence) : création → `PENDING`, écoute par `agentId`, affichage PENDING/ACTIVE/CLOSED/VALIDATED ; clôture sans saisie de montant compté ; création d’envoi avec `sessionId` et `agentCode` ; chargement des envois par `sessionId` |
| `firestore.rules` | Règles de lecture/écriture pour `courierSessions/{sessionId}` sous `agences/{agencyId}` |
| `firestore.indexes.json` | Index sur `courierSessions` (agentId) et `shipments` (sessionId) |

---

## 3. Fichiers non modifiés (confirmations)

- **Module Ticket (Guichet) :** aucun fichier sous `src/modules/agence/guichet/`, `src/modules/agence/services/sessionService.ts`, `src/modules/agence/hooks/useActiveShift.ts`, `src/modules/agence/constants/sessionLifecycle.ts`, etc. n’a été modifié.
- **Tableaux de bord :** aucune modification sur les pages CEO, Compagnie ou Agence (dashboard, KPIs, revenus).
- **Réservations :** aucune modification sur les collections ou services de réservations (guichet, en ligne).

---

## 4. Utilisation côté comptable d’agence (hors livrable Phase 1)

La **validation** des sessions courrier (CLOSED → VALIDATED avec `validatedAmount`) est exposée par le service **validateCourierSession**. L’UI comptable d’agence (équivalent AgenceComptabilitePage pour le guichet) et l’**activation** (PENDING → ACTIVE) ne sont pas implémentées dans cette phase : le service **activateCourierSession** est prêt à être appelé depuis une page ou un écran dédié « Comptabilité / Courrier » lorsque celle-ci sera ajoutée.

---

## 5. Synthèse

- Nouvelle collection **courierSessions** sous chaque agence, avec statuts PENDING → ACTIVE → CLOSED → VALIDATED.
- **expectedAmount** calculé à la clôture à partir des envois (`sessionId`), et non plus stocké manuellement par entrée de ledger.
- Plus de **RevenueEvent** ni de mise à jour de montant attendu dans **recordLogisticsLedgerEntry**.
- Envois avec **sessionId** et **agentCode** ; création d’envoi possible uniquement si session **ACTIVE**.
- Module Ticket (Guichet), dashboards et réservations restent inchangés.
