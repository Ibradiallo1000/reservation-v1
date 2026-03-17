# Audit complet de l’espace Agence — TELIYA

*Document produit par analyse du code (AppRoutes.tsx, routePermissions.ts, ManagerShellPage.tsx). Aucune modification du code.*

---

## SECTION 1 — Liste complète des menus agence

Les menus affichés dans la sidebar dépendent du **rôle** de l’utilisateur. Source : `ManagerShellPage.tsx` (sections construites dans un `useMemo`).

### 1.1 Profil « Chef d’agence / Superviseur / Admin compagnie » (sidebar principale)

| Ordre | Menu                | Sous-menus |
|-------|---------------------|------------|
| 1     | Poste de pilotage   | —          |
| 2     | Opérations          | —          |
| 3     | Finances            | —          |
| 4     | Trésorerie          | Vue générale, Soumettre dépense, Versement compagnie, Nouveau payable fournisseur |
| 5     | Validation dépenses | —          |
| 6     | Courrier            | *(si agent courrier)* Session, Nouvel envoi, Lots, Réception, Remise, Rapports courrier |
| 7     | Rapports            | —          |
| 8     | Trajets             | —          |
| 9     | Flotte              | Tableau de bord, Exploitation, Affectation, Véhicules, Équipage, Mouvements |
| 10    | Équipe              | —          |

### 1.2 Profil « Agent courrier uniquement » (sidebar réduite)

- Session  
- Nouvel envoi  
- Lots  
- Réception  
- Remise  
- Rapports courrier  

*(Pas d’accès Poste de pilotage, Opérations, Trajets, Flotte, Équipe, etc.)*

### 1.3 Profil « Escale uniquement » (agent/chef d’escale, sans chef agence)

- Équipe  
- Retour tableau de bord escale  

*(Pas d’accès au reste de l’espace agence Manager.)*

---

## SECTION 2 — Liste complète des routes `/agence/*`

Toutes les routes dont le chemin commence par `/agence` (source : `AppRoutes.tsx`).

### 2.1 Sous le layout ManagerShellPage (`path="/agence"`)

| Route | Remarque |
|-------|----------|
| `/agence` | Redirection vers `/agence/dashboard` |
| `/agence/dashboard` | Poste de pilotage |
| `/agence/operations` | Opérations |
| `/agence/trajets` | Trajets |
| `/agence/finances` | Finances |
| `/agence/expenses-approval` | Validation dépenses |
| `/agence/expenses` | Redirection vers `expenses-approval` |
| `/agence/treasury` | Trésorerie — vue générale |
| `/agence/treasury/new-operation` | Soumettre dépense |
| `/agence/treasury/transfer` | Versement compagnie |
| `/agence/treasury/new-payable` | Nouveau payable fournisseur |
| `/agence/team` | Équipe |
| `/agence/reports` | Rapports |
| `/agence/fleet` | Flotte — tableau de bord |
| `/agence/fleet/operations` | Flotte — exploitation |
| `/agence/fleet/assignment` | Flotte — affectation |
| `/agence/fleet/vehicles` | Flotte — véhicules |
| `/agence/fleet/crew` | Flotte — équipage |
| `/agence/fleet/movements` | Flotte — mouvements |
| `/agence/courrier` | Courrier (layout avec sous-routes) |
| `/agence/courrier/session` | Session courrier |
| `/agence/courrier/nouveau` | Nouvel envoi |
| `/agence/courrier/lots` | Lots |
| `/agence/courrier/reception` | Réception |
| `/agence/courrier/remise` | Remise |
| `/agence/courrier/rapport` | Rapports courrier |

### 2.2 Layouts séparés (sidebar différente ou page pleine)

| Route | Layout / type |
|-------|----------------|
| `/agence/boarding` | BoardingLayout (embarquement) |
| `/agence/boarding` (index) | BoardingDashboardPage |
| `/agence/boarding/scan` | BoardingScanPage |
| `/agence/escale` | EscaleLayout |
| `/agence/escale` (index) | EscaleDashboardPage |
| `/agence/escale/bus` | EscaleBusDuJourPage |
| `/agence/escale/embarquement` | BoardingEscalePage |
| `/agence/escale/manifeste` | BusPassengerManifestPage |
| `/agence/escale/caisse` | EscaleCaissePage |
| `/agence/guichet` | Page pleine (pas sous ManagerShell) |
| `/agence/comptabilite` | Page pleine |
| `/agence/comptabilite/treasury/new-operation` | Page pleine |
| `/agence/comptabilite/treasury/transfer` | Page pleine |
| `/agence/comptabilite/treasury/new-payable` | Page pleine |
| `/agence/cash-sessions` | Page pleine |
| `/agence/receipt/:id` | Page pleine (reçu guichet) |
| `/agence/reservations/print` | Page pleine (impression réservation) |

**Total : 38 routes distinctes** (en comptant index, sous-routes et redirections).

---

## SECTION 3 — Pour chaque menu : route, fichier, rôle métier

### Menus de la sidebar ManagerShellPage (profil chef agence / superviseur / admin)

