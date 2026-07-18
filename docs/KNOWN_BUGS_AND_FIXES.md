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

BUG-010

Date

2026-07-12

Module concerné

Firestore Rules — versement bancaire direct agence et paiement online Mobile Money

Symptôme

Le test Rules Emulator du versement bancaire direct agence échouait avec une limite d'évaluation Firestore Rules :

`Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached`

Après optimisation du versement bancaire, le scénario Mobile Money online a également révélé que des branches non liées pouvaient être évaluées trop tôt si elles n'étaient pas protégées par un marqueur déterministe du workflow.

Cause exacte

Les blocs `accounts/{accountId}`, `financialTransactions/{transactionId}` et `financialTransactionIdempotency/{key}` contenaient plusieurs branches transactionnelles coûteuses capables d'être évaluées pour des écritures sans rapport direct. Certaines conditions répétaient aussi des `getAfter(...)` sur les mêmes documents.

Deux confusions techniques augmentaient le risque :

- le paiement online Mobile Money identifie la transaction par un id `tx_*`, alors que la clé d'idempotence porte le préfixe `payment_received_*` ;
- certains contrôles satellites pouvaient relire l'écriture principale avec `existsAfter(...)`, créant une dépendance circulaire inutile dans le commit atomique.

Correction appliquée

Ajout de gardes déterministes avant les helpers coûteux :

- `agency_transfer_*` pour les versements agence ;
- `payment_received_*` pour les clés d'idempotence Mobile Money ;
- `type == 'payment_received'` pour les transactions financières Mobile Money ;
- comptes compagnie Mobile Money et clearing isolés des branches génériques ;
- compte `agency_*_pending_cash` protégé avant d'appeler le legacy helper.

Les validations ont été simplifiées en chargeant une seule fois les documents `getAfter(...).data` lorsque possible. Les helpers Mobile Money online ont été séparés entre création et mise à jour de comptes pour éviter l'accès à `resource.data` sur une création. Le contrôle de seuil des dépenses directes agence a été conservé explicitement afin de ne pas ouvrir un flux au-dessus du seuil autorisé.

Fichiers modifiés

- `firestore.rules`
- `docs/KNOWN_BUGS_AND_FIXES.md`

Impact métier

Le versement bancaire direct agence et le paiement online Mobile Money restent autorisés uniquement pour leurs rôles et écritures attendus, sans élargir les permissions globales ni modifier les données Firestore.

Vérifications effectuées

- test Rules Emulator ciblé `agencyBankDepositDirect.rules.test.cjs` : OK ;
- test Rules Emulator ciblé `operatorDigitalOnlineMobileMoney.rules.test.cjs` : OK ;
- `npm run test:rules` : OK ;
- `npm run test:run` : OK ;
- `npm run build` : OK.

Ne plus refaire

- protéger une transaction Mobile Money par le préfixe du `transactionId` lorsque le préfixe métier est porté par la clé d'idempotence ;
- ajouter une branche Rules coûteuse sans garde déterministe simple ;
- ajouter un `existsAfter(...)` satellite qui relit inutilement la même écriture atomique.

--------------------------------------------------

BUG-009

Date

2026-07-10

Module concerné

Validation comptable d'une session agence

Symptôme

La validation d'une session billetterie clôturée par le comptable agence échouait au commit avec :

`FirebaseError: Missing or insufficient permissions`

Le dernier `lastStep` journalisé était `set_cash_ledger` sur :

`companies/{companyId}/accounts/agency_{agencyId}_cash/ledger/session_{shiftId}_accountant_validation`

Cause exacte

La transaction complète exécutait atomiquement `pending_cash`, `shift`, `shiftReport`, `agency_cash` et le ledger caisse. Les règles `agency_cash` et ledger relisaient plusieurs fois le même `shift` après transaction avec `existsAfter(shiftPath)` puis plusieurs `getAfter(shiftPath)`, ce qui augmentait le risque d'atteindre la limite d'évaluation Firestore Rules déjà documentée dans `BUG-001` et `BUG-002`.

Mauvais diagnostic à éviter

