# TELIYA — Phase 2 — Audit des parcours utilisateurs et architecture UX cible

## 1. État initial

- Dossier : `C:\Users\DELL\Documents\Projects\Teliya`.
- Branche initiale : `refactor/phase-1-ui-security-foundations`.
- État Git initial : propre ; aucun changement applicatif non lié.
- Commits de référence présents : `8c642a93` (Phase 0) et `3c488acc` (Phase 1).
- Branche de travail : `audit/phase-2-user-journeys`, créée depuis l'état validé de Phase 1.
- Nature de l'intervention : audit documentaire uniquement. Aucun écran, route, guard, rôle, règle, index, collection, service, calcul, provider, Cloud Function ou workflow n'est modifié.

## 2. Références lues intégralement

Les documents suivants constituent la baseline :

- `TELIYA_PHASE_0_BASELINE_AUDIT.md`
- `TELIYA_PRODUCT_ARCHITECTURE_MAP.md`
- `TELIYA_ROUTE_ROLE_MATRIX.md`
- `TELIYA_DATA_MODEL_MAP.md`
- `TELIYA_WORKFLOW_REFERENCE.md`
- `TELIYA_UI_INVENTORY.md`
- `TELIYA_RISK_REGISTER.md`
- `TELIYA_MASTER_REFACTORING_PLAN.md`
- `TELIYA_FROZEN_MODULES.md`
- `TELIYA_PHASE_1_IMPLEMENTATION_REPORT.md`
- `docs/ACCOUNTING_SAFETY_PROTOCOL.md`
- `docs/KNOWN_BUGS_AND_FIXES.md`
- `docs/TELIYA_DESIGN_SYSTEM_FOUNDATIONS.md`
- `docs/TELIYA_UI_MIGRATION_RULES.md`

Les invariants retenus sont : réservation canonique ; tickets/reçus ; paiement opérateur ; cycles guichet et courrier ; comptabilité agence ; `financialTransactions`, comptes et ledger comme sources financières ; absence de reconstruction des soldes depuis réservations/paiements/UI.

## 3. Méthodologie

L'audit croise, pour chaque espace : rôle déclaré, rôle accepté par le guard, rôle exposé par le menu, route réellement montée, redirection après connexion, actions rendues par l'écran et contraintes documentées. Les sources inspectées incluent `AppRoutes.tsx`, rôle/permissions, `PrivateRoute`, `RoleLanding`, auth, layouts, sidebars, menus mobiles, headers, liens/CTA, aliases, routes publiques et pages principales plateforme, compagnie, agence, comptabilité, guichet, embarquement, courrier et escale.

Une route UI n'est pas considérée comme une preuve d'autorisation backend. Une page absente d'un menu n'est pas déclarée inutile sans analyser ses liens contextuels. Les recommandations séparent navigation, responsabilité et mutation métier.

Les détails complets sont répartis ainsi :

- carte opérationnelle : `TELIYA_USER_JOURNEY_MAP.md` ;
- architecture cible : `TELIYA_TARGET_INFORMATION_ARCHITECTURE.md` ;
- menus par rôle : `TELIYA_TARGET_NAVIGATION_BY_ROLE.md` ;
- anomalies : `TELIYA_UX_PROBLEM_REGISTER.md` ;
- séquencement : `TELIYA_PHASE_2_RECOMMENDATIONS.md`.

## 4. Utilisateurs identifiés

### Public

Visiteur de la landing SaaS, voyageur recherchant un trajet, visiteur d'une compagnie, client réservant/payant, client retrouvant ses réservations/billets et porteur de billet.

### Plateforme SaaS

`admin_platforme`, clairement séparé de l'administration d'une compagnie de transport.

### Compagnie

`admin_company`, `company_ceo`, rôles comptables compagnie/direction financière, `operator_digital` et rôles de supervision réseau admis par les guards. Les variantes de nom ne sont pas supposées équivalentes sans confirmation.

