// src/ui/UserMenu.tsx
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const UserMenu: React.FC = () => {
  const { user, logout } = useAuth() as any;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const name = user?.displayName || user?.email || 'Utilisateur';

  return (
    <div className="relative">
      <button
        onClick={()=>setOpen(o=>!o)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 shadow-sm"
        title="Menu utilisateur"
      >
        <span className="inline-block h-7 w-7 rounded-full bg-slate-200 place-items-center text-slate-600">
          {name?.[0]?.toUpperCase() || 'U'}
        </span>
        <span className="text-sm">{name}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-xl border bg-white shadow-lg overflow-hidden z-20">
          <button
            onClick={()=>{ setOpen(false); navigate('/profil'); }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
          >
            Mon profil
          </button>
          <button
            onClick={async ()=>{ setOpen(false); await logout(); navigate('/login'); }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
          >
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
