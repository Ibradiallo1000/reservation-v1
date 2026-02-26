# Rapport d’architecture – Telia en tant que plateforme SaaS

**Périmètre :** structure interne de la plateforme (hors pages publiques).  
**Objectif :** identifier les incohérences entre le positionnement SaaS de Telia et l’organisation actuelle des espaces et des métriques.

---

## 1. Inventaire des pages internes et classification

### A) Niveau SaaS – responsabilités Telia (plateforme)

| Route | Page | Rôle requis | Verdict |
|-------|------|-------------|---------|
| `/admin/dashboard` | AdminDashboard | admin_platforme | **Mélange** (voir §3) |
| `/admin/compagnies` | AdminCompagniesPage | admin_platforme | ✅ Cohérent |
| `/admin/compagnies/ajouter` | AdminCompagnieAjouterPage | admin_platforme | ✅ Cohérent |
| `/admin/compagnies/:id/modifier` | AdminModifierCompagniePage | admin_platforme | ✅ Cohérent |
| `/admin/compagnies/:companyId/plan` | AdminCompanyPlan | admin_platforme | ✅ Cohérent |
| `/admin/plans` | PlansManager | admin_platforme | ✅ Cohérent |
| `/admin/parametres-platforme` | AdminParametresPlatformPage | admin_platforme | ✅ Cohérent |
| `/admin/media` | MediaPage | admin_platforme | ✅ Cohérent (médias plateforme `platform/settings`) |
| `/admin/reservations` | AdminReservationsPage | admin_platforme | ⚠️ **Contenu opérationnel** (§2) |
| `/admin/finances` | AdminFinancesPage | admin_platforme | ⚠️ **Contenu mixte** (§2) |
| `/admin/statistiques` | AdminStatistiquesPage | admin_platforme | ⚠️ **Contenu mixte** (§2) |

**Redirection configurée :** `/admin/compagnies/:companyId/configurer` → `/compagnie/:companyId/dashboard` (accès Telia à l’espace client pour support/configuration).

---

### B) Niveau Compagnie – espace client (opérations transport)

**Sous `/compagnie/:companyId`** (CompagnieLayout, rôles : admin_compagnie, admin_platforme) :

| Route | Page | Verdict |
|-------|------|---------|
| `dashboard` | CompagnieDashboard | ✅ Opérations compagnie (réservations, canaux, santé réseau, alertes) |
| `reservations` | CompagnieReservationsPage | ✅ Réservations de la compagnie |
| `agences` | CompagnieAgencesPage | ✅ Gestion des agences |
| `parametres` | CompagnieParametresTabsPage | ✅ Paramètres compagnie |
| `parametres/plan` | ParametresPlan | ✅ Plan / offre côté client |
| `comptabilite` | CompagnieComptabilitePage | ✅ Comptabilité consolidée (caisse, agences, écarts) |
| `images` | BibliothequeImagesPage | ✅ Médias / vitrine compagnie |
| `payment-settings` | CompanyPaymentSettingsPage | ✅ Paiement compagnie |
| `avis-clients` | AvisModerationPage | ✅ Modération avis |

**Sous `/chef-comptable`** (ChefComptableCompagniePage, rôles : company_accountant, financial_director, **admin_platforme**) :

| Route | Page | Verdict |
|-------|------|---------|
| (index) | VueGlobale | ✅ Vue globale comptable compagnie |
| `reservations-en-ligne` | ReservationsEnLigne | ✅ Validation/refus résa en ligne |
| `finances` | Finances | ✅ Finances compagnie |
| `rapports` | Rapports | ✅ Rapports comptables |
| `parametres` | Parametres | ✅ Paramètres comptables |

Toutes ces pages sont **logiquement côté client** (compagnie). Le point problématique est l’**accès admin_platforme** à tout l’espace chef-comptable (§4).

---

### C) Niveau Agence – sous-entité de la compagnie

**Sous `/agence`** (AgenceShellPage, rôles : chefAgence, superviseur, admin_compagnie ; guichetier et agency_accountant ont des entrées dédiées) :

| Route | Page | Verdict |
|-------|------|---------|
| `dashboard` | DashboardAgencePage | ✅ KPIs agence (ventes, recettes, canaux, trajets) |
| `reservations` | AgenceReservationsPage | ✅ Réservations agence |
| `embarquement` | AgenceEmbarquementPage | ✅ Embarquement |
| `trajets` | AgenceTrajetsPage | ✅ Trajets |
| `garage` | AffectationVehiculePage | ✅ Véhicules |
| `recettes` | AgenceRecettesPage | ✅ Recettes |
| `finances` | AgenceFinancesPage | ✅ Finances agence |
| `rapports` | AgenceRapportsPage | ✅ Rapports agence |
| `personnel` | AgencePersonnelPage | ✅ Personnel |
| `shift` / `shift-history` | AgenceShiftPage, AgenceShiftHistoryPage | ✅ Postes / historique |
| `comptabilite` | AgenceComptabilitePage | ✅ Comptabilité agence (hors shell) |