Ne jamais conclure que `set_cash_ledger` est la cause uniquement parce qu'il apparaît comme `lastStep`. Dans un commit atomique, une seule écriture ou condition Rules refusée rejette toute la transaction.

Correctif appliqué

Ajout du helper `accountantValidationShiftAfterOk(companyId, agencyId, shiftId, amount)` dans `firestore.rules`. Il charge une seule fois le `shift` après transaction avec `getAfter(...).data`, puis vérifie le statut final, le montant reçu et `validationAudit.validatedBy.id`.

Le helper est utilisé par :

- `agencyAccountantCanPostCashBalance()`;
- `accounts/{accountId}/ledger/{ledgerId}`.

Test associé

`tests/firestore/agencySessionAccountantValidation.rules.test.cjs`

Le test reproduit la transaction réelle avec `runTransaction()`, les lectures préalables, `pendingCashLedgerVersion: 1`, le payload runtime, un cas autorisé et les refus autre agence, banque, Mobile Money, autre compte compagnie, suppression ledger et update arbitraire.

État du déploiement

Tests émulateur, TypeScript et build : OK. Déploiement production et validation réelle dans l'application : à confirmer uniquement après `Deploy complete!`.

Rapport détaillé

Voir `docs/AGENCY_ACCOUNTANT_RUNTIME_DEBUG.md`, section `Incident du 2026-07-10 - Validation comptable d'une session - 403 Missing or insufficient permissions`.

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

BUG-008

Date

2026-07-04

Module concerné

Paiements online Mobile Money — cohérence entre agence, trésorerie et rapports

Symptôme

Les paiements online étaient validés, mais les vues affichaient trois montants différents :

- Chef d'agence : 19 000 FCFA ;
- Trésorerie Chef Comptable : 12 000 FCFA ;
- Flux financiers et Rapports : 5 000 FCFA.

Après régularisation comptable, la ventilation analytique affichait encore :

- Sarali : 14 000 FCFA ;
- Mobile Money non identifié : 5 000 FCFA.

Console

Les validations historiques ne produisaient pas nécessairement une erreur métier visible. Les documents attendus étaient absents dans :

- `financialTransactions` ;
- `financialTransactionIdempotency`.

Cause exacte

Deux paiements online validés de 7 000 FCFA n'avaient créé ni leur `financialTransaction` ni leur document d'idempotence pendant la période où les Firestore Rules dépassaient leur limite d'évaluation.

Une transaction historique de 5 000 FCFA était comptabilisée, mais conservait un fournisseur technique incorrect et aucun marqueur de provenance fiable :

- `paymentProvider = wave` ;
- `metadata.paymentProviderSource` absent.

Pourquoi ce n'était PAS :

- un mauvais calcul de la Trésorerie ;
- un solde à reconstruire depuis les réservations ;
- une raison pour modifier directement `accounts/company_mobile_money` ;
- une raison pour additionner les réservations et les `financialTransactions` ;
- une seule anomalie : l'absence d'écritures comptables et l'étiquette fournisseur incorrecte étaient deux problèmes distincts.

Correction appliquée

Une régularisation contrôlée et idempotente a créé uniquement les deux écritures comptables manquantes :

- débit de `company_clearing` ;
- crédit de `company_mobile_money` ;
- création des deux `financialTransactions` ;
- création des deux documents d'idempotence.

Une correction analytique séparée a ensuite mis à jour uniquement les champs fournisseur de la transaction historique :

- `paymentProvider` ;
- `metadata.provider` ;
- `metadata.paymentProvider` ;
- `metadata.paymentProviderSource`.

Aucun montant, compte, solde, statut, type ou champ temporel n'a été modifié pendant cette correction analytique.

Fichiers modifiés

- `scripts/regularizeHistoricalOnlinePayments.cjs`
- `docs/KNOWN_BUGS_AND_FIXES.md`

Documents régularisés

- paiements `fy2oEA0EguCBOJbzPcad` et `n1BRa9XUJCX7dzYopuW7` ;
- transaction analytique historique `financialTransactions/Hvzsb8kzJ5c5E4l5D0UP`.

Impact métier

Les vues sont redevenues cohérentes :

