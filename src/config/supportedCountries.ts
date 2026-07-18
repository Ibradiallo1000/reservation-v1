export const SUPPORTED_COUNTRIES = [
  { code: "BJ", name: "Bénin", locale: "fr-BJ", phonePrefix: "+229", currency: "XOF", currencySymbol: "FCFA", timezone: "Africa/Porto-Novo" },
  { code: "BF", name: "Burkina Faso", locale: "fr-BF", phonePrefix: "+226", currency: "XOF", currencySymbol: "FCFA", timezone: "Africa/Ouagadougou" },
  { code: "CV", name: "Cap-Vert", locale: "pt-CV", phonePrefix: "+238", currency: "CVE", currencySymbol: "CVE", timezone: "Atlantic/Cape_Verde" },
  { code: "CI", name: "Côte d'Ivoire", locale: "fr-CI", phonePrefix: "+225", currency: "XOF", currencySymbol: "FCFA", timezone: "Africa/Abidjan" },
  { code: "GM", name: "Gambie", locale: "en-GM", phonePrefix: "+220", currency: "GMD", currencySymbol: "GMD", timezone: "Africa/Banjul" },
  { code: "GH", name: "Ghana", locale: "en-GH", phonePrefix: "+233", currency: "GHS", currencySymbol: "GH₵", timezone: "Africa/Accra" },
  { code: "GN", name: "Guinée", locale: "fr-GN", phonePrefix: "+224", currency: "GNF", currencySymbol: "GNF", timezone: "Africa/Conakry" },
  { code: "GW", name: "Guinée-Bissau", locale: "pt-GW", phonePrefix: "+245", currency: "XOF", currencySymbol: "FCFA", timezone: "Africa/Bissau" },
  { code: "LR", name: "Libéria", locale: "en-LR", phonePrefix: "+231", currency: "LRD", currencySymbol: "LRD", timezone: "Africa/Monrovia" },
  { code: "ML", name: "Mali", locale: "fr-ML", phonePrefix: "+223", currency: "XOF", currencySymbol: "FCFA", timezone: "Africa/Bamako" },
  { code: "MR", name: "Mauritanie", locale: "fr-MR", phonePrefix: "+222", currency: "MRU", currencySymbol: "MRU", timezone: "Africa/Nouakchott" },
  { code: "NE", name: "Niger", locale: "fr-NE", phonePrefix: "+227", currency: "XOF", currencySymbol: "FCFA", timezone: "Africa/Niamey" },
  { code: "NG", name: "Nigéria", locale: "en-NG", phonePrefix: "+234", currency: "NGN", currencySymbol: "₦", timezone: "Africa/Lagos" },
  { code: "SN", name: "Sénégal", locale: "fr-SN", phonePrefix: "+221", currency: "XOF", currencySymbol: "FCFA", timezone: "Africa/Dakar" },
  { code: "SL", name: "Sierra Leone", locale: "en-SL", phonePrefix: "+232", currency: "SLE", currencySymbol: "SLE", timezone: "Africa/Freetown" },
  { code: "TG", name: "Togo", locale: "fr-TG", phonePrefix: "+228", currency: "XOF", currencySymbol: "FCFA", timezone: "Africa/Lome" },
] as const;

export type SupportedCountryCode = (typeof SUPPORTED_COUNTRIES)[number]["code"];
export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

export function normalizeCountryToken(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’'`._-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
    : "";
}

const HISTORICAL_ALIASES: Readonly<Record<string, SupportedCountryCode>> = {
  benin: "BJ", "burkina faso": "BF", "cap vert": "CV", "cape verde": "CV",
  "cote d ivoire": "CI", "ivory coast": "CI", gambie: "GM", gambia: "GM", ghana: "GH",
  guinee: "GN", guinea: "GN", "guinee bissau": "GW", "guinea bissau": "GW",
  liberia: "LR", mali: "ML", "republique du mali": "ML", mauritanie: "MR", mauritania: "MR", niger: "NE",
  nigeria: "NG", senegal: "SN", "sierra leone": "SL", togo: "TG",
};

const COUNTRY_BY_CODE = new Map<SupportedCountryCode, SupportedCountry>(SUPPORTED_COUNTRIES.map((country) => [country.code, country]));

export function isSupportedCountryCode(value: unknown): value is SupportedCountryCode {
  return typeof value === "string" && COUNTRY_BY_CODE.has(value.trim().toUpperCase() as SupportedCountryCode);
}

export function getSupportedCountry(code: SupportedCountryCode): SupportedCountry {
  return COUNTRY_BY_CODE.get(code)!;
}

export type CompanyCountrySource = {
  countryCode?: unknown;
  isoCountryCode?: unknown;
  pays?: unknown;
  country?: unknown;
  countryName?: unknown;
};

/** Canonical fields have priority. Unknown values never receive a fallback country. */
export function resolveCompanyCountryCode(source: CompanyCountrySource): SupportedCountryCode | null {
  for (const raw of [source.countryCode, source.isoCountryCode]) {
    if (isSupportedCountryCode(raw)) return raw.trim().toUpperCase() as SupportedCountryCode;
  }
  for (const raw of [source.pays, source.country, source.countryName]) {
    if (isSupportedCountryCode(raw)) return raw.trim().toUpperCase() as SupportedCountryCode;
    const resolved = HISTORICAL_ALIASES[normalizeCountryToken(raw)];
    if (resolved) return resolved;
  }
  return null;
}

export type CountryBackfillDecision = {
  companyId: string;
  status: "already-canonical" | "proposed" | "unresolved";
  countryCode: SupportedCountryCode | null;
  patch: Readonly<{ countryCode: SupportedCountryCode }> | null;
};

export function buildCountryBackfillPlan(companies: Array<Record<string, unknown>>): CountryBackfillDecision[] {
  return companies.map((company) => {
    const companyId = typeof company.id === "string" ? company.id : "";
    if (isSupportedCountryCode(company.countryCode)) {
      return { companyId, status: "already-canonical", countryCode: company.countryCode.trim().toUpperCase() as SupportedCountryCode, patch: null };
    }
    const countryCode = resolveCompanyCountryCode(company);
    return countryCode
      ? { companyId, status: "proposed", countryCode, patch: Object.freeze({ countryCode }) }
      : { companyId, status: "unresolved", countryCode: null, patch: null };
  });
}
