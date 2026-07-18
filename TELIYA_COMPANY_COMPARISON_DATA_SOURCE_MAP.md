# Teliya — Sources de la comparaison compagnie

| Champ affiché | Source | Filtre | Calcul | Lecture publique | Fallback | Confiance | Limitation |
|---|---|---|---|---|---|---|---|
| nom, slug, logo, devise | `companies` | active, publiée, slug présent | projection whitelistée | oui | logo vectoriel, devise XOF historique | élevée | 100 docs maximum |
| départs | `weeklyTrips` + `tripInstances` | même OD, date/jour, actif, non passé/annulé | fusion par créneau déterministe | oui | programmation seule signalée à confirmer | moyenne à élevée | 500 templates, 300 instances |
| prix minimum | prix positif de chaque offre fusionnée | valeur numérique > 0 | minimum par compagnie | oui | « Prix indisponible » | élevée pour instance, moyenne pour template | aucun frais additionnel reconstruit |
| prochain départ | heure normalisée | heure future si aujourd’hui | première heure triée | oui | champ masqué | élevée si instance, moyenne si template | fuseau navigateur pour aujourd’hui |
| nombre de départs | offres dédupliquées | créneaux compatibles seulement | taille du groupe compagnie | oui | compagnie absente si zéro | moyenne à élevée | instances non matérialisées viennent du planning |

Aucun identifiant technique, place, réservation, marge ou donnée financière n’est rendu.

