# TELIYA — Plan d’architecture financière

Document d’audit et de proposition pour une hiérarchie et un workflow financiers cohérents.

---

## 1. Analyse de l’implémentation actuelle

### 1.1 financialMovements

- **Emplacement** : `companies/{companyId}/financialMovements`
- **Rôle** : Registre immuable ; tout mouvement de trésorerie passe par `recordMovementInTransaction`. Idempotence via `financialMovementIdempotency` (clé `referenceType_referenceId`).
- **Types** : `revenue_cash`, `revenue_online`, `deposit_to_bank`, `withdrawal_from_bank`, `internal_transfer`, `expense_payment`, `payable_payment`, `salary_payment`, `manual_adjustment`.
- **Champs** : fromAccountId, toAccountId, amount, currency, movementType, referenceType, referenceId, agencyId, performedBy, performedAt, entryType, reconciliationStatus, approvedBy, approvedByRole.
- **Points positifs** : Une seule source de vérité pour les soldes ; pas de mise à jour de `currentBalance` en dehors de ce module.
- **Points faibles** : Aucun lien explicite vers un workflow d’approbation (ex. expenseApprovalId) ; `approvedBy` présent mais peu utilisé côté dépenses.

### 1.2 expenses

- **Emplacement** : `companies/{companyId}/expenses`
- **Statuts** : `pending` | `approved` | `paid`. Pas de `rejected`.
- **Approbation** : Une seule étape. `approveExpense()` accepte un rôle ; la règle métier actuelle ne porte que sur la **catégorie maintenance** et un seuil unique `maintenanceApprovalThreshold` (company_accountant ou admin_compagnie si montant > seuil). Aucune distinction agency_manager / company_accountant / CEO par paliers de montant.
- **Paiement** : `payExpense()` débite `accountId` (compte source) et crédite `company_expense_reserve`. Le compte source peut être une caisse agence ou un compte compagnie.
- **Points faibles** :
  - Pas de workflow multi-niveaux (agency_manager → company_accountant → CEO).
  - Pas de rejet (statut ou commentaire).
  - Pas de pièce jointe (justificatif / reçu).
  - Pas de fournisseur structuré (seule la catégorie `supplier_payment` existe).
  - Seuil uniquement pour maintenance, pas un modèle générique par montant.

### 1.3 Treasury accounts (financialAccounts)

- **Emplacement** : `companies/{companyId}/financialAccounts`
- **Types** : `agency_cash`, `agency_bank` (legacy), `company_bank`, `company_mobile_money`, `expense_reserve`, `payroll_account`, `internal_transfer_account`.
- **Convention** : Les banques sont au niveau compagnie (`company_bank`). Chaque agence a au moins un `agency_cash`. Pas de compte bancaire par agence pour les nouveaux setups.
- **Points positifs** : Séparation claire caisse agence / banque compagnie.
- **Points faibles** : Aucun libellé “agency expense” vs “company expense” dans le modèle ; la distinction est implicite (accountId = agency_cash vs company_bank).

### 1.4 Agency treasury pages

- **AgencyTreasuryPage** (`/agence/treasury`) : Position caisse, derniers mouvements, formulaire “Soumettre une dépense”, liste des dépenses en attente. Création de dépense avec catégorie, compte à débiter, description, montant. Pas de distinction “dépense agence” vs “dépense siège”.
- **ManagerFinancesPage** : Revenus, dépenses, variance caisse, shifts ; utilise `listExpenses` en lecture. Pas d’écran dédié “Mes dépenses à approuver” pour le chef d’agence.
- **Accès** : Trésorerie agence = layout agence (manager, etc.) ; la page est partagée, pas de vue spécifique comptable agence vs manager.

### 1.5 Chef comptable pages

- **DepensesPage** (`/chef-comptable/depenses`) : Liste toutes les dépenses (pending / approved), tous rôles confondus pour l’approbation : un seul bouton “Approuver” puis “Payer”. Pas de vérification “ce montant nécessite CEO” avant d’afficher Approuver.
- **ComptaPage** : Grand livre, balance, compte de résultat (dérivés des mouvements).
- **Finances** : CA, dépenses analytiques (agences/expenses/current), bénéfices.
- **Trésorerie** : Réutilisation de CEOTreasuryPage (comptes, mouvements, dépenses listées).
- **Points faibles** : Aucun workflow par palier ; agency_manager n’a pas d’écran “dépenses à approuver” ; CEO n’a pas d’écran dédié “dépenses > X à approuver”.

---

## 2. Incohérences du workflow financier

