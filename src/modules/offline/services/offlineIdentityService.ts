import { offlineStorageService } from "@/modules/offline/services/offlineStorageService";

const DEVICE_ID_PREFIX = "dev";
const DEVICE_META_KEY = "offline_device_id";

let cachedDeviceId: string | null = null;

function randomPart(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export async function getPersistentDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const marker = `${DEVICE_ID_PREFIX}-${randomPart().slice(0, 20)}`;
  try {
    const existing = await offlineStorageService.getMetaValue(DEVICE_META_KEY);
    if (typeof existing === "string" && existing.trim()) {
      cachedDeviceId = existing;
      return existing;
    }
    await offlineStorageService.setMetaValue(DEVICE_META_KEY, marker);
  } catch {
    // ignore
  }
  cachedDeviceId = marker;
  return marker;
}
