# Audit actuel - Espace Comptable Agence

Portee : audit cible de `/agence/comptabilite` et de ses sous-routes directes. Aucune modification metier, Firestore ou UI n'est proposee ici.

## 1. Routes et composants

### Routes exactes

| Route | Composant | Acces route |
|---|---|---|
| `/agence/comptabilite` | `src/modules/agence/comptabilite/pages/AgenceComptabilitePage.tsx` | `routePermissions.comptabilite` : `agency_accountant`, `guichetier`, `chefAgence`, `superviseur`, `admin_compagnie` |
| `/agence/comptabilite/journal-agents` | `src/modules/agence/manager/AgencyAgentHistoryPage.tsx` via lazy import `AgencyAgentHistoryPage` | `routePermissions.agentHistory` : `chefAgence`, `superviseur`, `agency_accountant`, `admin_compagnie`, `admin_platforme` |
| `/agence/comptabilite/treasury/new-operation` | `src/modules/agence/treasury/pages/AgencyTreasuryNewOperationPage.tsx` | `routePermissions.comptabiliteTreasury` : `agency_accountant`, `admin_compagnie`, `admin_platforme` |
| `/agence/comptabilite/treasury/transfer` | `src/modules/agence/treasury/pages/AgencyTreasuryTransferPage.tsx` | `routePermissions.comptabiliteTreasury` : `agency_accountant`, `admin_compagnie`, `admin_platforme` |
| `/agence/comptabilite/treasury/new-payable` | `src/modules/agence/treasury/pages/AgencyTreasuryNewPayablePage.tsx` | `routePermissions.comptabiliteTreasury` : `agency_accountant`, `admin_compagnie`, `admin_platforme` |

### Fichiers directement concernes

- `src/AppRoutes.tsx` : declare les routes.
- `src/constants/routePermissions.ts` : roles autorises par route.
- `src/modules/agence/comptabilite/pages/AgenceComptabilitePage.tsx` : page principale, onglets, actions UI, chargements Firestore.
- `src/modules/agence/comptabilite/agencyComptabiliteTabAccess.ts` : matrice active des onglets/actions dans la page.
- `src/modules/agence/comptabilite/agencyComptabiliteAccess.ts` : autre matrice RBAC proche, mais non utilisee par la page principale actuelle.
- `src/modules/agence/comptabilite/agencyCashAuditService.ts` : lecture caisse ledger, encaissements, audits caisse.
- `src/modules/agence/comptabilite/comptaEncaissementsService.ts` : ecritures et lectures `comptaEncaissements`.
- `src/modules/agence/services/sessionService.ts` : activation/reprise poste guichet, validation comptable guichet, validation chef.
- `src/modules/logistics/services/courierSessionService.ts` : activation, validation comptable et validation chef des sessions courrier.
- `src/modules/logistics/services/courierSessionLedger.ts` : montant attendu courrier via ledger `financialTransactions`, fallback colis payes.
- `src/modules/agence/treasury/pages/AgencyTreasuryNewOperationPage.tsx` : depense caisse et navigation vers transfert/payable.
- `src/modules/agence/treasury/pages/AgencyTreasuryTransferPage.tsx` : demande de versement caisse agence vers banque compagnie, validation/refus chef.
- `src/modules/agence/treasury/pages/AgencyTreasuryNewPayablePage.tsx` : creation fournisseur/payable fournisseur agence.
- `src/modules/agence/treasury/transferRequestsService.ts` : CRUD demandes de versement et execution ledger apres validation chef.
- `src/modules/compagnie/treasury/financialTransactions.ts` : ledger financier, remises pending -> caisse, transferts, sorties.
- `src/modules/compagnie/treasury/expenses.ts` : creation et cycle de validation depenses.

## 2. Onglets actuels

Onglets canoniques dans `COMPTA_TAB_ORDER` : `ventes`, `versements`, `caisse`, `audit`, `corrections`.

Pour un `agency_accountant`, `getAllowedComptaTabs` expose actuellement les cinq onglets : `Ventes`, `Versements`, `Caisse`, `Controle`, `Corrections`. Le premier onglet par defaut est toutefois `Ventes`, car `getDefaultComptaTab` retourne le premier onglet autorise dans l'ordre canonique.

