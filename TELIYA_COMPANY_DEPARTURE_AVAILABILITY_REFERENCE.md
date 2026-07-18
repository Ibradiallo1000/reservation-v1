# Teliya — Disponibilité des départs publics

L’instance datée est prioritaire et remplace prix, statut, places et route du template. Une instance annulée est exclue. La clé template/date/heure évite le doublon.

Les templates servent de fallback lorsqu’aucune instance n’est matérialisée. Le jour de circulation vient de `horaires`; l’heure passée est évaluée dans la timezone de l’agence, avec fallback `Africa/Bamako`.

La capacité et les places utilisent exclusivement le service existant : `remainingSeats` d’instance, holds en ligne non expirés et logique segment existante. Aucun calcul `capacité - réservations` n’a été ajouté. Une valeur fiable à zéro désactive Réserver ; une valeur non numérique devient « Disponibilité à vérifier ».

Le service existant filtre déjà les départs sans place avant le rendu. Ils peuvent donc être absents plutôt qu’affichés complets ; modifier ce comportement relèverait d’une phase métier distincte.

