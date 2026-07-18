# Teliya — Performance des résultats compagnie

La page effectue un appel au service public existant. Celui-ci réalise une lecture bornée des instances, une lecture des agences, les lectures historiques des templates par agence et la lecture bornée des holds. Aucun listener ni requête par carte n’est ajouté par la Phase 7.4.

La structure historique des templates entraîne un N par agence dans le service préexistant. Cette phase ne crée pas ce N+1 et ne peut le supprimer sans nouvelle source publique/indexée ou migration de données, interdite ici.

Fusion et tri sont linéaires puis `n log n`, avec 100 résultats maximum. Logos bornés 56×56. La page est intégrée au chunk tenant `RouteResolver` : 12,58 kB, 4,94 kB gzip. CSS global : 192,97 kB, 30,22 kB gzip. Réseau, CLS et LCP non mesurés sans navigateur.