### Agence

`chefAgence`, `superviseur`, `agency_accountant`, `guichetier`, `chefEmbarquement`, `agentCourrier`, `escale_agent`, `escale_manager`, `agency_fleet_controller`, plus des alias historiques tels que `chefagence` ou `admin_compagnie` dans certains layouts.

## 5. Parcours public actuel

### Landing

Sur le domaine principal, `/` sert `HomePage`, une landing marketing longue orientée démonstration. Sur un sous-domaine, la même route délègue à `RouteResolver` et sert la page publique compagnie. Ce double sens est volontaire aujourd'hui mais doit être rendu explicite avant la Marketplace.

### Recherche multi-compagnies

Le flux réel confirmé est :

```text
/ → recherche → /resultats → choix compagnie
  → /:slug/booking?departure=…&arrival=…
```

`PlatformSearchResultsPage` lit d'abord `location.state`, puis `?from=&to=`. Il exige départ et arrivée, cherche les trajets et compagnies correspondants, puis ouvre directement le booking. La date demandée dans le parcours cible n'est ni lue par cette page ni transmise au booking. Le refresh n'est récupérable que si `from` et `to` figurent dans l'URL.

Le flux théorique fourni dans le mandat contient `/compagnie/:slug/resultats` et `/compagnie/:slug/booking`. Cette forme n'est pas canonique dans le code : `RouteResolver` attend `/:slug/resultats` et `/:slug/booking` ou les équivalents de sous-domaine. Il accepte bien `resultats`, mais la recherche plateforme contourne cette page.

### Réservation, confirmation et billets

Le résolveur public couvre résultats, booking, paiement, preuve, reçu/confirmation, détail/réservation, mes réservations, mes billets, récupération, aide, pages légales et connexion. Les routes de vente en ligne sont bloquées si l'option compagnie est désactivée. `ReservationClientPage` peut reprendre départ/arrivée dans l'URL et utilise également état/session storage pour accélérer ou restaurer le flux.

La rupture confirmée est le CTA compagnie qui fabrique `/compagnie/${slug}/resultats`. Dans l'architecture actuelle, `compagnie` est alors interprété comme slug. Les conventions de paramètres changent entre résultats et booking et la date reste locale, ce qui fragilise partage, retour arrière et reprise.

### États et erreurs

Critères absents, chargement, aucun résultat, erreur de lecture, compagnie introuvable, vente en ligne désactivée, réservation en cours récupérable et page inconnue sont représentés, mais la récupération n'est pas uniformisée. Le retour renvoie souvent à `/` plutôt qu'à une recherche éditable conservant tous ses critères.

### Changement futur, non implémenté

La cible confirmée est `/` = Marketplace publique et `/landing` = landing marketing actuelle. Ce déplacement appartient à une future phase Marketplace ; aucune route n'est déplacée ici.

## 6. Plateforme SaaS

Après connexion, `admin_platforme` est envoyé vers `/admin/dashboard`. Le shell expose Dashboard, Compagnies, Abonnements, Activité/revenus, Facturation/finances, Plans, Médias, Moyens de paiement et Paramètres. Les routes de gestion détaillée d'une compagnie sont correctement secondaires.

Deux domaines routés, `/admin/reservations` et `/admin/statistiques`, ne sont pas dans le menu principal. Ils sont donc non découvrables sans lien contextuel. `/debug-auth` est public et doit être revu sous l'angle sécurité/environnement. L'administration plateforme ne doit jamais être confondue avec `/compagnie/:companyId`, qui administre une entreprise de transport.

## 7. CEO / administrateur compagnie

L'entrée est `/compagnie/:companyId/command-center`. La navigation actuelle regroupe Dashboard, activité réseau, réservations, finances, agences, audit/contrôle, flotte, validation chef d'agence, clients, avis et configuration, avec filtrage Phase 1/feature flags. Plusieurs anciennes URLs redirigent vers des pages et onglets modernes.

