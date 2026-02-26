# Phase 6 Hardening — Rapport détaillé (Sécurité financière, concurrence, identité)

## 1. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| **firestore.rules** | financialAccounts : création restreinte (admin_compagnie, company_accountant, chefAgence) ; mise à jour limitée aux champs autorisés via `affectedKeys()` (métadonnées ou currentBalance+updatedAt). financialMovements : update autorisé uniquement pour reconciliationStatus+updatedAt et uniquement pour admin_compagnie/company_accountant. Nouvelle collection financialMovementIdempotency (get, create uniquement). |
| **src/modules/compagnie/treasury/types.ts** | Ajout EntryType, ReconciliationStatus, champs movement : uniqueReferenceKey, entryType, reconciliationStatus, externalReferenceId?, settlementDate?, performedByRole?, updatedAt?. Documented company_bank sharding (company_bank_1, company_bank_2) et limite d’écriture Firestore. |
| **src/modules/compagnie/treasury/financialMovements.ts** | Idempotence via uniqueReferenceKey et collection financialMovementIdempotency (sentinelle par clé). Nouveaux champs sur le document mouvement. Guard solde négatif (déjà en place, commenté). updateMovementReconciliationStatus() pour mise à jour du statut de réconciliation. Commentaire cohérence du journal (PART 6). |
| **src/modules/compagnie/treasury/expenses.ts** | Aucun changement requis : payExpense appelle déjà recordMovementInTransaction dans une transaction ; référence expense_${expenseId} assure l’idempotence. |
| **src/modules/agence/services/sessionService.ts** | Aucun changement requis : validation de session crée déjà un mouvement revenue_cash avec referenceType shift. |
| **src/modules/agence/services/shiftApi.ts** | Aucun changement requis : validateReportClient crée déjà un mouvement revenue_cash. |

---

## 2. Règles Firestore mises à jour

### financialAccounts

- **Lecture** : `isAuth()`.
- **Création** : `isAuth()` et rôle parmi `admin_compagnie`, `company_accountant`, `chefAgence` (agency_manager).
- **Mise à jour** : `isAuth()` et l’une des deux conditions :
  - Métadonnées seules : `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['accountName', 'isActive', 'description', 'updatedAt'])`
  - Ou mise à jour de solde (increment côté app) : `affectedKeys().hasOnly(['currentBalance', 'updatedAt'])`
- **Suppression** : interdite.

Interdiction de modifier directement `currentBalance` sans passer par le module mouvements : impossible à garantir strictement côté client (un client peut envoyer `{ currentBalance: X, updatedAt }`). La règle interdit en revanche de modifier dans la même écriture `accountType`, `agencyId`, `companyId`. Une protection totale du solde nécessiterait des Cloud Functions (Admin SDK).

### financialMovements

- **Création** : `isAuth()`.
- **Mise à jour** : `isAuth()` et (admin_compagnie ou company_accountant) et `affectedKeys().hasOnly(['reconciliationStatus', 'updatedAt'])`.
- **Suppression** : interdite.

### financialMovementIdempotency

- **Lecture, création** : `isAuth()`.
- **Mise à jour, suppression** : interdites.

### expenses

- Inchangé : get, list, create, update si auth ; delete interdit.

---

## 3. Améliorations de sécurité

- **Comptes** : Création réservée aux rôles habilités ; mise à jour limitée à des ensembles de champs explicites (métadonnées ou solde+updatedAt), ce qui empêche le changement frauduleux de type de compte ou d’agence en même temps qu’une opération.
- **Mouvements** : Registre immuable sauf reconciliationStatus ; seuls admin_compagnie et company_accountant peuvent mettre à jour ce champ (et updatedAt).
- **Idempotence** : Une seule écriture de mouvement par clé métier (referenceType_referenceId), évitant les doubles comptabilisations en cas de double soumission (validation de poste, paiement de dépense, etc.).
- **Solde** : Aucune mise à jour du solde en dehors du module financialMovements ; lecture du compte dans la transaction avant écriture ; refus explicite si solde source insuffisant (pas de solde négatif non autorisé).

---

## 4. Gestion de la concurrence

