// src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import AppRoutes from "./AppRoutes";
import UpdateBanner from "./UpdateBanner";
import GlobalConnectionBanner from "@/shared/ui/GlobalConnectionBanner";
import PushNotificationsBootstrap from "@/shared/push/PushNotificationsBootstrap";

const App: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSWRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    import("virtual:pwa-register").then(({ registerSW }) => {
      updateSWRef.current = registerSW({
        onNeedRefresh: () => setNeedRefresh(true),
        onOfflineReady: () => {},
      });
    });
  }, []);

  const handleUpdateClick = () => {
    updateSWRef.current?.();
  };

  const handleDismiss = () => {
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
      />
      <GlobalConnectionBanner />
    </AuthProvider>
  );
};

export default App;