### Ventes

- Nom UI : `Ventes`.
- Role : supervision operationnelle des postes guichet et des sessions courrier ; consultation de rapports par poste/session.
- Donnees affichees :
  - KPI jour : guichets en service, billets vendus jour, montant ventes jour, ventes en ligne jour.
  - Postes guichet en service, en attente, en pause.
  - Detail par poste guichet : reservations, billets, montants, canal, paiement, vendeur.
  - Courrier : sessions actives, sessions en attente d'activation, rapport de colis par session.
- Actions disponibles :
  - `Activer le poste` guichet : `activateShift` -> `activateSession`.
  - `Continuer` un poste guichet en pause : `continueShift` -> `continueSession`.
  - Selectionner un poste guichet : `loadReportForShift`.
  - Filtres rapport guichet : Tous / Billetterie / En ligne.
  - `Activer le poste` courrier : `activateCourierSessionAction` -> `activateCourierSession`.
  - Selectionner une session courrier : `loadCourierReportForSession`.
  - Filtres colis : Tous / Payes / Non payes.
- Collections Firestore utilisees :
  - `companies/{companyId}/agences/{agencyId}/shifts`.
  - `companies/{companyId}/agences/{agencyId}/shiftReports`.
  - `companies/{companyId}/agences/{agencyId}/reservations`.
  - `companies/{companyId}/agences/{agencyId}/courierSessions`.
  - `companies/{companyId}/shipments`.
  - `companies/{companyId}/agences/{agencyId}/agencyLiveState` via agregats.
  - `companies/{companyId}/agences/{agencyId}/agentHistory` via logs non bloquants.
  - Sources indirectes KPI : `networkStats` / activite commerciale.
- Elements utiles Phase 1 :
  - Sessions courrier en attente d'activation.
  - Postes en service/en pause pour suivi.
  - Details de session utiles pour comprendre un versement.
- Elements a masquer ou simplifier :
  - Les KPI ventes jour et le detail commercial complet sont plus "supervision ventes" que comptabilite.
  - Le bouton `Continuer` sur poste guichet est operationnel et probablement hors mission comptable pure.
  - Le rapport guichet incluant filtres canal peut etre deplace en historique/detail.

### Versements

- Nom UI : `Versements`.
- Role : reception et validation comptable des remises guichet et courrier.
- Donnees affichees :
  - Compteur des sessions a traiter.
  - Guichet : sessions `closed`, vendeur, periode, reservations, billets, total ventes, montant attendu, montant recu, ecart.
  - Courrier : sessions `CLOSED`, colis, colis payes, montant attendu, montant verse, ecart.
  - Sessions deja `validated_agency` en attente chef d'agence.
- Actions disponibles :
  - `Voir le detail` : bascule vers `Ventes` et charge `loadReportForShift`.
  - Saisie `Montant recu` guichet.
  - `Valider le versement` guichet : `validateReception` -> `validateSessionByAccountant`.
  - Saisie `Montant verse (compte)` courrier.
  - `Valider le versement` courrier : `validateCourierSessionAction` -> `validateCourierSession`.
- Collections Firestore utilisees :
  - Lecture : `shifts`, `shiftReports`, `reservations`, `courierSessions`, `shipments`, `financialTransactions`.
  - Ecriture guichet : `shifts`, `shiftReports`, `cashReceipts`, `comptaEncaissements`, `companies/{companyId}/accounts/agency_{agencyId}_cash`, sous-collection `accounts/{cashAccount}/ledger`, agregats `dailyStats`, `agencyLiveState`, `agentHistory`.
  - Ecriture courrier : `courierSessions`, `financialTransactions`, `accounts`, `comptaEncaissements`, agregats `dailyStats`, `agencyLiveState`, `agentHistory`.
- Elements utiles Phase 1 :
  - C'est le coeur comptable actuel.
  - Les cartes a valider guichet/courrier et la liste "Validé comptable en attente chef" doivent rester visibles.
- Elements a masquer ou simplifier :
  - Le detail complet du poste peut rester derriere une action secondaire.
  - Le wording "chef comptable" doit rester evite cote agence ; l'etat actuel parle plutot chef d'agence dans l'aide courrier.

