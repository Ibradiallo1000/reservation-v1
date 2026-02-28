# Audit — Démarrage lent et logo Teliya affiché 2 fois

## Problèmes constatés

1. **Affichage des données trop lent** au clic sur l’application.
2. **Logo Teliya affiché 2 fois** avant d’arriver au contenu.

---

## Causes identifiées

### 1. Premier rendu bloqué par Firebase (`index.tsx`)

- Le point d’entrée fait `await initFirebase()` **avant** tout `ReactDOM.render()`.
- L’utilisateur voit un écran **blanc** tant que Firebase (Auth + Firestore, éventuellement persistance) n’est pas prêt.
- Aucun indicateur de chargement pendant cette phase.

### 2. Double affichage du logo

- **Premier logo** : la route `/` enveloppe `HomePage` dans un **SplashScreen** qui affiche le logo Teliya pendant une durée minimale (minMs 1200 ms + extraHoldMs 900 ms + preload + maxMs 3600 ms).
- **Deuxième logo** : une fois le splash masqué, **HomePage** s’affiche avec son **Header**, qui affiche à nouveau le logo (Firestore `platform/settings` ou fallback `teliya-logo.jpg`).
- Résultat : même logo perçu deux fois de suite.

### 3. Blank pendant le lazy load de la home

- `HomePage` est chargé en **lazy** (`lazy(() => import("./modules/plateforme/pages/HomePage"))`).
- Le **Suspense** des routes a pour fallback sur la home : `isHome ? null : <PageLoader fullScreen />`.
- Donc sur `/`, pendant le téléchargement du chunk de `HomePage`, le fallback est **null** → écran **vide** (ou seulement le fond du SplashScreen selon l’ordre de rendu).
- Cela peut ajouter un délai perçu avant d’afficher le splash.

### 4. Durée volontairement longue du SplashScreen

- Dans `AppRoutes.tsx`, le SplashScreen est configuré avec :
  - `minMs={1200}`
  - `maxMs={3600}`
  - `extraHoldMs={900}`
- Plus le **preload** d’images (hero-fallback, partenaires, etc.).
- L’utilisateur attend donc au minimum ~2,1 s (1200 + 900) avant de voir le contenu, même si tout est déjà prêt.

---

## Corrections apportées

1. **Ne plus bloquer le premier rendu sur `initFirebase()`**  
   - Afficher immédiatement un écran de bootstrap (fond orange + spinner, **sans logo**).
   - Lancer `initFirebase()` en parallèle ; une fois terminé, monter l’app complète (`App` avec `AuthProvider` + routes).

2. **Un seul logo à l’écran**  
   - Supprimer le **SplashScreen avec logo** sur la route `/`.
   - La route `/` rend directement `<HomePage />`.
   - Le fallback Suspense pour la home utilise le même **écran de bootstrap** (orange + spinner, sans logo).
   - Le logo n’apparaît plus qu’une fois : dans le **Header** de la home une fois `HomePage` monté.

3. **Fallback cohérent pour la home**  
   - Tant que le chunk de `HomePage` n’est pas chargé, afficher le même écran de bootstrap (pas de fallback `null`), pour éviter un écran blanc.

4. **Réduction du temps perçu**  
   - Premier paint immédiat (bootstrap).
   - Plus d’attente artificielle minMs/maxMs/extraHoldMs sur `/`.
   - Contenu (home + logo dans le header) affiché dès que Firebase est prêt et que le chunk HomePage est chargé.

---

## Fichiers modifiés

- `src/shared/ui/BootstrapScreen.tsx` (nouveau) : écran unique orange + spinner, sans logo.
- `src/index.tsx` : rendu initial = BootstrapScreen ; après `initFirebase()`, rendu de l’app complète.
- `src/AppRoutes.tsx` : route `/` = `<HomePage />` sans SplashScreen ; fallback Suspense pour isHome = `<BootstrapScreen />`.

---

## Résumé

| Avant | Après |
|-------|--------|
| Écran blanc jusqu’à init Firebase | Premier affichage immédiat (bootstrap orange + spinner) |
| Logo dans le splash puis logo dans le header | Un seul logo (dans le header) |
| Fallback null sur `/` pendant lazy load | Fallback = BootstrapScreen (pas de blanc) |
| Durée minimale splash 2,1 s + preload | Pas de splash avec logo ; contenu dès que prêt |
