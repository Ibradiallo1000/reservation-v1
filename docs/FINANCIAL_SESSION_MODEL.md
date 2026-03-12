# Modèle des sessions financières — Source de vérité

(Tickets + Courrier)

Ce document décrit la règle de gouvernance financière : **les sessions opérationnelles sont la seule source de vérité pour le revenu**. Les sessions caisse sont un **outil de réconciliation uniquement**.

---

## 1. Règle centrale

| Type de session | Rôle | Revenu / Trésorerie / dailyStats |
|-----------------|------|-----------------------------------|
| **Sessions opérationnelles** (postes guichet, sessions courrier) | Source de vérité financière | **Oui** — Revenu enregistré à la validation comptable |
| **Sessions caisse** (cash sessions) | Réconciliation physique (espèces comptées vs attendu) | **Non** — Aucun mouvement trésorerie, aucune mise à jour dailyStats |

**Le revenu doit toujours provenir de :**

- la validation du **poste guichet** (ticket shift),  
- la validation de la **session courrier**.

**Jamais** de la validation d’une session caisse.

---

## 2. Flux financier (source de vérité)

```
Sessions opérationnelles
  (postes guichet + sessions courrier)
        ↓
  Validation comptable
  (validateSessionByAccountant / validateCourierSession)
        ↓
  Mouvement trésorerie (revenue_cash → compte caisse agence)
        ↓
  Agrégation dailyStats (ticketRevenue / courierRevenue, totalRevenue)
```

- **Ticket :** `validateSessionByAccountant` (sessionService) → mouvement trésorerie + `updateDailyStatsOnSessionValidated`.
- **Courrier :** `validateCourierSession` (courierSessionService) → mouvement trésorerie + `updateDailyStatsOnCourierSessionValidated`.

Ces deux fonctions sont les **seuls points d’entrée** pour l’enregistrement du revenu (trésorerie + dailyStats).

---

## 3. Sessions caisse — Réconciliation uniquement

Les **sessions caisse** (cash sessions) sont des **sessions de réconciliation** : elles servent à vérifier les espèces physiques par rapport aux totaux attendus.

- **Rôle :**  
  - Stocker **expectedAmount** (ou expectedBalance / expectedCash, etc.), **countedAmount** (compté à la clôture), **difference** (écart).  
  - Permettre un contrôle (attendu vs compté) et un suivi des écarts (alertes CEO, etc.).  
- **Ce qu’elles ne font pas :**  
  - Aucun mouvement trésorerie à la validation.  
  - Aucune mise à jour de dailyStats.  
  - Elles ne génèrent pas de revenu dans le système.

En résumé : *cash reconciliation sessions used only to verify physical cash against expected totals.*

---

## 4. Intégrité trésorerie

| Événement | Mouvement trésorerie ? | Mise à jour dailyStats ? |
|-----------|------------------------|---------------------------|
| Poste guichet validé (`validateSessionByAccountant`) | Oui (revenue_cash) | Oui (ticketRevenue, totalRevenue) |
| Session courrier validée (`validateCourierSession`) | Oui (revenue_cash) | Oui (courierRevenue, totalRevenue) |
| Session caisse validée (`validateCashSession`) | **Non** | **Non** |

---

## 5. Points d’entrée code (référence)

- **Revenu billets :** `src/modules/agence/services/sessionService.ts` → `validateSessionByAccountant`  
  - Appelle `updateDailyStatsOnSessionValidated` et `recordMovementInTransaction` (referenceType: `shift`).

- **Revenu courrier :** `src/modules/logistics/services/courierSessionService.ts` → `validateCourierSession`  
  - Appelle `updateDailyStatsOnCourierSessionValidated` et `recordMovementInTransaction` (referenceType: `courier_session`).

- **Réconciliation caisse (aucun revenu) :** `src/modules/agence/cashControl/cashSessionService.ts` → `validateCashSession`  
  - Met uniquement le statut de la session à VALIDATED. Aucun mouvement trésorerie, aucune mise à jour dailyStats.

---

**Dernière mise à jour :** 2025-03-10
