import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";

type PendingExpenseStatus = "pending_manager" | "pending_accountant" | "pending_ceo";

function getRolePendingStatuses(role?: string | null): PendingExpenseStatus[] {
  const normalizedRole = String(role ?? "").trim();

  if (normalizedRole === "agency_manager" || normalizedRole === "chefAgence") {
    return ["pending_manager"];
  }
  if (normalizedRole === "company_accountant" || normalizedRole === "financial_director") {
    return ["pending_accountant"];
  }
  if (normalizedRole === "admin_compagnie") {
    return ["pending_ceo"];
  }
  return [];
}

export function usePendingExpensesCount(companyId?: string | null, role?: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setCount(0);
      return;
    }
    const statuses = getRolePendingStatuses(role);
    if (statuses.length === 0) {
      setCount(0);
      return;
    }

    const expensesRef = collection(db, "companies", companyId, "expenses");
    const q = query(expensesRef, where("status", "in", statuses));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setCount(snap.size);
      },
      (error) => {
        console.error("[usePendingExpensesCount] Snapshot error:", error);
        setCount(0);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [companyId, role]);

  return count;
}
