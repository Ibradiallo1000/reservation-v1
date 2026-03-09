# Logistics module & role migration summary (TELIYA)

## 1. Role migration performed

- **Old role:** `chef_garage`
- **New role:** `responsable_logistique` (fleet and vehicle operations)

**Behaviour:**

- **Normalisation:** In `AuthContext`, `normalizeRole()` maps both `"chef_garage"` and `"chefgarage"` to `"responsable_logistique"`.
- **Firestore migration:** When loading the user document, if `role === "chef_garage"`, the app calls `updateDoc(userRef, { role: "responsable_logistique" })` once, then continues with the new role. Existing users are migrated automatically and not broken.
- **Landing:** `landingTargetForRoles` and login redirects treat `responsable_logistique` (and legacy `chef_garage`) as garage/logistics and send them to `/compagnie/garage/dashboard` or `/compagnie/:companyId/logistics` as appropriate.

---

## 2. Files updated

| Area | File | Change |
|------|------|--------|
| **Constants** | `src/constants/roles.ts` | `CHEF_GARAGE` → `RESPONSABLE_LOGISTIQUE: 'responsable_logistique'` |
| **Route permissions** | `src/constants/routePermissions.ts` | `chef_garage` → `responsable_logistique` in garage/logistics; added `logisticsDashboard` for new page |
| **Permissions** | `src/roles-permissions.ts` | Role type and `permissionsByRole` use `responsable_logistique` |
| **Permissions** | `src/permissions.ts` | Role key in permissions record set to `responsable_logistique` |
| **Capabilities** | `src/core/permissions/roleCapabilities.ts` | `chef_garage` → `responsable_logistique` in ROLE_CAPABILITIES |
| **Auth** | `src/contexts/AuthContext.tsx` | CANONICAL_ROLES, `normalizeRole`, migration in `fetchUserDoc`, `landingTargetForRoles` |
| **Login** | `src/modules/auth/pages/LoginPage.tsx` | Role list and `routeForRole` use `responsable_logistique` |
| **Routing** | `src/modules/auth/components/PrivateRoute.tsx` | Fallback roles and redirect map use `responsable_logistique` |
| **Landing** | `src/routes/RoleLanding.tsx` | `roleHome` already included `responsable_logistique` |
| **Layout** | `src/shared/layout/InternalLayout.tsx` | ROLE_LABELS: `responsable_logistique: "Responsable logistique"` |
| **Hooks** | `src/shared/hooks/useUserRole.ts` | Role list includes `responsable_logistique` |
| **Staff UI** | `src/modules/compagnie/components/parametres/ParametresPersonnel.tsx` | Role options: `responsable_logistique` ("Responsable logistique (flotte)"); `chef_garage` removed |
| **Garage layout** | `src/modules/compagnie/layout/GarageLayout.tsx` | Default role fallback + nav item "Logistique" → `/compagnie/:companyId/logistics` |
| **Garage dashboard** | `src/modules/compagnie/pages/GarageDashboardPage.tsx` | All `chef_garage` / `isChefGarage` → `responsable_logistique` / `isResponsableLogistique` |
| **CEO layout** | `src/modules/compagnie/admin/layout/CompagnieLayout.tsx` | New nav item "Logistique" (Package icon) → `/compagnie/:companyId/logistics` |
| **Security** | `firestore.rules` | See section 6 below |

---

## 3. Dashboards created

- **Logistics dashboard**
  - **Path:** `/compagnie/:companyId/logistics`
  - **Access:** `responsable_logistique`, CEO (`admin_compagnie`), and `admin_platforme` (via `routePermissions.logisticsDashboard`).
  - **Page:** `src/modules/compagnie/pages/LogisticsDashboardPage.tsx`
  - **Sections:**
    - **Fleet overview:** total vehicles, in service, in maintenance, idle, on trip (from `companies/{companyId}/vehicles` via `listVehicles`).
    - **Trip monitoring:** counts from `weeklyTrips` across company agencies.
    - **Maintenance alerts:** vehicles with technicalStatus MAINTENANCE, ACCIDENTE, HORS_SERVICE (e.g. top 10).
    - **Courier (read-only):** shipments today and in transit from `companies/{companyId}/logistics/data/shipments`.
  - **Navigation:** Linked from Garage layout ("Logistique") and from CEO Compagnie layout ("Logistique").

---

## 4. Permissions updated

- **Route permissions:** `garageLayout` and `companyFleet` use `responsable_logistique`; new `logisticsDashboard` allows `responsable_logistique`, `admin_compagnie`, `admin_platforme`.
- **Role capabilities:** `responsable_logistique` keeps fleet/operations capabilities (e.g. manage_global_fleet, view_company_stats); no accounting/revenue/ticket-sales management.
- **Staff management:** When creating/editing company staff, the role dropdown shows "Responsable logistique (flotte)" (`responsable_logistique`) and no longer shows "chef_garage".

---

## 5. Role responsibilities (recap)

**responsable_logistique manages:**

- Fleet vehicles  
- Vehicle availability  
- Maintenance status  
- Vehicle assignment monitoring  

**responsable_logistique does NOT manage:**

- Accounting  
- Revenue  
- Ticket sales  

---

## 6. Security rules (Firestore)

- **Helper:** `isResponsableLogistique()` returns true for `responsable_logistique` or `chef_garage` (backward compatibility).
- **Fleet read:** `canReadFleet()` now includes `isResponsableLogistique()`, so this role can read `fleetVehicles` and `fleetMovements`. They do **not** have `canModifyFleet()`, so no create/update on fleet.
- **Fleet costs:** New rule for `companies/{companyId}/fleetCosts`: read for any authenticated company user (and platform admin); create/update denied for `responsable_logistique` via `!isResponsableLogistique()`.
- **dailyStats / boardingStats / agencyLiveState:** create/update restricted with `!isResponsableLogistique()` so this role cannot modify aggregated stats.
- **Logistics (courier):** `companies/{companyId}/logistics/{path=**}` split into:
  - **read:** unchanged (company or platform admin).
  - **write:** only if `!isResponsableLogistique()` (read-only for logistics/courier data for this role).
- **Accounting/financial:** financialAccounts, financialMovements, tripCosts, payables, expenses, etc. already restrict write to specific roles; `responsable_logistique` is not among them, so they cannot modify accounting data or financial reports.

---

## 7. Data sources (logistics dashboard)

| Section | Data source |
|--------|-------------|
| Fleet overview | `companies/{companyId}/vehicles` (via `listVehicles`) |
| Trip monitoring | `companies/{companyId}/agences/{agencyId}/weeklyTrips` |
| Maintenance alerts | Same vehicles + technicalStatus / maintenance fields |
| Courier (read-only) | `companies/{companyId}/logistics/data/shipments` |

---

*Summary generated after implementing the Logistics module and renaming `chef_garage` to `responsable_logistique`.*