### Caisse

- Nom UI : `Caisse`.
- Role : consultation du solde caisse et flux, plus actions de tresorerie reservees au comptable agence/admin.
- Donnees affichees :
  - Caisse disponible globale.
  - Entrees especes periode.
  - Sorties especes periode.
  - Historique journalier : entrees, sorties, net jour, totaux periode.
  - Alertes si lecture tronquee ou erreur de periode.
- Actions disponibles :
  - `Depense caisse` : ouvre modal `AgencyTreasuryNewOperationPage`.
  - `Versement compagnie` : ouvre modal `AgencyTreasuryTransferPage`.
  - `Paiement fournisseur` : ouvre modal `AgencyTreasuryNewPayablePage`.
  - `Export CSV` : `exportCsv(days, currencySymbol)`, export local navigateur, pas d'ecriture Firestore.
  - Filtres : mois, periode personnalisee, `Actualiser`.
- Collections Firestore utilisees :
  - `companies/{companyId}/accounts`, dont `agency_{agencyId}_cash`.
  - `companies/{companyId}/financialTransactions`.
  - `companies/{companyId}/agences/{agencyId}/comptaEncaissements`.
  - Sous-pages : `expenses`, `treasuryTransferRequests`, `companyBanks`, `financialAccounts`, `payables`, `suppliers`, `vehicles`.
- Elements utiles Phase 1 :
  - Solde caisse ledger global.
  - Entrees/sorties periode.
  - Historique journalier.
- Elements a masquer ou simplifier :
  - Les trois actions tresorerie peuvent devenir un menu "Operations caisse".
  - Les sous-pages standalone `/treasury/*` doublonnent les modals et peuvent etre cachees si Phase 1 veut une surface simple.

### Controle

- Nom UI : `Controle`.
- Role : reconciliation lecture seule ventes/caisse et enregistrement d'un controle de caisse. Attention : l'enregistrement est bloque par `canRunAgencyCashControlAudit`, donc chef/superviseur/admin, pas comptable agence seul.
- Donnees affichees :
  - Date de reconciliation.
  - Ecart caisse.
  - Total ventes billets.
  - Total en caisse guichet.
  - Details ventes billetterie, ventes en ligne, courrier, especes recues, mobile money, total encaisses.
  - Controle de caisse : montant attendu ledger, entrees, sorties, montant reel saisi, ecart, historique des audits.
- Actions disponibles :
  - `Actualiser` reconciliation : `loadReconciliation`.
  - `Voir/Masquer les details`.
  - `Actualiser` controle ledger : `reloadLedgerCashAudit`.
  - Saisie `Montant en caisse`.
  - `Valider la caisse` : `handleValidateAgencyCash` -> `validateAgencyCash`, uniquement chef/superviseur/admin.
- Collections Firestore utilisees :
  - `cashTransactions` via `getCashTransactionsByLocation` / fallback `getCashTransactionsByPaidAtRange`.
  - Activite commerciale unifiee / network stats.
  - `payments` via `getPaymentsByDateRange` pour courrier valide.
  - `financialTransactions`, `accounts`, `comptaEncaissements`.
  - `companies/{companyId}/agences/{agencyId}/cashAudits`.
- Elements utiles Phase 1 :
  - Reconciliation comme outil de controle.
  - Historique des audits caisse.
- Elements a masquer ou simplifier :
  - Pour un comptable agence seul, le bouton `Valider la caisse` n'est pas actionnable ; il faut le presenter comme lecture/controle ou le reserver a un espace chef.
  - La section "ventes en ligne" dans l'ecart peut creer une confusion, car `ecart = ventesGuichet.montant - encaissementsTotal`, alors que la carte "Total ventes" affiche guichet + en ligne.

### Corrections

- Nom UI : `Corrections`.
- Role : information uniquement.
- Donnees affichees :
  - Message : aucune correction de solde ou historique depuis cet ecran ; contacter comptable compagnie ou admin compagnie.
- Actions disponibles : aucune.
- Collections Firestore utilisees : aucune.
- Elements utiles Phase 1 :
  - Peut servir de garde-fou metier.
