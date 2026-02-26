# Phase 5 — Architecture CEO & Comptabilité Compagnie — Rapport détaillé (Teliya)

## 1. Fichiers créés

| Fichier | Rôle |
|--------|------|
| `src/modules/compagnie/pages/CEOCommandCenterPage.tsx` | Centre de commande CEO : agrégats (dailyStats, agencyLiveState), flotte, alertes, top agences. Utilise collectionGroup avec repli par agence. |
| `src/modules/compagnie/pages/CompanyFinancesPage.tsx` | Finances consolidées compagnie : revenus par période et par agence (dailyStats), surveillance des écarts (computedDifference ≠ 0), export CSV. Accès CEO + company_accountant. |
| `src/modules/compagnie/pages/CompanyGlobalFleetPage.tsx` | Flotte globale en lecture seule : tous les véhicules, statut, position, destination, indicateur retard (vert / orange / rouge). |
| `docs/PHASE_5_RAPPORT_CEO_ARCHITECTURE.md` | Ce rapport. |

## 2. Fichiers modifiés

| Fichier | Modifications |
|--------|----------------|
| `src/modules/agence/aggregates/dailyStats.ts` | Ajout des champs `companyId` et `agencyId` dans chaque `set()` pour permettre les requêtes collectionGroup côté CEO. |
| `src/modules/agence/aggregates/agencyLiveState.ts` | Idem : `companyId` et `agencyId` sur chaque mise à jour. |
| `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` | Menu réordonné (Phase 5) : Centre de commande, Finances, Flotte, Agences, Réservations, Avis clients, Configuration, Médias, Comptabilité. Icônes Gauge, DollarSign, Truck. |
| `src/AppRoutes.tsx` | Routes ajoutées : `command-center`, `finances`, `fleet`. Redirection CEO vers `/compagnie/:companyId/command-center`. Accès layout compagnie pour `admin_compagnie`, `admin_platforme`, `company_accountant`. Lazy imports pour les 3 nouvelles pages. |
| `src/contexts/AuthContext.tsx` | `landingTargetForRoles` : CEO → `/compagnie/command-center`. |
| `src/modules/auth/components/PrivateRoute.tsx` | Landing par défaut admin_compagnie → `/compagnie/command-center`. |
| `src/modules/compagnie/pages/AvisModerationPage.tsx` | Filtre par agence (liste agences, select), note moyenne agrégée sur la liste filtrée. |
| `docs/PHASE_4.5_FIRESTORE_INDEXES.md` | Section Phase 5 : index collection group `dailyStats` (companyId, date), `agencyLiveState` (companyId). |

## 3. Impact sur le modèle de données

- **dailyStats** : champs ajoutés `companyId`, `agencyId` (écrits à chaque mise à jour). Les anciens documents sans ces champs ne seront pas retournés par la requête collectionGroup ; le centre de commande utilise un repli par agence (lecture doc par agence, limite 50).
- **agencyLiveState** : idem. Les nouveaux écrits portent `companyId` et `agencyId`.
- Aucune nouvelle collection. Aucune migration obligatoire : les écritures futures rempliront les champs ; les anciens docs restent valides pour les listeners par agence (Manager Dashboard).

## 4. Rôles et permissions

- **admin_compagnie** (CEO) : accès complet au layout compagnie (command-center, finances, fleet, agences, réservations, avis, config, médias, comptabilité). Atterrissage par défaut : `/compagnie/:companyId/command-center`.
- **company_accountant** : accès au même layout ; atterrissage recommandé `/compagnie/:companyId/finances`. Lecture des shifts/rapports sur toutes les agences (déjà couvert par `isAuth()`). Aucune validation de session (isComptable = agency_accountant ou admin_compagnie uniquement).
- **admin_platforme** : peut accéder au layout compagnie en mode inspection (URL avec companyId).
- Règles Firestore : inchangées pour shifts/shiftReports (company_accountant ne peut pas valider : isComptable ne l’inclut pas).

## 5. Réduction des listeners et optimisation

- **Centre de commande** : une requête collectionGroup sur `dailyStats` (companyId + date) et une sur `agencyLiveState` (companyId), plus un listener sur `fleetVehicles` (status in [...]). Pas d’écoute par shift ni par réservation.
- **Finances** : collectionGroup dailyStats (période), puis lecture ciblée des shiftReports validés par agence pour les écarts (limite par agence).
- **Flotte globale** : un seul listener sur `companies/{companyId}/fleetVehicles` avec filtre de statut et limite.

## 6. Risques de concurrence

- Les écritures des agrégats (dailyStats, agencyLiveState) restent dans les transactions métier existantes ; l’ajout de `companyId`/`agencyId` ne change pas la logique. Pas de double incrément introduit.
- Aucune écriture côté CEO sur les agrégats : lecture seule. Pas de contention supplémentaire.

## 7. Synchronisation multi-agences

- Chaque agence garde ses propres dailyStats et agencyLiveState. Le CEO agrège en lecture (sommes, listes) côté client à partir des résultats collectionGroup ou du repli par agence.
- Pas de document global « compagnie » mis à jour en temps réel (évite contention et respect du périmètre Spark).

## 8. Goulots d’étranglement possibles

- **CollectionGroup** : sans index, la requête lève une erreur ; le centre de commande bascule sur le chargement par agence (jusqu’à 50 agences, 100 lectures). Avec index, une requête par type d’agrégat suffit.
- **Finances** : chargement des écarts = N agences × 20 rapports max ; à limiter (ex. 30 agences) pour rester raisonnable.
- **Flotte** : un listener sur toute la flotte de la compagnie (limite 300) : acceptable pour des flottes de taille courante.

## 9. Sécurité

- Layout compagnie protégé par PrivateRoute (admin_compagnie, admin_platforme, company_accountant). company_accountant ne peut pas valider les sessions (règles + isComptable).
- Les données affichées (agrégats, flotte, avis) restent dans le périmètre de la compagnie (companyId issu de l’URL ou du contexte auth).

## 10. Améliorations futures suggérées

- **agency_manager** : aligner le libellé avec chefAgence si souhaité (actuellement chefAgence dans le code).
- **Backfill** : script optionnel pour ajouter `companyId`/`agencyId` aux anciens documents dailyStats/agencyLiveState afin que le collectionGroup retourne l’historique.
- **Pagination** : sur la liste des écarts et sur la flotte si la compagnie dépasse plusieurs centaines de véhicules.
- **Cloud Functions** (hors scope actuel) : agrégat compagnie (ex. companyDailyStats) mis à jour par trigger pour éviter toute agrégation côté client.

---

*Rapport Phase 5 — Architecture CEO & Comptabilité Compagnie — Teliya Transport SaaS.*
