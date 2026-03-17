# Audit PWA TELIYA — Compatibilité Android et Google Play Protect

## Objectif
Identifier pourquoi la PWA peut être détectée comme "appli non sécurisée" par Play Protect et corriger pour une installation fiable sur Android.

---

## 1. Manifest (manifest.webmanifest)

### Avant audit
- **Vite PWA** génère le manifest en build à partir de `vite.config.ts`.
- **Fichier statique** `public/manifest.webmanifest` existe avec une config plus complète mais n’est pas utilisé en build (Vite PWA écrase / génère le sien).

### Points vérifiés

| Exigence | Avant | Après |
|----------|--------|--------|
| **id** | `id: '/'` (faible, peut varier selon l’origine) | `id: 'app.teliya'` (identifiant stable) |
| **start_url** | `'/'` | `'/'` (inchangé) |
| **display** | `'standalone'` | `'standalone'` (inchangé) |
| **theme_color** | `#FF6600` | `#FF6600` (inchangé) |
| **background_color** | `#FF6600` | `#FFFFFF` (splash Android plus standard, évite fond orange plein écran) |
| **scope** | Absent en config | `scope: '/'` ajouté |
| **Icônes 192x192 / 512x512** | Présentes (any) | Conservées |
| **Icône maskable** | Absente du manifest généré | `icon-maskable-512.png` avec `purpose: 'maskable'` ajoutée |

### Cause probable du blocage Play Protect
- **id** non stable ou trop générique (`/`) → identification WebAPK floue.
- **Absence d’icône maskable** → Android exige une icône adaptative pour l’installation et le splash ; son absence peut dégrader la “confiance” du système.
- **background_color** sombre/coloré peut être perçu comme moins “propre” sur certains appareils.

### Corrections appliquées (vite.config.ts)
- `id: 'app.teliya'`
- `scope: '/'`
- `background_color: '#FFFFFF'`
- Ajout de l’icône `icon-maskable-512.png` avec `purpose: 'maskable'`

---

## 2. Service Worker

### Comportement actuel
- **Build** : Vite PWA (Workbox) génère `sw.js` avec precache des assets et stratégies de cache.
- **Fichier manuel** `public/sw.js` : présent mais **non utilisé en production** (le build utilise le SW généré par le plugin).

### Vérifications
- **Fetch** : Workbox gère uniquement les assets (js, css, html, ico, png, svg) ; pas d’interception globale de toutes les requêtes.
- **Pas de blocage réseau** : les requêtes non matchées passent au réseau.
- **Pas d’erreurs console** attendues si le SW est enregistré correctement (scope `/`, pas de conflit avec un ancien SW).

### Recommandation
- Conserver `registerType: 'prompt'` pour éviter les rechargements automatiques.
- S’assurer que l’icône maskable existe bien : `public/icons/icon-maskable-512.png` (512×512, zone de sécurité ~40 % au centre).

---

## 3. Installation PWA / WebAPK (Chrome Android)

- Avec **id** stable et **icône maskable**, Chrome peut générer un WebAPK correct.
- **start_url** et **scope** cohérents (`/`) évitent les incohérences d’installation.
- Après déploiement, tester “Ajouter à l’écran d’accueil” sur Chrome Android pour valider l’icône et l’écran de démarrage.

---

## 4. Meta tags

| Tag | Fichier | Statut |
|-----|---------|--------|
| **viewport** | `index.html` | `width=device-width, initial-scale=1.0` ; ajout de `viewport-fit=cover` pour encoche / barre de statut. |
| **theme-color** | `index.html` | `#FF6600` présent. |
| **manifest** | `index.html` | Lien `rel="manifest"` href="/manifest.webmanifest" ajouté (alignement avec la PWA générée). |

`public/index.html` (splash / autre entrée) avait déjà theme-color et manifest ; la racine `index.html` est alignée.

---

## 5. HTTPS et contenu mixte

- Préconnexions dans le HTML vers `https://` (Firestore, Storage, Google APIs).
- Aucune ressource en `http://` détectée dans les liens/scripts.
- En production, servir l’app uniquement en **HTTPS** pour que la PWA soit installable et pour limiter les alertes de sécurité.

---

## 6. Résumé des corrections

1. **vite.config.ts**  
   - `id: 'app.teliya'`  
   - `scope: '/'`  
   - `background_color: '#FFFFFF'`  
   - Icône maskable : `icon-maskable-512.png`, `purpose: 'maskable'`

2. **index.html** (racine)  
   - `viewport` avec `viewport-fit=cover`  
   - `<link rel="manifest" href="/manifest.webmanifest" />`

3. **Fichier à fournir**  
   - `public/icons/icon-maskable-512.png` (512×512 px, contenu important dans un cercle de ~40 % au centre).

---

## 7. Vérifications post-déploiement

- [ ] Ouvrir la PWA en **HTTPS** sur Chrome Android.
- [ ] Menu → “Installer l’application” / “Ajouter à l’écran d’accueil”.
- [ ] Vérifier que l’icône sur le bureau est correcte (sans recadrage gênant).
- [ ] Vérifier l’absence d’avertissement Play Protect après installation (peut prendre quelques heures/jours).
- [ ] DevTools (Chrome) → Application → Manifest : vérifier `id`, `start_url`, icônes (dont maskable), pas d’erreurs.

---

## 8. Références

- [Web App Manifest (web.dev)](https://developers.google.com/web/fundamentals/web-app-manifest/)
- [Maskable Icons (web.dev)](https://web.dev/articles/maskable-icon)
- Manifest `id` : identifiant stable pour l’app (WebAPK / installation Android).
