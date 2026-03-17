# Architecture espace Agence V2 — TELIYA

Document de conception pour la simplification de l’espace agence, basé sur l’audit `docs/AUDIT_ESPACE_AGENCE.md`. **Aucune modification du code n’est effectuée dans cette phase.**

---

## 1. Structure cible des menus

Arborescence cible validée :

```
Poste de pilotage

Exploitation
   Départs
   Trajets
   Affectations
   Embarquement

Billetterie
   Guichets
   Réservations
   Clients

Flotte
   Véhicules
   Équipage
   Affectations
   Maintenance

Finances
   Caisse
   Dépenses
   Trésorerie
   Rapports financiers

Personnel
   Équipe

Rapports
```

---

## 2. Mapping : structure cible → routes et pages actuelles

Pour chaque entrée de la structure cible, le tableau ci‑dessous indique quelles routes et quels fichiers existants sont concernés, et les écarts éventuels.

| Menu cible | Sous-menu cible | Route(s) actuelle(s) | Fichier(s) actuel(s) | Commentaire |
|------------|-----------------|------------------------|----------------------|-------------|
| **Poste de pilotage** | — | `/agence/dashboard` | `ManagerCockpitPage.tsx` | Inchangé. |
| **Exploitation** | *(entrée parente)* | `/agence/operations` | `ManagerOperationsPage.tsx` | La page « Opérations » actuelle peut servir d’index Exploitation ou être fusionnée avec « Départs ». |
| **Exploitation** | Départs | *(à formaliser)* | Aujourd’hui contenu dans `ManagerOperationsPage` (créneaux, shifts) et/ou `ManagerCockpitPage` | « Départs » = vue des départs du jour. À exposer en sous-route dédiée ou onglet. |
| **Exploitation** | Trajets | `/agence/trajets` | `AgenceTrajetsPage.tsx` | Paramétrage des trajets hebdomadaires. Migration vers `/agence/exploitation/trajets`. |
| **Exploitation** | Affectations | `/agence/operations` (affectations chauffeurs/convoyeurs) | `ManagerOperationsPage.tsx` | Affectations opérationnelles du jour. À distinguer de Flotte > Affectations (véhicules). Nouvelle route proposée : `/agence/exploitation/affectations`. |
| **Exploitation** | Embarquement | `/agence/boarding`, `/agence/boarding/scan` | `BoardingLayout`, `BoardingDashboardPage`, `BoardingScanPage` | Déjà dédié. À raccorder au menu Exploitation (lien ou redirection). Route proposée : `/agence/exploitation/embarquement` (alias vers boarding). |
| **Billetterie** | *(entrée parente)* | — | — | Nouveau regroupement. Pas de page « Billetterie » unique aujourd’hui. |
| **Billetterie** | Guichets | `/agence/guichet` | `AgenceGuichetPage.tsx` | Vente de billets. Route proposée : `/agence/billetterie/guichets`. |
| **Billetterie** | Réservations | *(éclaté)* | `ManagerOperationsPage` (liste résa), `ReservationPrintPage` (impression) | Liste des réservations agence. Route proposée : `/agence/billetterie/reservations`. Page à consolider ou réutiliser depuis operations. |
| **Billetterie** | Clients | *(absent)* | — | Pas d’écran « Clients » dédié agence dans l’audit. À définir (recherche client, historique par client). Route proposée : `/agence/billetterie/clients`. |
| **Flotte** | *(entrée parente)* | `/agence/fleet` | `FleetDashboardPage.tsx` | Conserver comme index ou rediriger vers Véhicules. |
| **Flotte** | Véhicules | `/agence/fleet/vehicles` | `FleetVehiclesPage.tsx` | Inchangé. Route proposée : `/agence/flotte/vehicules` (alignement nom « flotte »). |
| **Flotte** | Équipage | `/agence/fleet/crew` | `FleetCrewPage.tsx` | Inchangé. Route proposée : `/agence/flotte/equipage`. |
| **Flotte** | Affectations | `/agence/fleet/assignment` | `FleetAssignmentPage.tsx` | Affectation véhicules / trajets. Route proposée : `/agence/flotte/affectations`. |
| **Flotte** | Maintenance | *(absent côté agence)* | — | Aujourd’hui plutôt côté compagnie (Garage). À définir : vue lecture seule agence ou lien. Route proposée : `/agence/flotte/maintenance`. |
| **Finances** | *(entrée parente)* | `/agence/finances`, `/agence/treasury`, `/agence/comptabilite` | `ManagerFinancesPage`, `AgencyTreasuryPage`, `AgenceComptabilitePage` | Trois entrées actuelles à regrouper sous un seul menu Finances. |
| **Finances** | Caisse | `/agence/cash-sessions`, (partie caisse dans `AgenceComptabilitePage`) | `CashSessionsPage.tsx`, `AgenceComptabilitePage.tsx` | Sessions caisse / contrôle caisse. Route proposée : `/agence/finances/caisse`. |
| **Finances** | Dépenses | `/agence/treasury/new-operation`, `/agence/expenses-approval` | `AgencyTreasuryNewOperationPage`, `AgencyManagerExpensesPage` | Soumettre dépense + validation dépenses. Routes proposées : `/agence/finances/depenses`, `/agence/finances/depenses/validation`. |
| **Finances** | Trésorerie | `/agence/treasury`, `/agence/treasury/transfer`, `/agence/treasury/new-payable`, `/agence/comptabilite/treasury/*` | `AgencyTreasuryPage`, `AgencyTreasuryTransferPage`, `AgencyTreasuryNewPayablePage` | Unifier : une seule arborescence. Routes proposées : `/agence/finances/tresorerie`, `/agence/finances/tresorerie/versement`, `/agence/finances/tresorerie/payable`. |
| **Finances** | Rapports financiers | `/agence/finances`, `/agence/reports` (partie financière) | `ManagerFinancesPage.tsx`, `ManagerReportsPage.tsx` | Synthèse CA et rapports. Route proposée : `/agence/finances/rapports`. |
| **Personnel** | Équipe | `/agence/team` | `ManagerTeamPage.tsx` | Inchangé. Route proposée : `/agence/personnel/equipe`. |
| **Rapports** | — | `/agence/reports` | `ManagerReportsPage.tsx` | Rapports généraux agence (hors financier). Route proposée : `/agence/rapports` (conservée). |

