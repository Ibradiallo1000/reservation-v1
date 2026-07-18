# Teliya — Données et écritures du booking

| Étape/action | Collection, service ou Function | Payload/statut | Idempotence/erreur | Modification 7.5 |
|---|---|---|---|---|
| lire compagnie/départs | `companies`, `buildValidTripsFromWeeklyTrips` | lecture publique existante | erreurs UI | aucune écriture |
| matérialiser instance si nécessaire | `getOrCreateTripInstanceForSlot` | contrat existant | service existant | aucune |
| créer réservation/hold | `companies/{companyId}/agences/{agencyId}/reservations` | `en_attente`, `seatHoldOnly`, `seatsHeld` | transaction + verrou UI | aucune |
| paiement pending | `createPayment` | montant XOF et provider existants | limite backend documentée | aucune |
| exposition publique | `publicReservations/{token}` et `{reservationId}` | snapshot/pointeur existants | après réservation | aucune |
| preuve | `UploadPreuvePage` et services existants | statuts existants | validation existante | aucune |
| reçu/billet | services de résolution existants | lecture, QR existant | fallback existant | aucune |

Aucun payload, calcul, statut, hold, délai, paiement, QR, billet, reçu ou référence n’a été modifié.
