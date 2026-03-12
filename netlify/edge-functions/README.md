# Edge Functions

## redirect-www-subdomain

**Canonical URL redirects (301)** so company pages always use `https://<slug>.teliya.app`:

1. **Path → subdomain:** `teliya.app/mali-trans` or `teliya.app/mali-trans/booking` → `https://mali-trans.teliya.app/` or `https://mali-trans.teliya.app/booking`
2. **Strip www:** `www.<slug>.teliya.app` → `<slug>.teliya.app` (path and query preserved)

Reserved first path segments (no redirect): `login`, `register`, `admin`, `agence`, `villes`, `compagnie`, `resultats`, `accept-invitation`, etc.

- **Declared in:** `netlify.toml` (runs on `/*` before other rules).
- **No React or app code changes.**

### DNS requirement (for www redirect)

For `www.<slug>.teliya.app` to redirect, that hostname must resolve to Netlify (e.g. CNAME `*.*.teliya.app` or equivalent at your DNS provider). `teliya.app/<slug>` works as soon as the main site is on Netlify.
