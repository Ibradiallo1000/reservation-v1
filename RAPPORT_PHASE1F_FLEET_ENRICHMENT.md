# Rapport Phase 1F – Enrichissement modèle flotte et correction UX

## Contexte

Phase 1F : correction de l’état actif de la sidebar (Tableau de bord vs Liste flotte), séparation fonctionnelle (dashboard = KPIs + activité + alertes, liste = registre complet + recherche/filtres/tri), enrichissement du schéma véhicule (assurance, contrôle, vignette, notes), formulaire d’ajout enrichi, et moteur d’alertes (UI uniquement, expiration sous 30 jours).

---

## 1. Correction état actif sidebar

**Problème** : « Tableau de bord » et « Liste flotte » pointaient tous deux vers `/garage/fleet` et pouvaient apparaître actifs en même temps.

**Modifications** :
- **GarageLayout** : « Tableau de bord » → path `${basePath}/dashboard` avec `end: true` ; « Liste flotte » → path `${basePath}/fleet` avec `end: true`. Maintenance, Transit, Incidents ont aussi `end: true` pour un matching exact.
- **AppRoutes** : route `dashboard` ajoutée → `GarageDashboardHomePage` ; index de `/garage` redirige vers `dashboard` (au lieu de `fleet`).
- **Redirections chef_garage** : LoginPage, RoleLanding, AuthContext, PrivateRoute redirigent vers `/compagnie/:companyId/garage/dashboard` (au lieu de `/garage/fleet`).

**Résultat** :
- `/garage` (index) → redirection vers `/garage/dashboard` → seul « Tableau de bord » est actif.
- `/garage/fleet` → seul « Liste flotte » est actif.
- Plus de double état actif.

---

## 2. Séparation fonctionnelle

### A) Tableau de bord (`/garage/dashboard`)

- **Fichier** : `src/modules/compagnie/pages/GarageDashboardHomePage.tsx` (nouveau).
- **Contenu** : indicateurs KPIs uniquement (Total, En service, En transit, Maintenance, Accidentés, Hors service / Garage), lien « Voir la liste flotte » ; cartes d’alerte (assurance, contrôle technique, vignette expirant sous 30 jours) ; bloc « Dernières mises à jour » (10 derniers véhicules par `updatedAt`). Aucune liste complète de véhicules.

### B) Liste flotte (`/garage/fleet`)

- **Fichier** : `GarageDashboardPage.tsx` (existant, enrichi).
- **Contenu** : recherche (plaque, modèle), filtre par ville (select), tri (plaque, statut, dernière MAJ), cartes récap cliquables (filtres rapides par statut), tableau complet (Plaque, Modèle, Année, Statut badge, Ville actuelle, Destination, Dernière MAJ, Actions), bouton « Ajouter un véhicule » (CHEF_GARAGE), modal d’ajout enrichi. Section « Dernières mises à jour » supprimée de cette page (désormais sur le tableau de bord).

### C) Maintenance, Transit, Incidents

- Routes inchangées : `GarageDashboardPage` avec prop `view="maintenance" | "transit" | "incidents"` (filtre par statut). Contenu opérationnel : véhicules en maintenance / en transit / accidentés avec tableau et actions.

---

## 3. Schéma véhicule (extension)

**Fichier** : `src/modules/compagnie/fleet/vehicleTypes.ts`.

**Champs ajoutés (optionnels)** :
- `insuranceExpiryDate?: Timestamp`
- `inspectionExpiryDate?: Timestamp`
- `vignetteExpiryDate?: Timestamp`
- `purchaseDate?: Timestamp`
- `notes?: string`

Aucun champ existant supprimé. Structure Firestore : `companies/{companyId}/vehicles/{vehicleId}` inchangée, champs optionnels ajoutés côté document.

