# Rapport — Refonte financière ledger (TELIYA)

**Date de synthèse :** mars 2026  
**Objectif :** système fintech léger fiable — **source de vérité** = `financialTransactions` + `accounts` (ledger), **sans** calculer l’argent à partir des réservations.

---

## 1. Sources de vérité

| Donnée | Collection / mécanisme |
|--------|-------------------------|
| **Flux monétaires** | `companies/{companyId}/financialTransactions` |
| **Soldes (liquidité)** | `companies/{companyId}/accounts` — **somme des `balance`** sur les comptes inclus dans la liquidité |
| **Ventes (volume métier)** | Réservations (`createdAt`, statuts vendus) — **uniquement** pour compter / CA « commercial », **pas** pour la liquidité |

Les KPI « encaissements / CA net / split canal » dans `unifiedFinanceService.ts` sont basés sur **transactions** confirmées, pas sur une re-somme de réservations.

---

## 2. Modèle `accounts` (ledger)

**Fichier principal :** `src/modules/compagnie/treasury/ledgerAccounts.ts`

- **IDs de documents** (exemples) :
  - `company_bank` — banque compagnie (agrégée)
  - `company_clearing` — compte virtuel (partie double entrées)
  - `company_client` — virtuel clients (remboursements)
  - `company_mobile_money` — pool mobile money compagnie (si pas d’`agencyId` côté compte financier)
  - `agency_{agencyId}_cash` — **caisse physique par agence**
  - `agency_{agencyId}_mobile_money` — **mobile money par agence**

Champs typiques : `id`, `companyId`, `agencyId`, `type`, `label`, `balance`, `currency`, `includeInLiquidity`, `createdAt`, `updatedAt`.

**Liquidité affichée** = somme des soldes où `includeInLiquidity !== false` et type `cash` | `mobile_money` | `bank` (+ compatibilité anciens docs `cash` / `mobile_money` / `bank` à la racine).

---

## 3. `financialTransactions`

**Fichier :** `src/modules/compagnie/treasury/financialTransactions.ts`

- Champs clés : `debitAccountId`, `creditAccountId`, `amount`, `status` (`pending` | `confirmed` | `failed` + anciens statuts lus en compat), `type` (`payment_received`, `transfer`, `refund`, `expense`, alias `transfer_to_bank` → `transfer`).
- Écriture **atomique** Firestore : lectures (idempotence + comptes) puis écritures (création comptes manquants, `increment` sur les deux comptes, doc transaction + sentinelle idempotence).
- Garde-fous : solde débit négatif interdit sauf comptes virtuels (`company_clearing`, `company_client`).

**Types :** `src/modules/compagnie/treasury/types.ts` (interface `FinancialTransactionDoc` mise à jour).

---

## 4. Routage des flux (règles métier)

| Événement | Débit (résumé) | Crédit |
|-----------|----------------|--------|
| **payment_received** guichet | `company_clearing` | `agency_*_cash` |
| **payment_received** en ligne | `company_clearing` | `agency_*_mobile_money` |
| **refund** | compte d’origine (cash ou MM agence) | `company_client` |
| **transfer** (ex. dépôt caisse → banque) | IDs explicites (souvent `agency_*_cash` → `company_bank`) | — |

---

## 5. Corrections de bugs livrées

1. **Double écriture en ligne** : `createCashTransaction` avec `sourceType === "online"` **ne** déclenche **plus** le miroir ledger ; seul `paymentService.confirmPayment` crée le `payment_received` (évite doublon avec la vente déjà tracée par la caisse digitale).
2. **Mobile money à 0** : routage explicite **en ligne → crédit `agency_*_mobile_money`** au lieu d’un agrégat unique `mobile_money` société mal alimenté.
3. **Transaction Firestore** : ordre **lectures puis écritures** respecté (plus d’erreur « all reads before writes »).

---

## 6. Fichiers touchés (liste principale)

| Zone | Fichiers |
|------|----------|
| Ledger | `ledgerAccounts.ts`, `financialTransactions.ts`, `types.ts` |
| Services | `paymentService.ts`, `cashService.ts`, `treasuryTransferService.ts`, `expenses.ts` |
| Agrégation | `unifiedFinanceService.ts`, `financialConsistencyService.ts` (`reservationCount` sur ventes) |
| UI | `DashboardAgencePage.tsx`, `CEOCommandCenterPage.tsx`, `CEOCommandCenterBlocks.tsx`, `CompanyFinancesPage.tsx`, `ManagerFinancesPage.tsx` |
| Métriques | `metricsService.ts` |
| Règles | `firestore.rules` (champs autorisés sur `accounts` : `type`, `label`, `includeInLiquidity`, `id`, etc.) |

