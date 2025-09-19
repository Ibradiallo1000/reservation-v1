// Petit cache volatile pour passer la compagnie d'une page à l'autre
export type CachedCompany = any; // ou ton type Company

const cache = new Map<string, CachedCompany>();

export function setCompanyInCache(slug: string, data: CachedCompany) {
  cache.set(slug, data);
}
export function getCompanyFromCache(slug: string) {
  return cache.get(slug);
}