**Service** : `vehiclesService.ts` — `createVehicle` accepte déjà `Omit<VehicleDoc, "createdAt"|"updatedAt">`, donc les nouveaux champs optionnels sont pris en charge via `setDoc(ref, { ...data, createdAt, updatedAt })`.

---

## 4. Formulaire d’ajout véhicule (enrichi)

**Fichier** : `src/modules/compagnie/pages/GarageDashboardPage.tsx`.

**Champs du formulaire** :
- Plaque (requis)
- Modèle (requis)
- Année (requis)
- **Statut initial** (select, défaut « GARAGE »)
- Ville actuelle (requise)
- **Expiration assurance** (date, optionnel)
- **Expiration contrôle technique** (date, optionnel)
- **Expiration vignette** (date, optionnel)
- **Notes** (textarea, optionnel)

**Enregistrement** : les dates sont converties en `Timestamp` (Firestore) avant l’appel à `createVehicle`. Les champs vides ne sont pas envoyés.

---

## 5. Moteur d’alertes (UI uniquement)

**Fichier** : `src/modules/compagnie/pages/GarageDashboardHomePage.tsx`.

**Règle** : afficher des cartes d’alerte si, pour au moins un véhicule :
- `insuranceExpiryDate` expire dans les 30 jours (inclus) ;
- `inspectionExpiryDate` expire dans les 30 jours ;
- `vignetteExpiryDate` expire dans les 30 jours.

**Calcul** : à partir de la date du jour (côté client), calcul du nombre de jours restants jusqu’à la date d’expiration ; si 0 ≤ jours ≤ 30, alerte affichée. Aucun job/scheduler backend.

**Affichage** : liste d’alertes (plaque, type : Assurance / Contrôle technique / Vignette, libellé « expire dans X jours » ou « expire aujourd’hui » / « expire demain »), tri par urgence (jours restants croissants), limitée à 15 entrées.

---

## 6. Fichiers modifiés / créés

| Fichier | Action |
|--------|--------|
| `src/modules/compagnie/fleet/vehicleTypes.ts` | Modifié — champs optionnels `insuranceExpiryDate`, `inspectionExpiryDate`, `vignetteExpiryDate`, `purchaseDate`, `notes`. |
| `src/modules/compagnie/layout/GarageLayout.tsx` | Modifié — « Tableau de bord » → `/dashboard` (end: true), « Liste flotte » → `/fleet` (end: true), autres sections avec end: true. |
| `src/AppRoutes.tsx` | Modifié — import `GarageDashboardHomePage`, index garage → `Navigate to="dashboard"`, route `dashboard` → `GarageDashboardHomePage`. |
| `src/modules/compagnie/pages/GarageDashboardHomePage.tsx` | **Créé** — tableau de bord (KPIs, alertes, dernières mises à jour). |
| `src/modules/compagnie/pages/GarageDashboardPage.tsx` | Modifié — recherche (texte), filtre ville (select), tri (plaque / statut / dernière MAJ), formulaire d’ajout enrichi (statut initial, dates expiration, notes), conversion dates en Timestamp, suppression de la section « Dernières mises à jour ». |
| `src/modules/auth/pages/LoginPage.tsx` | Modifié — redirection chef_garage vers `/garage/dashboard`. |
| `src/routes/RoleLanding.tsx` | Modifié — chef_garage → `/compagnie/garage/dashboard`, condition pour `companyId`. |
| `src/contexts/AuthContext.tsx` | Modifié — landing chef_garage → `/compagnie/garage/dashboard`. |
| `src/modules/auth/components/PrivateRoute.tsx` | Modifié — fallback chef_garage → `/garage/dashboard`. |

---

## 7. Règles respectées

- Pas d’implémentation de rentabilité (Phase 2).
- Pas de mélange avec les modules financiers.
- Pas de modification du schéma des dépenses.
- Périmètre Phase 1 limité à la structure flotte et à l’UX Garage.

---

*Rapport généré après implémentation Phase 1F – Fleet data model enrichment & UX correction.*