La cible métier impose un consommateur de synthèses : activité réseau, performance agence, finances consolidées, trésorerie, alertes et configuration/activation des agences. Les pages de réservation et de performance peuvent servir de drill-down en lecture.

Le conflit majeur est la présence de `/payment-approvals`, des alias `ceo-expenses`/`expenses-approvals`, d'un compteur `pending_ceo` et d'un onglet dépenses. Ils installent le CEO dans une chaîne de validation opérationnelle explicitement interdite par la cible. La Phase 2 ne retire rien : elle demande une décision d'autorité et un audit Rules/services avant traitement.

## 8. Chef comptable compagnie

Les rôles financiers compagnie sont orientés vers `/compagnie/:companyId/accounting`. Le shell affiche Dashboard, Réseau financier, Trésorerie, Flux financiers et Rapports. Des routes secondaires couvrent comptabilité, dépenses, comptes/opérations de trésorerie, transferts, paiements fournisseurs, paramètres et diagnostics ; certaines sont masquées par le flag finance avancée mais restent montées.

Le rôle cible couvre comptes agence, banques, Mobile Money compagnie, fonds en transit, versements, rapprochements, anomalies et rapports réseau. Les écritures reposent exclusivement sur les services et sources comptables existants. Les réservations servent au contexte opérationnel, jamais à recalculer un solde.

Le problème UX principal est une taxonomie qui se chevauche (`finances`, `compta`, `trésorerie`, `flux`) et des actions secondaires difficiles à découvrir. Ce shell doit rester distinct du Command Center CEO.

## 9. Chef d'agence

`RoleLanding` envoie le chef vers `/agence/activite`. Son menu spécifique offre Dashboard, Finances/Caisse, Départs, Rapports, Équipe et Trajets. Le shell général possède aussi planning, arrivées, historique et modules opérationnels selon rôle et flags.

La cible de supervision requiert une vue du jour, départs, réservations, guichets, embarquement, courrier, équipe, rapports et configuration autorisée. Or plusieurs de ces domaines ne sont pas visibles dans le menu chef alors que des layouts/guards admettent ce rôle. L'accès doit être une transition explicite vers un espace spécialisé, pas une fusion de leurs workflows.

Deux risques de responsabilité persistent : le shell surveille des éléments `pending_manager`, et les routes `/agence/treasury/new-*` sont placées sous un guard agence large alors que les routes comptables équivalentes sont restreintes. Le chef doit seulement lire les informations financières autorisées et ne jamais effectuer réception, rapprochement ou validation comptable.

## 10. Comptable agence

L'entrée dédiée est `/agence/comptabilite`. L'écran reçoit et valide les sessions guichet/courrier, gère écarts, caisse, audits, rapprochements, historique/journal et rapports selon les services existants. Il valide la remise et constate la différence ; il ne remplace pas le guichetier ni l'agent courrier.

Le parcours métier est gelé. Le risque UX vient d'une page extrêmement longue et dense qui juxtapose nombreuses listes, actions, formulaires et modales. Une future migration doit uniquement segmenter l'information et conserver intégralement fonctions, transactions, statuts, calculs et sources de vérité.

## 11. Guichetier

Le guichetier entre directement dans `/agence/guichet`, sans shell agence général. Le parcours couvre poste/session, sélection trajet/date, client, réservation, encaissement, impression, suspension/reprise, fermeture, rapport et historique. Les raccourcis et l'impression font partie du poste de travail.

Le module est gelé. Son écran unique est dense mais cohérent avec une logique POS. Le rapport affiche néanmoins deux validations « Comptable » et « Chef », ce qui entre en conflit avec la séparation cible et doit être documenté avant toute modification. Les erreurs critiques à préserver sont session inactive, départ passé, trajet indisponible, paiement ou impression en échec.

## 12. Embarquement

