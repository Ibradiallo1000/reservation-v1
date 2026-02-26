# Rapport Phase C1.2 — Tableau de bord d’approbation et durcissement anti-contournement

## Résumé

Cette phase finalise la couche de gouvernance financière : tableau de bord CEO pour les approbations de paiement, renforcement de l’anti-contournement (cumul par agence et par utilisateur), expiration des propositions, piste d’audit complète et visibilité CEO améliorée.

---

## 1. Fichiers créés / modifiés

### Créés

| Fichier | Rôle |
|--------|------|
| `src/modules/compagnie/pages/CEOPaymentApprovalsPage.tsx` | Page CEO listant les propositions en attente (supplierName, agence, montant, cumul 24h, seuil, indicateur Normal / Seuil dépassé) avec actions Approuver / Rejeter. Accès `admin_compagnie` uniquement. |
| `REPORT-PHASE-C1.2-APPROVAL-HARDENING.md` | Ce rapport. |

### Modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/modules/compagnie/finance/paymentProposalsTypes.ts` | Statut `expired` ; champs `expiresAt`, `createdByRole`, `approvedByRole`, `rejectionReason`, `approvalHistory` (append-only) ; constante `PROPOSAL_EXPIRATION_DAYS` (7). |
| `src/modules/compagnie/finance/paymentProposalsService.ts` | Création avec `expiresAt` (proposedAt + 7 j), `createdByRole`, `approvalHistory` initial ; `markProposalExpired` ; dans `listPendingPaymentProposals`, marquage des propositions expirées puis retour des seules non expirées ; `listProposalsInLast24hForCumulative` (cumuls par agence et par proposedBy sur 24h, statuts pending/approved). |
| `src/modules/compagnie/finance/paymentsService.ts` | `payPayable` : cumuls 24h par agence et par proposedBy ; si cumul agence ou cumul utilisateur > seuil → proposition CEO ; passage de `createdByRole` à `createPaymentProposal`. `approvePaymentProposal` : vérification `expiresAt`, mise à jour `approvedByRole` et `approvalHistory`. `rejectPaymentProposal` : paramètres `rejectionReason` et `approvedByRole`, mise à jour `approvalHistory`. |
| `firestore.rules` | Règles `paymentProposals` : mise à jour limitée aux champs `approvalStatus`, `approvedBy`, `approvedAt`, `executedMovementId`, `rejectionReason`, `approvalHistory`, `expiresAt`, `approvedByRole`. |
| `src/AppRoutes.tsx` | Route `payment-approvals` sous `/compagnie/:companyId`, lazy-load de `CEOPaymentApprovalsPage`. |
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Chargement du montant total en attente et indicateur « cumul 24h dépassé » ; lien « Voir toutes les demandes » vers la page d’approbations. |

---

## 2. Gouvernance

- **Tableau d’approbation CEO** : page dédiée liste toutes les propositions `pending`, avec fournisseur, agence, montant, cumul 24h, seuil et indicateur (Normal / Seuil dépassé). Actions Approuver et Rejeter appellent uniquement la couche service (`approvePaymentProposal`, `rejectPaymentProposal`) ; aucun écriture ledger côté UI.
- **Expiration** : toute proposition a un `expiresAt` (par défaut proposedAt + 7 jours). Si à l’appel de `listPendingPaymentProposals` une proposition est expirée, son statut est mis à `expired` et elle n’est plus retournée. Lors de l’approbation, si `now > expiresAt` une erreur « Proposal expired » est levée ; une nouvelle proposition doit être créée.
- **Audit** : chaque proposition stocke `createdByRole`, `approvedByRole` (optionnel), `rejectionReason` (optionnel) et `approvalHistory` (tableau append-only : proposed / approved / rejected avec by, role, timestamp). Aucune suppression autorisée.

---

## 3. Anti-contournement (multi-niveaux)

