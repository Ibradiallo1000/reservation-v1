import { useState, useCallback } from "react";
import {
  sendContactMessage,
  type SendContactMessageData,
} from "@/shared/services/contact.service";

export function useContactMessage(): {
  sendMessage: (data: SendContactMessageData) => Promise<void>;
  loading: boolean;
  error: Error | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(
    async (data: SendContactMessageData) => {
      setLoading(true);
      setError(null);
      try {
        await sendContactMessage(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { sendMessage, loading, error };
}
