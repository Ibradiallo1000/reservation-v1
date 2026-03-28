# 🧾 AUDIT COMPLET — FLUX COMPTABLE TELIYA (VERSION FUSION)

**Règle : analyse du code réel uniquement, aucune modification.**

---

## 🧩 PARTIE 1 — CARTOGRAPHIE DES RÔLES

### Sources de vérité
- **`src/roles-permissions.ts`** : liste des rôles et `permissionsByRole` (modules par rôle).
- **`src/constants/routePermissions.ts`** : rôles autorisés par route/layout.
- **`src/core/permissions/roleCapabilities.ts`** : capacités par rôle (référence à `@/roles-permissions` pour le type `Role`).
- **`src/AppRoutes.tsx`** : routes, `PrivateRoute`/`ProtectedRoute`, `landingTargetForRoles`, `RoleLanding`.

### Rôles existants (extraits du code)

| Rôle | Fichier | Pages / accès |
|------|---------|----------------|
| **admin_platforme** | `routePermissions.ts`, `roles-permissions.ts` | Tous les layouts (compagnie, garage, accounting, agence, admin). |
| **admin_compagnie** | id. | `compagnieLayout` → Poste de pilotage, Réservations réseau, Finances, Flotte, Audit & contrôle, **Validation chef comptable**, Clients, Paramètres. |
| **financial_director** | `roles-permissions.ts` (DAF) | `companyAccountantLayout` → redirection après login vers `/compagnie/:companyId/accounting`. |
| **company_accountant** | id. (comptable compagnie) | Idem : `/compagnie/:companyId/accounting` (Vue Globale, Réservations en ligne, Finances, Compta, Dépenses, Trésorerie, Rapports, Paramètres). |
| **agency_accountant** | `routePermissions.comptabilite` | `["agency_accountant", "admin_compagnie"]` → `/agence/comptabilite` (landing). |
| **guichetier** | `routePermissions.guichet` | Guichet agence. |
| **chefAgence** | `routePermissions.agenceShell` | Dashboard agence, opérations, finances, trésorerie, équipe, rapports, courrier, flotte. |
| **superviseur** | id. | Même shell agence. |
| **responsable_logistique**, **chef_garage** | `routePermissions.garageLayout` | Garage / flotte compagnie. |

**Remarque :** Le libellé "Chef comptable" dans l’UI (`CompagnieLayout` → "Validation chef comptable") pointe vers une route sous **CompagnieLayout**, protégée par `routePermissions.compagnieLayout` = **admin_compagnie** et **admin_platforme**. Donc la **validation des sessions (validateSessionByHeadAccountant)** est faite par le **CEO (admin_compagnie)** ou l’admin plateforme, **pas** par le rôle `company_accountant`.

### Pages accessibles par rôle (résumé)

- **admin_compagnie (CEO)**  
  - Layout : `CompagnieLayout` (`AppRoutes.tsx` L361–406).  
  - Pages : command-center, finances, reservations-reseau, flotte, **comptabilite/validation** (CompagnieComptabiliteValidationPage), audit-controle, agences, paramètres, customers, etc.  
  - Actions : valider/rejeter sessions (validateSessionByHeadAccountant), vision globale, approbations paiements, dépenses.

- **company_accountant / financial_director**  
  - Layout : `CompanyAccountantLayout` (`AppRoutes.tsx` L446–470).  
  - Pages : Vue Globale, **Réservations en ligne** (ReservationsEnLignePage), Finances, Compta, Dépenses, Trésorerie, Rapports, Paramètres.  
  - **Pas d’accès** à `/compagnie/:id/comptabilite/validation` (c’est sous CompagnieLayout, réservé CEO/admin_platforme).  
  - Actions : **validation des paiements en ligne** (preuve_recue → confirme + createCashTransaction), dépenses, trésorerie, rapports.

- **agency_accountant**  
  - Landing : `/agence/comptabilite` (`AppRoutes.tsx` L136, ROLE_LANDING).  
  - Page : `AgenceComptabilitePage` (Contrôle, Réceptions, Rapports, Caisse, Réconciliation, Courrier).  
  - Actions : activer/pause/continuer sessions, **validateSessionByAccountant** (réception de caisse, création cashReceipts), voir postes, rapports, caisse, réconciliation.

- **guichetier**  
  - Landing : `/agence/guichet`.  
  - Actions : ouvrir/pause/clôturer session, créer réservations (guichetReservationService → 1 résa = 1 cashTransaction + 1 réservation).

