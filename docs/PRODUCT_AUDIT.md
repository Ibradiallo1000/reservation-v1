# Audit produit complet - TELIYA Transport

**Date de l'audit :** 15 juin 2026  
**Périmètre :** application React, routes, menus, rôles, services et règles Firestore.  
**Méthode :** audit statique en lecture seule. Aucun fichier métier, menu ou comportement n'a été modifié.

## Légende et limites

- **Routée** : page déclarée dans `src/AppRoutes.tsx` ou résolue par `RouteResolver`.
- **Visible** : page présente dans un menu de layout.
- **Candidate obsolète** : page non routée ou remplacée par une redirection. Ce statut doit être confirmé par les usages réels avant suppression.
- **Terminé** : flux principal, route, service et règles Firestore existent.
- **Partiel** : flux utilisable, mais coexistence de modèles, routes manquantes ou intégration incomplète.
- **Expérimental** : fonctionnalités avancées ou secondaires dont la valeur MVP n'est pas démontrée.
- **Non utilisé** : fichier/page détecté sans route directe active.

## Synthèse exécutive

TELIYA couvre déjà quatre produits dans une même application :

1. une plateforme SaaS d'administration ;
2. une vitrine et billetterie publique multi-compagnie ;
3. un système opérationnel d'agence : guichet, caisse, départs et embarquement ;
4. un ERP compagnie : finance, flotte, logistique, courrier, CRM et pilotage.

Le coeur MVP réellement cohérent est la chaîne :

`route/weeklyTrip -> tripInstance -> réservation -> paiement -> session/caisse -> départ -> manifeste/embarquement -> rapports`

Les principaux risques avant simplification sont :

- trois sources de rôles/permissions non alignées ;
- plusieurs générations de pages coexistent dans le dépôt ;
- deux modèles flotte coexistent : `vehicles` et `fleetVehicles` ;
- plusieurs modèles financiers coexistent : `cashTransactions`, `financialTransactions`, `financialMovements`, `accounts`, `financialAccounts` ;
- le menu comptable contient `.../accounting/cash-control`, mais cette route n'existe pas dans `AppRoutes.tsx` ;
- plusieurs routes historiques redirigent vers de nouvelles pages consolidées ;
- les règles Firestore déclarent davantage de collections que le périmètre MVP.

---

## 1. Inventaire des rôles

### 1.1 Sources de vérité détectées

| Source | Usage observé | Problème |
|---|---|---|
| `src/constants/roles.ts` | Ancienne liste officielle courte | Ne contient pas les rôles finance, digital, escale ou superviseur |
| `src/roles-permissions.ts` | Typage et permissions fonctionnelles les plus complètes | Ne pilote pas seul les routes |
| `src/constants/routePermissions.ts` | Contrôle effectif des routes | Source la plus fiable pour les accès techniques |
| `src/permissions.ts` | Ancienne matrice de modules | Contient `gestionnaire` et `support`, absents des routes |
| `firestore.rules` | Autorisation réelle des données | Accepte aussi des alias historiques, par exemple `chefagence`, `chef_garage` |

**Conclusion :** le rôle réellement utilisable dépend à la fois de la route, du layout, des règles Firestore et parfois de contrôles internes à la page. Une future simplification doit d'abord unifier ces sources.

### 1.2 Rôles actifs et responsabilités

| Rôle technique | Libellé métier | Menus/pages principales accessibles | Responsabilités métier |
|---|---|---|---|
| `admin_platforme` | Admin plateforme | `/admin/*`, inspection des espaces compagnie, finance/garage selon routes | Gérer compagnies, plans, abonnements, moyens de paiement, médias et paramètres plateforme |
| `admin_compagnie` / alias `company_ceo` | Admin compagnie / direction | Dashboard compagnie, activité réseau, finances, audit, flotte, configuration ; accès à plusieurs espaces agence | Piloter la compagnie, configurer le réseau, superviser opérations et finances |
| `financial_director` | Directeur financier | `/compagnie/:companyId/accounting/*`, notifications, coûts trajets, paramètres financiers | Supervision financière, trésorerie, dépenses, rapports et contrôle |
| `company_accountant` | Comptable compagnie | Même espace comptable compagnie | Exécution et contrôle comptable quotidien |
| `operator_digital` | Opérateur digital | `/compagnie/:companyId/digital-cash` | Valider ou rejeter les paiements et preuves des réservations en ligne |
| `responsable_logistique` | Responsable logistique | `/compagnie/:companyId/garage/*` | Superviser flotte, routes, maintenance, transit, incidents et conformité |
| `chef_garage` | Alias historique responsable logistique | Même espace garage | Compatibilité des anciens profils Firestore |
| `chefAgence` | Chef d'agence | Activité, caisse, équipe, trajets, planification, validation départs, arrivées, rapports, guichet, courrier | Superviser ventes, caisse, personnel et départs de l'agence |
| `superviseur` | Superviseur agence | Espace agence, validations, planification, journal agents | Appuyer le chef d'agence et valider les opérations |
| `agency_accountant` | Comptable agence | `/agence/comptabilite`, journal agents, trésorerie agence | Contrôler sessions, encaissements, écarts et opérations de trésorerie agence |
| `guichetier` | Guichetier | `/agence/guichet`, `/agence/comptabilite`, caisse/sessions selon permission | Ouvrir une session, vendre des billets, encaisser, imprimer et clôturer |
| `operator_digital` | Opérateur digital | Caisse digitale uniquement | Transformer paiement en ligne en réservation validée et écriture de caisse |
| `chefEmbarquement` | Agent / chef embarquement | `/agence/boarding/*` | Gérer liste passagers, scan QR, embarquement et clôture |
| `agentCourrier` | Agent courrier | `/agence/courrier/*`, shell agence limité | Créer, grouper, expédier, recevoir et remettre les colis |
| `agency_fleet_controller` | Contrôleur flotte agence | `/agence/fleet/*`, planification | Affecter véhicules/équipage et suivre les mouvements |
| `escale_agent` | Agent d'escale | `/agence/escale/*`, guichet, boarding | Vendre depuis une escale, suivre bus, embarquer et tenir la caisse escale |
| `escale_manager` | Chef d'escale | Espace escale, guichet, boarding, équipe | Superviser une escale et son équipe |
| `gestionnaire` | Gestionnaire historique | Déclaré seulement dans `permissions.ts` | Rôle ancien sans landing ni route dédiée démontrée |
| `support` | Support historique | Déclaré seulement dans `permissions.ts` | Rôle ancien sans landing ni route dédiée démontrée |
| `controleur` | Contrôleur | Proposé dans `ManagerTeamPage`, absent du type de rôles central | Rôle incohérent à clarifier avant usage |
| `user` / `unauthenticated` | Défaut / visiteur | Vitrine et billetterie publique | Consultation et réservation publique |

