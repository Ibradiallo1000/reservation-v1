# Teliya — Référence du tunnel public de réservation

## Parcours réel conservé

`Départ exact → quantité de billets et passager → création de la réservation/hold → moyen de paiement → preuve éventuelle → confirmation/reçu/billet`.

Le tunnel ne possède pas de plan de sièges numérotés. Le contrôle existant porte sur une quantité (`seatsGo`, `seatsHeld`) comparée à la disponibilité de l’instance et aux holds en ligne. La Phase 7.5 n’ajoute donc ni numéro de siège ni nouveau multi-passager.

| Étape | Composant | Entrées | Persistance | Écriture | Risque refresh | Décision 7.5 |
|---|---|---|---|---|---|---|
| départ/passager | `ReservationClientPage` | URL, state, service public | sélection minimale en session | aucune avant validation | départ remplacé historiquement | restauration exacte |
| création | `ReservationClientPage` | départ relu, nom, téléphone, quantité | pointeur réservation local après succès | réservation, paiement pending, pointeurs publics | double clic | verrou UI conservé |
| paiement | `PaymentMethodPage` | id, companyId, agencyId | pointeur existant | workflow existant | contexte local requis | inchangé |
| preuve | `UploadPreuvePage` | réservation et moyen | workflow existant | preuve/statuts existants | reprise par id | inchangé |
| confirmation/billet | `ReceiptEnLignePage`, `ReservationDetailsPage`, `TicketOnline` | réservation relue | token/pointeur existant | initialisation payment existante possible | fallback public existant | présentation inchangée |

Routes : `/:slug/booking`, `/booking` sur domaine tenant, alias historique `/:slug/reserver`, `/reservation?slug=...`, puis `payment`, `upload-preuve`, `receipt`/`confirmation`, `reservation/:id`, `mon-billet`.
