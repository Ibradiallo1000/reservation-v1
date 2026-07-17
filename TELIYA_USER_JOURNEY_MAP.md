# TELIYA — Carte des parcours utilisateurs

## Légende et limites

Cette carte décrit le comportement observé dans le code au 17 juillet 2026. Elle ne crée aucune permission. Une capacité est dite « confirmée » lorsqu'elle est visible dans une route, un guard et/ou l'écran concerné. Les opérations financières restent soumises aux protocoles existants. Les modules guichet, comptabilité et courrier sont cartographiés sans modification.

États : **stable** = parcours exploitable ; **gelé** = fonctionnel et exclu des refontes fonctionnelles ; **à corriger** = rupture UX ou incohérence ; **différé** = route ou domaine hors phase active.

## Vue synthétique

| Espace | Utilisateur | Entrée observée | But principal | Sortie attendue | État |
|---|---|---|---|---|---|
| Public | Visiteur marketing | `/` sur domaine principal | Comprendre Teliya, demander une démo | Formulaire de contact | stable, futur déplacement |
| Public | Voyageur | `/` ou page publique compagnie | Rechercher, réserver, payer, retrouver un billet | Confirmation, reçu, billet | à corriger |
| Plateforme | `admin_platforme` | `/admin/dashboard` | Administrer le SaaS, compagnies et abonnements | Configuration ou décision de supervision | stable avec navigation incomplète |
| Compagnie | `admin_company`, `company_ceo` | `/compagnie/:companyId/command-center` | Consulter la performance consolidée | Décision et drill-down | à corriger |
| Compagnie finance | chef comptable et rôles comptables compagnie | `/compagnie/:companyId/accounting` | Piloter trésorerie, flux et rapports réseau | Opération financière tracée ou rapport | gelé sur le métier |
| Compagnie | `operator_digital` | `/compagnie/:companyId/digital-cash` | Suivre et traiter les encaissements digitaux | Paiement contrôlé | stable à documenter davantage |
| Agence | `chefAgence` | `/agence/activite` | Superviser l'activité quotidienne | Départ et équipe supervisés | à corriger |
| Agence finance | `agency_accountant` | `/agence/comptabilite` | Réceptionner et valider les remises | Session et caisse rapprochées | gelé |
| Guichet | `guichetier` | `/agence/guichet` | Vendre et clôturer son poste | Billet/reçu et rapport de poste | gelé |
| Embarquement | `chefEmbarquement` | `/agence/boarding` | Préparer et contrôler un départ | Embarquement contrôlé | stable |
| Courrier | `agentCourrier` | `/agence/courrier` | Enregistrer, expédier, recevoir et remettre | Colis remis et session clôturée | gelé |
| Escale | `escale_agent`, `escale_manager` | `/agence/escale` | Gérer bus, manifeste, embarquement et caisse d'escale | Passage d'escale traité | à corriger (deux shells) |
| Flotte | `agency_fleet_controller` | `/agence/fleet` | Domaine flotte | — | différé, entrée active incohérente |

## J01 — Visiteur de la landing marketing

- **Objectif :** comprendre l'offre SaaS et demander une démonstration.
- **Entrée :** `/` sur le domaine principal ; `SubdomainAwareHome` sert la page compagnie sur un sous-domaine.
- **Préconditions :** aucune.
- **Étapes/pages :** `HomePage` → sections produit → CTA → formulaire `lead-form`.
- **Actions :** consulter l'offre ; action principale, demander une démo.
- **Données :** contenu marketing ; saisie du lead dans le formulaire associé.
- **Résultat/sorties :** demande envoyée ou navigation vers les liens de pied de page.
- **Erreurs :** CTA final sans effet visible si `lead-form` absent ; changement de contexte entre domaine principal et sous-domaine.
- **Permissions :** publiques.
- **UX/responsive/accessibilité :** page longue ; navigation et hiérarchie à revalider lors de la phase Marketplace ; scroll programmatique sans retour si la cible manque.
- **Risque :** `/` doit devenir la Marketplace et cette landing `/landing`, mais aucun déplacement n'est autorisé ici.
- **État :** stable, changement futur documenté.

