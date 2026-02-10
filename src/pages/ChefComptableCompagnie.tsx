// src/pages/ChefComptableCompagniePage.tsx
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import { db } from '@/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
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
  
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('Compagnie');
  
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
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header fixe */}
      <div className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur-sm supports-[backdrop-filter]:bg-white/90 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            
            {/* Branding */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {companyLogo ? (
                  <div className="relative">
                    <img 
                      src={companyLogo} 
                      alt="Logo compagnie" 
                      className="h-12 w-12 rounded-xl object-contain border-2 border-white shadow-md"
                    />
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full border border-white flex items-center justify-center">
                      <Shield className="h-3 w-3 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-white shadow-md grid place-items-center">
                    <Building2 className="h-6 w-6 text-gray-600"/>
                  </div>
                )}
                <div className="min-w-0">
                  <div
                    className="text-xl font-bold tracking-tight truncate bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent"
                    title={companyName}
                  >
                    {companyName}
                  </div>
                  <div className="text-sm text-gray-600 flex items-center gap-1.5">
                    <span className="text-xs px-2 py-0.5 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 rounded-full">
                      Chef Comptable Compagnie
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Onglets horizontaux */}
            <div className="w-full sm:w-auto">
              <div className="inline-flex rounded-2xl p-1.5 bg-gradient-to-r from-slate-100 to-slate-50 shadow-inner w-full sm:w-auto">
                <TabButton 
                  active={currentTab === 'globale'}   
                  onClick={() => handleNavigation('globale')}   
                  label="Vue Globale" 
                  icon={<Globe className="h-4 w-4" />}
                  theme={theme}
                />
                <TabButton 
                  active={currentTab === 'reservations'} 
                  onClick={() => handleNavigation('reservations')} 
                  label="Réservations" 
                  icon={<CreditCard className="h-4 w-4" />}
                  theme={theme}
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
            
            {/* Profil & Déconnexion */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              {user && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 shadow-sm">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
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
                className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 shadow-sm transition-colors"
                title="Déconnexion"
              >
                <LogOut className="h-4 w-4"/> 
                <span className="hidden sm:inline">Déconnexion</span>
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

// Composant TabButton
const TabButton: React.FC<{
  active: boolean; 
  onClick: () => void; 
  label: string;
  icon: React.ReactNode;
  theme: { primary: string; secondary: string };
}> = ({ active, onClick, label, icon, theme }) => (
  <button
    className={`
      flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all
      ${active 
        ? 'text-white shadow-lg transform scale-105' 
        : 'text-gray-600 hover:text-gray-900 hover:bg-white/80'
      }
    `}
    onClick={onClick}
    style={active ? { 
      background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
      boxShadow: `0 4px 12px ${theme.primary}40`
    } : {}}
  >
    {icon}
    <span className="whitespace-nowrap">{label}</span>
  </button>
);

export default ChefComptableCompagniePage;