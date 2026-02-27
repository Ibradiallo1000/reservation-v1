// src/UpdateBanner.tsx
import React, { useEffect, useState } from "react";
import { applyServiceWorkerUpdate } from "./sw-updater";

type UpdateBannerProps = {
  /** Vite PWA mode "prompt" : afficher quand une mise à jour est disponible */
  needRefresh?: boolean;
  /** Appelé au clic sur "Mettre à jour" (ex. updateSW du virtual:pwa-register) */
  onUpdateClick?: () => void;
  /** Appelé au clic sur "Ignorer" */
  onDismiss?: () => void;
};

export default function UpdateBanner({
  needRefresh = false,
  onUpdateClick,
  onDismiss,
}: UpdateBannerProps) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handler = (e: CustomEvent<{ registration?: ServiceWorkerRegistration }>) => {
      const reg = e?.detail?.registration ?? null;
      setRegistration(reg);
    };
    window.addEventListener("sw:updated-available", handler as EventListener);
    window.addEventListener("sw:waiting", handler as EventListener);
    return () => {
      window.removeEventListener("sw:updated-available", handler as EventListener);
      window.removeEventListener("sw:waiting", handler as EventListener);
    };
  }, []);

  const showBanner = needRefresh || registration;

  const handleUpdate = () => {
    if (needRefresh && onUpdateClick) {
      onUpdateClick();
      return;
    }
    if (registration) {
      applyServiceWorkerUpdate(registration).then(() => window.location.reload());
    }
  };

  const handleDismiss = () => {
    if (needRefresh && onDismiss) onDismiss();
    else setRegistration(null);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed right-5 bottom-5 z-50 max-w-xs rounded-lg shadow-lg p-3 flex flex-col gap-3 bg-orange-600 text-white">
      <div className="font-semibold">Nouvelle version disponible</div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleUpdate}
          className="flex-1 bg-white text-orange-600 font-semibold py-2 rounded-md"
        >
          Mettre à jour
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-2 rounded-md border border-white/30"
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}