### Identification des mélanges opérationnel / validation

- **company_accountant (comptable compagnie)** : fait du **opérationnel** sur la page "Réservations en ligne" (écoute `statut === 'preuve_recue'`, valide chaque réservation, appelle `transitionToConfirmedOrPaidWithDailyStats` + `createCashTransaction`). Il ne fait pas la "validation chef comptable" des sessions guichet (réservée au CEO).
- **agency_accountant** : fait **réception de caisse** (saisie montant reçu, validation → validated_agency + écriture cashReceipts). C’est opérationnel + contrôle de cohérence.
- **admin_compagnie (CEO)** : fait la **validation chef comptable** des sessions (VALIDATED_AGENCY → VALIDATED) et crée le mouvement financialMovements (centralisation). C’est décisionnel/validation de flux, mais exposé sous le libellé "Validation chef comptable".

**Incohérence d’accès :**  
- La page "Réservations en ligne" (validation des preuves de paiement) est dans l’espace **accounting** (company_accountant / financial_director). Donc c’est le **comptable compagnie** qui valide les paiements en ligne, pas un rôle dédié "opérateur digital".  
- La "Validation chef comptable" (sessions guichet) est dans l’espace **CEO** (admin_compagnie), pas dans l’espace accounting.

---

## 🧩 PARTIE 2 — INVENTAIRE DES COLLECTIONS

### 1. `reservations`
- **Chemin :** `companies/{companyId}/agences/{agencyId}/reservations`.
- **Champs utilisés (côté code) :** `id`, `companyId`, `agencyId`, `statut`, `nomClient`/`clientNom`, `telephone`, `montant`, `canal`, `depart`, `arrivee`, `date`, `heure`, `seatsGo`, `seatsReturn`, `createdAt`, `preuveUrl`/`paymentProofUrl`, `paymentReference`, `shiftId`, `createdInSessionId`, `guichetierId`, `guichetierCode`, `cashTransactionId`, `validatedAt`, `trajetId`, etc.
- **Rôle :** Réservations par agence (guichet + en ligne). Statuts : `en_attente`, `preuve_recue`, `confirme`/`paye`, `refuse`, `annule`, etc. (`src/types/reservation.ts`).
- **Relations :** Une résa guichet → 1 cashTransaction (sessionId = shiftId). Une résa en ligne validée → 1 cashTransaction (sourceType online) créée à la validation.

### 2. `cashTransactions`
- **Chemin :** `companies/{companyId}/cashTransactions` (`cashTypes.ts`, `cashService.ts`).
- **Champs :** `reservationId`, `sessionId`/`sourceSessionId`, `sourceType` (guichet | online | transfer), `amount`, `currency`, `paymentMethod`, `locationType`, `locationId` (agencyId), `date`, `paidAt`, `status` (paid | refunded | orphan | cancelled), `seats`, `routeLabel`, `accountId`, `createdBy`, `createdAt`.
- **Rôle :** Encaissements (1 vente = 1 transaction quand payé). Source de vérité pour totaux session guichet (closeSession) et pour encaissements en ligne (ReservationsEnLignePage, module financier).
- **Relations :** Lien réservation via `reservationId`. Lien session guichet via `sourceSessionId`/`sessionId`. Lien compte optionnel via `accountId` (financialAccounts).

### 3. `shifts` et `shiftReports`
- **Shifts :** `companies/{companyId}/agences/{agencyId}/shifts`. Champs : `status` (pending | active | paused | closed | validated_agency | validated), `userId`, `startAt`/`startTime`, `endAt`/`endTime`, `totalRevenue`, `totalCash`, `validationAudit`, etc. (`sessionService.ts`, `sessionLifecycle.ts`).
- **shiftReports :** `companies/{companyId}/agences/{agencyId}/shiftReports`. Créé/ mis à jour dans `closeSession` avec `status: 'pending_validation'`, puis `validateSessionByAccountant` → `status: 'validated_agency'`, puis `validateSessionByHeadAccountant` (CompagnieComptabiliteValidationPage) → `status: 'validated'`. Champs : `shiftId`, `companyId`, `agencyId`, `userId`, `totalRevenue`, `totalCash`, `validationAudit`, `accountantValidated`, `managerValidated`, etc.
- **Rôle :** Shifts = poste guichet (cycle de vie). ShiftReports = rapport de session pour validation et traçabilité (montants repris de cashTransactions dans closeSession).

