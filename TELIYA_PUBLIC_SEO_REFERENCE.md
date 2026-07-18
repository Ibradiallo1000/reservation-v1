# Teliya — Référence SEO publique

## Marketplace `/`

- titre : `Teliya — Comparez et réservez votre trajet`
- description : recherche, comparaison et poursuite de réservation
- canonical : `https://teliya.app/`
- OpenGraph : titre, description, type et URL
- Twitter : `summary_large_image`, titre et description

## Landing `/landing`

- titre et description marketing dédiés
- canonical : `https://teliya.app/landing`
- même socle OpenGraph/Twitter, mis à jour côté client

## Exploration

`public/robots.txt` autorise l’exploration et référence `public/sitemap.xml`. Le sitemap contient uniquement les pages stables et indexables `/` et `/landing`; les résultats paramétrés et les tunnels ne sont pas listés.

## Règles

Les pages tenant gardent leur résolution canonique par sous-domaine ou domaine personnalisé. Les balises dynamiques ne publient aucune donnée sensible et n’altèrent pas le routage.

