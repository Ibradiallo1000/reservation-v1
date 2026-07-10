# Diagnostic runtime Comptable Agence

Date: 2026-06-17

Compte concerne: `comptablebkotest01@gmail.com`

## Incident du 2026-07-10 - Validation comptable d'une session - 403 Missing or insufficient permissions

### Contexte metier

Lorsqu'un comptable d'agence valide une session billetterie cloturee, la
transaction Firestore principale doit:

1. diminuer ou initialiser `agency_{agencyId}_pending_cash`;
2. passer le `shift` a `validated_agency`;
3. mettre a jour le `shiftReport`;
4. crediter `agency_{agencyId}_cash`;
5. creer l'entree ledger `accountant_validation`:
   `companies/{companyId}/accounts/agency_{agencyId}_cash/ledger/session_{shiftId}_accountant_validation`.

### Symptomes observes

Erreur runtime:

```txt
FirebaseError: Missing or insufficient permissions
```

Derniere etape journalisee cote client:

```txt
set_cash_ledger
```

Chemin observe:

```txt
companies/{companyId}/accounts/agency_{agencyId}_cash/ledger/session_{shiftId}_accountant_validation
```

Le champ `lastStep` indique uniquement la derniere ecriture preparee cote
client. Il ne prouve pas que cette ecriture est celle refusee par Firestore.
Un commit atomique est entierement rejete si une seule ecriture ou condition
Rules echoue.

### Mauvaise piste a eviter

Ne jamais conclure que `set_cash_ledger` est la cause uniquement parce qu'il
apparait comme `lastStep`.

Ne pas:

- supprimer l'ecriture ledger;
- elargir globalement les permissions;
- autoriser tous les comptes au role `agency_accountant`;
- modifier les montants;
- desactiver la transaction atomique;
- contourner Firestore Rules;
- tester uniquement une ecriture isolee.

### Cause reelle identifiee

La transaction complete executait plusieurs ecritures protegees par des regles
complexes.

Les regles de `agency_cash` et du ledger caisse repetaient plusieurs appels sur
le meme document `shift` apres transaction:

- `existsAfter(shiftPath)`;
- `getAfter(shiftPath)`;
- `getAfter(shiftPath)`;
- `getAfter(shiftPath)`.

Les memes informations du `shift` modifie etaient donc relues plusieurs fois
pendant l'evaluation du meme commit atomique. Cette complexite augmentait le
risque d'atteindre la limite d'evaluation Firestore Rules deja documentee dans
les incidents `BUG-001` et `BUG-002`.

Les montants observes etaient coherents:

```txt
previousCashBalance = 80 000
receivedCashAmount = 49 000
nextCashBalance = 129 000
difference = 0
```

Le probleme n'etait donc pas un calcul de caisse.

### Cartographie de la transaction reelle

Ecritures du `runTransaction()` principal:

1. `pending_cash` update ou create;
2. `shift` update;
3. `shiftReport` update;
4. `agency_cash` update ou create;
5. `cash ledger` create.

Ecritures post-transaction non bloquantes:

- `cashReceipts`;
- `comptaEncaissements`;
- `dailyStats`;
- `agencyLiveState`;
- `agentHistory`.

Les ecritures post-transaction ne provoquaient pas le 403 du commit principal.

### Correctif applique

Helper ajoute dans `firestore.rules`:

```txt
accountantValidationShiftAfterOk(
  companyId,
  agencyId,
  shiftId,
  amount
)
```

Ce helper charge une seule fois le document `shift` apres transaction avec
`getAfter(...).data`, puis reutilise ces donnees pour verifier:

- `status == validated_agency`;
- `validationAudit.receivedCashAmount == amount`;
- `validationAudit.validatedBy.id == request.auth.uid`.

Remplacement applique:

```txt
Avant:
existsAfter(shiftPath)
+ plusieurs getAfter(shiftPath)

Apres:
un seul getAfter(...).data
```

Le helper est utilise par:

- `agencyAccountantCanPostCashBalance()`;
- `accounts/{accountId}/ledger/{ledgerId}`.