### 4. `financialMovements`
- **Chemin :** `companies/{companyId}/financialMovements` (`financialMovements.ts`).
- **Champs :** `fromAccountId`, `toAccountId`, `amount`, `currency`, `movementType`, `referenceType`, `referenceId`, `agencyId`, `performedBy`, `performedAt`, `sourceType`, `sourceSessionId`, etc. Idempotance via `financialMovementIdempotency` (uniqueReferenceKey).
- **Rôle :** Grand livre : toute modification de solde de compte (financialAccounts) passe par un mouvement. Utilisé à la **validation chef comptable** (validateSessionByHeadAccountant) : `recordMovementInTransaction` → crédit agency_cash (revenue_cash), référence shift.
- **Relations :** Comptes via `fromAccountId`/`toAccountId`. Pas de lien direct avec cashTransactions ; la centralisation guichet crée un mouvement, pas une copie des cashTransactions.

### 5. `financialAccounts`
- **Chemin :** `companies/{companyId}/financialAccounts` (`financialAccounts.ts`).
- **Champs :** `accountType` (agency_cash, company_bank, etc.), `accountName`, `agencyId`, `currentBalance`, `currency`, `isActive`.
- **Rôle :** Comptes (caisse agence, banque compagnie, mobile money, etc.). Les soldes ne sont modifiés que via financialMovements.

### 6. `cashReceipts`
- **Chemin :** `companies/{companyId}/agences/{agencyId}/cashReceipts`.
- **Création :** Dans `validateSessionByAccountant` (sessionService) quand `receivedCashAmount > 0` : `cashReceived`, `shiftId`, `createdAt`, `validatedBy`.
- **Rôle :** Journal des remises de caisse (entrées) pour l’onglet Caisse de l’agence (AgenceComptabilitePage, reloadCash).

### 7. `cashMovements`
- **Chemin :** `companies/{companyId}/agences/{agencyId}/cashMovements`.
- **Rôle :** Sorties (dépenses, transferts) et entrées manuelles pour le journal de caisse agence (`reloadCash` dans AgenceComptabilitePage).

### Doublons fonctionnels / conflits
- **Montants session :** Une session a des totaux dans **shifts** (totalRevenue, totalCash), dans **shiftReports** (idem + validationAudit), et la **source de calcul** réelle est **cashTransactions** (getCashTransactionsBySessionId) dans closeSession. Donc pas de doublon de stockage des montants session : shiftReport est rempli à partir des totaux dérivés de cashTransactions.
- **Encaissements en ligne :** Affichés dans ReservationsEnLignePage à partir de **cashTransactions** (sourceType online, status paid). Aucune écriture dans financialMovements pour chaque paiement en ligne ; financialMovements est utilisé pour la centralisation **guichet** (validation chef comptable). Donc deux sources pour deux flux : cashTransactions = encaissements (guichet + en ligne) ; financialMovements = mouvements de comptes (dont centralisation guichet).

---

## 🧩 PARTIE 3 — AUDIT RÉSERVATIONS EN LIGNE

### Fichiers analysés
- **`src/modules/compagnie/finances/pages/ReservationsEnLignePage.tsx`**
- **`src/modules/compagnie/cash/cashService.ts`** (createCashTransaction, getCashTransactionsByPaidAtRange)
- **`src/modules/agence/services/reservationStatutService.ts`** (transitionToConfirmedOrPaidWithDailyStats)

### 1. Source de vérité
- **Une réservation en ligne validée crée-t-elle une cashTransaction ?** Oui. Dans ReservationsEnLignePage, `handleValidate` (validation preuve) appelle `transitionToConfirmedOrPaidWithDailyStats` puis, si `montant > 0`, `createCashTransaction` avec `sourceType: "online"`, `locationId: reservation.agencyId`, `paidAt: getTodayBamako()` (`ReservationsEnLignePage.tsx` ~L620–638).
- **sourceType === "online"** : utilisé à la création (cashService) et pour le filtre du module financier (ReservationsEnLignePage : `getCashTransactionsByPaidAtRange` puis filtre `sourceType === 'online'` et `status === 'paid'`).

