# Rapport — Toggle thème et contraste Boarding (UI uniquement)

**Date :** 19 février 2025  
**Périmètre :** Corrections UI / visuelles uniquement. Aucune modification de la logique métier, Firestore, état, affectation, authentification ou routes.

---

## 1. Fichiers modifiés

| Fichier | Rôle |
|--------|------|
| `src/modules/agence/shared/useAgencyDarkMode.ts` | Persistance du thème (clé `"theme"`), toggle de la classe `dark` sur `document.documentElement`. |
| `src/modules/agence/shared/AgencyHeaderExtras.tsx` | Bouton toggle thème visible (rounded-full, bordure, ☀️ / 🌙). |
| `src/index.css` | Règles de contraste mode sombre (titres/secondaire/muted), en-tête et lignes du tableau, checkboxes, titre/sous-titre liste d’embarquement. |
| `src/modules/agence/embarquement/pages/AgenceEmbarquementPage.tsx` | Classes dark sur ligne trajet, cartes Véhicule/Chauffeur/Convoyeur, en-tête et lignes du tableau passagers, champs et badges. |

---

## 2. Modifications détaillées

### PART 1 — Toggle thème visible dans le header Boarding

**Fichiers :** `useAgencyDarkMode.ts`, `AgencyHeaderExtras.tsx`

- **Clé localStorage :** `"agency-dark-mode"` remplacée par **`"theme"`**, valeurs **`"dark"`** / **`"light"`**. Lecture de l’ancienne clé au premier chargement pour compatibilité.
- **Classe sur la racine :** `document.documentElement.classList.toggle("dark", dark)` inchangé.
- **Bouton header :**
  - **Rounded full** : `rounded-full`, taille fixe `w-9 h-9`.
  - **Bordure** : `border-2 border-slate-300 dark:border-slate-500`.
  - **Visibilité** : fond `bg-white dark:bg-slate-700`, texte `text-slate-700 dark:text-gray-200`, hover `hover:bg-slate-100 dark:hover:bg-slate-600`.
  - **Icônes** : ☀️ lorsque le mode sombre est actif, 🌙 en mode clair (emojis pour meilleure visibilité).
  - **Transition** : `transition-colors`.
- Le bouton est rendu dans `headerRight` d’`InternalLayout`, **avant** le bouton Déconnexion ; il ne modifie pas le comportement du logout.

### PART 2 — Règles de contraste strictes en mode sombre

**Fichier :** `src/index.css`

- **Texte secondaire / muted :**  
  `.agency-dark .text-gray-500` et `.agency-dark .text-gray-400` passent de `#e2e8f0` à **`#d1d5db`** (équivalent gray-300) pour le texte « muted ».  
  Les titres restent en blanc / gris très clair via les règles existantes et les classes Tailwind `dark:text-white` / `dark:text-gray-200`.
- **Règle globale :** en mode sombre, pas d’utilisation de `text-gray-400` / `text-gray-500` sur fond sombre sans override ; titres → blanc, secondaire → gray-200, muted → gray-300.

### PART 3 — Texte de trajet et infos départ visibles

**Fichier :** `AgenceEmbarquementPage.tsx`

- **Label « Trajet » :** `text-gray-500` → ajout de **`dark:text-gray-200`**.
- **Ligne trajet (ex. « Bamako — Abidjan · 21/02/2026 à 05:00 ») :** ajout de **`text-gray-900 dark:text-white`** sur le bloc `font-semibold`.
- **Cartes Véhicule / Plaque, Chauffeur, Convoyeur :**
  - Labels (Véhicule / Plaque, Chauffeur, Convoyeur) : déjà en `dark:text-gray-200`.
  - Valeurs principales : **`text-gray-900 dark:text-white`** sur les blocs `font-medium`.
  - Téléphones (Tél. …) : **`dark:text-gray-200`** en plus de `text-gray-600`.
- **Titre / sous-titre au-dessus de la liste passagers** (dans `#print-area`) : règles dans **`index.css`** :
  - `.agency-dark #print-area .title` → **`color: #ffffff`**.
  - `.agency-dark #print-area .subtitle` → **`color: #e2e8f0`**.
  - `.agency-dark #print-area .meta-card` et `.font-medium` → couleurs lisibles (secondaire / blanc).

Aucun texte en gris clair sur fond sombre non corrigé.

### PART 4 — Cartes blanches en mode sombre

**Fichiers :** `AgenceEmbarquementPage.tsx`, `index.css`

