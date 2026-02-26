import { collection, getDocs, orderBy, query } from "firebase/firestore";
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
 * Fetches platform media from Firestore (collection "mediaPlatform").
 */
export async function getPlatformMedia(): Promise<MediaItem[]> {
  const ref = collection(db, "mediaPlatform");
  const snap = await getDocs(ref);
  return snap.docs.map((d) => docToMediaItem(d.id, d.data() as Record<string, unknown>));
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
