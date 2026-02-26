// Phase C — Financial position engine. Pure; no Firestore.
export interface AccountSnapshot {
  id: string;
  agencyId: string | null;
  accountType: string;
  currentBalance: number;
}

export interface PayableSnapshot {
  id: string;
  agencyId: string;
  remainingAmount: number;
  status: string;
}

export interface CompanyCashPositionResult {
  totalBank: number;
  totalMobileMoney: number;
  totalAgencyCash: number;
  totalPayables: number;
  netPosition: number;
  byAgency?: { agencyId: string; cash: number; payables: number; net: number }[];
}

export function calculateCompanyCashPosition(
  accounts: AccountSnapshot[],
  payables: PayableSnapshot[]
): CompanyCashPositionResult {
  let totalBank = 0;
  let totalMobileMoney = 0;
  let totalAgencyCash = 0;
  // Phase C2: Only net balances; internal transfers do not inflate (debit one, credit another).
  for (const a of accounts) {
    const balance = Number(a.currentBalance) || 0;
    if (a.accountType === "company_bank" || a.accountType === "agency_bank") totalBank += balance;
    else if (a.accountType === "company_mobile_money" || a.accountType === "mobile_money") totalMobileMoney += balance;
    else if (a.accountType === "agency_cash") totalAgencyCash += balance;
  }
  const totalPayables = payables.reduce((s, p) => s + (Number(p.remainingAmount) || 0), 0);
  const netPosition = totalBank + totalMobileMoney + totalAgencyCash - totalPayables;
  const agencyCashMap = new Map<string, number>();
  const agencyPayablesMap = new Map<string, number>();
  for (const a of accounts) {
    if (a.accountType === "agency_cash" && a.agencyId)
      agencyCashMap.set(a.agencyId, (agencyCashMap.get(a.agencyId) ?? 0) + (Number(a.currentBalance) || 0));
  }
  for (const p of payables) {
    const aid = p.agencyId ?? "";
    if (aid) agencyPayablesMap.set(aid, (agencyPayablesMap.get(aid) ?? 0) + (Number(p.remainingAmount) || 0));
  }
  const agencyIds = new Set([...agencyCashMap.keys(), ...agencyPayablesMap.keys()]);
  const byAgency = Array.from(agencyIds).map((agencyId) => {
    const cash = agencyCashMap.get(agencyId) ?? 0;
    const payablesSum = agencyPayablesMap.get(agencyId) ?? 0;
    return { agencyId, cash, payables: payablesSum, net: cash - payablesSum };
  });
  return {
    totalBank,
    totalMobileMoney,
    totalAgencyCash,
    totalPayables,
    netPosition,
    byAgency,
  };
}

export function calculateAgencyExposure(payables: PayableSnapshot[], agencyId: string): number {
  return payables
    .filter((p) => (p.agencyId ?? "") === agencyId)
    .reduce((s, p) => s + (Number(p.remainingAmount) || 0), 0);
}