### 2. Validation
- **Qui valide ?** L’utilisateur connecté sur la page "Réservations en ligne", qui est servie dans **CompanyAccountantLayout** → rôles **company_accountant** et **financial_director**. Donc le **comptable compagnie** (ou DAF) valide les paiements individuels (preuve → confirme + cashTransaction). Ce n’est pas automatique ; ce n’est pas le "chef comptable" au sens de la validation des sessions guichet (qui est le CEO).
- **Incohérence métier :** Un rôle comptable (company_accountant) fait une tâche opérationnelle (valider chaque preuve et envoyer le billet). Pour un futur rôle "Opérateur Digital (Caisse Digitale)", cette action devrait être déplacée vers ce rôle et retirée du comptable.

### 3. Lien paiement ↔ réservation
- **reservationId ↔ cashTransaction :** La cashTransaction contient `reservationId` (`CreateCashTransactionParams` et `CashTransactionDoc`). La réservation peut être mise à jour avec `cashTransactionId` (non vu dans l’extrait mais souvent utilisé). Lien bidirectionnel possible.

### 4. Mobile money
- **Provider (wave, orange, moov, saali) :** `paymentMethod` dans cashTransactions est un string (cash, mobile_money, transfer, etc.). Les valeurs wave/orange_money/moov ne sont pas imposées dans le type ; elles peuvent être stockées comme libellé. Aucune énumération stricte "provider" dans les types analysés (`cashTypes.ts`).

### 5. Répartition agence
- **assignedAgencyId :** Non utilisé dans les types reservation/cashTransaction. La réservation en ligne a `agencyId` (agence du trajet choisi). La cashTransaction a `locationId` (agencyId). La répartition par agence dans le module financier se fait par `locationId` (`financeByAgency` dans ReservationsEnLignePage). Donc pas de champ "assignedAgencyId" distinct ; c’est l’agence du trajet (réservation) / locationId (cashTransaction).

---

## 🧩 PARTIE 4 — AUDIT PAR SCÉNARIOS

### SCÉNARIO 1 — Réservation en ligne

1. **Création réservation**  
   - Fichiers : `ReservationClientPage.tsx`, `ResultatsAgencePage.tsx` (choix trajet/agence), écriture dans `companies/{companyId}/agences/{agencyId}/reservations`.  
   - Statut initial : brouillon puis en attente / preuve à envoyer.

2. **Envoi preuve**  
   - Client : upload preuve → mise à jour réservation (statut → `preuve_recue`).  
   - Fichiers : `UploadPreuvePage.tsx`, etc. Collection : `reservations` (même chemin).

3. **Validation paiement**  
   - Page : ReservationsEnLignePage (layout company accountant).  
   - Écoute : `where('statut', '==', 'preuve_recue')` sur chaque agence.  
   - Actions : `transitionToConfirmedOrPaidWithDailyStats` (reservationStatutService) → statut `confirme`/`paye`, mise à jour dailyStats si en ligne ; puis `createCashTransaction` (sourceType online, locationId = reservation.agencyId, paidAt = aujourd’hui).  
   - Collections : `reservations` (statut, cashTransactionId), `companies/{companyId}/cashTransactions` (nouveau doc).

4. **Impact comptable**  
   - Encaissement en ligne = 1 ligne dans cashTransactions (status paid).  
   - Aucun financialMovement créé pour ce paiement ; financialMovements sert à la centralisation guichet (validation chef comptable).

### SCÉNARIO 2 — Vente guichet

1. **Création réservation**  
   - `guichetReservationService.ts` : création réservation (canal guichet, shiftId, etc.) + **createCashTransaction** (sourceType guichet, sessionId, locationId = agencyId) dans la même opération.  
   - Collections : `reservations`, `cashTransactions`.

2. **closeSession()**  
   - `sessionService.closeSession` : lit les totaux via `getCashTransactionsBySessionId` (source de vérité), met à jour `shifts` (status closed, totaux), crée/met à jour `shiftReports` (status `pending_validation`, totaux, details).  
   - Aucune écriture dans financialMovements à ce stade.

3. **Validation comptable agence**  
   - AgenceComptabilitePage (agency_accountant) : saisie "espèces reçues", clic Valider → `validateSessionByAccountant`.  
   - Shifts → `validated_agency`, shiftReports → `validated_agency` + validationAudit ; création d’un doc dans `cashReceipts` (remise de caisse).

4. **Validation chef comptable**  
   - CompagnieComptabiliteValidationPage (sous CompagnieLayout → CEO) : liste des shiftReports validated_agency, bouton Valider → `validateSessionByHeadAccountant`.  
   - Shifts → `validated`, shiftReports → `validated` ; **recordMovementInTransaction** (financialMovements) : crédit agency_cash (revenue_cash), référence shift.  
   - Plus `setValidatedAtOnShiftReservations` sur les réservations de la session.

