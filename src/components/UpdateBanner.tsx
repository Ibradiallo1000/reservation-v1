// src/components/UpdateBanner.tsx
import React, { useEffect, useState } from "react";
import { applyServiceWorkerUpdate } from "@/sw-updater";

type SWEventDetail = {
  registration: ServiceWorkerRegistration;
  version?: string | null;
};

const IGNORED_KEY_PREFIX = "teliya:sw:ignored:";

function getIgnoredKey(version?: string | null) {
  return `${IGNORED_KEY_PREFIX}${version ?? "unknown"}`;
}

const UpdateBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onAvailable = (e: Event) => {
      const ev = e as CustomEvent<SWEventDetail>;
      const reg = ev?.detail?.registration;
      const ver = ev?.detail?.version ?? null;

      // si l'utilisateur a déjà ignoré cette version -> ne pas afficher
      const ignoredKey = getIgnoredKey(ver);
      try {
        if (localStorage.getItem(ignoredKey) === "1") {
          return;
        }
      } catch {}

      setRegistration(reg || null);
      setVersion(ver);
      setVisible(true);
    };

    window.addEventListener("sw:updated-available", onAvailable as any);
    window.addEventListener("sw:waiting", onAvailable as any);

    return () => {
      window.removeEventListener("sw:updated-available", onAvailable as any);
      window.removeEventListener("sw:waiting", onAvailable as any);
    };
  }, []);

  const handleIgnore = () => {
    if (version) {
      try {
        localStorage.setItem(getIgnoredKey(version), "1");
      } catch {}
    }
    setVisible(false);
  };

  const handleUpdate = async () => {
    if (!registration) return;
    setIsApplying(true);
    setError(null);
    try {
      await applyServiceWorkerUpdate(registration);
      // new SW took control — reload the page to use the new SW content
      // show a small delay to ensure controllerchange processed
      window.location.reload();
    } catch (err: any) {
      setError(String(err?.message ?? err ?? "Erreur lors de la mise à jour"));
      setIsApplying(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-60 max-w-sm w-[92%] md:w-auto"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-lg shadow-lg overflow-hidden border border-orange-300 bg-white dark:bg-gray-800">
        <div className="px-4 py-3 bg-orange-600 text-white flex items-center justify-between gap-3">
          <div className="font-semibold">Nouvelle version disponible</div>
          <div className="text-sm opacity-90">{version ? `v: ${String(version).slice(0, 12)}` : null}</div>
        </div>

        <div className="p-4 flex items-center gap-3">
          <div className="flex-1 text-sm text-gray-700 dark:text-gray-200">
            Une nouvelle version de l’application est prête. Vous pouvez la mettre à jour maintenant.
            {error && <div className="text-red-600 mt-2 text-xs">{error}</div>}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleIgnore}
              className="px-3 py-2 rounded-md border hover:bg-gray-50"
              disabled={isApplying}
            >
              Ignorer
            </button>

            <button
              onClick={handleUpdate}
              className="px-3 py-2 rounded-md bg-orange-600 text-white hover:bg-orange-700 flex items-center gap-2"
              disabled={isApplying}
            >
              {isApplying ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
                  </svg>
                  Mise à jour...
                </>
              ) : (
                "Mettre à jour"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateBanner;
