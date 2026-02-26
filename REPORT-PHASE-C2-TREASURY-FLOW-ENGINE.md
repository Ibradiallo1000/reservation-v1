# Rapport Phase C2 — Moteur de flux trésorerie

## Résumé

Cette phase met en place un système unifié de circulation des fonds : caisses agences, comptes banque et mobile money compagnie, transferts inter-comptes, dépôts/retraits, paiements fournisseurs. Toute modification de solde passe par le ledger `financialMovements`. Aucune mutation de balance sans enregistrement de mouvement.

---

## 1. Fichiers créés / modifiés

### Créés

| Fichier | Rôle |
|--------|------|
| `src/modules/compagnie/treasury/treasuryTransferService.ts` | Transfert interne (double écriture), dépôt agence→banque, retrait banque→agence, mobile→banque, dépense mobile. Tous atomiques et idempotents. |
| `REPORT-PHASE-C2-TREASURY-FLOW-ENGINE.md` | Ce rapport. |

### Modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/modules/compagnie/treasury/types.ts` | Ajout `company_mobile_money` dans `FINANCIAL_ACCOUNT_TYPES` ; `REFERENCE_TYPES` : `internal_transfer`, `agency_deposit`, `bank_withdrawal`, `mobile_to_bank`, `mobile_expense` ; `approvedByRole` sur `FinancialMovementDoc` ; helper `companyMobileMoneyAccountId`. |
| `src/modules/compagnie/treasury/financialMovements.ts` | `RecordMovementParams` : `entryType` optionnel, `approvedBy`, `approvedByRole` ; utilisation de `entryType` quand fourni ; export de `ensureUniqueReferenceKeyInTransaction` pour le transfert interne. |
| `src/modules/compagnie/treasury/financialAccounts.ts` | `ensureDefaultAgencyAccounts` : ne crée plus que `agency_cash` (plus de `agency_bank`). Toutes les banques sont au niveau compagnie (Phase C2). |
| `src/core/finance/financialPositionEngine.ts` | `totalMobileMoney` : prise en charge de `company_mobile_money` en plus de `mobile_money`. Commentaire : les transferts internes n’augmentent pas les totaux. |
| `src/modules/compagnie/finance/paymentsService.ts` | Commentaire : `fromAccountId` peut être agency_cash, company_bank ou company_mobile_money (WAVE 4). |

---

## 2. Double écriture (transfert interne)

- **Règle** : un transfert entre deux comptes génère **deux** mouvements dans le ledger : un **débit** (compte source) et un **crédit** (compte destination), avec le même identifiant métier (`idempotencyKey`).
- **Implémentation** :
  - Un sentinelle d’idempotence `internal_transfer_${idempotencyKey}` garantit qu’un même transfert n’est pas exécuté deux fois.
  - Premier mouvement : `fromAccountId` = compte source, `toAccountId` = null, `entryType` = "debit", `referenceId` = `${idempotencyKey}_debit`. Mise à jour du solde source (décrément).
  - Second mouvement : `fromAccountId` = null, `toAccountId` = compte destination, `entryType` = "credit", `referenceId` = `${idempotencyKey}_credit`. Mise à jour du solde destination (incrément).
- **referenceType** : `internal_transfer` pour les deux. Traçabilité et réconciliation possibles par paire debit/credit.

---

## 3. Multi-agence

- **Caisses agences** : un compte `agency_cash` par agence (id dérivé de `agencyId`). Plus de compte `agency_bank` créé par défaut ; les banques sont uniquement au niveau compagnie.
- **Validation WAVE 6** : un transfert **direct** de caisse agence A vers caisse agence B est interdit. Les flux inter-agences doivent passer par un compte `company_bank`. La règle est appliquée dans `transferBetweenAccounts` (vérification des types et `agencyId`).
- **Dépôt / retrait** : `agencyDepositToBank` (caisse agence → banque compagnie), `bankWithdrawalToAgency` (banque compagnie → caisse agence) : un mouvement chacun, avec `referenceType` `agency_deposit` et `bank_withdrawal`.

---

## 4. Concurrence et conditions de course

- Toutes les opérations qui modifient les soldes s’exécutent dans une **transaction Firestore** (`runTransaction`). Les lectures (solde, existence des comptes) et les écritures (mouvements, mise à jour des soldes, sentinelles d’idempotence) sont dans la même transaction.
- En cas de concurrence sur le même compte, une seule transaction réussit ; l’autre échoue (ex. « Solde insuffisant ») et peut être réessayée par le client.
- **Limite Firestore** : environ 1 écriture/seconde par document. Pour un compte très sollicité, une évolution possible est le sharding (ex. sous-comptes par type ou par agence) documenté dans les types.

