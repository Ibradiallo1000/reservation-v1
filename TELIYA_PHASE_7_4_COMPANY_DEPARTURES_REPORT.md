# Teliya — Rapport Phase 7.4

La page tenant de résultats affiche uniquement les départs de la compagnie, de l’OD et de la date sélectionnées. Elle réutilise le service de disponibilité existant, ajoute une projection pure, une déduplication défensive, deux tris et des états publics accessibles.

Le passage à la réservation conserve la route et le `location.state` historiques. Les critères publics restent dans l’URL ; aucun identifiant technique n’y est ajouté. Le tunnel, ses écritures, statuts, prix et paiements ne sont pas modifiés.

La décision « heure passée » du service emploie désormais la timezone agence et le fallback existant cohérent `Africa/Bamako`, ce qui corrige la dépendance au fuseau du navigateur sans modifier les données.

Les aliases `/:slug/resultats`, sous-domaines et domaines personnalisés restent gérés par `RouteResolver`. La route `/compagnie/:slug/resultats` conserve sa traduction compatible Phase 7.1.

