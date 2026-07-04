# KNOWN BUGS AND FIXES — TELIYA

Ce document est la mémoire technique permanente des incidents importants du projet.

Il doit être consulté avant toute correction. Après la résolution d'un bug important, il doit être mis à jour avec la cause démontrée, la correction réellement appliquée et les vérifications effectuées.

# Procédure obligatoire avant toute correction

Toujours suivre cet ordre :

1. Identifier précisément le symptôme.
2. Lire entièrement la console.
3. Identifier le document Firestore concerné.
4. Identifier la collection.
5. Identifier le fichier responsable.
6. Comparer avec `docs/KNOWN_BUGS_AND_FIXES.md`.
7. Si le problème existe déjà, appliquer la correction existante.
8. Sinon, faire un audit complet.
9. Attendre une validation explicite avant toute modification des fichiers protégés.

Ne jamais modifier les Rules ou un moteur comptable sur la base d'une hypothèse. Pour un `permission-denied`, identifier d'abord le path, l'opération, le rôle, le payload et la condition refusée.

# Comptabilité

--------------------------------------------------

BUG-001

Date

2026-07-04

Module concerné

Validation comptable d'un poste agence

Symptôme

Le comptable agence ne pouvait plus valider un poste. La validation échouait avant la première écriture.

Console

`validateSessionByAccountant failed: Missing or insufficient permissions`

`lastStep: null`

Cause exacte

La lecture initiale de `companies/{companyId}/accounts/agency_{agencyId}_cash` était refusée. L'évaluation du bloc `accounts/{accountId}` dépassait la limite Firestore de 1000 expressions avant d'atteindre une autorisation valide.

Pourquoi ce n'était PAS :

- un mauvais rôle : le rôle réel était `agency_accountant` ;
- un mauvais `companyId` ou `agencyId` ;
- un problème de montant ou de calcul de caisse ;
- une écriture ledger refusée, car aucune écriture n'avait encore commencé.

Correction appliquée

Réorganisation du bloc `accounts/{accountId}` avec des gardes rapides par type d'identifiant. Fusion des branches `allow update` et priorité au flux de validation identifié par `lastAccountantValidationShiftId`. Suppression d'une branche ledger redondante.

Fichiers modifiés

- `firestore.rules`
- `tests/firestore/agencySessionAccountantValidation.rules.test.cjs`

Impact métier

La lecture de la caisse et le commit comptable complet de validation redeviennent autorisés pour le comptable de sa propre agence.

Points de vigilance

- tester le commit complet, pas seulement chaque write isolément ;
- surveiller la limite des 1000 expressions ;
- conserver les gardes simples avant les helpers transactionnels.

Ne plus refaire

- ajouter plusieurs `allow` coûteux sur `accounts/{accountId}` sans test Emulator complet ;
- modifier `sessionService.ts` pour contourner un refus provenant des Rules.

--------------------------------------------------

# Firestore Rules

--------------------------------------------------

BUG-002

Date

2026-07-04

Module concerné

Firestore Rules — comptes financiers

Symptôme

Un simple GET du compte caisse et plusieurs transactions comptables retournaient `permission-denied` malgré des autorisations métier présentes dans le fichier.

Console

`Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached`

Cause exacte

Le bloc `accounts/{accountId}` était devenu trop complexe après l'ajout des flux versement banque et paiement online. Les helpers sans rapport avec le compte demandé étaient tout de même évalués.

Pourquoi ce n'était PAS :

- une règle GET absente ;
- un document `agency_cash` absent ;
- un ancien bundle frontend ;
- un défaut du SDK Firestore.

Correction appliquée

Ajout de courts-circuits sur `agency_*_cash`, `agency_*_pending_cash`, `company_bank_*`, `company_mobile_money` et `company_clearing`. Les helpers coûteux ne sont appelés que si le marqueur déterministe de leur workflow est présent.

Fichiers modifiés

- `firestore.rules`
- tests Rules Emulator ciblés

Impact métier

Les workflows caisse, validation de session, versement banque et paiement online coexistent sans ouvrir de permission globale.

Points de vigilance

- une règle qui compile peut encore dépasser la limite à l'exécution ;
- les scénarios ALLOWED et DENIED doivent tous être testés ;
- les branches communes doivent être ordonnées du cas le plus spécifique au plus général.

Ne plus refaire

- empiler des `allow create/update/get` indépendants et coûteux dans un même match ;
- considérer qu'un `permission-denied` signifie toujours qu'une permission manque.

--------------------------------------------------

# Versements et banques

--------------------------------------------------

BUG-003

Date

2026-07-04

Module concerné

Versement agence vers banque compagnie

Symptôme

L'enregistrement d'un versement direct échouait lorsque le compte ledger de la banque sélectionnée n'existait pas encore.

Console

Erreur de transaction ou document de destination absent sur `companies/{companyId}/accounts/company_bank_*`.

Cause exacte

