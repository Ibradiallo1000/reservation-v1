// src/hooks/useInstallPrompt.ts
import { useEffect, useState } from 'react';

export default function useInstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const onBIP = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    const { outcome } = await deferred.prompt();
    setDeferred(null);
    setCanInstall(false);
    return outcome; // 'accepted' ou 'dismissed'
  };

  return { canInstall, promptInstall };
}
