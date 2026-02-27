# Audit technique — Hero / Header / VilleCombobox

**Objectif :** Identifier les causes précises des problèmes de visibilité ou de fonctionnement.  
**Aucune modification effectuée.** Audit uniquement.

---

## 1️⃣ HEADER (CompanyPublicHeader.tsx)

### 1.1 Logo peu visible

| Cause | Détail |
|-------|--------|
| **Fond du header très transparent** | `bg-white/10` — le header est à 10 % d’opacité blanche. Le logo est dans un cercle `bg-white` (ligne 61), mais le contraste global reste faible sur un Hero clair ou une image vive. |
| **Pas de renforcement visuel** | Pas de `shadow`, `ring` ou bordure marquée sur le conteneur du logo pour le détacher du fond glass. |
| **Bordure logo = couleur marque** | `border: 2px solid ${brandColor}` — si `primaryColor` est clair (ex. jaune, cyan), la bordure se fond avec le fond. |

**Classes concernées :** `bg-white/10`, `bg-white` (cercle logo), `border-[brandColor]`.

---

### 1.2 Nom de la compagnie — manque de contraste

| Cause | Détail |
|-------|--------|
| **Texte blanc sur fond très transparent** | `text-white` (ligne 80) sur `bg-white/10`. Sur fond clair (ciel, route, image claire) le ratio de contraste est insuffisant. |
| **Aucun texte shadow** | Pas de `text-shadow` ou `drop-shadow` pour décoller le texte du fond. |
| **Backdrop seul insuffisant** | `backdrop-blur-md` aide un peu mais ne crée pas de zone plus opaque derrière le texte. |

**Classes concernées :** `text-white`, `bg-white/10`, `backdrop-blur-md`.

---

### 1.3 FR | EN peu visible

| Cause | Détail |
|-------|--------|
| **Séparateur gris** | Dans `LanguageSwitcher.tsx` : `<span className="text-gray-400">|</span>`. Sur fond glass, `gray-400` est peu lisible. |
| **Boutons sans couleur explicite** | Les boutons FR/EN n’ont que `text-sm hover:underline` ; ils héritent du parent. Le parent header a `text-white` (ligne 87), donc en théorie ils sont blancs — mais le wrapper `<div className="text-white">` peut ne pas être assez fort selon le contexte d’empilement. |
| **Même cause que le nom** | Même fond `bg-white/10` ; en conditions lumineuses, tout le bloc (nom + FR | EN) manque de contraste. |

**Fichier :** `src/modules/compagnie/public/components/LanguageSwitcher.tsx` — pas de couleur de texte explicite sur les boutons ; séparateur `text-gray-400`.

---

### 1.4 Toggle jour/nuit a disparu

| Constat | Détail |
|--------|--------|
| **Absent du header actuel** | Dans `CompanyPublicHeader.tsx` il n’y a **aucun** composant ou état lié à un thème clair/sombre (jour/nuit). |
| **Aucun import** | Pas d’import de Sun/Moon, ThemeToggle, DarkMode, etc. |
| **Aucune condition** | Aucun `useState` ou prop du type `theme` / `darkMode` qui masquerait un toggle. |
| **Conclusion** | Le toggle jour/nuit **n’est pas présent** dans ce header. Soit il n’a jamais été ajouté sur la page publique compagnie, soit il a été supprimé lors d’un refactor (ex. passage au header “premium” fixed + glass). Aucune trace dans le fichier actuel. |

---

## 2️⃣ HERO (HeroCompanySection.tsx)

### 2.1 Overlay trop sombre / contraste

| Élément | Classe / valeur | Rôle |
|--------|-----------------|------|
| Overlay (avec image) | `bg-black/40` (ligne 52) | 40 % de noir sur l’image. Pour une image déjà sombre, le cumul peut rendre le bloc très sombre. |
| Fond sans image | `backgroundColor: "#1a1a1a"` (ligne 56) | Fond fixe sombre. |
| Titre | `text-white` (ligne 65) | Texte blanc. Sur overlay 40 % + image claire, contraste en général OK ; sur image très sombre + 40 %, l’ensemble peut être trop sombre. |

**Cause possible “trop sombre” :** cumul de l’image de fond (souvent sombre pour un hero) + `bg-black/40` sans réglage selon la luminosité de l’image.

---

### 2.2 Z-index et conflits