| Problème | Détail |
|----------|--------|
| **Un seul niveau d’approbation** | Toute dépense est “approuvée” par un seul acteur (en pratique chef comptable). Pas de chaîne agency_manager → company_accountant → CEO. |
| **Seuil uniquement pour maintenance** | `maintenanceApprovalThreshold` ne s’applique qu’à la catégorie maintenance. Pas de `agencyManagerLimit`, `accountantLimit`, `ceoLimit` globaux. |
| **agency_manager absent du flux** | Les dépenses sont créées en agence mais le chef d’agence ne les valide pas explicitement ; elles vont directement “en attente” pour le chef comptable. |
| **CEO = admin_compagnie** | Le CEO peut tout faire mais n’a pas d’écran “Dépenses à approuver (niveau CEO)” ni de règle “au-dessus de X, seul le CEO peut approuver”. |
| **Pas de rejet** | Impossible de refuser une dépense avec trace (statut rejected + commentaire). |
| **Pas de notifications** | Aucune notification (in-app ou autre) quand une dépense est soumise / approuvée / rejetée / payée. |
| **Pas de justificatif** | Aucun champ receiptUrl / attachment sur la dépense. |
| **Mélange agence / compagnie** | La même collection `expenses` et le même flux pour “payée depuis caisse agence” et “payée depuis banque compagnie”, sans typage explicite ni règles différentes (ex. plafond agence). |

---

## 3. Hiérarchie proposée pour la validation des dépenses

Ordre des validations (chaîne d’approbation selon le montant) :

1. **agency_accountant** (optionnel selon politique)  
   - Peut **créer / soumettre** les dépenses pour son agence.  
   - Peut éventuellement **pré-valider** (workflow à 4 niveaux) ou seulement soumettre.

2. **agency_manager (chefAgence)**  
   - **Premier niveau d’approbation** pour les dépenses de son agence, jusqu’à `agencyManagerLimit`.  
   - Au-dessus de ce seuil, la dépense passe en attente company_accountant (ou CEO selon paliers).

3. **company_accountant (chef comptable)**  
   - Approuve les dépenses dont le montant est dans la tranche `]agencyManagerLimit, accountantLimit]` (ou équivalent).  
   - Peut aussi **payer** les dépenses déjà approuvées (tous paliers confondus), sauf si la politique réserve le paiement au CEO au-dessus d’un certain montant.

4. **CEO (admin_compagnie)**  
   - Approuve les dépenses au-dessus de `accountantLimit` (ou `ceoLimit` selon le modèle).  
   - Peut déléguer le paiement ou l’effectuer lui-même.

Règle proposée simple :  
- **0 – agencyManagerLimit** : approbation **agency_manager** suffisante.  
- **agencyManagerLimit – accountantLimit** : approbation **company_accountant** (éventuellement après validation chef d’agence selon politique).  
- **> accountantLimit** : approbation **CEO**.

---

## 4. Workflow d’approbation configurable (paramètres compagnie)

### 4.1 Nouveaux champs dans financialSettings (ou document dédié)

```ts
expenseApprovalThresholds: {
  agencyManagerLimit: number;   // 0–X : chef agence
  accountantLimit: number;     // X–Y : chef comptable
  ceoLimit: number;            // > Y : CEO (optionnel si accountantLimit = max)
}
```

Exemple :

- `agencyManagerLimit: 100_000`  
- `accountantLimit: 500_000`  
- `ceoLimit: 500_000` (tout au-dessus de 500k → CEO)

Interprétation :

- 0 – 100 000 : approbation **agency_manager**.  
- 100 001 – 500 000 : approbation **company_accountant** (et éventuellement agency_manager selon règles métier).  
- > 500 000 : approbation **CEO**.

### 4.2 Règles métier proposées

- Une dépense a un **statut** et un **niveau requis** dérivé du montant et des seuils.  
- Seul le rôle autorisé pour ce niveau peut passer la dépense à “approved” (ou au niveau suivant si on garde un workflow multi-étapes).  
- **Option A (simple)** : une seule approbation par dépense ; le “approver” est le premier rôle dans la chaîne dont le plafond est ≥ montant (agency_manager → company_accountant → CEO).  
- **Option B (multi-étapes)** : agency_manager approuve toujours pour les dépenses agence ; au-dessus de agencyManagerLimit, la dépense passe en “pending_accountant” puis “pending_ceo” selon les seuils, et company_accountant / CEO approuvent à leur tour.

Recommandation courte : **Option A** pour la v1 (une seule approbation, par le bon rôle selon le montant), avec possibilité d’ajouter plus tard des étapes intermédiaires (Option B).

---

## 5. Différence dépenses agence vs dépenses compagnie

