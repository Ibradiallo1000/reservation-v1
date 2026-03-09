# Audit des rôles et permissions — Plateforme TELIYA

**Date :** 7 mars 2025  
**Périmètre :** Analyse de l’existant uniquement (aucun nouveau rôle créé).

---

## 1. Rôles identifiés dans le code

Source de vérité : `src/roles-permissions.ts`, `src/constants/routePermissions.ts`, `src/modules/auth/components/PrivateRoute.tsx`, `src/core/permissions/roleCapabilities.ts`.

| # | Nom du rôle (technique) | Libellé affiché | Niveau |
|---|--------------------------|-----------------|--------|
| 1 | `admin_platforme` | Admin Plateforme | Plateforme |
| 2 | `admin_compagnie` | CEO | Compagnie |
| 3 | `company_accountant` | Chef Comptable | Compagnie |
| 4 | `financial_director` | Directeur Financier | Compagnie |
| 5 | `chef_garage` | Chef garage | Compagnie |
| 6 | `chefAgence` | Chef d'agence | Agence |
| 7 | `superviseur` | Superviseur | Agence |
| 8 | `agency_accountant` | Comptable Agence | Agence |
| 9 | `guichetier` | Guichetier | Agence |
| 10 | `agentCourrier` | Agent courrier | Agence |
| 11 | `chefEmbarquement` | Chef embarquement | Agence |
| 12 | `agency_fleet_controller` | Contrôleur flotte agence | Agence |
| 13 | `unauthenticated` / `user` | — | Sentinelle / défaut |

*Note :* Les alias `company_ceo` et `chefagence` sont normalisés en `admin_compagnie` et `chefAgence` dans le code.

---

## 2. Détail par rôle

### 2.1 admin_platforme (Admin Plateforme)

- **Dashboard / pages :** `/admin/*` — Dashboard, Compagnies (liste, ajout, modifier, plan), Plans, Abonnements, Revenus, Réservations, Finances, Statistiques, Paramètres plateforme, Media.
- **Lecture Firestore :** `companies`, `companies/{id}/*` (agences, avis, etc.), `plans`, sous-collections réservations via requêtes admin, `dailyStats` (collectionGroup), données financières plateforme.
- **Écriture Firestore :** `companies` (création, mise à jour), `companies/{id}/agences`, plans, paramètres plateforme ; peut impersonner une compagnie (lecture avec `companyId` URL).
- **Actions :** Créer/modifier compagnies et agences, gérer plans et abonnements, voir tous les revenus/réservations plateforme, accéder à toutes les pages CEO et chef comptable en impersonation.
- **Modules :** Dashboard, statistiques, paramètres (plateforme) ; accès complet à l’ensemble des modules en impersonation.

---

### 2.2 admin_compagnie (CEO)

- **Dashboard / pages :** `/compagnie/:companyId/*` — Poste de pilotage (command-center), Revenus & Liquidités, Performance réseau (dashboard), Opérations, Flotte, Contrôle & Audit (comptabilité), Avis clients, Configuration (parametres, plan, agences, réservations, images, payment-settings). Accès aussi à `/compagnie/:companyId/trip-costs`.
- **Lecture Firestore :** `companies/{companyId}`, `companies/{companyId}/agences`, `companies/{companyId}/agences/{agencyId}/reservations`, `dailyStats` (collectionGroup), `agencyLiveState`, `expenses`, `shiftReports`, `shifts`, `tripCosts`, `fleetVehicles`, `financialAccounts`, payables, `companies/{companyId}/avis`, paramètres (banques, etc.).
- **Écriture Firestore :** `companies/{companyId}` (paramètres), `companies/{companyId}/agences`, invitations/personnel, paramètres compagnie ; pas d’écriture directe dans réservations/shifts (sauf si usage des mêmes services que chef agence).
- **Actions :** Voir tous les indicateurs (CA billets + courrier, liquidités, risques, top agences), gérer agences et personnel, paramètres compagnie, flotte globale, approbations paiements ; pas de validation comptable des postes (réservée au comptable).
- **Modules :** Dashboard, statistiques, agences, personnel, paramètres. Capabilities : view_global_dashboard, manage_company_finances, manage_global_fleet, manage_roles, manage_treasury, manage_logistics, etc.

---

### 2.3 company_accountant (Chef Comptable / Comptable compagnie)