Le workflow supposait que le compte `company_bank_*` avait déjà été initialisé.

Pourquoi ce n'était PAS :

- un solde caisse incorrect ;
- une validation du chef d'agence manquante ;
- une raison pour réintroduire `pending_manager`.

Correction appliquée

Création atomique du compte banque manquant dans le même commit que le débit caisse, le crédit banque, la `financialTransaction`, la trace de transfert et l'idempotence.

Fichiers modifiés

- `src/modules/agence/treasury/transferRequestsService.ts`
- `firestore.rules`
- `tests/firestore/agencyBankDepositDirect.rules.test.cjs`

Impact métier

Le comptable peut enregistrer directement un versement agence vers une banque compagnie configurée, sans validation chef.

Points de vigilance

- le compte créé doit rester un compte compagnie avec `agencyId: null` ;
- le débit, le crédit, la transaction et l'idempotence doivent être atomiques ;
- aucune ancienne demande `pending_manager` ne doit être migrée automatiquement.

Ne plus refaire

- créer le compte banque depuis l'UI ;
- exécuter le débit et le crédit dans des commits séparés.

--------------------------------------------------

# Mobile Money

--------------------------------------------------

BUG-004

Date

2026-07-04

Module concerné

Validation de paiement online par l'opérateur digital

Symptôme

Les réservations online étaient confirmées, mais la Trésorerie Chef Comptable affichait Mobile Money à zéro.

Console

Aucune erreur comptable obligatoire : aucune `financialTransaction` n'était créée pour le paiement validé.

Cause exacte

Le workflow opérateur digital confirmait le paiement et la réservation sans comptabiliser l'encaissement dans le moteur financier.

Pourquoi ce n'était PAS :

- un calcul incorrect dans la page Trésorerie ;
- un solde à recalculer depuis les réservations ;
- un compte Mobile Money propre à l'agence.

Correction appliquée

Création idempotente d'une transaction `payment_received` : débit de `company_clearing` et crédit de `company_mobile_money`. `agencyId` reste un rattachement analytique.

Fichiers modifiés

- `src/services/onlinePaymentOperatorService.ts`
- `src/modules/compagnie/treasury/financialTransactions.ts`
- `firestore.rules`
- `tests/firestore/operatorDigitalOnlineMobileMoney.rules.test.cjs`

Impact métier

Les futurs paiements online validés alimentent le patrimoine Mobile Money de la compagnie sans créditer une caisse agence.

Points de vigilance

- idempotence obligatoire ;
- ne jamais utiliser `agency_{agencyId}_mobile_money` pour un paiement online ;
- aucun backfill implicite des transactions historiques.

Ne plus refaire

- recalculer le solde Mobile Money depuis les réservations dans l'UI ;
- additionner réservations et `financialTransactions`.

--------------------------------------------------

BUG-005

Date

2026-07-04

Module concerné

Identification du portefeuille Mobile Money

Symptôme

Un paiement effectué via Sarali apparaissait comme Wave ou comme « Mobile Money non identifié » dans les rapports.

Console

La transaction contenait une valeur issue de `payments.provider` au lieu du portefeuille réellement choisi.

Cause exacte

`payments.provider` pouvait contenir un fallback technique historique différent de `reservation.preuveVia`. La source métier fiable était `reservation.preuveVia`.

Pourquoi ce n'était PAS :

- un problème du compte global `company_mobile_money` ;
- une erreur d'addition dans les rapports ;
- une raison pour créer un compte ledger par fournisseur.

Correction appliquée

Pour les nouveaux paiements, résolution et normalisation du fournisseur depuis `reservation.preuveVia`, puis stockage dans `financialTransactions.paymentProvider` et les métadonnées associées.

Fichiers modifiés

- `src/services/onlinePaymentOperatorService.ts`
- affichage de reporting concerné pour le regroupement par `paymentProvider`

Impact métier

Les nouveaux mouvements Mobile Money peuvent être répartis par Sarali, Wave, Orange Money ou Moov sans modifier le solde ledger global.

Points de vigilance

- les anciennes transactions restent inchangées ;
- ne pas faire de backfill automatique ;
- le total des fournisseurs doit rester égal au total Mobile Money.

Ne plus refaire

- considérer `payments.provider` comme fiable lorsque `reservation.preuveVia` existe ;
- réécrire une transaction déjà protégée par l'idempotence.

--------------------------------------------------

# Rapports Chef Comptable

--------------------------------------------------

BUG-006

Date

2026-07-04

Module concerné

Rapports financiers Chef Comptable

Symptôme

Le patrimoine et la Trésorerie étaient cohérents, mais les entrées de la période dans Rapports étaient incomplètes.

Console

Pas nécessairement d'erreur : certaines transactions n'entraient pas dans la période calculée.

Cause exacte

La lecture de période reposait uniquement sur `performedAt`. Les documents historiques ou certains flux ne possédant que `createdAt` étaient ignorés.