**Pages hors shell (routes dédiées) :**

| Route | Page | Rôles | Verdict |
|-------|------|-------|---------|
| `/agence/guichet` | AgenceGuichetPage | guichetier, chefAgence, admin_compagnie | ✅ Guichet |
| `/agence/comptabilite` | AgenceComptabilitePage | agency_accountant, admin_compagnie | ✅ Comptabilité agence |
| `/agence/receipt/:id` | ReceiptGuichetPage | chefAgence, guichetier, admin_compagnie | ✅ Reçu guichet |
| `/agence/reservations/print` | ReservationPrintPage | — | ✅ Impression |

**Validations (compatibilité) :**

| Route | Page | Verdict |
|-------|------|---------|
| `/compta/validations` | ValidationComptablePage | Niveau compagnie (company_accountant, financial_director) |
| `/agence/validations` | ValidationChefAgencePage | Niveau agence (chefAgence, admin_compagnie) |

---

## 2. Pages incorrectement positionnées dans la couche Telia (SaaS)

### 2.1 `/admin/reservations` (AdminReservationsPage)

- **Contenu actuel :** statistiques des réservations **par compagnie** (nombre total, montant total, répartition par statut).
- **Problème :** ce sont des **données opérationnelles des clients** (volume et chiffre d’affaires par compagnie). La plateforme SaaS n’a pas à “gérer” les réservations des transporteurs ; elle gère les **clients (compagnies)** et l’**usage du produit**.
- **Recommandation :** soit supprimer cette page du menu admin, soit la remplacer par une vue **SaaS** : nombre de réservations comme indicateur d’usage (quota, santé produit), sans détail montant/statut par compagnie. Le détail par compagnie relève de l’espace Compagnie.

### 2.2 `/admin/finances` (AdminFinancesPage)

- **Contenu actuel :** agrégation par compagnie de `total` (montant des réservations) et `commission` (part plateforme).
- **Problème :** le **total** est du **chiffre d’affaires client** ; seule la **commission** relève du modèle économique Telia. Afficher et filtrer le CA par compagnie dans l’admin plateforme brouille la frontière SaaS / opérations transport.
- **Recommandation :** conserver une vue “Finances” admin centrée sur : **commissions par période**, **par plan**, éventuellement **par compagnie** uniquement pour le suivi facturation Telia. Retirer ou déplacer toute vue “montant total encaissé” (GMV) des écrans SaaS.

### 2.3 `/admin/statistiques` (AdminStatistiquesPage)

- **Contenu actuel :** total réservations, total revenus (GMV), nombre de compagnies, graphiques sur les réservations.
- **Problème :** même mélange que ci-dessus : **revenus totaux** et **détail réservations** = métriques opérationnelles transport ; **nombre de compagnies** et **usage global** = métriques SaaS.
- **Recommandation :** scinder : dans l’admin Telia, ne garder que des indicateurs **SaaS** (nombre de compagnies, usage réservations pour quotas/alertes, commissions). Les statistiques “transport” (GMV, détail résa) doivent vivre dans l’espace Compagnie (ou en export pour le client).

---

## 3. Mélange métriques SaaS vs métriques opérationnelles dans le dashboard admin

Le **AdminDashboard** (`/admin/dashboard`) expose dans un même écran :

| Indicateur | Nature | Commentaire |
|------------|--------|-------------|
| Montant encaissé (GMV) | Opérationnel transport | CA des compagnies ; hors périmètre SaaS. |
| Commission générée | **SaaS** | Revenu plateforme ; pertinent. |
| Réservations | Ambigu | Peut être “usage plateforme” (SaaS) ou “activité transport” ; selon usage actuel, plutôt opérationnel. |
| Annulations | Opérationnel transport | Gestion opérationnelle des transporteurs. |
| Compagnies actives | **SaaS** | Nombre de clients ; pertinent. |
| Nouvelles compagnies | **SaaS** | Acquisition clients ; pertinent. |

En plus des KPI, le dashboard affiche :

