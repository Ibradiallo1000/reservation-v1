# Teliya — Rapport Phase 7.6

La Phase 7.6 restaure une saisie de villes vérifiée et consolide les sources existantes. Les villes Marketplace viennent uniquement de trajets actifs appartenant à des compagnies publiques éligibles. La page directe d’une compagnie ne propose que les villes observées dans son propre réseau.

La section partenaires ne dépend plus d’un échantillon de trajets ni d’une limite de 24 compagnies. Elle conserve les filtres métier `actif`, page publique, nom et slug, tout en autorisant un partenaire sans trajet. Les résultats opérationnels restent stricts.

Les aliases `departureCity/arrivalCity`, `departure/arrival` et `depart/arrivee` sont adaptés en lecture. Aucun modèle Firestore, index, Rule, workflow de réservation, paiement, statut, prix ou disponibilité n’est modifié.

Le contexte international reste volontairement différé : `pays` est un libellé libre et aucun code ISO obligatoire n’est prouvé. Aucun fallback pays silencieux ni liste codée en dur n’a été ajouté.