- **Dashboard / pages :** `/compagnie/:companyId/accounting` et `/chef-comptable` — Vue globale, Réservations en ligne, Finances, Trésorerie, Rapports, Paramètres. Accès à `/compagnie/:companyId/trip-costs` et `/compta/validations` (ValidationComptablePage).
- **Lecture Firestore :** `companies/{companyId}`, `companies/{companyId}/agences`, `companies/{companyId}/agences/{agencyId}/reservations`, `dailyStats` (collectionGroup), `shiftReports`, données trésorerie, payables, dépenses (pour rapports).
- **Écriture Firestore :** Pas d’écriture directe dans les réservations ; validation de sessions (côté agence) et mouvements trésorerie selon le code (validate_sessions, manage_treasury).
- **Actions :** Consulter CA (billets + courrier), finances, trésorerie, rapports ; valider des sessions (workflow validations) ; gérer trip costs (lecture/écriture selon pages).
- **Modules :** Dashboard, réservations, finances, dépenses, statistiques.

---

### 2.4 financial_director (DAF / Directeur Financier)

- **Dashboard / pages :** Même espace que `company_accountant` — `/compagnie/:companyId/accounting`, `/chef-comptable`, `/compta/validations`, `/compagnie/:companyId/trip-costs`.
- **Lecture Firestore :** Identique au chef comptable (companies, agences, reservations, dailyStats, shiftReports, trésorerie, payables).
- **Écriture Firestore :** Selon les mêmes flux que company_accountant (validations, trésorerie).
- **Actions :** Supervision financière, validation de sessions, vue profit/anomalies/insights (capabilities supplémentaires par rapport à company_accountant).
- **Modules :** Dashboard, réservations, finances, dépenses, statistiques.

---

### 2.5 chef_garage (Chef garage)

- **Dashboard / pages :** `/compagnie/:companyId/garage/*` — Dashboard garage, Flotte, Maintenance, Transit, Incidents. Pas d’accès au layout CEO (pas d’agences, paramètres, command-center).
- **Lecture Firestore :** `companies/{companyId}/fleetVehicles`, `companies/{companyId}/agences` (pour contexte), données flotte/maintenance/transit/incidents (selon les pages garage).
- **Écriture Firestore :** Véhicules, états flotte, maintenance, mouvements (selon services utilisés par le layout garage).
- **Actions :** Gérer la flotte au niveau compagnie (véhicules, maintenance, transit, incidents).
- **Modules :** Dashboard, fleet (global).

---

### 2.6 chefAgence (Chef d’agence)

- **Dashboard / pages :** `/agence/*` — Dashboard, Opérations, Trajets, Finances, Trésorerie, Équipe, Rapports, **Courrier** (toutes sous-pages). Accès aussi à `/agence/boarding`, `/agence/fleet`, `/agence/guichet`, `/agence/comptabilite`, `/agence/validations`, `/agence/receipt/:id`, `/agence/reservations/print`. Accès à `/compagnie/:companyId/*` (layout CEO) car dans `routePermissions.compagnieLayout` seul admin_compagnie et admin_platforme sont listés — en pratique le redirect après login envoie le CEO vers command-center ; le chef agence est envoyé vers `/agence/dashboard`. Donc pas d’accès aux routes `/compagnie/:companyId` pour chefAgence (PrivateRoute compagnieLayout = admin_compagnie, admin_platforme).
- **Lecture Firestore :** `companies/{companyId}/agences/{agencyId}/*` — reservations, shifts, shiftReports, dailyStats, personnel, courierSessions, shipments (logistics), fleet (agence), trajets, dépenses, trésorerie agence.
- **Écriture Firestore :** Réservations (via services partagés), shifts (indirectement via guichet), validation des rapports (validations chef), personnel, courrier (création sessions, lots), flotte agence, paramètres agence.
- **Actions :** Piloter l’agence (dashboard, opérations, finances, équipe, rapports), valider les postes (validations chef), gérer guichet/courrier/embarquement/flotte agence, gérer le personnel.
- **Modules :** Dashboard, réservations, finances, guichet, embarquement, fleet, personnel ; capabilities incluent manage_logistics.

---

### 2.7 superviseur (Superviseur agence)