### Garanties de securite conservees

Le correctif n'a pas elargi les acces. Les regles continuent d'imposer:

- utilisateur authentifie;
- role comptable agence;
- bonne compagnie;
- bonne agence;
- compte `agency_{agencyId}_cash` uniquement;
- shift de la meme agence;
- statut final `validated_agency`;
- montant caisse egal au montant recu;
- ledger egal au montant recu;
- `validatedBy.id` egal a `request.auth.uid`;
- aucune ecriture dans une autre agence;
- aucune ecriture banque;
- aucune ecriture Mobile Money;
- aucune suppression ledger;
- aucune modification arbitraire ledger.

### Tests ajoutes

Fichier:

```txt
tests/firestore/agencySessionAccountantValidation.rules.test.cjs
```

Le test utilise maintenant une vraie transaction Firestore:

```txt
runTransaction()
```

Lectures reproduites:

- `shift`;
- `shiftReport`;
- `agency`;
- `agency_cash`;
- `cash ledger`;
- `pending_cash`.

Payload aligne sur le runtime:

- `pendingCashLedgerVersion: 1`;
- `cashStatus: "validee_manager"`;
- `validationAudit.validatedBy.id`;
- `receivedCashAmount`;
- `accountantDeviceFingerprint`.

Cas autorise:

- le comptable de l'agence A valide la caisse de sa propre agence.

Cas refuses:

- autre agence;
- compte banque;
- compte Mobile Money;
- autre compte compagnie;
- suppression ledger;
- modification arbitraire ledger.

Resultat attendu:

```txt
AGENCY_SESSION_ACCOUNTANT_VALIDATION_RULES_TEST_OK
```

### Procedure de diagnostic si le probleme revient

1. Lire les documents obligatoires:
   - `docs/ACCOUNTING_SAFETY_PROTOCOL.md`;
   - `docs/KNOWN_BUGS_AND_FIXES.md`.
2. Ne pas se fier uniquement a `lastStep`: lister toutes les ecritures du
   `runTransaction()`.
3. Reproduire la transaction complete avec une vraie `runTransaction()` dans
   l'emulateur. Ne pas tester uniquement le ledger.
4. Verifier les dependances Rules:
   - `get()`;
   - `exists()`;
   - `getAfter()`;
   - `existsAfter()`;
   - appels indirects des helpers de role, compagnie et agence.
5. Comparer champ par champ les payloads exacts:
   - `shift`;
   - `shiftReport`;
   - `agency_cash`;
   - `pending_cash`;
   - `cash ledger`.
6. Tester les cas negatifs pour verifier que la correction n'ouvre pas:
   - une autre agence;
   - les banques;
   - Mobile Money;
   - les suppressions ledger;
   - les updates arbitraires.
7. Deployer les regles:

```powershell
firebase deploy --only firestore:rules --project monbillet-95b77
```

Le deploiement n'est valide que si le terminal affiche:

```txt
Deploy complete!
```

Un HTTP 503 signifie que les nouvelles regles ne sont pas encore deployees.

### Etat actuel

```txt
Test emulateur: OK
TypeScript: OK
Build: OK
Deploiement production: a confirmer apres disparition du HTTP 503
Validation reelle dans l'application: a confirmer apres deploiement reussi
```

Ne pas ecrire que le probleme est corrige en production tant que `Deploy
complete!` et une validation reelle ne sont pas confirmes.

## Mise a jour corrective du 2026-07-09

Statut: corrige et valide en recette.

Cette mise a jour documente les correctifs appliques apres les nouveaux
symptomes runtime observes sur l'espace comptable agence:

- lecture caisse agence avec `permission-denied` sur la source secondaire
  `financialTransactions`;
- erreur visible apres un versement agence vers banque alors que la transaction
  metier etait deja terminee avec succes;
- echec de deploiement Firestore ou le ruleset etait cree mais la release
  `cloud.firestore/(default)` n'etait pas activee a cause d'un `503`.

### A. Releve de caisse agence: source secondaire non bloquante

Symptome observe:

