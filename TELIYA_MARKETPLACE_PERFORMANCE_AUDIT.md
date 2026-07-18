# Teliya — Audit performance Marketplace

## Budget de données

- 2 lectures ponctuelles en parallèle logique, 0 listener ;
- `weeklyTrips`: maximum 300 documents ;
- `companies`: maximum 24 documents, 12 cartes ;
- destinations: maximum 8 cartes ;
- aucune réservation, agence, prix, place ou donnée financière lue ;
- aucun N+1 ni requête par compagnie.

## Rendu et images

La page reste lazy-loaded par `AppRoutes`. Les logos existants ont dimensions 56×56, `loading=lazy`, `decoding=async` et fallback vectoriel local. Aucune image hero externe n’a été ajoutée faute de source validée. Aucun package ajouté.

## Mesures

Build Phase 7.2 : chunk Marketplace `17,57 kB`, `5,65 kB` gzip. CSS global `193,22 kB`, `30,25 kB` gzip. Le vendor historique reste à `4 150,18 kB`, `1 175,44 kB` gzip et déclenche l’avertissement Vite existant. CLS, LCP, poids réseau réel des logos et cache Firestore n’ont pas été mesurés par navigateur/Lighthouse.
