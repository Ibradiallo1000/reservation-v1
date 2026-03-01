# STEP 4C-2D — Settings block — Cards & Badges standardization

## Scope

- `CompanySettings.tsx`
- `CompanyPaymentSettingsPage.tsx`
- `Parametres.tsx` (finances/pages)
- `ParametresPlan.tsx`
- `ParametresSecurite.tsx`
- `ParametresVitrine.tsx`
- `ParametresReseauxPage.tsx`
- `ParametresLegauxPage.tsx`

## Changes

### 1. CompanySettings.tsx

- **SectionCard:** "Plan actuel", "Changer de plan" (replaced two `div` cards with `rounded-xl border bg-white shadow-sm`).
- **StatusBadge:** Support level (basic/standard/priority/premium/enterprise) → `supportToVariant()` + `<StatusBadge />`. "Tous" / "Tous modules inclus" → `<StatusBadge status="success">`.
- **Removed:** All `bg-gray-100` / `bg-green-100` badge spans. Plan catalog tiles use `rounded-lg border` (no `rounded-xl`).

### 2. CompanyPaymentSettingsPage.tsx

- **SectionCard:** "Méthodes configurées", "Ajouter une nouvelle méthode" / "Modifier une méthode" (replaced two `div` cards).
- **Removed:** `rounded-xl shadow-sm` on section containers. Error block `bg-red-100` → neutral `border border-gray-300 bg-gray-50`. Delete button `bg-red-50` → `border border-gray-300`.

### 3. ParametresPlan.tsx

- **SectionCard:** "Votre plan", "Autres plans disponibles" (replaced two `<section>` cards).
- **StatusBadge:** Support level via `supportToVariant()` + `<StatusBadge />`. "Essai" → `<StatusBadge status="warning">`. Feature list (Gestion interne, Page publique, etc.) → `<StatusBadge status="success">`.
- **Removed:** `SUPPORT_CONFIG` color strings; all `bg-amber-100` / `bg-green-100` spans. Plan tiles use `rounded-lg border`.

### 4. Parametres.tsx (finances)

- **SectionCard:** "Paramètres comptables" (with `right` = Save button), "Alertes et notifications", "Validation automatique", "Sécurité", "Affichage", "Rapports".
- **Removed:** All `rounded-xl border bg-white shadow-sm` section divs; gradient icon wrappers → `rounded-lg bg-gray-100`. Save success block → neutral `border border-gray-200 bg-gray-50`.
- **Unchanged:** `SettingToggle` / `SettingInput` layout; inner `rounded-lg` for form rows kept.

### 5. ParametresSecurite.tsx

- **SectionCard:** Single main block replaced with `<SectionCard title="Sécurité" icon={Shield}>`.
- **Removed:** `bg-white rounded-xl border p-6`.

### 6. ParametresVitrine.tsx

- **SectionCard:** "Personnalisation de la vitrine", "Textes personnalisés", "Couleurs", "Images" (replaced header + three content divs).
- **Removed:** `rounded-xl shadow-sm` / `rounded-xl p-6 border` on all blocks.

### 7. ParametresReseauxPage.tsx

- **SectionCard:** Main container → `<SectionCard title="Réseaux sociaux & affichage" icon={Save}>`.
- **StatusBadge:** Message feedback (success/error/info) → `<StatusBadge status="success|danger|info">` instead of `bg-green-100` / `bg-red-100` / `bg-blue-100`.
- **Removed:** `bg-white rounded-xl shadow-sm border`.

### 8. ParametresLegauxPage.tsx

- **SectionCard:** Main container → `<SectionCard title="Mentions légales & politiques multilingues" icon={Save}>`.
- **StatusBadge:** Message banner (success/error/info) → `<StatusBadge status="success|danger|info">` with icon.
- **Removed:** `bg-white rounded shadow` and manual `bg-green-100` / `bg-red-100` / `bg-blue-100`.

## Validation

| Check | Result |
|-------|--------|
| Custom card containers in block | **None** (only SectionCard for sections). |
| Plan/support/status badges | **All** use `<StatusBadge />` (support level, Essai, features, message type). |
| `rounded-xl` on section containers | **None** in the 8 files. |
| Manual `bg-*-100` badge styling | **None** in the 8 files. |
| Business logic / toggles / forms | Unchanged. |
| KPI / MetricCard | N/A (no MetricCard in this block). |

## Files modified

8: `CompanySettings.tsx`, `CompanyPaymentSettingsPage.tsx`, `Parametres.tsx`, `ParametresPlan.tsx`, `ParametresSecurite.tsx`, `ParametresVitrine.tsx`, `ParametresReseauxPage.tsx`, `ParametresLegauxPage.tsx`.
