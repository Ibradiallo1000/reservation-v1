# Rapport de restructuration de la navigation — Module Compagnie (CEO)

**Projet :** Teliya  
**Périmètre :** Navigation et menus du module Compagnie (CEO) uniquement  
**Contraintes :** Aucune suppression de logique métier, de fonctionnalités, de permissions ou de rôles ; aucune rupture des routes existantes.

---

## 1. Inventaire de l’existant

### 1.1 Items actuels de la sidebar (CompagnieLayout)

| # | Libellé actuel        | Chemin (path)              | Icône     | Badge / remarque        |
|---|------------------------|----------------------------|-----------|--------------------------|
| 1 | Centre de commande     | `{basePath}/command-center`| Gauge     | —                        |
| 2 | Finances               | `{basePath}/finances`      | DollarSign| —                        |
| 3 | Trésorerie             | `{basePath}/treasury`      | Wallet    | —                        |
| 4 | Comptabilité           | `{basePath}/comptabilite`  | BarChart2 | —                        |
| 5 | Agences                | `{basePath}/agences`       | Building  | —                        |
| 6 | Réservations           | `{basePath}/reservations`  | ClipboardList | badge: preuves en ligne |
| 7 | Flotte                 | `{basePath}/fleet`         | Truck     | —                        |
| 8 | Avis clients           | `{basePath}/avis-clients`  | MessageSquare | badge: avis en attente |
| 9 | Configuration          | `{basePath}/parametres`    | Settings  | —                        |

**Fichier concerné :** `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` (tableau `sections`, lignes 148–158).

**Base path :**  
- Avec `companyId` dans l’URL : `/compagnie/${urlCompanyId}`  
- Sans : `/compagnie` (cas sans inspection).

---

### 1.2 Routes Compagnie CEO (AppRoutes)

Toutes sous le préfixe `/compagnie/:companyId` :

| Route (path)       | Composant / élément              | Présent dans la sidebar ? |
|--------------------|-----------------------------------|----------------------------|
| `index`            | `<RoleLanding />`                 | Non (redirige CEO → command-center) |
| `command-center`   | `<CEOCommandCenterPage />`       | Oui — Centre de commande   |
| `payment-approvals`| `<CEOPaymentApprovalsPage />`     | Non (accessible depuis Centre de commande) |
| `finances`         | `<CompanyFinancesPage />`        | Oui — Finances             |
| `treasury`         | `<CEOTreasuryPage />`             | Oui — Trésorerie           |
| `fleet`            | `<CompanyGlobalFleetPage />`     | Oui — Flotte               |
| `dashboard`        | `<CompagnieDashboard />`         | **Non** (route existante, pas dans le menu) |
| `comptabilite`     | `<CompagnieComptabilitePage />`  | Oui — Comptabilité         |
| `agences`          | `<CompagnieAgencesPage />`       | Oui — Agences              |
| `parametres`       | `<CompagnieParametresTabsPage />`| Oui — Configuration        |
| `parametres/plan`  | `<ParametresPlan />`             | Non (onglet interne)       |
| `reservations`     | `<CompagnieReservationsPage />`  | Oui — Réservations         |
| `images`           | `<BibliothequeImagesPage />`     | Non (onglet Médias dans Paramètres) |
| `payment-settings` | `<CompanyPaymentSettingsPage />`| Non (onglet Moyens de paiement)     |
| `avis-clients`     | `<AvisModerationPage />`         | Oui — Avis clients         |

**Fichier :** `src/AppRoutes.tsx` (lignes 280–303).

---

### 1.3 Configuration (Paramètres) — contenu actuel

**Page :** `CompagnieParametresTabsPage.tsx`  
**Route :** `/compagnie/:companyId/parametres`  
**Onglets (TABS) actuels :**

| Clé tab            | Libellé affiché           | Composant rendu                |
|--------------------|---------------------------|---------------------------------|
| `plan`             | Plan & abonnement         | ParametresPlan                  |
| `vitrine`          | Vitrine publique          | ParametresVitrine              |
| `services`         | Services proposés         | ParametresServices             |
| `medias`           | Médias                    | BibliothequeImagesPage         |
| `moyens-paiement`  | Moyens de paiement        | CompanyPaymentSettingsPage     |
| `banques`          | Banques de la compagnie   | ParametresBanques              |
| `personnel`        | Personnel                 | ParametresPersonnel            |
| `securite`         | Sécurité                  | ParametresSecurite             |
| `reseaux`          | Réseaux sociaux           | ParametresReseauxPage          |
| `legaux`           | Mentions & politique      | ParametresLegauxPage           |

