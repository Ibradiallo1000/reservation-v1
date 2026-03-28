import { createGuichetReservation } from "@/modules/agence/services/guichetReservationService";
import { createShipment } from "@/modules/logistics/services/createShipment";
import { offlineStorageService } from "@/modules/offline/services/offlineStorageService";
import type {
  OfflineSyncServerResult,
  OfflineTransaction,
  OfflineTransactionPayloadMap,
} from "@/modules/offline/types/offlineTransaction";

type SyncListener = (summary: {
  running: boolean;
  processed: number;
  succeeded: number;
  conflicted: number;
  failed: number;
}) => void;

let running = false;
let timerId: number | null = null;
let onlineHandler: (() => void) | null = null;
const listeners = new Set<SyncListener>();
const SYNC_INTERVAL_MS = 20_000;

function notify(summary: {
  running: boolean;
  processed: number;
  succeeded: number;
  conflicted: number;
  failed: number;
}) {
  listeners.forEach((l) => l(summary));
}

function isNetworkError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const msg = String((error as { message?: string })?.message ?? "");
  return (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    /network|offline|unavailable|timeout|failed-precondition/i.test(msg)
  );
}

function classifyServerResult(error: unknown): OfflineSyncServerResult {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "Erreur serveur");
  if (/place|seat|already|duplicate|exists|conflit|conflict/i.test(message)) {
    return { status: "conflict", message };
  }
  if (code === "permission-denied" || code === "unauthenticated") {
    return { status: "rejected", message };
  }
  if (/invalid|inactive|closed|verrouill|obligatoire/i.test(message)) {
    return { status: "rejected", message };
  }
  return { status: "rejected", message };
}

async function sendOne(tx: OfflineTransaction): Promise<OfflineSyncServerResult> {
  if (tx.type === "guichet_sale") {
    const payload = tx.payload as OfflineTransactionPayloadMap["guichet_sale"];
    const serverId = await createGuichetReservation(
      payload.params,
      payload.deviceFingerprint ? { deviceFingerprint: payload.deviceFingerprint } : undefined
    );
    return { status: "success", serverId };
  }
  if (tx.type === "courier_shipment") {
    const payload = tx.payload as OfflineTransactionPayloadMap["courier_shipment"];
    const out = await createShipment(payload.params);
    return { status: "success", serverId: out.shipmentId };
  }
  return { status: "rejected", message: "Type de transaction non supporté" };
}

async function processQueue(): Promise<{
  processed: number;
  succeeded: number;
  conflicted: number;
  failed: number;
}> {
  const pending = await offlineStorageService.getPendingTransactions();
  let processed = 0;
  let succeeded = 0;
  let conflicted = 0;
  let failed = 0;
  for (const tx of pending) {
    processed += 1;
    try {
      const res = await sendOne(tx);
      if (res.status === "success") {
        succeeded += 1;
        await offlineStorageService.markAsSynced(tx.transactionId, res.serverId, res.message);
      } else if (res.status === "conflict") {
        conflicted += 1;
        await offlineStorageService.markAsConflict(tx.transactionId, res.message);
      } else {
        failed += 1;
        await offlineStorageService.markAsFailed(tx.transactionId, res.message);
      }
    } catch (e) {
      if (isNetworkError(e)) {
        await offlineStorageService.markAsRetry(tx.transactionId, String((e as { message?: string })?.message ?? "Réseau indisponible"));
      } else {
        const classified = classifyServerResult(e);
        if (classified.status === "conflict") {
          conflicted += 1;
          await offlineStorageService.markAsConflict(tx.transactionId, classified.message);
        } else {
          failed += 1;
          await offlineStorageService.markAsFailed(tx.transactionId, classified.message);
        }
      }
    }
  }
  return { processed, succeeded, conflicted, failed };
}

export const offlineSyncService = {
  subscribe(listener: SyncListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async forceSync() {
    if (running) return { processed: 0, succeeded: 0, conflicted: 0, failed: 0 };
    running = true;
    notify({ running: true, processed: 0, succeeded: 0, conflicted: 0, failed: 0 });
    try {
      const out = await processQueue();
      notify({ running: false, ...out });
      return out;
    } finally {
      running = false;
    }
  },

  start() {
    if (timerId != null) return;
    const tick = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void this.forceSync();
    };
    timerId = window.setInterval(tick, SYNC_INTERVAL_MS);
    onlineHandler = tick;
    window.addEventListener("online", onlineHandler);
    tick();
  },

  stop() {
    if (timerId != null) {
      window.clearInterval(timerId);
      timerId = null;
    }
    if (onlineHandler) {
      window.removeEventListener("online", onlineHandler);
      onlineHandler = null;
    }
  },
};
