/**
 * Tenant resolver for multi-tenant SaaS.
 * Resolves tenant from:
 * 1) Subdomain: <slug>.teliya.app → slug → companyId + company data
 * 2) Custom domain: companydomain.com → Firestore companies where customDomain == hostname
 * Application logic should use companyId for Firestore paths (companies/{companyId}/...).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Company } from "@/types/companyTypes";

const PUBLIC_APP_DOMAIN = "teliya.app";
const PUBLIC_APP_DOMAIN_LOCALHOST = "localhost";

const CUSTOM_DOMAIN_CACHE_PREFIX = "domain:";

export type TenantResolution = {
  companyId: string;
  companyData: Company;
};

const memoryCache = new Map<
  string,
  { companyId: string; companyData: Company }
>();

/**
 * True if the hostname is a known app subdomain (*.teliya.app or *.localhost), not the main domain.
 */
function isAppSubdomain(host: string): boolean {
  if (
    host.endsWith("." + PUBLIC_APP_DOMAIN) &&
    host !== PUBLIC_APP_DOMAIN &&
    host !== "www." + PUBLIC_APP_DOMAIN
  ) {
    return true;
  }
  if (
    host.endsWith("." + PUBLIC_APP_DOMAIN_LOCALHOST) &&
    host !== PUBLIC_APP_DOMAIN_LOCALHOST
  ) {
    return true;
  }
  return false;
}

/**
 * Extracts the tenant slug from the current hostname (subdomain).
 * e.g. mali-trans.teliya.app → "mali-trans", mali-trans.localhost → "mali-trans"
 * Returns null if not in subdomain mode (e.g. on teliya.app or custom domain).
 */
export function getSlugFromHostname(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (
    host.endsWith("." + PUBLIC_APP_DOMAIN) &&
    host !== PUBLIC_APP_DOMAIN
  ) {
    const sub = host.split(".")[0];
    return sub && sub.length > 0 ? sub : null;
  }
  if (
    host.endsWith("." + PUBLIC_APP_DOMAIN_LOCALHOST) &&
    host !== PUBLIC_APP_DOMAIN_LOCALHOST
  ) {
    const sub = host.split(".")[0];
    return sub && sub.length > 0 ? sub : null;
  }
  return null;
}

/**
 * Returns whether the current hostname is a custom domain (not *.teliya.app / *.localhost).
 * Use when you need to branch logic for custom domain vs subdomain.
 */
export function isCustomDomainHost(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")).toLowerCase();
  if (!host) return false;
  if (host === PUBLIC_APP_DOMAIN || host === "www." + PUBLIC_APP_DOMAIN) return false;
  if (host.endsWith("." + PUBLIC_APP_DOMAIN)) return false;
  if (host === PUBLIC_APP_DOMAIN_LOCALHOST || host.endsWith("." + PUBLIC_APP_DOMAIN_LOCALHOST)) return false;
  return true;
}

function normalizeCompanyDoc(
  id: string,
  slug: string,
  raw: Record<string, unknown>
): Company {
  const footer = raw.footerConfig as { customLinks?: unknown[] } | undefined;
  const customLinks = Array.isArray(footer?.customLinks)
    ? footer.customLinks.map((l: unknown) => ({
        label: (l as { label?: string })?.label ?? "Lien",
        url: (l as { url?: string })?.url ?? "#",
        external: !!(l as { external?: boolean })?.external,
      }))
    : [];
  return {
    id,
    slug,
    nom: (raw.nom as string) ?? "Compagnie",
    themeStyle: (raw.themeStyle as string) ?? "clair",
    imagesSlider: Array.isArray(raw.imagesSlider) ? raw.imagesSlider : [],
    footerConfig: { customLinks },
    ...raw,
  } as Company;
}

/**
 * Resolves tenant by slug (subdomain or explicit slug). Uses cache key = slug (lowercase).
 */