### Éléments hors structure cible (à positionner)

| Élément actuel | Route(s) | Proposition |
|----------------|----------|-------------|
| **Courrier** (session, envois, lots, réception, remise, rapports) | `/agence/courrier/*` | Conserver en menu séparé « Courrier » (rôle agent courrier) ou, à terme, sous Billetterie si le courrier est traité comme flux « colis / envois » lié à l’agence. Non intégré dans la structure cible ci‑dessus. |
| **Espace Escale** (tableau de bord, bus du jour, embarquement, manifeste, caisse) | `/agence/escale/*` | Reste un espace à part (EscaleLayout) pour rôles escale. Pas fusionné dans Exploitation dans cette V2. |
| **Comptabilité** (page pleine) | `/agence/comptabilite` | Fusionnée dans Finances (Caisse / Trésorerie / Rapports financiers) avec accès conditionné par rôle comptable. |

---

## 3. Menus à fusionner (résumé)

| Avant (audit) | Après (V2) | Action |
|---------------|------------|--------|
| Poste de pilotage | Poste de pilotage | Inchangé. |
| Opérations | Exploitation (parent) | Renommé et éclaté en sous-menus : Départs, Trajets, Affectations, Embarquement. |
| Trajets (standalone) | Exploitation > Trajets | Déplacé sous Exploitation. |
| — | Exploitation > Départs | Nouveau sous-menu (contenu issu d’Opérations / cockpit). |
| — | Exploitation > Affectations | Sous-menu dédié (contenu opérationnel actuel d’Opérations). |
| — | Exploitation > Embarquement | Lien vers l’existant Boarding (même layout ou alias). |
| Flotte (6 sous-menus) | Flotte (4 sous-menus) | Réduction : Tableau de bord / Exploitation / Mouvements fusionnés ou supprimés ; conservation Véhicules, Équipage, Affectations ; ajout Maintenance. |
| Finances + Trésorerie + Validation dépenses | Finances (parent unique) | Un seul menu Finances avec : Caisse, Dépenses, Trésorerie, Rapports financiers. |
| Trésorerie (4 sous-menus) | Finances > Trésorerie (+ sous-routes) | Conservé comme sous-ensemble de Finances. |
| Validation dépenses | Finances > Dépenses (et validation) | Intégré dans Dépenses. |
| Comptabilité (hors sidebar) | Finances (Caisse, Trésorerie, etc.) | Accès par les mêmes routes Finances, droits selon rôle. |
| Équipe | Personnel > Équipe | Renommé en « Personnel » avec un sous-menu « Équipe ». |
| Guichet (page pleine) | Billetterie > Guichets | Intégré sous Billetterie. |
| — | Billetterie > Réservations | Nouvelle entrée (contenu à consolider depuis Opérations / liste résa). |
| — | Billetterie > Clients | Nouvelle entrée (à spécifier). |
| Rapports | Rapports | Conservé en entrée de premier niveau. |