- **Dashboard / pages :** Mêmes routes que chefAgence (agenceShell) — Dashboard, Opérations, Trajets, Finances, Trésorerie, Équipe, Rapports. **Pas** dans `routePermissions.courrier` : seul chefAgence, admin_compagnie, agentCourrier. Donc le superviseur n’a pas accès au layout Courrier. Vérification : `routePermissions.courrier = ["agentCourrier", "chefAgence", "admin_compagnie"]` — superviseur n’est pas dedans, donc pas d’accès à `/agence/courrier`. Il a accès à agence shell (dashboard, operations, team, etc.) et à validations agence, guichet, comptabilité, boarding, fleet (car dans agenceShell, boarding, fleet, guichet, comptabilite selon routePermissions).
- **Lecture Firestore :** Même périmètre que chef agence pour l’agence (reservations, shifts, dailyStats, etc.) ; pas de lecture spécifique courrier si pas d’accès aux pages courrier.
- **Écriture Firestore :** Validations chef, possibilité d’utiliser les mêmes services que chef agence pour les parties accessibles (finances, rapports, etc.).
- **Actions :** Vue agence, validations chef, guichet, embarquement, flotte agence, personnel ; **pas d’accès au module Courrier** (incohérence potentielle avec permissionsByRole qui donne `reservations` et `finances` mais pas `manage_logistics` ; roleCapabilities ne donne pas manage_logistics au superviseur).
- **Modules :** Dashboard, réservations, finances, guichet, embarquement, fleet, personnel.

---

### 2.8 agency_accountant (Comptable agence)

- **Dashboard / pages :** `/agence/comptabilite` uniquement (redirection prioritaire après login si ce rôle). Pas d’accès au shell agence (ManagerShellPage) car `agenceShell = ["chefAgence", "superviseur", "agentCourrier", "admin_compagnie"]` — agency_accountant n’est pas dedans.
- **Lecture Firestore :** `companies/{companyId}/agences/{agencyId}/shifts`, `shiftReports`, `reservations`, `courierSessions`, données trésorerie / comptes de l’agence.
- **Écriture Firestore :** Activation et validation des postes guichet (shifts, shiftReports), activation et validation des sessions courrier (courierSessions), écriture dans dailyStats (via validation session), mouvements trésorerie (réception caisse).
- **Actions :** Activer les postes guichet et courrier, valider les sessions (guichet → montant + dailyStats ; courrier → dailyStats courier), saisir les réceptions espèces, voir les écarts.
- **Modules :** Dashboard, finances, dépenses, statistiques (agence).

---

### 2.9 guichetier (Guichetier)

- **Dashboard / pages :** `/agence/guichet` uniquement. Accès aussi à `/agence/receipt/:id`, `/agence/reservations/print` (receiptGuichet).
- **Lecture Firestore :** `companies/{companyId}/agences/{agencyId}/reservations`, `shifts`, `weeklyTrips`, trajets, horaires, prix.
- **Écriture Firestore :** `companies/{companyId}/agences/{agencyId}/reservations` (création, mise à jour statut), `shifts` (ouverture, clôture via services), mise à jour dailyStats (via service de clôture/validation, pas directement par le guichetier).
- **Actions :** Ouvrir/fermer un poste, créer et modifier des réservations guichet, imprimer reçus.
- **Modules :** Guichet, réservations.

---

### 2.10 agentCourrier (Agent courrier)

- **Dashboard / pages :** `/agence/courrier` (redirection forcée si autre path dans agence) — Vue générale, Nouvel envoi, Lots, Réception, Remise, Rapports courrier. Accès via ManagerShellPage (agenceShell inclut agentCourrier) avec menu limité au courrier.
- **Lecture Firestore :** `companies/{companyId}/logistics/data/shipments`, `companies/{companyId}/agences/{agencyId}/courierSessions`, batches, events (logistics).
- **Écriture Firestore :** `courierSessions` (création PENDING, clôture CLOSED), `shipments` (création), batches (ajout/retrait envois), events.
- **Actions :** Créer une session courrier (PENDING), enregistrer des colis (envois), clôturer la session ; réception/remise (selon pages). Pas d’activation ni de validation (réservé au comptable).
- **Modules :** Dashboard, réservations (lecture pour contexte) ; manage_logistics.

---

### 2.11 chefEmbarquement (Chef embarquement)

- **Dashboard / pages :** `/agence/boarding` — Dashboard embarquement, Scan. Pas d’accès au shell agence (redirection vers /agence/boarding si chefEmbarquement).
- **Lecture Firestore :** `companies/{companyId}/agences/{agencyId}/reservations`, `weeklyTrips`, `boardingLocks`, `boardingLogs`, `fleetVehicles`, `fleetMovements`.
- **Écriture Firestore :** Mise à jour statut des réservations (embarqué, absent, etc.), `boardingLogs`, `boardingLocks`, `dailyStats` (boardingClosed), éventuellement `fleetMovements`.
- **Actions :** Scanner / marquer embarquement, gérer absents et reports, clôturer l’embarquement (impact dailyStats).
- **Modules :** Boarding, embarquement, réservations.

