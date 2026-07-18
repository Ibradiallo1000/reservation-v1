# Teliya — Backlog de vérification backend booking

- confirmer l’atomicité métier globale entre réservation, `createPayment` et documents `publicReservations` ;
- confirmer l’idempotence backend en cas de coupure après la transaction réservation ;
- vérifier les Rules pour chaque lecture de restauration et chaque écriture du tunnel ;
- confirmer la validation serveur du montant, de la compagnie, de l’agence, de l’instance et de la disponibilité ;
- confirmer le cycle expiration/libération des holds lors de fermeture ou abandon ;
- confirmer les statuts exacts de paiement pending/refusé/preuve reçue ;
- vérifier que les snapshots publics exposent uniquement les champs nécessaires.

La Phase 7.5 n’a modifié aucune Rule, Function, collection, donnée, claim ou index.
