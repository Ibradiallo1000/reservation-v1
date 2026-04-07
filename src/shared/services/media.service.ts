import {
  collection,
  getDocs,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type MediaItem = {
  id: string;
  url: string;
  nom?: string;
  type?: string;
};

function docToMediaItem(id: string, data: Record<string, unknown>): MediaItem {
  return {
    id,
    url: typeof data.url === "string" ? data.url : "",
    nom: typeof data.nom === "string" ? data.nom : undefined,
    type: typeof data.type === "string" ? data.type : undefined,
  };
}

/**
 * Médias plateforme : collection `medias` (même source que MediaPage / upload plateforme).
 * L’ancienne collection `mediaPlatform` n’est pas déclarée dans firestore.rules → 403 si on la lit.
 */
export async function getPlatformMedia(): Promise<MediaItem[]> {
  const snap = await getDocs(collection(db, "medias"));
  const withTime = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const ca = data.createdAt as Timestamp | undefined;
    const ms = ca && typeof ca.toMillis === "function" ? ca.toMillis() : 0;
    return { ms, item: docToMediaItem(d.id, data) };
  });
  withTime.sort((a, b) => b.ms - a.ms);
  return withTime.map((x) => x.item);
}

/**
 * Fetches company media from Firestore (companies/{companyId}/imagesBibliotheque),
 * ordered by createdAt desc.
 */
export async function getCompanyMedia(companyId: string): Promise<MediaItem[]> {
  const ref = collection(db, "companies", companyId, "imagesBibliotheque");
  const q = query(ref, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToMediaItem(d.id, d.data() as Record<string, unknown>));
}
