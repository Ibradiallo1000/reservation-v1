// src/pages/chef-comptable/VueGlobale.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  Timestamp,
  orderBy,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import {
  Globe,
  TrendingUp,
  Building2,
  AlertTriangle,
  CreditCard,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  BarChart3,
  Wallet,
  Smartphone,
  Receipt
} from 'lucide-react';

// Type pour les agences
interface Agency {
  id: string;
  nomAgence?: string;
  nom?: string;
  ville?: string;
  city?: string;
  [key: string]: any;
}

// Type pour les réservations
interface ReservationData {
  id: string;
  nomClient?: string;
  telephone?: string;
  depart?: string;
  arrivee?: string;
  montant?: number;
  statut?: string;
  canal?: string;
  paiement?: string;
  createdAt?: Timestamp | Date;
  agencyId?: string;
  agencyName?: string;
  [key: string]: any;
}

const VueGlobale: React.FC = () => {
  const { user, company } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#3b82f6' };
  
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [globalStats, setGlobalStats] = useState({
    totalReservations: 0,
    totalAmount: 0,
    totalAgencies: 0,
    activeAgencies: 0,
    pendingValidations: 0,
    totalOnlineAmount: 0,
    cashAmount: 0,
    mobileMoneyAmount: 0
  });
  
  const [agenciesData, setAgenciesData] = useState<Array<{
    id: string;
    name: string;
    ville: string;
    reservations: number;
    amount: number;
    onlineReservations: number;
    onlineAmount: number;
    lastActivity: Date | null;
  }>>([]);
  
  const [recentReservations, setRecentReservations] = useState<ReservationData[]>([]);
  const [alerts, setAlerts] = useState<Array<{
    type: 'warning' | 'info' | 'error';
    title: string;
    description: string;
  }>>([]);

  // Calcul de la période
  const getDateRange = () => {
    const now = new Date();
    const start = new Date();
    
    switch (period) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        break;
      case 'month':
        start.setMonth(now.getMonth() - 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'all':
        start.setFullYear(2020);
        break;
    }
    
    return { start, end: now };
  };

  // Chargement des données
  useEffect(() => {
    if (!user?.companyId) return;
    
    loadGlobalData();
  }, [user?.companyId, period]);

  const loadGlobalData = async () => {
    setLoading(true);
    
    try {
      const dateRange = getDateRange();
      
      // 1. Charger toutes les agences
      const agenciesRef = collection(db, `companies/${user.companyId}/agences`);
      const agenciesSnap = await getDocs(agenciesRef);
      const agenciesList: Agency[] = agenciesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // 2. Charger toutes les réservations pour la période
      let totalReservations = 0;
      let totalAmount = 0;
      let pendingValidations = 0;
      let totalOnlineAmount = 0;
      let cashAmount = 0;
      let mobileMoneyAmount = 0;
      
      const agencyStats: Record<string, any> = {};
      const allReservations: ReservationData[] = [];
      
      // Pour chaque agence, charger les réservations
      for (const agency of agenciesList) {
        const agencyId = agency.id;
        const reservationsRef = collection(db, `companies/${user.companyId}/agences/${agencyId}/reservations`);
        
        const q = query(
          reservationsRef,
          where('createdAt', '>=', Timestamp.fromDate(dateRange.start)),
          where('createdAt', '<=', Timestamp.fromDate(dateRange.end)),
          orderBy('createdAt', 'desc')
        );
        
        const snap = await getDocs(q);
        
        let agencyReservations = 0;
        let agencyAmount = 0;
        let agencyOnlineReservations = 0;
        let agencyOnlineAmount = 0;
        
        snap.forEach(doc => {
          const data = doc.data() as ReservationData;
          totalReservations++;
          agencyReservations++;
          
          const amount = data.montant || 0;
          totalAmount += amount;
          agencyAmount += amount;
          
          // Vérifier le statut
          if (data.statut === 'en_attente' || data.statut === 'verification') {
            pendingValidations++;
          }
          
          // Vérifier le canal
          const canal = String(data.canal || '').toLowerCase();
          if (canal === 'en_ligne') {
            totalOnlineAmount += amount;
            agencyOnlineReservations++;
            agencyOnlineAmount += amount;
          }
          
          // Vérifier le paiement
          const paiement = String(data.paiement || '').toLowerCase();
          if (paiement.includes('esp') || paiement.includes('cash')) {
            cashAmount += amount;
          }
          if (paiement.includes('mobile') || paiement.includes('mm') || paiement.includes('orange') || paiement.includes('mtn')) {
            mobileMoneyAmount += amount;
          }
          
          // Ajouter aux réservations récentes
          allReservations.push({
            ...data,
            id: doc.id,
            agencyId,
            agencyName: agency.nomAgence || agency.nom || agency.ville || 'Agence',
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date()
          });
        });
        
        agencyStats[agencyId] = {
          reservations: agencyReservations,
          amount: agencyAmount,
          onlineReservations: agencyOnlineReservations,
          onlineAmount: agencyOnlineAmount,
          lastActivity: snap.docs[0]?.data()?.createdAt || null
        };
      }
      
      // 3. Préparer les données des agences
      const processedAgenciesData = agenciesList.map((agency: Agency) => {
        const stats = agencyStats[agency.id] || { 
          reservations: 0, 
          amount: 0, 
          onlineReservations: 0, 
          onlineAmount: 0 
        };
        
        // Gérer le lastActivity (peut être Timestamp, Date ou null)
        let lastActivityDate: Date | null = null;
        const lastActivity = stats.lastActivity;
        if (lastActivity instanceof Timestamp) {
          lastActivityDate = lastActivity.toDate();
        } else if (lastActivity instanceof Date) {
          lastActivityDate = lastActivity;
        } else if (lastActivity && typeof lastActivity === 'object' && 'toDate' in lastActivity) {
          lastActivityDate = (lastActivity as any).toDate();
        }
        
        return {
          id: agency.id,
          name: agency.nomAgence || agency.nom || agency.ville || 'Agence',
          ville: agency.ville || agency.city || '',
          reservations: stats.reservations,
          amount: stats.amount,
          onlineReservations: stats.onlineReservations,
          onlineAmount: stats.onlineAmount,
          lastActivity: lastActivityDate
        };
      });
      
      // 4. Trier les réservations récentes
      const sortedReservations = allReservations
        .sort((a, b) => {
          const dateA = a.createdAt instanceof Date ? a.createdAt : new Date();
          const dateB = b.createdAt instanceof Date ? b.createdAt : new Date();
          return dateB.getTime() - dateA.getTime();
        })
        .slice(0, 10);
      
      // 5. Détecter les alertes
      const alertsList: Array<any> = [];
      
      // Alertes pour agences inactives
      processedAgenciesData.forEach(agency => {
        if (agency.lastActivity) {
          const daysSinceActivity = Math.floor(
            (new Date().getTime() - agency.lastActivity.getTime()) / (1000 * 60 * 60 * 24)
          );
          
          if (daysSinceActivity > 7) {
            alertsList.push({
              type: 'warning',
              title: `Agence ${agency.name} inactive`,
              description: `Aucune activité depuis ${daysSinceActivity} jours`
            });
          }
        }
      });
      
      // Alerte pour validations en attente
      if (pendingValidations > 5) {
        alertsList.push({
          type: 'info',
          title: `${pendingValidations} validations en attente`,
          description: 'Des réservations nécessitent votre attention'
        });
      }
      
      // 6. Mettre à jour l'état
      setGlobalStats({
        totalReservations,
        totalAmount,
        totalAgencies: agenciesList.length,
        activeAgencies: processedAgenciesData.filter(a => a.reservations > 0).length,
        pendingValidations,
        totalOnlineAmount,
        cashAmount,
        mobileMoneyAmount
      });
      
      setAgenciesData(processedAgenciesData);
      setRecentReservations(sortedReservations);
      setAlerts(alertsList);
      
    } catch (error) {
      console.error('[VueGlobale] Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  // Formatters
  const fmtMoney = (n: number) => `${(n || 0).toLocaleString('fr-FR')} FCFA`;
  const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
  const fmtDateTime = (d: Date) => d.toLocaleString('fr-FR', { 
    day: '2-digit', 
    month: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  // Composants UI
  const KpiCard: React.FC<{
    icon: React.ReactNode; 
    label: string; 
    value: string; 
    sublabel?: string;
    theme: { primary: string; secondary: string };
    emphasis: boolean;
  }> = ({ icon, label, value, sublabel, theme, emphasis }) => (
    <div
      className={`relative overflow-hidden rounded-2xl border border-gray-200 p-5 bg-white shadow-sm
        hover:shadow-md transition-all duration-300
        ${emphasis ? 'ring-2 ring-offset-2' : ''}`}
      style={
        emphasis
          ? { ['--tw-ring-color' as any]: theme.primary }
          : undefined
      }
    >
      <div className="absolute top-0 right-0 h-20 w-20 opacity-10">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full blur-xl"></div>
      </div>
      
      <div className="flex items-start justify-between mb-4">
        <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">{label}</div>
        <div className="h-10 w-10 rounded-xl grid place-items-center"
             style={{background: `linear-gradient(135deg, ${theme.primary}20, ${theme.secondary}20)`}}>
          <span className="text-gray-700">{icon}</span>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className={`font-bold ${emphasis ? 'text-3xl' : 'text-2xl'} text-gray-900`}>{value}</div>
        {sublabel && <div className="text-xs font-medium text-gray-500">{sublabel}</div>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-gray-600">Chargement des données globales...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ================= EN-TÊTE ================= */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-6 bg-gradient-to-r from-white to-gray-50/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
              <Globe className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">Vue Globale Compagnie</div>
              <div className="text-sm text-gray-600">Tableau de bord financier multi-agences</div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Sélecteur de période */}
            <div className="flex rounded-xl border border-gray-300 p-1 bg-white">
              <button
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === 'today' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setPeriod('today')}
              >
                Aujourd'hui
              </button>
              <button
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === 'week' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setPeriod('week')}
              >
                7 jours
              </button>
              <button
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === 'month' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setPeriod('month')}
              >
                30 jours
              </button>
              <button
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === 'all' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setPeriod('all')}
              >
                Toutes
              </button>
            </div>
            
            <button
              onClick={loadGlobalData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </button>
          </div>
        </div>
        
        {/* Période affichée */}
        <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100/50 border border-gray-200">
          <div className="text-sm text-gray-600">
            Période analysée: {fmtDate(getDateRange().start)} → {fmtDate(getDateRange().end)}
          </div>
        </div>
      </div>

      {/* ================= KPIs PRINCIPAUX ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <KpiCard 
          icon={<CreditCard className="h-6 w-6" />} 
          label="Réservations totales" 
          value={globalStats.totalReservations.toString()} 
          sublabel={`${globalStats.activeAgencies}/${globalStats.totalAgencies} agences actives`}
          theme={theme}
          emphasis={false}
        />
        <KpiCard 
          icon={<TrendingUp className="h-6 w-6" />} 
          label="Chiffre d'affaires" 
          value={fmtMoney(globalStats.totalAmount)} 
          sublabel={`${fmtMoney(globalStats.totalOnlineAmount)} en ligne`}
          theme={theme}
          emphasis={true}
        />
        <KpiCard 
          icon={<Building2 className="h-6 w-6" />} 
          label="Agences" 
          value={globalStats.totalAgencies.toString()} 
          sublabel={`${globalStats.activeAgencies} avec activité`}
          theme={theme}
          emphasis={false}
        />
        <KpiCard 
          icon={<AlertTriangle className="h-6 w-6" />} 
          label="Validations en attente" 
          value={globalStats.pendingValidations.toString()} 
          sublabel="Nécessitent votre attention"
          theme={theme}
          emphasis={false}
        />
      </div>

      {/* ================= DEUX COLONNES ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* RÉPARTITION DES PAIEMENTS */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="text-lg font-bold text-gray-900">Répartition des paiements</div>
            <div className="text-sm text-gray-600">
              {fmtMoney(globalStats.totalAmount)}
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Espèces */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-700">Espèces</span>
                <span className="text-gray-900">
                  {fmtMoney(globalStats.cashAmount)} 
                  ({globalStats.totalAmount > 0 ? ((globalStats.cashAmount / globalStats.totalAmount) * 100).toFixed(1) : '0'}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div 
                  className="h-full rounded-full bg-blue-500"
                  style={{ 
                    width: `${globalStats.totalAmount > 0 ? (globalStats.cashAmount / globalStats.totalAmount) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
            
            {/* Mobile Money */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-700">Mobile Money</span>
                <span className="text-gray-900">
                  {fmtMoney(globalStats.mobileMoneyAmount)} 
                  ({globalStats.totalAmount > 0 ? ((globalStats.mobileMoneyAmount / globalStats.totalAmount) * 100).toFixed(1) : '0'}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div 
                  className="h-full rounded-full bg-green-500"
                  style={{ 
                    width: `${globalStats.totalAmount > 0 ? (globalStats.mobileMoneyAmount / globalStats.totalAmount) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
            
            {/* En ligne */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-700">En ligne</span>
                <span className="text-gray-900">
                  {fmtMoney(globalStats.totalOnlineAmount)} 
                  ({globalStats.totalAmount > 0 ? ((globalStats.totalOnlineAmount / globalStats.totalAmount) * 100).toFixed(1) : '0'}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                <div 
                  className="h-full rounded-full bg-purple-500"
                  style={{ 
                    width: `${globalStats.totalAmount > 0 ? (globalStats.totalOnlineAmount / globalStats.totalAmount) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* TOP 5 AGENCES */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="text-lg font-bold text-gray-900">Top 5 Agences (CA)</div>
            <div className="text-sm text-gray-600">
              {agenciesData.filter(a => a.amount > 0).length} agences avec activité
            </div>
          </div>
          
          {agenciesData.filter(a => a.amount > 0).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Aucune activité d'agence sur la période
            </div>
          ) : (
            <div className="space-y-4">
              {agenciesData
                .filter(a => a.amount > 0)
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 5)
                .map((agency, index) => (
                  <div key={agency.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                        <div className="text-sm font-bold text-blue-600">#{index + 1}</div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{agency.name}</div>
                        <div className="text-xs text-gray-500">{agency.ville}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">{fmtMoney(agency.amount)}</div>
                      <div className="text-xs text-gray-500">{agency.reservations} réservations</div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ================= ALERTES ================= */}
      {alerts.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-r from-white to-gray-50/50 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-gray-900">Alertes et notifications</div>
                <div className="text-sm text-amber-700">Points nécessitant votre attention</div>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
              {alerts.length} alerte{alerts.length > 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={index} className={`p-3 rounded-lg border ${
                alert.type === 'error' ? 'border-red-200 bg-red-50' :
                alert.type === 'warning' ? 'border-amber-200 bg-amber-50' :
                'border-blue-200 bg-blue-50'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{alert.title}</div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    alert.type === 'error' ? 'bg-red-100 text-red-800' :
                    alert.type === 'warning' ? 'bg-amber-100 text-amber-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {alert.type === 'error' ? 'Urgent' : alert.type === 'warning' ? 'Avertissement' : 'Information'}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mt-1">{alert.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= RÉSERVATIONS RÉCENTES ================= */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="text-lg font-bold text-gray-900">Réservations récentes</div>
          <div className="text-sm text-gray-600">
            {recentReservations.length} plus récentes
          </div>
        </div>
        
        {recentReservations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Aucune réservation récente
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Agence
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Trajet
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Montant
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Statut
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentReservations.map((reservation, index) => {
                    const createDate = reservation.createdAt instanceof Date 
                      ? reservation.createdAt 
                      : new Date();
                    
                    return (
                      <tr key={reservation.id} className={`hover:bg-gray-50/50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{fmtDateTime(createDate)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                            {reservation.agencyName || 'Agence inconnue'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{reservation.nomClient || 'Sans nom'}</div>
                          {reservation.telephone && (
                            <div className="text-xs text-gray-500">{reservation.telephone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{reservation.depart || 'N/A'} → {reservation.arrivee || 'N/A'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-gray-900">{fmtMoney(reservation.montant || 0)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            reservation.statut === 'confirme' ? 'bg-emerald-100 text-emerald-800' :
                            reservation.statut === 'en_attente' ? 'bg-amber-100 text-amber-800' :
                            reservation.statut === 'verification' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {reservation.statut === 'confirme' ? 'Confirmé' :
                             reservation.statut === 'en_attente' ? 'En attente' :
                             reservation.statut === 'verification' ? 'À vérifier' :
                             reservation.statut || 'Inconnu'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VueGlobale;