- Elements a masquer ou simplifier :
  - A masquer en Phase 1 si aucune fonctionnalite de correction n'existe.

## 3. Actions comptable

| Action | Fichier source | Fonction appelee | Collections touchees | Statut |
|---|---|---|---|---|
| Activation poste guichet | `AgenceComptabilitePage.tsx` | `activateShift` -> `activateSession` | `shifts`, `shiftReports`, `agencyLiveState`, `agentHistory` | A revoir : action operationnelle, pas strictement comptable |
| Reprise poste guichet en pause | `AgenceComptabilitePage.tsx` | `continueShift` -> `continueSession` | `shifts` | A revoir/masquer pour comptable pur |
| Suivi sessions guichet actives/pauses/fermees | `AgenceComptabilitePage.tsx` | `onSnapshot(shifts)` + `onSnapshot(reservations)` | `shifts`, `reservations` | Conserver, mais simplifier |
| Consultation detail poste guichet | `AgenceComptabilitePage.tsx` | `loadReportForShift` | `shifts`, `reservations` | Conserver en detail secondaire |
| Validation versement guichet | `AgenceComptabilitePage.tsx` | `validateReception` -> `validateSessionByAccountant` | `shifts`, `shiftReports`, `cashReceipts`, `comptaEncaissements`, `accounts`, `accounts/{cash}/ledger`, `dailyStats`, `agencyLiveState`, `agentHistory` | Conserver |
| Activation session courrier | `AgenceComptabilitePage.tsx` | `activateCourierSessionAction` -> `activateCourierSession` | `courierSessions`, `agencyLiveState`, `agentHistory` | Conserver si le comptable est responsable de l'ouverture courrier |
| Suivi session courrier | `AgenceComptabilitePage.tsx` | `onSnapshot(courierSessions)`, `onSnapshot(shipments)`, `getCourierSessionLedgerTotal` | `courierSessions`, `shipments`, `financialTransactions` | Conserver |
| Consultation detail courrier | `AgenceComptabilitePage.tsx` | `loadCourierReportForSession` | `shipments` | Conserver en detail secondaire |
| Validation versement courrier | `AgenceComptabilitePage.tsx` | `validateCourierSessionAction` -> `validateCourierSession` | `courierSessions`, `financialTransactions`, `accounts`, `comptaEncaissements`, `dailyStats`, `agencyLiveState`, `agentHistory` | Conserver |
| Controle ventes vs caisse | `AgenceComptabilitePage.tsx` | `loadReconciliation` | `cashTransactions`, activite commerciale, `payments` | Conserver comme lecture |
| Controle caisse ledger | `AgenceComptabilitePage.tsx` | `reloadLedgerCashAudit` -> `getAgencyCashPosition`, `listAgencyCashAudits` | `accounts`, `financialTransactions`, `comptaEncaissements`, `cashAudits` | Conserver en lecture |
| Validation controle caisse | `AgenceComptabilitePage.tsx` | `handleValidateAgencyCash` -> `validateAgencyCash` | `cashAudits` | A revoir : non autorise pour `agency_accountant` seul |
| Depense caisse | `AgenceComptabilitePage.tsx` + `AgencyTreasuryNewOperationPage.tsx` | `submitExpense` -> `createExpense` | `expenses`, puis ledger selon workflow paiement/validation | Conserver si tresorerie agence reste dans Phase 1 |
| Versement compagnie | `AgencyTreasuryTransferPage.tsx` | `handleSubmit` -> `createTransferRequest` | `treasuryTransferRequests` | Conserver, mais workflow depend du chef |
| Validation/refus versement compagnie | `AgencyTreasuryTransferPage.tsx` | `handleApprove` / `handleReject` | `treasuryTransferRequests`, `financialTransactions`, `accounts` apres execution | Masquer au comptable, conserver pour chef |
| Paiement fournisseur / payable | `AgencyTreasuryNewPayablePage.tsx` | `handleCreateSupplier`, `handleCreate` | `suppliers`, `payables`, lectures `vehicles`, `agences` | A revoir : fonction tresorerie/fournisseur, pas coeur validation comptable |
| Export CSV caisse | `AgenceComptabilitePage.tsx` | `exportCsv` | aucune ecriture Firestore | Conserver |
| Consultation journal agents | Header `AgenceComptabilitePage.tsx` | navigation `/agence/comptabilite/journal-agents` | depend de `AgencyAgentHistoryPage` | Conserver en historique |
| Deconnexion | Header `AgenceComptabilitePage.tsx` | `logout`, `navigate('/login')` | auth, pas Firestore metier | Conserver |

