# Teliya — Réservation de billets

Application de réservation de billets (guichet et en ligne), embarquement et suivi des réservations pour compagnies de transport.

## Stack

- **Front :** React 18, TypeScript, Vite, React Router, Tailwind CSS, Firestore
- **Auth :** Firebase Authentication
- **Données :** Cloud Firestore
- **Déploiement :** Netlify (build + PWA optionnelle)

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:5173](http://localhost:5173).

## Scripts principaux

| Commande        | Description              |
|-----------------|--------------------------|
| `npm run dev`   | Serveur de développement |
| `npm run build` | Build de production      |
| `npm run preview` | Prévisualisation du build |

## Structure clé

- `src/App.tsx` — Point d’entrée de l’app (AuthProvider, AppRoutes)
- `src/AppRoutes.tsx` — Définition des routes (public, agence, compagnie, plateforme)
- `src/modules/` — Modules métier (agence, compagnie, plateforme, auth, etc.)
- `src/utils/` — Utilitaires partagés (statuts réservation, référence billet, etc.)
- `docs/` — Audits, plans de test et standards projet

## Standards et qualité

Les conventions de code, Git, environnement et bonnes pratiques sont décrites dans **`docs/STANDARDS-PROJET.md`**.

## Licence

Projet privé.
