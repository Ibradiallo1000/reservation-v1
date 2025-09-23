// src/components/PwaInstallBanner.tsx
import React from 'react';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isWebView = /(FBAN|FBAV|Instagram|Line|WhatsApp)/i.test(navigator.userAgent);

export default function PwaInstallBanner() {
  const { canInstall, promptInstall, isStandalone } = usePwaInstall();
  if (isStandalone) return null; // déjà installé

  // Style simple tailwind; adapte à ton design
  const box = "fixed bottom-4 left-4 right-4 z-[10000] rounded-xl p-3 shadow-lg bg-white text-sm flex items-center justify-between gap-3";
  const btn = "px-3 py-2 rounded-lg font-semibold text-white";
  const primary = "bg-orange-500";
  const ghost = "text-orange-600 underline";

  if (canInstall) {
    return (
      <div className={box}>
        <div>Installe l’application pour un accès rapide hors navigateur.</div>
        <button onClick={promptInstall} className={`${btn} ${primary}`}>Installer</button>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className={box}>
        <div>Sur iPhone : <b>Partager</b> → <b>Ajouter à l’écran d’accueil</b>.</div>
        <a className={ghost} href="https://support.apple.com/fr-fr/guide/iphone/iph42ab2f3a7/ios">Voir l’aide</a>
      </div>
    );
  }

  if (isWebView) {
    return (
      <div className={box}>
        <div>Ouvre ce lien dans <b>Chrome</b> pour installer l’app.</div>
        <button className={ghost} onClick={() => alert("Dans WhatsApp/FB, utilise ⋮ puis 'Ouvrir dans Chrome'.")}>
          Comment faire ?
        </button>
      </div>
    );
  }

  return null;
}