### SCÉNARIO 3 — Vision chef comptable (totaux)

- **Total guichet :** Dans GlobalMoneyPositionsContext : somme des **cashTransactions** (status paid, locationType agence/escale) sur la période (paidAt).  
- **Total validé agence :** Somme des **shiftReports** (status validated_agency) via `validationAudit.receivedCashAmount` ou totalCash.  
- **Total centralisé :** Somme des **financialMovements** (toAccountId in central accounts, performedAt dans la période).  
- Donc : **cashTransactions** = source pour l’encaissement guichet (et en ligne) ; **shiftReports** = source pour "validé agence" ; **financialMovements** = source pour "centralisé". Pas une seule source unique pour tous les totaux ; trois sources pour trois étapes du flux.

---

## 🧩 PARTIE 5 — SOURCE DE VÉRITÉ

- **Encaissements (ventes payées) :** **cashTransactions** (status = paid). Utilisée pour totaux session (closeSession), réconciliation agence (getCashTransactionsByLocation / getCashTransactionsByPaidAtRange), module financier en ligne (filtre sourceType online), et positions "GUICHET" dans GlobalMoneyPositionsContext.
- **Mouvements de comptes (trésorerie) :** **financialMovements**. Utilisée pour soldes financialAccounts et position "CENTRALISÉ" (entrées sur comptes centraux). La centralisation guichet est la seule écriture financialMovements liée aux ventes (au moment de validateSessionByHeadAccountant).
- **Duplications :** Les montants de la session guichet existent à la fois dans cashTransactions (détail par transaction) et dans shiftReports (agrégat + validation). Ce n’est pas une duplication incohérente : shiftReport est un résumé de session ; la source des montants reste cashTransactions. En revanche, "validé agence" est lu depuis shiftReports (validationAudit.receivedCashAmount / totalCash), pas recalculé depuis cashTransactions, ce qui peut créer des écarts si les données divergent.

---

## 🧩 PARTIE 6 — AUDIT DES STATUTS

### Réservations (`statut`)
- **Types :** `src/types/reservation.ts` : en_attente_paiement, preuve_recue, confirme, paye, annule, refuse, en_attente, verification, embarque, etc.
- **Création :** Selon canal (guichet → paye ; en ligne → en_attente / preuve_recue).
- **Utilisation :** ReservationsEnLignePage filtre `preuve_recue` pour "à vérifier" ; après validation → confirme/paye. reservationStatutService gère les transitions et dailyStats.
- **Normalisation :** ReservationsEnLignePage utilise `normalizeStatut` (preuve_recue → verification pour l’affichage, etc.). Risque d’écart entre valeur Firestore et valeur affichée si normalisation incomplète.

### cashTransactions (`status`)
- **Valeurs :** paid, refunded, orphan, cancelled (`CASH_TRANSACTION_STATUS` dans cashTypes.ts).
- **Création :** Toujours `status: PAID` à la création. Remboursement/annulation → markCashTransactionRefunded ou markCashTransactionOrphan.
- **Utilisation :** getCashTransactionsBySessionId filtre `status === PAID`. GlobalMoneyPositionsContext et module financier en ligne idem.

### shiftReports (`status`)
- **Valeurs dans le code :** `pending_validation` (après closeSession), `validated_agency` (après validateSessionByAccountant), `validated` (après validateSessionByHeadAccountant). Référence : sessionService.ts, sessionLifecycle.ts (SHIFT_STATUS pour shifts ; report peut avoir un statut légèrement différent).
- **Création :** closeSession écrit `status: 'pending_validation'`. validateSessionByAccountant écrit `status: 'validated_agency'`. validateSessionByHeadAccountant écrit `status: 'validated'`.
- **Incohérence potentielle :** Les shifts utilisent SHIFT_STATUS (closed, validated_agency, validated) ; les shiftReports utilisent des strings ('pending_validation', 'validated_agency', 'validated'). Vérifier que partout où on filtre "validated_agency" on parle bien des reports (ex. GlobalMoneyPositionsContext : `where("status", "==", "validated_agency")` sur shiftReports).

### financialMovements
- Pas de champ "statut" dans les types lus ; mouvement = enregistrement immuable (idempotence par uniqueReferenceKey).

