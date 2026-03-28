/**
 * Snapshot local du créneau d’embarquement (Phase 3.5) — source offline pour assignmentId / vehicleId / trip / date / heure.
 * Clé unique par couple company + agence (dernier créneau chargé).
 */

const STORAGE_KEY_PREFIX = "teliya_boarding_slot_v1";

export type BoardingSlotSnapshotV1 = {
  v: 1;
  companyId: string;
  agencyId: string;
  assignmentId: string;
  vehicleId: string;
  tripId: string;
  /** Pour réafficher le trajet après rechargement hors ligne. */
  departure?: string;
  arrival?: string;
  date: string;
  heure: string;
  assignmentStatus: "planned" | "validated";
  /** Même identifiant que sur tripAssignments.boardingSession.clientInstanceId pour libérer le verrou. */
  clientInstanceId: string;
  savedAt: number;
  /** Capacité véhicule au moment du snapshot (offline). */
  vehicleCapacity?: number | null;
};

function storageKey(companyId: string, agencyId: string): string {
  return `${STORAGE_KEY_PREFIX}:${companyId}:${agencyId}`;
}

function safeRandomId(): string {
  try {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `cid_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Identifiant stable par navigateur (verrou multi-appareils). */
export function getOrCreateBoardingClientInstanceId(): string {
  if (typeof window === "undefined") return safeRandomId();
  const k = "teliya_boarding_client_instance_v1";
  try {
    let id = window.localStorage.getItem(k);
    if (!id || id.length < 8) {
      id = safeRandomId();
      window.localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return safeRandomId();
  }
}

export function persistBoardingSlotSnapshot(s: BoardingSlotSnapshotV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(s.companyId, s.agencyId), JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

export function loadBoardingSlotSnapshot(companyId: string, agencyId: string): BoardingSlotSnapshotV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(companyId, agencyId));
    if (!raw) return null;
    const p = JSON.parse(raw) as BoardingSlotSnapshotV1;
    if (p?.v !== 1 || !p.assignmentId || !p.vehicleId || !p.companyId || !p.agencyId) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearBoardingSlotSnapshot(companyId: string, agencyId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(companyId, agencyId));
  } catch {
    /* ignore */
  }
}

export function snapshotMatchesSelection(
  snap: BoardingSlotSnapshotV1,
  input: {
    companyId: string;
    agencyId: string;
    assignmentId: string;
    date: string;
  }
): boolean {
  return (
    snap.companyId === input.companyId &&
    snap.agencyId === input.agencyId &&
    snap.assignmentId === input.assignmentId &&
    snap.date === input.date
  );
}