- Flux financiers et Rapports : 19 000 FCFA ;
- ventilation Sarali : 19 000 FCFA ;
- Mobile Money non identifié : 0 FCFA ;
- solde `company_mobile_money` : 26 000 FCFA.

Points de vigilance

- comparer systématiquement `reservations`, `payments`, `financialTransactions`, `financialTransactionIdempotency` et `accounts/company_mobile_money` ;
- vérifier l'absence de transaction sous un identifiant auto-généré, pas seulement sous la clé d'idempotence ;
- exécuter un dry-run avant toute régularisation historique ;
- contrôler les soldes avant et après sans les recalculer depuis les réservations ;
- séparer la réparation d'une écriture comptable manquante de la correction d'une métadonnée analytique.

Ne plus refaire

- modifier directement un solde pour corriger un problème d'affichage ;
- lancer un backfill global pour quelques paiements identifiés ;
- confondre `payment.provider` avec `reservation.preuveVia` ;
- corriger simultanément une anomalie comptable et une anomalie analytique sans contrôles séparés ;
- exécuter une régularisation sans idempotence ni dry-run préalable.

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

# Sécurité Firestore

--------------------------------------------------

BUG-008

Date

2026-07-18

Module concerné

Firestore Rules - collection globale `users/{userId}`

Symptôme

Les règles autorisaient un utilisateur authentifié à créer ou modifier son propre document `users/{uid}` sans verrouillage strict des champs de rôle et de rattachement.

Cause exacte

Le bloc global `users/{userId}` autorisait `create` et `update` lorsque `request.auth.uid == userId`, alors que les helpers d'autorisation `getUserRole()` et `hasUserRole()` utilisent ce même document comme source de rôle.

Risque

Un utilisateur pouvait potentiellement écrire un rôle ou un rattachement privilégié dans son propre document, puis bénéficier des règles qui lisent `users/{uid}`.

Correction appliquée

Les écritures `users/{userId}` sont désormais réservées aux administrateurs autorisés. Les mises à jour personnelles sont limitées aux champs de notification push, sans modification possible des champs sensibles.

Champs sensibles protégés

- `role`
- `roles`
- `companyId`
- `compagnieId`
- `companyIds`
- `agencyId`
- `agenceId`
- `agencyIds`
- `permissions`
- `isAdmin`
- `active`
- `status`
- `disabled`
- `enabled`
- `claims`
- `customClaims`
- `accessScope`
- `accessScopes`
- `managedCompanyIds`

Tests ajoutés

- `tests/firestore/usersPrivilegeEscalation.rules.test.cjs`

Ne plus refaire

- autoriser une écriture personnelle sur un document qui sert lui-même de source d'autorisation ;
- laisser un utilisateur modifier son rôle, sa compagnie, son agence, ses permissions ou son statut via le frontend ;
- ouvrir `users list` à tout utilisateur authentifié.

--------------------------------------------------

BUG-011

Date

2026-07-18

Module concerné

Firestore Rules - collection publique `publicReservations/{docId}`

Symptôme

La collection publique utilisée pour retrouver une réservation par token autorisait `get`, `create` et `update` à tout le monde sans validation de forme ni contrôle du document source.

Cause exacte

Le bloc `publicReservations/{docId}` contenait `allow get, create, update: if true`. Cette règle préservait le parcours public, mais elle permettait aussi de créer un miroir public arbitraire ou de modifier un miroir existant sans limiter les champs.

Risque

Un visiteur pouvait tenter de falsifier un miroir public avec un faux état de réservation, une autre compagnie, une autre agence, une référence de paiement ou un statut confirmé visible sur les pages publiques.

Scénario d'exploitation

Un acteur externe pouvait écrire directement dans `publicReservations/{token}` ou `publicReservations/{reservationId}` et injecter des champs non prévus. Si le token ou l'identifiant était connu, le client pouvait voir une information publique altérée.

Collections concernées

- `publicReservations/{docId}`
- lecture de cohérence vers `companies/{companyId}/agences/{agencyId}/reservations/{reservationId}` lors des créations publiques

Rôles concernés

- visiteur non authentifié ;
- opérateur digital ;
- admin plateforme.

Correction appliquée

