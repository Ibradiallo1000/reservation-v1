import { useEffect, useState } from "react";
import { getAllVilles } from "@/shared/services/villes.service";

export function useVilles(): {
  villes: string[];
  loading: boolean;
  error: Error | null;
} {
  const [villes, setVilles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const names = await getAllVilles();
        if (!cancelled) {
          setVilles(names);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setVilles([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetch();
    return () => {
      cancelled = true;
    };
  }, []);

  return { villes, loading, error };
}
