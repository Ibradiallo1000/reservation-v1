# Phase 6 — Rapport : Architecture Trésorerie et traçabilité financière (Teliya)

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/modules/compagnie/treasury/types.ts` | Types et constantes : `FinancialAccountDoc`, `FinancialMovementDoc`, types de comptes/mouvements, helpers d’IDs. |
| `src/modules/compagnie/treasury/financialAccounts.ts` | Références, lecture/création de comptes, `ensureDefaultAgencyAccounts`, `listAccounts`. Aucune mise à jour manuelle du solde. |
| `src/modules/compagnie/treasury/financialMovements.ts` | Ledger immuable : `recordMovementInTransaction` (dans une transaction existante), `recordMovement` (transaction dédiée). Mise à jour des soldes par `increment()` uniquement. |
| `src/modules/compagnie/treasury/expenses.ts` | Collection `expenses`, création/approbation/paiement (transaction : mouvement + mise à jour statut). Réserve dépenses créée si besoin. |
| `src/modules/compagnie/pages/CEOTreasuryPage.tsx` | Page CEO : `/compagnie/:companyId/treasury` — liquidité, répartition, soldes par agence, flux 7j, mouvements, dépenses, alertes solde. |
| `src/modules/agence/pages/AgencyTreasuryPage.tsx` | Page Agence : `/agence/treasury` — comptes agence, position caisse, mouvements récents, dépenses en attente. |
| `docs/PHASE6_TREASURY_INDEXES.md` | Documentation des index Firestore trésorerie. |
| `docs/PHASE6_RAPPORT_TRESORERIE.md` | Ce rapport. |

---

## 2. Fichiers modifiés

| Fichier | Modification |
|--------|---------------|
| `src/modules/agence/services/sessionService.ts` | Dans la transaction de validation de session : création d’un `financialMovement` (revenue_cash, null → agency_cash) si le compte agency_cash existe et `receivedCashAmount > 0`. |
| `src/modules/agence/services/shiftApi.ts` | Même logique dans `validateReportClient` : mouvement revenue_cash (null → agency_cash) pour le montant reçu. |
| `src/AppRoutes.tsx` | Lazy load `CEOTreasuryPage`, `AgencyTreasuryPage` ; routes `treasury` sous compagnie et agence. |
| `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` | Entrée menu « Trésorerie » (icône Wallet) vers `/compagnie/:companyId/treasury`. |
| `src/modules/agence/pages/AgenceShellPage.tsx` | Entrée menu « Trésorerie » (icône Wallet) vers `/agence/treasury`. |
| `firestore.rules` | Règles pour `financialAccounts` (lecture auth, création admin_compagnie / company_accountant / chefAgence), `financialMovements` (lecture/création auth, pas d’update/delete), `expenses` (lecture/création/update auth). |
| `firestore.indexes.json` | Index composites pour `financialMovements`, `financialAccounts`, `expenses` (collection group). |

---

## 3. Implications sécurité

- **Comptes** : Création réservée aux rôles admin_compagnie, company_accountant (niveau compagnie) et chefAgence (niveau agence). La mise à jour manuelle du solde n’est **pas** bloquée par les règles (Firestore ne peut pas imposer « uniquement via mouvement ») ; elle est interdite par convention et par le code (toute modification de solde passe par `recordMovementInTransaction`).
- **Mouvements** : Aucun update/delete sur `financialMovements` ; le registre reste immuable côté base.
- **Dépenses** : Création et mise à jour soumises à authentification ; le passage en « payé » est protégé par la transaction (vérification solde + mouvement unique).
- **Isolation** : Les données sont sous `companies/{companyId}/` ; l’accès aux routes et aux listeners est conditionné par le contexte (companyId/agencyId) et les rôles déjà en place (Phase 5). Les règles ne filtrent pas encore par companyId dans le path (elles reposent sur l’auth et le rôle global) ; une évolution possible est d’ajouter une vérification `companyId` via un document `users/{uid}` étendu (ex. `companyId` / `agencyId` autorisés).

---

## 4. Protection concurrence

- Toute modification de solde est faite dans un **runTransaction** : lecture des comptes concernés, vérification de solde si compte source, `update` avec `FieldValue.increment()` sur from/to, création du document mouvement. En cas d’échec (solde insuffisant ou conflit), la transaction est retentée par le client.
- **Idempotence** : Pour la validation de session, le mouvement est créé avec `referenceType: 'shift'` et `referenceId: shiftId`. Une double validation du même shift créerait deux mouvements (deux documents différents). Une protection idempotente explicite (ex. vérifier l’existence d’un mouvement avec ce `referenceId` dans la transaction avant de créer) peut être ajoutée pour éviter les doublons en cas de double soumission.
- Paiement de dépense : une seule transaction lit la dépense, vérifie le solde, crée le mouvement et met à jour la dépense en « paid » ; pas de double paiement possible pour la même dépense dans cette transaction.

---

## 5. Isolation financière multi-agences

- Chaque compte est soit **company-level** (`agencyId` null), soit **agency-level** (`agencyId` renseigné). Les IDs de comptes agence suivent une convention (`{agencyId}_agency_cash`, `{agencyId}_agency_bank`).
- Les listeners et requêtes côté agence filtrent par `agencyId` ; la page CEO agrège toutes les données de la compagnie. Aucune donnée financière d’une agence n’est exposée à une autre agence en dehors du périmètre CEO/company_accountant.
- Les règles Firestore ne distinguent pas encore finement « utilisateur de l’agence X » ; l’isolation repose sur l’UI et les APIs (paramètres companyId/agencyId dérivés du contexte utilisateur). Un renforcement possible : stocker `companyId` / `agencyId` autorisés dans le profil utilisateur et les vérifier dans les règles.

---

## 6. Risque de contention du registre

- Les **mouvements** sont append-only ; les **comptes** sont mis à jour par `increment()` dans la même transaction que l’écriture du mouvement. Sous charge, les transactions qui mettent à jour les mêmes comptes (ex. un même compte agency_cash pour de nombreuses validations de shift) peuvent subir des conflits et des retries.
- Mitigation actuelle : une transaction courte (lecture comptes → update increment → write mouvement). Pour limiter la contention sur un compte très sollicité (ex. une grosse agence), on peut envisager un découpage temporel (ex. mouvements batchés) ou, à long terme, un traitement asynchrone côté backend (Cloud Functions) avec file d’attente.

---

## 7. Limites de scalabilité

- **Volume** : La collection `financialMovements` peut croître rapidement. Les dashboards utilisent des limites (50–100 derniers mouvements) ; la pagination côté UI n’est pas encore en place. Pour des historiques longs, il faut paginer (startAfter / limit) et s’appuyer sur les index `performedAt` (DESC).
- **Lectures** : Listeners temps réel sur `financialAccounts` et sur une liste limitée de `financialMovements` par compagnie/agence. Pour 200+ agences, chaque page CEO ouvre un listener sur tous les comptes de la compagnie et sur les N derniers mouvements ; le nombre de documents lus reste borné par la limite de la requête et le nombre de comptes.
- **Écritures** : Chaque mouvement = 1 write sur le document mouvement + 2 updates (from/to account). Pas de batch côté client pour l’instant. Les index collection group augmentent légèrement le coût d’écriture.

---

## 8. Piste : migration vers une comptabilité en double entrée

- Aujourd’hui : mouvement = un from, un to, un montant ; soldes mis à jour par increment. Modèle « single-entry » par mouvement.
- Double entrée : chaque opération génère au moins deux lignes (débit/crédit), avec possibilité de comptes de contrepartie, rapprochement et reporting comptable (bilan, flux). Une évolution possible serait d’introduire une collection `ledgerEntries` (ligne = compte, montant, sens débit/crédit, mouvementId) tout en gardant `financialMovements` comme en-tête, et de dériver les soldes des écritures au lieu de les stocker sur le compte. Cela impliquerait des migrations de données et un changement des requêtes de solde (agrégation ou cache).

---

## 9. Évolution possible avec Cloud Functions

- Sans Cloud Functions (Spark) : toute la logique est côté client (transaction Firestore). Avec **Cloud Functions** (plan Blaze), on pourrait :
  - Déplacer la création de mouvements (validation shift, paiement en ligne, dépôt, consolidation, dépense) dans des triggers ou des callables, pour centraliser les règles métier et éviter la manipulation directe du ledger depuis le client.
  - Garantir l’idempotence (ex. vérification referenceId dans une fonction).
  - Préparer des agrégats (ex. soldes par jour, flux par période) dans des collections dédiées pour alléger les requêtes des dashboards.
  - Introduire une file (Firestore, Pub/Sub ou autre) pour sérialiser les écritures sur les comptes les plus sollicités et réduire la contention.

---

## 10. Goulots d’étranglement au-delà de 200 agences

- **CEO dashboard** : Un listener par compagnie sur les comptes + un sur les mouvements (limit 100) reste raisonnable. Au-delà, privilégier des agrégats pré-calculés (ex. `companyTreasurySummary/{date}`) mis à jour par écriture ou par fonction, et limiter les listeners aux résumés plutôt qu’à tous les comptes.
- **Validations de shift** : Si beaucoup d’agences valident en même temps, les transactions sur des comptes différents sont parallèles ; celles sur le même compte (rare pour 200 agences) peuvent conflit. Le principal goulot serait une agence unique avec un très grand nombre de validations simultanées (alors envisager file ou batch).
- **Paiements en ligne** : Si chaque paiement confirmé crédite un compte `mobile_money` commun à la compagnie, ce compte devient un point chaud ; un compte mobile_money par agence ou un traitement asynchrone (Cloud Functions) permettrait de répartir la charge.

---

## 11. Stratégie de réconciliation mobile money

- Non implémentée en Phase 6. Pour une réconciliation fiable :
  - **Traçabilité** : Chaque paiement en ligne devrait créer un mouvement avec `referenceType: 'reservation'`, `referenceId`, et idéalement un identifiant fourni par l’opérateur mobile money.
  - **Réconciliation** : Comparer périodiquement (export opérateur vs mouvements Firestore) les montants et les références ; marquer les mouvements comme « rapprochés » ou alimenter une table d’écarts.
  - **Compte dédié** : Un compte `mobile_money` (ou par agence) avec des mouvements uniquement créés à partir de paiements confirmés et, à terme, de fichiers de réconciliation. Restriction des créations de mouvements vers ce compte aux seuls flux « paiement en ligne » et « ajustement de réconciliation » (rôle restreint).

---

## 12. Synthèse

L’architecture Phase 6 pose les bases d’une **trésorerie traçable** : comptes, registre immuable des mouvements, mise à jour des soldes uniquement par transactions, intégration à la validation des shifts, gestion des dépenses avec passage « payé » transactionnel, et dashboards CEO/Agence. Les règles Firestore et les index sont en place ; la concurrence est gérée par transactions ; l’isolation multi-agences est assurée par le modèle de données et le contexte applicatif. Les limites identifiées (contention, scalabilité 200+ agences, réconciliation mobile money) et les pistes (double entrée, Cloud Functions, agrégats) donnent une feuille de route pour faire évoluer le système vers un niveau « entreprise » sans casser l’existant.