| Critère | Dépense agence | Dépense compagnie |
|---------|----------------|-------------------|
| **Source de paiement** | Compte de type **agency_cash** (caisse de l’agence) | Compte **company_bank** ou **company_mobile_money** |
| **Création** | Créée depuis une agence (`agencyId` renseigné), compte choisi = caisse agence | Créée depuis le siège (agencyId null ou “siège”) ou agence mais compte = banque compagnie |
| **Validation** | Peut imposer une première validation chef d’agence (jusqu’à agencyManagerLimit) | Souvent directe chef comptable / CEO selon seuils |
| **Usage** | Dépenses courantes agence (carburant, péage, petit matériel) | Factures fournisseurs, salaires, gros équipements |
| **Traçabilité** | `agencyId` + `accountId` = agency_cash | `agencyId` null ou compte company_* |

Proposition de modélisation :

- **expenseType** : `"agency"` | `"company"` (dérivé automatiquement : si `accountId` est un `agency_cash` → agency, sinon company).  
- Ou laisser implicite et documenter la règle “agency_cash = dépense agence ; company_bank / company_mobile_money = dépense compagnie”.

---

## 6. Améliorations suggérées

### 6.1 Notifications

- **Création** : Notifier agency_manager (si dépense agence) et/ou company_accountant selon seuil.  
- **Approbation** : Notifier le créateur et, si payée, le créateur + éventuellement comptable.  
- **Rejet** : Notifier le créateur avec motif.  
- **Paiement** : Notifier le créateur (et optionnellement le validant).  
- Implémentation : collection `notifications` (voir §7) + écoute temps réel ou Cloud Functions pour créer les notifications à chaque changement de statut / approbation / paiement.

### 6.2 Statut d’approbation

- Étendre les statuts : `pending` | `approved` | `rejected` | `paid`.  
- Optionnel pour workflow multi-niveaux : `pending_manager` | `pending_accountant` | `pending_ceo` | `approved` | `rejected` | `paid`.  
- Champs : `rejectedAt`, `rejectedBy`, `rejectionReason`.

### 6.3 Catégories de dépenses

- Garder `EXPENSE_CATEGORIES` (fuel, maintenance, salary, toll, operational, supplier_payment, other).  
- Permettre des **catégories personnalisées** par compagnie (sous-collection ou tableau dans `companySettings` / `financialSettings`) avec code + libellé.  
- Pour les rapports : mapper catégories personnalisées vers une catégorie standard (ex. comptable).

### 6.4 Pièces jointes (reçus / justificatifs)

- Sur la dépense : `receiptUrls: string[]` (Storage URLs) ou `attachments: { name, url, contentType, size }[]`.  
- Règle : au moins un justificatif obligatoire au-dessus d’un certain montant (paramètre compagnie).  
- Affichage : lien “Voir justificatif” sur les écrans liste/détail dépense (agence, chef comptable, CEO).

### 6.5 Fournisseurs (suppliers)

- Collection **suppliers** (voir §7) : id, companyId, name, contact, taxId, etc.  
- Sur la dépense : `supplierId` (optionnel) en plus de la catégorie `supplier_payment`.  
- Liste déroulante “Fournisseur” à la création ; rapports par fournisseur possibles plus tard.

---

## 7. Structure Firestore proposée

### 7.1 expenses (existant, étendu)

```
companies/{companyId}/expenses/{expenseId}
  companyId, agencyId (string | null)
  expenseType: "agency" | "company"  // dérivé ou stocké
  category, expenseCategory
  description, amount, currency
  accountId                        // compte à débiter (agency_cash ou company_bank / mobile_money)
  status: "pending" | "pending_accountant" | "pending_ceo" | "approved" | "rejected" | "paid"
  createdBy, createdAt, updatedAt
  approvedBy, approvedAt, approvedByRole
  rejectedBy, rejectedAt, rejectionReason
  paidAt, paidBy
  receiptUrls?: string[]
  supplierId?: string
  vehicleId, tripId, linkedMaintenanceId, linkedPayableId, expenseDate  // existants
```

### 7.2 expenseApprovals (nouveau — historique des approbations)

```
companies/{companyId}/expenseApprovals/{approvalId}
  expenseId
  step: "agency_manager" | "company_accountant" | "ceo"
  action: "approved" | "rejected"
  performedBy, performedAt, performedByRole
  comment?: string
  amountAtApproval: number
```

Permet un audit complet (qui a approuvé/rejeté à quel niveau et quand).

### 7.3 notifications

```
companies/{companyId}/notifications/{notificationId}
  type: "expense_submitted" | "expense_approved" | "expense_rejected" | "expense_paid"
  targetUserId: string             // destinataire
  targetRole?: string              // ou rôle (pour “tous les company_accountant”)
  expenseId, agencyId
  title, body
  read: boolean
  createdAt
  link?: string                    // ex. /chef-comptable/depenses
```

