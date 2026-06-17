# TELIA - Roadmap MVP Billetterie, Courrier et Caisse

**Objectif Phase 1 :** rendre TELIA commercialisable autour de quatre blocs visibles : billetterie, courrier/colis, caisse simplifiee et dashboards.  
**Contraintes :** aucune suppression de code, aucune suppression de route, aucune suppression de collection Firestore.

## 1. Produit cible Phase 1

Une compagnie doit pouvoir utiliser TELIA pour :

1. vendre des billets en ligne et au guichet ;
2. valider les paiements en ligne ;
3. embarquer les passagers avec liste et scan QR ;
4. envoyer, recevoir et remettre des courriers/colis ;
5. ouvrir, suivre et cloturer la caisse ;
6. consulter les dashboards agence et compagnie.

## 2. Socle billetterie

| Domaine | Capacites conservees visibles | Pages principales |
|---|---|---|
| Reservation en ligne | Recherche, choix trajet, paiement, preuve, billet | `PublicCompanyPage`, `ReservationClientPage`, `PaymentMethodPage`, `UploadPreuvePage`, `ReservationDetailsPage`, `ReceiptEnLignePage` |
| Vente guichet | Session, vente, paiement, recu, impression | `AgenceGuichetPage`, `ReceiptGuichetPage`, `ReservationPrintPage` |
| Validation digitale | File paiements en ligne, validation/rejet, ecriture caisse | `DigitalCashReservationsPage` |
| Departs | Validation depart, bus du jour, manifeste | `AgencyDepartureValidationsPage`, `EscaleBusDuJourPage`, `BusPassengerManifestPage` |
| Embarquement | Liste passagers, scan billets, cloture | `BoardingDashboardPage`, `BoardingScanPage`, `BoardingEscalePage` |
| Rapports | Ventes agence et activite reseau | `ManagerReportsPage`, `ReservationsReseauPage`, `CompagnieReservationsPage` |

## 3. Socle courrier / colis

| Domaine | Capacites conservees visibles | Pages principales |
|---|---|---|
| Expedition | Creation envoi, session courrier | `CourierSessionPage`, `CourierCreateShipmentPage` |
| Reception | Arrivages et controle reception | `CourierReceptionPage` |
| Remise | Remise au destinataire | `CourierPickupPage` |
| Lots | Regroupement operationnel | `CourierBatchesPage` |
| Historique | Recherche et suivi interne | `CourierHistoriquePage` |
| Rapports | Rapports courrier | `CourierReportsPage` |
| Tracking public | Recherche colis publique | `TrackShipmentFindPage`, `TrackShipmentPage` |

## 4. Caisse simplifiee

| Domaine | Capacites conservees visibles | Collections principales |
|---|---|---|
| Ouverture caisse | Ouverture session guichet/courrier | `shifts`, `courierSessions`, `cashSessions` |
| Encaissements | Billets guichet, paiements online valides, courrier | `cashTransactions`, `payments`, `reservations` |
| Reception fonds | Suivi caisse agence et escale | `cashClosures`, `shiftReports`, `dailyStats` |
| Cloture caisse | Declaration, ecart, historique | `shiftReports`, `cashClosures`, `cashSessions` |
| Historique caisse | Journal sessions et agents | `agentHistory`, `activityLogs`, `dailyStats` |

## 5. Dashboards Phase 1

| Dashboard | Objectif |
|---|---|
| Dashboard agence | Activite du jour, caisse, ventes, courrier, alertes simples |
| Dashboard compagnie | Activite reseau, ventes, paiements, agences, indicateurs de caisse |

Les dashboards doivent rester lisibles et operationnels. Les indicateurs avances lies a flotte, maintenance, rentabilite, risques, depenses et consolidation financiere ne sont pas prioritaires en Phase 1.

## 6. Hors scope Phase 1

Les modules suivants restent dans le code, mais ne doivent plus structurer l'interface utilisateur standard :

- garage ;
- flotte avancee ;
- vehicules ;
- maintenance ;
- transit ;
- conformite vehicules ;
- incidents ;
- affectation vehicules ;
- validation logistique ;
- arrivees attendues ;
- equipage ;
- depenses et charges ;
- audit financier ;
- controle financier avance ;
- consolidation financiere complexe.

## 7. Ordre de stabilisation recommande

1. Verifier le parcours reservation en ligne jusqu'au billet.
2. Verifier la vente guichet, le recu et l'impression.
3. Verifier la validation operateur digital et l'ecriture caisse.
4. Verifier l'embarquement : liste, scan, statut passager.
5. Verifier le courrier : expedition, reception, remise, rapports.
6. Verifier la caisse : ouverture, encaissements, cloture, historique.
7. Verifier les dashboards agence et compagnie avec donnees reelles.

## 8. Critere de sortie Phase 1

La Phase 1 est stable quand une compagnie pilote peut executer une journee complete :

`vente billet + validation paiement + embarquement + courrier + cloture caisse + consultation dashboard`

sans utiliser les modules ERP avances.