### 1.3 Menus réellement visibles par espace

| Espace | Menus visibles |
|---|---|
| Plateforme | Tableau de bord, Compagnies, Abonnements, Activité, Facturation, Plans & tarifs, Médias, Moyens de paiement, Paramètres |
| Compagnie direction | Dashboard, Activité réseau, Finances, Audit & contrôle/Alertes, Flotte, Validation chef d'agence, Clients, Avis clients, Configuration |
| Compagnie comptable | Dashboard, Activité, Contrôle des caisses, Trésorerie, Dépenses |
| Garage/logistique | Tableau de bord, Routes réseau, Logistique, Équipage, Liste flotte, Maintenance, Transit, Incidents, Conformité bus, Urgence trajet |
| Agence chef/supervision | Activité, Caisse, Équipe, Trajets, Planification, Validation départs, Arrivées attendues, Rapports, plus accès conditionnels Courrier/Embarquement/Flotte |
| Embarquement | Départs planifiés, Scan / Liste |
| Escale | Tableau de bord, Bus du jour, Embarquement, Manifeste bus, Caisse, Équipe |
| Courrier | Session, Nouvel envoi, Lots, Arrivages, Remise, Rapport, Historique |

### 1.4 Incohérences d'accès à corriger avant simplification

1. `routePermissions.agenceShell` autorise `agentCourrier`, mais le shell construit ensuite un menu spécifique : l'accès ne se déduit pas uniquement de la permission de route.
2. Le layout boarding autorise `chefAgence`, mais `routePermissions.boarding` ne l'inclut pas actuellement.
3. Le menu comptable affiche `.../accounting/cash-control`, sans route correspondante.
4. `admin_compagnie` dispose techniquement de nombreux accès agence, comptabilité, garage et digital ; cela brouille la séparation entre pilotage et exploitation.
5. `controleur`, `gestionnaire`, `support` et certains alias historiques ne sont pas alignés entre typage, invitations, routes et règles.

---

## 2. Inventaire des modules

