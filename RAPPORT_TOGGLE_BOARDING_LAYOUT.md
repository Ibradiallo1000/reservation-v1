# Rapport — Toggle clair/sombre dans BoardingLayout

**Date :** 19 février 2025  
**Fichier modifié :** `src/modules/agence/boarding/BoardingLayout.tsx`  
**Périmètre :** UI uniquement. Aucune modification du routage, de l’auth, de Firestore ou de la logique métier.

---

## 1. Où le bouton a été inséré

Le bouton de changement de thème est rendu dans la **zone droite du header** du layout Boarding, via la prop **`headerRight`** du composant **`InternalLayout`**.

- **Emplacement :** à gauche du bouton de déconnexion (logout). `InternalLayout` affiche d’abord le contenu de `headerRight`, puis le bouton logout ; les deux sont alignés horizontalement dans la même barre.
- **Contenu de `headerRight` :**
  1. **Indicateur hors-ligne** (si `!isOnline`) : petit badge « Hors-ligne » avec `mr-2` pour l’espacement.
  2. **Bouton thème** : `ml-2 px-3 py-2 rounded-full border ...` avec ☀️ en mode sombre et 🌙 en mode clair, `title="Changer le thème"`.

Le bouton ne remplace pas le logout, ne le recouvre pas et reste aligné avec lui (flex horizontal du header).

---

## 2. Persistance du thème

- **Clé localStorage :** `"theme"`.
- **Valeurs :** `"light"` | `"dark"`.
- **Lecture au montage :**  
  `useState<"light" | "dark">(() => (localStorage.getItem("theme") as "light" | "dark") || "light")`  
  → si une valeur est présente et égale à `"dark"`, le premier rendu est en mode sombre ; sinon (vide ou autre) défaut **light**.
- **Synchronisation DOM + persistance :**  
  `useEffect` dépendant de `themeMode` :
  - `document.documentElement.classList.toggle("dark", themeMode === "dark")` ;
  - `localStorage.setItem("theme", themeMode)`.
- **Changement par l’utilisateur :** clic sur le bouton → `setThemeMode(prev => prev === "dark" ? "light" : "dark")` ; l’effet ci-dessus met à jour la classe sur `<html>` et le localStorage.

---

## 3. Chargement initial du thème

- **Au premier montage de BoardingLayout :**
  - Si `localStorage.getItem("theme") === "dark"` → la page s’affiche en mode sombre (classe `dark` sur la racine, wrapper `agency-dark`).
  - Si la clé est absente ou différente de `"dark"` → défaut **light**.
- Aucune requête réseau ni logique métier : uniquement lecture du localStorage dans l’initialiseur de `useState` et application dans l’`useEffect`.

---

## 4. Confirmation : aucune logique métier modifiée

- **Firestore :** non utilisé, non modifié.
- **Auth :** inchangée (on utilise toujours `useAuth()` pour user, company, logout comme avant).
- **Routage / routePermissions :** non modifiés ; pas de changement de routes ni de permissions.
- **Pages Boarding (BoardingDashboardPage, BoardingScanPage, AgenceEmbarquementPage) :** aucune modification ; elles restent des enfants rendus via `<Outlet />`.
- **Logique métier :** redirections selon les rôles (`canUseBoarding`, `handleLogout`), `useCompanyTheme`, `useAgencyKeyboardShortcuts` sont inchangés.

**Modifications effectuées :**
- Ajout de `useState` et `useEffect` pour le thème local.
- Remplacement de l’ancien toggle (hook `useAgencyDarkMode` + `AgencyHeaderExtras`) par le state `themeMode` et le nouveau bouton dans `headerRight`.
- Le wrapper `agency-dark` utilise désormais `themeMode === "dark"` au lieu de `darkMode`.

Aucune donnée métier, aucun appel API, aucune règle Firestore ni route n’a été touché.

---

*Rapport généré pour l’ajout du toggle clair/sombre dans BoardingLayout.*
