# TELIYA — Navigation cible par rôle

Cette proposition n'accorde aucune capacité nouvelle. Les entrées marquées « supervision » ouvrent des vues de lecture ou les écrans déjà admis par les guards. Toute évolution devra d'abord aligner rôle déclaré, guard, Rules et action d'écran.

## Visiteur / voyageur

**Navigation principale :** Marketplace (future), Compagnies, Rechercher, Mes réservations, Mes billets, Aide.

**Mobile prioritaire :** Accueil, Rechercher, Billets, Aide.

**Action principale :** rechercher un trajet. Pendant le booking : Continuer/Réserver/Payer selon l'étape.

**Interdit :** toute navigation interne SaaS.

## Super administrateur plateforme — `admin_platforme`

**Navigation principale :** Dashboard, Compagnies, Abonnements, Plans & offre, Facturation & revenus, Supervision, Contenu public, Configuration.

**Navigation secondaire :** réservations globales, statistiques, moyens de paiement, médias, détail/édition/plan compagnie.

**Mobile prioritaire :** Dashboard, Compagnies, Abonnements, Plus.

**Action principale :** Créer une compagnie sur la liste ; actions contextuelles ailleurs.

**Interdit :** menus et actions d'administration quotidienne d'une compagnie ou agence.

## CEO / administrateur compagnie — `company_ceo`, `admin_company`

**Navigation principale :** Vue réseau, Activité, Performance, Finances consolidées, Trésorerie, Alertes, Agences, Clients, Configuration.

**Navigation secondaire :** détail agence, détail route, détail client, erreurs système, paramètres de paiement et image de marque.

**Mobile prioritaire :** Vue réseau, Activité, Alertes, Plus.

**Action principale :** consulter une alerte ou approfondir un indicateur.

**Interdit :** validation de dépenses, ouverture de poste, vente, embarquement, mutations de caisse et opérations quotidiennes. Supprimer de la navigation cible les concepts `payment-approvals`, `expenses-approvals` et validation chef d'agence ; la suppression technique relève d'une phase ultérieure après décision sécurité.

## Chef comptable compagnie / direction financière

**Navigation principale :** Dashboard, Réseau financier, Trésorerie, Flux financiers, Rapprochements & anomalies, Rapports.

**Navigation secondaire :** comptes agence, banques, Mobile Money, fonds en transit, versements, transfert, bénéficiaire/fournisseur, opération, paramètres, diagnostics.

**Mobile prioritaire :** Dashboard, Trésorerie, Flux, Plus.

**Action principale :** traiter une anomalie ou créer l'opération autorisée depuis son domaine.

**Interdit :** réservation/vente terrain et validation comptable agence effectuée à la place du comptable local.

## Opérateur digital — `operator_digital`

**Navigation principale :** Encaissements digitaux, À contrôler, Historique, Anomalies.

**Navigation secondaire :** détail paiement/transaction selon capacités présentes.

**Mobile prioritaire :** À traiter, Recherche, Historique, Plus.

**Action principale :** traiter le prochain encaissement dans les limites existantes.

**Interdit :** trésorerie générale, comptes agence et configuration compagnie.

## Chef d'agence — `chefAgence`

**Navigation principale :** Aujourd'hui, Départs, Réservations, Guichets (supervision), Embarquement (supervision), Courrier (supervision), Équipe, Rapports, Configuration autorisée.

**Navigation secondaire :** activité détaillée, arrivée attendue, trajet, historique agent et informations de caisse autorisées en lecture.

**Mobile prioritaire :** Aujourd'hui, Départs, Réservations, Plus.

**Action principale :** ouvrir le départ ou l'alerte opérationnelle prioritaire.

**Interdit :** Réception comptable, rapprochement, validation de caisse comptable et création directe de trésorerie. Avant implémentation, distinguer les vues de supervision des écrans spécialisés qui permettent des mutations.

## Superviseur agence — `superviseur`

**Navigation principale cible :** uniquement les domaines dont les guards et actions sont confirmés : Aujourd'hui, Départs, Rapports.

**Mobile prioritaire :** Aujourd'hui, Départs, Plus.

**Règle :** ne pas copier automatiquement la navigation du chef d'agence ; établir la matrice d'autorisation canonique avant migration.

## Comptable agence — `agency_accountant`

**Navigation principale :** À traiter, Caisse agence, Écarts, Historique & journal, Rapports, Trésorerie autorisée.

**Navigation secondaire :** session guichet, session courrier, trace de remise, rapprochement, relevé.

**Mobile prioritaire :** À traiter, Caisse, Historique, Plus.

**Action principale :** Réceptionner/valider la remise sélectionnée selon le workflow existant.

**Interdit :** vente, contrôle d'embarquement, gestion des compagnies et modification des sources financières hors services autorisés.

## Guichetier — `guichetier`

**Navigation principale :** Vente, Rapport de poste, Historique.

**Navigation mobile :** Vente, Rapport, Plus.

**Action principale :** Vendre/Confirmer la réservation ; l'action de session varie avec son état.

**Actions secondaires :** imprimer, rechercher, suspendre/reprendre, clôturer.

**Interdit :** valider comptablement sa remise ou celle d'un autre poste.

## Chef d'embarquement — `chefEmbarquement`

**Navigation principale :** Départs, Scan, Liste, Rapports.

**Navigation mobile :** Départs, Scan, Liste, Plus.

**Action principale :** Scanner/contrôler sur un départ sélectionné.

**Interdit :** paiement, caisse et modification comptable.

## Agent courrier — `agentCourrier`

**Navigation principale :** Tableau, Nouveau colis, Expéditions, Arrivées, Remises, Rapport & historique.

**Navigation mobile :** Tableau, Nouveau, Arrivées, Plus.

**Action principale :** dépend de l'étape : Enregistrer, Expédier, Réceptionner ou Remettre.

**Interdit :** valider comptablement sa session. Le shell et le workflow courrier restent gelés.

## Agent / manager d'escale — `escale_agent`, `escale_manager`

**Navigation principale :** Aujourd'hui, Bus du jour, Embarquement, Manifeste, Caisse, Équipe.

**Navigation mobile :** Aujourd'hui, Bus, Embarquement, Plus.

**Action principale :** poursuivre l'étape courante du bus sélectionné.

**Règle :** Équipe reste dans le shell Escale ; les différences agent/manager viennent des permissions confirmées, pas de deux architectures de navigation.

## Contrôleur flotte agence — `agency_fleet_controller`

**État :** différé. Aucun menu cible actif tant que la flotte est désactivée. La redirection après connexion doit, dans une phase autorisée, présenter un écran d'indisponibilité ou une destination valide confirmée, jamais une route masquée.

## Variantes et alias de rôles

Les libellés `admin_company`/`admin_compagnie`, `chefAgence`/`chefagence` et les variantes comptables doivent être normalisés dans une matrice canonique avant de construire les menus Phase 3. Jusqu'alors, aucun alias ne justifie une capacité supplémentaire.

## Règles communes desktop/mobile

- Même taxonomie et mêmes permissions ; seuls l'ordre et le niveau de regroupement changent.
- Quatre destinations maximum au premier niveau mobile, puis « Plus ».
- L'action principale appartient au contenu, pas à une icône ambiguë du menu.
- Le changement d'espace spécialisé est annoncé (« Ouvrir le guichet », « Ouvrir l'embarquement ») et propose un retour.
- Les pages secondaires ne saturent pas la sidebar ; elles utilisent liens contextuels et breadcrumbs.
- Le rôle, l'agence/compagnie active, l'état réseau et la déconnexion restent disponibles dans le header.
