# Rapport Phase C1.1 — Renforcement de la gouvernance financière

## Résumé

Cette phase introduit des seuils d’approbation configurables et une validation au niveau CEO pour les opérations à montant élevé. Toute la logique est appliquée **dans la couche service** ; l’UI ne peut pas contourner les règles.

---

## 1. Fichiers créés / modifiés

### Créés

| Fichier | Rôle |
|--------|------|
| `src/modules/compagnie/finance/financialSettingsTypes.ts` | Types et constantes pour `financialSettings` (seuils, valeurs par défaut). |
| `src/modules/compagnie/finance/financialSettingsService.ts` | `getFinancialSettings`, `updateFinancialSettings`, `getFinancialThreshold` ; repli sur des valeurs sûres si le document n’existe pas. |
| `src/modules/compagnie/finance/paymentProposalsTypes.ts` | Types pour les propositions de paiement (`PaymentProposalDoc`, statuts, collection). |
| `src/modules/compagnie/finance/paymentProposalsService.ts` | `createPaymentProposal`, `listPendingPaymentProposals`, `sumPaymentProposalsForPayableInLast24h` (anti-contournement). |

### Modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/modules/compagnie/finance/paymentsService.ts` | Lecture des `financialSettings` ; si montant &gt; seuil ou cumul 24h &gt; seuil → création d’une `paymentProposal` (pas de mouvement ni mise à jour du payable) et retour `pending_ceo_approval` ; sinon exécution directe. Ajout de `approvePaymentProposal` et `rejectPaymentProposal`. |
| `src/modules/compagnie/treasury/financialMovements.ts` | `recordMovementInTransaction` retourne l’id du mouvement créé pour renseigner `executedMovementId` sur la proposition. |
| `firestore.rules` | Règles pour `financialSettings/current` (lecture : authentifié ; mise à jour : `admin_compagnie` uniquement) et pour `paymentProposals` (création : `agency_accountant`, `company_accountant`, `financial_director` ; mise à jour limitée aux champs d’approbation : `admin_compagnie` uniquement ; pas de suppression). |
| `firestore.indexes.json` | Index pour `paymentProposals` : `approvalStatus` + `proposedAt` (liste des en attente) ; `payableId` + `proposedAt` + `approvalStatus` (cumul 24h par payable). |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Chargement du nombre de propositions en attente (`listPendingPaymentProposals`) et affichage de la métrique « Paiements en attente d’approbation CEO ». |
| `src/modules/compagnie/finance/index.ts` | Export de `financialSettingsTypes`, `financialSettingsService`, `paymentProposalsTypes`, `paymentProposalsService`. |

---

## 2. Logique de gouvernance

- **Seuils**  
  - `paymentApprovalThreshold` : en dessous, le paiement est exécuté directement (mouvement + mise à jour du payable).  
  - Au-dessus (ou cumul 24h au-dessus), une **paymentProposal** est créée avec `approvalStatus: "pending"` ; aucun mouvement ni modification de solde.

- **Flux d’approbation CEO**  
  1. Un comptable déclenche un paiement au-dessus du seuil → `payPayable` crée une proposition et retourne `{ status: "pending_ceo_approval", proposalId }`.  
  2. Le CEO (rôle `admin_compagnie`) appelle `approvePaymentProposal` : dans une transaction, relecture de la proposition (doit être `pending`), du payable, du compte ; création du mouvement ; mise à jour du payable (montant payé, reste, statut) ; mise à jour de la proposition (`approved`, `approvedBy`, `approvedAt`, `executedMovementId`).  
  3. `rejectPaymentProposal` met la proposition en `rejected` sans impact financier.

- **Moteur de position**  
  Seuls les mouvements réellement enregistrés (paiements exécutés) affectent les soldes. Les propositions en attente n’impactent ni le ledger ni la position financière.

---

## 3. Anti-contournement (splitting)

- **Règle** : si plusieurs propositions de paiement pour **le même payable** sur **les 24 dernières heures** dépassent ensemble le seuil, on exige l’approbation CEO même si chaque montant individuel est sous le seuil.

- **Implémentation** :  
  - `sumPaymentProposalsForPayableInLast24h(companyId, payableId)` somme les montants des propositions **pending** pour ce payable depuis 24h.  
  - Dans `payPayable`, on calcule `cumulative = sumIn24h + amount`. Si `cumulative > paymentApprovalThreshold`, on traite comme au-dessus du seuil : création de proposition, pas d’exécution directe.

- **Effet** : empêcher de diviser un gros paiement en plusieurs petits pour éviter l’approbation CEO.

---

## 4. Sécurité (règles Firestore)

- **financialSettings**  
  - Lecture : tout utilisateur authentifié.  
  - Création / mise à jour : `admin_compagnie` uniquement.  
  - Suppression : interdite.

- **paymentProposals**  
  - Lecture / liste : authentifié.  
  - Création : `agency_accountant`, `company_accountant`, `financial_director`.  
  - Mise à jour : `admin_compagnie` uniquement, et uniquement sur les champs `approvalStatus`, `approvedBy`, `approvedAt`, `executedMovementId`.  
  - Suppression : interdite.

Cela garantit que seul le CEO (admin_compagnie) peut approuver ou rejeter une proposition et que les comptables ne peuvent pas modifier le statut d’approbation.

---

## 5. Multi-agence

- Chaque proposition porte un `agencyId` (agence concernée).  
- Les propositions sont stockées au niveau compagnie : `companies/{companyId}/paymentProposals/{proposalId}`.  
- Le CEO voit le nombre total de paiements en attente pour la compagnie ; une évolution future peut filtrer ou grouper par agence.

---

## 6. Scalabilité

- Liste des propositions en attente : limitée (ex. 500) pour éviter des requêtes trop lourdes.  
- Cumul 24h : limité (ex. 50 propositions) par payable.  
- Les index Firestore couvrent les requêtes par `approvalStatus` + `proposedAt` et par `payableId` + `proposedAt` + `approvalStatus`.

---

## 7. Option Cloud Function (future)

- Une Cloud Function peut être ajoutée pour :  
  - Écouter la création de propositions (ou des mises à jour) et envoyer une notification au CEO.  
  - Exposer un endpoint sécurisé (vérification du rôle `admin_compagnie`) pour `approvePaymentProposal` / `rejectPaymentProposal` si on souhaite centraliser l’approbation côté backend (ex. API interne ou intégration).

La logique métier actuelle reste inchangée ; la Function appellerait les mêmes services (ou répliquerait la transaction avec les mêmes règles).

---

## 8. Compatibilité

- Aucun changement cassant : `payPayable` retourne désormais un type union `PayPayableResult` (`executed` | `pending_ceo_approval`). Les appelants doivent gérer les deux cas (message ou redirection pour « En attente d’approbation CEO »).  
- Les opérations monétaires restent transactionnelles et idempotentes (clés d’idempotence et `referenceId` distincts pour exécution directe vs exécution après approbation CEO).

---

*Phase C1.1 — Financial Governance Hardening — Rapport de livraison.*
