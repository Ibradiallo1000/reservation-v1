# Rapport Phase C — Unified Financial System Implementation

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/modules/compagnie/finance/payablesTypes.ts` | Types PayableDoc, PayableDocCreate, catégories (fuel, parts, maintenance, other), statuts (pending, partially_paid, paid), approvalStatus (pending, approved, rejected). |
| `src/modules/compagnie/finance/payablesService.ts` | createPayable, approvePayable, rejectPayable, listPayablesByAgency, listPayablesByStatus, listUnpaidPayables. Aucun mouvement de caisse à la création. |
| `src/modules/compagnie/finance/paymentsService.ts` | payPayable(params) : transaction unique (lecture payable, vérification approved + remainingAmount, lecture compte, recordMovementInTransaction, mise à jour payable amountPaid/remainingAmount/status/lastPaymentAt). Idempotence via idempotencyKey. |
| `src/modules/compagnie/finance/fleetMaintenanceTypes.ts` | FleetMaintenanceDoc, costType (cash | credit), linkedExpenseId, linkedPayableId. |
| `src/modules/compagnie/finance/fleetMaintenanceService.ts` | createFleetMaintenance, listFleetMaintenance (par vehicleId ou agencyId). Réservé usage Enterprise (gating côté UI). |
| `src/modules/compagnie/finance/index.ts` | Barrel export payables, payments, fleetMaintenance. |
| `src/core/finance/financialPositionEngine.ts` | calculateCompanyCashPosition(accounts, payables) → totalBank, totalMobileMoney, totalAgencyCash, totalPayables, netPosition, byAgency. calculateAgencyExposure(payables, agencyId). Logique pure. |
| `src/core/finance/index.ts` | Export position engine. |

## 2. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/modules/compagnie/treasury/types.ts` | Ajout movementType "payable_payment", referenceType "payable_payment", champs optionnels approvedBy, approvedAt sur FinancialMovementDoc. |
| `firestore.rules` | Règles payables (create: agency_accountant, chefAgence, company_accountant, financial_director, admin_compagnie ; update: company_accountant, financial_director, admin_compagnie). Règles fleetMaintenance (create/update avec chefAgence limité à son agencyId). |
| `firestore.indexes.json` | Index payables (agencyId + createdAt, status + createdAt), fleetMaintenance (agencyId + createdAt, vehicleId + createdAt). |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Chargement listAccounts + listUnpaidPayables ; useMemo financialPosition ; section « Position financière » (Banque, Mobile money, Caisse agences, Comptes à payer, Position nette) affichée si view_profit_analysis. |

## 3. Implications sécurité

- **Payables** : création par agence (agency_accountant, chefAgence) ou niveau compagnie ; approbation et paiement uniquement par company_accountant, financial_director, admin_compagnie. Aucune suppression autorisée.
- **Mouvements** : création dans payPayable via recordMovementInTransaction ; idempotence garantie par uniqueReferenceKey (payable_payment_${payableId}_${idempotencyKey}). Règles existantes : mise à jour limitée à reconciliationStatus (et updatedAt) pour admin_compagnie | company_accountant ; pas de delete.
- **FleetMaintenance** : chefAgence ne peut créer/modifier que pour son agencyId ; lecture pour tout utilisateur authentifié.

## 4. Gestion multi-agences

- Chaque payable est rattaché à un agencyId ; listPayablesByAgency et listPayablesByStatus(agencyId) permettent le filtrage. La position financière agrège les comptes (agency_cash par agence, agency_bank, company_bank, mobile_money) et les payables restants ; byAgency expose cash, payables et net par agence.
- Les paiements débitent un compte (souvent company_bank ou agency_bank) ; le payable reste lié à l’agence pour le suivi.

## 5. Logique du workflow de validation

- **Comptes à payer** : approvalStatus (pending → approved | rejected). approvePayable / rejectPayable enregistrent approvedBy, approvedAt, approvedByRole. Seuls les payables approved peuvent être payés (vérification dans payPayable).
- **Paiement** : une seule exécution par idempotencyKey ; solde compte et remainingAmount contrôlés dans la même transaction. Seuils « paiement au-dessus de X nécessite CEO » : non implémentés côté backend dans cette phase ; à brancher côté UI (masquer/activer bouton selon rôle et montant) ou via paramètre compagnie et vérification dans payPayable.

## 6. Scalabilité

- **Lectures** : listUnpaidPayables = 2 requêtes (pending + partially_paid) ; listAccounts = 1 requête. Pas de listener supplémentaire. Index payables et fleetMaintenance pour éviter les scans.
- **Écritures** : payPayable = 1 transaction (payable + compte(s) + movement + idempotency). Contention possible sur le compte débité si très nombreux paiements parallèles ; sharding company_bank (comme documenté dans types) reste la piste pour la montée en charge.
- **Ledger** : mouvements immuables (sauf reconciliationStatus) ; pas de delete ; audit trail conservé.

## 7. Migration future vers Cloud Functions

- **Option 1** : Déplacer payPayable en Cloud Function appelée par le client (HTTPS ou Firestore trigger) pour centraliser les droits et le seuil CEO.
- **Option 2** : Trigger onCreate payables → notification ou workflow d’approbation ; trigger onUpdate payment_threshold → rejet si montant > seuil et rôle insuffisant.
- **Option 3** : Agrégats (ex. position nette par jour) calculés par job planifié et écrits dans un doc pour alléger les lectures côté CEO.

## 8. Avantage concurrentiel

- **Unifié** : comptes à payer (crédit fournisseur), paiements partiels et moteur de position sur la même base (financialAccounts, financialMovements) que la trésorerie et les dépenses.
- **Traçabilité** : chaque paiement = un mouvement avec referenceType payable_payment et referenceId unique ; idempotence évite les doubles débits.
- **Garage / flotte** : fleetMaintenance permet de lier maintenance véhicule à une dépense (cash) ou un payable (credit), prêt pour intégration au profit engine (coûts agence / trajet).

---

*Rapport Phase C — Unified Financial System. Opérations atomiques et idempotentes ; pas de Cloud Functions ; compatible Spark.*
