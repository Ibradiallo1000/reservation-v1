export type AgencyCashStatementCategory =
  | "entry"
  | "exit"
  | "expense"
  | "transfer"
  | "validation";

export type AgencyCashStatementFilter =
  | "all"
  | "entries"
  | "exits"
  | "expenses"
  | "transfers"
  | "validations";

export type AgencyCashStatementSource = "financialTransactions" | "legacyLedger" | "comptaEncaissements";

export type AgencyCashStatementRow = {
  id: string;
  date: Date;
  reference: string;
  category: AgencyCashStatementCategory;
  typeLabel: string;
  label: string;
  entry: number;
  exit: number;
  status: string;
  source: AgencyCashStatementSource;
};

export type AgencyCashStatementResult = {
  rows: AgencyCashStatementRow[];
  currentBalance: number;
  currency: string;
  transactionsCapped: boolean;
  legacyCapped: boolean;
  unavailableSources?: string[];
};

export type AgencyCashStatementSummary = {
  totalEntries: number;
  totalExits: number;
  net: number;
  currentBalance: number;
  currency: string;
  rows: AgencyCashStatementRow[];
  transactionsCapped: boolean;
  legacyCapped: boolean;
  unavailableSources?: string[];
};