- **Tendances (séries) :** GMV et nombre de réservations dans le temps → **opérationnel**.
- **Top 5 compagnies** par GMV et réservations → **opérationnel** (performance des transporteurs, pas de Telia).
- **Top 5 destinations** (trajets) → **clairement opérationnel** (réseau transport).

Il propose aussi un **filtre par compagnie** pour ces vues. Cela renforce l’impression que l’admin Telia est un “back-office transport global” plutôt qu’un **tableau de bord produit SaaS** (clients, revenus plateforme, usage, santé produit).

**Conclusion :** le dashboard admin **mélange explicitement** des métriques SaaS (commissions, nombre de compagnies) et des métriques opérationnelles transport (GMV, réservations, annulations, top compagnies, top destinations). Une séparation nette des niveaux (voir §5) implique de restreindre cet écran aux seules métriques SaaS.

---

## 4. Incohérences structurelles identifiées

### 4.1 Accès admin_platforme à l’espace chef-comptable

- **Fait :** le rôle `admin_platforme` est autorisé dans `routePermissions.chefComptableCompagnie` et peut donc accéder à `/chef-comptable` (VueGlobale, ReservationsEnLigne, Finances, Rapports, Parametres).
- **Problème :** l’espace chef-comptable est **comptabilité compagnie** (validation des résas en ligne, finances, rapports). Y donner accès à l’admin plateforme fait que **Telia voit la compta de chaque client** dans la même interface que le comptable de la compagnie. Même si c’est pour du support, cela :
  - brouille la frontière “Telia = infrastructure / Compagnie = opérations” ;
  - pose des questions de gouvernance des données (qui est “propriétaire” de l’écran).
- **Recommandation :** si un accès “support” est nécessaire, le traiter comme **mode délégué / impersonation** (comme pour `/compagnie/:companyId`) avec indication visuelle claire et audit, plutôt que d’inclure `admin_platforme` dans le même rôle que le chef comptable. Idéalement, l’admin plateforme ne devrait pas avoir le même menu “Chef comptable” que le client.

### 4.2 Même layout Compagnie pour client et pour Telia

- **Fait :** `/compagnie/:companyId` est accessible avec `admin_compagnie` (client) **et** `admin_platforme` (Telia). Le layout Compagnie gère un “mode impersonation” (badge, chargement de la compagnie depuis l’URL).
- **Constats :** la même UI sert à la fois au CEO de la compagnie et à l’admin Telia. C’est cohérent pour la configuration/support, mais les **entrées de menu** et les **données affichées** sont identiques. Il n’y a pas de vue “Telia en lecture seule” ou “actions limitées au support”.
- **Recommandation :** selon le besoin, envisager un mode “Vue support” dans l’espace Compagnie (lecture seule, actions limitées, pas d’édition des paramètres sensibles) pour renforcer la séparation des responsabilités.

### 4.3 Menu admin : Réservations, Finances, Statistiques

- **Fait :** le menu de l’admin plateforme (AdminSidebarLayout) propose côte à côte des entrées **SaaS** (Compagnies, Plans & tarifs, Médias, Paramètres) et des entrées à **contenu opérationnel** (Réservations, Finances, Statistiques).
- **Problème :** un nouvel utilisateur (ou un document de conception) peut en déduire que “Telia gère les réservations et les finances des transporteurs”, alors que le positionnement attendu est “Telia fournit l’infrastructure ; les compagnies gèrent leurs réservations et finances”.
- **Recommandation :** aligner le menu admin sur les seules responsabilités SaaS (voir §5). Déplacer ou renommer les vues “Réservations/Finances/Statistiques” pour qu’elles ne montrent que des indicateurs plateforme (usage, commissions, clients).

### 4.4 Route de debug non protégée

- **Fait :** `/debug-auth` est une route sans `PrivateRoute` ; elle affiche des infos utilisateur, compagnie et des liens vers les espaces (chef-comptable, agence, compagnie, admin).
- **Problème :** en production, toute personne connaissant l’URL peut voir des informations sensibles et la structure des rôles.
- **Recommandation :** restreindre cette route (par rôle admin_platforme ou par variable d’environnement) ou la désactiver en production.

---

## 5. Architecture recommandée : séparation en 3 niveaux

### Principe

- **Telia (SaaS)** : gestion du produit (clients = compagnies), offres/plans, paramètres plateforme, revenus **Telia** (commissions), usage global (quotas, santé produit). Aucune gestion opérationnelle des trajets, des réservations ou du CA des transporteurs.
- **Compagnie (Client)** : tout ce qui concerne **une** compagnie : dashboard opérationnel, réservations, agences, comptabilité, paramètres, vitrine, avis. Telia n’y accède que pour support/impersonation, avec des garde-fous.
- **Agence (Sous-entité)** : opérations d’une agence (guichet, réservations, trajets, recettes, personnel, shifts, comptabilité agence). Dépendance claire à la Compagnie.