| Élément | Z-index / position | Conflit ? |
|---------|--------------------|-----------|
| Section Hero | `relative` (pas de z-index) | — |
| Fond image | `absolute inset-0` (pas de z) | — |
| Overlay | `absolute inset-0 z-0` | Sous le contenu. |
| Contenu (titre + formulaire) | `relative z-10` (ligne 64) | Au-dessus de l’overlay. |
| Header (layout) | `fixed … z-50` | Au-dessus du Hero. |

**Conclusion :** Pas de conflit de z-index à l’intérieur du Hero. Le header en `z-50` est au-dessus du contenu Hero `z-10`, ce qui est voulu.

---

### 2.3 Header fixed masque une partie du Hero

| Cause | Détail |
|-------|--------|
| **Compensation layout** | Dans `PublicCompanyPage.tsx` : wrapper avec `pt-[64px]` (ligne 248) pour compenser la hauteur du header fixe `h-16` (64px). |
| **Risque restant** | Si la hauteur réelle du header (padding + contenu) dépasse 64px, ou si le viewport est très petit, le début du Hero (titre) peut encore être partiellement masqué. Aucune marge supplémentaire dans le Hero lui-même (pas de `pt-` ou `mt-` en plus). |

**Classes concernées (layout) :** `pt-[64px]` sur le wrapper ; header `h-16`, `fixed top-0`.

---

### 2.4 Pas d’overflow cachant le Hero

- **Hero :** aucune classe `overflow-hidden` ou `overflow-*` sur la section.
- **Page :** pas d’`overflow` sur le wrapper ou le `main` dans `PublicCompanyPage.tsx`.

Aucune cause côté overflow pour un Hero “coupé”.

---

## 3️⃣ VILLECOMBOBOX

### 3.1 useVilles — chargement des données

| Point | Constat |
|-------|--------|
| **Source** | `getAllVilles()` dans `villes.service.ts` : lecture Firestore `collection(db, "villes")`, champs `nom`, tri alphabétique. Un seul appel au montage. |
| **Hook** | `useVilles()` retourne `{ villes, loading, error }`. VilleCombobox utilise **uniquement** `villes` ; `loading` et `error` ne sont pas utilisés. |
| **Risque** | Si la collection est vide ou que Firestore renvoie une erreur, `villes` reste `[]` et le filtre renverra toujours `[]` — le dropdown ne s’ouvrira jamais. Aucun retour visuel (spinner, message) dans le combobox. |

**Cause possible “rien ne s’affiche” :** données non chargées ou erreur Firestore, sans feedback dans l’UI.

---

### 3.2 State “open” (showList)

| Mécanisme | Détail |
|-----------|--------|
| **Ouverture** | `showList` passe à `true` dans un `useEffect` (lignes 87–93) : quand `filtered.length > 0` **et** `!closedByUserRef.current`. |
| **Fermeture** | Clic extérieur ou `choose()` met `closedByUserRef.current = true` et `setShowList(false)`. Après une sélection, `chosenRef` empêche de rouvrir au prochain cycle. |
| **Focus** | `onFocus` remet `closedByUserRef.current = false` et, si `value && filtered.length > 0`, appelle `setShowList(true)`. |

**Cause possible “la liste ne s’ouvre pas” :**  
- `closedByUserRef.current` reste `true` (ex. après un clic dehors puis re-focus sans avoir retapé).  
- Ou `filtered.length === 0` (données vides, debounce pas encore passé, ou filtre trop restrictif).

---

### 3.3 Debounce et affichage

| Comportement | Détail |
|--------------|--------|
| **Délai** | `DEBOUNCE_MS = 200`. `debouncedQuery` est mis à jour 200 ms après la dernière frappe. |
| **Enchaînement** | `value` (saisie) → après 200 ms → `debouncedQuery` → `filtered` (useMemo) → `useEffect` qui met `showList` à true si `filtered.length > 0`. |
| **Effet** | La liste n’apparaît qu’**au moins 200 ms** après le début de la saisie. Si l’utilisateur tape une seule lettre et que cette lettre ne matche aucune ville, la liste ne s’ouvre pas. |

**Cause possible “liste ne s’affiche pas / retard” :** le debounce de 200 ms retarde l’ouverture ; si la première lettre ne donne aucun résultat, `showList` reste false.

---

### 3.4 Parent overflow-hidden