---

## 🧩 PARTIE 7 — CAISSE & SESSIONS

- **closeSession()** (`sessionService.ts`) : lit **getCashTransactionsBySessionId** (cashTransactions, status paid, sourceSessionId = shiftId), calcule totalRevenue, totalCash, totalDigital, tickets, details par trajet ; écrit shift (status closed, totaux) et shiftReport (status pending_validation, mêmes totaux). **Source des montants = cashTransactions.**
- **Total session affiché (popup clôture, rapports) :** Vient de la valeur retournée par closeSession (elle-même issue de cashTransactions). Cohérent.
- **Total validé (validated_agency) :** Dans GlobalMoneyPositionsContext, lu depuis **shiftReports** (validationAudit.receivedCashAmount ou totalCash), pas recalculé depuis cashTransactions. Donc si un écart existe entre ce qui a été encaissé (cashTransactions) et ce qui a été saisi à la validation (receivedCashAmount), la position "validé agence" reflète la saisie, pas la somme des transactions.
- **Caisse agence (onglet Caisse) :** Entrées = cashReceipts (cashReceived) + shifts validated_agency/validated dans la période (fallback si pas de cashReceipt). Sorties = cashMovements (depense, transfert_banque). Source cohérente avec le flux (validation comptable agence → cashReceipts).

---

## 🧩 PARTIE 8 — RÔLES VS ACTIONS

- **Chef comptable (au sens UI "Validation chef comptable") :** En réalité **admin_compagnie** (CEO). Il fait la validation des **sessions** (VALIDATED_AGENCY → VALIDATED) et déclenche l’écriture financialMovements (centralisation). Il ne valide pas les **paiements en ligne** un par un (c’est company_accountant).
- **Comptable compagnie (company_accountant) :** Fait de l’**opérationnel** : validation des preuves de paiement en ligne (réservation par réservation), création des cashTransactions en ligne, accès Trésorerie, Dépenses, Rapports. Il ne fait pas la validation des sessions guichet.
- **Guichetier :** Ne modifie pas les montants des réservations après vente ; il crée des réservations avec un montant saisi. La création de la cashTransaction est faite dans guichetReservationService (côté serveur/front) avec le montant de la réservation.
- **Comptable agence (agency_accountant) :** Voit les postes, les réceptions, la caisse, la réconciliation. Il **saisit** le montant reçu (espèces) et valide → validateSessionByAccountant. Il a une vision "données de l’agence" (shifts, cashReceipts, cashMovements), pas la vision globale compagnie (financialMovements, tous les comptes).

---

## 🧩 PARTIE 9 — RUPTURES IDENTIFIÉES

| Id | Description | Cause technique | Fichier / collection | Impact |
|----|-------------|------------------|----------------------|--------|
| R1 | Libellé "Chef comptable" alors que la validation sessions est faite par le CEO | Route "Validation chef comptable" dans CompagnieLayout (admin_compagnie) | CompagnieLayout.tsx, AppRoutes.tsx | Confusion rôle : un "chef comptable" métier pourrait s’attendre à avoir ce menu dans l’espace accounting. |
| R2 | Comptable compagnie valide les paiements en ligne (opérationnel) | ReservationsEnLignePage dans CompanyAccountantLayout, handleValidate sans rôle dédié | ReservationsEnLignePage.tsx | Mélange opérationnel (valider preuve, envoyer billet) et vision comptable. |
| R3 | Deux espaces "comptabilité" : CEO (comptabilite/validation) vs accounting (réservations en ligne, compta, trésorerie) | Deux layouts différents selon rôle | AppRoutes.tsx, CompanyAccountantLayout.tsx, CompagnieLayout.tsx | Risque de doublon de menus ou d’accès manquants selon le rôle. |
| R4 | Position "validé agence" basée sur shiftReports (validationAudit.receivedCashAmount) et non sur somme cashTransactions | GlobalMoneyPositionsContext utilise shiftReports pour validated_agency | GlobalMoneyPositionsContext.tsx | Écart possible entre encaissement réel (cashTransactions) et montant "validé agence" si saisie incorrecte. |

---

## 🧩 PARTIE 10 — CE QUI DOIT ÊTRE SUPPRIMÉ / SÉPARÉ (identification uniquement)