`chefEmbarquement` est redirigé vers `/agence/boarding`. `BoardingLayout` admet aussi chef d'agence et certains rôles d'escale/administration. Les destinations Départs, Scan, Liste et Rapports utilisent un shell dédié ; Scan/Liste/Rapports partagent `/agence/boarding/scan?view=…`.

Le parcours couvre sélection du départ, préparation, contrôle par scan ou liste, anomalies et rapport/clôture selon les écrans existants. Sur mobile, le layout masque les tabs ; l'alternative de navigation doit être vérifiée, car Scan est l'action prioritaire. Caméra, échec de lecture et résultat de contrôle doivent disposer d'un retour visuel et accessible.

## 13. Courrier

Le parcours gelé relie deux agences : réception/enregistrement à A, session, expédition, arrivée/réception à B, remise au destinataire, clôture et rapport. L'espace fournit tableau, création, arrivées, remise, rapports/historique et une barre de session/POS.

L'agent courrier utilise un shell plein écran dédié. Des rôles de supervision peuvent y accéder depuis le shell agence selon conditions, créant un changement de contexte différent mais justifiable si explicite. Les statuts, reçus, paiements, contrôles et validations comptables restent inchangés. Les dépendances inter-agences imposent de garder origine, destination, référence et état visibles.

## 14. Escale

L'entrée est `/agence/escale`; le shell propose Dashboard, Bus du jour, Boarding, Manifeste, Caisse et Équipe. La destination Équipe pointe vers `/agence/team`, rendue par `ManagerShell`. Un agent d'escale passe donc entre deux shells et deux navigations pour un même espace. La cible conserve Équipe dans le shell Escale et différencie agent/manager par permissions confirmées.

## 15. Autres rôles et modules différés

`superviseur` est admis dans le shell agence, mais ne doit pas hériter par présomption de toutes les actions du chef. `agency_fleet_controller` est envoyé vers `/agence/fleet` alors que la feature flotte est désactivée et retirée de la navigation : la redirection est incohérente.

Garage, flotte, maintenance, transit, incidents, conformité, urgence, équipages et logistique avancée sont différés. Les routes garage/flotte visibles ne les rendent pas actives. Le courrier actif est un sous-domaine logistique gelé et ne doit pas être confondu avec ces extensions.

## 16. Incohérences de rôles, routes et navigation

Les divergences les plus structurantes sont :

1. alias de rôles non uniformes entre constantes, permissions, routes, layouts et Rules ;
2. routes de trésorerie agence sous deux espaces et guards différents ;
3. CEO présenté comme approbateur de dépenses ;
4. rôle flotte redirigé vers une feature différée ;
5. chef d'agence sans navigation vers plusieurs responsabilités de supervision ;
6. Escale divisé entre deux shells ;
7. résultats/booking publics avec forme d'URL et paramètres incompatibles ;
8. nombreuses routes aliases qui cachent la route canonique.

Le registre complet classe 2 problèmes critiques, 8 élevés, 13 moyens et 3 faibles. Les pages candidates « orphelines » restent des hypothèses prudentes : résultats compagnie contournés, réservations/statistiques plateforme non exposées, pages secondaires comptables et détails agence accessibles sans destination principale.

## 17. Navigation actuelle et doublons

- Plateforme : revenus/activité et finances/facturation ont besoin d'une frontière terminologique ; réservations/statistiques manquent au menu.
- CEO : dashboard/command-center, trésorerie/liquidités/caisse, opérations/réservations réseau, comptabilité/audit et dépenses/approbations sont dupliqués par alias/onglets.
- Agence : dashboard/activité, opérations, finances/caisse, expenses et treasury se recouvrent.
- Comptabilité compagnie : finances, compta, treasury et flux ne forment pas une hiérarchie visible.
- Embarquement : trois destinations sur une route paramétrée.
- Public : `/resultats`, `/:slug/resultats` et booking direct représentent deux variantes de sélection compagnie.

Les aliases ne sont pas supprimés ici. La cible distingue routes canoniques, secondaires et compatibilité.

