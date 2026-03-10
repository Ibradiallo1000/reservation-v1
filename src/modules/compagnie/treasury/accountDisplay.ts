type DisplayAccount = {
  id: string;
  accountType: string;
  accountName?: string;
  agencyId?: string | null;
};

type DisplayOptions = {
  agencyNameById?: Record<string, string>;
  companyBankNameById?: Record<string, string>;
};

const COMPANY_BANK_PREFIX = "company_bank_";

export function getCompanyBankDocIdFromAccountId(accountId: string): string | null {
  if (!accountId.startsWith(COMPANY_BANK_PREFIX)) return null;
  return accountId.slice(COMPANY_BANK_PREFIX.length) || null;
}

export function getFinancialAccountDisplayName(account: DisplayAccount, options: DisplayOptions = {}): string {
  const agencyNameById = options.agencyNameById ?? {};
  const companyBankNameById = options.companyBankNameById ?? {};
  const agencyName = account.agencyId ? agencyNameById[account.agencyId] : undefined;

  if (account.accountType === "agency_cash" && agencyName) return `Caisse ${agencyName}`;
  if (account.accountType === "agency_bank" && agencyName) return `Banque ${agencyName}`;
  if ((account.accountType === "mobile_money" || account.accountType === "company_mobile_money") && agencyName) {
    return `Portefeuille mobile ${agencyName}`;
  }
  if (account.accountType === "company_bank") {
    const bankDocId = getCompanyBankDocIdFromAccountId(account.id);
    if (bankDocId && companyBankNameById[bankDocId]) return companyBankNameById[bankDocId];
    return "Banque compagnie";
  }
  if (account.accountType === "company_mobile_money") return "Portefeuille mobile compagnie";
  if (account.accountType === "expense_reserve") return "Réserve dépenses";
  return account.accountName || account.id;
}