| Module | Statut produit | Dépendances principales | Diagnostic |
|---|---|---|---|
| Billetterie guichet | **Terminé / MVP critique** | weeklyTrips, tripInstances, reservations, shifts, payments, cashTransactions | Flux complet de vente, reçu et impression |
| Billetterie en ligne | **Terminé / MVP critique** | vitrine, tripInstances, reservations, publicReservations, payments, paymentConfigs | Flux public complet jusqu'à preuve et billet |
| Validation opérateur digital | **Terminé / MVP critique** | reservations, payments, paymentLogs, cashTransactions, virtualSessions | Espace dédié et permissions dédiées |
| Réservations réseau | **Terminé / MVP critique** | collectionGroup reservations, tripInstances, dailyStats | Vues agence, compagnie, comptable et publique |
| Paiements / preuves | **Terminé / MVP critique** | payments, paymentLogs, paymentConfigs, publicReservations | Central pour réservation en ligne |
| Sessions guichet et clôture | **Terminé / MVP critique** | shifts, shiftReports, cashSessions, cashClosures, dailyStats | Plusieurs modèles de session/caisse coexistent |
| Gestion des départs | **Partiellement terminé / MVP critique** | tripInstances, tripExecutions, tripAssignments, vehicles | Fonctionnel, mais partagé entre planification, flotte et agence |
| Liste passagers / manifeste | **Terminé / MVP critique** | reservations, tripInstances, routes/stops | Présent en escale et embarquement |
| Embarquement / Scan QR | **Terminé / MVP critique** | reservations, boardingLogs, boardingClosures, boardingStats | Deux parcours : boarding global et escale |
| Dashboard agence | **Terminé / MVP critique** | activityLogs, dailyStats, agencyLiveState, sessions | Consolidé dans Activité/Caisse |
| Dashboard compagnie | **Terminé / MVP critique** | agrégats, reservations, finance, flotte | Command center avancé, plus large que le MVP |
| Rapports de ventes | **Terminé / MVP critique** | dailyStats, shiftReports, reservations, activityLogs | Plusieurs pages de rapport coexistent |
| Gestion agences et équipe | **Terminé / secondaire** | agences, users, invitations, personnel | Nécessaire à l'administration du tenant |
| Routes et escales | **Terminé / socle critique** | routes/stops, weeklyTrips, tripInstances | Socle indispensable, même si menu non MVP |
| Courrier / colis | **Terminé / à masquer temporairement** | logistics/data, courierSessions, batches, publicShipmentTrack | Sous-produit complet et fortement couplé à finance/flotte |
| Trésorerie / dépenses / payables | **Partiel avancé / à masquer temporairement** | financialTransactions, financialMovements, accounts, expenses, payables | Fonctionnel mais architecture financière multiple |
| Flotte agence | **Partiel / à masquer temporairement** | fleetVehicles, fleetMovements, affectations, personnel | Ancien modèle encore actif |
| Flotte compagnie | **Partiel avancé / à masquer temporairement** | vehicles, vehicleLiveState, tripExecutions, logisticsActions | Nouveau modèle plus riche, coexistence legacy |
| Garage / maintenance | **Partiel / expérimental** | fleetMaintenance, vehicles, incidents implicites | Plusieurs vues partagent `GarageDashboardPage` |
| Logistique / conformité / urgence | **Expérimental** | logisticsActions, notifications, vehicles, tripExecutions | Pages présentes, valeur MVP non démontrée |
| CRM clients | **Partiel / secondaire** | customers, reservations | Pages routées, module récent |
| Avis clients | **Partiel / secondaire** | avis | Modération routée, non essentielle au MVP |
| Bibliothèque images / vitrine | **Terminé / secondaire** | imagesBibliotheque, medias, companies | Administration de marque |
| Abonnements SaaS | **Terminé / plateforme** | plans, adminSettings/plans, subscriptionRequests | Nécessaire à l'opérateur TELIYA, pas aux opérations transport |
| Intelligence / rentabilité / risques | **Expérimental** | tripCosts, fleetCosts, riskSettings, agrégats | Moteurs avancés hors MVP opérationnel |
| Mode hors ligne | **Partiel / expérimental** | IndexedDB/services offline, reservations | Services présents, couverture fonctionnelle à confirmer |

### 2.1 Dépendances critiques entre modules

| Module source | Modules dépendants |
|---|---|
| Compagnies / agences / utilisateurs | Tous les espaces internes et la vitrine |
| Routes + stops | Planification, réservation publique, guichet escale, manifeste |
| weeklyTrips | Recherche de trajets, génération de tripInstances, guichet |
| tripInstances | Places restantes, réservation, départs, embarquement, flotte |
| reservations | Paiements, caisse, manifeste, embarquement, rapports, CRM |
| payments | Validation digitale, réservation en ligne, audit financier |
| shifts / shiftReports | Guichet, caisse agence, clôture, rapports |
| cashTransactions / financialTransactions | Caisse agence, finance compagnie, dashboards |
| vehicles / fleetVehicles | Planification, départs, boarding, logistique |
| dailyStats / activityLogs | Dashboards et rapports |

---

## 3. Cartographie des pages

### 3.1 Pages publiques et authentification

| Route | Page | Rôle | Module | Statut |
|---|---|---|---|---|
| `/` | `HomePage` ou `PublicCompanyPage` sur sous-domaine | Public | Plateforme/vitrine | MVP critique |
| `/login`, `/:slug/login` | `LoginPage` | Tous | Auth | MVP critique |
| `/register` | `Register` | Public | Auth | Secondaire |
| `/accept-invitation/:invitationId` | `AcceptInvitationPage` | Invité | Personnel | MVP critique |
| `/resultats` | `PlatformSearchResultsPage` | Public | Recherche trajets | MVP critique |
| `/villes` | `ListeVillesPage` | Public | Référentiel | Secondaire |
| `/:slug`, `/` sous-domaine | `PublicCompanyPage` | Public | Vitrine | MVP critique |
| `/:slug/resultats` | `ResultatsAgencePage` | Public | Recherche trajets | MVP critique |
| `/:slug/reserver`, `/:slug/booking` | `ReservationClientPage` | Client | Billetterie en ligne | MVP critique |
| `/:slug/payment` | `PaymentMethodPage` | Client | Paiement | MVP critique |
| `/:slug/upload-preuve/:id` | `UploadPreuvePage` | Client | Paiement/preuve | MVP critique |
| `/:slug/receipt`, `/:slug/confirmation` | `ReceiptEnLignePage` | Client | Billet en ligne | MVP critique |
| `/:slug/reservation/:id`, `/:slug/details`, `/:slug/mon-billet` | `ReservationDetailsPage` | Client | Réservation/billet | MVP critique |
| `/mes-reservations`, `/:slug/mes-reservations` | `ClientMesReservationsPage` | Client | Réservations | MVP critique |
| `/mes-billets`, `/:slug/mes-billets`, `/:slug/retrouver-reservation` | `ClientMesBilletsPage` | Client | Billets | MVP critique |
| `/track`, `/track/:trackingPublicId` | `TrackShipmentFindPage`, `TrackShipmentPage` | Public | Courrier | À masquer |
| `/:slug/aide`, `/:slug/a-propos` | `AidePage`, `CompanyAboutPage` | Public | Vitrine | Secondaire |
| pages légales | `MentionsPage`, `ConfidentialitePage`, `ConditionsPage`, `CookiesPage` | Public | Conformité | Secondaire |
| `/debug-auth` | `DebugAuthPage` | Public | Diagnostic | Futur/interne |

