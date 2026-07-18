import { getSupportedCountry, isSupportedCountryCode, normalizeCountryToken, resolveCompanyCountryCode, type SupportedCountryCode } from "@/config/supportedCountries";

export type CountryDiagnosticStatus = "canonical" | "historical-resolvable" | "ambiguous-or-unknown" | "missing";
export type CompanyCountryDiagnostic = {
  companyId: string;
  status: CountryDiagnosticStatus;
  resolvedCountryCode: SupportedCountryCode | null;
  anomalies: string[];
};

/** Pure DEV/Admin diagnostic: callers decide how to display non-sensitive results. */
export function diagnoseCompanyCountry(company: Record<string, unknown>, agencies: Array<Record<string, unknown>> = []): CompanyCountryDiagnostic {
  const companyId = typeof company.id === "string" ? company.id : "";
  const resolvedCountryCode = resolveCompanyCountryCode(company);
  const hasHistoricalValue = [company.pays, company.country, company.countryName, company.isoCountryCode].some((value) => normalizeCountryToken(value));
  const status: CountryDiagnosticStatus = isSupportedCountryCode(company.countryCode)
    ? "canonical"
    : resolvedCountryCode
      ? "historical-resolvable"
      : hasHistoricalValue
        ? "ambiguous-or-unknown"
        : "missing";
  const anomalies: string[] = [];
  if (resolvedCountryCode) {
    const reference = getSupportedCountry(resolvedCountryCode);
    const currency = normalizeCountryToken(company.devise ?? company.currency);
    if (currency && currency !== normalizeCountryToken(reference.currency)) anomalies.push("currency-contradiction");
    const timezone = normalizeCountryToken(company.timezone);
    if (!timezone) anomalies.push("timezone-missing");
    agencies.forEach((agency) => {
      const agencyCode = resolveCompanyCountryCode(agency);
      if (agencyCode && agencyCode !== resolvedCountryCode) anomalies.push("agency-country-contradiction");
    });
  }
  return { companyId, status, resolvedCountryCode, anomalies: [...new Set(anomalies)].sort() };
}
