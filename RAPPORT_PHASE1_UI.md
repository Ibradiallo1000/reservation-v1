# Rapport Phase 1 – UI Professionnalisation (Dark / Light / Responsive)

**Date :** 19 février 2025  
**Périmètre :** Améliorations UI uniquement — aucune modification de la logique métier, Firestore, affectation ou authentification.

---

## 1. Ce qui a été modifié

### PART 1 – Toggle thème global (clair / sombre)

- **État du thème** : état local (ex. `darkMode`) dans les layouts concernés.
- **Persistance** : clé `agency-dark-mode` dans `localStorage` (valeur `"1"` = sombre, `"0"` = clair).
- **Application** : `document.documentElement.classList.toggle("dark", dark)` pour la classe `dark` sur la racine du document.
- **Défaut** : thème clair.
- **Bouton header** : bouton avec icône ☀️ (mode clair) / 🌙 (mode sombre) dans la barre d’en-tête des layouts agence / embarquement.

### PART 2 – Contraste mode sombre (standard professionnel)

- **Texte** : texte principal en blanc / gris clair ; texte secondaire en `#e2e8f0` (équivalent `text-gray-200`), sans `text-gray-400` ni `text-gray-500` sur fond sombre.
- **Cartes** : `dark:bg-slate-800`, bordures `dark:border-slate-600`, `rounded-xl`, `shadow-md`.
- **Inputs (mode sombre)** : `dark:bg-slate-900`, texte blanc, bordure `dark:border-slate-600`.
- **Lignes de tableau** : survol en `hover:bg-slate-700`, bordures lisibles, pas de combinaisons gris sur noir.

### PART 3 – Responsive mobile (module Embarquement)

- **Tableau passagers** : conteneur avec `overflow-x-auto`, table avec largeur minimale (ex. `min-w-[600px]`) et taille de police minimale 14px.
- **Cartes** (véhicule / chauffeur / convoyeur) : empilées verticalement sur petit écran (`grid-cols-1 sm:grid-cols-3`).
- **Cases à cocher** : taille minimale 20×20 px (classe `.case` en 20px min-width/height).
- **Boutons** (Scan, Imprimer, Clôturer) : `w-full sm:w-auto` et `min-h-[40px]` sur mobile.
- **Zone scanner** : conteneur en `no-print` et `w-full` ; vidéo en `w-full sm:max-w-md` pour pleine largeur sur mobile.

### PART 4 – Optimisation impression

- **Règles @media print** : fond blanc, texte noir pour `body` / `html`.
- **Classe `.no-print`** : `display: none !important` à l’impression.
- **Zone imprimable** : `#print-area` avec styles adaptés pour un document propre et lisible.

### PART 5 – Standardisation des badges

- **Réservations** : `bg-blue-600`, texte blanc.
- **Places** : `bg-indigo-600`, texte blanc.
- **Embarqués** : `bg-green-600`, texte blanc.
- **Absent** : `bg-red-600`, texte blanc.
- **Cohérence** : `px-2.5 py-1.5 rounded-lg` pour un rendu uniforme.

---

## 2. Fichiers mis à jour

| Fichier | Modifications |
|--------|----------------|
| `src/modules/agence/shared/useAgencyDarkMode.ts` | Hook : lecture/écriture localStorage, `document.documentElement.classList.toggle("dark", dark)`, défaut clair. |
| `src/modules/agence/shared/AgencyHeaderExtras.tsx` | Bouton toggle thème (☀️ / 🌙) dans le header. |
| `src/index.css` | Bloc `.agency-dark` (contraste cartes, textes, inputs, tableaux) ; bloc `@media print` et `.no-print`. |
| `src/modules/agence/boarding/BoardingLayout.tsx` | Wrapper `agency-dark` selon `darkMode`, passage de `darkMode` et `toggleDarkMode` à `AgencyHeaderExtras`. |
| `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` | Badges standardisés ; cartes (filtre, infos départ, véhicule/chauffeur/convoyeur, saisie manuelle) avec classes dark et `rounded-xl`/`shadow-md` ; barre d’actions en `no-print` ; input recherche + boutons Scan/Imprimer/Clôturer avec `w-full sm:w-auto`, `min-h-[40px]` et styles dark ; zone scanner `no-print`, vidéo `w-full sm:max-w-md` ; tableau avec `overflow-x-auto` et `min-w-[600px]` ; checkbox 20px ; `fontSize: 14px` où pertinent. |
| `src/modules/agence/boarding/BoardingDashboardPage.tsx` | (Si applicable) Padding responsive, classes dark sur cartes/boutons, `fontSize: 14px`. |

*(D’autres layouts agence/compagnie utilisant `useAgencyDarkMode` et `AgencyHeaderExtras` ont déjà été intégrés en amont : FleetLayout, CompagnieLayout, ManagerShellPage, etc.)*

---

## 3. Normes visuelles appliquées

- **Mode sombre** : palette slate (800 fond cartes, 900 inputs, 600 bordures, 700 hover lignes), texte principal clair, secondaire en `#e2e8f0`.
- **Cartes** : `rounded-xl`, `shadow-md`, bordures explicites (gray-200 / slate-600).
- **Mobile** : boutons pleine largeur, zone scanner pleine largeur, tableau scrollable horizontalement, police min 14px, checkbox 20px.
- **Impression** : fond blanc, texte noir, masquage des éléments non essentiels via `.no-print`.
- **Badges** : bleu (réservations), indigo (places), vert (embarqués), rouge (absent), padding et coins arrondis identiques.

---

## 4. Confirmation : logique métier non modifiée

- **Firestore** : aucune modification de structure, règles ou champs.
- **Authentification / rôles** : inchangés.
- **Affectation véhicule / chauffeur / convoyeur** : logique et données inchangées ; seuls les styles des cartes ont été ajustés.
- **Embarquement (clôture, scan, saisie manuelle)** : comportement et appels métier inchangés.
- **Routes et permissions** : inchangées.

Toutes les modifications concernent uniquement les classes CSS, la structure DOM des blocs UI (wrappers `no-print`, grilles responsive), la persistance du thème en localStorage et l’affichage (badges, contraste, responsive, impression).

---

*Rapport généré dans le cadre de la Phase 1 – UI professionnalisation.*
