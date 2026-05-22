// src/utils/firestoreErrorHandler.ts
let lastShown = 0;

/** Determine whether an error is a Firestore composite-index error. */
export function isFirestoreIndexError(err: unknown): boolean {
  const raw = err as { code?: string; message?: string };
  const msg = String(raw?.message ?? "");
  return raw?.code === "failed-precondition" && msg.includes("create_index");
}

/** Extract Firestore index creation URL from error message (for Copy button / UI). */
export function parseIndexUrlFromError(err: unknown): string | null {
  const raw = err as { message?: string; stack?: string };
  const text = typeof err === "string" ? err : String(raw?.message || raw?.stack || "");
  const match = text.match(/https?:\/\/[^\s"]*indexes[^\s"]*/i);
  if (!match?.[0]) return null;
  return match[0].replace(/[)\].,;]+$/g, "");
}

/** Non-blocking handler: logs the index URL so devs can open it from the console. */
export function handleFirestoreError(err: unknown) {
  // Anti-spam (évite de flooder la console si plusieurs composants déclenchent l’erreur)
  const now = Date.now();
  if (now - lastShown < 2000) return;
  lastShown = now;

  const url = parseIndexUrlFromError(err);

  // eslint-disable-next-line no-console
  console.error("FIRESTORE INDEX REQUIRED:", err);
  // eslint-disable-next-line no-console
  console.error("INDEX URL:", url || "(aucun lien détecté)");
}