---

## 4. Nouvelles routes proposées

Schéma d’URL cible pour l’espace agence (`/agence/...`), aligné sur la structure des menus.

### 4.1 Poste de pilotage

| Route proposée | Rôle | Page / composant actuel |
|----------------|------|--------------------------|
| `/agence` | Redirection | → `/agence/dashboard` |
| `/agence/dashboard` | Poste de pilotage | `ManagerCockpitPage` |

### 4.2 Exploitation

| Route proposée | Rôle | Page / composant actuel |
|----------------|------|--------------------------|
| `/agence/exploitation` | Index Exploitation | Redirection vers Départs ou `ManagerOperationsPage` |
| `/agence/exploitation/departs` | Départs | Nouvelle vue ou `ManagerOperationsPage` (créneaux / shifts du jour) |
| `/agence/exploitation/trajets` | Trajets | `AgenceTrajetsPage` (actuel `/agence/trajets`) |
| `/agence/exploitation/affectations` | Affectations | Partie affectations de `ManagerOperationsPage` ou extraction |
| `/agence/exploitation/embarquement` | Embarquement | Alias ou redirect vers `/agence/boarding` (conserver BoardingLayout) |

### 4.3 Billetterie

| Route proposée | Rôle | Page / composant actuel |
|----------------|------|--------------------------|
| `/agence/billetterie` | Index Billetterie | Redirection vers Guichets ou page synthèse |
| `/agence/billetterie/guichets` | Guichets | `AgenceGuichetPage` (actuel `/agence/guichet`) |
| `/agence/billetterie/reservations` | Réservations | Nouvelle page ou réutilisation liste réservations (operations) |
| `/agence/billetterie/clients` | Clients | À créer ou à définir |

### 4.4 Flotte

| Route proposée | Rôle | Page / composant actuel |
|----------------|------|--------------------------|
| `/agence/flotte` | Index Flotte | `FleetDashboardPage` ou redirection vers Véhicules |
| `/agence/flotte/vehicules` | Véhicules | `FleetVehiclesPage` (actuel `/agence/fleet/vehicles`) |
| `/agence/flotte/equipage` | Équipage | `FleetCrewPage` (actuel `/agence/fleet/crew`) |
| `/agence/flotte/affectations` | Affectations | `FleetAssignmentPage` (actuel `/agence/fleet/assignment`) |
| `/agence/flotte/maintenance` | Maintenance | À définir (lecture seule agence ou lien compagnie) |

Routes actuelles à déprécier ou rediriger après migration :

- `/agence/fleet` → `/agence/flotte`
- `/agence/fleet/operations` → contenu à répartir (Exploitation vs Flotte)
- `/agence/fleet/movements` → optionnel : garder sous `/agence/flotte/mouvements` ou intégrer dans Véhicules / Affectations

### 4.5 Finances

| Route proposée | Rôle | Page / composant actuel |
|----------------|------|--------------------------|
| `/agence/finances` | Index Finances | Redirection ou `ManagerFinancesPage` |
| `/agence/finances/caisse` | Caisse | `CashSessionsPage` (+ éventuellement vue caisse comptabilité) |
| `/agence/finances/depenses` | Dépenses | `AgencyTreasuryNewOperationPage` (soumettre) |
| `/agence/finances/depenses/validation` | Validation dépenses | `AgencyManagerExpensesPage` |
| `/agence/finances/tresorerie` | Trésorerie | `AgencyTreasuryPage` (vue générale) |
| `/agence/finances/tresorerie/versement` | Versement | `AgencyTreasuryTransferPage` |
| `/agence/finances/tresorerie/payable` | Payable fournisseur | `AgencyTreasuryNewPayablePage` |
| `/agence/finances/rapports` | Rapports financiers | `ManagerFinancesPage` / rapports financiers |

