import { useState, useCallback } from "react";
import {
  saveCompanyImage,
  type SaveCompanyImageData,
} from "@/shared/services/mediaUpload.service";

export function useCompanyImageUpload(): {
  uploadImage: (
    companyId: string,
    data: SaveCompanyImageData
  ) => Promise<void>;
  loading: boolean;
  error: Error | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadImage = useCallback(
    async (companyId: string, data: SaveCompanyImageData) => {
      setLoading(true);
      setError(null);
      try {
        await saveCompanyImage(companyId, data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { uploadImage, loading, error };
}
