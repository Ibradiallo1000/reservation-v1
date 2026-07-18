# Backfill pays staging

Statut réel : **non exécuté**. L’identité locale annonce le compte Firebase `dialloibra1000@gmail.com`, mais la liste des projets et le renouvellement OAuth échouent sur TLS; le token doit aussi être réauthentifié après correction du certificat.

L’outil `scripts/staging-country-backfill.mjs` a été préparé avec les garanties suivantes : credentials staging explicites obligatoires, `project_id === teliya-staging`, refus absolu de `monbillet-95b77`, dry-run par défaut, sauvegarde minimale JSON triée et SHA-256, rapport par compagnie, prise en compte des pays agences, application uniquement via `--apply-approved`, batch de 100, patch limité à `countryCode`.

Commandes après rétablissement approuvé :

```text
npm run country:staging:dry-run
node scripts/staging-country-backfill.mjs --apply-approved --approvals=<fichier-validé.json>
```

Le second dry-run et la comparaison sauvegarde/après restent obligatoires. Aucun nombre réel de compagnie, aucune valeur et aucune ambiguïté staging ne sont revendiqués.