Routes actuelles à déprécier ou rediriger :

- `/agence/treasury` → `/agence/finances/tresorerie`
- `/agence/treasury/new-operation` → `/agence/finances/depenses`
- `/agence/treasury/transfer` → `/agence/finances/tresorerie/versement`
- `/agence/treasury/new-payable` → `/agence/finances/tresorerie/payable`
- `/agence/expenses-approval` → `/agence/finances/depenses/validation`
- `/agence/comptabilite` → accès via `/agence/finances` (avec sous-routes selon rôle)
- `/agence/comptabilite/treasury/*` → `/agence/finances/tresorerie/*`
- `/agence/cash-sessions` → `/agence/finances/caisse`

### 4.6 Personnel

| Route proposée | Rôle | Page / composant actuel |
|----------------|------|--------------------------|
| `/agence/personnel` | Index Personnel | Redirection vers Équipe |
| `/agence/personnel/equipe` | Équipe | `ManagerTeamPage` (actuel `/agence/team`) |

### 4.7 Rapports

| Route proposée | Rôle | Page / composant actuel |
|----------------|------|--------------------------|
| `/agence/rapports` | Rapports | `ManagerReportsPage` (actuel `/agence/reports`) |

### 4.8 Routes transverses (conservées)

| Route proposée | Rôle |
|----------------|------|
| `/agence/receipt/:id` | Reçu guichet (inchangé) |
| `/agence/reservations/print` | Impression réservation (inchangé) |
| `/agence/boarding`, `/agence/boarding/scan` | Embarquement (layout dédié, lien depuis Exploitation > Embarquement) |
| `/agence/escale/*` | Espace escale (inchangé, hors fusion V2) |
| `/agence/courrier/*` | Courrier (inchangé si conservé en menu séparé) |

---

## 5. Récapitulatif des changements de routes

| Type | Exemple |
|------|--------|
| **Conservée** | `/agence/dashboard` |
| **Renommée / déplacée** | `/agence/trajets` → `/agence/exploitation/trajets` |
| **Regroupée** | `/agence/treasury`, `/agence/expenses-approval` → sous `/agence/finances/*` |
| **Nouvelle** | `/agence/exploitation/departs`, `/agence/billetterie/reservations`, `/agence/billetterie/clients`, `/agence/flotte/maintenance` |
| **Alias / redirect** | `/agence/exploitation/embarquement` → `/agence/boarding` |
| **Unification** | Toutes les entrées Trésorerie et Comptabilité → `/agence/finances/*` |

---

## 6. Points d’attention pour l’implémentation (ultérieure)

1. **Redirections** : Mettre en place des redirects permanents (301) ou des `<Navigate>` des anciennes URLs vers les nouvelles pour ne pas casser les favoris et les liens.
2. **Permissions** : Réutiliser les mêmes rôles (`routePermissions`) ; seuls les chemins changent. Vérifier `agenceShell`, `comptabilite`, `guichet`, `cashControl`, etc.
3. **Sidebar** : Adapter `ManagerShellPage.tsx` pour construire les sections à partir de la structure V2 (Exploitation, Billetterie, Flotte, Finances, Personnel, Rapports).
4. **Courrier et Escale** : Décision produit à trancher (menu séparé, sous Billetterie, ou lien depuis Exploitation / autre).
5. **Billetterie > Réservations et Clients** : Définir le périmètre (liste des réservations agence, recherche client, fiche client) et réutiliser ou extraire le code existant (ex. `ManagerOperationsPage`).
6. **Flotte > Maintenance** : Définir si l’agence a une vue lecture seule sur la maintenance ou uniquement un lien vers l’espace compagnie.

---

## 7. Références

- Audit source : `docs/AUDIT_ESPACE_AGENCE.md`
- Routes actuelles : `src/AppRoutes.tsx`
- Sidebar : `src/modules/agence/manager/ManagerShellPage.tsx`
- Permissions : `src/constants/routePermissions.ts`
