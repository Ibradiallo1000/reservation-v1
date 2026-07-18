# Rapport de dry-run du backfill pays

Le moteur pur `buildCountryBackfillPlan` classe chaque fixture en `already-canonical`, `proposed` ou `unresolved`. Une proposition contient uniquement `countryCode`; elle ne supprime aucun ancien champ et ne touche ni agence, trajet, prix, paiement ou réservation. Les tests prouvent l’idempotence et le refus d’une valeur inconnue.

Aucune donnée staging réelle n’a été lue et aucune écriture n’a été exécutée : l’accès Firebase CLI de cet environnement est bloqué par la chaîne TLS locale (`unable to verify the first certificate`). Il n’existe donc aucun nombre réel de documents à déclarer et aucune ambiguïté réelle n’a été arbitrée.
