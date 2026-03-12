/**
 * Canonical URL redirect for company pages.
 * Canonical form: https://:slug.teliya.app
 * Non-canonical: https://teliya.app/:slug or https://www.teliya.app/:slug
 *
 * When the app is loaded on the main domain with a company slug as first path segment,
 * redirect to the subdomain form (301-style via replace). Used as client-side fallback
 * when the Netlify Edge Function does not run (e.g. dev server).
 */

const MAIN_DOMAIN = "teliya.app";

/** First path segment that are platform routes, not company slugs. Must match edge function list. */
const RESERVED_FIRST_SEGMENTS = new Set([
  "login",
  "register",
  "admin",
  "agence",
  "villes",
  "reservation",
  "contact",
  "compagnie",
  "resultats",
  "accept-invitation",
  "role-landing",
  "debug-auth",
  "mes-reservations",
  "manifest.webmanifest",
]);

/**
 * If the current URL is teliya.app/:slug (or www.teliya.app/:slug) and :slug is not reserved,
 * redirect to https://:slug.teliya.app/... (path and query preserved).
 * No-op if already on a subdomain or if first segment is reserved.
 */
export function redirectToCanonicalIfNeeded(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, pathname, search } = window.location;
  if (hostname !== MAIN_DOMAIN && hostname !== `www.${MAIN_DOMAIN}`) return false;
  const segments = pathname.split("/").filter(Boolean);
  const slug = segments[0]?.toLowerCase();
  if (!slug || RESERVED_FIRST_SEGMENTS.has(slug)) return false;
  const restPath = segments.length > 1 ? "/" + segments.slice(1).join("/") : "/";
  const canonical = `https://${slug}.${MAIN_DOMAIN}${restPath}${search}`;
  window.location.replace(canonical);
  return true;
}
