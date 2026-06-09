const STORAGE_KEY = "teliya_public_ticket_wallet_v1";
const MAX_TICKETS = 50;

export type LocalTicketPointer = {
  token: string;
  reservationId?: string;
  companyId?: string;
  agencyId?: string;
  companySlug?: string;
  savedAt: number;
};

export function readLocalTicketPointers(): LocalTicketPointer[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LocalTicketPointer =>
        !!item &&
        typeof item === "object" &&
        typeof (item as LocalTicketPointer).token === "string" &&
        typeof (item as LocalTicketPointer).savedAt === "number"
    );
  } catch {
    return [];
  }
}

export function saveLocalTicketPointer(pointer: Omit<LocalTicketPointer, "savedAt"> & { savedAt?: number }): void {
  if (typeof localStorage === "undefined") return;
  try {
    const next: LocalTicketPointer = {
      ...pointer,
      token: pointer.token.trim(),
      savedAt: pointer.savedAt ?? Date.now(),
    };
    if (!next.token) return;
    const existing = readLocalTicketPointers().filter((item) => item.token !== next.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...existing].slice(0, MAX_TICKETS)));
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

export function extractPublicTicketToken(value: string): string {
  const input = value.trim();
  if (!input) return "";

  try {
    const url = new URL(input);
    return (url.searchParams.get("r") || url.searchParams.get("token") || "").trim();
  } catch {
    const queryMatch = input.match(/[?&](?:r|token)=([^&#]+)/i);
    if (queryMatch?.[1]) return decodeURIComponent(queryMatch[1]).trim();
    return input.replace(/\s+/g, "");
  }
}