## J02 — Recherche publique multi-compagnies

- **Objectif :** trouver les compagnies proposant un trajet.
- **Entrée :** recherche publique puis `/resultats`.
- **Préconditions :** départ et arrivée valides.
- **Étapes/pages :** formulaire de recherche → `/resultats` → chargement des trajets → cartes compagnie → `/:slug/booking?departure=…&arrival=…`.
- **Actions principales :** rechercher ; choisir une compagnie.
- **Actions secondaires :** retour à `/`, modification implicite par retour.
- **Données consultées :** trajets et compagnies publiés ; statut de vente en ligne.
- **Données modifiées :** aucune.
- **États :** chargement, critères invalides, aucun résultat, résultats, erreur.
- **Résultat :** ouverture du booking de la compagnie choisie.
- **Erreurs/récupération :** `/resultats` reconstruit départ/arrivée depuis `location.state` ou `?from=&to=` ; sans les deux, l'écran est invalide. La date n'est ni lue ni transmise. Un rafraîchissement ne survit que si les paramètres d'URL sont présents.
- **Permissions :** publiques.
- **UX :** conventions de paramètres différentes entre résultats (`from`, `to`) et booking (`departure`, `arrival`) ; aucune URL canonique commune ; retour de recherche peu explicite.
- **Responsive/accessibilité :** deux rendus de cartes augmentent le risque d'écart desktop/mobile ; vérifier annonce des résultats et du chargement.
- **État :** à corriger.

## J03 — Page compagnie, réservation et billet

- **Objectif :** réserver auprès d'une compagnie et présenter le billet.
- **Entrée :** `/:slug`, sous-domaine compagnie ou choix depuis `/resultats`.
- **Étapes/pages :** page compagnie → `/:slug/resultats` éventuel → `/:slug/booking` → paiement/preuve selon moyen → reçu/confirmation → `/:slug/mes-reservations` ou `/:slug/mes-billets` → détail/billet.
- **Actions principales :** choisir trajet/date, saisir voyageur, réserver, payer ou déposer une preuve, consulter le reçu.
- **Actions secondaires :** retrouver une réservation, aide, mentions, à propos.
- **Données consultées/modifiées :** compagnie, trajets, réservation, paiement et reçu selon les workflows existants.
- **États métier :** sélection, réservation en attente, paiement, preuve, confirmation, billet. Les statuts existants ne sont pas redéfinis.
- **Résultat :** réservation identifiable, reçu et billet présentable.
- **Sorties/erreurs :** vente en ligne désactivée ; compagnie introuvable ; réservation en cours récupérée ; page non trouvée.
- **Permissions :** public, avec contrôles existants.
- **UX :** `RouteResolver` accepte `/:slug/resultats` et `/:slug/booking`, mais le CTA `FinalCTA` construit `/compagnie/:slug/resultats`, qui est interprété avec `compagnie` comme slug. La route de confirmation n'est pas unifiée. Le booking dépend partiellement de `location.state`/`sessionStorage`, même si départ et arrivée peuvent venir de l'URL.
- **Responsive/accessibilité :** barre basse mobile présente hors flux de réservation ; changement de chrome selon sous-route ; modales de récupération à auditer pour focus et clavier.
- **État :** à corriger ; workflow métier inchangé.

## J04 — Administration de la plateforme SaaS

- **Utilisateur :** `admin_platforme`.
- **Objectif :** administrer la plateforme, pas une compagnie de transport.
- **Entrée :** connexion → `/role-landing` → `/admin/dashboard`.
- **Étapes/pages :** dashboard → compagnies (création, édition, plan) → abonnements → revenus/finances plateforme → plans → médias → moyens de paiement → paramètres.
- **Actions secondaires :** réservations globales et statistiques, accessibles par route mais absentes du menu principal.
- **Données :** compagnies, plans, souscriptions, revenus plateforme, configuration publique.
- **Résultat :** configuration ou supervision SaaS.
- **Erreurs/risques :** `/debug-auth` est public ; diagnostics et données publiques doivent être distingués. Les routes `/admin/reservations` et `/admin/statistiques` ne sont pas découvrables depuis la sidebar.
- **Permissions :** guard `admin_platforme` sur l'espace `/admin` ; règles Firestore à vérifier séparément avant toute évolution.
- **Responsive/accessibilité :** sidebar et menu mobile doivent exposer les mêmes domaines ; icônes seules et tableaux larges à contrôler en Phase 3.
- **État :** stable avec navigation à corriger.