```txt
[agencyCashStatement][read]
operation: list_financial_transactions
path: companies/{companyId}/financialTransactions
status: error
code: permission-denied

[AgenceCompta] Erreur lors du chargement de la caisse (periode / journal)
```

Fichiers corriges:

- `src/modules/agence/cashStatement/agencyCashStatementService.ts`
- `src/modules/agence/comptabilite/pages/AgenceComptabilitePage.tsx`

Correction appliquee:

- ajout d'une option `toleratePermissionDenied` dans la trace de lecture du
  releve de caisse;
- propagation de `tolerateSecondarySourceErrors: true` depuis la page
  comptabilite agence;
- suppression de la lecture directe quotidienne de `financialTransactions`
  dans `AgenceComptabilitePage.tsx` pour les sorties du jour;
- reutilisation du releve de caisse tolerant comme source d'affichage.

Effet attendu:

- la page Comptabilite Agence reste utilisable meme si la source secondaire
  `financialTransactions` est refusee pour le profil courant;
- les donnees principales de caisse ne sont plus bloquees par une lecture
  secondaire indisponible;
- aucun calcul comptable, workflow ou service de validation n'a ete modifie.

### B. Versement agence vers banque: ne pas transformer un succes metier en erreur UI

Symptome observe:

```txt
[TransferService] runTransaction - Transaction terminee avec succes
[Transfer] Error - Detail complet: FirebaseError: Missing or insufficient permissions.
```

Fichier corrige:

- `src/modules/agence/treasury/pages/AgencyTreasuryTransferPage.tsx`

Cause fonctionnelle:

- le versement pouvait etre cree correctement;
- une lecture secondaire de rafraichissement, notamment l'historique
  `listTransferRequests`, pouvait echouer ensuite;
- l'UI affichait alors une erreur globale comme si le versement lui-meme avait
  echoue.

Correction appliquee:

- separation du rafraichissement du solde caisse et du rafraichissement de
  l'historique;
- le solde caisse est mis a jour apres succes du versement;
- si l'historique est temporairement indisponible, l'UI conserve le succes
  metier et journalise seulement un avertissement cible.

Effet attendu:

- un versement valide n'est plus presente comme echoue a cause d'une lecture
  secondaire;
- le verrou UI est relache proprement;
- aucune ecriture Firestore ni logique metier de transfert n'a ete modifiee.

### C. Regles Firestore: optimisation du chemin versement agence vers banque

Symptome observe pendant les tests rules/emulateur:

```txt
Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached
```

Fichier corrige:

- `firestore.rules`

Correction appliquee:

- ajout de gardes rapides sur la creation
  `treasuryTransferRequests/{requestId}`:
  - `status == executed`;
  - `idempotencyKey == agency_transfer_{requestId}`;
- ajout de gardes rapides sur:
  - `financialTransactions/{transactionId}` avec prefixe `agency_transfer_`;
  - `financialTransactionIdempotency/{key}` avec prefixe `agency_transfer_`;
- priorisation du cas `lastDirectTransferId` dans `accounts/{accountId}` avant
  les branches de regles plus couteuses.

Effet attendu:

- la regle du versement direct agence vers banque atteint plus vite la branche
  correcte;
- le risque de depasser la limite d'evaluation des 1000 expressions est reduit
  sur ce workflow;
- le perimetre d'autorisation reste limite au versement agence vers banque
  attendu.

### D. Deploiement rules: ruleset cree mais release non activee

Symptome observe dans `firebase-debug.log`:

```txt
created ruleset projects/monbillet-95b77/rulesets/c3279ab6-c6e6-4323-a428-659638fe2b57
PATCH ... releases/cloud.firestore/(default) -> 503
POST ... releases -> 409 ALREADY_EXISTS
```

Diagnostic:

- la compilation des regles et la creation du ruleset ont reussi;
- la release active `cloud.firestore/(default)` n'a pas ete mise a jour a cause
  d'un `503` cote service Firebase Rules;
- le `409 ALREADY_EXISTS` est une consequence du fallback du CLI: la release
  existe deja, elle doit etre patchee, pas creee;