- **Actions opérationnelles à retirer du chef comptable (company_accountant / financial_director) :**  
  - Validation des preuves de paiement en ligne (clic par réservation, envoi billet). À transférer vers un rôle "Opérateur Digital (Caisse Digitale)" si créé.

- **Pages / logiques à clarifier (sans refactor demandé ici) :**  
  - Réservations en ligne : aujourd’hui à la fois "module financier" (cashTransactions, lecture seule) et "validation des preuves" (opérationnel). Une séparation nette (onglet "Encaissements" vs "Preuves à valider") ou deux rôles distincts éviterait le mélange.  
  - "Validation chef comptable" (sessions) : actuellement dans l’espace CEO ; si un rôle Chef comptable (décisionnel uniquement) est créé, il faudrait lui donner accès à cette page sans lui donner tout l’espace CEO.

- **Logiques incorrectes (à corriger en dehors de cet audit) :**  
  - Aucune logique manifestement fausse identifiée ; les montants session viennent bien de cashTransactions. Le seul point fragile est l’usage de shiftReports pour "validé agence" au lieu de recalculer depuis cashTransactions des sessions validated_agency (pour homogénéité).

---

## 🧩 PARTIE 11 — PRÉPARATION NOUVEAUX RÔLES

### Opérateur Digital (Caisse Digitale) — à créer
- **Doit :** Voir les réservations à vérifier (preuve_recue), valider le paiement (confirme + createCashTransaction), déclencher l’envoi du billet. Voir les encaissements en ligne (lecture cashTransactions online).
- **Ne doit pas :** Modifier les montants des transactions, accéder à la comptabilité globale (compta, financialMovements, validation des sessions guichet), ni à la trésorerie compagnie complète.
- **Code actuel à déplacer/restreindre :** La page "Réservations en ligne" (ou une sous-partie "Preuves à valider") et l’action handleValidate + createCashTransaction, aujourd’hui accessibles à company_accountant, devraient être accessibles à un nouveau rôle et retirées du comptable.

### Chef Comptable (refactoré) — à clarifier
- **Doit :** Voir la vision globale (positions guichet / validé agence / centralisé), valider les **flux** (sessions validées agence → validation chef = centralisation), détecter les anomalies (écarts, incohérences).
- **Ne doit pas :** Valider chaque paiement en ligne (preuve par preuve), ni faire les opérations de caisse (saisie dépenses, transferts opérationnels).
- **Code actuel :** La validation des sessions (validateSessionByHeadAccountant) est sous CompagnieLayout (CEO). Pour un rôle "Chef comptable" refactoré, il faudrait soit donner à ce rôle l’accès à `/compagnie/:id/comptabilite/validation` sans tout le reste CEO, soit dupliquer cette page dans l’espace accounting avec un contrôle de rôle strict.

---

## 🧠 TEST FINAL

1. **Peut-on tracer chaque FCFA : vente → encaissement → validation → centralisation ?**  
   - **Guichet :** Oui. Vente = réservation + cashTransaction (sessionId). Clôture = totaux depuis cashTransactions → shiftReport. Validation agence = shiftReport validated_agency + cashReceipt. Validation chef = shiftReport validated + financialMovement (crédit agency_cash).  
   - **En ligne :** Vente = réservation ; encaissement = à la validation (createCashTransaction). Pas de "centralisation" automatique dans financialMovements pour l’en ligne (les comptes mobile money ne sont pas nécessairement mis à jour par mouvement à chaque paiement dans le code vu).

2. **Un rôle fait-il deux choses incompatibles ?**  
   - **company_accountant** : oui, il fait à la fois opérationnel (validation des preuves en ligne) et consultation/trésorerie/dépenses.  
   - **admin_compagnie** : fait vision globale + validation des sessions (décisionnel) ; moins incohérent que le comptable.

3. **Un montant vient-il de plusieurs sources ?**  
   - Pour une **session guichet** : le montant "session" est calculé depuis cashTransactions (closeSession) et recopié dans shiftReport. Une seule source de vérité (cashTransactions) pour le calcul.  
   - Pour **"validé agence"** dans les positions globales : la source est shiftReports (validationAudit.receivedCashAmount / totalCash), pas la somme des cashTransactions des sessions validated_agency. Donc **deux sources possibles** pour le même concept (montant validé agence) : cashTransactions par session vs shiftReport. Si elles divergent (saisie différente du reçu), le système est dangereux pour le reporting.

---

*Audit réalisé sur le code réel des fichiers cités. Aucune modification de code n’a été appliquée.*