**Agences** ne fait pas partie des onglets Configuration aujourd’hui ; c’est un item de menu principal pointant vers `/agences`.

---

### 1.4 Fichiers de layout impliqués

| Fichier | Rôle |
|---------|------|
| `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` | Définition des `sections` (sidebar CEO), basePath, badges. |
| `src/shared/layout/InternalLayout.tsx` | Rendu de la sidebar (liste plate de `NavSection` : label, icon, path, badge, end). Pas de sous-menus natifs. |
| `src/AppRoutes.tsx` | Déclaration des routes enfants sous `/compagnie/:companyId`. |

---

### 1.5 Redondances et chevauchements

- **Finances vs Trésorerie :** deux entrées de menu et deux routes (`/finances`, `/treasury`) pour des sujets proches (revenus / synthèse vs trésorerie / liquidités). Fusion souhaitée en une entrée « Revenus & Liquidités ».
- **Dashboard absent du menu :** la route `dashboard` existe et affiche `CompagnieDashboard` (vue comparative agences, KPI, santé réseau) mais n’apparaît pas dans la sidebar. Elle doit devenir l’entrée « Performance Réseau ».
- **Agences au même niveau que les autres :** aujourd’hui au même niveau que le pilotage opérationnel ; à déplacer dans Configuration pour clarifier « stratégie / opérations » vs « structure / paramètres ».
- **Réservations et Flotte :** deux entrées distinctes ; la cible demande une seule entrée « Opérations & Flotte » (un seul item de menu, sans supprimer les routes).

---

## 2. Structure de navigation cible (menu principal CEO)

Menu principal à 7 entrées, dans l’ordre suivant :

| # | Libellé cible           | Type de changement | Route(s) associée(s) / comportement |
|---|-------------------------|--------------------|-------------------------------------|
| 1 | **Poste de Pilotage**   | Renommage          | `command-center` (inchangé)         |
| 2 | **Revenus & Liquidités**| Fusion             | Voir § 2.1                          |
| 3 | **Performance Réseau**  | Nouvelle entrée menu | `dashboard` (existant, actuellement hors menu) |
| 4 | **Opérations & Flotte** | Regroupement       | Voir § 2.2                          |
| 5 | **Contrôle & Audit**    | Renommage          | `comptabilite` (inchangé)           |
| 6 | **Avis Clients**        | Inchangé           | `avis-clients` (badge conservé)     |
| 7 | **Configuration**      | Inchangé + contenu élargi | `parametres` + sous-contenu § 2.3 |

---

### 2.1 Fusion Finances + Trésorerie → « Revenus & Liquidités »

- **Objectif :** une seule entrée de menu, sans supprimer les routes existantes.
- **Option recommandée (sans casser les URLs) :**
  - **Menu :** une entrée « Revenus & Liquidités » pointant vers une **nouvelle route** (ex. `revenus-liquidites`).
  - **Nouvelle page :** page « coquille » avec deux onglets (ou deux zones) :
    - Onglet 1 : **Revenus & synthèse** → rendu du contenu actuel de `CompanyFinancesPage` (ou inclusion du composant).
    - Onglet 2 : **Trésorerie** → rendu du contenu actuel de `CEOTreasuryPage`.
  - **Routes existantes :**
    - Garder `finances` et `treasury` telles quelles.
    - Ajouter une **redirection** (ou un composant qui lit `?tab=...`) :  
      `finances` → `revenus-liquidites?tab=revenus` (optionnel),  
      `treasury` → `revenus-liquidites?tab=tresorerie` (optionnel),  
      pour que les anciens liens / favoris continuent de fonctionner.
- **Résumé :**  
  - **Création :** route `revenus-liquidites`, page `RevenusLiquiditesPage` (wrapper à onglets).  
  - **Conservation :** `CompanyFinancesPage`, `CEOTreasuryPage`, routes `finances` et `treasury` (éventuellement redirigées vers la nouvelle page avec query param).  
  - **Menu :** une seule entrée « Revenus & Liquidités » → `revenus-liquidites`.

---

### 2.2 Regroupement « Opérations & Flotte »

- **Objectif :** une seule entrée de menu « Opérations & Flotte », sans supprimer les routes.
- **Option recommandée (sans sous-menus dans InternalLayout) :**
  - **Nouvelle route :** ex. `operations-reseau` (ou `operations`).
  - **Nouvelle page :** page « hub » (landing) avec deux blocs cliquables :
    - **Réservations** → lien `Navigate` vers `reservations` (badge préuves en ligne peut être affiché sur ce bloc ou reporté sur l’entrée menu unique, voir ci-dessous).
    - **Flotte** → lien vers `fleet`.
  - **Menu :** une entrée « Opérations & Flotte » pointant vers `operations-reseau`. Le **badge** (preuves en ligne) reste affiché sur cette entrée unique.
  - **Routes existantes :** `reservations` et `fleet` restent définies et utilisées (depuis la landing ou des liens directs).
