# Teliya — Rapport Phase 7.5

La Phase 7.5 corrige la perte du départ choisi : le contrat Phase 7.4 est désormais lu, sauvegardé pour la session et restauré exactement après refresh via `state → session → URL → service public`. Aucun autre horaire n’est choisi silencieusement. Le départ relu reste l’autorité frontend actuelle ; un changement de prix est annoncé sans nouveau calcul.

La modernisation reste ciblée : progression textuelle, état indisponible actionnable, messages accessibles et champs passager mieux associés. Le workflow réel ne comportant pas de plan numéroté, la quantité et les holds existants sont conservés sans inventer un choix de siège.

Fichiers métier d’écriture modifiés : aucun. Routes, aliases, paiements, confirmation, reçu, billet et QR sont conservés. Tests unitaires ajoutés pour state, session/contrat pur, URL minimale, refus de substitution et changement de prix.

Limites : recette navigateur, paiement réel, expiration de hold, lecteur d’écran et mesures de bundle/réseau non exécutés ici. Ces scénarios appartiennent à la recette E2E Phase 7.6.
