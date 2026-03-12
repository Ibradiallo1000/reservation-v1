export type PhoneCountryRule = {
  countryCode: string;
  callingCode: string;
  localLength: number;
  label: string;
};

const RULES: Record<string, PhoneCountryRule> = {
  ML: { countryCode: "ML", callingCode: "223", localLength: 8, label: "Mali" },
  SN: { countryCode: "SN", callingCode: "221", localLength: 9, label: "Sénégal" },
  CI: { countryCode: "CI", callingCode: "225", localLength: 10, label: "Côte d'Ivoire" },
  BF: { countryCode: "BF", callingCode: "226", localLength: 8, label: "Burkina Faso" },
  GN: { countryCode: "GN", callingCode: "224", localLength: 9, label: "Guinée" },
  TG: { countryCode: "TG", callingCode: "228", localLength: 8, label: "Togo" },
  BJ: { countryCode: "BJ", callingCode: "229", localLength: 8, label: "Bénin" },
  NE: { countryCode: "NE", callingCode: "227", localLength: 8, label: "Niger" },
};

const DEFAULT_RULE = RULES.ML;

export function getPhoneRuleFromCountry(countryRaw?: string | null): PhoneCountryRule {
  const value = String(countryRaw ?? "").trim().toLowerCase();
  if (!value) return DEFAULT_RULE;
  if (value === "ml" || value.includes("mali")) return RULES.ML;
  if (value === "sn" || value.includes("senegal") || value.includes("sénégal")) return RULES.SN;
  if (value === "ci" || value.includes("ivoire")) return RULES.CI;
  if (value === "bf" || value.includes("burkina")) return RULES.BF;
  if (value === "gn" || value.includes("guinee") || value.includes("guinée")) return RULES.GN;
  if (value === "tg" || value.includes("togo")) return RULES.TG;
  if (value === "bj" || value.includes("benin") || value.includes("bénin")) return RULES.BJ;
  if (value === "ne" || value.includes("niger")) return RULES.NE;
  return DEFAULT_RULE;
}

export function sanitizeLocalPhone(input: string, rule: PhoneCountryRule): string {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.startsWith("00" + rule.callingCode)) digits = digits.slice(2 + rule.callingCode.length);
  if (digits.startsWith(rule.callingCode)) digits = digits.slice(rule.callingCode.length);
  if (digits.startsWith("0") && digits.length === rule.localLength + 1) digits = digits.slice(1);
  return digits.slice(0, rule.localLength);
}

export function isValidLocalPhone(input: string, rule: PhoneCountryRule): boolean {
  if (!input) return false;
  return sanitizeLocalPhone(input, rule).length === rule.localLength;
}
