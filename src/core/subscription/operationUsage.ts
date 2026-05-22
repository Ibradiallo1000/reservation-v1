import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

function currentBillingMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function incrementCompanyOperations(companyId: string, count = 1): Promise<void> {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (!companyId || safeCount <= 0) return;

  const companyRef = doc(db, "companies", companyId);
  const month = currentBillingMonth();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(companyRef);
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    const currentUsage = Math.max(0, Number(data.currentMonthOperations ?? 0) || 0);
    const nextUsage = currentUsage + safeCount;

    console.log("INCREMENT operations BEFORE", currentUsage);

    tx.set(
      companyRef,
      {
        currentMonth: month,
        currentOperationsMonth: month,
        currentMonthOperations: nextUsage,
        operationsUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("INCREMENT operations AFTER", nextUsage);
  });
}
