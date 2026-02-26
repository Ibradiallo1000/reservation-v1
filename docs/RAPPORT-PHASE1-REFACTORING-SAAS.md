# Rapport Phase 1 – Refactoring Teliya en plateforme SaaS

**Date :** Phase 1 – Admin Dashboard Refactor (Structure Only)  
**Périmètre :** Couche admin Teliya uniquement (aucune modification des pages publiques ni des dashboards compagnie/agence).

---

## 1. Ce qui a été supprimé

### AdminDashboard (avant refactoring)

| Élément | Raison |
|---------|--------|
| **Top 5 destinations** | Donnée opérationnelle transport (trajets détaillés). Teliya ne gère pas les opérations transport. |
| **Top 5 compagnies** (par GMV/réservations) | Détail par compagnie. Violation de la règle : pas de vue par compagnie dans l’admin plateforme. |
| **Filtre par compagnie** | Permettait de zoomer sur une compagnie. Retiré pour éviter tout accès aux données opérationnelles par client. |
| **Montant encaissé** en KPI principal avec lien vers /admin/reservations | Remplacé par GMV global (macro anonymisé) et commission. |
| **Annulations** en KPI | Métrique opérationnelle. Retirée du dashboard admin. |
| **Export Excel** (avec top compagnies et top destinations) | Contenait des données par compagnie. Conservé un export CSV anonymisé uniquement. |
| **Section Alertes** (compagnies sans réservation, factures impayées, taux d’annulation) | Alertes opérationnelles. Hors périmètre SaaS. |
| **Tableau détaillé par compagnie** (top companies) | Vue par client, retirée. |

### AdminFinancesPage

| Élément | Raison |
|---------|--------|
| **Filtre par compagnie** | Vue par client non autorisée. |
| **Graphique par compagnie** (total, commission, bénéfice net par compagnie) | Détail comptable par client. |
| **Tableau récapitulatif** (Compagnie, Total, Commission, Bénéfice net) | Détail par compagnie. |
| **Export CSV par compagnie** | Données identifiables par client. |

### AdminSidebarLayout (menu)

| Élément | Raison |
|---------|--------|
| **Lien « Réservations »** | Page dépréciée ; retiré du menu principal. |
| **Lien « Statistiques »** | Page dépréciée ; retiré du menu principal. |

---

## 2. Ce qui a été conservé

| Page / Composant | Statut |
|------------------|--------|
| **AdminCompagniesPage** | Conservée telle quelle. Gestion des clients (compagnies) = responsabilité SaaS. |
| **AdminCompagnieAjouterPage** | Conservée. |
| **AdminModifierCompagniePage** | Conservée. |
| **AdminCompanyPlan** | Conservée. |
| **PlansManager** (Plans & tarifs) | Conservée. Gestion des offres = SaaS. |
| **AdminParametresPlatformPage** | Conservée. |
| **MediaPage** | Conservée. |
| **AdminReservationsPage** | Conservée mais **marquée dépréciée** (route toujours accessible, retirée du menu). |
| **AdminStatistiquesPage** | Conservée mais **marquée dépréciée** (route toujours accessible, retirée du menu). |

Les routes `/admin/reservations` et `/admin/statistiques` restent définies dans `AppRoutes.tsx` pour compatibilité. Accès possible par URL directe uniquement.

---

## 3. Ce qui a été refactoré

### AdminDashboard

**Nouveaux indicateurs SaaS :**
- Compagnies actives
- Nouvelles compagnies (derniers 30 jours)
- Abonnements actifs (compagnies avec plan payant)
- MRR (Monthly Recurring Revenue = somme des `priceMonthly` des plans actifs)
- Commission totale générée

**Nouveaux indicateurs macro agrégés (anonymisés) :**
- GMV global (toutes compagnies confondues)
- Total réservations (toutes compagnies confondues)
- Taux de croissance mensuel (derniers 30j vs 30j précédents)
- Répartition par pays (GMV agrégé, sans nom de compagnie)

