# TELIYA — Registre des problèmes UX

## Échelle

- **Critique :** risque d'accès/action hors responsabilité, parcours vital impossible ou ambiguïté touchant la sécurité métier.
- **Élevée :** parcours principal interrompu, rôle mal orienté, navigation essentielle absente ou dette majeure sur un écran sensible.
- **Moyenne :** friction récurrente, incohérence d'information ou défaut responsive/accessibilité important sans blocage systématique.
- **Faible :** cohérence, libellé ou finition à traiter après les risques supérieurs.

Les constats d'accès décrivent les guards applicatifs observés, pas une preuve d'autorisation Firestore. Aucun problème n'est corrigé dans cette phase.

| ID | Gravité | Catégorie | Constat vérifié | Impact | Cible recommandée |
|---|---|---|---|---|---|
| UX-001 | Critique | route accessible au mauvais rôle / responsabilité mélangée | Les routes directes `/agence/treasury/new-*` sont sous le guard/shell agence large, alors que leurs équivalents `/agence/comptabilite/treasury/*` sont réservés aux rôles comptables. | Un rôle opérationnel peut atteindre une UI de mutation financière ; la protection Rules reste à confirmer. | Audit sécurité dédié puis une route canonique sous l'espace comptable. |
| UX-002 | Critique | responsabilité mélangée | Le CEO dispose de routes/concepts `payment-approvals`, `expenses-approvals`, `ceo-expenses`, d'un compteur `pending_ceo` et d'onglets dépenses. | Le rôle exécutif est présenté comme validateur opérationnel, contrairement au rôle cible confirmé. | Command Center en synthèse/alertes ; décisions financières dans l'espace comptable autorisé. |
| UX-003 | Élevée | parcours interrompu | Le CTA compagnie navigue vers `/compagnie/:slug/resultats`, mais le résolveur canonique attend `/:slug/resultats`; `compagnie` devient le slug. | CTA public potentiellement dirigé vers une compagnie introuvable. | Canoniser la construction d'URL publique dans la phase Marketplace. |
| UX-004 | Élevée | dépendance à `location.state` / récupération | `/resultats` accepte l'état ou `?from=&to=` ; la date n'est pas persistée/transmise et les noms changent en booking (`departure`, `arrival`). | Rafraîchissement, partage, retour et modification de recherche produisent des résultats non reproductibles. | Schéma d'URL public canonique incluant départ, arrivée, date. |
| UX-005 | Élevée | redirection incohérente | `agency_fleet_controller` atterrit sur `/agence/fleet` alors que la flotte est désactivée et filtrée de la navigation. | L'utilisateur arrive dans un module différé sans chemin stable. | Aligner landing et feature flag avant activation du rôle. |
| UX-006 | Élevée | navigation absente | Le menu chef d'agence n'expose pas Réservations, Guichets, Embarquement ou Courrier, bien que le rôle soit admis dans plusieurs routes. | Supervision quotidienne fragmentée et dépendante d'URL/liens indirects. | Hub agence et transitions explicites vers les espaces spécialisés. |
| UX-007 | Élevée | rôles incohérents | Rôles et alias divergent entre constantes, permissions, `PrivateRoute`, layouts et Rules (`admin_company`/`admin_compagnie`, casse chef d'agence, variantes comptables). | Menus, redirections, routes et backend peuvent interpréter différemment la même personne. | Matrice canonique rôle → route → action → règle avant Phase 3. |
| UX-008 | Élevée | plusieurs shells | L'escale utilise `EscaleLayout`, mais « Équipe » ouvre `/agence/team` dans `ManagerShell`. | Perte de contexte, navigation mobile et retour incohérents. | Maintenir Équipe dans le shell Escale ou justifier explicitement le changement. |
| UX-009 | Élevée | page trop longue / surcharge cognitive | `AgenceComptabilitePage` concentre réception guichet/courrier, caisse, audits, rapprochements, rapports et nombreuses modales dans plusieurs milliers de lignes/UI. | Risque d'erreur élevé sur un domaine financier gelé, particulièrement mobile et clavier. | Découpage de présentation progressif, services/calculs inchangés, tests de non-régression. |
| UX-010 | Élevée | responsabilité mélangée | Les rapports guichet exposent encore les états « Comptable » puis « Chef » et le shell agence surveille `pending_manager`. | Le modèle mental suggère une seconde validation managériale et rapproche chef/comptable. | Documenter l'autorité réelle puis retirer seulement la présentation obsolète dans une phase sécurisée. |
| UX-011 | Moyenne | navigation absente | `/admin/reservations` et `/admin/statistiques` sont routées mais absentes de la sidebar plateforme. | Fonctions non découvrables, accès par URL seulement. | Regrouper sous Supervision ou retirer après preuve d'inutilité. |
| UX-012 | Moyenne | alias ambigu / doublon | CEO : `dashboard`, `treasury`, `caisse`, `revenus-liquidites`, `operations-reseau`, `fleet`, `comptabilite` et variantes redirigent vers pages/onglets multiples. | URLs et breadcrumbs ne révèlent pas la hiérarchie ; maintenance et analytics fragmentés. | Route canonique par responsabilité, inventaire de compatibilité séparé. |
| UX-013 | Moyenne | alias ambigu / doublon | Agence : `dashboard`, `operations`, `finances`, `expenses`, `treasury` coexistent avec les destinations actives. | Même concept accessible sous plusieurs noms et parfois sous guards différents. | Canoniser après audit de liens entrants et permissions. |
| UX-014 | Moyenne | page orpheline / flux doublonné | `ResultatsAgencePage` est routée par `/:slug/resultats`, mais la recherche plateforme choisit directement `/:slug/booking`. | Étape prévue dans le parcours demandé mais contournée dans le parcours réel. | Décider si résultats compagnie est une vraie étape ou une route de compatibilité. |
| UX-015 | Moyenne | navigation absente | Routes comptables compagnie de détail/opération, paramètres et diagnostics ne sont pas toutes représentées dans le menu ; certaines sont masquées par flags sans être démontées. | Faible découvrabilité et comportement différent par URL directe. | Séparer destinations principales, secondaires et détails ; aligner flags. |
| UX-016 | Moyenne | sécurité/navigation | `/debug-auth` est publiquement routée. | Surface de diagnostic visible hors espace d'administration, même si elle ne prouve pas une fuite de données. | Revue sécurité ; environnement dev ou guard plateforme. |
| UX-017 | Moyenne | responsive | `BoardingLayout` demande `hideTabsOnMobile` alors que Scan/Liste/Rapports sont le cœur du travail. | Fonctions prioritaires potentiellement moins découvrables sur le terminal le plus pertinent. | Barre mobile dédiée avec Scan prioritaire. |
| UX-018 | Moyenne | état ambigu | Scan, Liste et Rapports utilisent tous `/agence/boarding/scan?view=…`. | État actif, partage, analytics et retour arrière reposent sur un paramètre. | Garder un contrôleur unique si utile, mais rendre tabs, titre et URL cohérents. |
| UX-019 | Moyenne | accessibilité | Plusieurs modules opérationnels utilisent modales, raccourcis et shells ad hoc sans preuve systématique de focus trap, restauration du focus, fermeture Échap et annonce d'erreur. | Utilisation clavier/lecteur d'écran incertaine sur actions critiques. | Audit WCAG écran par écran avant migration visuelle. |
| UX-020 | Moyenne | responsive | Pages comptables, administration et rapports reposent sur tableaux denses et actions multiples. | Défilement horizontal, actions hors champ et perte de contexte sur mobile. | Cartes/lignes adaptatives, colonnes prioritaires, détail séparé. |
| UX-021 | Moyenne | action sans retour | Scroll CTA marketing vers `lead-form` ne donne aucun retour si la cible est absente ; plusieurs actions asynchrones sont dispersées dans des pages monolithiques. | Clic silencieux ou état de succès/échec difficile à rattacher à l'action. | Retour local, focus sur message et reprise explicite. |
| UX-022 | Moyenne | terme métier ambigu | `Finances`, `Caisse`, `Trésorerie`, `Compta`, `Flux`, `Réseau financier` se recouvrent selon espace et alias. | Mauvaise destination et compréhension erronée de la source de vérité. | Glossaire : caisse locale, trésorerie consolidée, flux/transactions, comptabilité/contrôle. |
| UX-023 | Moyenne | navigation incohérente | Courrier a un shell dédié pour l'agent mais peut être atteint via le shell agence par des superviseurs. | Retour et repères varient selon rôle pour le même domaine gelé. | Transition d'espace explicite ; ne pas fusionner le workflow courrier. |
| UX-024 | Faible | page orpheline potentielle | Activity log, agent history, cash sessions/receipt/print et certaines pages détails sont routées mais rarement exposées comme destinations. | Dette de navigation, sans preuve suffisante pour suppression. | Classer comme détails contextuels et mesurer les liens entrants avant décision. |
| UX-025 | Faible | cohérence | Mélange français/anglais : Dashboard, Boarding, Command Center, Digital Cash, Audit & contrôle. | Taxonomie moins claire pour les équipes terrain. | Lexique français stable, noms techniques conservés hors UI. |
| UX-026 | Faible | accessibilité | Navigation par icône et états couleur/statut nécessitent validation des libellés, contrastes et équivalents textuels. | Ambiguïté pour basse vision/lecteur d'écran. | Critères WCAG 2.2 AA et libellés visibles/ARIA cohérents. |

## Pages orphelines : niveau de preuve

Aucune page n'est déclarée supprimable sur le seul fait qu'elle manque dans une sidebar. Les candidats confirmés comme **non découvrables ou contournés** sont les résultats compagnie dans le flux plateforme, les réservations/statistiques plateforme, plusieurs routes secondaires comptables et des pages de détail agence. Ils doivent être classés « détail contextuel », « compatibilité » ou « à retirer » après analyse des liens entrants et de l'usage réel.

## Ordre de traitement recommandé

1. UX-001, UX-002 et UX-007 : matrice sécurité/responsabilités.
2. UX-003 à UX-006 et UX-008 : continuité des entrées et parcours prioritaires.
3. UX-009, UX-010 : présentation des domaines financiers/gelés avec filet de non-régression.
4. UX-011 à UX-018 : canonisation navigation/routes et responsive.
5. UX-019 à UX-026 : accessibilité, terminologie et dette secondaire.