## 4. Calculs financiers

Ne pas modifier ces calculs sans audit fonctionnel separe.

### Billets vendus

- KPI jour : `agencyStatsToday.totalTickets`, lu via `getAgencyStats(companyId, agencyId, todayKey, todayKey, agencyTz)`.
- Rapport poste : somme `(seatsGo || 0) + (seatsReturn || 0)` sur les reservations rattachees au poste par `belongsToGuichetSession`.
- Reconciliation jour : `activity.billets.guichet.tickets + activity.billets.online.tickets`.

### Ventes guichet

- Rapport poste : `totals.guichet.montant += t.amount` si `t.channel === 'guichet'`.
- Versement guichet : `amountAgg = agg.amount ?? s.totalAmount ?? 0`.
- Reconciliation : `ventesGuichet.montant = activity.billets.guichet.amount`.

### Ventes en ligne

- KPI jour : `agencyStatsToday.onlineTickets`.
- Rapport poste : `totals.en_ligne.montant += t.amount` si `t.channel === 'en_ligne'`.
- Reconciliation : `ventesEnLigne.montant = activity.billets.online.amount`.
- Remarque : dans le detail poste, `encaissement` est force a `agence` dans `mk`, meme si le libelle prevoit `Compte compagnie`. A revoir avant refonte UX pour eviter une information trompeuse.

### Courrier

- Carte/session active : `courierSessionStats[sessionId].paidAmount`, somme des montants de colis payes observes dans `shipments`.
- Montant attendu validation courrier : `expectedAmount = paidAmount > 0 ? paidAmount : courierLedgerBySessionId[sessionId]`.
- Ledger courrier : `getCourierSessionLedgerTotal` somme `financialTransactions` `payment_received` pour les colis de la session, fallback somme des `shipments` payes.
- Reconciliation jour : paiements `payments` filtres `agencyId`, `channel === 'courrier'`, `status === 'validated'`.

### Total encaisse / total ventes

- Rapport poste : `totals.montant = somme t.amount`.
- Controle/reconciliation :
  - `encaissementsEspeces` : somme `cashTransactions` source `guichet` avec payment contenant `cash` ou `esp`.
  - `encaissementsMobileMoney` : somme `cashTransactions` source `guichet` avec payment contenant `mobile` ou `mm`.
  - `encaissementsTotal = encaissementsEspeces + encaissementsMobileMoney`.
  - La carte "Total ventes" dans Controle affiche `ventesGuichet.montant + ventesEnLigne.montant`.

### Montant attendu

- Guichet validation comptable UI : `s.expectedAmount ?? s.totalCash ?? agg.cashExpected ?? payBy['espèces'] ?? s.cashExpected ?? 0`.
- Guichet service : `expectedCash = max(s.totalCash ?? s.amount ?? 0, report.totalCash ?? report.expectedAmount ?? report.montant ?? 0)`.
- Courrier validation : `paidAmount > 0 ? paidAmount : ledger`.
- Controle caisse : `expectedAmount = position.soldeCash`, donc solde ledger `accounts`, pas somme ventes.

### Montant recu

- Guichet : champ `receptionInputs[shift.id].cashReceived`, parse decimal, obligatoire si attendu > 0.
- Courrier : champ `receptionInputsCourier[session.id].countedAmount`, parse decimal, obligatoire.
- Controle caisse : champ `cashAuditActualInput`, parse decimal.

### Ecart

- Guichet UI : `ecart = cashReceived - cashExpectedAgg`.
- Guichet service : `computedDifference = receivedCashAmount - expectedCash`.
- Courrier UI/service : `difference = validatedAmount - ledgerSessionTotal`.
- Reconciliation : `ecart = ventesGuichet.montant - encaissementsTotal`.
- Controle caisse : `difference = actualAmount - expectedAmount`.