| Menu | Route | Fichier | Rôle métier |
|------|--------|---------|-------------|
| Poste de pilotage | `/agence/dashboard` | `ManagerCockpitPage.tsx` (agence/manager) | Tableau de bord agence : KPIs, shifts du jour, réservations, alertes, véhicules. |
| Opérations | `/agence/operations` | `ManagerOperationsPage.tsx` (agence/manager) | Vue opérationnelle : créneaux, trajets, réservations, affectations chauffeurs/convoyeurs. |
| Finances | `/agence/finances` | `ManagerFinancesPage.tsx` (agence/manager) | Synthèse financière agence (CA, rapports, etc.). |
| Trésorerie | `/agence/treasury` | `AgencyTreasuryPage.tsx` (agence/pages) | Trésorerie agence : vue générale, dépenses, versements, payables. |
| — Vue générale | `/agence/treasury` | idem | Vue d’ensemble trésorerie. |
| — Soumettre dépense | `/agence/treasury/new-operation` | `AgencyTreasuryNewOperationPage.tsx` (agence/treasury) | Saisie d’une dépense / opération. |
| — Versement compagnie | `/agence/treasury/transfer` | `AgencyTreasuryTransferPage.tsx` (agence/treasury) | Versement vers la compagnie. |
| — Nouveau payable fournisseur | `/agence/treasury/new-payable` | `AgencyTreasuryNewPayablePage.tsx` (agence/treasury) | Création d’un payable fournisseur. |
| Validation dépenses | `/agence/expenses-approval` | `AgencyManagerExpensesPage.tsx` (agence/manager) | Validation des dépenses en attente (chef agence / superviseur). |
| Courrier | `/agence/courrier` | `CourierLayout` + sous-pages (agence/courrier) | Module courrier : session, envois, lots, réception, remise, rapports. |
| — Session | `/agence/courrier/session` | `CourierSessionPage.tsx` | Session courrier. |
| — Nouvel envoi | `/agence/courrier/nouveau` | `CourierCreateShipmentPage.tsx` | Création d’un envoi. |
| — Lots | `/agence/courrier/lots` | `CourierBatchesPage.tsx` | Gestion des lots. |
| — Réception | `/agence/courrier/reception` | `CourierReceptionPage.tsx` | Réception. |
| — Remise | `/agence/courrier/remise` | `CourierPickupPage.tsx` | Remise. |
| — Rapports courrier | `/agence/courrier/rapport` | `CourierReportsPage.tsx` | Rapports courrier. |
| Rapports | `/agence/reports` | `ManagerReportsPage.tsx` (agence/manager) | Rapports agence. |
| Trajets | `/agence/trajets` | `AgenceTrajetsPage.tsx` (agence/pages) | Création et gestion des trajets hebdomadaires (routes, horaires, prix, places). |
| Flotte | `/agence/fleet` | Sous-pages (agence/fleet) | Flotte agence : tableau de bord, exploitation, affectation, véhicules, équipage, mouvements. |
| — Tableau de bord | `/agence/fleet` | `FleetDashboardPage.tsx` | Vue d’ensemble flotte (véhicules par statut). |
| — Exploitation | `/agence/fleet/operations` | `AgenceFleetOperationsPage.tsx` | Exploitation flotte (trajets, affectations). |
| — Affectation | `/agence/fleet/assignment` | `FleetAssignmentPage.tsx` | Affectation véhicules / trajets. |
| — Véhicules | `/agence/fleet/vehicles` | `FleetVehiclesPage.tsx` | Liste / détail véhicules. |
| — Équipage | `/agence/fleet/crew` | `FleetCrewPage.tsx` | Chauffeurs et convoyeurs (équipage flotte). |
| — Mouvements | `/agence/fleet/movements` | `FleetMovementLogPage.tsx` | Historique des mouvements flotte. |
| Équipe | `/agence/team` | `ManagerTeamPage.tsx` (agence/manager) | Gestion du personnel agence : invitations, rôles, codes agent, activation/désactivation. |

### Routes agence hors sidebar ManagerShellPage (accès direct par URL ou autre layout)

| Route | Fichier | Rôle métier |
|-------|---------|-------------|
| `/agence/boarding` (index + scan) | `BoardingLayout`, `BoardingDashboardPage`, `BoardingScanPage` (agence/boarding) | Embarquement : tableau de bord et scan. |
| `/agence/escale/*` | `EscaleLayout`, pages escale (agence/escale) | Espace escale : tableau de bord, bus du jour, embarquement, manifeste, caisse. |
| `/agence/guichet` | `AgenceGuichetPage.tsx` (agence/guichet) | Vente de billets (guichet). |
| `/agence/comptabilite` | `AgenceComptabilitePage.tsx` (agence/comptabilite) | Comptabilité agence. |
| `/agence/comptabilite/treasury/*` | `AgencyTreasuryNewOperationPage`, etc. | Trésorerie depuis l’espace comptabilité. |
| `/agence/cash-sessions` | `CashSessionsPage.tsx` (agence/cashControl) | Sessions caisse / contrôle caisse. |
| `/agence/receipt/:id` | `ReceiptGuichetPage.tsx` (agence/guichet) | Affichage / impression d’un reçu. |
| `/agence/reservations/print` | `ReservationPrintPage.tsx` (agence/guichet) | Impression d’une réservation. |

