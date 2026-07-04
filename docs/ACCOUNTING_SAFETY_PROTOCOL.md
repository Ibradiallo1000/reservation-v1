# ACCOUNTING SAFETY PROTOCOL — TELIYA

Ce document est obligatoire avant toute modification touchant la comptabilité, les validations de sessions, les comptes agence, les ledgers, les tableaux de bord financiers ou les règles Firestore.

## 1. Fichiers critiques

Ces fichiers sont critiques niveau comptable :

- src/modules/agence/services/sessionService.ts
- firestore.rules
- tout service qui écrit dans companies/{companyId}/accounts
- tout service qui écrit dans accounts/{accountId}/ledger
- tout service lié à la caisse agence, pending_cash, company_clearing, dépenses, transferts, validations comptables

## 2. Principe absolu

Ne jamais modifier un moteur comptable pour corriger une simple UI.

Les tableaux de bord chef d’agence, chef comptable, admin compagnie et CEO doivent lire les données comptables existantes.
Ils ne doivent pas réécrire les workflows stabilisés.

## 3. Invariants à préserver

La validation comptable d’un poste doit toujours respecter :

- pending_cash absent : création avec payload complet
- pending_cash existant + solde changé : update balance + updatedAt uniquement
- pending_cash existant + solde identique : aucune écriture
- agency_cash augmente exactement du montant reçu
- cash_ledger est créé une seule fois
- shift passe à validated_agency
- shiftReport est mis à jour
- aucune écriture secondaire ne doit bloquer la validation

## 4. Interdictions

Interdit sans validation explicite :

- remplacer update() par set() sur un document comptable existant
- faire un set complet sur agency_cash, pending_cash ou company_clearing si le document existe déjà
- modifier les règles Firestore pour “faire passer” une erreur sans identifier le path exact
- élargir les droits avec allow write global
- ajouter des écritures UI dans une transaction comptable
- modifier les montants, soldes ou ledger sans test complet
- toucher aux workflows courrier/billetterie stabilisés sans audit comparatif

## 5. Transactions comptables

Une transaction comptable doit rester minimale.

Autorisé dans la transaction :
- shift
- shiftReport
- pending_cash
- agency_cash
- ledger

À sortir de la transaction si possible :
- dailyStats
- agencyLiveState
- cashReceipts
- comptaEncaissements
- caches UI
- historiques d’affichage
- agrégats non critiques

Les écritures secondaires doivent être non bloquantes si elles ne sont pas indispensables au solde comptable.

## 6. Règles Firestore

Avant toute modification de firestore.rules :

1. Identifier le path exact.
2. Identifier l’opération exacte : get, list, create, update, delete.
3. Identifier le payload exact.
4. Vérifier si le problème vient du code ou des rules.
5. Tester isolément la règle si possible.
6. Ne modifier que la règle ciblée.
7. Ne jamais ouvrir plus de droits que nécessaire.

### Limite d’évaluation des Rules

Une règle peut être correcte sur le plan métier et néanmoins échouer à l’exécution si elle dépasse la limite d’évaluation de Firestore Rules.

Le symptôme côté application peut être un `permission-denied` alors que le rôle, la compagnie, l’agence et l’autorisation métier sont corrects. Le Rules Emulator peut alors afficher :

`maximum of 1000 expressions reached`

Dans ce cas :

- ne pas élargir les droits ;
- ne pas ajouter une permission globale pour contourner le refus ;
- simplifier les branches évaluées ;
- ajouter des gardes rapides et déterministes par `accountId` ;
- éviter les gros `OR` et les helpers coûteux sans rapport avec le document demandé ;
- tester le scénario complet dans le Rules Emulator, y compris les cas autorisés et refusés.

### Diagnostic avant correction

Avant toute correction d’un refus Firestore :

- identifier le document exact refusé et son path complet ;
- identifier l’opération exacte : `get`, `list`, `create`, `update` ou `delete` ;
- si `lastStep = null`, suspecter en priorité une lecture initiale refusée ;
- comparer systématiquement la console applicative, le résultat du Rules Emulator et les documents réellement présents dans Firestore ;
- ne jamais traiter uniquement le symptôme affiché dans l’UI.

## 7. Protocole avant modification

### Consultation obligatoire

Avant toute modification comptable, lire obligatoirement et intégralement :

- `docs/ACCOUNTING_SAFETY_PROTOCOL.md`
- `docs/KNOWN_BUGS_AND_FIXES.md`

Avant de modifier un fichier critique, répondre d’abord :

- Quel workflow est concerné ?
- Quels fichiers vont être modifiés ?
- Quels documents Firestore seront lus ?
- Quels documents Firestore seront écrits ?
- Est-ce une lecture UI ou une écriture métier ?
- Est-ce que cela touche agency_cash, pending_cash, company_clearing ou ledger ?
- Quel risque existe sur la validation comptable ?

Si une réponse est incertaine, faire un audit sans modification.

## 8. Tests obligatoires après modification

Après toute modification comptable :

- npm run build
- ouvrir un poste guichet
- clôturer le poste
- valider par le comptable
- vérifier status = validated_agency
- vérifier accountantValidated = true
- vérifier agency_cash augmenté du bon montant
- vérifier ledger créé
- vérifier aucun permission-denied
- vérifier affichage dans tableau de bord, caisse, historique
- valider la comptabilité agence
- vérifier le `get` de `agency_cash`
- vérifier la validation d’un poste billetterie
- vérifier la validation d’un poste courrier
- vérifier le versement agence vers banque
- vérifier le paiement online Mobile Money
- vérifier les vues Chef Comptable : Dashboard, Trésorerie, Flux et Rapports