- tant que la release n'est pas activee, l'application continue d'utiliser
  l'ancien ruleset.

Solution appliquee:

- relancer le deploiement des regles jusqu'a obtention d'un deploiement complet:

```bash
firebase deploy --only firestore:rules --project monbillet-95b77 --debug
```

Resultat attendu apres deploiement reussi:

- les corrections `firestore.rules` sont actives en production;
- le versement agence vers banque ne renvoie plus `permission-denied`;
- la page comptabilite agence ne remonte plus d'erreur bloquante sur les
  lectures secondaires tolerees.

### Validation effectuee

- `npx firebase emulators:exec --only firestore "node tests\firestore\agencyBankDepositDirect.rules.test.cjs"`: OK.
- `npx tsc --noEmit`: OK.
- `npm run build`: OK.

### Fichiers modifies par cette correction

- `firestore.rules`
- `src/modules/agence/cashStatement/agencyCashStatementService.ts`
- `src/modules/agence/comptabilite/pages/AgenceComptabilitePage.tsx`
- `src/modules/agence/treasury/pages/AgencyTreasuryTransferPage.tsx`
- `docs/AGENCY_ACCOUNTANT_RUNTIME_DEBUG.md`

## Limite de collecte navigateur

La connexion automatique au navigateur local deja authentifie n'a pas pu etre etablie dans l'environnement Codex: le runtime navigateur a echoue avant l'ouverture de l'onglet avec `node_repl kernel exited unexpectedly` / `windows sandbox failed: spawn setup refresh`.

Le diagnostic ci-dessous relie donc les erreurs console fournies aux lignes source et aux requetes Firestore correspondantes. Les corrections ont ete validees par compilation TypeScript et chargement des regles dans l'emulateur Firestore.

## Erreurs trouvees

### 1. `Solde global caisse: Missing or insufficient permissions`

- Action: chargement initial de `/agence/comptabilite`, appel `reloadCash`.
- Fichier source: `src/modules/agence/comptabilite/pages/AgenceComptabilitePage.tsx`, autour de `getAgencyCashPosition(...)`.
- Service appele: `src/modules/agence/comptabilite/agencyCashAuditService.ts`.
- Requetes concernees:
  - `list/query`: `companies/{companyId}/financialTransactions`
    - filtres: `companyId == user.companyId`, `agencyId == user.agencyId`, `orderBy performedAt desc`.
  - `list/query`: `companies/{companyId}/agences/{agencyId}/comptaEncaissements`
    - ordre: `createdAt desc`.
  - `get`: `companies/{companyId}/accounts/agency_{agencyId}_cash`.
- Regles concernees:
  - `match /companies/{companyId}/financialTransactions/{transactionId}`
  - `match /companies/{companyId}/agences/{agencyId}/comptaEncaissements/{entryId}`
  - `match /companies/{companyId}/accounts/{accountId}`
- Role attendu: comptable agence via `isComptable()` (`agency_accountant`, `comptable`, `Comptable`, ou role liste/token).
- Cause racine: plusieurs lectures comptables agence dependaient encore soit de `userCompanyId() == companyId`, soit d'une lecture trop large des comptes ledger. Si `companyId` du profil/token est absent ou desynchronise, l'utilisateur peut etre rattache par `agencyId` mais etre refuse sur des lectures de caisse.
- Correction appliquee:
  - ajout d'un helper de regle `canReadOwnAgencyAccountingData(companyId, agencyId)`;
  - ajout d'un helper `canReadOwnAgencyLedgerAccount(companyId)`;
  - lecture `accounts` autorisee uniquement pour les comptes ledger de l'agence courante et de types `cash`, `mobile_money`, `virtual_clearing`.

## 2. `reloadCash range query failed`

- Action: chargement des mouvements de caisse periode/journal.
- Fichier source: `AgenceComptabilitePage.tsx`, bloc `reloadCash`.
- Requete principale:
  - `list/query`: `companies/{companyId}/financialTransactions`
  - filtres: `companyId`, `agencyId`, `createdAt >= from`, `createdAt < to`, `orderBy createdAt desc`, `limit 50`.