| Parent | Overflow |
|--------|----------|
| Hero section | Aucun `overflow-hidden` (confirmé). |
| Formulaire Hero | Pas d’overflow. |
| PublicCompanyPage (main, wrapper) | Aucun `overflow-hidden` trouvé. |

Le dropdown n’est **pas** caché par un parent en `overflow-hidden` dans la chaîne Hero / PublicCompanyPage.

---

### 3.5 Z-index du dropdown

| Élément | Classe / z-index |
|---------|-------------------|
| Conteneur combobox | `relative z-20` (ligne 158). |
| Liste (ul) | `z-50` (ligne 183). |
| Hero contenu | `z-10`. |
| Header | `z-50` (fixed). |

Le dropdown est en `z-50` dans son conteneur `z-20`. Le header est aussi en `z-50` au niveau document ; l’ordre d’empilement dépend du DOM (qui vient après dans le document gagne). En pratique, le dropdown devrait passer au-dessus du Hero ; s’il est sous le header, c’est parce que le header est plus haut dans l’arbre et aussi en `z-50`. Pas de conflit avec le Hero lui-même.

---

### 3.6 Filtre

| Règle | Implémentation |
|-------|----------------|
| Insensible à la casse | `toLowerCase()` sur la requête et sur chaque ville. |
| Contient la chaîne | `city.toLowerCase().includes(q)`. |
| Tri alphabétique | `localeCompare(b, "fr")`. |
| Priorité préfixe | Les villes qui `startsWith(q)` sont triées en premier. |

Le filtre est cohérent. Si “le filtre ne fonctionne pas”, causes possibles : `villes` vide (problème de chargement) ou requête avec caractères spéciaux / espaces qui réduisent les résultats.

---

### 3.7 Console.log temporaires suggérés (audit uniquement)

Pour vérifier sans modifier le comportement :

- Dans `useVilles` (après `setVilles(names)`) :  
  `console.log('[useVilles] loaded', names.length, 'villes')`
- Dans VilleCombobox, au début du rendu :  
  `console.log('[VilleCombobox] value=', value, 'debouncedQuery=', debouncedQuery, 'filtered.length=', filtered.length, 'showList=', showList)`
- Dans l’effet qui met à jour `showList` (lignes 87–93) :  
  `console.log('[VilleCombobox] effect showList', { filteredLength: filtered.length, closedByUser: closedByUserRef.current })`

Cela permet de vérifier : chargement des villes, mise à jour de `debouncedQuery` / `filtered`, et conditions d’ouverture de la liste.

---

## Synthèse des causes

| Zone | Cause principale |
|------|------------------|
| **Header — logo** | `bg-white/10` trop transparent ; logo en `bg-white` sans renfort (shadow/ring) ; bordure logo = couleur marque possiblement peu contrastée. |
| **Header — nom** | `text-white` sur `bg-white/10` → contraste faible sur fond clair ; pas de text-shadow. |
| **Header — FR \| EN** | Séparateur `text-gray-400` ; boutons sans couleur explicite (héritent `text-white`) ; même fond glass que le nom. |
| **Header — toggle jour/nuit** | Absent du fichier ; pas d’import ni condition ; jamais ajouté ou supprimé auparavant. |
| **Hero — overlay** | `bg-black/40` peut être trop sombre si l’image est déjà sombre. |
| **Hero — contraste** | Dépend de l’image + overlay ; pas de conflit z-index. |
| **Hero — header fixed** | Compensé par `pt-[64px]` ; risque si hauteur réelle > 64px ou viewport très petit. |
| **VilleCombobox — données** | `villes` vide ou erreur Firestore → `filtered` toujours vide → liste ne s’ouvre jamais ; pas d’usage de `loading`/`error`. |
| **VilleCombobox — open** | Dépend de `filtered.length > 0` et `!closedByUserRef.current` ; debounce 200 ms retarde l’ouverture. |
| **VilleCombobox — debounce** | 200 ms avant mise à jour de `debouncedQuery` → délai perçu avant affichage de la liste. |
| **VilleCombobox — overflow** | Aucun parent en overflow-hidden identifié. |
| **VilleCombobox — z-index** | Dropdown `z-50`, conteneur `z-20` ; correct par rapport au Hero. |

**Livrable :** liste des causes ci-dessus ; aucune modification de code dans ce document.