## J05 — CEO / administrateur compagnie

- **Objectif cible :** consommer des informations consolidées et configurer le réseau.
- **Entrée :** `/compagnie/:companyId/command-center`.
- **Étapes/pages observées :** Command Center → activité/réservations réseau → finances → agences → audit/contrôle → clients → configuration ; flotte, validations et avis sont filtrés en Phase 1.
- **Actions principales cibles :** analyser activité réseau, performance agence, finances consolidées, trésorerie et alertes ; activer/désactiver une agence dans le cadre autorisé.
- **Données :** agrégats compagnie, agences, réservations réseau, comptes/ledger et transactions financières comme sources de vérité.
- **Résultat :** décision de supervision et drill-down en lecture.
- **Interdictions métier :** aucune ouverture de poste, vente, validation de dépense, opération quotidienne, substitution au comptable ou au chef d'agence.
- **Problèmes :** routes `/payment-approvals`, alias `ceo-expenses`/`expenses-approvals`, compteur `pending_ceo` et onglet dépenses mélangent décision exécutive et validation opérationnelle. De nombreux alias pointent vers des onglets différents et masquent l'architecture réelle.
- **Responsive/accessibilité :** sidebar longue ; onglets ciblés par query string peu explicites au lecteur d'écran et au retour arrière.
- **État :** à corriger sans toucher aux workflows.

## J06 — Chef comptable compagnie

- **Objectif :** piloter la trésorerie consolidée et les flux réseau.
- **Entrée :** `/compagnie/:companyId/accounting` pour les rôles comptables compagnie et directeur financier confirmés par le routage.
- **Étapes/pages :** dashboard comptable → réseau financier → trésorerie → flux → rapports ; routes secondaires vers comptes, opérations, bénéficiaires/fournisseurs, transferts, paramètres et diagnostics.
- **Actions :** consulter comptes agence/banques/Mobile Money/fonds en transit ; créer ou suivre les opérations autorisées ; rapprocher et rapporter.
- **Données :** `financialTransactions`, comptes et ledger ; les réservations ne doivent pas servir à reconstruire les soldes.
- **Résultat :** transaction tracée ou rapport consolidé.
- **Erreurs/risques :** routes secondaires accessibles mais non représentées dans le menu ; fonctions avancées masquées par flag sans suppression des routes ; vocabulaire `finances`, `trésorerie`, `flux`, `compta` chevauchant.
- **Permissions :** guards applicatifs existants ; protocole comptable prioritaire.
- **État :** métier gelé ; architecture de navigation à clarifier.

## J07 — Opérateur digital

- **Objectif :** contrôler les encaissements digitaux de la compagnie.
- **Entrée :** `/compagnie/:companyId/digital-cash`.
- **Préconditions :** rôle `operator_digital` et `companyId` ; sinon retour connexion par le landing.
- **Étapes/actions :** consulter la file digitale, ouvrir un paiement, appliquer les actions déjà autorisées, constater le résultat.
- **Données :** paiements et transactions digitales existants.
- **Risques UX :** espace isolé de la navigation comptable ; responsabilités et escalade vers chef comptable peu visibles.
- **État :** stable, à intégrer à l'architecture compagnie sans élargir ses permissions.

## J08 — Chef d'agence