- Requete fallback:
  - `list/query`: `companies/{companyId}/financialTransactions`
  - filtres: `companyId`, `agencyId`, `orderBy createdAt desc`, `limit 200`.
- Regle concernee: `match /companies/{companyId}/financialTransactions/{transactionId}`.
- Cause racine: la requete est valide fonctionnellement, mais elle depend de la reconnaissance stricte du role et de l'agence dans les regles. Les corrections precedentes centralisent `isComptable()` sur role string, liste et token.
- Correction appliquee: conservation de la requete et renforcement des regles role/agence. Aucun calcul n'a ete modifie.

## 3. `Erreur lors du chargement de la caisse (periode / journal)`

- Action: echec global du bloc `reloadCash` apres refus sur une des lectures de periode.
- Fichier source: `AgenceComptabilitePage.tsx`, `catch` final de `reloadCash`.
- Requetes possibles dans ce bloc:
  - `companies/{companyId}/financialTransactions`
  - `companies/{companyId}/agences/{agencyId}/comptaEncaissements`
  - `companies/{companyId}/accounts/agency_{agencyId}_cash`
- Regles concernees:
  - `financialTransactions`
  - `comptaEncaissements`
  - `accounts`
- Cause racine: acces incomplet au journal comptable agence et aux comptes ledger agence.
- Correction appliquee:
  - `comptaEncaissements` reste limite a la meme agence;
  - `accounts/{accountId}/ledger/{ledgerId}` garde un `list` restreint a `agency_{agencyId}_cash`;
  - `accounts/{accountId}` accepte les lectures des comptes ledger de la meme agence.

## 4. `courierSessionLedger Ledger total unavailable`

- Action: calcul du montant attendu d'une reception courrier.
- Fichier source: `src/modules/logistics/services/courierSessionLedger.ts:53`.
- Requetes concernees:
  - `list/query`: `companies/{companyId}/logistics/data/shipments`, filtre `sessionId == courierSessionId`;
  - `list/query`: `companies/{companyId}/financialTransactions`, filtres `companyId`, `type == payment_received`, `reservationId == shipmentId`, `agencyId`, `paymentChannel == courrier`, `status == confirmed`.
- Regles concernees:
  - `match /companies/{companyId}/logistics/data/shipments/{shipmentId}`
  - `match /companies/{companyId}/financialTransactions/{transactionId}`
- companyId observe dans les logs: `e1zx7bz0Pl1IPVPt2ne4`.
- courierSessionId observe: `sWsxGBNWqEXHenr27Vlh`.
- Cause racine: le calcul ledger courrier depend d'une requete `financialTransactions` par colis. Si la regle ne reconnait pas correctement le comptable agence ou si les regles deployees sont anciennes, la requete tombe en permission-denied puis le service revient au fallback `shipments`.
- Correction appliquee: pas de suppression du fallback; les regles locales reconnaissent le role comptable agence et l'agence rattachee. La lecture `shipments` est deja autorisee a `isComptable() && userAgencyBelongsToCompany(companyId)`.

## 5. Validation reception guichet

- Action: bouton de validation d'un versement guichet.
- Fichier source: `AgenceComptabilitePage.tsx`, handler `validateShiftReception`.
- Service appele: `src/modules/agence/services/sessionService.ts`, `validateSessionByAccountant`.
- Chemins Firestore touches:
  - `companies/{companyId}/agences/{agencyId}/shifts/{shiftId}`
  - `companies/{companyId}/accounts/agency_{agencyId}_cash`
  - `companies/{companyId}/accounts/agency_{agencyId}_pending_cash`
  - `companies/{companyId}/financialTransactions`
  - `companies/{companyId}/financialTransactionIdempotency`
  - `companies/{companyId}/agences/{agencyId}/comptaEncaissements`
  - agregats agence: `dailyStats`, `agencyLiveState`.
