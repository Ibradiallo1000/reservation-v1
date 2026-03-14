// src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import AppRoutes from "./AppRoutes";
import UpdateBanner from "./UpdateBanner";
import GlobalConnectionBanner from "@/shared/ui/GlobalConnectionBanner";
import PushNotificationsBootstrap from "@/shared/push/PushNotificationsBootstrap";
import { redirectToCanonicalIfNeeded } from "@/lib/canonicalRedirect";

/** Délai (ms) avant rechargement automatique quand une nouvelle version est détectée. */
const AUTO_RELOAD_DELAY_MS = 2000;

const App: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSWRef = useRef<(() => void) | null>(null);
  const autoReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Canonical URL: teliya.app/:slug → :slug.teliya.app (client-side fallback; edge does it in prod)
  useEffect(() => {
    if (redirectToCanonicalIfNeeded()) return;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    import("virtual:pwa-register").then(({ registerSW }) => {
      updateSWRef.current = registerSW({
        onNeedRefresh: () => {
          setNeedRefresh(true);
        },
        onOfflineReady: () => {},
      });
    });
  }, []);

  // Mise à jour automatique : après détection d'une nouvelle version, recharger après un court délai (sans clic utilisateur).
  useEffect(() => {
    if (!needRefresh || !updateSWRef.current) return;
    autoReloadTimerRef.current = setTimeout(() => {
      autoReloadTimerRef.current = null;
      updateSWRef.current?.();
    }, AUTO_RELOAD_DELAY_MS);
    return () => {
      if (autoReloadTimerRef.current) {
        clearTimeout(autoReloadTimerRef.current);
        autoReloadTimerRef.current = null;
      }
    };
  }, [needRefresh]);

  const handleUpdateClick = () => {
    if (autoReloadTimerRef.current) {
      clearTimeout(autoReloadTimerRef.current);
      autoReloadTimerRef.current = null;
    }
    updateSWRef.current?.();
  };

  const handleDismiss = () => {
    if (autoReloadTimerRef.current) {
      clearTimeout(autoReloadTimerRef.current);
      autoReloadTimerRef.current = null;
    }
    setNeedRefresh(false);
  };

  return (
    <AuthProvider>
      <PushNotificationsBootstrap />
      <AppRoutes />

      <UpdateBanner
        needRefresh={needRefresh}
        onUpdateClick={handleUpdateClick}
        onDismiss={handleDismiss}
        autoReloadDelayMs={AUTO_RELOAD_DELAY_MS}
      />
      <GlobalConnectionBanner />
    </AuthProvider>
  );
};

export default App;
