# Pourquoi les pages se rafraîchissent automatiquement ?

## Causes possibles identifiées dans le projet

### 1. React.StrictMode (en développement uniquement)

**Fichier :** `src/index.tsx` (lignes 80–92)

En mode développement, React exécute volontairement les effets **deux fois** pour chaque composant : montage → démontage → remontage. Cela peut donner l’impression que la page "se recharge" (contenu qui disparaît puis réapparaît, loaders qui s’affichent deux fois).

- **Impact :** uniquement en `npm run dev`, pas en production.
- **Test :** désactiver temporairement `<React.StrictMode>` (envelopper uniquement `<App />` sans StrictMode) et voir si le rafraîchissement disparaît.

---

### 2. Hot Module Replacement (HMR) – Vite

Lorsque vous **sauvegardez un fichier** pendant que le serveur de dev tourne, Vite peut :
- soit mettre à jour le module à chaud (sans recharger la page),
- soit faire un **rechargement complet** si le remplacement échoue ou pour certains types de fichiers.

Si vous avez l’impression que la page se rafraîchit **à chaque sauvegarde**, c’est très probablement le HMR.

- **Impact :** uniquement en développement, au moment de la sauvegarde.
- **À vérifier :** est-ce que le rafraîchissement a lieu **sans toucher à aucun fichier** ? Si oui, ce n’est pas le HMR.

---

### 3. Service Worker et PWA (production ou build preview)

Le projet contient :
- **Vite PWA** avec `registerType: 'autoUpdate'` : quand une nouvelle version du SW est disponible, elle peut prendre le contrôle et déclencher un rechargement.
- **`src/utils/registerSW.ts`** : à l’événement `statechange` vers `'activated'`, appelle **`window.location.reload()`** (ligne 11).
- **`src/index.tsx`** : au démarrage, **désenregistre tous les Service Workers** (`FORCE_UNREGISTER_SW = true`), donc en principe **aucun SW actif** au chargement suivant.

En **développement** (`npm run dev`), les SW sont désenregistrés à chaque chargement, donc peu de risque de reload automatique par le SW.

En **production** (build déployé) :
- Si le build enregistre un Service Worker (via Vite PWA),
- et qu’un nouveau déploiement met en ligne une nouvelle version,
- le navigateur peut détecter la mise à jour du SW et, selon la logique d’activation, **recharger la page** pour prendre la nouvelle version.

- **Impact :** surtout en production (ou en local avec `npm run build && npm run preview`).
- **À vérifier :** est-ce que le rafraîchissement se produit sur un **déploiement en production** (ex. Netlify) plutôt qu’en local ?

---

### 4. Redirections (auth, rôle)

Plusieurs routes utilisent `<Navigate to="..." replace />` selon l’état de l’utilisateur (non connecté, rôle, etc.). Si l’état **oscille** (ex. `user` tantôt `null` tantôt défini à cause d’un listener ou d’un effet), vous pouvez avoir une **redirection en boucle** qui donne l’impression d’un rafraîchissement répété.

- **Impact :** possible en dev comme en prod.
- **À vérifier :** en ouvrant l’onglet Network (ou React DevTools), voir si l’URL change (ex. `/login` ↔ autre page) à chaque "refresh".

---

### 5. Erreur non gérée et Error Boundary

Si une erreur non gérée ou un Error Boundary provoque un remontage complet de l’arbre (ou un fallback qui remplace toute la page), l’interface peut "repartir de zéro" comme un refresh.

- **À vérifier :** console du navigateur (onglet Console) pour des erreurs rouges au moment du rafraîchissement.

---

## Que faire en premier ?

1. **Préciser le contexte :**
   - En **développement** (`npm run dev`) ou en **production** (build déployé) ?
   - Le rafraîchissement a lieu **tout seul** (sans sauvegarder de fichier) ou **à chaque sauvegarde** ?

2. **En dev, sans sauvegarder :**
   - Tester **sans StrictMode** (voir ci‑dessus) pour voir si l’effet "double exécution" disparaît.
   - Regarder la **barre d’URL** : est-ce qu’elle change (redirection) à chaque fois ?
   - Regarder l’onglet **Network** : est-ce un vrai rechargement HTTP (nouvelle requête du document) ou seulement des requêtes XHR/JS ?

3. **En production :**
   - Vérifier si le refresh arrive juste après un **nouveau déploiement** (SW qui se met à jour).
   - Si oui, le comportement peut venir du **Service Worker** (autoUpdate) ; on peut alors envisager de désactiver le rechargement automatique et n’afficher que la bannière "Nouvelle version" (UpdateBanner) sans reload tant que l’utilisateur ne clique pas.

---

## Désactiver temporairement StrictMode (test uniquement)

Dans `src/index.tsx`, remplacer :

```tsx
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter ...>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

par :

```tsx
ReactDOM.createRoot(rootEl).render(
  <BrowserRouter ...>
    <App />
  </BrowserRouter>
);
```

Si le "rafraîchissement" disparaît en dev, c’est très probablement le double montage de StrictMode. On peut ensuite remettre StrictMode et accepter ce comportement en dev, ou le laisser désactivé (moins recommandé pour la détection de bugs).
