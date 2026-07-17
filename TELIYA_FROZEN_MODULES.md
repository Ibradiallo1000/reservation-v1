# TELIYA — Modules gelés et périmètre MVP

Le gel signifie : aucune modification sans anomalie démontrée, reproduction, audit comparatif et autorisation de la phase cible. Une refonte visuelle future doit conserver contrôleurs, mutations, statuts, chemins et idempotence.

## Modules gelés

| Module | Routes / fichiers de référence | Motif | Conditions de réouverture |
|---|---|---|---|
| Billetterie guichet | `/agence/guichet`, `AgenceGuichetPage.tsx`, `sessionService.ts`, `guichetReservationService.ts` | tag stable + protocole comptable | bug reproduit, audit réservation/shift/ledger, tests Rules/E2E |
| Comptabilité agence | `/agence/comptabilite*`, services session/compta | invariants documentés et incidents corrigés | protocole comptable complet, preuve staging |
| Courrier/colis | `/agence/courrier/*`, `src/modules/logistics` | tag `stable-courrier-v1`, workflow double statut stabilisé | anomalie de transition démontrée + tests origine/destination |
| Billet/reçus | routes détail, receipt et print | QR/impression et identité client sensibles | preuve régression et tests public/print |
| Paiement online opérateur | `digital-cash`, commit opérateur | idempotence Mobile Money et Rules ciblées | audit payment/réservation/transaction/idempotence |
| Ledger et comptes | `accounts`, ledger, financialTransactions, Rules | source financière critique | autorisation financière explicite + Emulator complet |

Le Dashboard Chef d’Agence est fonctionnel mais n’est gelé que sur ses sources/mutations; sa vue est une cible de P3. Le Command Center CEO, la Marketplace et les shells restent des cibles UX, donc non gelés visuellement.

## MVP actif

- Billetterie guichet et réservation en ligne.
- Départs/embarquement nécessaires à l’exploitation.
- Courrier/colis.
- Caisse et comptabilité simplifiées agence/compagnie.
- Dashboards Agence et Compagnie/CEO.
- Marketplace, paiement, billet et opérateur digital.
- Administration minimale compagnie/agences/utilisateurs/paiements.

## Modules différés ou masqués

Les flags confirment : flotte (`ENABLE_FLEET=false`), logistique avancée (`ENABLE_LOGISTICS=false`) et finance avancée (`ENABLE_ADVANCED_FINANCE=false`). Sont donc différés côté produit visible : garage, flotte détaillée, maintenance, transit, incidents, conformité, urgence, équipages, coûts/dépenses avancés, audit financier avancé et intelligence prédictive. Les routes et données existantes ne doivent ni être supprimées ni réactivées pendant la refonte MVP.

## Conditions générales de dégel

1. anomalie ou objectif produit précis;
2. chemins Firestore, acteurs, lectures/writes et invariants listés;
3. comparaison code courant/tag stable;
4. plan de test Rules + métier + responsive;
5. validation humaine avant modification;
6. nouveau rapport et tag de gel après vérification.
