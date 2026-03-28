/**
 * Offline boarding queue stored in IndexedDB.
 * When the agent scans offline, events are queued and replayed when connection returns.
 * Sync calls the same updateStatut() so boardingLocks and validation are respected.
 */

const DB_NAME = "BoardingOfflineDB";
const DB_VERSION = 1;
const STORE_NAME = "boardingQueue";

export interface BoardingQueueRecord {
  id?: number;
  reservationId: string;
  agencyId: string;
  companyId: string;
  tripId: string | null;
  date: string;
  heure: string | null;
  /** Phase 3.5 — alignement sync sur tripAssignment après retour en ligne. */
  assignmentId?: string;
  vehicleId?: string;
  assignmentStatus?: "planned" | "validated";
  scannedAt: number;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("synced", "synced", { unique: false });
      }
    };
  });
}

export async function addToBoardingQueue(record: Omit<BoardingQueueRecord, "id" | "scannedAt" | "synced">): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const doc: BoardingQueueRecord = {
      ...record,
      scannedAt: Date.now(),
      synced: false,
    };
    const req = store.add(doc);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

export async function getUnsyncedBoardingQueue(): Promise<BoardingQueueRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const all = (req.result as BoardingQueueRecord[]) || [];
      resolve(all.filter((r) => r.synced === false));
    };
    tx.oncomplete = () => db.close();
  });
}

export async function markBoardingQueueSynced(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onerror = () => reject(getReq.error);
    getReq.onsuccess = () => {
      const record = getReq.result as BoardingQueueRecord | undefined;
      if (!record) {
        db.close();
        return resolve();
      }
      record.synced = true;
      const putReq = store.put(record);
      putReq.onerror = () => reject(putReq.error);
      putReq.onsuccess = () => resolve();
    };
    tx.oncomplete = () => db.close();
  });
}
