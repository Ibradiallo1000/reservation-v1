/**
 * Cash session expenses — deductions from session expected cash.
 * Path: companies/{companyId}/agences/{agencyId}/cashSessionExpenses/{expenseId}
 */

import type { Timestamp } from "firebase/firestore";

export const CASH_SESSION_EXPENSES_COLLECTION = "cashSessionExpenses";

export interface CashSessionExpenseDoc {
  sessionId: string;
  amount: number;
  category: string;
  description: string | null;
  createdBy: string;
  createdAt: Timestamp;
}

export type CashSessionExpenseDocWithId = CashSessionExpenseDoc & { id: string };