- **Résumé :**  
  - **Création :** route `operations-reseau`, page `OperationsFlotteLandingPage`.  
  - **Conservation :** `reservations`, `fleet`, composants existants.  
  - **Menu :** une entrée « Opérations & Flotte » → `operations-reseau`.

---

### 2.3 Configuration — contenu obligatoire

La section **Configuration** doit contenir (rien ne doit en être retiré) :

- Agences (déplacé depuis le menu principal)
- Personnel
- Plan & Abonnement
- Vitrine publique
- Réseaux sociaux
- Mentions & politique
- Services proposés
- Médias
- Moyens de paiement
- Banques
- Tout autre module de paramètres existant (aucun retrait).

**Agences dans Configuration :**

- **Option A (recommandée) :** ajouter un onglet **Agences** dans `CompagnieParametresTabsPage` (clé ex. `agences`), qui rend le même composant `CompagnieAgencesPage` (déjà utilisable via `useParams().companyId`). La route `/agences` reste en place pour accès direct / favoris.
- **Option B :** garder la route `/agences` comme seule entrée ; depuis la page Configuration, afficher un lien « Gérer les agences » qui mène vers `/agences`. L’entrée « Agences » disparaît du menu principal et n’apparaît que comme lien depuis Configuration.

Recommandation : **Option A** (onglet Agences dans Configuration) pour tout garder dans le même espace « Configuration ».

**Ordre suggéré des onglets Configuration (après refactor) :**

1. Agences  
2. Personnel  
3. Plan & Abonnement  
4. Sécurité  
5. Vitrine publique  
6. Réseaux sociaux  
7. Mentions & politique  
8. Services proposés  
9. Médias  
10. Moyens de paiement  
11. Banques  
(+ tout autre onglet existant non listé ici)

---

## 3. Plan d’implémentation technique

### 3.1 Fichiers à modifier (liste exhaustive)

| Fichier | Modification |
|---------|--------------|
| `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` | Remplacer le tableau `sections` par les 7 entrées cibles ; libellés et paths selon le tableau § 2 ; conserver `basePath` et la logique des badges (preuves en ligne sur « Opérations & Flotte », avis en attente sur « Avis Clients »). |
| `src/AppRoutes.tsx` | Ajouter les routes : `revenus-liquidites` (RevenusLiquiditesPage), `operations-reseau` (OperationsFlotteLandingPage). Optionnel : redirections depuis `finances` / `treasury` vers `revenus-liquidites?tab=...`. Aucune suppression de route existante. |
| `src/modules/compagnie/pages/CompagnieParametresTabsPage.tsx` | Ajouter l’onglet `agences` dans `TABS` et dans `renderTab` (rendu de `CompagnieAgencesPage`). Étendre le type `TabKey` pour inclure `'agences'`. Ordre des onglets conforme au § 2.3. |
| **Nouveaux fichiers (à créer)** | |
| `src/modules/compagnie/pages/RevenusLiquiditesPage.tsx` | Page wrapper avec deux onglets : Revenus & synthèse (contenu CompanyFinancesPage), Trésorerie (contenu CEOTreasuryPage). Réutiliser les composants existants. |
| `src/modules/compagnie/pages/OperationsFlotteLandingPage.tsx` | Page hub avec deux cartes/liens : Réservations → `/reservations`, Flotte → `/fleet`. Utiliser `useParams()` pour `companyId` et `Navigate`. |

### 3.2 Fichiers à ne pas modifier (ou modifications minimales)

- **Routes :** ne pas supprimer ni renommer les paths existants (`command-center`, `finances`, `treasury`, `comptabilite`, `agences`, `reservations`, `fleet`, `parametres`, `avis-clients`, `dashboard`, `payment-approvals`, `images`, `payment-settings`, `parametres/plan`). Au besoin, ajouter des `<Route>` avec `<Navigate>` pour redirections.
- **Permissions et rôles :** `PrivateRoute`, `routePermissions.compagnieLayout`, `AuthContext` — inchangés.
- **InternalLayout :** pas de changement obligatoire ; si on souhaite plus tard des sous-menus (ex. Configuration dépliable), ce sera une évolution séparée.
- **Composants métier :** `CompanyFinancesPage`, `CEOTreasuryPage`, `CompagnieAgencesPage`, `CompagnieDashboard`, `CompagnieReservationsPage`, `CompanyGlobalFleetPage`, `CompagnieComptabilitePage`, `AvisModerationPage`, `CompagnieParametresTabsPage` — aucun retrait de logique ; uniquement réutilisation ou inclusion dans de nouvelles pages « coquille » si besoin.

