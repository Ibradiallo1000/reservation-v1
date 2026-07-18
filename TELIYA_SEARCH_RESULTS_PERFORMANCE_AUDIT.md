# Teliya — Performance des résultats

Budget : trois requêtes ponctuelles, zéro listener, zéro N+1, zéro réservation lue. Maximum : 300 `tripInstances` de la date, 500 `weeklyTrips`, 100 compagnies publiques. L’agrégation est pure en mémoire, de complexité linéaire avant tri des groupes.

La page reste lazy-loaded. Logos 56×56, lazy et décodés de façon asynchrone. Aucun package ajouté. Build Phase 7.3 : chunk `/resultats` 12,58 kB, 4,44 kB gzip ; CSS global 192,72 kB, 30,19 kB gzip. Le vendor historique reste à 4 150,18 kB, 1 175,44 kB gzip. Temps réseau, CLS et LCP ne sont pas mesurés sans navigateur.