- Les cartes (filtre agence/date, infos départ, Véhicule/Chauffeur/Convoyeur, saisie manuelle) ont déjà **`dark:bg-slate-800`**, **`dark:border-slate-600`**.
- Texte principal : **`dark:text-white`** où il manquait (ligne trajet, valeurs des cartes).
- Texte secondaire : **`dark:text-gray-200`** (labels, Tél., « Capacité véhicule »).
- **Badge « Capacité véhicule » :** **`dark:bg-slate-700`**, **`dark:border-slate-600`**, **`dark:text-gray-200`** / **`dark:text-white`** pour le chiffre.
- **Champ « Saisir une référence » :** **`dark:bg-slate-900`**, **`dark:border-slate-600`**, **`dark:text-white`**.
- Règles globales `.agency-dark` dans `index.css` continuent de forcer fond slate-800 et bordures slate-600 pour `.bg-white` / `.bg-gray-50` dans la zone.

Aucune combinaison gris sur gris conservée.

### PART 5 — Contraste en-tête et lignes du tableau passagers

**Fichiers :** `AgenceEmbarquementPage.tsx`, `index.css`

- **En-tête du tableau (`<thead>`) :**
  - **`dark:bg-slate-800`**, **`dark:border-slate-600`**.
  - **`dark:text-white`** sur chaque `<th>`, plus **`border-b border-gray-200 dark:border-slate-600`**.
- **Lignes (`<tbody>`) :**
  - Alternance : **`dark:bg-slate-900`** (lignes impaires) et **`dark:bg-slate-800`** (lignes paires) via classes Tailwind + règles CSS `.agency-dark table tbody tr:nth-child(odd/even)` dans `index.css`.
  - **Texte** : **`text-gray-900 dark:text-white`** sur les `<td>` (numéro, client, téléphone, canal, référence, places).
- **Lignes « embarqué » :**  
  Règle **`.agency-dark tr.embarked`** : fond **`#334155`** (slate-700), texte **blanc**, pour rester distinct tout en restant lisible.
- **Checkboxes (`.case`) :**  
  Règles **`.agency-dark .case`** : bordure **`#94a3b8`**, fond **`#1e293b`**, coche **blanche** pour rester visibles en mode sombre.
- **Cellules « Chargement… » / « Aucun passager trouvé » :** **`dark:text-gray-200`** à la place de gray-500 / gray-400.

---

## 3. Comportement avant / après

| Élément | Avant | Après |
|--------|--------|--------|
| **Toggle thème** | Petit bouton, icônes Lucide, clé `agency-dark-mode` (1/0). | Bouton rond plein (rounded-full), bordure, ☀️/🌙, clé `theme` (dark/light), visible en clair et en sombre. |
| **Texte trajet** | Gris ou hérité, peu lisible en sombre. | Blanc en mode sombre (titre + ligne trajet). |
| **Cartes Véhicule/Chauffeur/Convoyeur** | Labels/valeurs parfois gris sur fond sombre. | Labels gray-200, valeurs blanches, bordures slate-600. |
| **Tableau passagers** | En-tête gris clair, lignes peu contrastées, checkboxes peu visibles. | En-tête slate-800 + texte blanc, lignes alternées slate-900/slate-800, texte blanc, checkboxes avec bordure et fond visibles. |
| **Cartes blanches** | Certaines restaient claires ou texte gris en sombre. | Toutes en slate-800/slate-600, texte blanc/secondaire gray-200. |
| **Liste d’embarquement (titre/sous-titre)** | Couleurs d’impression uniquement, risque de gris en écran sombre. | En mode sombre à l’écran : titre blanc, sous-titre gray-200, meta-cards lisibles. |

---

## 4. Confirmation : aucune logique métier modifiée

- **Firestore :** aucune modification de structure, règles ou champs.
- **État applicatif :** seul l’état du thème (lecture/écriture localStorage, classe `dark`) est utilisé ; aucun état métier (réservations, trajets, affectations, utilisateur) n’a été modifié.
- **Logique d’affectation :** inchangée (véhicule, chauffeur, convoyeur) ; seules les classes d’affichage des cartes ont été ajustées.
- **Authentification / rôles :** inchangés.
- **Routes :** inchangées.
- **Données :** aucun changement de format, d’API ou de schéma.

Toutes les modifications concernent **uniquement** :

- le hook de thème (clé et valeurs de persistance),
- les classes CSS et Tailwind (couleurs, bordures, fonds),
- la structure d’affichage du header (bouton toggle) et du tableau (classes sur `thead`/`tr`/`td`).

---

*Rapport généré dans le cadre de la stabilisation visuelle du module Boarding (toggle thème + contraste).*