### 3.2 Espace plateforme

| Route | Page | Rôle | Module | Statut |
|---|---|---|---|---|
| `/admin/dashboard` | `AdminDashboard` | admin plateforme | Pilotage SaaS | Secondaire produit |
| `/admin/compagnies` | `AdminCompagniesPage` | admin plateforme | Tenants | MVP SaaS |
| `/admin/compagnies/ajouter` | `AdminCompagnieAjouterPage` | admin plateforme | Tenants | MVP SaaS |
| `/admin/compagnies/:id/modifier` | `AdminModifierCompagniePage` | admin plateforme | Tenants | MVP SaaS |
| `/admin/compagnies/:companyId/plan` | `AdminCompanyPlan` | admin plateforme | Abonnements | Secondaire |
| `/admin/plans` | `PlansManager` | admin plateforme | Abonnements | Secondaire |
| `/admin/subscriptions` | `AdminSubscriptionsManager` | admin plateforme | Abonnements | Secondaire |
| `/admin/revenus` | `AdminRevenueDashboard` | admin plateforme | Pilotage SaaS | Secondaire |
| `/admin/payment-methods` | `AdminPaymentMethodsPage` | admin plateforme | Paiement | MVP SaaS |
| `/admin/reservations` | `AdminReservationsPage` | admin plateforme | Réservations | Secondaire |
| `/admin/finances` | `AdminFinancesPage` | admin plateforme | Facturation | Secondaire |
| `/admin/statistiques` | `AdminStatistiquesPage` | admin plateforme | Statistiques | Secondaire |
| `/admin/parametres-platforme` | `AdminParametresPlatformPage` | admin plateforme | Configuration | Secondaire |
| `/admin/media` | `MediaPage` | admin plateforme | Médias | Futur |

### 3.3 Espace compagnie direction

| Route | Page | Rôle | Module | Statut |
|---|---|---|---|---|
| `/compagnie/:companyId/command-center` | `CEOCommandCenterPage` | admin compagnie | Dashboard compagnie | MVP critique |
| `/compagnie/:companyId/reservations-reseau` | `ReservationsReseauPage` | admin compagnie | Activité réseau | MVP critique |
| `/compagnie/:companyId/reservations-reseau/reservations` | `CompagnieReservationsPage` | admin compagnie | Réservations | MVP critique |
| `/compagnie/:companyId/finances` | `FinancesPage` | admin compagnie | Finance/caisse | MVP critique |
| `/compagnie/:companyId/audit-controle` | `AuditControlePage` | admin compagnie | Audit/dépenses | À masquer partiellement |
| `/compagnie/:companyId/flotte` | `FlottePage` | admin compagnie | Flotte | À masquer |
| `/compagnie/:companyId/comptabilite/validation` | `CompagnieComptabiliteValidationPage` | admin compagnie | Validation agence | Secondaire |
| `/compagnie/:companyId/agences` | `CompagnieAgencesPage` | admin compagnie | Agences | Secondaire nécessaire |
| `/compagnie/:companyId/parametres` | `CompagnieParametresTabsPage` | admin compagnie | Configuration | Secondaire nécessaire |
| `/compagnie/:companyId/customers*` | `CompagnieCustomersPage`, `CompagnieCustomerProfilePage` | admin compagnie | CRM | Futur |
| `/compagnie/:companyId/images` | `BibliothequeImagesPage` | admin compagnie | Médias | Futur |
| `/compagnie/:companyId/payment-settings` | `CompanyPaymentSettingsPage` | admin compagnie | Paiement | MVP critique |
| `/compagnie/:companyId/avis-clients` | `AvisModerationPage` | admin compagnie | Avis | Futur |
| `/compagnie/:companyId/payment-approvals` | `CEOPaymentApprovalsPage` | admin compagnie | Paiement | Secondaire, non visible menu principal |
| `/compagnie/:companyId/trip-costs` | `TripCostsPage` | direction/finance/chef agence | Rentabilité | Futur |
| `/compagnie/:companyId/notifications` | `NotificationsPage` | direction/finance | Notifications | Secondaire |
| `/compagnie/:companyId/financial-settings` | `FinancialSettingsPage` | direction/finance | Finance | Futur |

**Routes historiques redirigées :** `dashboard`, `reservations`, `comptabilite`, `ceo-expenses`, `expenses-approvals`, `revenus-liquidites`, `caisse`, `treasury`, `operations-reseau`, `fleet`, `fleet-finance`.

### 3.4 Espace comptable compagnie