---

### 2.12 agency_fleet_controller (Contrôleur flotte agence)

- **Dashboard / pages :** `/agence/fleet` — Dashboard flotte, Opérations, Assignment, Véhicules, Movements. Pas d’accès au shell agence (redirection vers /agence/fleet).
- **Lecture Firestore :** `companies/{companyId}/agences/{agencyId}` (contexte), véhicules et affectations liés à l’agence, `fleetVehicles`, mouvements.
- **Écriture Firestore :** Affectations véhicules, états (selon services flotte agence).
- **Actions :** Gérer la flotte au niveau agence (véhicules, affectations, mouvements).
- **Modules :** Fleet (agence).

---

## 3. Tableau récapitulatif

| RÔLE | PAGES | LECTURE DONNÉES | ÉCRITURE DONNÉES | ACTIONS |
|------|--------|------------------|-------------------|---------|
| **admin_platforme** | /admin/* (dashboard, compagnies, plans, abonnements, revenus, résas, finances, stats, paramètres, media) | companies, agences, reservations (toutes), dailyStats, plans, paramètres plateforme | companies, agences, plans, paramètres | Tout : créer/modifier compagnies, impersonation CEO/compta |
| **admin_compagnie** | /compagnie/:id/* (command-center, revenus, dashboard, opérations, flotte, comptabilité, avis, paramètres), trip-costs | companies/:id, agences, reservations, dailyStats, agencyLiveState, expenses, shiftReports, shifts, tripCosts, fleet, accounts, payables, avis | companies/:id (paramètres), agences, personnel, paramètres | Vue globale, agences, flotte, paramètres, approbations ; pas validation postes |
| **company_accountant** | /compagnie/:id/accounting, /chef-comptable, /compta/validations, trip-costs | companies/:id, agences, reservations, dailyStats, shiftReports, trésorerie, payables | Trésorerie, validations (côté workflow) | Finances, rapports, validations, trip costs |
| **financial_director** | Idem company_accountant | Idem | Idem | Idem + vue profit/anomalies/insights |
| **chef_garage** | /compagnie/:id/garage/* (dashboard, fleet, maintenance, transit, incidents) | fleetVehicles, données flotte compagnie | Véhicules, maintenance, mouvements flotte | Gestion flotte globale compagnie |
| **chefAgence** | /agence/* (dashboard, operations, trajets, finances, treasury, team, reports, **courrier**), boarding, fleet, guichet, comptabilité, validations, receipt | agences/:aid/* (reservations, shifts, shiftReports, dailyStats, personnel, courierSessions, shipments, fleet, trajets) | reservations, shifts (via services), validations chef, personnel, courierSessions, shipments, flotte agence | Piloter agence, valider postes, guichet/courrier/embarquement/flotte, personnel |
| **superviseur** | /agence/* (dashboard, operations, trajets, finances, treasury, team, reports) — **pas /agence/courrier** ; boarding, fleet, guichet, comptabilité, validations | Même périmètre agence (hors courrier si pas de page) | Validations chef, idem chef pour parties accessibles | Vue agence, validations, guichet, embarquement, flotte ; **pas courrier** |
| **agency_accountant** | /agence/comptabilite uniquement | shifts, shiftReports, reservations, courierSessions, trésorerie agence | Activation/validation postes (shifts, shiftReports, dailyStats), activation/validation sessions courrier, réceptions | Activer postes guichet/courrier, valider sessions, réceptions caisse |
| **guichetier** | /agence/guichet, receipt, print | reservations, shifts, trajets, horaires | reservations (création/modif), shifts (ouverture/clôture via services) | Ouvrir/fermer poste, vendre billets, reçus |
| **agentCourrier** | /agence/courrier/* (session, nouveau, lots, reception, remise, rapport) | shipments, courierSessions, batches | courierSessions (créer, clôturer), shipments (créer), batches | Créer session, enregistrer colis, clôturer session |
| **chefEmbarquement** | /agence/boarding (dashboard, scan) | reservations, weeklyTrips, boardingLocks/Logs, fleet | reservations (statut), boardingLogs, dailyStats (boardingClosed), fleetMovements | Embarquement, absents, reports, clôture |
| **agency_fleet_controller** | /agence/fleet/* | Véhicules, affectations, mouvements (agence) | Affectations, états véhicules agence | Flotte agence |

---

## 4. Analyse des interconnexions entre rôles

### 4.1 Flux guichet → comptabilité → direction

- **Guichetier** ouvre un poste (shift), enregistre des réservations (montant, canal guichet). Il clôture le poste → un **shiftReport** est créé avec le montant total du poste.
- **Comptable agence** voit les postes clôturés sur `/agence/comptabilite`, active les postes (PENDING → ACTIVE), puis **valide** les sessions avec le montant reçu (espèces / mobile) → mise à jour de **dailyStats** (ticketRevenue, totalRevenue) et éventuellement trésorerie.
- **Chef d’agence / Superviseur** peut **valider côté chef** (validations agence) après le comptable.
- Les **dailyStats** (ticketRevenue, courierRevenue, totalRevenue) sont lus par le **CEO** (command-center, revenus) et par le **Chef comptable compagnie** (finances, rapports). Les données remontent donc : **Agence (guichet + comptable) → dailyStats → CEO / Chef comptable**.

### 4.2 Flux courrier → comptabilité → direction

- **Agent courrier** crée une session (PENDING), enregistre des colis (shipments avec transportFee, insuranceAmount, paymentStatus). Il clôture la session (CLOSED) → expectedAmount calculé.
- **Comptable agence** active la session courrier (PENDING → ACTIVE) et, après clôture, **valide** la session (CLOSED → VALIDATED) avec le montant compté → **updateDailyStatsOnCourierSessionValidated** (courierRevenue, totalRevenue) pour la date de la session.
- Les revenus courrier sont donc dans les **dailyStats** (courierRevenue) et remontent aux mêmes indicateurs **CEO** et **Chef comptable** que les billets. Flux : **Agent courrier → Comptable agence (activation + validation) → dailyStats → CEO / Chef comptable**.

### 4.3 Flux embarquement

- **Chef embarquement** marque les passagers (embarqué / absent / report), clôture l’embarquement → mise à jour **dailyStats** (boardingClosedCount) et **boardingLogs**. Les réservations sont mises à jour (statut). Pas de remontée financière directe ; les revenus restent ceux enregistrés au guichet/en ligne et validés par la comptabilité.

### 4.4 Flux flotte

- **Agence :** **agency_fleet_controller** et **chefAgence** gèrent véhicules et affectations au niveau agence. **Chef garage** (compagnie) gère la flotte globale (véhicules, maintenance, transit, incidents). Les **tripCosts** (coûts par trajet) sont accessibles au **CEO** et au **Chef comptable** (trip-costs) pour la marge.
- Données flotte lues par le CEO (poste de pilotage) pour indicateurs ; pas d’écriture des revenus par la flotte (revenus = billets + courrier via dailyStats).

### 4.5 Schéma résumé

```
Guichetier          →  réservations + shifts
                            ↓
Comptable agence    →  validation postes  →  dailyStats (ticketRevenue, totalRevenue)
                            ↓
Chef agence         →  validation chef (optionnel)
                            ↓
Agent courrier      →  shipments + courierSessions (PENDING → ACTIVE → CLOSED)
                            ↓
Comptable agence    →  activation + validation sessions courrier  →  dailyStats (courierRevenue, totalRevenue)
                            ↓
CEO / Chef comptable compagnie  →  lecture dailyStats, finances, trésorerie, rapports

Chef embarquement   →  réservations (statut), boardingLogs, dailyStats (boardingClosedCount)
Chef garage         →  flotte compagnie (véhicules, maintenance)
Contrôleur flotte   →  flotte agence (affectations, mouvements)
```

---

## 5. Problèmes ou incohérences détectés

### 5.1 Permissions / accès

- **Superviseur et module Courrier :** Le **superviseur** a les mêmes modules que le chef d’agence dans `permissionsByRole` (dashboard, reservations, finances, guichet, embarquement, fleet, personnel) mais **n’a pas** `manage_logistics` dans `roleCapabilities` et **n’est pas** dans `routePermissions.courrier`. Il ne peut donc pas accéder à `/agence/courrier`. Si le métier veut que le superviseur voie ou pilote le courrier, il manque l’accès ; sinon la doc des permissions devrait clarifier que le courrier est réservé au chef et à l’agent courrier.
- **Company_finances (Revenus & Liquidités) :** La page `CompanyFinancesPage` (Revenus consolidés) est protégée par la **capability** `manage_company_finances` (useCapabilities), pas seulement par le rôle. Les rôles `admin_compagnie`, `financial_director`, `company_accountant` ont cette capacité ; si le plan d’abonnement la retire, un CEO pourrait perdre l’accès à une page critique — à vérifier côté produit.
- **Chef comptable et layout CEO :** Le **company_accountant** n’a pas accès au layout `/compagnie/:id` (réservé à admin_compagnie et admin_platforme). Il a son propre layout `/compagnie/:id/accounting` et `/chef-comptable`. Pas d’incohérence technique, mais les liens “Revenus & Liquidités” depuis l’espace CEO ne sont pas disponibles pour le comptable (il a sa propre vue Finances/Trésorerie) — cohérent.

### 5.2 Données qui ne remontent pas ou sont partielles

- **Revenus courrier avant implémentation récente :** Les revenus courrier n’étaient pas intégrés aux dailyStats ni aux dashboards (corrigé par l’implémentation ticketRevenue/courierRevenue/totalRevenue). À surveiller : anciens dailyStats sans courierRevenue (fallback à 0).
- **Comptable agence et vue multi-agences :** Le comptable agence est rattaché à une **agence** (agencyId). Il ne voit que les postes et sessions courrier de **son** agence. Il n’a pas de vue consolidée multi-agences ; la consolidation est côté CEO / Chef comptable compagnie via dailyStats (collectionGroup). Donc pas de remontée manquante, mais le périmètre “comptable agence” = une seule agence.
- **Trip costs et rôles :** Les **tripCosts** sont éditables par les rôles ayant accès à `/compagnie/:companyId/trip-costs` (chefAgence, company_accountant, financial_director, admin_compagnie, admin_platforme). La lecture est utilisée côté CEO pour la marge. Vérifier que les écritures (qui peut saisir les coûts par trajet) sont bien restreintes aux rôles prévus.

### 5.3 Rôles avec périmètre large

- **admin_platforme** a **toutes** les capabilities (ALL_CAPABILITIES) et peut impersonner une compagnie. Il peut tout lire et tout modifier côté plateforme et, en impersonation, agir comme CEO. C’est cohérent pour un super-admin, mais à protéger (audit, 2FA, etc.).
- **admin_compagnie** a un large périmètre (finances, flotte, paramètres, personnel, logistics, etc.) mais **ne valide pas** les postes guichet ni les sessions courrier (pas la même capacité opérationnelle que le comptable agence). Cohérent.

### 5.4 Doublons et chemins legacy

- Deux entrées pour l’espace chef comptable : `/compagnie/:companyId/accounting` et `/chef-comptable`. Les deux utilisent les mêmes composants (VueGlobale, Finances, Rapports, etc.) ; redirections et liens peuvent prêter à confusion (quel lien mettre dans les mails, documentation, etc.).

### 5.5 Rôles “sentinelle” et normalisation

- **unauthenticated** et **user** n’ont ni pages ni capabilities. Les rôles Firestore “comptable”, “chef_agence”, “company_ceo”, “embarquement”, etc. sont normalisés dans AuthContext et PrivateRoute. Une **liste officielle des rôles** (constants/roles.ts vs roles-permissions.ts) n’est pas parfaitement alignée (ex. constants/roles n’a pas company_accountant, superviseur, chef_garage, etc.). Une seule source de vérité (roles-permissions.ts + routePermissions) serait préférable pour éviter les écarts.

---

## 6. Sources utilisées

- `src/roles-permissions.ts` — Rôles, modules, permissionsByRole
- `src/constants/routePermissions.ts` — Rôles par route/layout
- `src/constants/roles.ts` — Liste partielle des rôles
- `src/modules/auth/components/PrivateRoute.tsx` — Rôles canoniques, defaultLandingByRole
- `src/contexts/AuthContext.tsx` — Normalisation rôle, landingTargetForRoles
- `src/core/permissions/roleCapabilities.ts` — Capabilities par rôle
- `src/core/permissions/capabilities.ts` — Liste des capabilities
- `src/AppRoutes.tsx` — Routes et PrivateRoute/ProtectedRoute par zone
- `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` — Menu CEO
- `src/modules/compagnie/accounting/layout/CompanyAccountantLayout.tsx` — Menu chef comptable
- `src/modules/agence/manager/ManagerShellPage.tsx` — Menu agence, accès courrier
- `src/shared/layout/InternalLayout.tsx` — Libellés rôles

---

*Rapport d’audit des rôles et permissions TELIYA — analyse de l’existant uniquement.*
