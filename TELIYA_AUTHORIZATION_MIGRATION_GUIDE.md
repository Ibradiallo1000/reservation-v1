# TELIYA — Guide de migration des autorisations frontend

1. Normaliser toute valeur externe avec `normalizeRole`; ne jamais fournir de rôle par défaut.
2. Résoudre les anciennes valeurs contextuelles comme `comptable` à la frontière invitation/profil, puis normaliser.
3. Utiliser `hasCapability` pour les nouveaux liens et actions sensibles non gelés.
4. Déclarer les routes protégées dans `ROUTE_AUTHORIZATIONS` et appliquer le contexte correspondant dans `PrivateRoute`/`ProtectedRoute`.
5. Utiliser `getDefaultRouteForRole` pour toute redirection post-connexion; traiter chaque statut non `ok` explicitement.
6. Conserver un alias de route sous la même capacité, le même contexte et le même feature flag que sa route canonique.
7. Ne jamais déduire automatiquement la première compagnie ou agence.
8. Ne pas modifier les composants métier gelés pour migrer une condition visuelle.

Compatibilité temporaire : `src/constants/roles.ts`, `src/constants/routePermissions.ts` et `src/roles-permissions.ts` restent des façades historiques. Les nouvelles décisions doivent dépendre de `src/authorization`.

