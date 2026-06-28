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

export type AgencyCashStatementSource = "financialTransactions" | "legacyLedger";

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
};