## 9. Alignements futurs

Les futurs alignements concernent :

- chef d’agence
- chef comptable compagnie
- admin compagnie
- CEO

Ces espaces doivent prioritairement faire de la lecture, de l’agrégation et de l’affichage.

Ils ne doivent pas modifier les écritures comptables stabilisées sauf besoin métier explicite et validé.

### Comptabilité Chef Comptable

Dashboard, Trésorerie, Flux et Rapports sont exclusivement des vues de lecture, d’agrégation et d’affichage.

Ces vues ne doivent jamais créer, compléter, réparer ou rejouer des écritures financières.

Si une somme manque dans Rapports, vérifier d’abord :

- les documents `financialTransactions` attendus ;
- le document ou la clé d’idempotence du workflow source ;
- les champs temporels utilisés par la période affichée.

Ne jamais reconstruire la somme manquante depuis les réservations ou les paiements dans une vue Chef Comptable.

## 10. Règle de décision

Si une modification peut casser la validation comptable, ne pas la faire directement.

Faire d’abord :
1. audit,
2. diagnostic,
3. proposition,
4. validation humaine,
5. correction minimale,
6. test complet.

### Régularisation historique

Ne jamais régulariser automatiquement la comptabilité depuis les réservations et ne jamais lancer de backfill sans audit préalable.

Pour un paiement validé mais non comptabilisé, vérifier obligatoirement :

- la réservation existe et son statut est `confirme` ;
- le paiement existe et son statut est `validated` ;
- la `financialTransaction` attendue est absente ;
- le document ou la clé d’idempotence attendu est absent ;
- le compte cible existe, ou sa création est explicitement contrôlée par la procédure.

La régularisation doit :

- écrire uniquement les mouvements réellement manquants ;
- utiliser une idempotence obligatoire et déterministe ;
- préserver les mouvements et soldes déjà présents ;
- s’arrêter immédiatement dès qu’une incohérence apparaît entre réservation, paiement, transaction, idempotence ou comptes.

### Séparation du flux futur et de la correction historique

Une correction du flux futur ne doit jamais modifier les anciennes données.

Les données historiques doivent être traitées par une procédure séparée, auditée, explicitement validée et testée sur un périmètre contrôlé.

Ne jamais rejouer une validation métier déjà confirmée. Une régularisation historique ne doit créer que l’écriture financière manquante après vérification de tous les invariants.

## 11. Phase 1 — Dépenses directes agence sur Firebase Spark

### Décision d’architecture

La Phase 1 des dépenses agence doit être compatible avec Firebase Spark.

- aucune Cloud Function ne doit être utilisée ;
- le compte global `company_clearing` ne doit pas être utilisé pour ce flux ;
- toute dépense exécutée doit conserver une contrepartie comptable ;
- le compte technique de contrepartie est propre à l’agence :
  `companies/{companyId}/accounts/agency_{agencyId}_expense_clearing`.

Une dépense sans contrepartie est interdite.

### Dépense sous le seuil

Pour une dépense inférieure ou égale au seuil défini par l’admin compagnie, un commit atomique doit :

1. créer la dépense avec le statut `paid` ;
2. diminuer `agency_{agencyId}_cash` du montant exact ;
3. augmenter `agency_{agencyId}_expense_clearing` du même montant ;
4. créer une `financialTransaction` équilibrée ;
5. créer le document d’idempotence correspondant.

Les identifiants sont déterministes :

- `expenseId` est généré avant le commit ;
- `transactionId = expense_{expenseId}` ;
- `idempotencyKey = expense_{expenseId}`.

Un simple update de `balance` non vérifié par les règles atomiques est interdit.

### Dépense au-dessus du seuil

Pour une dépense supérieure au seuil défini par l’admin compagnie :

- la dépense est créée avec le statut `pending_manager` ;
- aucun compte n’est débité ou crédité ;
- aucune `financialTransaction` n’est créée ;
- aucun document d’idempotence financière n’est créé.

### Validation obligatoire avant exposition UI

Le commit complet doit être testé avec Firebase Rules Emulator avant toute activation dans l’interface.

Les tests doivent vérifier ensemble :

- la dépense ;
- le débit de `agency_cash` ;
- le crédit de `agency_expense_clearing` ;
- la `financialTransaction` ;
- l’idempotence ;
- l’isolation stricte par compagnie et par agence.

Tester les écritures séparément ne suffit pas.

### Conditions no-go

L’implémentation doit être arrêtée si :

- le commit dépasse les limites d’évaluation des Firestore Rules ;
- le seuil admin compagnie est absent ou invalide ;
- un double clic peut générer deux dépenses ou deux mouvements ;
- un solde peut être modifié sans dépense et transaction correspondantes ;
- une divergence apparaît entre `expenses`, `accounts` et `financialTransactions`.

### Fichiers critiques de cette phase

Les fichiers suivants sont protégés et exigent audit, validation humaine et tests ciblés avant modification :

- `src/modules/agence/services/sessionService.ts`
- `firestore.rules`
- `src/modules/compagnie/treasury/expenses.ts`
- `src/modules/compagnie/treasury/ledgerAccounts.ts`
- `src/modules/agence/treasury/pages/AgencyTreasuryNewOperationPage.tsx`
- `src/modules/agence/manager/ManagerExpensesPage.tsx`
- `src/modules/compagnie/finances/pages/DepensesPage.tsx`

Fin du protocole.