**Supprimé :** Filtre par compagnie, top destinations, top compagnies, annulations.

**Conservé :** Filtre de période (7j / 30j), graphique de tendances (GMV et réservations dans le temps), export CSV (contenu anonymisé uniquement).

### AdminFinancesPage

**Nouveaux contenus :**
- Commission totale (somme des commissions sur les réservations)
- Revenus abonnements (MRR = somme des prix mensuels des plans actifs)
- Revenus totaux plateforme (commission + MRR)
- Graphique des commissions par mois (sans détail par compagnie)
- Filtres par dates (du / au)

**Supprimé :** Vue par compagnie, filtre par compagnie, tableau par compagnie, export CSV par compagnie.

### AdminReservationsPage et AdminStatistiquesPage

- Ajout d’un **bannière de dépréciation** en haut de page (couleur ambre, icône alerte)
- Ajout de commentaires JSDoc `@deprecated` dans le code
- Retrait du menu latéral (AdminSidebarLayout)

---

## 4. Ce qui reste à nettoyer plus tard

| Élément | Action recommandée |
|---------|---------------------|
| **AdminReservationsPage** | Supprimer définitivement une fois les éventuels liens ou favoris mis à jour. |
| **AdminStatistiquesPage** | Supprimer définitivement ou fusionner une partie des indicateurs dans le dashboard si besoin. |
| **Routes `/admin/reservations` et `/admin/statistiques`** | Retirer de `AppRoutes.tsx` lors de la suppression des pages. |
| **Références éventuelles** | Vérifier les liens internes (ex. KPIs du dashboard pointant vers ces pages) – déjà corrigés dans le nouveau dashboard. |
| **Structure des données** | AdminReservationsPage utilisait `collection(db, 'reservations')` (collection racine) alors que les réservations vivent sous `companies/{id}/agences/{id}/reservations`. AdminFinancesPage et AdminDashboard utilisent `collectionGroup(db, 'reservations')` – à confirmer selon la structure réelle des données. |

---

## 5. Architecture mise à jour

### Principe

Teliya = plateforme SaaS qui fournit l’infrastructure aux transporteurs. Teliya ne gère pas les opérations transport.

### Niveau Teliya (Admin plateforme)

**Données autorisées :**
- Métriques SaaS : nombre de compagnies, abonnements, MRR, commissions
- Métriques macro agrégées et anonymisées : GMV global, total réservations, tendances, répartition par pays

**Données interdites :**
- Détail par compagnie (réservations, comptabilité, top destinations par compagnie)
- Filtres ou vues par compagnie dans les écrans de métriques
- Top destinations / trajets (opérationnel transport)

### Niveau Compagnie (client)

Inchangé. Chaque compagnie accède à ses propres données (réservations, comptabilité, agences, etc.) dans son espace.

### Niveau Agence (sous-entité compagnie)

Inchangé.

---

## 6. Fichiers modifiés

| Fichier | Modifications |
|---------|---------------|
| `src/modules/plateforme/pages/AdminDashboard.tsx` | Refactorisation complète : nouveaux KPIs, retrait top destinations/compagnies/filtre compagnie |
| `src/modules/plateforme/pages/AdminFinancesPage.tsx` | Refactorisation : uniquement commissions + MRR, aucun détail par compagnie |
| `src/modules/plateforme/pages/AdminReservationsPage.tsx` | Bannière dépréciation + JSDoc @deprecated |
| `src/modules/plateforme/pages/AdminStatistiquesPage.tsx` | Bannière dépréciation + JSDoc @deprecated |
| `src/modules/plateforme/pages/AdminSidebarLayout.tsx` | Retrait des entrées Réservations et Statistiques du menu, nettoyage des imports |

---

*Rapport généré après Phase 1 du refactoring SaaS Teliya.*