### Caisse

- Solde disponible global : `getAgencyCashPosition().soldeCash`, lu depuis `companies/{companyId}/accounts/agency_{agencyId}_cash.balance`.
- Entrees periode : `sumComptaEncaissementsInRange` sur `comptaEncaissements`.
- Sorties periode : `financialTransactions` confirmees dont debit = caisse agence et type `expense`, `refund`, `transfer`, `transfer_to_bank`.
- Historique jour : combinaison locale des sorties `financialTransactions` et entrees `comptaEncaissements`, agregee par date ISO.

## 5. Recommandation UX Phase 1

Structure cible recommandee, sans implementation :

1. `Tableau de bord`
   - KPI strictement comptables : sessions a valider, montant attendu guichet, montant attendu courrier, caisse ledger, anomalies/ecarts.
   - Raccourcis vers receptions a valider.

2. `Postes en service`
   - Suivi operationnel minimum : guichet actif/pause, courrier actif/pending.
   - Actions a discuter : garder activation courrier si c'est bien une responsabilite comptable ; masquer reprise guichet si le chef/superviseur doit la porter.

3. `Receptions a valider`
   - Fusionner l'actuel `Versements` autour des files guichet/courrier fermees.
   - Detail accessible a la demande, pas affiche comme experience principale.
   - Etat "Valide comptable, en attente chef" visible ici.

4. `Historique`
   - Historique caisse, journal agents, audits de caisse, sessions validees.
   - Export CSV ici.

Ne pas ajouter `Parametres` en Phase 1 : aucun onglet/fonction actuelle de parametrage comptable agence n'existe dans `/agence/comptabilite`.

Onglets actuels a supprimer/renommer en Phase 1 :

- `Corrections` : masquer tant qu'aucune action de correction n'existe.
- `Controle` : fusionner dans `Historique` ou `Tableau de bord` selon le public. Le bouton `Valider la caisse` doit etre reserve explicitement au chef/superviseur/admin.
- `Caisse` : conserver, mais renommer ou organiser comme `Historique caisse / Operations caisse`.
- `Ventes` : renommer `Postes en service` et retirer les rapports commerciaux trop larges du premier niveau.

## 6. Points de risque

- Ne pas casser le statut guichet : `pending -> active -> paused/closed -> validated_agency -> validated`.
- Ne pas casser le statut courrier : `PENDING -> ACTIVE -> CLOSED -> VALIDATED_AGENCY -> VALIDATED`.
- Ne pas confondre `validated_agency` avec validation finale chef : le comptable ne finalise pas le cycle.
- Ne pas remplacer le solde caisse par `comptaEncaissements - sorties` : le solde affiche est le ledger `accounts/agency_{agencyId}_cash`.
- Ne pas supprimer l'ecriture `comptaEncaissements` : elle alimente les entrees especes et l'historique de controle.
- Ne pas supprimer les ecritures ledger remittance : guichet et courrier creditent la caisse lors de la validation comptable.
- Ne pas modifier les calculs `expectedCash`, `computedDifference`, `difference` courrier, ni le fallback ledger courrier sans tests.
- Ne pas permettre au comptable de valider un controle caisse si la regle actuelle reserve cette action au chef/superviseur/admin.
- Ne pas exposer au comptable des actions chef : validation/refus de versement compagnie et validation finale chef.
- Ne pas melanger caisse operationnelle `cashTransactions` et verite financiere ledger `financialTransactions/accounts`.
- Ne pas casser les agregats `dailyStats` et `agencyLiveState`, utilises par d'autres pages.
- Ne pas casser `agentHistory`, car le journal est accessible depuis l'espace comptable.
- Ne pas oublier les anciennes URL de tabs : `receptions -> versements`, `reconciliation/encaissements -> audit`.
- Risque UX actuel : `agency_accountant` voit `Ventes` par defaut alors que l'objectif principal est souvent `Versements`.
- Risque donnees actuel : le rapport poste force `encaissement = 'agence'` pour toutes les reservations affichees ; a clarifier avant de s'en servir comme verite comptable.