- **Déjà en place (C1.1)** : cumul 24h par **même payable** → si dépassement du seuil, approbation CEO obligatoire.
- **C1.2** :
  - **Cumul 24h par agence** : si le total des montants proposés (pending + approved) dans les 24 dernières heures pour la **même agence** dépasse le seuil, le nouveau paiement exige l’approbation CEO, même si le montant unitaire est sous le seuil.
  - **Cumul 24h par utilisateur** : même règle pour le **même proposedBy** (réduction du risque de multiplication de propositions par un même comptable).

Implémentation : `listProposalsInLast24hForCumulative` récupère les propositions des 24h avec statut pending ou approved, puis calcule en mémoire les sommes par `agencyId` et par `proposedBy`. Dans `payPayable`, si `amount + sumAgency24h > threshold` ou `amount + sumUser24h > threshold`, une proposition est créée au lieu d’exécuter le paiement.

---

## 4. Expiration

- **Valeur** : `expiresAt = proposedAt + 7 jours` à la création.
- **Marquage** : lors de `listPendingPaymentProposals`, les propositions dont `now > expiresAt` sont mises à jour en `approvalStatus: "expired"` (une mise à jour par proposition, pas de transaction globale).
- **Approbation** : `approvePaymentProposal` vérifie `expiresAt` ; si la proposition est expirée, une erreur est levée et aucun mouvement financier n’est effectué.
- Les propositions existantes sans `expiresAt` (données antérieures à C1.2) sont considérées comme non expirées pour l’approbation ; à l’affichage, une valeur dérivée (proposedAt + 7 j) peut être utilisée pour l’UI.

---

## 5. Transparence et audit

- **Modèle** : piste d’audit immutable et append-only via `approvalHistory`. Chaque entrée contient `action` (proposed | approved | rejected), `by` (uid), `role`, `timestamp`.
- **Création** : premier élément « proposed » avec créateur et rôle.
- **Approbation** : ajout d’un élément « approved » avec approbateur et rôle (ex. admin_compagnie).
- **Rejet** : ajout d’un élément « rejected » et enregistrement optionnel de `rejectionReason`.
- Aucune modification ni suppression d’historique ; les règles Firestore n’autorisent que des mises à jour limitées aux champs d’approbation/audit listés.

---

## 6. Multi-agence

- Les cumuls 24h par agence permettent de limiter le contournement au niveau d’une agence (plusieurs propositions sous le seuil mais cumul au-dessus).
- La page CEO affiche l’`agencyId` pour chaque proposition ; le lien « Voir toutes les demandes » mène à une liste globale compagnie, avec possibilité future de filtrage par agence.

---

## 7. Scalabilité

- **Liste des propositions** : limitée (ex. 200) pour éviter des réponses trop lourdes.
- **Cumul 24h** : requête par `proposedAt >= now - 24h` avec limite (ex. 200), puis agrégation en mémoire par agence et par utilisateur.
- **Marquage d’expiration** : effectué lors du list des pending ; chaque proposition expirée déclenche une mise à jour (écrit séparé). Pour un volume très élevé, un job backend (Cloud Function) pourrait centraliser le marquage des expirations.

---

## 8. Règles Firestore

- **paymentProposals** : mise à jour autorisée uniquement pour `admin_compagnie`, et uniquement sur les champs : `approvalStatus`, `approvedBy`, `approvedAt`, `executedMovementId`, `rejectionReason`, `approvalHistory`, `expiresAt`, `approvedByRole`. Aucun client ne peut modifier `amount`, `payableId` ou autres champs métier après création.
- Création inchangée : `agency_accountant`, `company_accountant`, `financial_director`. Suppression interdite.

---

## 9. Options d’automatisation backend (futur)

- **Cloud Function** : exécution périodique (ex. quotidienne) pour marquer les propositions expirées (`proposedAt + 7j < now` et `approvalStatus === "pending"`) sans dépendre du chargement de la page CEO.
- **Notifications** : déclenchement à la création d’une proposition (ou à l’expiration proche) pour alerter le CEO.
- **Endpoint d’approbation/rejet** : API sécurisée (vérification du rôle admin_compagnie) appelant les mêmes services pour intégrations (mobile, outils internes).

---

*Phase C1.2 — Approval Dashboard & Anti-Bypass Hardening — Rapport de livraison.*