---

## SECTION 4 — Menus potentiellement redondants ou à fusionner

### 4.1 Chevauchements « Opérations / Exploitation / Affectation / Trajets »

- **Opérations** (`/agence/operations`) : vue globale des créneaux, trajets, réservations, affectations. C’est la page « pilotage opérationnel » de l’agence.
- **Exploitation** (Flotte, `/agence/fleet/operations`) : exploitation flotte (trajets, affectations véhicules).
- **Affectation** (Flotte, `/agence/fleet/assignment`) : affectation véhicules / trajets.
- **Trajets** (`/agence/trajets`) : paramétrage des trajets hebdomadaires (routes, horaires, prix).

**Constat :**  
Le même domaine métier (trajets, affectations, exploitation) est réparti entre :
- une entrée **Opérations** (côté agence),
- deux entrées **Exploitation** et **Affectation** sous **Flotte**.

**Pistes de simplification :**  
- Regrouper « Exploitation » et « Affectation » flotte en une seule entrée « Exploitation flotte » avec onglets ou sous-vues.  
- Ou clarifier la différence (Opérations = vue agence globale, Flotte = vue véhicules/équipage) et éviter de dupliquer les libellés (ex. renommer « Exploitation » flotte en « Exploitation véhicules »).

### 4.2 Trésorerie en deux endroits

- **Trésorerie** dans la sidebar ManagerShell : `/agence/treasury` et sous-routes (vue générale, dépenses, versements, payables).
- **Comptabilité** : `/agence/comptabilite` avec des routes `/agence/comptabilite/treasury/*` (new-operation, transfer, new-payable).

**Constat :**  
Les mêmes types d’écrans trésorerie (soumettre dépense, versement, nouveau payable) sont accessibles :
- depuis le menu **Trésorerie** (chef agence),
- depuis l’espace **Comptabilité** (comptable agence).

**Piste :**  
Unifier l’entrée « Trésorerie » (une seule arborescence) et adapter les droits d’accès par rôle (chef agence vs comptable) plutôt que dupliquer les menus.

### 4.3 Deux « Tableaux de bord »

- **Poste de pilotage** : `/agence/dashboard` (ManagerCockpitPage) — tableau de bord agence.
- **Flotte → Tableau de bord** : `/agence/fleet` (FleetDashboardPage) — tableau de bord flotte.

**Constat :**  
Pas une redondance fonctionnelle : l’un est agence, l’autre flotte. Risque de confusion pour l’utilisateur (« deux tableaux de bord »).  

**Piste :**  
Renommer « Flotte → Tableau de bord » en « Vue flotte » ou « Synthèse flotte » pour distinguer clairement du poste de pilotage agence.

### 4.4 Rapports vs Rapports courrier

- **Rapports** : `/agence/reports` (ManagerReportsPage) — rapports généraux agence.
- **Rapports courrier** : `/agence/courrier/rapport` (CourierReportsPage) — rapports courrier.

**Constat :**  
Distinction claire (rapports agence vs courrier). Pas de fusion nécessaire ; éventuellement regrouper sous un seul menu « Rapports » avec sous-éléments « Agence » et « Courrier » si on veut réduire le nombre d’entrées de premier niveau.

### 4.5 Résumé des redondances / simplifications possibles

| Zone | Problème | Suggestion |
|------|----------|------------|
| Opérations / Flotte | « Opérations », « Exploitation », « Affectation », « Trajets » touchent au même domaine (trajets, affectations). | Clarifier les libellés et/ou regrouper Exploitation + Affectation flotte ; distinguer « paramétrage trajets » (Trajets) et « exploitation du jour » (Opérations / Flotte). |
| Trésorerie | Trésorerie (sidebar) et Comptabilité (treasury/*) proposent les mêmes types d’écrans. | Une seule arborescence Trésorerie avec accès conditionné par rôle. |
| Tableaux de bord | Deux intitulés « Tableau de bord ». | Renommer le sous-menu flotte (ex. « Synthèse flotte » ou « Vue flotte »). |
| Rapports | Deux entrées « Rapports » et « Rapports courrier ». | Optionnel : un menu « Rapports » avec sous-menus Agence / Courrier. |

---

## Références techniques

- **Routes** : `src/AppRoutes.tsx` (lignes 452–568 pour les routes `/agence`).
- **Permissions** : `src/constants/routePermissions.ts` (agenceShell, fleet, guichet, comptabilite, boarding, escaleDashboard, etc.).
- **Sidebar** : `src/modules/agence/manager/ManagerShellPage.tsx` (BASE_SECTIONS, TREASURY_CHILDREN, FLEET_CHILDREN, COURRIER_CHILDREN, et construction conditionnelle des sections selon le rôle).
