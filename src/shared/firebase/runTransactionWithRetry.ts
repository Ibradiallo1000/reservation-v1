import { type Firestore, runTransaction, type Transaction } from "firebase/firestore";

const RETRYABLE_CODES = new Set([
  "aborted",
  "deadline-exceeded",
  "failed-precondition",
  "resource-exhausted",
  "unavailable",
  "internal",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableTransactionError(e: unknown): boolean {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code ?? "") : "";
  return RETRYABLE_CODES.has(code);
}

/**
 * runTransaction avec retries (réseau instable / contention Firestore).
 * Le rollback est garanti par Firestore si la fonction lève.
 */
export async function runFirestoreTransactionWithRetry(
  db: Firestore,
  updateFunction: (transaction: Transaction) => Promise<void>,
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<void> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
  const baseDelayMs = Math.max(50, options?.baseDelayMs ?? 200);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runTransaction(db, updateFunction);
      return;
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts || !isRetryableTransactionError(e)) throw e;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await sleep(Math.min(delay, 10_000));
    }
  }
  throw lastError;
}
