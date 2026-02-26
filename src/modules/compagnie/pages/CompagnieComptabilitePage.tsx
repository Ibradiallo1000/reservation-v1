// src/pages/CompagnieComptabilitePage.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { 
  collection, getDocs, query, where, orderBy, Timestamp,
  collectionGroup, DocumentData, QuerySnapshot 
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, BarChart3, Wallet, TrendingUp, AlertTriangle,
  CheckCircle2, ChevronRight, Download, Filter, RefreshCw,
  Users, CreditCard, Smartphone, Banknote, FileText, Shield,
  PieChart, Calendar, Eye, EyeOff, Lock, Unlock, Receipt
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useFormatCurrency, useCurrencySymbol } from '@/shared/currency/CurrencyContext';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type RangeKey = 'jour' | 'semaine' | 'mois' | 'custom';

type CompanyRole = 'ceo' | 'financial_director' | 'company_accountant' | 'company_viewer' | 'agency_accountant';

type AgencyPerformance = {
  agenceId: string;
  agenceNom: string;
  ville?: string;
  
  // VENTES
  ventesGuichet: number;
  ventesEnLigne: number;
  ventesTotal: number;
  
  // ENCAISSEMENTS
  especesRecues: number;        // Argent réellement en caisse agence
  mobileMoneyRecu: number;      // MM reçu (info)
  onlineRecu: number;           // En ligne (info)
  
  // CAISSE AGENCE
  entreesManuelles: number;
  sortiesAgence: number;
  soldeCaisse: number;
  
  // ÉCARTS & ALERTES
  ecartEspeces: number;         // ventesGuichet - especesRecues
  statutCaisse: 'ok' | 'warning' | 'danger';
  
  // KPI
  nbReservations: number;
  nbBillets: number;
  tauxOccupation?: number;
  
  // MÉTA
  dernierShift?: Date;
  hasAlert?: boolean;
};

type CompanyMovement = {
  id?: string;
  type: 'depense' | 'entree' | 'transfert';
  category?: string;
  amount: number;
  label: string;
  method: 'cash' | 'bank' | 'cheque' | 'mobile_money';
  note?: string;
  createdBy: string;
  createdByName: string;
  createdAt: any;
  companyId: string;
  validated?: boolean;
  validatedBy?: string;
  validatedAt?: any;
};

type AlertType = {
  id: string;
  type: 'caisse' | 'ventes' | 'paiement' | 'securite';
  severity: 'low' | 'medium' | 'high';
  title: string;
  message: string;
  agencyId?: string;
  agencyName?: string;
  createdAt: any;
  resolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: any;
};

type ReconciliationData = {
  agencyId: string;
  agencyName: string;
  period: string;
  ventesGuichet: number;
  ventesEnLigne: number;
  ventesTotal: number;
  especesAttendues: number;
  especesRecues: number;
  mobileMoneyAttendu: number;
  mobileMoneyRecu: number;
  onlineAttendu: number;
  onlineRecu: number;
  ecartEspeces: number;
  ecartMobileMoney: number;
  ecartTotal: number;
  validated: boolean;
  validatedBy?: string;
  validatedAt?: any;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatNumber = (n: number) => 
  new Intl.NumberFormat('fr-FR').format(n || 0);

const startOfDay = (d = new Date()) => 
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

const endOfDay = (d = new Date()) => 
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const startOfMonth = (d = new Date()) => 
  new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);

const formatDate = (d: Date | null) => 
  d ? d.toLocaleDateString('fr-FR', { 
    weekday: 'long',
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  }) : '—';

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