### Niveau 1 – Telia (SaaS)

**URL de base :** `/admin`

**Pages / écrans recommandés :**

- **Tableau de bord SaaS**  
  Indicateurs uniquement : nombre de compagnies (actives, nouvelles), revenus plateforme (commissions), usage global (ex. nombre de réservations pour quotas/alertes), état des plans. Pas de GMV, pas de “top destinations”, pas de détail des réservations par compagnie.
- **Compagnies**  
  Liste, création, édition, statut (actif/inactif). Accès “Configurer” → redirection vers `/compagnie/:companyId/dashboard` (impersonation support).
- **Plans & tarifs**  
  Gestion des offres et des plans (PlansManager, AdminCompanyPlan).
- **Revenus / Facturation**  
  Commissions par période, par plan ou par compagnie (pour facturation Telia). Pas d’affichage du CA (GMV) des clients comme métrique principale.
- **Paramètres plateforme**  
  Branding, textes, médias plateforme, configuration globale (AdminParametresPlatformPage, MediaPage).
- **Médias plateforme**  
  Déjà cohérent (collection `platform/settings`).

**À retirer ou refondre du menu admin actuel :**

- “Réservations” en l’état (détail par compagnie) → remplacer par une vue “Usage” (quotas, santé) ou lien vers l’espace Compagnie.
- “Finances” en l’état (total + commission par compagnie) → remplacer par “Revenus / Commissions” (uniquement part plateforme).
- “Statistiques” en l’état (GMV, réservations, compagnies) → fusionner dans le tableau de bord SaaS et ne garder que les indicateurs SaaS.

### Niveau 2 – Compagnie (Client)

**URL de base :** `/compagnie/:companyId`

**Conserver tel quel (déjà cohérent) :**

- Dashboard opérationnel (réservations, canaux, réseau, alertes).
- Réservations, Agences, Paramètres, Médias (images), Paiement, Avis clients.
- Comptabilité (CompagnieComptabilitePage).

**Espace chef-comptable :** `/chef-comptable`

- Rester **réservé aux rôles compagnie** (company_accountant, financial_director).
- Ne pas exposer cet espace comme “menu normal” pour `admin_platforme` ; si besoin d’accès support, passer par un mécanisme d’impersonation explicite (comme pour Compagnie) avec traçabilité.

### Niveau 3 – Agence (Sous-entité de la Compagnie)

**URL de base :** `/agence` (contexte agence via `user.agencyId` ou sélecteur)

**Conserver tel quel (déjà cohérent) :**

- Dashboard, Réservations, Embarquement, Trajets, Garage, Recettes, Finances, Rapports, Personnel, Shifts, Comptabilité.
- Guichet, Reçus, Impression billets en routes dédiées.
- Validations (chef agence, comptable) aux routes existantes.

Aucune page agence ne doit être accessible depuis le menu Telia ; l’admin plateforme ne gère pas les agences directement, seulement les compagnies.

---

## 6. Synthèse

| Question | Réponse |
|----------|---------|
| **Pages incorrectement dans la couche Telia** | AdminReservationsPage, AdminFinancesPage, AdminStatistiquesPage, et une partie du contenu d’AdminDashboard (GMV, top destinations, top compagnies par GMV, détail réservations). |
| **Mélange dashboard admin** | Oui : le dashboard admin mélange métriques SaaS (commissions, nombre de compagnies) et métriques opérationnelles transport (GMV, réservations, annulations, top destinations/top compagnies). |
| **Incohérences structurelles** | (1) Accès admin_platforme à l’espace chef-comptable ; (2) même layout Compagnie pour client et Telia sans distinction “support” ; (3) menu admin contenant Réservations / Finances / Statistiques à connotation opérationnelle ; (4) route `/debug-auth` non protégée. |
| **Séparation recommandée** | Telia = tableau de bord SaaS (clients, commissions, usage), gestion des compagnies et des plans, paramètres et médias plateforme. Compagnie = tout l’opérationnel transport et la compta. Agence = opérations et compta d’agence. |

---

*Rapport généré à partir de l’analyse du routage (AppRoutes.tsx), des layouts (AdminSidebarLayout, CompagnieLayout, AgenceShellPage, ChefComptableCompagniePage) et du contenu des pages admin, compagnie et agence. Pages publiques exclues du périmètre.*
