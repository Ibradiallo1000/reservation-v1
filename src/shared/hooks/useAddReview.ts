import { useState, useCallback } from "react";
import {
  addCompanyReview,
  type AddReviewData,
} from "@/shared/services/reviews.service";

export function useAddReview(): {
  addReview: (
    companyId: string,
    data: AddReviewData
  ) => Promise<void>;
  loading: boolean;
  error: Error | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addReview = useCallback(
    async (companyId: string, data: AddReviewData) => {
      setLoading(true);
      setError(null);
      try {
        await addCompanyReview(companyId, data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { addReview, loading, error };
}
