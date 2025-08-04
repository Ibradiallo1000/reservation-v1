import React, { useEffect, useState } from "react";

const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // ✅ Intercepte l'événement "avant installation"
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // ✅ Vérifie si l'app est déjà installée
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setIsInstallable(false);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("✅ Installation acceptée");
    } else {
      console.log("❌ Installation refusée");
    }
    setDeferredPrompt(null);
  };

  if (installed) {
    return (
      <div className="bg-green-100 text-green-800 p-3 rounded-md text-sm mt-3">
        ✅ Teliya est maintenant installée sur votre appareil.
      </div>
    );
  }

  if (!isInstallable) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-white border shadow-lg p-4 rounded-xl flex items-center gap-3 z-50">
      <p className="text-gray-800 text-sm font-medium">
        📲 Installez Teliya pour un accès rapide
      </p>
      <button
        onClick={handleInstallClick}
        className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold px-3 py-2 rounded-lg"
      >
        Installer
      </button>
    </div>
  );
};

export default InstallPrompt;
