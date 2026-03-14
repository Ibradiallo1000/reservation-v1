// src/UpdateBanner.tsx
import React, { useEffect, useState } from "react";
import { applyServiceWorkerUpdate } from "./sw-updater";

type UpdateBannerProps = {
  /** Vite PWA mode "prompt" : afficher quand une mise à jour est disponible */
  needRefresh?: boolean;
  /** Appelé au clic sur "Mettre à jour" / "Recharger maintenant" */
  onUpdateClick?: () => void;
  /** Appelé au clic sur "Ignorer" (annule le rechargement automatique) */
  onDismiss?: () => void;
  /** Délai en ms avant rechargement automatique (ex. 2000). Si fourni, message "Rechargement automatique dans X s" */
  autoReloadDelayMs?: number;
};

export default function UpdateBanner({
  needRefresh = false,
  onUpdateClick,
  onDismiss,
  autoReloadDelayMs,
}: UpdateBannerProps) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

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

  // Compte à rebours pour le rechargement automatique
  useEffect(() => {
    if (!needRefresh || !autoReloadDelayMs || autoReloadDelayMs <= 0) {
      setCountdown(null);
      return;
    }
    const seconds = Math.ceil(autoReloadDelayMs / 1000);
    setCountdown(seconds);
    const interval = setInterval(() => {
      setCountdown((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [needRefresh, autoReloadDelayMs]);

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
      {autoReloadDelayMs != null && needRefresh && (
        <div className="text-sm text-orange-100">
          Rechargement automatique{countdown != null ? ` dans ${countdown} s` : "…"}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleUpdate}
          className="flex-1 bg-white text-orange-600 font-semibold py-2 rounded-md"
        >
          Recharger maintenant
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-2 rounded-md border border-white/30"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
