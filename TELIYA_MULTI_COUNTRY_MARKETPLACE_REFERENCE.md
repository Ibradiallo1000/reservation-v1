# Marketplace multi-pays

Les pays disponibles sont dérivés des compagnies actives, avec page publique, nom et slug valides, dont le pays est résolvable. Avec un seul pays, aucun sélecteur n’est affiché. Avec plusieurs pays, la sélection ISO est mémorisée dans `localStorage` sous une clé non sensible et reste modifiable; aucune géolocalisation n’est utilisée.

Le filtre s’applique en mémoire aux compagnies et aux trajets déjà lus; les villes et routes sont ensuite dérivées des trajets actifs du contexte. Il n’ajoute ni listener, ni requête par frappe, ni N+1. Une compagnie sans pays fiable reste compatible en accès direct, mais n’ajoute pas un pays au sélecteur.

Les pages tenant n’utilisent pas cette préférence globale. Le modèle ne portant pas de pays fiable pour chaque extrémité, les trajets internationaux ne sont pas déclarés supportés ni interdits artificiellement; leur classification reste différée.
