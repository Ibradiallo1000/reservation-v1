# Standards professionnels — Projet Teliya

Document de référence pour maintenir la qualité et la cohérence du code et des livrables.

---

## 1. Conventions de code

### TypeScript / React
- **Typage :** Pas de `any` sauf cas documenté (ex. données Firestore avant validation). Préférer des types/interfaces explicites.
- **Composants :** Fonctionnels avec hooks ; nommage PascalCase ; un composant par fichier (sauf sous-composants clairement privés).
- **Exports :** Export par défaut pour les pages/composants ; export nommé pour les utilitaires, types et constantes partagés.
- **Imports :** Utiliser l’alias `@/` pour les chemins absolus (`@/utils/...`, `@/modules/...`).

### Nommage
- **Fichiers :** PascalCase pour composants/pages (`ClientMesBilletsPage.tsx`), camelCase pour utilitaires et hooks (`reservationStatusUtils.ts`, `useCompanyTheme.ts`).
- **Variables/fonctions :** camelCase. Constantes « globales » : UPPER_SNAKE_CASE.
- **Types/Interfaces :** PascalCase. Pas de préfixe `I` obligatoire.

### Gestion d’état et effets
- **useEffect :** Dépendances explicites et minimales ; pas d’objet/tableau recréé à chaque render dans les deps (risque de boucle).
- **Transitions de statut (réservations) :** Toujours passer par `updateReservationStatut` ou `buildStatutTransitionPayload` + `arrayUnion` ; pas d’écriture directe sur `statut` sans auditLog.
- **Firestore :** Utiliser `canonicalStatut()` et constantes (`RESERVATION_STATUT_QUERY_BOARDABLE`, etc.) pour les requêtes et comparaisons de statut.

---

## 2. Git et livraison

### Messages de commit
- Format court : `type: description` (ex. `fix: loading infini ReceiptEnLignePage`).
- Types recommandés : `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
- Éviter les messages vagues (« fix », « update ») ; préciser le fichier ou le flux concerné.

### Branches
- `main` (ou `master`) : livrable stable.
- Branches de feature : `feat/nom-court` ou `fix/nom-court`.
- Pas de commit direct sur `main` en équipe ; privilégier des merges après revue.

### Avant déploiement
- Vérifier que le build passe : `npm run build`.
- Vérifier les lints sur les fichiers modifiés.
- Tester les flux critiques (réservation, guichet, embarquement, reçu) si la PR touche ces zones.

---

## 3. Environnement et outils

### Développement
- **StrictMode :** Activé en dev ; les effets sont exécutés deux fois volontairement. Ne pas s’appuyer sur un seul passage pour la logique métier.
- **Service Worker :** Désenregistré au chargement en dev (`index.tsx`) pour éviter les rechargements intempestifs. En production, les mises à jour passent par la bannière « Nouvelle version » (action utilisateur).
- **Firestore :** Émulateurs optionnels ; config dans `firebaseConfig` / `.env`.

### Production
- Pas de `console.log` de debug laissés en production ; utiliser un logger conditionnel si besoin.
- Variables sensibles (clés API, secrets) uniquement via variables d’environnement (ex. `VITE_*` pour Vite).

---

## 4. Qualité et maintenabilité

### Tests
- Cibler en priorité : services de statut, génération de référence billet, règles métier partagées.
- Documenter les cas limites (ex. fallback référence, expiration 30 j) dans les audits ou le plan de test.

### Documentation
- Les décisions importantes et audits sont dans `docs/` (ex. `AUDIT-PHASE-C-...`, `PHASE-B-VERROUILLAGE-FINAL.md`).
- Commenter le « pourquoi » plutôt que le « quoi » pour les règles métier (ex. Phase B, transitions de statut).

### Accessibilité et UX
- Boutons et liens avec `aria-label` si le libellé seul ne suffit pas.
- Contraste des couleurs (primary/secondary) vérifié (ex. `safeTextColor` pour le texte sur fond coloré).

---

## 5. Sécurité et données

- Aucune clé API ou secret en dur dans le code.
- Règles Firestore alignées avec les rôles (guichetier, chef, comptable, contrôleur) ; pas de contournement côté client.
- Données utilisateur (téléphone, nom) affichées uniquement dans les contextes autorisés (rôle, compagnie/agence).

---

*Document vivant : à mettre à jour lors de l’évolution des conventions d’équipe ou du projet.*
