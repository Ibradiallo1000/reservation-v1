# Teliya — Restauration de l’état booking

| Source | Priorité | Données | Validation | Échec |
|---|---:|---|---|---|
| `location.state.tripData` | 1 | slug, OD, date, heure, ids techniques, agence, prix | contrat strict puis comparaison aux départs relus | source suivante |
| `sessionStorage` | 2 | même sélection minimale, sans passager | parsing strict et comparaison au service | source suivante |
| URL | 3 | slug tenant, départ, arrivée, date, heure | correspondance exacte OD/date/heure | état indisponible |
| service public existant | 4 | offre actuelle | instance/template, horaire, disponibilité et prix existants | refus explicite |

Clé : `public_booking_selection_v1_<slug>`. Durée : session navigateur. Le cache est remplacé lors d’un changement volontaire de créneau. Nom, téléphone, paiement et réservation ne sont jamais placés dans cette clé ou dans l’URL.

Une sélection exacte introuvable n’est jamais remplacée par le premier départ. L’interface affiche « Ce départ n’est plus disponible » avec retour aux départs et nouvelle recherche. Un prix différent est signalé ; seul le prix actuel issu du workflow existant est utilisé.