## 18. Responsive

Les shells ont des adaptations mobiles, mais leur cohérence n'est pas garantie entre espaces. Les risques prioritaires concernent : tables comptables et administratives larges ; pages monolithiques ; actions hors champ ; tabs d'embarquement masquées ; changement de shell Escale ; différence de navigation Courrier selon rôle ; barre publique qui disparaît pendant le booking.

La cible impose les mêmes domaines desktop/mobile, quatre destinations mobiles prioritaires, une action principale dans le contenu, des détails séparés pour les tables, et un contexte persistant (compagnie/agence, session, départ ou bus actif).

## 19. Accessibilité

Les composants existants incluent des labels ARIA ponctuels et raccourcis, mais aucune preuve globale ne garantit WCAG 2.2 AA. Les points à auditer en Phase 3 sont : focus trap et restauration dans les modales/drawers ; fermeture Échap ; navigation clavier ; annonce des chargements/erreurs/scans/paiements ; contraste ; statuts non fondés uniquement sur couleur ; cibles tactiles ; zoom 200 % ; mouvement réduit ; ordre des titres dans les pages longues.

Les écrans guichet, courrier, comptabilité et embarquement exigent un protocole de test spécifique, car l'accessibilité ne doit pas changer le moment ou la nature d'une mutation métier.

## 20. Architecture cible

Neuf espaces sont retenus : Public, Plateforme, Compagnie/Command Center, Comptabilité compagnie, Agence/Supervision, Comptabilité agence, Guichet, Embarquement, Courrier et Escale (Escale constituant le neuvième espace agence spécialisé si Compagnie et sa comptabilité sont comptés ensemble). Chacun possède un rôle principal, un point d'entrée, un shell et une navigation cohérente.

Le CEO consulte ; le chef comptable consolide et opère la finance compagnie ; le chef d'agence supervise ; le comptable agence reçoit et rapproche ; guichetier, embarquement, courrier et escale exécutent leurs tâches dédiées. Le super administrateur administre le SaaS, jamais l'exploitation d'une compagnie.

La structure détaillée et les routes principales/secondaires/interdites figurent dans `TELIYA_TARGET_INFORMATION_ARCHITECTURE.md`. Les menus exacts figurent dans `TELIYA_TARGET_NAVIGATION_BY_ROLE.md`.

## 21. Priorités

### Critique

- auditer et aligner les routes de mutation trésorerie agence ;
- sortir le CEO de toute présentation de validation de dépenses ;
- établir la matrice canonique rôle → guard → action → règle.

### Élevée

- réparer dans une phase autorisée la construction d'URL publique et la persistance des critères ;
- corriger le landing du rôle flotte désactivé ;
- rendre la supervision chef d'agence découvrable sans lui donner d'action comptable ;
- unifier le shell Escale ;
- préparer prudemment la segmentation visuelle de la comptabilité agence ;
- clarifier la chaîne de validation présentée au guichet.

### Moyenne/faible

Canoniser aliases, terminologie, pages secondaires et navigation mobile, puis traiter accessibilité et dette de cohérence avec tests de parcours.

## 22. Préparation de la Phase 3

La Phase 3 doit commencer par la taxonomie et les composants de shell sur un périmètre non métier : Plateforme puis synthèse en lecture seule. Elle ne doit pas commencer par la comptabilité, le guichet, le courrier ou un nouveau Command Center. Avant la première migration, la matrice rôle/route/action/Rules et la décision sur les validations CEO/chef doivent être validées.

Le déplacement de la landing et la Marketplace restent réservés à la phase publique dédiée. Les modules différés restent inactifs.

## 23. Garantie de non-régression métier

Cette Phase 2 ne modifie aucun fichier applicatif. Aucun workflow, statut, calcul, provider, service, Cloud Function, route, alias, rôle, guard, règle Firestore, index, collection ou permission n'a changé. Les modules gelés ont uniquement été lus et cartographiés.