---

## 5. Idempotence

- **Transfert interne** : une sentinelle `internal_transfer_${idempotencyKey}` est créée en début de transaction. Si la même clé est rejouée, la transaction échoue (« Un mouvement existe déjà pour cette référence »).
- **Dépôt / retrait / mobile→banque / dépense mobile** : chaque flux utilise un `idempotencyKey` unique passé en paramètre ; il est utilisé comme `referenceId` du mouvement. Le ledger utilise `uniqueReferenceKey = referenceType_referenceId` : un second appel avec la même clé provoque une erreur d’idempotence dans `recordMovementInTransaction`.
- Aucune double écriture de mouvement pour une même clé métier.

---

## 6. Scalabilité (limite 1 write/sec/doc)

- Chaque mouvement met à jour **un ou deux** documents de compte (`currentBalance`, `updatedAt`) et écrit **un** document dans `financialMovements`. Les transferts internes mettent à jour deux comptes et créent deux mouvements.
- Si un même compte reçoit un volume très élevé d’écritures, Firestore peut limiter à ~1 write/sec sur ce document. Pistes : sharding des comptes (ex. `company_bank_1`, `company_bank_2`), ou report des écritures vers une Cloud Function avec file d’attente. Non implémenté dans cette phase ; uniquement documenté.

---

## 7. Flux implémentés (WAVE 3)

| Flux | referenceType | Compte(s) débité(s) | Compte(s) crédité(s) | movementType |
|------|----------------|---------------------|----------------------|---------------|
| Transfert interne | internal_transfer | 1 (debit) | 1 (credit) | internal_transfer |
| Dépôt agence → banque | agency_deposit | agency_cash | company_bank | deposit_to_bank |
| Retrait banque → agence | bank_withdrawal | company_bank | agency_cash | withdrawal_from_bank |
| Mobile → banque | mobile_to_bank | company_mobile_money | company_bank | internal_transfer |
| Dépense mobile | mobile_expense | company_mobile_money | — | expense_payment |

Tous sont atomiques (une transaction) et idempotents (clé métier unique).

---

## 8. Règlement des paiements fournisseurs (WAVE 4)

- `payPayable` accepte un `fromAccountId` quelconque : **agency_cash**, **company_bank** ou **company_mobile_money**. La logique ledger est identique : un mouvement `payable_payment`, débit du compte indiqué, mise à jour du payable. Aucune restriction de type de compte côté moteur de paiement.

---

## 9. Moteur de position financière (WAVE 5)

- **totalBank** : sommes des soldes des comptes `company_bank` (et `agency_bank` pour rétrocompatibilité).
- **totalMobileMoney** : sommes des soldes `company_mobile_money` et `mobile_money`.
- **totalAgencyCash** : sommes des soldes `agency_cash`.
- **totalPayables** : somme des `remainingAmount` des payables.
- **netPosition** : totalBank + totalMobileMoney + totalAgencyCash - totalPayables.
- Les transferts internes ne gonflent pas les totaux : un débit sur un compte et un crédit sur un autre laissent la somme des soldes inchangée.

---

## 10. Audit des mouvements (WAVE 7)

Chaque document `financialMovements` contient notamment :

- `referenceType`, `referenceId`, `uniqueReferenceKey`
- `entryType` (debit | credit)
- `fromAccountId`, `toAccountId`
- `performedBy`, `performedByRole`
- `approvedBy`, `approvedByRole` (optionnels)
- `performedAt`, `settlementDate` (optionnel)
- `reconciliationStatus`, `notes`, etc.

Le ledger est **append-only** : pas de suppression ; les règles Firestore n’autorisent que des mises à jour limitées (ex. `reconciliationStatus`, `updatedAt`).

---

## 11. Automatisation future (Cloud Function)

- **Traitement par lot** : exécution périodique de transferts ou de rapprochements à partir d’une file (Firestore, Pub/Sub, etc.) pour lisser la charge et respecter les limites par document.
- **Rapprochement** : mise à jour de `reconciliationStatus` et `settlementDate` à partir des relevés bancaires ou des webhooks mobile money.
- **Contrôles** : validation des montants ou des plafonds avant d’enregistrer un mouvement (ex. seuils par type de flux).

---

*Phase C2 — Treasury Flow Engine — Rapport de livraison.*
