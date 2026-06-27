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

## 7. Protocole avant modification

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

## 9. Alignements futurs

Les futurs alignements concernent :

- chef d’agence
- chef comptable compagnie
- admin compagnie
- CEO

Ces espaces doivent prioritairement faire de la lecture, de l’agrégation et de l’affichage.

Ils ne doivent pas modifier les écritures comptables stabilisées sauf besoin métier explicite et validé.

## 10. Règle de décision

Si une modification peut casser la validation comptable, ne pas la faire directement.

Faire d’abord :
1. audit,
2. diagnostic,
3. proposition,
4. validation humaine,
5. correction minimale,
6. test complet.

Fin du protocole.