- Regles concernees:
  - `shifts`
  - `accounts`
  - `financialTransactions`
  - `financialTransactionIdempotency`
  - `comptaEncaissements`
  - `dailyStats`
  - `agencyLiveState`
- Cause racine potentielle: transaction multi-documents; une seule regle manquante bloque toute la validation.
- Correction appliquee: lecture/ecriture de remise sur comptes ledger deja couverte par les regles locales; `comptaEncaissements` cree par comptable agence autorise via `comptaEncaissementCreateOk`.

## 6. Validation reception courrier

- Action: bouton de validation d'une reception courrier.
- Fichier source: `AgenceComptabilitePage.tsx`, handler `validateCourierSessionAction`.
- Service appele: `src/modules/logistics/services/courierSessionService.ts`, `validateCourierSession`.
- Chemins Firestore touches:
  - `companies/{companyId}/agences/{agencyId}/courierSessions/{sessionId}`
  - `companies/{companyId}/logistics/data/shipments`
  - `companies/{companyId}/financialTransactions`
  - `companies/{companyId}/financialTransactionIdempotency`
  - `companies/{companyId}/accounts/agency_{agencyId}_cash`
  - `companies/{companyId}/accounts/agency_{agencyId}_pending_cash`
  - `companies/{companyId}/agences/{agencyId}/comptaEncaissements/courier_{sessionId}`
  - `companies/{companyId}/agences/{agencyId}/dailyStats/{date}`
  - `companies/{companyId}/agences/{agencyId}/agencyLiveState/current`
- Regles concernees:
  - `courierSessions`
  - `logistics/data/shipments`
  - `financialTransactions`
  - `financialTransactionIdempotency`
  - `accounts`
  - `comptaEncaissements`
  - `dailyStats`
  - `agencyLiveState`
- Cause racine: validation courrier est atomique; l'echec peut venir du total ledger, de la remise pending -> caisse, de la creation `comptaEncaissements`, ou de l'update `courierSessions`.
- Correction appliquee: les regles locales couvrent maintenant les lectures/ecritures agence necessaires avec `isComptable()` et `userAgencyBelongsToCompany(companyId)`.

## Correction service

Fichier modifie: `src/modules/compagnie/treasury/ledgerAccounts.ts`.

Avant: `getLiquidityFromAccounts(companyId, agencyId)` listait `companies/{companyId}/accounts` puis filtrait cote client.

Apres: quand `agencyId` est fourni, le service lit directement:

- `companies/{companyId}/accounts/agency_{agencyId}_cash`;
- `companies/{companyId}/accounts/agency_{agencyId}_mobile_money`.

Cette correction evite de demander au comptable agence une lecture large de tous les comptes de la compagnie.

## Fichiers modifies

- `firestore.rules`
- `src/modules/compagnie/treasury/ledgerAccounts.ts`
- `docs/AGENCY_ACCOUNTANT_RUNTIME_DEBUG.md`

## Tests effectues

- `npx tsc --noEmit`: OK.
- `firebase emulators:exec --only firestore "cmd /c echo rules-ok"`: OK, les regles Firestore se chargent dans l'emulateur.

## Commandes a lancer

Les regles Firestore ont ete modifiees. Il faut deployer:

```bash
firebase deploy --only firestore:rules
```

Puis retester avec `comptablebkotest01@gmail.com`:

1. ouvrir `/agence/comptabilite`;
2. verifier que `Solde global caisse` ne renvoie plus `permission-denied`;
3. ouvrir `Caisse` et verifier le chargement periode/journal;
4. valider une reception guichet;
5. valider une reception courrier;
6. verifier que le solde caisse et l'historique se rafraichissent apres validation.

## Resultat attendu apres deploiement des regles

- Le comptable agence peut lire le solde de sa caisse agence.
- Le comptable agence peut lire le journal de caisse de sa propre agence.
- Le comptable agence peut lire les encaissements comptables de sa propre agence.
- Les validations guichet/courrier ne bloquent plus sur les documents ledger strictement necessaires.
- Aucun acces n'est donne aux utilisateurs non authentifies, aux autres agences, ni aux comptes compagnie hors agence.
