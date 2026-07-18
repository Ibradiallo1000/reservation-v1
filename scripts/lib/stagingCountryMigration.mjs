import { createHash } from "node:crypto";

export const STAGING_PROJECT_ID = "teliya-staging";
export const PRODUCTION_PROJECT_ID = "monbillet-95b77";
export const SUPPORTED_CODES = Object.freeze(["BJ", "BF", "CV", "CI", "GM", "GH", "GN", "GW", "LR", "ML", "MR", "NE", "NG", "SN", "SL", "TG"]);

const aliases = Object.freeze({
  benin: "BJ", "burkina faso": "BF", "cap vert": "CV", "cape verde": "CV",
  "cote d ivoire": "CI", "ivory coast": "CI", gambie: "GM", gambia: "GM", ghana: "GH",
  guinee: "GN", guinea: "GN", "guinee bissau": "GW", "guinea bissau": "GW",
  liberia: "LR", mali: "ML", "republique du mali": "ML", mauritanie: "MR", mauritania: "MR",
  niger: "NE", nigeria: "NG", senegal: "SN", "sierra leone": "SL", togo: "TG",
});

export function normalizeCountryToken(value) {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’'`._-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
    : "";
}

export function normalizeSupportedCode(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return SUPPORTED_CODES.includes(code) ? code : null;
}

export function resolveCountryCode(company) {
  for (const value of [company.countryCode, company.isoCountryCode]) {
    const code = normalizeSupportedCode(value);
    if (code) return code;
  }
  for (const value of [company.pays, company.country, company.countryName]) {
    const code = normalizeSupportedCode(value) ?? aliases[normalizeCountryToken(value)];
    if (code) return code;
  }
  return null;
}

export function assertStagingProject(projectId) {
  if (projectId === PRODUCTION_PROJECT_ID) throw new Error("REFUS ABSOLU: le projet production est interdit.");
  if (projectId !== STAGING_PROJECT_ID) throw new Error(`REFUS: projectId attendu ${STAGING_PROJECT_ID}, reçu ${projectId || "<absent>"}.`);
}

export function buildAuditRow(company, agencies = []) {
  const canonical = normalizeSupportedCode(company.countryCode);
  const resolved = resolveCountryCode(company);
  const agencyCodes = [...new Set(agencies.map(resolveCountryCode).filter(Boolean))].sort();
  const conflicts = [];
  if (company.countryCode && !canonical) conflicts.push("unsupported-canonical-code");
  if (resolved && agencyCodes.some((code) => code !== resolved)) conflicts.push("agency-country-conflict");
  const historical = [company.pays, company.country, company.countryName, company.isoCountryCode].filter((value) => typeof value === "string" && value.trim());
  let action = "missing";
  if (canonical) action = "already-canonical";
  else if (conflicts.length) action = "conflict";
  else if (resolved) action = "safe-to-backfill";
  else if (historical.length) action = "ambiguous";
  return {
    companyId: String(company.id ?? ""),
    publicName: String(company.nom ?? company.name ?? "").trim(),
    canonicalCurrent: canonical,
    historical,
    resolvedCountryCode: resolved,
    confidence: canonical ? "canonical" : resolved && !conflicts.length ? "high" : "none",
    action,
    reason: canonical ? "valid-countryCode" : resolved ? "controlled-historical-alias" : "no-reliable-country",
    anomalies: conflicts,
    context: {
      agencyCountryCodes: agencyCodes,
      currency: String(company.devise ?? company.currency ?? ""),
      timezone: String(company.timezone ?? ""),
      phonePrefix: String(company.phoneCountryCode ?? company.phonePrefix ?? ""),
      paymentMethods: Array.isArray(company.paymentMethods) ? company.paymentMethods.filter((value) => typeof value === "string") : [],
    },
  };
}

export function createMinimalBackup(companies) {
  return companies.map((company) => ({
    id: String(company.id ?? ""), countryCode: company.countryCode ?? null, pays: company.pays ?? null,
    country: company.country ?? null, countryName: company.countryName ?? null,
    isoCountryCode: company.isoCountryCode ?? null, currency: company.currency ?? null, devise: company.devise ?? null,
    timezone: company.timezone ?? null,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateApprovals(approvals, auditRows) {
  const safe = new Map(auditRows.filter((row) => row.action === "safe-to-backfill").map((row) => [row.companyId, row.resolvedCountryCode]));
  const seen = new Set();
  return approvals.map((approval) => {
    const companyId = String(approval.companyId ?? "");
    const countryCode = normalizeSupportedCode(approval.countryCode);
    if (!companyId || !countryCode || seen.has(companyId)) throw new Error(`Approbation invalide ou dupliquée: ${companyId || "<absent>"}.`);
    if (safe.get(companyId) !== countryCode) throw new Error(`Approbation ${companyId}/${countryCode} différente du dry-run sûr.`);
    seen.add(companyId);
    return { companyId, countryCode };
  });
}

export function countAuditActions(auditRows) {
  return auditRows.reduce((counts, row) => ({ ...counts, [row.action]: (counts[row.action] ?? 0) + 1 }), {});
}
