# Résumé d’implémentation — Refactor navigation module Compagnie (CEO)

**Date :** 19 février 2025  
**Projet :** Teliya  
**Périmètre :** Navigation stratégique CEO, sans suppression de logique métier ni de routes.

---

## 1. Fichiers modifiés

| Fichier | Modifications |
|---------|----------------|
| `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` | Sidebar réduite à 7 entrées ; libellés « Poste de Pilotage », « Revenus & Liquidités », « Performance Réseau », « Opérations & Flotte », « Contrôle & Audit », « Avis Clients », « Configuration ». Chemins mis à jour. Badge preuves en ligne reporté sur « Opérations & Flotte ». Suppression des entrées Agences, Finances, Trésorerie, Réservations, Flotte en tant qu’items directs. |
| `src/modules/compagnie/pages/CompagnieDashboard.tsx` | Titre de page « Performance Réseau » ; sous-titre explicatif ; ajout du bloc « Classement agences (CA période) » avec tableau rang / agence / CA ; renommage « Alertes critiques » en « Alertes par agence » ; lien « Agences actives » pointe vers `/parametres` (Configuration). Import `useFormatCurrency` pour le tableau. |
| `src/modules/compagnie/pages/CompagnieComptabilitePage.tsx` | Titre de page « Contrôle & Audit » ; sous-titre « Sessions · Réconciliations · Validations CEO · Anomalies — {période} ». Aucun changement de logique métier ni d’onglets. |
| `src/modules/compagnie/pages/CompagnieParametresTabsPage.tsx` | Nouvel onglet **Agences** (premier de la liste) ; import et rendu de `CompagnieAgencesPage` dans l’onglet `agences`. Ordre des onglets : Agences, Plan & abonnement, Vitrine publique, Personnel, Sécurité, Réseaux sociaux, Mentions & politique, Services proposés, Médias, Moyens de paiement, Banques. |
| `src/AppRoutes.tsx` | Lazy imports pour `RevenusLiquiditesPage` et `OperationsFlotteLandingPage`. Composants `RedirectFinancesToRevenus` et `RedirectTreasuryToRevenus` pour redirection depuis les anciennes routes. Nouvelles routes `revenus-liquidites` et `operations-reseau`. Routes `finances` et `treasury` redirigent vers `revenus-liquidites` avec `?tab=revenus` ou `?tab=liquidites`. |

---

## 2. Fichiers créés

| Fichier | Rôle |
|---------|------|
| `src/modules/compagnie/pages/RevenusLiquiditesPage.tsx` | Page fusion Revenus + Trésorerie. Deux onglets : **Revenus** (contenu `CompanyFinancesPage`) et **Liquidités** (contenu `CEOTreasuryPage`). Synchronisation avec le query param `?tab=revenus` ou `?tab=liquidites`. Texte de clarification entre revenus (CA, sessions validées) et liquidités (cash réel). Aucune duplication de logique : réutilisation des composants existants. |
| `src/modules/compagnie/pages/OperationsFlotteLandingPage.tsx` | Page hub **Opérations & Flotte**. Synthèse opérationnelle : réservations du jour, sessions ouvertes (shifts actifs/paused), véhicules disponibles / total. Deux boutons d’accès : **Réservations** (vers `reservations`) et **Flotte** (vers `fleet`). Données chargées depuis Firestore (réservations par agence pour la date du jour, shifts par agence, `fleetVehicles`). |

---

## 3. Routes ajoutées

| Route | Composant | Remarque |
|-------|-----------|----------|
| `/compagnie/:companyId/revenus-liquidites` | `RevenusLiquiditesPage` | Page principale « Revenus & Liquidités » (onglets Revenus / Liquidités). |
| `/compagnie/:companyId/operations-reseau` | `OperationsFlotteLandingPage` | Hub Opérations & Flotte avec synthèse et liens. |

---

## 4. Routes renommées (menu uniquement)

Aucune route (path) n’a été renommée. Les **libellés du menu** ont été changés comme suit :

- `command-center` → affiché comme **« Poste de Pilotage »**
- `comptabilite` → affiché comme **« Contrôle & Audit »**
- `dashboard` → affiché comme **« Performance Réseau »**
- `avis-clients` → affiché comme **« Avis Clients »** (inchangé sémantiquement)

---

## 5. Ce qui a été fusionné

- **Finances + Trésorerie** → une seule entrée de menu **« Revenus & Liquidités »** pointant vers `/revenus-liquidites`. La page affiche deux onglets (Revenus / Liquidités) réutilisant `CompanyFinancesPage` et `CEOTreasuryPage`. Les KPIs et données restent distincts (revenus vs liquidités) ; un court texte explique la différence.

---

## 6. Ce qui a été déplacé

- **Agences** : retiré du menu principal. Accessible désormais dans **Configuration** (page Paramètres) via l’onglet **« Agences »**. La route `/compagnie/:companyId/agences` reste définie et fonctionnelle (favoris, liens directs, onglet Configuration).

---

## 7. Ce qui est resté inchangé

- **Permissions et rôles** : `PrivateRoute`, `routePermissions.compagnieLayout`, `AuthContext` et toute logique de droits sont inchangés.
- **Routes existantes** : `command-center`, `payment-approvals`, `fleet`, `dashboard`, `comptabilite`, `agences`, `parametres`, `parametres/plan`, `reservations`, `images`, `payment-settings`, `avis-clients` restent déclarées. Les routes `finances` et `treasury` redirigent vers `revenus-liquidites` avec le bon `tab`.
- **Logique métier** : Aucune suppression ni modification des services, hooks, Firestore, ou composants métier (`CompanyFinancesPage`, `CEOTreasuryPage`, `CompagnieAgencesPage`, `CompagnieComptabilitePage`, etc.).
- **Layout partagé** : `InternalLayout` et le type `NavSection` sont inchangés.
- **Espace comptable compagnie** : Les routes sous `/compagnie/:companyId/accounting` (VueGlobale, Finances, Trésorerie, Rapports, Paramètres) sont inchangées.

---

## 8. Notes de migration

- **Anciens liens `/finances` et `/treasury`** : Redirection automatique vers `/revenus-liquidites?tab=revenus` ou `?tab=liquidites`. Aucune action utilisateur requise.
- **Accès Agences** : Depuis le menu CEO, aller dans **Configuration** puis onglet **Agences**. L’URL directe `/compagnie/:id/agences` continue de fonctionner.
- **Performance Réseau** : Ancienne route `dashboard` désormais visible dans le menu sous « Performance Réseau ». Aucun changement d’URL.
- **Poste de Pilotage** : Ancienne entrée « Centre de commande », même route `command-center`.

---

## 9. Structure finale du menu CEO (sidebar)

1. **Poste de Pilotage** → `command-center`  
2. **Revenus & Liquidités** → `revenus-liquidites`  
3. **Performance Réseau** → `dashboard`  
4. **Opérations & Flotte** → `operations-reseau` (badge preuves en ligne)  
5. **Contrôle & Audit** → `comptabilite`  
6. **Avis Clients** → `avis-clients` (badge avis en attente)  
7. **Configuration** → `parametres` (contient notamment l’onglet Agences)

---

Implémentation prête pour la production : pas de placeholders, pas de pseudo-code, code structuré et sans duplication de logique métier.
