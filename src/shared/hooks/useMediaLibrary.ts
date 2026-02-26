import { useEffect, useState } from "react";
import {
  getPlatformMedia,
  getCompanyMedia,
  type MediaItem,
} from "@/shared/services/media.service";

export function useMediaLibrary(companyId?: string): {
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
        const [platform, company] = await Promise.all([
          getPlatformMedia(),
          companyId ? getCompanyMedia(companyId) : Promise.resolve([]),
        ]);
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
  }, [companyId]);

  return { platformMedia, companyMedia, loading, error };
}