- **Objectif :** superviser le fonctionnement quotidien de son agence.
- **Entrée :** `/agence/activite`.
- **Étapes/pages observées :** activité → caisse → validation des départs → rapports → équipe → trajets ; routes additionnelles vers planning, arrivées, historique et modules opérationnels selon guards/flags.
- **Actions cibles confirmées :** suivre l'activité, les départs, l'équipe et les rapports ; accéder aux informations financières autorisées en lecture.
- **Sortie :** situation opérationnelle comprise et anomalies orientées vers le bon rôle.
- **Interdictions :** ne pas exécuter les validations/réconciliations du comptable agence.
- **Problèmes :** la navigation chef n'expose pas directement réservations, guichets, embarquement et courrier, malgré des routes qui peuvent accepter le rôle. Des routes de création de trésorerie sous `/agence/treasury/new-*` héritent d'un shell/guard agence plus large que les routes équivalentes sous `/agence/comptabilite/treasury/*`. Le shell surveille aussi des validations `pending_manager`, ce qui entretient un modèle de double validation contraire à la séparation cible.
- **Responsive/accessibilité :** menu mobile filtré différemment selon rôle/flag ; les opérations clés doivent rester atteignables en quatre entrées prioritaires.
- **État :** à corriger, sans modifier les autorisations durant cette phase.

## J09 — Comptable agence

- **Objectif :** réceptionner les postes, constater les écarts et rapprocher la caisse agence.
- **Entrée :** `/agence/comptabilite`.
- **Étapes/pages :** sessions guichet/courrier → contrôle du montant déclaré → validation comptable → écarts → caisse/historique → journal, rapprochement et rapports → trésorerie autorisée.
- **Actions :** activer/reprendre selon workflow, valider réception guichet et courrier, constater un écart, valider la caisse et produire des rapports.
- **Données :** sessions, paiements, traces de remise, transactions financières, caisse et audits existants.
- **États :** statuts guichet et courrier existants, notamment clôturé, validé agence/comptable et validé final ; aucune normalisation proposée ici.
- **Résultat :** remise reçue, différence documentée, caisse rapprochée.
- **Interdictions :** ne pas vendre au guichet, embarquer, administrer la compagnie ou reconstruire un solde depuis les réservations.
- **UX :** page monolithique très longue, forte densité et plusieurs responsabilités secondaires ; navigation interne insuffisamment hiérarchisée.
- **Responsive/accessibilité :** tables, formulaires et modales nombreux ; ordre de focus, labels, annonces d'erreur et affichage petit écran à traiter sans changer le métier.
- **État :** gelé fonctionnellement ; refonte de présentation à haut risque.

## J10 — Guichetier

- **Objectif :** tenir un poste de vente de bout en bout.
- **Entrée :** `/agence/guichet`.
- **Étapes :** ouverture/activation → recherche destination/date/départ → saisie client → réservation/encaissement → impression → suspension/reprise → fermeture → rapport/historique.
- **Actions principales :** vendre et imprimer ; actions secondaires, rechercher, modifier dans les limites existantes, consulter rapport et historique.
- **Données :** trajets datés, réservation canonique, paiement, ticket/reçu, session et rapport.
- **États :** poste en attente/actif/suspendu/clôturé/validé selon le modèle existant.
- **Résultat :** billet émis et vente rattachée à une session ; rapport transmis à la comptabilité.
- **Erreurs :** départ passé, trajet indisponible, paiement/impression en échec, session non active, double action.
- **Permissions :** rôle guichetier et rôles explicitement admis par la route ; règles existantes.
- **UX :** écran unique très dense mais opérationnel ; le rapport affiche encore deux validations « Comptable » et « Chef », source de confusion avec la séparation cible.
- **Responsive/accessibilité :** raccourcis clavier utiles, mais les nombreux contrôles et modales doivent garder focus, libellés et cibles tactiles.
- **État :** gelé.

## J11 — Embarquement

