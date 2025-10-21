// src/UpdateBanner.tsx
import React, { useEffect, useState } from "react";
import { applyServiceWorkerUpdate } from "./sw-updater"; // import nommé (doit exister)

export default function UpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handler = (e: any) => {
      const reg = e?.detail?.registration || null;
      setRegistration(reg);
    };
    window.addEventListener("sw:updated", handler);
    return () => window.removeEventListener("sw:updated", handler);
  }, []);

  if (!registration) return null;

  return (
    <div className="fixed right-5 bottom-5 z-50 max-w-xs rounded-lg shadow-lg p-3 flex flex-col gap-3 bg-orange-600 text-white">
      <div className="font-semibold">Nouvelle version disponible</div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => applyServiceWorkerUpdate(registration)}
          className="flex-1 bg-white text-orange-600 font-semibold py-2 rounded-md"
        >
          Mettre à jour
        </button>
        <button
          onClick={() => setRegistration(null)}
          className="px-3 py-2 rounded-md border border-white/30"
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}
