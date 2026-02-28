// Écran de bootstrap au démarrage : fond orange + spinner, sans logo.
// Utilisé dans index.tsx (avant initFirebase) et comme fallback Suspense pour la home.
import React from "react";

const BootstrapScreen: React.FC = () => (
  <div
    className="flex items-center justify-center min-h-screen w-full bg-[#f97316]"
    aria-hidden="true"
  >
    <div
      className="rounded-full h-10 w-10 border-2 border-white border-t-transparent animate-spin"
      style={{ animationDuration: "800ms" }}
    />
  </div>
);

export default BootstrapScreen;