Les lectures publiques `get` restent autorisées, mais `list` et `delete` restent refusés. Les créations publiques sont limitées à deux formes validées :

- miroir complet initial, dont `publicToken` doit être égal à l'id du document et correspondre à la réservation source ;
- pointeur court `reservationId -> token`, dont le token doit correspondre à la réservation source.

Les updates publiques sont limitées à la preuve de paiement :

- `status = preuve_recue` ;
- `paymentReference` ;
- `updatedAt`.

La confirmation du billet public est réservée à l'opérateur digital de la même compagnie ou à l'admin plateforme, avec les champs stricts de validation.

Tests ajoutés

- `tests/firestore/publicReservations.rules.test.cjs`

Comportements autorisés

- lecture publique par token ou id connu ;
- création publique du miroir initial lié à une réservation source existante ;
- création publique du pointeur court lié à la même réservation source ;
- dépôt public d'une référence de paiement sur une réservation en attente ;
- synchronisation de confirmation par opérateur digital de la compagnie ;
- synchronisation de confirmation par admin plateforme.

Comportements désormais interdits

- `list` public ;
- suppression ;
- création d'un miroir sans réservation source ;
- création d'un miroir déjà confirmé ;
- modification publique de `companyId`, `agencyId`, token, montant ou identité ;
- confirmation publique anonyme ;
- confirmation par utilisateur ordinaire ;
- confirmation par opérateur digital d'une autre compagnie.

Ne plus refaire

- ouvrir `create/update` publics sans validation de forme ;
- utiliser une collection publique comme miroir métier sans verrouiller les champs mutables ;
- autoriser une confirmation publique sans rôle métier confirmé.

--------------------------------------------------

BUG-012

Date

2026-07-18

Module concerné

Firestore Rules - collection globale `invitations/{invitationId}`

Symptôme

La collection `invitations` autorisait la lecture de liste publique avec `allow list: if true` et les écritures `create/update/delete` à tout utilisateur authentifié.

Cause exacte

Le parcours d'acceptation utilisait historiquement une requête anonyme `where("token", "==", token)` pour retrouver une invitation. Cette contrainte frontend avait conduit à ouvrir `list` publiquement sur toute la collection.

Risque

Un visiteur pouvait énumérer ou requêter des invitations et exposer des informations d'onboarding comme email, token, rôle, compagnie, agence, statut, nom ou téléphone. Un utilisateur authentifié ordinaire pouvait aussi tenter de créer, modifier ou supprimer des invitations hors de son rôle métier.

Collections concernées

- `invitations/{invitationId}`

Rôles concernés

- visiteur non authentifié ;
- invité correspondant à l'email de l'invitation ;
- admin plateforme ;
- admin compagnie / CEO compagnie ;
- chef d'agence ;
- chef d'escale ;
- utilisateur ordinaire authentifié.

Correction appliquée

La lecture de liste publique a été supprimée. La lecture anonyme est limitée au `get` direct d'une invitation pendante lorsque le token correspond à l'identifiant du document. Les nouvelles invitations créées côté frontend utilisent désormais `docId = token`, ce qui évite la requête publique de collection.

La création Rules impose aussi `token == invitationId` afin d'empêcher les nouveaux documents discordants. Les anciennes invitations frontend créées par `addDoc` avec un identifiant automatique et un champ `token` différent ne peuvent pas être retrouvées anonymement par token sans réouvrir un `list` public. Elles doivent être recréées ou migrées explicitement avant déploiement si elles sont encore `pending`.

Les opérations d'écriture sont restreintes :

- création réservée aux rôles de gestion autorisés dans leur périmètre ;
- liste authentifiée réservée aux gestionnaires du périmètre compagnie/agence ou à l'admin plateforme ;
- acceptation réservée à l'utilisateur authentifié dont l'email correspond à l'invitation ;
- modification de `role`, `companyId`, `agencyId`, `email` et `token` refusée aux utilisateurs ordinaires ;
- suppression réservée aux gestionnaires du périmètre.

Fichiers modifiés

