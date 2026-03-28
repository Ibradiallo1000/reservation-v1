import type {
  OfflineTransaction,
  OfflineTransactionStatus,
  SaveOfflineTransactionInput,
} from "@/modules/offline/types/offlineTransaction";

const DB_NAME = "teliya-offline-db";
const DB_VERSION = 1;
const TX_STORE = "transactions";
const META_STORE = "meta";
const COUNTER_KEY = "tx_counter";

type MetaRecord = { key: string; value: string | number };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TX_STORE)) {
        const txStore = db.createObjectStore(TX_STORE, { keyPath: "transactionId" });
        txStore.createIndex("status", "status", { unique: false });
        txStore.createIndex("nextRetryAt", "nextRetryAt", { unique: false });
        txStore.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open error"));
  });
  return dbPromise;
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request error"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  storeName: string,
  fn: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const out = await fn(store);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction error"));
  });
  return out;
}

async function getMetaNumber(key: string, fallback = 0): Promise<number> {
  return withStore("readonly", META_STORE, async (store) => {
    const row = (await idbReq(store.get(key))) as MetaRecord | undefined;
    const value = Number(row?.value);
    return Number.isFinite(value) ? value : fallback;
  });
}

async function setMetaNumber(key: string, value: number): Promise<void> {
  await withStore("readwrite", META_STORE, async (store) => {
    await idbReq(store.put({ key, value } as MetaRecord));
  });
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(31, h) + text.charCodeAt(i);
    h |= 0;
  }
  return `fallback_${Math.abs(h).toString(16)}`;
}

async function nextCounter(): Promise<number> {
  const cur = await getMetaNumber(COUNTER_KEY, 0);
  const nxt = cur + 1;
  await setMetaNumber(COUNTER_KEY, nxt);
  return nxt;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(",")}}`;
}

async function buildTransactionId(deviceId: string): Promise<string> {
  const counter = await nextCounter();
  return `${deviceId}-${Date.now()}-${counter}`;
}

async function updateStatus(
  transactionId: string,
  status: OfflineTransactionStatus,
  opts?: { serverId?: string; message?: string; nextRetryAt?: number; attemptsInc?: boolean }
): Promise<void> {
  await withStore("readwrite", TX_STORE, async (store) => {
    const row = (await idbReq(store.get(transactionId))) as OfflineTransaction | undefined;
    if (!row) return;
    const next: OfflineTransaction = {
      ...row,
      status,
      updatedAt: Date.now(),
      ...(opts?.serverId ? { serverId: opts.serverId } : {}),
      ...(opts?.message ? { lastError: opts.message } : {}),
      ...(opts?.nextRetryAt != null ? { nextRetryAt: opts.nextRetryAt } : {}),
      ...(opts?.attemptsInc ? { attempts: row.attempts + 1 } : {}),
      ...(status === "synced"
        ? { syncMeta: { syncedAt: Date.now(), message: opts?.message } }
        : {}),
    };
    await idbReq(store.put(next));
  });
}

export const offlineStorageService = {
  async generateTransactionId(deviceId: string): Promise<string> {
    return buildTransactionId(deviceId);
  },

  async getMetaValue(key: string): Promise<string | number | null> {
    return withStore("readonly", META_STORE, async (store) => {
      const row = (await idbReq(store.get(key))) as MetaRecord | undefined;
      return row?.value ?? null;
    });
  },

  async setMetaValue(key: string, value: string | number): Promise<void> {
    await withStore("readwrite", META_STORE, async (store) => {
      await idbReq(store.put({ key, value } as MetaRecord));
    });
  },

  async saveTransaction(input: SaveOfflineTransactionInput): Promise<OfflineTransaction> {
    const transactionId = input.transactionId ?? await buildTransactionId(input.deviceId);
    const createdAt = input.createdAt ?? Date.now();
    const payloadFrozen = JSON.parse(JSON.stringify(input.payload));
    const checksum = await sha256Hex(
      `${transactionId}|${input.type}|${input.deviceId}|${input.userId}|${stableStringify(payloadFrozen)}`
    );
    const tx: OfflineTransaction = {
      transactionId,
      type: input.type,
      status: "pending",
      createdAt,
      updatedAt: createdAt,
      deviceId: input.deviceId,
      userId: input.userId,
      payload: payloadFrozen as OfflineTransaction["payload"],
      checksum,
      attempts: 0,
      nextRetryAt: createdAt,
    };
    await withStore("readwrite", TX_STORE, async (store) => {
      await idbReq(store.add(tx));
    });
    return tx;
  },

  async getPendingTransactions(now = Date.now()): Promise<OfflineTransaction[]> {
    return withStore("readonly", TX_STORE, async (store) => {
      const all = (await idbReq(store.getAll())) as OfflineTransaction[];
      return all
        .filter((t) => t.status === "pending" && (t.nextRetryAt ?? 0) <= now)
        .sort((a, b) => a.createdAt - b.createdAt);
    });
  },

  async getAllTransactions(limit = 200): Promise<OfflineTransaction[]> {
    return withStore("readonly", TX_STORE, async (store) => {
      const all = (await idbReq(store.getAll())) as OfflineTransaction[];
      return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    });
  },

  async markAsSynced(transactionId: string, serverId?: string, message?: string): Promise<void> {
    await updateStatus(transactionId, "synced", { serverId, message });
  },

  async markAsFailed(transactionId: string, message?: string): Promise<void> {
    await updateStatus(transactionId, "failed", { message });
  },

  async markAsConflict(transactionId: string, message?: string): Promise<void> {
    await updateStatus(transactionId, "conflict", { message });
  },

  async markAsRetry(transactionId: string, message?: string): Promise<void> {
    await withStore("readwrite", TX_STORE, async (store) => {
      const row = (await idbReq(store.get(transactionId))) as OfflineTransaction | undefined;
      if (!row) return;
      const attempts = row.attempts + 1;
      const backoffMs = Math.min(5 * 60_000, 3_000 * 2 ** Math.max(0, attempts - 1));
      const next: OfflineTransaction = {
        ...row,
        status: "pending",
        updatedAt: Date.now(),
        attempts,
        nextRetryAt: Date.now() + backoffMs,
        ...(message ? { lastError: message } : {}),
      };
      await idbReq(store.put(next));
    });
  },
};
