# Version stable — Billetterie & Comptabilité agence

Commit stable : e97ed199  
Tag recommandé : stable-billetterie-comptable-e97ed199  
Date : 2026-06-20

## Périmètre stabilisé

Flux validés :

- Ouverture poste guichet
- Vente billet guichet
- Validation paiement guichet
- Clôture poste guichet
- Création shiftReport
- Calcul montant depuis réservations
- Validation poste par comptable agence
- Crédit caisse agence `accounts/agency_{agencyId}_cash`
- Passage statut `closed` → `validated_agency`

## Règles Firestore sensibles à protéger

Ne pas modifier sans test complet :

- `match /payments/{paymentId}`
- `match /accounts/{accountId}`
- `match /agences/{agencyId}/shifts/{shiftId}`
- `match /agences/{agencyId}/shiftReports/{reportId}`
- `match /agences/{agencyId}/reservations/{reservationId}`
- règles liées à `cashReceipts`
- règles liées à `comptaEncaissements`
- règles liées à `dailyStats`
- règles liées à `agencyLiveState`

## Fichiers métier sensibles à protéger

Ne pas modifier sans test complet :

- `src/modules/agence/services/sessionService.ts`
- `src/modules/agence/services/guichetReservationService.ts`
- `src/modules/agence/guichet/guichetSessionReservationModel.ts`
- `src/modules/agence/comptabilite/pages/AgenceComptabilitePage.tsx`
- `src/modules/agence/aggregates/dailyStats.ts`
- `src/modules/agence/aggregates/agencyLiveState.ts`

## Décisions stabilisées

- La clôture guichet calcule les montants depuis les réservations du poste.
- Ne pas dépendre de `financialTransactions` pour clôturer un poste guichet.
- La validation comptable crédite `accounts/agency_{agencyId}_cash`.
- Le comptable agence peut modifier uniquement les champs nécessaires du compte cash :
  - `balance`
  - `lastAccountantValidationShiftId`
  - `updatedAt`

## Tests obligatoires avant toute modification future

Avant de toucher à un fichier sensible ou à `firestore.rules`, exécuter :

1. Connexion guichetier
2. Ouverture poste
3. Vente billet
4. Paiement validé
5. Clôture poste
6. Connexion comptable agence
7. Validation poste
8. Vérification caisse agence
9. Vérification rapport poste
10. Vérification absence de `Missing or insufficient permissions`

## Règle de travail

Toute modification future sur ces fichiers doit être isolée dans une branche dédiée :

```bash
git checkout -b fix/nom-du-probleme