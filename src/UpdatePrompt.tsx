import React from 'react';

export default function UpdatePrompt({ onReload }: { onReload: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-black/80 text-white px-4 py-3 shadow-lg">
      <div className="flex items-center gap-3">
        <span>Nouvelle version disponible</span>
        <button
          onClick={onReload}
          className="bg-white text-black px-3 py-1 rounded-md"
        >
          Mettre à jour
        </button>
      </div>
    </div>
  );
}