Pourquoi ce n'était PAS :

- un solde ledger incorrect ;
- une transaction Mobile Money absente lorsque le compte était déjà crédité ;
- une raison pour additionner directement les réservations.

Correction appliquée

Alignement de la lecture de période sur le contrat des transactions financières, avec prise en compte contrôlée du champ temporel de repli prévu pour les documents historiques.

Fichiers modifiés

- page ou service de lecture des Rapports Chef Comptable concerné

Impact métier

Les rapports de période reflètent les transactions financières disponibles sans modifier le patrimoine ni les comptes.

Points de vigilance

- `financialTransactions` reste la source unique ;
- ne jamais additionner une transaction et sa réservation source ;
- documenter clairement le champ temporel principal et son fallback.

Ne plus refaire

- filtrer silencieusement toutes les transactions sur un champ temporel unique sans vérifier les données historiques.

--------------------------------------------------

# Réservations

--------------------------------------------------

BUG-007

Date

2026-07-04

Module concerné

Liste des réservations agence

Symptôme

Les réservations online validées n'apparaissaient plus dans la liste agence alors que le paiement et la réservation existaient.

Console

Aucune erreur Firestore nécessaire : les documents étaient exclus par le filtre local.

Cause exacte

La page attendait principalement le statut « payé », alors que le workflow online validé écrivait le statut « confirmé ».

Pourquoi ce n'était PAS :

- une réservation créée dans la mauvaise agence ;
- une permission Firestore manquante ;
- une absence de document payment.

Correction appliquée

Inclusion du statut `confirme` dans la liste agence. Pour une réservation online validée, utilisation de `ticketValidatedAt` comme date principale et de `createdAt` comme fallback.

Fichiers modifiés

- `src/modules/agence/pages/AgenceReservationsPage.tsx`

Impact métier

Les réservations online confirmées restent visibles sans casser les réservations guichet existantes.

Points de vigilance

- distinguer statut de réservation et statut de paiement ;
- conserver les fallbacks historiques ;
- ne pas modifier le workflow opérateur pour corriger un filtre d'affichage.

Ne plus refaire

- supposer qu'une réservation validée porte toujours le statut `paid` ou `paye` ;
- corriger les données Firestore lorsqu'un filtre UI est responsable.

--------------------------------------------------

# Comptable Agence

Les incidents `BUG-001`, `BUG-002` et `BUG-003` sont les références prioritaires pour les erreurs de caisse, de validation de poste et de versement banque.

# Opérateur Digital

Les incidents `BUG-004` et `BUG-005` sont les références prioritaires pour la comptabilisation et l'identification des paiements online Mobile Money.

# Chef Comptable

Les incidents `BUG-004`, `BUG-005` et `BUG-006` sont les références prioritaires pour la cohérence entre patrimoine, trésorerie et rapports.

# Chef d'Agence

Avant de corriger une incohérence de supervision, vérifier d'abord que la source métier existe et que la page ne reconstruit pas une logique comptable ou opérationnelle différente.

# Billetterie

La validation des postes billetterie doit conserver les invariants définis dans `docs/ACCOUNTING_SAFETY_PROTOCOL.md`.

# Courrier

Le workflow courrier stabilisé ne doit pas être modifié pour corriger un problème propre à la billetterie, aux dépenses ou au reporting.

# Ledger

Les comptes et `financialTransactions` sont les sources de vérité financières. Aucun écran ne doit recalculer un solde alternatif depuis les réservations, les paiements ou les agrégats UI.

# PWA

Avant d'attribuer une régression au cache :

- vérifier le hash du bundle chargé ;
- rechercher le marqueur de code attendu dans `dist` ;
- vérifier le manifeste du service worker ;
- distinguer une ancienne interface d'un refus Firestore côté serveur.

# Fichiers protégés

Ces fichiers sont sensibles et ne doivent jamais être modifiés sans audit préalable et validation explicite :

- `firestore.rules`
- `src/modules/agence/services/sessionService.ts`
- `src/modules/compagnie/treasury/financialTransactions.ts`
- `src/modules/compagnie/treasury/ledgerAccounts.ts`
- `src/services/paymentService.ts`
- `src/services/onlinePaymentOperatorService.ts`
- `src/modules/agence/treasury/transferRequestsService.ts`
- `src/modules/agence/cashStatement/agencyCashStatementService.ts`
- tout service écrivant dans `companies/{companyId}/accounts`
- tout service écrivant dans `accounts/{accountId}/ledger`
- tout service lié à `agency_cash`, `pending_cash`, `company_clearing`, aux dépenses, aux transferts ou aux validations comptables
- tous les autres fichiers protégés définis dans `docs/ACCOUNTING_SAFETY_PROTOCOL.md`

Avant toute intervention sur ces fichiers, appliquer le protocole d'audit, de diagnostic, de validation humaine, de correction minimale et de test complet.
