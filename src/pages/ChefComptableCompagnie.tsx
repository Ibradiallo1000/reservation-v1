// src/pages/ChefComptableCompagniePage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import { db } from '@/firebaseConfig';
import { doc, getDoc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import {
  Building2,
  Shield,
  LogOut,
  CreditCard,
  BarChart3,
  FileText,
  Settings,
  Globe,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';

const ChefComptableCompagniePage: React.FC = () => {
  const { user, logout, company } = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#3b82f6' };
  
  // ✅ ÉTAPE 1 — États globaux pour notifications
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingByAgency, setPendingByAgency] = useState<Record<string, number>>({});
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('Compagnie');
  
  // ✅ ÉTAPE 2 — Initialiser le son UNE FOIS (obligatoire navigateur)
  useEffect(() => {
    const initAudio = () => {
      if (!audioRef.current) {
        audioRef.current = new Audio('/notification.mp3');
        audioRef.current.preload = 'auto';
      }
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };

    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, []);
  
  // Vérifier le rôle (sécurité supplémentaire)
  useEffect(() => {
    if (!user) return;
    
    const allowedRoles = ['company_accountant', 'financial_director', 'admin', 'super_admin'];
    if (!allowedRoles.includes(user.role)) {
      console.warn(`[ChefComptable] Rôle non autorisé: ${user.role}`);
      navigate('/dashboard');
    }
  }, [user, navigate]);
  
  // Déterminer l'onglet actif
  const currentTab = (() => {
    const path = location.pathname;
    if (path.includes('reservations-en-ligne')) return 'reservations';
    if (path.includes('finances')) return 'finances';
    if (path.includes('rapports')) return 'rapports';
    if (path.includes('parametres')) return 'parametres';
    return 'globale';
  })();
  
  // Chargement des données compagnie
  useEffect(() => {
    if (!user?.companyId) return;
    
    (async () => {
      try {
        const companyDoc = await getDoc(doc(db, 'companies', user.companyId));
        if (companyDoc.exists()) {
          const c = companyDoc.data() as any;
          setCompanyLogo(c.logoUrl || c.logo || null);
          setCompanyName(c.nom || c.name || 'Compagnie');
        }
      } catch (error) {
        console.error('[ChefComptable] Erreur chargement compagnie:', error);
      }
    })();
  }, [user?.companyId]);
  
  // ✅ CORRECTION CRITIQUE : Calculer le total à partir des compteurs par agence
  useEffect(() => {
    const total = Object.values(pendingByAgency).reduce((a, b) => a + b, 0);
    setPendingCount(total);
  }, [pendingByAgency]);
  
  // ✅ ÉTAPE 3 — Listener Firestore GLOBAL (le cœur) CORRIGÉ
  useEffect(() => {
    if (!user?.companyId) return;

    let unsubscribers: (() => void)[] = [];

    (async () => {
      try {
        const agencesSnap = await getDocs(
          collection(db, 'companies', user.companyId, 'agences')
        );

        // Calculer le total initial et écouter chaque agence
        agencesSnap.forEach((agenceDoc) => {
          const agencyId = agenceDoc.id;
          
          const q = query(
            collection(db, 'companies', user.companyId, 'agences', agencyId, 'reservations'),
            where('statut', '==', 'preuve_recue')
          );

          const unsub = onSnapshot(q, (snap) => {
            // ✅ CORRECTION : Stocker par agence, PAS écraser le total
            setPendingByAgency(prev => ({
              ...prev,
              [agencyId]: snap.size
            }));

            snap.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const reservationId = change.doc.id;
                const key = `${agencyId}_${reservationId}`;
                
                // 🔔 FILTRE SON : Ne jouer que pour les nouvelles preuves (< 30 secondes)
                const data = change.doc.data() as any;
                const createdAt = data.createdAt?.toDate?.();
                
                if (createdAt) {
                  // Ne jouer le son que si la réservation a moins de 30 secondes
                  if (Date.now() - createdAt.getTime() > 30_000) {
                    // C'est une vieille réservation, on l'ajoute juste au Set
                    setPlayedIds(prev => {
                      const next = new Set(prev);
                      next.add(key);
                      return next;
                    });
                    return;
                  }
                }

                setPlayedIds((prev) => {
                  if (prev.has(key)) return prev;

                  // 🔔 Jouer le son de notification (seulement pour les vraies nouvelles)
                  if (audioRef.current) {
                    try {
                      audioRef.current.currentTime = 0;
                      audioRef.current.play().catch(() => {
                        // Ignorer les erreurs silencieuses
                      });
                    } catch (error) {
                      console.warn('Erreur notification audio:', error);
                    }
                  }

                  const next = new Set(prev);
                  next.add(key);
                  return next;
                });
              }
            });
          }, (error) => {
            console.error('[ChefComptable] Erreur listener réservations:', error);
          });

          unsubscribers.push(unsub);
        });
      } catch (error) {
        console.error('[ChefComptable] Erreur initialisation listener:', error);
      }
    })();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.companyId]);
  
  // Gestion des onglets
  const handleNavigation = (tab: string) => {
    switch (tab) {
      case 'globale': 
        navigate('/chef-comptable'); 
        break;
      case 'reservations': 
        navigate('/chef-comptable/reservations-en-ligne'); 
        break;
      case 'finances': 
        navigate('/chef-comptable/finances'); 
        break;
      case 'rapports': 
        navigate('/chef-comptable/rapports'); 
        break;
      case 'parametres': 
        navigate('/chef-comptable/parametres'); 
        break;
    }
  };
  
  // Fonction pour réinitialiser les notifications (quand on clique sur l'onglet)
  const handleReservationsClick = useCallback(() => {
    // Réinitialiser les IDs joués quand on va sur la page réservations
    setPlayedIds(new Set());
    handleNavigation('reservations');
  }, []);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header fixe */}
      <div className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur-sm supports-[backdrop-filter]:bg-white/90 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            
            {/* Branding - Section gauche */}
            <div className="flex items-center gap-3 min-w-0">
              {/* Logo rond */}
              <div className="relative shrink-0">
                {companyLogo ? (
                  <img 
                    src={companyLogo} 
                    alt="Logo compagnie" 
                    className="h-12 w-12 rounded-full object-contain border-2 border-white shadow-md"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-white shadow-md grid place-items-center">
                    <Building2 className="h-6 w-6 text-gray-600"/>
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full border border-white flex items-center justify-center">
                  <Shield className="h-3 w-3 text-white" />
                </div>
              </div>
              
              {/* Nom de compagnie avec retour à la ligne autorisé */}
              <div className="min-w-0">
                <div
                  className="text-xl font-bold tracking-tight line-clamp-2 leading-tight bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent"
                  title={companyName}
                >
                  {companyName}
                </div>
                {/* Supprimé: "Chef Comptable Compagnie" près du logo */}
                {/* Supprimé: Badge rouge "X à vérifier" près du logo - maintenant uniquement sur l'onglet Réservations */}
              </div>
            </div>
            
            {/* Onglets horizontaux - Section centrale */}
            <div className="w-full lg:w-auto lg:max-w-2xl">
              <div className="inline-flex rounded-2xl p-1.5 bg-gradient-to-r from-slate-100 to-slate-50 shadow-inner w-full lg:w-auto overflow-x-auto">
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <TabButton 
                    active={currentTab === 'globale'}   
                    onClick={() => handleNavigation('globale')}   
                    label="Vue Globale" 
                    icon={<Globe className="h-4 w-4" />}
                    theme={theme}
                  />
                  {/* ✅ ÉTAPE 4 — Badge sur Réservations uniquement */}
                  <TabButton 
                    active={currentTab === 'reservations'} 
                    onClick={handleReservationsClick}
                    label="Réservations" 
                    icon={<CreditCard className="h-4 w-4" />}
                    theme={theme}
                    badgeCount={pendingCount}
                  />
                  <TabButton 
                    active={currentTab === 'finances'}   
                    onClick={() => handleNavigation('finances')}   
                    label="Finances" 
                    icon={<TrendingUp className="h-4 w-4" />}
                    theme={theme}
                  />
                  <TabButton 
                    active={currentTab === 'rapports'}   
                    onClick={() => handleNavigation('rapports')}   
                    label="Rapports" 
                    icon={<FileText className="h-4 w-4" />}
                    theme={theme}
                  />
                  <TabButton 
                    active={currentTab === 'parametres'}   
                    onClick={() => handleNavigation('parametres')}   
                    label="Paramètres" 
                    icon={<Settings className="h-4 w-4" />}
                    theme={theme}
                  />
                </div>
              </div>
            </div>
            
            {/* Profil & Déconnexion - Section droite */}
            <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
              {user && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 shadow-sm min-w-0">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {user.email?.charAt(0)?.toUpperCase() || 'C'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-900 truncate">
                      {user.email || '—'}
                    </div>
                    <div className="text-xs text-gray-600 truncate">
                      Chef Comptable
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={async () => { 
                  await logout(); 
                  navigate('/login'); 
                }}
                className="inline-flex items-center gap-2 p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 shadow-sm transition-colors group relative"
                title="Déconnexion"
              >
                <LogOut className="h-4 w-4"/> 
                {/* Supprimé le texte "Déconnexion", icône seule avec tooltip */}
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  Déconnexion
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Contenu des pages */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </div>
    </div>
  );
};

// ✅ ÉTAPE 4.2 — Composant TabButton amélioré avec badge
const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  theme: { primary: string; secondary: string };
  badgeCount?: number;
}> = ({ active, onClick, label, icon, theme, badgeCount }) => (
  <button
    onClick={onClick}
    className={`
      relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all shrink-0
      ${active
        ? 'text-white shadow-lg scale-105'
        : 'text-gray-600 hover:text-gray-900 hover:bg-white/80'}
    `}
    style={active ? {
      background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`
    } : {}}
  >
    {icon}
    <span className="whitespace-nowrap">{label}</span>

    {badgeCount && badgeCount > 0 && (
      <span
        className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full text-xs font-bold text-white flex items-center justify-center animate-pulse"
        style={{ 
          background: theme.primary,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
      >
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    )}
  </button>
);

export default ChefComptableCompagniePage;