- Toutes les modifications de solde s’effectuent dans un `runTransaction` : lecture des comptes, vérification du solde, `increment` sur from/to, écriture du mouvement (et sentinelle d’idempotence). En cas de conflit, Firestore réessaie la transaction.
- Idempotence : avant d’écrire un mouvement, la transaction lit le document sentinelle `financialMovementIdempotency/{uniqueReferenceKey}` ; s’il existe, la transaction est abandonnée. Sinon elle crée la sentinelle et le mouvement. Ainsi, une double validation du même shift ou un double paiement de la même dépense est refusé.
- Aucun `setDoc` / `updateDoc` direct sur `currentBalance` en dehors de ce module ; tout passe par `recordMovementInTransaction` ou `recordMovement`.

---

## 5. Sécurité multi-agences

- Les données trésorerie sont sous `companies/{companyId}/` ; l’isolation par agence repose sur `agencyId` dans les comptes et les mouvements, et sur le contexte applicatif (companyId/agencyId de l’utilisateur).
- Les rôles chefAgence (création de comptes d’agence), admin_compagnie et company_accountant (comptes compagnie et réconciliation) restent cohérents avec le modèle existant. Les règles ne vérifient pas encore un lien explicite user → companyId/agencyId dans un document ; une évolution possible est de stocker les compagnies/agences autorisées dans le profil utilisateur et de les contrôler dans les règles.

---

## 6. Garanties d’idempotence

- **Clé** : `uniqueReferenceKey = ${referenceType}_${referenceId}` (ex. `shift_abc123`, `expense_xyz789`).
- **Mécanisme** : Collection `financialMovementIdempotency` avec un document par clé (ID = clé). Dans la transaction : `get(sentinelle)` ; si existant → erreur ; sinon `set(sentinelle)`, puis mise à jour des soldes et création du mouvement.
- **Effet** : Un même événement métier (validation d’un poste, paiement d’une dépense, etc.) ne peut produire qu’un seul mouvement ; les soumissions en double sont rejetées et évitent la double comptabilisation.

---

## 7. Risques restants

- **Solde** : Un client authentifié pourrait en théorie envoyer une mise à jour avec uniquement `currentBalance` et `updatedAt` (règle autorisant le pattern “increment”). La convention et le code applicatif n’utilisent que le module mouvements ; une protection totale impliquerait un backend (Cloud Functions) qui effectue les increments.
- **Réconciliation** : La mise à jour de `reconciliationStatus` est permise aux seuls admin_compagnie et company_accountant ; un compromis de compte pourrait permettre des changements de statut non autorisés si le rôle est usurpé.
- **Idempotence** : La sentinelle est créée dans la même transaction que le mouvement ; en cas de succès partiel côté client (transaction validée côté serveur mais réponse perdue), le client pourrait réessayer et recevoir “déjà existant”, ce qui est le comportement attendu.

---

## 8. Plafond de scalabilité (estimation)

- **Écritures** : Chaque mouvement = 1 écriture idempotence + 1 écriture mouvement + 2 mises à jour de comptes. Limite pratique Firestore ~1 write/sec/document ; les comptes les plus sollicités (ex. une grosse agence, un compte company_bank unique) peuvent devenir des points chauds.
- **Mitigation documentée** : Sharding optionnel pour `company_bank` (company_bank_1, company_bank_2, …) pour répartir les écritures ; non migré pour l’instant.
- **Lecture** : Les dashboards utilisent des listeners sur des requêtes limitées (ex. 50–100 derniers mouvements) ; la pagination et les index existants limitent la charge. Au-delà de 200 agences, des agrégats pré-calculés (ex. soldes par jour, résumés par agence) seraient recommandés pour éviter de scanner de gros volumes.

---

## 9. Recommandations pour la Phase 7 (Advanced Accounting Layer)

- **Double entrée** : Introduire des écritures débit/crédit explicites (ou une collection `ledgerEntries` liée aux mouvements) pour rapprochement, bilan et reporting comptable.
- **Backend dédié** : Déplacer la création des mouvements et la mise à jour des soldes dans des Cloud Functions (callables ou triggers) pour : (1) interdire toute modification directe du solde par le client ; (2) centraliser les règles métier et l’idempotence ; (3) préparer des agrégats et files d’attente pour réduire la contention.
- **Réconciliation** : Utiliser `externalReferenceId`, `settlementDate` et `reconciliationStatus` pour lier les mouvements aux flux bancaires / mobile money et automatiser des rapprochements (exports vs mouvements).
- **Contrôle d’accès renforcé** : Lier explicitement dans les règles Firestore l’utilisateur à des `companyId` / `agencyId` autorisés (profil ou table d’affectation) pour renforcer l’isolation multi-agences.

---

*Rapport Phase 6 Hardening — Teliya Transport SaaS.*