const CompagnieComptabilitePage: React.FC = () => {
  const { user } = useAuth() as any;
  const navigate = useNavigate();
  const money = useFormatCurrency();
  
  // ==========================================================================
  // ÉTATS & CONFIGURATION
  // ==========================================================================
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reconciliation' | 'agencies' | 'movements' | 'reports' | 'audit'>('dashboard');
  const [range, setRange] = useState<RangeKey>('mois');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  
  // Données
  const [agencies, setAgencies] = useState<{ id: string; nom: string; ville?: string }[]>([]);
  const [performanceData, setPerformanceData] = useState<AgencyPerformance[]>([]);
  const [companyMovements, setCompanyMovements] = useState<CompanyMovement[]>([]);
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [reconciliationData, setReconciliationData] = useState<ReconciliationData[]>([]);
  
  // Drill-down
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const [agencyDetails, setAgencyDetails] = useState<any>(null);
  
  // Permissions
  const [userRole, setUserRole] = useState<CompanyRole>('company_viewer');
  
  // ==========================================================================
  // CALCUL PÉRIODE
  // ==========================================================================
  
  const { from, to, label } = useMemo(() => {
    const now = new Date();
    if (range === 'jour') return { 
      from: startOfDay(now), 
      to: endOfDay(now), 
      label: "Aujourd'hui" 
    };
    if (range === 'semaine') return { 
      from: startOfDay(addDays(now, -6)), 
      to: endOfDay(now), 
      label: '7 derniers jours' 
    };
    if (range === 'mois') return { 
      from: startOfMonth(now), 
      to: endOfDay(now), 
      label: 'Mois en cours' 
    };
    const f = customStart ? new Date(`${customStart}T00:00:00`) : startOfMonth(now);
    const t = customEnd ? new Date(`${customEnd}T23:59:59`) : endOfDay(now);
    return { from: f, to: t, label: 'Période personnalisée' };
  }, [range, customStart, customEnd]);
  
  // ==========================================================================
  // VÉRIFICATION DES PERMISSIONS
  // ==========================================================================
  
  useEffect(() => {
    if (!user) return;
    
    // Simuler la détection du rôle (à adapter selon ta logique)
    const roles = user.roles || [];
    if (roles.includes('ceo')) {
      setUserRole('ceo');
    } else if (roles.includes('financial_director')) {
      setUserRole('financial_director');
    } else if (roles.includes('company_accountant')) {
      setUserRole('company_accountant');
    } else if (roles.includes('company_viewer')) {
      setUserRole('company_viewer');
    }
    
    // Redirection si pas autorisé
    if (!['ceo', 'financial_director', 'company_accountant', 'company_viewer'].includes(userRole)) {
      navigate('/unauthorized');
    }
  }, [user, userRole, navigate]);
  
  // ==========================================================================
  // CHARGEMENT DES AGENCES
  // ==========================================================================
  
  useEffect(() => {
    (async () => {
      if (!user?.companyId) return;
      
      try {
        const snap = await getDocs(collection(db, 'companies', user.companyId, 'agences'));
        const agenciesList = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            nom: data.nomAgence || data.nom || 'Agence',
            ville: data.ville || data.city || ''
          };
        });
        setAgencies(agenciesList);
      } catch (error) {
        console.error('Erreur chargement agences:', error);
      }
    })();
  }, [user?.companyId]);
  
  // ==========================================================================
  // CHARGEMENT DES DONNÉES DE PERFORMANCE
  // ==========================================================================
  
  const loadPerformanceData = useCallback(async () => {
    if (!user?.companyId) return;
    
    setLoading(true);
    
    try {
      const result: AgencyPerformance[] = [];
      
      // Pour chaque agence, calculer les performances
      for (const agency of agencies) {
        // 1. Récupérer TOUTES les réservations de l'agence (guichet + ligne)
        const reservationsRef = collection(db, 'companies', user.companyId, 'agences', agency.id, 'reservations');
        const qRes = query(
          reservationsRef,
          where('createdAt', '>=', Timestamp.fromDate(from)),
          where('createdAt', '<=', Timestamp.fromDate(to))
        );
        
        // 2. Récupérer les reçus de caisse
        const cashReceiptsRef = collection(db, 'companies', user.companyId, 'agences', agency.id, 'cashReceipts');
        const qCash = query(
          cashReceiptsRef,
          where('createdAt', '>=', Timestamp.fromDate(from)),
          where('createdAt', '<=', Timestamp.fromDate(to))
        );
        
        // 3. Récupérer les mouvements de caisse
        const movementsRef = collection(db, 'companies', user.companyId, 'agences', agency.id, 'cashMovements');
        const qMov = query(
          movementsRef,
          where('createdAt', '>=', Timestamp.fromDate(from)),
          where('createdAt', '<=', Timestamp.fromDate(to))
        );
        
        const [resSnap, cashSnap, movSnap] = await Promise.all([
          getDocs(qRes),
          getDocs(qCash),
          getDocs(qMov)
        ]);
        
        // Calculer les ventes
        let ventesGuichet = 0;
        let ventesEnLigne = 0;
        let nbReservations = 0;
        let nbBillets = 0;
        
        resSnap.forEach(doc => {
          const data = doc.data();
          const canal = String(data.canal || '').toLowerCase();
          const montant = Number(data.montant || 0);
          const seats = (data.seatsGo || 0) + (data.seatsReturn || 0);
          
          nbReservations += 1;
          nbBillets += seats;
          
          if (canal === 'guichet' || canal === '') {
            ventesGuichet += montant;
          } else if (canal === 'en_ligne') {
            ventesEnLigne += montant;
          }
        });
        
        // Calculer les encaissements
        let especesRecues = 0;
        let mobileMoneyRecu = 0;
        let onlineRecu = 0;
        
        cashSnap.forEach(doc => {
          const data = doc.data();
          especesRecues += Number(data.cashReceived || 0);
          mobileMoneyRecu += Number(data.mmExpected || 0); // À vérifier selon ta structure
        });
        
        // Calculer mouvements de caisse
        let entreesManuelles = 0;
        let sortiesAgence = 0;
        
        movSnap.forEach(doc => {
          const data = doc.data();
          const kind = String(data.kind || '');
          const amount = Number(data.amount || 0);
          
          if (kind === 'entree_manual') {
            entreesManuelles += amount;
          } else if (kind === 'depense' || kind === 'transfert_banque') {
            sortiesAgence += amount;
          }
        });
        
        // Calculer les totaux
        const ventesTotal = ventesGuichet + ventesEnLigne;
        const soldeCaisse = especesRecues + entreesManuelles - sortiesAgence;
        const ecartEspeces = ventesGuichet - especesRecues;
        
        // Déterminer le statut
        let statutCaisse: 'ok' | 'warning' | 'danger' = 'ok';
        if (Math.abs(ecartEspeces) > 10000) statutCaisse = 'warning';
        if (Math.abs(ecartEspeces) > 50000 || soldeCaisse < 0) statutCaisse = 'danger';
        
        // Vérifier les alertes
        const hasAlert = 
          Math.abs(ecartEspeces) > 50000 || 
          soldeCaisse < 0 || 
          ventesTotal === 0 && agencies.length > 1;
        
        result.push({
          agenceId: agency.id,
          agenceNom: agency.nom,
          ville: agency.ville,
          
          ventesGuichet,
          ventesEnLigne,
          ventesTotal,
          
          especesRecues,
          mobileMoneyRecu,
          onlineRecu: ventesEnLigne, // À adapter selon ta structure
          
          entreesManuelles,
          sortiesAgence,
          soldeCaisse,
          
          ecartEspeces,
          statutCaisse,
          
          nbReservations,
          nbBillets,
          
          hasAlert
        });
      }
      
      setPerformanceData(result);
      
      // Générer les alertes
      generateAlerts(result);
      
    } catch (error) {
      console.error('Erreur chargement performance:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, agencies, from, to]);
  
  // ==========================================================================
  // CHARGEMENT DES MOUVEMENTS COMPAGNIE
  // ==========================================================================
  
  const loadCompanyMovements = useCallback(async () => {
    if (!user?.companyId) return;
    
    try {
      const movementsRef = collection(db, 'companies', user.companyId, 'companyMovements');
      const q = query(
        movementsRef,
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc')
      );
      
      const snap = await getDocs(q);
      const movements = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CompanyMovement[];
      
      setCompanyMovements(movements);
    } catch (error) {
      console.error('Erreur chargement mouvements compagnie:', error);
    }
  }, [user?.companyId, from, to]);
  
  // ==========================================================================
  // GÉNÉRATION DES ALERTES
  // ==========================================================================
  
  const generateAlerts = (data: AgencyPerformance[]) => {
    const newAlerts: AlertType[] = [];
    const now = Timestamp.now();
    
    data.forEach(agency => {
      // Alerte écart espèces
      if (Math.abs(agency.ecartEspeces) > 50000) {
        newAlerts.push({
          id: `${agency.agenceId}-ecart`,
          type: 'caisse',
          severity: 'high',
          title: 'Écart espèces élevé',
          message: `Écart de ${money(agency.ecartEspeces)} entre ventes et caisse`,
          agencyId: agency.agenceId,
          agencyName: agency.agenceNom,
          createdAt: now
        });
      }
      
      // Alerte solde négatif
      if (agency.soldeCaisse < 0) {
        newAlerts.push({
          id: `${agency.agenceId}-solde`,
          type: 'caisse',
          severity: 'high',
          title: 'Solde caisse négatif',
          message: `Caisse en négatif de ${money(Math.abs(agency.soldeCaisse))}`,
          agencyId: agency.agenceId,
          agencyName: agency.agenceNom,
          createdAt: now
        });
      }
      
      // Alerte baisse ventes
      if (agency.ventesTotal === 0 && agencies.length > 1) {
        newAlerts.push({
          id: `${agency.agenceId}-ventes`,
          type: 'ventes',
          severity: 'medium',
          title: 'Aucune vente aujourd\'hui',
          message: `L'agence ${agency.agenceNom} n'a enregistré aucune vente`,
          agencyId: agency.agenceId,
          agencyName: agency.agenceNom,
          createdAt: now
        });
      }
    });
    
    setAlerts(newAlerts);
  };
  
  // ==========================================================================
  // CHARGEMENT DES DONNÉES DÉTAILLÉES AGENCE
  // ==========================================================================
  
  const loadAgencyDetails = useCallback(async (agencyId: string) => {
    if (!user?.companyId) return;
    
    setLoadingDetails(agencyId);
    setSelectedAgency(agencyId);
    
    try {
      const agency = agencies.find(a => a.id === agencyId);
      if (!agency) return;
      
      // Charger les données détaillées
      // (similaire à loadPerformanceData mais plus détaillé)
      
      setAgencyDetails({
        ...agency,
        performance: performanceData.find(p => p.agenceId === agencyId),
        // Ajouter d'autres données si nécessaire
      });
      
    } catch (error) {
      console.error('Erreur chargement détails agence:', error);
    } finally {
      setLoadingDetails(null);
    }
  }, [user?.companyId, agencies, performanceData]);
  
  // ==========================================================================
  // CALCUL DES TOTAUX
  // ==========================================================================
  
  const totals = useMemo(() => {
    if (performanceData.length === 0) {
      return {
        ventesTotal: 0,
        ventesGuichet: 0,
        ventesEnLigne: 0,
        especesRecues: 0,
        mobileMoneyRecu: 0,
        onlineRecu: 0,
        soldeTotalCaisse: 0,
        ecartTotalEspeces: 0,
        nbReservations: 0,
        nbBillets: 0
      };
    }
    
    return performanceData.reduce((acc, agency) => ({
      ventesTotal: acc.ventesTotal + agency.ventesTotal,
      ventesGuichet: acc.ventesGuichet + agency.ventesGuichet,
      ventesEnLigne: acc.ventesEnLigne + agency.ventesEnLigne,
      especesRecues: acc.especesRecues + agency.especesRecues,
      mobileMoneyRecu: acc.mobileMoneyRecu + agency.mobileMoneyRecu,
      onlineRecu: acc.onlineRecu + agency.onlineRecu,
      soldeTotalCaisse: acc.soldeTotalCaisse + agency.soldeCaisse,
      ecartTotalEspeces: acc.ecartTotalEspeces + agency.ecartEspeces,
      nbReservations: acc.nbReservations + agency.nbReservations,
      nbBillets: acc.nbBillets + agency.nbBillets
    }), {
      ventesTotal: 0,
      ventesGuichet: 0,
      ventesEnLigne: 0,
      especesRecues: 0,
      mobileMoneyRecu: 0,
      onlineRecu: 0,
      soldeTotalCaisse: 0,
      ecartTotalEspeces: 0,
      nbReservations: 0,
      nbBillets: 0
    });
  }, [performanceData]);
  
  // ==========================================================================
  // CHARGEMENT INITIAL
  // ==========================================================================
  
  useEffect(() => {
    if (user?.companyId && agencies.length > 0) {
      loadPerformanceData();
      loadCompanyMovements();
    }
  }, [user?.companyId, agencies, from, to, loadPerformanceData, loadCompanyMovements]);
  
  // ==========================================================================
  // RENDU
  // ==========================================================================
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Contrôle & Audit</h1>
                <p className="text-sm text-gray-600">Sessions · Réconciliations · Validations CEO · Anomalies — {label}</p>
              </div>
              <div className="ml-4 px-3 py-1 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                <span className="text-xs font-medium text-blue-700 capitalize">
                  {userRole.replace('_', ' ')}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  className={`px-3 py-1.5 rounded text-sm font-medium ${range === 'jour' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                  onClick={() => setRange('jour')}
                >
                  Jour
                </button>
                <button
                  className={`px-3 py-1.5 rounded text-sm font-medium ${range === 'semaine' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                  onClick={() => setRange('semaine')}
                >
                  Semaine
                </button>
                <button
                  className={`px-3 py-1.5 rounded text-sm font-medium ${range === 'mois' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                  onClick={() => setRange('mois')}
                >
                  Mois
                </button>
                <button
                  className={`px-3 py-1.5 rounded text-sm font-medium ${range === 'custom' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                  onClick={() => setRange('custom')}
                >
                  Perso
                </button>
              </div>
              
              {range === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-1.5 text-sm"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                  />
                  <span className="text-gray-400">→</span>
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-1.5 text-sm"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                  />
                </div>
              )}
              
              <button
                onClick={loadPerformanceData}
                disabled={loading}
                className="p-2 rounded-lg border hover:bg-gray-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex overflow-x-auto pb-2">
          <nav className="flex space-x-1">
            <TabButton
              active={activeTab === 'dashboard'}
              onClick={() => setActiveTab('dashboard')}
              icon={<BarChart3 className="h-4 w-4" />}
              label="Tableau de bord"
            />
            <TabButton
              active={activeTab === 'reconciliation'}
              onClick={() => setActiveTab('reconciliation')}
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Réconciliation"
            />
            <TabButton
              active={activeTab === 'agencies'}
              onClick={() => setActiveTab('agencies')}
              icon={<Building2 className="h-4 w-4" />}
              label="Agences"
            />
            {['ceo', 'financial_director', 'company_accountant'].includes(userRole) && (
              <TabButton
                active={activeTab === 'movements'}
                onClick={() => setActiveTab('movements')}
                icon={<Receipt className="h-4 w-4" />}
                label="Mouvements"
              />
            )}
            <TabButton
              active={activeTab === 'reports'}
              onClick={() => setActiveTab('reports')}
              icon={<FileText className="h-4 w-4" />}
              label="Rapports"
            />
            {['ceo', 'financial_director'].includes(userRole) && (
              <TabButton
                active={activeTab === 'audit'}
                onClick={() => setActiveTab('audit')}
                icon={<Shield className="h-4 w-4" />}
                label="Audit"
              />
            )}
          </nav>
        </div>
      </div>
      
      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        {activeTab === 'dashboard' && (
          <DashboardTab 
            totals={totals}
            performanceData={performanceData}
            alerts={alerts}
            loading={loading}
            userRole={userRole}
            onSelectAgency={loadAgencyDetails}
          />
        )}
        
        {activeTab === 'reconciliation' && (
          <ReconciliationTab 
            performanceData={performanceData}
            loading={loading}
            userRole={userRole}
          />
        )}
        
        {activeTab === 'agencies' && (
          <AgenciesTab 
            agencies={agencies}
            performanceData={performanceData}
            loading={loading}
            onSelectAgency={loadAgencyDetails}
          />
        )}
        
        {activeTab === 'movements' && (
          <MovementsTab 
            movements={companyMovements}
            userRole={userRole}
          />
        )}
        
        {activeTab === 'reports' && (
          <ReportsTab 
            performanceData={performanceData}
            totals={totals}
            range={range}
            from={from}
            to={to}
            label={label}
          />
        )}
        
        {activeTab === 'audit' && (
          <AuditTab 
            userRole={userRole}
          />
        )}
      </div>
      
      {/* Modal Détails Agence */}
      {selectedAgency && agencyDetails && (
        <AgencyDetailsModal
          agency={agencyDetails}
          onClose={() => {
            setSelectedAgency(null);
            setAgencyDetails(null);
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// COMPOSANTS DES TABS
// ============================================================================

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      active 
        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-sm' 
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`}
    onClick={onClick}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const DashboardTab: React.FC<{
  totals: any;
  performanceData: AgencyPerformance[];
  alerts: AlertType[];
  loading: boolean;
  userRole: CompanyRole;
  onSelectAgency: (agencyId: string) => void;
}> = ({ totals, performanceData, alerts, loading, userRole, onSelectAgency }) => {
  const money = useFormatCurrency();
  return (
  <div className="space-y-6">
    {/* KPI Principaux */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        icon={<TrendingUp className="h-5 w-5" />}
        label="Chiffre d'affaires"
        value={money(totals.ventesTotal)}
        sublabel={`${money(totals.ventesGuichet)} guichet + ${money(totals.ventesEnLigne)} ligne`}
        trend="up"
      />
      <KpiCard
        icon={<Wallet className="h-5 w-5" />}
        label="Argent en caisse"
        value={money(totals.especesRecues)}
        sublabel={`Solde total: ${money(totals.soldeTotalCaisse)}`}
        trend={totals.soldeTotalCaisse >= 0 ? "up" : "down"}
      />
      <KpiCard
        icon={<CreditCard className="h-5 w-5" />}
        label="Argent compagnie"
        value={money(totals.mobileMoneyRecu + totals.onlineRecu)}
        sublabel={`${money(totals.mobileMoneyRecu)} MM + ${money(totals.onlineRecu)} ligne`}
        trend="up"
      />
      <KpiCard
        icon={<AlertTriangle className="h-5 w-5" />}
        label="Écart total"
        value={money(totals.ecartTotalEspeces)}
        sublabel={Math.abs(totals.ecartTotalEspeces) < 1000 ? "OK" : "À vérifier"}
        trend={Math.abs(totals.ecartTotalEspeces) < 1000 ? "up" : "down"}
      />
    </div>
    
    {/* Alertes */}
    {alerts.length > 0 && (
      <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold text-red-800">Alertes ({alerts.length})</h3>
          </div>
          <button className="text-sm text-red-600 hover:text-red-800">
            Tout marquer comme vu
          </button>
        </div>
        <div className="space-y-2">
          {alerts.slice(0, 3).map(alert => (
            <div key={alert.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
              <div>
                <div className="font-medium text-gray-900">{alert.title}</div>
                <div className="text-sm text-gray-600">{alert.message}</div>
                {alert.agencyName && (
                  <div className="text-xs text-gray-500 mt-1">Agence: {alert.agencyName}</div>
                )}
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium ${
                alert.severity === 'high' ? 'bg-red-100 text-red-700' :
                alert.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                'bg-yellow-100 text-yellow-700'
              }`}>
                {alert.severity === 'high' ? 'Critique' : alert.severity === 'medium' ? 'Important' : 'Info'}
              </div>
            </div>
          ))}
          {alerts.length > 3 && (
            <div className="text-center pt-2">
              <button className="text-sm text-blue-600 hover:text-blue-800">
                Voir les {alerts.length - 3} autres alertes
              </button>
            </div>
          )}
        </div>
      </div>
    )}
    
    {/* Performance Agences */}
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Performance par agence</h3>
          <span className="text-sm text-gray-600">
            {performanceData.length} agence{performanceData.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>
      
      {loading ? (
        <div className="p-8 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Chargement des données...</p>
        </div>
      ) : performanceData.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          Aucune donnée disponible pour la période sélectionnée
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agence</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CA Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CA Guichet</th>
                <th className="px6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CA Ligne</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Solde Caisse</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Écart</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {performanceData.map(agency => (
                <tr key={agency.agenceId} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{agency.agenceNom}</div>
                    {agency.ville && (
                      <div className="text-sm text-gray-500">{agency.ville}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900">{money(agency.ventesTotal)}</div>
                    <div className="text-sm text-gray-500">
                      {agency.nbReservations} réservations
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{money(agency.ventesGuichet)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{money(agency.ventesEnLigne)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`font-semibold ${
                      agency.soldeCaisse >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {money(agency.soldeCaisse)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`font-medium ${
                      Math.abs(agency.ecartEspeces) < 1000 ? 'text-gray-700' :
                      agency.ecartEspeces > 0 ? 'text-orange-700' : 'text-red-700'
                    }`}>
                      {money(agency.ecartEspeces)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      agency.statutCaisse === 'ok' ? 'bg-green-100 text-green-800' :
                      agency.statutCaisse === 'warning' ? 'bg-orange-100 text-orange-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {agency.statutCaisse === 'ok' ? 'OK' : 
                       agency.statutCaisse === 'warning' ? 'Attention' : 'Problème'}
                    </div>
                    {agency.hasAlert && (
                      <AlertTriangle className="h-4 w-4 text-red-500 ml-1 inline" />
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectAgency(agency.agenceId)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Détail
                      </button>
                      {['ceo', 'financial_director'].includes(userRole) && (
                        <button className="text-gray-600 hover:text-gray-800 text-sm">
                          Exporter
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">TOTAL</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">{money(totals.ventesTotal)}</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">{money(totals.ventesGuichet)}</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">{money(totals.ventesEnLigne)}</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">{money(totals.soldeTotalCaisse)}</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-900">{money(totals.ecartTotalEspeces)}</th>
                <th colSpan={2} className="px-6 py-3 text-left font-semibold text-gray-900">
                  {performanceData.filter(a => a.statutCaisse === 'ok').length} / {performanceData.length} OK
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  </div>
  );
};

const ReconciliationTab: React.FC<{
  performanceData: AgencyPerformance[];
  loading: boolean;
  userRole: CompanyRole;
}> = ({ performanceData, loading, userRole }) => {
  const money = useFormatCurrency();
  const [validating, setValidating] = useState<string | null>(null);
  
  const handleValidate = async (agencyId: string) => {
    if (!['ceo', 'financial_director', 'company_accountant'].includes(userRole)) return;
    
    setValidating(agencyId);
    // TODO: Implémenter la validation
    await new Promise(resolve => setTimeout(resolve, 1000));
    setValidating(null);
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle2 className="h-6 w-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Vérification d'équilibre</h3>
            <p className="text-sm text-gray-600">
              Compare les ventes déclarées avec l'argent réellement encaissé
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500 mb-1">Ventes totales agences</div>
            <div className="text-2xl font-bold text-gray-900">
              {money(performanceData.reduce((sum, a) => sum + a.ventesTotal, 0))}
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500 mb-1">Argent en caisse</div>
            <div className="text-2xl font-bold text-gray-900">
              {money(performanceData.reduce((sum, a) => sum + a.especesRecues, 0))}
            </div>
          </div>
          
          <div className={`p-4 rounded-lg ${
            Math.abs(performanceData.reduce((sum, a) => sum + a.ecartEspeces, 0)) < 1000
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100'
              : 'bg-gradient-to-r from-red-50 to-orange-50 border border-red-100'
          }`}>
            <div className="text-sm text-gray-500 mb-1">Écart global</div>
            <div className={`text-2xl font-bold ${
              Math.abs(performanceData.reduce((sum, a) => sum + a.ecartEspeces, 0)) < 1000
                ? 'text-green-700'
                : 'text-red-700'
            }`}>
              {money(performanceData.reduce((sum, a) => sum + a.ecartEspeces, 0))}
            </div>
            <div className="text-sm mt-1">
              {Math.abs(performanceData.reduce((sum, a) => sum + a.ecartEspeces, 0)) < 1000
                ? '✓ Équilibre respecté'
                : '⚠️ Déséquilibre détecté'}
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Réconciliation par agence</h3>
            {['ceo', 'financial_director'].includes(userRole) && (
              <Button variant="primary" className="text-sm">
                Valider toute la période
              </Button>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agence</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ventes Guichet</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espèces Attendues</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espèces Reçues</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Écart</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {performanceData.map(agency => (
                  <tr key={agency.agenceId}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{agency.agenceNom}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{money(agency.ventesGuichet)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{money(agency.ventesGuichet)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{money(agency.especesRecues)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`font-semibold ${
                        Math.abs(agency.ecartEspeces) < 1000 ? 'text-gray-700' :
                        agency.ecartEspeces > 0 ? 'text-orange-700' : 'text-red-700'
                      }`}>
                        {money(agency.ecartEspeces)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        Math.abs(agency.ecartEspeces) < 1000 ? 'bg-green-100 text-green-800' :
                        Math.abs(agency.ecartEspeces) < 10000 ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {Math.abs(agency.ecartEspeces) < 1000 ? 'OK' : 
                         Math.abs(agency.ecartEspeces) < 10000 ? 'Attention' : 'Problème'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {['ceo', 'financial_director', 'company_accountant'].includes(userRole) ? (
                        <button
                          onClick={() => handleValidate(agency.agenceId)}
                          disabled={validating === agency.agenceId}
                          className={`px-4 py-2 rounded-lg text-sm font-medium ${
                            Math.abs(agency.ecartEspeces) < 1000
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {validating === agency.agenceId ? 'Validation...' : 'Valider'}
                        </button>
                      ) : (
                        <span className="text-gray-500 text-sm">Lecture seule</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const AgenciesTab: React.FC<{
  agencies: { id: string; nom: string; ville?: string }[];
  performanceData: AgencyPerformance[];
  loading: boolean;
  onSelectAgency: (agencyId: string) => void;
}> = ({ agencies, performanceData, loading, onSelectAgency }) => {
  const money = useFormatCurrency();
  return (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {agencies.map(agency => {
      const perf = performanceData.find(p => p.agenceId === agency.id);
      
      return (
        <div key={agency.id} className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{agency.nom}</h3>
                {agency.ville && (
                  <p className="text-sm text-gray-600">{agency.ville}</p>
                )}
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                perf?.statutCaisse === 'ok' ? 'bg-green-100' :
                perf?.statutCaisse === 'warning' ? 'bg-orange-100' : 'bg-red-100'
              }`}>
                <Building2 className={`h-5 w-5 ${
                  perf?.statutCaisse === 'ok' ? 'text-green-600' :
                  perf?.statutCaisse === 'warning' ? 'text-orange-600' : 'text-red-600'
                }`} />
              </div>
            </div>
            
            {perf ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Chiffre d'affaires</div>
                    <div className="font-semibold text-gray-900">{money(perf.ventesTotal)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Solde caisse</div>
                    <div className={`font-semibold ${
                      perf.soldeCaisse >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {money(perf.soldeCaisse)}
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="text-sm text-gray-500">Écart espèces</div>
                  <div className={`font-medium ${
                    Math.abs(perf.ecartEspeces) < 1000 ? 'text-gray-700' :
                    perf.ecartEspeces > 0 ? 'text-orange-700' : 'text-red-700'
                  }`}>
                    {money(perf.ecartEspeces)}
                  </div>
                </div>
                
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {perf.nbReservations} réservations
                    </span>
                    <span className="text-gray-600">
                      {perf.nbBillets} billets
                    </span>
                  </div>
                </div>
              </div>
            ) : loading ? (
              <div className="py-8 text-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-gray-400 border-r-transparent"></div>
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                Aucune donnée disponible
              </div>
            )}
          </div>
          
          <div className="px-6 py-4 bg-gray-50 border-t">
            <button
              onClick={() => onSelectAgency(agency.id)}
              className="w-full px-4 py-2 bg-white border rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
            >
              Voir le détail
            </button>
          </div>
        </div>
      );
    })}
  </div>
  );
};

const MovementsTab: React.FC<{
  movements: CompanyMovement[];
  userRole: CompanyRole;
}> = ({ movements, userRole }) => {
  const money = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: 'depense' as 'depense' | 'entree',
    category: '',
    amount: '',
    label: '',
    method: 'cash' as 'cash' | 'bank' | 'cheque' | 'mobile_money',
    note: ''
  });
  
  const canEdit = ['ceo', 'financial_director', 'company_accountant'].includes(userRole);
  
  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Nouveau mouvement</h3>
            <Button
              variant="primary"
              onClick={() => setShowForm(!showForm)}
              className="text-sm"
            >
              {showForm ? 'Annuler' : 'Ajouter un mouvement'}
            </Button>
          </div>
          
          {showForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value as any})}
                  >
                    <option value="depense">Dépense</option>
                    <option value="entree">Entrée</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Moyen de paiement</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2"
                    value={formData.method}
                    onChange={e => setFormData({...formData, method: e.target.value as any})}
                  >
                    <option value="cash">Espèces</option>
                    <option value="bank">Virement bancaire</option>
                    <option value="cheque">Chèque</option>
                    <option value="mobile_money">Mobile Money</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Libellé</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Ex: Achat fournitures bureau"
                  value={formData.label}
                  onChange={e => setFormData({...formData, label: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Montant ({currencySymbol})</label>
                <input
                  type="number"
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="0"
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Note (facultatif)</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                  placeholder="Informations complémentaires..."
                  value={formData.note}
                  onChange={e => setFormData({...formData, note: e.target.value})}
                />
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <Button
                  variant="primary"
                  onClick={() => {
                    // TODO: Sauvegarder le mouvement
                    setShowForm(false);
                    setFormData({
                      type: 'depense',
                      category: '',
                      amount: '',
                      label: '',
                      method: 'cash',
                      note: ''
                    });
                  }}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Historique des mouvements</h3>
        </div>
        
        {movements.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Aucun mouvement enregistré
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Libellé</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Moyen</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Créé par</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {movements.map(movement => (
                  <tr key={movement.id}>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {movement.createdAt?.toDate?.().toLocaleDateString('fr-FR') || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        movement.type === 'entree' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {movement.type === 'entree' ? 'Entrée' : 'Dépense'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{movement.label}</div>
                      {movement.note && (
                        <div className="text-sm text-gray-500">{movement.note}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {movement.method === 'cash' ? 'Espèces' :
                         movement.method === 'bank' ? 'Banque' :
                         movement.method === 'cheque' ? 'Chèque' : 'Mobile Money'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`font-semibold ${
                        movement.type === 'entree' ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {money(movement.amount)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{movement.createdByName}</div>
                    </td>
                    <td className="px-6 py-4">
                      {movement.validated ? (
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Validé
                        </div>
                      ) : (
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          En attente
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const ReportsTab: React.FC<{
  performanceData: AgencyPerformance[];
  totals: any;
  range: RangeKey;
  from: Date;
  to: Date;
  label: string;
}> = ({ performanceData, totals, range, from, to, label }) => {
  const money = useFormatCurrency();
  const exportPDF = () => {
    // TODO: Implémenter l'export PDF
    alert('Export PDF à implémenter');
  };
  
  const exportExcel = () => {
    const data = performanceData.map(agency => ({
      Agence: agency.agenceNom,
      'CA Total': agency.ventesTotal,
      'CA Guichet': agency.ventesGuichet,
      'CA Ligne': agency.ventesEnLigne,
      'Espèces Reçues': agency.especesRecues,
      'Solde Caisse': agency.soldeCaisse,
      'Écart': agency.ecartEspeces,
      'Statut': agency.statutCaisse === 'ok' ? 'OK' : agency.statutCaisse === 'warning' ? 'Attention' : 'Problème'
    }));
    
    // TODO: Implémenter l'export Excel propre
    console.log('Données à exporter:', data);
    alert('Export Excel à implémenter');
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Rapports financiers</h3>
            <p className="text-sm text-gray-600">Générez des rapports détaillés pour la période</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={exportExcel}
              className="text-sm"
            >
              <Download className="h-4 w-4 inline mr-2" />
              Export Excel
            </Button>
            <Button
              variant="danger"
              onClick={exportPDF}
              className="text-sm"
            >
              <FileText className="h-4 w-4 inline mr-2" />
              Export PDF
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ReportCard
            title="Rapport financier complet"
            description="Synthèse détaillée de l'ensemble des données financières"
            icon={<BarChart3 className="h-6 w-6" />}
            onGenerate={() => console.log('Générer rapport complet')}
          />
          
          <ReportCard
            title="Réconciliation par agence"
            description="Vérification détaillée des écarts par agence"
            icon={<CheckCircle2 className="h-6 w-6" />}
            onGenerate={() => console.log('Générer rapport réconciliation')}
          />
          
          <ReportCard
            title="Analyse des performances"
            description="Tendances et comparaisons périodiques"
            icon={<TrendingUp className="h-6 w-6" />}
            onGenerate={() => console.log('Générer analyse performances')}
          />
        </div>
      </div>
      
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Aperçu des données</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-500">Période</div>
                <div className="font-medium text-gray-900">{label}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-500">Nombre d'agences</div>
                <div className="font-medium text-gray-900">{performanceData.length}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-500">Réservations totales</div>
                <div className="font-medium text-gray-900">{formatNumber(totals.nbReservations)}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-500">Billets vendus</div>
                <div className="font-medium text-gray-900">{formatNumber(totals.nbBillets)}</div>
              </div>
            </div>
            
            <div className="pt-4 border-t">
              <h4 className="font-medium text-gray-900 mb-3">Résumé financier</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Chiffre d'affaires total:</span>
                    <span className="font-medium">{money(totals.ventesTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Argent en caisse agences:</span>
                    <span className="font-medium">{money(totals.especesRecues)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Argent compagnie (MM + ligne):</span>
                    <span className="font-medium">{money(totals.mobileMoneyRecu + totals.onlineRecu)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Solde total des caisses:</span>
                    <span className={`font-medium ${
                      totals.soldeTotalCaisse >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {money(totals.soldeTotalCaisse)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Écart total espèces:</span>
                    <span className={`font-medium ${
                      Math.abs(totals.ecartTotalEspeces) < 1000 ? 'text-gray-700' : 'text-orange-700'
                    }`}>
                      {money(totals.ecartTotalEspeces)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Agences avec alertes:</span>
                    <span className="font-medium">
                      {performanceData.filter(a => a.hasAlert).length} / {performanceData.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuditTab: React.FC<{
  userRole: CompanyRole;
}> = ({ userRole }) => {
  if (!['ceo', 'financial_director'].includes(userRole)) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Accès restreint</h3>
        <p className="text-gray-600">
          Cette section est réservée aux directeurs financiers et CEO.
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-6 w-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Audit et traçabilité</h3>
            <p className="text-sm text-gray-600">
              Historique complet des actions et modifications
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500 mb-1">Validations récentes</div>
            <div className="text-2xl font-bold text-gray-900">12</div>
            <div className="text-sm text-gray-600 mt-1">7 derniers jours</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500 mb-1">Modifications</div>
            <div className="text-2xl font-bold text-gray-900">47</div>
            <div className="text-sm text-gray-600 mt-1">Ce mois</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-sm text-gray-500 mb-1">Connexions suspectes</div>
            <div className="text-2xl font-bold text-gray-900">0</div>
            <div className="text-sm text-green-600 mt-1">✓ Aucune alerte</div>
          </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Journal d'audit</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-gray-900">Validation de réconciliation</div>
                    <div className="text-sm text-gray-500">Il y a {i} heures</div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    La réconciliation de l'agence "Dakar Plateau" a été validée par Jean Dupont.
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Utilisateur: Jean Dupont</span>
                    <span>IP: 192.168.1.{i}</span>
                    <span>Navigateur: Chrome</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPOSANTS UTILITAIRES
// ============================================================================

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  trend?: 'up' | 'down' | 'neutral';
}> = ({ icon, label, value, sublabel, trend = 'neutral' }) => (
  <div className="bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between mb-4">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
        trend === 'up' ? 'bg-green-100' :
        trend === 'down' ? 'bg-red-100' : 'bg-gray-100'
      }`}>
        <span className={trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600'}>
          {icon}
        </span>
      </div>
    </div>
    <div className="space-y-1">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sublabel && <div className="text-sm text-gray-600">{sublabel}</div>}
    </div>
  </div>
);

const ReportCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onGenerate: () => void;
}> = ({ title, description, icon, onGenerate }) => (
  <div className="bg-gray-50 rounded-lg border p-6 hover:bg-gray-100 transition-colors">
    <div className="flex items-center gap-3 mb-4">
      <div className="h-10 w-10 rounded-lg bg-white border flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
    <button
      onClick={onGenerate}
      className="w-full px-4 py-2 bg-white border rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
    >
      Générer le rapport
    </button>
  </div>
);

const AgencyDetailsModal: React.FC<{
  agency: any;
  onClose: () => void;
}> = ({ agency, onClose }) => {
  const money = useFormatCurrency();
  return (
  <div className="fixed inset-0 z-50">
    <div className="absolute inset-0 bg-black/50" onClick={onClose} />
    <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl">
      <div className="h-full flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{agency.nom}</h3>
            {agency.ville && (
              <p className="text-sm text-gray-600">{agency.ville}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            ×
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-6">
          {agency.performance ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-500">Chiffre d'affaires</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {money(agency.performance.ventesTotal)}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-500">Solde caisse</div>
                  <div className={`text-2xl font-bold ${
                    agency.performance.soldeCaisse >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {money(agency.performance.soldeCaisse)}
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Détails financiers</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ventes guichet:</span>
                    <span className="font-medium">{money(agency.performance.ventesGuichet)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ventes en ligne:</span>
                    <span className="font-medium">{money(agency.performance.ventesEnLigne)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Espèces reçues:</span>
                    <span className="font-medium">{money(agency.performance.especesRecues)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Écart espèces:</span>
                    <span className={`font-medium ${
                      Math.abs(agency.performance.ecartEspeces) < 1000 ? 'text-gray-700' : 'text-orange-700'
                    }`}>
                      {money(agency.performance.ecartEspeces)}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Statistiques</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border rounded-lg p-4">
                    <div className="text-sm text-gray-500">Réservations</div>
                    <div className="text-xl font-bold text-gray-900">
                      {formatNumber(agency.performance.nbReservations)}
                    </div>
                  </div>
                  <div className="bg-white border rounded-lg p-4">
                    <div className="text-sm text-gray-500">Billets vendus</div>
                    <div className="text-xl font-bold text-gray-900">
                      {formatNumber(agency.performance.nbBillets)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Aucune donnée disponible
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t bg-gray-50">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Fermer
            </button>
            <Button variant="primary">
              Exporter rapport
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default CompagnieComptabilitePage;