Alternative : sous-collection par utilisateur `users/{userId}/notifications` pour des règles de sécurité plus simples.

### 7.4 accountingMappings (optionnel — export compta)

```
companies/{companyId}/accountingMappings/current
  expenseCategoryToAccountCode: Record<string, string>   // fuel → "601", maintenance → "622"
  movementTypeToAccountCode: Record<string, string>
  defaultRevenueAccountCode, defaultExpenseReserveAccountCode
```

Pour générer des exports (CSV/Excel) avec codes comptables.

### 7.5 suppliers

```
companies/{companyId}/suppliers/{supplierId}
  name, contactEmail?, contactPhone?
  address?, taxId?
  createdAt, updatedAt
  isActive: boolean
```

---

## 8. Pages UI proposées par rôle

### 8.1 Agency accountant (comptable agence)

| Page | Contenu |
|------|--------|
| **Trésorerie agence** (existant) | Conserver : position caisse, mouvements, **soumettre une dépense**, dépenses en attente. |
| **Dépenses soumises** (optionnel) | Liste des dépenses créées par l’agence avec statut (en attente validation chef agence / comptable / CEO, approuvée, rejetée, payée). |

### 8.2 Agency manager (chef d’agence)

| Page | Contenu |
|------|--------|
| **Trésorerie / Finances** (existant) | Garder indicateurs et lien vers dépenses. |
| **Dépenses à approuver** (nouveau) | Liste des dépenses de **son agence** avec montant ≤ `agencyManagerLimit`, statut = pending. Actions : [Approuver] [Refuser]. Filtre par période. |
| **Historique dépenses agence** | Liste de toutes les dépenses de l’agence (tous statuts) pour suivi. |

### 8.3 Chief accountant (chef comptable)

| Page | Contenu |
|------|--------|
| **Dépenses** (existant, enrichi) | Liste des dépenses **dont le montant est dans sa tranche** (après validation chef agence si workflow multi-étapes) : pending_accountant ou pending. Filtres : agence, statut, période. Actions : [Approuver] [Refuser]. Pour les dépenses déjà approved : [Payer]. Affichage du “niveau requis” (ex. “Approbation chef comptable”). |
| **Compta** (existant) | Grand livre, balance, compte de résultat. |
| **Trésorerie** (existant) | Vue consolidée. |
| **Paramètres** (existant) | Accès en lecture (ou édition si droit) aux seuils `expenseApprovalThresholds`. |

### 8.4 CEO (admin_compagnie)

| Page | Contenu |
|------|--------|
| **Trésorerie** (existant) | Vue globale, comptes, mouvements, dépenses récentes. |
| **Dépenses à approuver (CEO)** (nouveau ou onglet) | Dépenses dont montant > `accountantLimit`, statut = pending_ceo ou pending. Actions : [Approuver] [Refuser]. |
| **Paramètres compagnie** | Édition des **expenseApprovalThresholds** (agencyManagerLimit, accountantLimit, ceoLimit). |
| **Rapports / Finances** (existant) | Vue consolidée, bénéfices, etc. |

---

## 9. Synthèse des étapes d’implémentation recommandées

1. **Phase 1 — Seuils et rôles**  
   - Ajouter `expenseApprovalThresholds` dans financialSettings.  
   - Adapter `approveExpense()` : selon le montant, vérifier que l’approbant a le bon rôle (agency_manager / company_accountant / admin_compagnie).  
   - Introduire statut `rejected` + champs rejectedBy, rejectedAt, rejectionReason.

2. **Phase 2 — UI par rôle**  
   - Page “Dépenses à approuver” pour agency_manager (filtre agence + montant ≤ agencyManagerLimit).  
   - Page “Dépenses” chef comptable : n’afficher “Approuver” que pour les dépenses dans sa tranche ; afficher “À faire approuver par le CEO” pour les montants > accountantLimit.  
   - Page ou section CEO “Dépenses à approuver (niveau CEO)”.

3. **Phase 3 — Notifications**  
   - Créer la collection notifications (ou user notifications).  
   - Créer des notifications à la soumission, approbation, rejet, paiement.

4. **Phase 4 — Enrichissement**  
   - Pièces jointes (receiptUrls) sur dépense + stockage (Storage).  
   - Collection suppliers + champ supplierId sur dépense.  
   - expenseApprovals pour l’audit.

5. **Phase 5 — Export et compta**  
   - accountingMappings (optionnel).  
   - Export CSV/Excel des dépenses et mouvements avec codes comptables.

---

*Document généré pour l’audit de l’architecture financière TELIYA. À valider avec l’équipe produit avant implémentation.*
