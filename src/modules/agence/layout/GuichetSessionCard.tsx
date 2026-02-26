// src/components/layout/GuichetSessionCard.tsx
import React from 'react';
import { useActiveShift } from '@/modules/agence/hooks/useActiveShift';
import { useAuth } from '@/contexts/AuthContext';

const GuichetSessionCard: React.FC = () => {
  const { startShift, closeShift, activeShift } = useActiveShift(); // ❌ enlevé loading
  const { user } = useAuth();

  return (
    <div className="fixed left-4 bottom-4 z-40">
      <div className="rounded-xl shadow-sm bg-white border p-3 w-[260px]">
        <div className="text-xs text-gray-500 mb-1">Session guichet</div>
        <div className="text-sm font-semibold">{user?.displayName || user?.email}</div>
        <div className="text-[11px] text-gray-500">{user?.agencyName}</div>

        {!activeShift ? (
          <button
            onClick={startShift}
            className="mt-3 w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700"
          >
            Démarrer le poste
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-emerald-700 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> En service
            </span>
            <button
              onClick={() => closeShift()}
              className="ml-auto text-sm px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              Clôturer
            </button>
          </div>
        )}

        <button
          onClick={() =>
            document.getElementById('rapport-anchor')?.scrollIntoView({ behavior: 'smooth' })
          }
          className="mt-2 w-full text-sm px-3 py-2 rounded-md border hover:bg-gray-50"
        >
          Ouvrir le rapport de poste
        </button>
      </div>
    </div>
  );
};

export default GuichetSessionCard;
