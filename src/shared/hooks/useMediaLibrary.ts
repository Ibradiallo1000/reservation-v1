import { useEffect, useState } from "react";
import {
  getPlatformMedia,
  getCompanyMedia,
  type MediaItem,
} from "@/shared/services/media.service";

export type MediaLibrarySource = "platform" | "company";

/**
 * @param source Ne charger que le jeu de données affiché par la modale : évite un 403
 * sur une collection non utilisée (ex. lecture `mediaPlatform` alors que seule la bibliothèque compagnie est demandée).
 */
export function useMediaLibrary(
  companyId: string | undefined,
  source: MediaLibrarySource = "company"
): {
  platformMedia: MediaItem[];
  companyMedia: MediaItem[];
  loading: boolean;
  error: Error | null;
} {
  const [platformMedia, setPlatformMedia] = useState<MediaItem[]>([]);
  const [companyMedia, setCompanyMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMedia() {
      setLoading(true);
      setError(null);
      try {
        let platform: MediaItem[] = [];
        let company: MediaItem[] = [];

        if (source === "platform") {
          platform = await getPlatformMedia();
        } else {
          company =
            companyId && companyId.trim() !== ""
              ? await getCompanyMedia(companyId)
              : [];
        }

        if (!cancelled) {
          setPlatformMedia(platform);
          setCompanyMedia(company);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setPlatformMedia([]);
          setCompanyMedia([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMedia();
    return () => {
      cancelled = true;
    };
  }, [companyId, source]);

  return { platformMedia, companyMedia, loading, error };
}
