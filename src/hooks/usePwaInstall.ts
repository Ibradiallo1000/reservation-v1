// src/hooks/usePwaInstall.ts
import { useEffect, useState } from 'react';

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener('beforeinstallprompt', handler);

    const mq = window.matchMedia('(display-mode: standalone)');
    const iosStandalone = (navigator as any).standalone === true;
    setIsStandalone(mq.matches || iosStandalone);

    const onInstalled = () => setDeferred(null);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canInstall = !!deferred && !isStandalone;
  const promptInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return { canInstall, promptInstall, isStandalone };
}