| Route | Page | Rôle | Module | Statut |
|---|---|---|---|---|
| `/compagnie/:companyId/accounting` | `VueGlobale` | comptable/DAF | Dashboard finance | Secondaire |
| `.../reservations-reseau*` | `ReservationsReseauPage`, `CompagnieReservationsPage` | comptable/DAF | Activité/réservations | MVP critique |
| `.../finances` | `Finances` | comptable/DAF | Finance | Secondaire |
| `.../compta` | `ComptaPage` | comptable/DAF | Comptabilité | Secondaire |
| `.../expenses`, `.../expenses-dashboard` | `DepensesPage`, `ExpenseDashboard` | comptable/DAF | Dépenses | À masquer |
| `.../treasury*` | `CEOTreasuryPage`, pages nouvelle opération/payable/transfert | comptable/DAF | Trésorerie | À masquer |
| `.../supplier-payments` | `TreasurySupplierPaymentPage` | comptable/DAF | Fournisseurs | Futur |
| `.../rapports` | `Rapports` | comptable/DAF | Rapports | Secondaire |
| `.../parametres` | `Parametres` | comptable/DAF | Paramètres | Futur |
| `.../consistency-diagnostics` | `FinancialConsistencyDiagnosticsPage` | comptable/DAF | Diagnostic | Expérimental |
| `.../cash-control` | **Aucune route** | comptable/DAF | Contrôle caisses | **Lien menu cassé** |

### 3.5 Espace agence, guichet, caisse et départs

| Route | Page | Rôle | Module | Statut |
|---|---|---|---|---|
| `/agence/activite` | `AgencyActivityDomainPage` | chef/superviseur/admin | Dashboard agence | MVP critique |
| `/agence/caisse` | `AgencyCashDomainPage` | chef/superviseur/admin | Caisse agence | MVP critique |
| `/agence/activity-log` | `AgencyActivityLogPage` | chef/superviseur/admin | Journal activité | Secondaire |
| `/agence/team` | `ManagerTeamPage` | chef/escale manager/admin | Équipe | Secondaire |
| `/agence/trajets` | `AgenceTrajetsPage` | shell agence | Trajets | Socle critique |
| `/agence/planification-trajets` | `TripPlanningPage` | chef/superviseur/flotte | Planification | À masquer |
| `/agence/validation-departs` | `AgencyDepartureValidationsPage` | chef/superviseur | Départs | MVP critique |
| `/agence/arrivees-attendues` | `AgencyExpectedArrivalsPage` | chef/superviseur | Arrivées | À masquer |
| `/agence/reports` | `ManagerReportsPage` | shell agence | Rapports ventes | MVP critique |
| `/agence/agent-history` | `AgencyAgentHistoryPage` | supervision/comptable | Audit agents | Secondaire |
| `/agence/guichet` | `AgenceGuichetPage` | guichet/chef/escale/admin | Billetterie guichet | MVP critique |
| `/agence/receipt/:id` | `ReceiptGuichetPage` | guichet/chef | Reçu | MVP critique |
| `/agence/reservations/print` | `ReservationPrintPage` | guichet/chef | Impression | MVP critique |
| `/agence/comptabilite` | `AgenceComptabilitePage` | comptable/guichet/chef | Caisse et clôture | MVP critique |
| `/agence/comptabilite/journal-agents` | `AgencyAgentHistoryPage` | supervision/comptable | Audit agents | Secondaire |
| `/agence/cash-sessions` | `CashSessionsPage` | caisse/chef/comptable | Contrôle caisse | MVP critique |
| routes trésorerie agence | `AgencyTreasuryNewOperationPage`, `AgencyTreasuryTransferPage`, `AgencyTreasuryNewPayablePage` | comptable agence/admin | Trésorerie | À masquer |

### 3.6 Embarquement et escale

| Route | Page | Rôle | Module | Statut |
|---|---|---|---|---|
| `/agence/boarding` | `BoardingDashboardPage` | embarquement/escale/admin | Départs | MVP critique |
| `/agence/boarding/live` | `BoardingLiveOpsPage` | embarquement/escale/admin | Embarquement live | MVP critique mais non visible dans menu |
| `/agence/boarding/scan` | `BoardingScanPage` | embarquement/escale/admin | Scan QR/liste | MVP critique |
| `/agence/escale` | `EscaleDashboardPage` | escale/chef/admin | Dashboard escale | Secondaire |
| `/agence/escale/bus` | `EscaleBusDuJourPage` | escale/chef/admin | Bus du jour | MVP critique |
| `/agence/escale/embarquement` | `BoardingEscalePage` | escale/chef/admin | Embarquement escale | MVP critique |
| `/agence/escale/manifeste` | `BusPassengerManifestPage` | escale/chef/admin | Liste passagers | MVP critique |
| `/agence/escale/caisse` | `EscaleCaissePage` | escale/chef/admin | Caisse escale | MVP critique |

### 3.7 Courrier, flotte et garage

| Routes | Pages | Rôle | Module | Statut |
|---|---|---|---|---|
| `/agence/courrier/*` | Session, création, lots, arrivages, remise, rapport, historique | agent courrier/chef/admin | Courrier | À masquer |
| `/scan*` | `ScanShipmentPage` | courrier | Courrier | À masquer |
| `/agence/fleet/*` | Dashboard, opérations, affectation, véhicules, équipage, mouvements | contrôleur flotte/admin | Flotte agence | À masquer |
| `/compagnie/:companyId/garage/dashboard` | `GarageDashboardHomePage` | logistique/admin | Garage | À masquer |
| `.../garage/routes` | `CompanyRoutesPage` | logistique/admin | Routes | Socle mais menu à masquer |
| `.../garage/logistics*` | `LogisticsDashboardPage`, `LogisticsCrewPage` | logistique/admin | Logistique/conformité/urgence | À masquer |
| `.../garage/fleet`, `maintenance`, `transit`, `incidents` | `GarageDashboardPage` avec vues | logistique/admin | Flotte/garage | À masquer |

