# TELIYA — Audit performance Dashboard agence

## Mesure statique

Le hook existant contient environ dix abonnements/lectures principales : shifts, réservations, réservations par session, sessions courrier, shipments origine/destination, weekly trips, affectations, trip instances/workflows et dépenses/finance. Le nombre exact varie avec les shifts actifs, car les réservations de session créent des listeners par poste.

Phase 6 :

- n’ajoute aucun listener, `getDocs`, collection group ou agrégat ;
- bloque le montage du hook si compagnie/agence/capacité manque ;
- réutilise les données chargées et limite la liste des départs à huit ;
- mémoïse le tri et l’enrichissement des départs ainsi que les accès rapides ;
- n’ajoute aucun graphique ni dépendance.

Risque restant : le hook historique est volumineux et charge plus de sources que la vue synthétique n’en affiche. Une optimisation future doit découper les abonnements par section, avec tests d’équivalence et sans toucher aux workflows gelés.