async function resolveBySlug(slug: string): Promise<TenantResolution | null> {
  const key = slug.trim().toLowerCase();
  const cached = memoryCache.get(key);
  if (cached) return cached;

  const companiesRef = collection(db, "companies");
  const bySlugQ = query(companiesRef, where("slug", "==", slug.trim()));
  const bySlugSnap = await getDocs(bySlugQ);

  let companyId: string | null = null;
  let raw: Record<string, unknown> | null = null;

  if (!bySlugSnap.empty) {
    const docSnap = bySlugSnap.docs[0];
    companyId = docSnap.id;
    raw = docSnap.data() as Record<string, unknown>;
  } else {
    const byIdSnap = await getDoc(doc(db, "companies", slug.trim()));
    if (byIdSnap.exists()) {
      companyId = byIdSnap.id;
      raw = byIdSnap.data() as Record<string, unknown>;
    }
  }

  if (!companyId || !raw) return null;

  const companyData = normalizeCompanyDoc(companyId, slug.trim(), raw);
  const resolution: TenantResolution = { companyId, companyData };
  memoryCache.set(key, resolution);
  return resolution;
}

/**
 * Resolves tenant by custom domain (hostname).
 * Queries companies where customDomain == hostname (lowercase). Store customDomain in lowercase in Firestore for consistent matching.
 */
async function resolveByCustomDomain(hostname: string): Promise<TenantResolution | null> {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return null;
  const key = CUSTOM_DOMAIN_CACHE_PREFIX + normalized;
  const cached = memoryCache.get(key);
  if (cached) return cached;

  const companiesRef = collection(db, "companies");
  const q = query(companiesRef, where("customDomain", "==", normalized));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  const companyId = docSnap.id;
  const raw = docSnap.data() as Record<string, unknown>;
  const slug = (raw.slug as string) ?? companyId;
  const companyData = normalizeCompanyDoc(companyId, slug, raw);
  const resolution: TenantResolution = { companyId, companyData };
  memoryCache.set(key, resolution);
  return resolution;
}

/**
 * Resolves tenant to companyId and company data.
 * - If slug is provided: resolve by slug (subdomain or explicit).
 * - If no slug and in browser: if hostname is *.teliya.app / *.localhost → resolve by extracted slug.
 *   Else if hostname looks like a custom domain → query companies where customDomain == hostname.
 * Uses in-memory cache.
 *
 * @param slug - Optional. Tenant slug (e.g. "mali-trans"). If omitted, hostname is used (subdomain or customDomain).
 * @returns Promise of { companyId, companyData } or null if not found
 */
export async function resolveTenant(
  slug?: string | null
): Promise<TenantResolution | null> {
  if (slug != null && slug.trim()) {
    return resolveBySlug(slug.trim());
  }

  if (typeof window === "undefined") return null;
  const host = window.location.hostname;

  if (isAppSubdomain(host)) {
    const subdomainSlug = getSlugFromHostname();
    return subdomainSlug ? resolveBySlug(subdomainSlug) : null;
  }

  if (isCustomDomainHost(host)) {
    return resolveByCustomDomain(host);
  }

  return null;
}

/**
 * Returns cached tenant for slug if present. Does not query Firestore.
 */
export function getCachedTenant(slug: string | null): TenantResolution | null {
  if (!slug || !slug.trim()) return null;
  return memoryCache.get(slug.trim().toLowerCase()) ?? null;
}

/**
 * Returns cached tenant for custom domain hostname if present. Does not query Firestore.
 */
export function getCachedTenantByHostname(hostname: string | null): TenantResolution | null {
  if (!hostname || !hostname.trim()) return null;
  const key = CUSTOM_DOMAIN_CACHE_PREFIX + hostname.trim().toLowerCase();
  return memoryCache.get(key) ?? null;
}

/**
 * Invalidates cache for a slug (e.g. after company update).
 * Pass no argument to clear entire cache.
 */
export function invalidateTenantCache(slug?: string): void {
  if (slug === undefined) {
    memoryCache.clear();
    return;
  }
  memoryCache.delete(slug.trim().toLowerCase());
}

/**
 * Invalidates cache for a custom domain (e.g. after company customDomain update).
 */
export function invalidateTenantCacheByDomain(hostname?: string): void {
  if (!hostname || !hostname.trim()) return;
  memoryCache.delete(CUSTOM_DOMAIN_CACHE_PREFIX + hostname.trim().toLowerCase());
}