### 3.8 Pages présentes mais non routées directement

Ces fichiers ne doivent pas être supprimés sans analyse d'import et validation métier. Ils sont des **candidates à dépréciation**, des composants internes, ou des anciennes générations remplacées.

| Groupe | Pages candidates |
|---|---|
| Anciennes pages agence | `DashboardAgencePage`, `ManagerDashboardPage`, `ManagerCockpitPage`, `ManagerOperationsPage`, `ManagerFinancesPage`, `ManagerExpensesPage`, `AgencyManagerExpensesPage`, `AgenceReservationsPage`, `AgenceRapportsPage`, `AgenceRapportPostePage`, `AgenceShiftPage`, `AgenceShiftHistoryPage`, `AgencePersonnelPage`, `ChefAgencePersonnelPage`, `ProfilAgentPage`, `AgencyTreasuryPage`, `AgencyPlaceholderPage` |
| Anciennes pages embarquement/garage | `AgenceEmbarquementPage`, `AffectationVehiculePage`, `FleetLayout` |
| Anciennes pages courrier | `CourierDashboardPage` |
| Anciennes pages compagnie | `CompagnieDashboard`, `CompagnieComptabilitePage`, `CompanyFinancesPage`, `CompanyGlobalFleetPage`, `OperationsFlotteLandingPage`, `FleetFinancePage`, `RevenusLiquiditesPage`, `CEOExpensesPage`, `CEOCockpitPage`, `CompagnieInvitationsPage`, `MessagesCompagniePage`, `CompanyCashPage` |
| Anciennes pages plateforme | `AdminAgentsPage`, `AdminParametresPage` |
| Pages publiques non routées directement | `FindReservationPage` |
| Composants/pages internes | `CeoPilotageDashboard`, `ParametresLegauxPage`, `ParametresReseauxPage`, `AgenceFinancesPage`, `AgenceRecettesPage`, `ShiftHistoryPage` |

---

## 4. Cartographie Firestore

### 4.1 Collections MVP critiques

| Collection / chemin | Rôle métier | Pages/flux consommateurs principaux | Importance |
|---|---|---|---|
| `companies` | Tenant, marque, configuration et capacités | Vitrine, auth, tous layouts, admin plateforme | Critique MVP |
| `users` | Profil, rôle, tenant et agence | Auth, invitations, équipe, permissions | Critique MVP |
| `invitations` | Onboarding utilisateurs | AcceptInvitation, équipe/admin | Critique MVP |
| `companies/{id}/agences` | Points de vente et escales | Guichet, agence, escale, compagnie | Critique MVP |
| `.../agences/{agencyId}/users` | Personnel agence | Équipe, flotte équipage | Critique MVP |
| `.../agences/{agencyId}/weeklyTrips` | Modèles horaires/prix/capacité | Recherche, guichet, planification | Critique MVP |
| `companies/{id}/routes` + `stops` | Réseau et ordre des escales | Recherche, réservation, escale, manifeste | Critique MVP |
| `companies/{id}/tripInstances` + `inventory` + `progress` | Départs réels, places et progression | Public, guichet, départs, boarding, escale | Critique MVP |
| `.../agences/{agencyId}/reservations` | Billets/réservations | Tous flux billetterie, paiements, rapports, boarding | Critique MVP |
| `publicReservations` | Pointeur public vers réservation | Paiement, preuve, mes billets | Critique MVP |
| `companies/{id}/payments` | Paiements unifiés | Paiement public, caisse digitale, finance | Critique MVP |
| `companies/{id}/paymentLogs` | Audit validation/rejet paiement | Caisse digitale, finance | Critique MVP |
| `companies/{id}/paymentConfigs` + `paymentMethods` | Moyens de paiement disponibles | PaymentMethodPage, paramètres paiement | Critique MVP |
| `.../agences/{agencyId}/shifts` + `shiftReports` | Sessions guichet et clôture | Guichet, comptabilité agence, rapports | Critique MVP |
| `companies/{id}/cashTransactions` | Encaissements opérationnels | Guichet, digital, caisse, dashboards | Critique MVP |
| `companies/{id}/cashClosures` | Clôtures caisse | Caisse agence/escale/compagnie | Critique MVP |
| `.../agences/{agencyId}/cashSessions` | Contrôle caisse agence | CashSessionsPage, guichet/compta | Critique MVP |
| `.../agences/{agencyId}/dailyStats` | Agrégats ventes journalières | Dashboards et rapports | Critique MVP |
| `companies/{id}/activityLogs` | Journal commercial append-only | Dashboard agence/compagnie | Critique MVP |
| `.../agences/{agencyId}/boardingLogs` | Audit scan/embarquement | Boarding | Critique MVP |
| `.../agences/{agencyId}/boardingClosures` | Clôture embarquement | Boarding, opérations agence | Critique MVP |
| `.../agences/{agencyId}/boardingStats` | Agrégats embarquement | Dashboard agence | Critique MVP |
| `.../agences/{agencyId}/agencyLiveState/current` | État opérationnel temps réel | Dashboard agence/compagnie | Critique MVP |
| `companies/{id}/counters/byTrip/trips/{tripId}` | Séquences/références billets | Billetterie publique et guichet | Critique MVP |

