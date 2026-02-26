# Rapport HOTFIX – Isolation Chef Garage (routing et layout dédié)

## Contexte

Lors d’une connexion en **CHEF_GARAGE**, l’utilisateur était redirigé vers le layout CEO (CompagnieLayout) et voyait tout le menu (Poste de Pilotage, Revenus, Performance Réseau, Opérations, Contrôle & Audit, etc.). Le correctif impose un **layout dédié** (GarageLayout) et des **routes séparées** pour que le Chef Garage n’ait accès qu’à **Flotte** et **Configuration**.

---

## 1. Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| **src/constants/routePermissions.ts** | `compagnieLayout` : retrait de `chef_garage` (reste `admin_compagnie`, `admin_platforme`). Ajout de `garageLayout: ["chef_garage", "admin_compagnie", "admin_platforme"]` pour la route `/compagnie/:companyId/garage`. |
| **src/AppRoutes.tsx** | Import lazy de `GarageLayout`. Nouveau bloc de routes `/compagnie/:companyId/garage` protégé par `PrivateRoute` avec `routePermissions.garageLayout`, avec enfants : `index` → `Navigate to="fleet"`, `fleet` → `GarageDashboardPage`, `parametres` → `CompagnieParametresTabsPage`. |
| **src/contexts/AuthContext.tsx** | `landingTargetForRoles` pour `chef_garage` : redirection vers `"/compagnie/garage/fleet"` (sans companyId ; le détail est géré dans LoginPage / RoleLanding). |
| **src/routes/RoleLanding.tsx** | `roleHome["chef_garage"]` = `"/compagnie/garage/fleet"`. Si `companyId` présent et path = `/compagnie/garage/fleet`, redirection vers `/compagnie/${companyId}/garage/fleet`. |
| **src/modules/auth/pages/LoginPage.tsx** | Pour `chef_garage` avec `companyId` : redirection vers `/compagnie/${companyId}/garage/fleet` (au lieu de `/compagnie/${companyId}/fleet`). `routeForRole("chef_garage")` retourne `"/compagnie/garage/fleet"`. |
| **src/modules/auth/components/PrivateRoute.tsx** | Quand l’utilisateur n’est pas autorisé sur une route : si le rôle est `chef_garage` et `user.companyId` est défini, redirection vers `/compagnie/${user.companyId}/garage/fleet` au lieu du fallback générique. Ainsi, un Chef Garage qui tente d’accéder à une route CEO est renvoyé vers son espace Garage. |
| **src/shared/layout/InternalLayout.tsx** | Ajout du libellé `chef_garage: "Chef garage"` dans `ROLE_LABELS` pour l’affichage dans la sidebar. |

---

## 2. Nouveau fichier : layout dédié

| Fichier | Rôle |
|---------|------|
| **src/modules/compagnie/layout/GarageLayout.tsx** | Layout réservé au Chef Garage (et éventuellement admin pour inspection). Utilise `InternalLayout` avec **deux sections** : **Flotte** (`/compagnie/:companyId/garage/fleet`) et **Configuration** (`/compagnie/:companyId/garage/parametres`). Pas de Poste de Pilotage, Revenus, Performance Réseau, Opérations, Contrôle & Audit ni Avis Clients. Charge la compagnie (nom, thème, devise), fournit `PageHeaderProvider` et `CurrencyProvider`, et affiche un loader pendant le chargement. |

---

## 3. Changements de routes

- **Avant**  
  - `chef_garage` était dans `compagnieLayout` → accès à `/compagnie/:companyId` et à toutes les routes enfants (command-center, revenus-liquidites, fleet, etc.).

- **Après**  
  - **Layout CEO** (`/compagnie/:companyId`) : `allowedRoles = routePermissions.compagnieLayout` = **uniquement** `admin_compagnie`, `admin_platforme`. Un Chef Garage qui ouvre `/compagnie/:companyId` ou `/compagnie/:companyId/command-center` n’est pas autorisé ; `PrivateRoute` le redirige vers `/compagnie/${user.companyId}/garage/fleet`.
  - **Layout Garage** (`/compagnie/:companyId/garage`) : `allowedRoles = routePermissions.garageLayout` = `chef_garage`, `admin_compagnie`, `admin_platforme`. Enfants :
    - `index` → `Navigate to="fleet"` (arrivée sur `/garage` → redirection vers la flotte).
    - `fleet` → `GarageDashboardPage`.
    - `parametres` → `CompagnieParametresTabsPage` (configuration, optionnel / limité au profil selon besoin métier).

- **Redirections après login**  
  - LoginPage : si `role === "chef_garage"` et `companyId` présent → `nav(/compagnie/${companyId}/garage/fleet)`.  
  - RoleLanding : si rôle `chef_garage` et `companyId` dans l’URL → `navigate(/compagnie/${companyId}/garage/fleet)`.

---

## 4. Permissions et isolation

- **routePermissions.compagnieLayout**  
  Ne contient plus `chef_garage`. Les routes sous `/compagnie/:companyId` (command-center, revenus-liquidites, dashboard, operations-reseau, comptabilite, avis-clients, etc.) ne sont **pas** accessibles au Chef Garage.

- **routePermissions.garageLayout**  
  Utilisé uniquement pour `/compagnie/:companyId/garage`. Le Chef Garage ne peut accéder qu’à ce préfixe et à ses enfants (`fleet`, `parametres`).

- **Vérification**  
  Un utilisateur avec uniquement le rôle `chef_garage` :
  - ne peut pas ouvrir `/compagnie/:companyId`, `/compagnie/:companyId/command-center`, `/revenus-liquidites`, `/controle`, `/operations-reseau`, etc. ;
  - est redirigé vers `/compagnie/${companyId}/garage/fleet` (depuis LoginPage, RoleLanding ou PrivateRoute en cas d’accès refusé).

---

## 5. Confirmation du comportement

- **Connexion en CHEF_GARAGE**  
  - Redirection vers `/compagnie/:companyId/garage/fleet`.  
  - La page chargée est **GarageDashboardPage** (tableau de bord flotte).

- **Sidebar**  
  - Seules les entrées **Flotte** et **Configuration** sont visibles.  
  - Aucun lien vers Poste de Pilotage, Revenus & Liquidités, Performance Réseau, Opérations, Contrôle & Audit ou Avis Clients.

- **Isolation CEO**  
  - Aucun élément de menu CEO n’est affiché dans le GarageLayout.  
  - L’accès aux routes CEO est refusé par `PrivateRoute` (compagnieLayout sans `chef_garage`) et renvoie vers `/compagnie/${companyId}/garage/fleet`.

---

## 6. Résumé

| Élément | Détail |
|--------|--------|
| **Fichiers modifiés** | routePermissions.ts, AppRoutes.tsx, AuthContext.tsx, RoleLanding.tsx, LoginPage.tsx, PrivateRoute.tsx, InternalLayout.tsx |
| **Nouveau layout** | `src/modules/compagnie/layout/GarageLayout.tsx` (Flotte + Configuration uniquement) |
| **Routes** | `/compagnie/:companyId` réservé au CEO ; `/compagnie/:companyId/garage` dédié Chef Garage avec `fleet` et `parametres` |
| **Permissions** | `compagnieLayout` sans `chef_garage` ; `garageLayout` pour l’espace Garage |
| **Isolation** | Connexion Chef Garage → GarageDashboardPage directement ; sidebar limitée à Flotte et Configuration ; pas d’accès aux routes CEO. |

---

*Rapport généré après correctif d’isolation Chef Garage (HOTFIX).*
