/**
 * Canonical URL redirects (301 permanent) at the edge:
 *
 * 1) Canonical for company pages:
 *    https://teliya.app/:slug or https://www.teliya.app/:slug
 *    → https://:slug.teliya.app (path and query preserved)
 *    Example: https://teliya.app/mali-trans → https://mali-trans.teliya.app
 *
 * 2) Strip www from subdomains:
 *    https://www.:slug.teliya.app → https://:slug.teliya.app
 *
 * Reserved first path segments (e.g. /login, /admin) are not redirected.
 */
import type { Context } from "@netlify/edge-functions";

const MAIN_DOMAIN = "teliya.app";

/** First path segment must not be one of these (platform routes, not company slugs). */
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

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const host = url.hostname;
  const pathname = url.pathname;

  // 1) Canonical: teliya.app/<slug> or www.teliya.app/<slug> → <slug>.teliya.app/... (one hop)
  if (host === MAIN_DOMAIN || host === `www.${MAIN_DOMAIN}`) {
    const segments = pathname.split("/").filter(Boolean);
    const slug = segments[0]?.toLowerCase();
    if (slug && !RESERVED_FIRST_SEGMENTS.has(slug)) {
      const restPath = segments.length > 1 ? "/" + segments.slice(1).join("/") : "/";
      const newUrl = `https://${slug}.teliya.app${restPath}${url.search}`;
      return Response.redirect(newUrl, 301);
    }
  }

  // 2) www.<slug>.teliya.app → <slug>.teliya.app (strip www from subdomains)
  if (host.startsWith("www.") && host.endsWith(".teliya.app")) {
    const newHost = host.slice(4);
    const newUrl = `https://${newHost}${pathname}${url.search}`;
    return Response.redirect(newUrl, 301);
  }

  return context.next();
};