### 4.2 Collections phase 2

| Collection / chemin | Rôle métier | Consommateurs principaux | Importance |
|---|---|---|---|
| `companies/{id}/tripExecutions` | Suivi inter-agences d'un trajet | Arrivées, escale, flotte, boarding | Phase 2 |
| `.../agences/{agencyId}/tripAssignments` | Affectation départ/véhicule | Planification, départs | Phase 2 |
| `.../tripAssignmentVehicleSlots`, `planningLocks` | Verrous et slots de planification | TripPlanningPage | Phase 2 |
| `companies/{id}/planningStats`, `planningVehicleTripCount` | Agrégats planification | Planification | Phase 2 |
| `companies/{id}/virtualSessions` | Session virtuelle paiements online | Opérateur digital, caisse | Phase 2 |
| `companies/{id}/cashRefunds`, `cashTransfers` | Remboursements et transferts | Finance/caisse | Phase 2 |
| `.../agences/{agencyId}/cashAudits`, `cashMovements`, `cashReceipts`, `comptaEncaissements` | Audit caisse détaillé | Comptabilité agence | Phase 2 |
| `companies/{id}/financialTransactions` | Ledger financier unifié récent | Finance, sessions, métriques | Phase 2 |
| `companies/{id}/financialAccounts`, `companyBanks` | Comptes et banques | Trésorerie | Phase 2 |
| `companies/{id}/treasuryTransferRequests`, `agencyTransferRequests` | Demandes de transfert | Trésorerie agence/compagnie | Phase 2 |
| `companies/{id}/customers` | CRM dérivé des réservations | Pages clients compagnie | Phase 2 |
| `companies/{id}/notifications`, `systemErrors` | Alertes et diagnostics | Direction, finance, flotte | Phase 2 |
| `companies/{id}/connections` | Connexions/relations opérationnelles | Services compagnie | Phase 2 |
| `companies/{id}/subscription`, `plans`, `adminSettings/plans`, `subscriptionRequests`, `upgradeRequests` | Abonnement SaaS | Admin plateforme, capacités | Phase 2 |
| `villes` | Référentiel villes | Public, trajets, agences | Phase 2 mais socle de qualité |

### 4.3 Collections phase 3 / modules à masquer

| Collection / chemin | Rôle métier | Consommateurs principaux | Importance |
|---|---|---|---|
| `companies/{id}/logistics/data/shipments` | Colis | Courrier, tracking, flotte | Phase 3 |
| `.../logistics/data/batches`, `events`, `sessions`, `ledger` | Lots, événements et ledger courrier | Courrier | Phase 3 |
| `.../agences/{agencyId}/courierSessions`, `batches` | Sessions/lots courrier agence | Courrier | Phase 3 |
| `publicShipmentTrack` | Tracking colis public | Pages track | Phase 3 |
| `companies/{id}/vehicles` | Flotte canonique récente | Garage/logistique | Phase 3 |
| `companies/{id}/vehicleLiveState` | État live véhicule | Garage/logistique | Phase 3 |
| `companies/{id}/fleetVehicles` | Flotte legacy agence | Flotte agence/boarding | Phase 3, à migrer |
| `companies/{id}/fleetMovements`, `vehicleModels` | Mouvements et modèles | Flotte/garage | Phase 3 |
| `companies/{id}/fleetMaintenance`, `fleetCosts`, `fuelLogs`, `vehicleFinancialHistory` | Maintenance et coûts | Garage/finance | Phase 3 |
| `companies/{id}/logisticsActions` | Actions logistiques | Garage/logistique | Phase 3 |
| `companies/{id}/expenses`, `payables`, `suppliers`, `paymentProposals` | Dépenses et fournisseurs | Comptabilité compagnie | Phase 3 |
| `companies/{id}/financialMovements`, `financialMovementIdempotency` | Ancien moteur trésorerie | Finance | Phase 3 / migration |
| `companies/{id}/accounts/{accountId}/ledger` | Comptabilité en partie double | Compta | Phase 3 |
| `companies/{id}/tripCosts`, `riskSettings`, `metrics`, `reconciliationLogs` | Intelligence, risques et cohérence | Command center/diagnostics | Phase 3 |
| `companies/{id}/avis`, `imagesBibliotheque` | Avis et médias compagnie | Vitrine/configuration | Phase 3 |
| `medias`, `platform/settings`, `platformLeads` | Marketing plateforme | Admin plateforme/vitrine | Phase 3 |

### 4.4 Collections déclarées mais à vérifier

Les règles contiennent aussi des collections techniques ou historiques dont l'usage UI direct n'est pas évident :

- `boardingLocks`, `boardingEmbarkDedup`, `guichetSaleLocks` ;
- `financialTransactionIdempotency`, `financialMovementIdempotency` ;
- `planRequests`, `billingRequests`, `_meta` ;
- `personnel` au niveau compagnie et au niveau agence ;
- `counters` génériques en plus du compteur billets `byTrip`.

