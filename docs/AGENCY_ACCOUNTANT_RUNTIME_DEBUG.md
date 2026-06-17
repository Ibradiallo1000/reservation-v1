# Diagnostic runtime Comptable Agence

Date: 2026-06-17

Compte concerne: `comptablebkotest01@gmail.com`

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