---

## 7. UI — libellés

- **Supprimés / remplacés** là où c’était du vocabulaire financier ambigu : « Revenus validés », « Centralisé » (tableau CEO → « Banque / MM »), blocs CEO « Validé agence » → **« Paiements en ligne »**, etc.
- **Company Finances** : bandeau **« Synthèse ledger »** (ventes résas, encaissements, CA net, liquidité détaillée).
- **Page comptabilité agence** (`AgenceComptabilitePage`) : libellés **« Validé agence »** liés au **workflow de validation des shifts** (pas au canal paiement) — **non renommés en masse** pour éviter confusion métier ; à traiter dans un ticket UX dédié si besoin.

---

## 8. Backfill historique

Il n’y a **pas** de script Node autonome versionné (conflit `import.meta` / auth avec `firebaseConfig` Vite).

**Procédure recommandée :**

1. **Idempotence** : chaque `payment_received` utilise une clé du type `payment_received_{referenceId}_{amount}` — pour un backfill depuis réservations, utiliser `referenceType: "reservation"` et `referenceId: <id réservation>` pour ne pas dupliquer les flux déjà créés via `cash_session` ou `payment`.
2. **Exécution** : Cloud Function Admin SDK, ou **outil interne** connecté avec un compte **admin compagnie**, en appelant la même logique que `createFinancialTransaction`.
3. **Contrôle** : comparer `SUM(accounts.balance)` avant / après sur un sous-ensemble d’agences.

---

## 9. Déploiement

- Déployer les **règles Firestore** mises à jour :  
  `firebase deploy --only firestore:rules`
- Vérifier les **index** composites si de nouvelles requêtes sur `financialTransactions` (déjà utilisées pour les périodes).

---

## 10. Cas de test cible (spec)

Pour une période donnée : **5 ventes = 125 000 F** (2 en ligne, 3 guichet) :

- Après écritures **uniquement** ledger attendues : **cash** ≈ 75k, **mobile_money** ≈ 50k, **bank** selon transferts, **liquidité totale** = somme des soldes des comptes inclus.

Les écrans utilisant `getUnifiedAgencyFinance` / `getUnifiedCompanyFinance` doivent afficher les **mêmes définitions** (ventes ≠ encaissements ≠ liquidité).

---

## 11. Limites connues

- **financialMovements** / **financialAccounts** (ancien module trésorerie) coexistent encore ; le ledger `accounts` est la **vérité** pour la liquidité agrégée dans le nouveau service unifié.
- **GlobalMoneyPositionsContext** : champs techniques `validatedAgency` / `centralised` subsistent pour le **détail par session** (expand CEO) ; le **tableau principal par agence** utilise les soldes **ledger** (caisse / mobile money).

---

## 12. Ajustements sémantiques (post-verdict produit)

- **Plus de KPI « revenus validés »** exposé comme vérité métier : l’UI Finances société et le snapshot global ne s’appuient plus dessus ; `getNetworkValidated` reste utilitaire d’audit **@deprecated** dans le code.
- **Liquidité agrégée** : `getLiquidityFromAccounts` reconnaît `type` **ou** `accountType`, et les doc ids `agency_*_cash` / `agency_*_mobile_money` même si `agencyId` est absent sur le document.
- **Caisse** : « argent en caisse » = somme des comptes **cash** du ledger ; les encaissements **online** sont exclus des totaux **guichet** (`getCashTotalByLocation`, `CashSummaryCard`, tableau compagnie par agence).
- **UI** : « Encaissements (snapshot) » → **Encaissements du jour** ; tableau CEO : colonnes **Caisse espèces (ledger)** / **Mobile money (ledger)**.
- **`financialTransactions.paymentMethod`** : `mobile_money` | `card` | `cash` | `other` (inféré ou renseigné depuis `payment` / metadata).

---

*Document généré pour clôture de la refonte — à maintenir lors des évolutions du schéma `accounts` / `financialTransactions`.*