- **Utilisateur :** `chefEmbarquement` principalement ; chef d'agence et rôles d'escale/administration explicitement admis par le layout.
- **Objectif :** préparer et contrôler un départ.
- **Entrée :** `/agence/boarding`.
- **Étapes/pages :** Départs → sélection → Scan ou Liste (`/agence/boarding/scan?view=`) → rapports ; le besoin métier couvre préparation, contrôle, clôture et anomalies selon les écrans existants.
- **Actions :** sélectionner, scanner/contrôler, consulter la liste et le rapport.
- **Données :** départ, manifeste, réservations/billets et état d'embarquement.
- **Résultat :** passagers contrôlés et départ traçable.
- **UX :** trois entrées Scan/Liste/Rapports partagent la même route et un paramètre `view`; l'état actif et le retour arrière peuvent être ambigus. La route live existe séparément.
- **Responsive/accessibilité :** navigation mobile cachant les tabs (`hideTabsOnMobile`) à confronter à une alternative réellement visible ; caméra et erreurs de scan doivent être annoncées.
- **État :** stable, présentation à améliorer.

## J12 — Courrier inter-agences

- **Utilisateur :** `agentCourrier`, avec accès de supervision explicitement conditionné pour certains rôles.
- **Objectif :** transporter et remettre un colis entre deux agences.
- **Entrée :** `/agence/courrier`.
- **Étapes :** réception agence A → enregistrement/encaissement → session courrier → expédition → arrivée agence B → réception → remise au destinataire → clôture et rapport.
- **Pages/actions :** tableau courrier, nouveau colis, arrivées, retrait/remise, rapports/historique ; reçus et contrôles existants.
- **Données :** colis, agences origine/destination, session, paiement, reçu, statuts courrier.
- **Résultat :** colis remis avec trace inter-agences et session rapprochable.
- **Erreurs :** agence destination, identité/référence, colis non arrivé, session inactive, remise ou paiement incomplet.
- **UX :** le rôle courrier reçoit un shell plein écran spécifique, alors que les superviseurs passent par le shell agence ; la dépendance inter-agences et l'escalade d'anomalie sont peu matérialisées.
- **Responsive/accessibilité :** flux POS et modales à préserver ; contrôler focus, fermeture clavier, contraste et impression.
- **État :** gelé, aucune modification fonctionnelle.

## J13 — Escale

- **Utilisateur :** `escale_agent`, `escale_manager` ; certains écrans admettent chef d'agence/admin compagnie.
- **Entrée :** `/agence/escale`.
- **Étapes/pages :** dashboard → bus du jour → boarding → manifeste → caisse → équipe.
- **Actions :** traiter le passage du bus, contrôler manifeste/embarquement, suivre caisse et équipe selon rôle.
- **Résultat :** opération d'escale tracée.
- **Problème :** « Équipe » pointe vers `/agence/team`, qui bascule dans `ManagerShell`, puis le retour repart vers le shell Escale. Un même rôle utilise deux architectures sans justification métier.
- **Responsive/accessibilité :** rupture de repères desktop/mobile ; intitulés `Boarding`/`Embarquement` non harmonisés.
- **État :** à corriger.

## J14 — Rôles supplémentaires et modules différés

- `superviseur` : accès au shell agence et redirection vers activité, avec capacités à confirmer écran par écran ; ne pas assimiler automatiquement au chef d'agence.
- `agency_fleet_controller` : landing vers `/agence/fleet`, alors que la flotte est désactivée par feature flag et absente de la navigation ; parcours incohérent et différé.
- `financial_director` et variantes comptables compagnie : entrée accounting confirmée par le landing/routage ; responsabilités exactes à normaliser avec la matrice des rôles avant Phase 3.
- `escale_manager`/`escale_agent` : voir J13.
- Alias de rôles (`admin_company`/`admin_compagnie`, `chefAgence`/`chefagence`) : tolérés à plusieurs endroits mais non uniformes.
- Garage, flotte, maintenance, transit, incidents, conformité, urgence, équipages et logistique avancée : **différés**. Les routes garage/flotte présentes ne constituent pas une autorisation de les activer. Courrier, bien qu'appartenant au domaine logistique, reste actif et gelé.

## Parcours strictement préservés

Les séquences de création de réservation canonique, ticket/reçu, paiement opérateur, ouverture/clôture/validation des sessions guichet et courrier, écritures `financialTransactions`, comptes/ledger et rapprochements comptables ne changent pas. Cette carte recommande uniquement une future organisation de l'expérience et de la navigation.