- `firestore.rules`
- `src/shared/invitations/createInvitationDoc.ts`
- `src/modules/auth/pages/AcceptInvitationPage.tsx`
- `src/contexts/AuthContext.tsx`
- `src/modules/compagnie/pages/AjouterAgenceForm.tsx`
- `tests/firestore/invitations.rules.test.cjs`

Tests ajoutés

- `tests/firestore/invitations.rules.test.cjs`

Comportements autorisés

- lecture anonyme d'une invitation pendante par token/document id ;
- lecture et liste administratives dans le périmètre autorisé ;
- création d'invitation par admin compagnie ou chef d'agence dans son périmètre ;
- acceptation par l'utilisateur authentifié correspondant à l'email invité ;
- suppression par gestionnaire autorisé.

Comportements désormais interdits

- `list` anonyme de toutes les invitations ;
- lecture authentifiée d'une invitation non liée ;
- lecture inter-compagnie par un admin compagnie ;
- création par utilisateur ordinaire ;
- création inter-compagnie par admin compagnie ;
- création d'un rôle admin compagnie par chef d'agence ;
- modification du rôle, de la compagnie ou de l'agence par un utilisateur ordinaire ;
- suppression non autorisée.
- création d'un nouveau document `invitations` dont l'identifiant diffère du champ `token` ;
- écrasement d'une invitation existante par un administrateur d'une autre compagnie.

Ne plus refaire

- ouvrir `list` public pour supporter un lookup par token ;
- utiliser une collection d'invitations comme surface publique enumerable ;
- laisser tout utilisateur authentifié créer ou modifier des invitations.
- créer une invitation frontend avec `addDoc` si le lien public repose sur un champ `token`.

--------------------------------------------------

## BUG-013 — Écritures globales trop larges sur medias, plans et _meta

Statut

Corrigé en Phase 1.3.7.4.

Zone

Firestore Rules - collections globales :

- `medias/{mediaId}`
- `plans/{planId}`
- `_meta/{docId}`

Symptôme

Les collections `medias`, `plans` et `_meta` autorisaient `create`, `update` et `delete` à tout utilisateur authentifié.

Cause exacte

Les règles historiques utilisaient `isAuth()` comme garde d'écriture pour des données globales de plateforme. Cette garde ne distinguait pas un utilisateur ordinaire, un rôle compagnie et un administrateur plateforme.

Risque

Un utilisateur authentifié ordinaire pouvait altérer des contenus ou paramètres globaux :

- ajout, modification ou suppression de médias plateforme ;
- modification de plans commerciaux, prix, limites ou fonctionnalités ;
- falsification de métadonnées plateforme ;
- suppression ou altération inter-compagnie d'informations globales.

Correction appliquée

Les lectures existantes ont été conservées pour ne pas casser les parcours actuels :

- `medias` reste lisible par les utilisateurs authentifiés ;
- `plans` reste lisible publiquement ;
- `_meta` reste lisible publiquement.

Les écritures sont désormais réservées au rôle `admin_platforme` :

- `create`
- `update`
- `delete`

Fichiers modifiés

- `firestore.rules`
- `tests/firestore/platformContent.rules.test.cjs`
- `docs/FIRESTORE_RULES_PREDEPLOY_AUDIT.md`
- `docs/KNOWN_BUGS_AND_FIXES.md`

Tests ajoutés

- `tests/firestore/platformContent.rules.test.cjs`

Comportements autorisés

- lecture authentifiée des médias plateforme ;
- lecture publique du catalogue `plans` ;
- lecture publique de `_meta` ;
- gestion de `medias`, `plans` et `_meta` par `admin_platforme`.

Comportements désormais interdits

- écriture anonyme sur `medias`, `plans` ou `_meta` ;
- écriture par utilisateur authentifié ordinaire ;
- écriture par rôle compagnie ;
- modification inter-compagnie de médias ;
- falsification de prix, limites, fonctionnalités ou statut des plans par un non-admin plateforme ;
- suppression non autorisée.

Ne plus refaire

- utiliser `isAuth()` seul pour protéger une collection globale de configuration ou de contenu plateforme ;
- autoriser les rôles compagnie à modifier des données globales sans périmètre explicite ;
- créer une collection globale écrivable sans tests Rules dédiés.

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
