/** Détection sous-domaine (ex: mali-trans.teliya.app). Partagé pour construire les liens sans prop drilling. */

const PUBLIC_APP_DOMAIN = "teliya.app";
const PUBLIC_APP_DOMAIN_LOCALHOST = "localhost";

export function getSlugFromSubdomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host.endsWith("." + PUBLIC_APP_DOMAIN) && host !== PUBLIC_APP_DOMAIN) {
    const sub = host.split(".")[0];
    return sub && sub.length > 0 ? sub : null;
  }
  if (host.endsWith("." + PUBLIC_APP_DOMAIN_LOCALHOST) && host !== PUBLIC_APP_DOMAIN_LOCALHOST) {
    const sub = host.split(".")[0];
    return sub && sub.length > 0 ? sub : null;
  }
  return null;
}

export function isSubdomainMode(): boolean {
  return getSlugFromSubdomain() != null;
}

/** Base path pour les liens : sous-domaine = "" (lien = /booking), sinon slug (lien = /slug/booking). */
export function getPublicPathBase(slugFromParams: string): string {
  return isSubdomainMode() ? "" : (slugFromParams || "").trim();
}