### 3.3 Changements de routes (sans rupture)

- **Ajouts :**
  - `path="revenus-liquidites"` → `element={<RevenusLiquiditesPage />}` (ou équivalent lazy).
  - `path="operations-reseau"` → `element={<OperationsFlotteLandingPage />}`.
- **Optionnel (rétrocompatibilité) :**
  - `path="finances"` → redirection vers `revenus-liquidites?tab=revenus` (ou garder `CompanyFinancesPage` tel quel et faire pointer le menu vers `revenus-liquidites` uniquement).
  - `path="treasury"` → redirection vers `revenus-liquidites?tab=tresorerie`.
- **Aucune suppression** de route.

### 3.4 Structure finale du tableau `sections` (CompagnieLayout)

Ordre et contenu proposés (à coller après calcul de `basePath`) :

1. **Poste de Pilotage** — `Gauge` — `${basePath}/command-center`
2. **Revenus & Liquidités** — `DollarSign` (ou icône mixte) — `${basePath}/revenus-liquidites`
3. **Performance Réseau** — `BarChart2` ou `TrendingUp` — `${basePath}/dashboard`
4. **Opérations & Flotte** — `Truck` (ou `ClipboardList`) — `${basePath}/operations-reseau`, `badge: onlineProofsCount`
5. **Contrôle & Audit** — `BarChart2` (ou `FileCheck`) — `${basePath}/comptabilite`
6. **Avis Clients** — `MessageSquare` — `${basePath}/avis-clients`, `badge: pendingReviewsCount`
7. **Configuration** — `Settings` — `${basePath}/parametres`

L’entrée « Agences » disparaît du tableau (elle devient un onglet dans Configuration).

---

## 4. Tableau de clarification (résumé)

| Élément | Statut | Détail |
|--------|--------|--------|
| **Routes existantes** | Inchangées (ou redirection douce) | Aucune suppression. Optionnel : redirections `finances` → `revenus-liquidites?tab=revenus`, `treasury` → `revenus-liquidites?tab=tresorerie`. |
| **Permissions / rôles** | Inchangés | Aucune modification de `PrivateRoute`, `routePermissions`, ni de la logique d’accès. |
| **Centre de commande** | Renommé uniquement | Libellé → « Poste de Pilotage », path `command-center` inchangé. |
| **Comptabilité** | Renommé uniquement | Libellé → « Contrôle & Audit », path `comptabilite` inchangé. |
| **Finances + Trésorerie** | Fusionnés (menu) | Une entrée « Revenus & Liquidités » ; nouvelle route + page à onglets ; routes `finances` / `treasury` conservées (ou redirigées). |
| **Dashboard** | Exposé dans le menu | Déjà en place en route ; ajout dans la sidebar sous le libellé « Performance Réseau », path `dashboard`. |
| **Réservations + Flotte** | Regroupés (menu) | Une entrée « Opérations & Flotte » ; nouvelle route + page hub ; routes `reservations` et `fleet` conservées. |
| **Agences** | Déplacé | Retiré du menu principal ; ajouté comme onglet (ou lien) dans Configuration ; route `agences` conservée. |
| **Configuration** | Enrichie | Contient déjà les onglets actuels ; ajout de l’onglet (ou lien) Agences ; ordre des onglets aligné sur la liste § 2.3. |
| **Avis Clients** | Inchangé | Libellé et path identiques ; badge conservé. |

---

## 5. Résumé exécutif

- **Inventaire :** 9 items de sidebar actuels, 15+ routes enfants Compagnie CEO, 1 layout principal (`CompagnieLayout`), 1 layout partagé (`InternalLayout`). Redondances : Finances/Trésorerie ; Dashboard présent en route mais absent du menu ; Agences à déplacer dans Configuration.
- **Cible :** 7 entrées de menu (Poste de Pilotage, Revenus & Liquidités, Performance Réseau, Opérations & Flotte, Contrôle & Audit, Avis Clients, Configuration), avec Configuration contenant notamment Agences et tous les paramètres existants.
- **Implémentation :** modification du tableau `sections` dans `CompagnieLayout` ; ajout de 2 routes et 2 pages (Revenus & Liquidités, Opérations & Flotte) ; ajout de l’onglet Agences dans `CompagnieParametresTabsPage`. Aucune suppression de route ni de logique métier.
- **Livrable :** rapport uniquement ; aucune modification de code n’est effectuée dans ce document.
