# Phase 6 — Index Trésorerie (financialAccounts, financialMovements, expenses)

Les index ci-dessous sont définis dans `firestore.indexes.json` et utilisés par les dashboards et requêtes trésorerie. Créer dans la console Firebase (Firestore > Index) si un index manquant est signalé.

## financialMovements

- **performedAt** (DESC) — Timeline CEO, pagination des mouvements.
- **agencyId** (ASC) + **performedAt** (DESC) — Mouvements par agence (page Trésorerie agence).
- **fromAccountId** (ASC) + **performedAt** (DESC) — Historique par compte source.
- **toAccountId** (ASC) + **performedAt** (DESC) — Historique par compte cible.

## financialAccounts

- **isActive** (ASC) + **agencyId** (ASC) — Comptes actifs par agence (listes filtrées).

## expenses

- **status** (ASC) + **createdAt** (DESC) — Dépenses par statut, liste récente.
- **agencyId** (ASC) + **status** (ASC) — Dépenses en attente par agence.

---

Déploiement : `firebase deploy --only firestore:indexes` (après validation).
