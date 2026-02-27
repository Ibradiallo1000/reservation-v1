import React from "react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";

const GlobalConnectionBanner: React.FC = () => {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[100] px-4 py-2 rounded-full bg-red-600 text-white shadow-lg animate-fadein">
      <div className="flex items-center gap-2 text-sm font-medium">
        <WifiOff className="h-4 w-4" />
        <span>Connexion internet indisponible.</span>
      </div>
    </div>
  );
};

export default GlobalConnectionBanner;