Elles ne doivent pas être supprimées : plusieurs garantissent l'idempotence et la concurrence des transactions.

---

## 5. Recommandation MVP

### 5.1 Modules MVP à conserver visibles

| Module visible | Pages recommandées | Justification |
|---|---|---|
| Billetterie guichet | `/agence/guichet`, reçu, impression | Source principale de vente terrain |
| Billetterie en ligne | vitrine, recherche, booking, paiement, preuve, billet | Parcours client complet |
| Réservations | vues agence/compagnie et mes billets | Support client et exploitation |
| Paiements | configuration paiement, paiements unifiés | Nécessaire à la conversion |
| Validation opérateur digital | `/compagnie/:id/digital-cash` | Contrôle opérationnel des paiements online |
| Gestion des départs | validation départs + bus du jour | Lien entre vente et exécution |
| Liste passagers | manifeste escale/boarding | Contrôle avant départ |
| Embarquement | dashboard boarding | Exécution transport |
| Scan QR | boarding scan | Contrôle rapide des billets |
| Rapports de ventes | rapports agence + activité réseau | Pilotage minimal |
| Caisse agence | domaine caisse + comptabilité agence | Contrôle des encaissements |
| Clôture de caisse | sessions, shiftReports, cashClosures | Gouvernance opérationnelle |
| Dashboard agence | `/agence/activite` | Supervision locale |
| Dashboard compagnie | command center simplifié | Supervision réseau |
| Configuration essentielle | agences, utilisateurs, routes, horaires, paiements | Administration nécessaire au MVP |

### 5.2 Modules à masquer temporairement

| Module | Pages/menus concernés | Motif |
|---|---|---|
| Courrier | tout `/agence/courrier/*`, tracking et scan colis | Sous-produit autonome, forte surface fonctionnelle |
| Dépenses avancées | audit onglet dépenses, espace comptable dépenses | Hors chaîne vente-départ |
| Garage | `/garage/dashboard`, flotte garage | Deux modèles flotte encore présents |
| Flotte avancée | espaces flotte agence et compagnie | À consolider après choix `vehicles` vs `fleetVehicles` |
| Maintenance | `/garage/maintenance` | Phase 3 |
| Transit | `/garage/transit` | Phase 3 |
| Équipage avancé | flotte crew et logistics crew | À réintégrer après simplification départs |
| Planification logistique | `/agence/planification-trajets` | Trop large pour MVP, dépendances multiples |
| Validation logistique | affectations/contrôleur flotte | À simplifier autour de la validation départ |
| Arrivées attendues | `/agence/arrivees-attendues` | Phase 2 |
| Incidents | `/garage/incidents` | Phase 3 |
| Conformité véhicules | `/garage/logistics/compliance` | Phase 3 |
| Urgence trajet | `/garage/logistics/emergency` | Phase 3 |
| CRM clients | `/compagnie/:id/customers*` | Utile mais non critique au lancement |
| Avis et bibliothèque images | avis, images | Marketing secondaire |
| Intelligence avancée | trip costs, risques, diagnostics, rentabilité flotte | À réactiver après stabilisation des sources |

### 5.3 Menus MVP recommandés par rôle

| Rôle | Menu MVP recommandé |
|---|---|
| Admin plateforme | Compagnies, abonnements, moyens de paiement, paramètres |
| Admin compagnie | Dashboard, Activité réseau, Paiements, Agences, Configuration |
| Chef d'agence | Activité, Caisse, Équipe, Trajets, Validation départs, Rapports |
| Guichetier | Guichet, Caisse/session, Reçus |
| Comptable agence | Caisse, Sessions/clôtures, Journal agents, Rapports |
| Opérateur digital | Paiements en attente uniquement |
| Agent embarquement | Départs planifiés, Scan/liste, Manifeste |
| Agent/chef d'escale | Bus du jour, Guichet, Embarquement, Manifeste, Caisse |

### 5.4 Ordre recommandé pour le futur plan de simplification

1. Unifier les rôles, alias et permissions dans une seule source, puis aligner les règles Firestore.
2. Corriger les routes/menu incohérents, notamment `accounting/cash-control`.
3. Définir la source canonique de flotte : `vehicles` ou `fleetVehicles`.
4. Définir la source canonique financière et documenter le rôle de chaque ledger.
5. Marquer explicitement les pages legacy et mesurer leur usage avant suppression.
6. Masquer les modules phase 3 par feature flags, sans supprimer leurs données.
7. Simplifier les dashboards autour des indicateurs MVP issus de `reservations`, `payments`, `cashTransactions`, `shifts/shiftReports` et `dailyStats`.

---

## Conclusion

TELIYA possède déjà les briques nécessaires à un MVP transport solide, mais leur visibilité actuelle mélange opérations critiques, ERP avancé et fonctionnalités expérimentales. La simplification doit être une opération de **navigation et de gouvernance des sources de vérité**, pas une suppression immédiate de code ou de collections.

Avant toute suppression, chaque page candidate obsolète doit être vérifiée par :

- recherche de ses imports ;
- vérification des liens externes et favoris utilisateurs ;
- contrôle des événements d'usage réels ;
- validation de la migration des données associées ;
- confirmation des règles Firestore et Cloud Functions dépendantes.
