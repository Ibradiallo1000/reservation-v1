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
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
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
import { MetricCard, SectionCard, StatusBadge } from '@/ui';

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
  const money = useFormatCurrency();
  
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
  const fmtMoney = (n: number) => money(n);
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
    <div className="space-y-6">
      {/* ================= EN-TÊTE ================= */}
      <SectionCard
        title="Vue Globale Compagnie"
        icon={Globe}
        help={<span className="text-sm font-normal text-gray-500">Tableau de bord financier multi-agences</span>}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-gray-300 p-1 bg-gray-50">
              {(['today', 'week', 'month', 'all'] as const).map((p) => (
                <button
                  key={p}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${period === p ? 'bg-white border border-gray-200 shadow-sm text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
                  onClick={() => setPeriod(p)}
                >
                  {p === 'today' ? 'Aujourd\'hui' : p === 'week' ? '7 jours' : p === 'month' ? '30 jours' : 'Toutes'}
                </button>
              ))}
            </div>
            <button
              onClick={loadGlobalData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </button>
          </div>
        }
      >
        <div className="text-sm text-gray-600">
          Période analysée: {fmtDate(getDateRange().start)} → {fmtDate(getDateRange().end)}
        </div>
      </SectionCard>

      {/* ================= KPIs PRINCIPAUX ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <MetricCard
          label="Réservations totales"
          value={globalStats.totalReservations.toString()}
          icon={CreditCard}
        />
        <MetricCard
          label="Chiffre d'affaires"
          value={fmtMoney(globalStats.totalAmount)}
          icon={TrendingUp}
          valueColorVar={theme.primary}
        />
        <MetricCard
          label="Agences"
          value={`${globalStats.totalAgencies} (${globalStats.activeAgencies} actives)`}
          icon={Building2}
        />
        <MetricCard
          label="Validations en attente"
          value={globalStats.pendingValidations.toString()}
          icon={AlertTriangle}
        />
      </div>

      {/* ================= DEUX COLONNES ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* RÉPARTITION DES PAIEMENTS */}
        <SectionCard
          title="Répartition des paiements"
          right={<span className="text-sm text-gray-600">{fmtMoney(globalStats.totalAmount)}</span>}
        >
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
        </SectionCard>
        
        {/* TOP 5 AGENCES */}
        <SectionCard
          title="Top 5 Agences (CA)"
          icon={Building2}
          right={<span className="text-sm text-gray-600">{agenciesData.filter(a => a.amount > 0).length} agences avec activité</span>}
        >
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
                  <div key={agency.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gray-200 flex items-center justify-center">
                        <div className="text-sm font-bold text-gray-700">#{index + 1}</div>
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
        </SectionCard>
      </div>

      {/* ================= ALERTES ================= */}
      {alerts.length > 0 && (
        <SectionCard
          title="Alertes et notifications"
          icon={AlertTriangle}
          help={<span className="text-sm font-normal text-gray-500">Points nécessitant votre attention</span>}
          right={<StatusBadge status="warning">{alerts.length} alerte{alerts.length > 1 ? 's' : ''}</StatusBadge>}
        >
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={index} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900">{alert.title}</div>
                  <StatusBadge status={alert.type === 'error' ? 'danger' : alert.type === 'warning' ? 'warning' : 'info'}>
                    {alert.type === 'error' ? 'Urgent' : alert.type === 'warning' ? 'Avertissement' : 'Information'}
                  </StatusBadge>
                </div>
                <div className="text-sm text-gray-600 mt-1">{alert.description}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ================= RÉSERVATIONS RÉCENTES ================= */}
      <SectionCard
        title="Réservations récentes"
        icon={Receipt}
        right={<span className="text-sm text-gray-600">{recentReservations.length} plus récentes</span>}
        noPad
      >
        {recentReservations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Aucune réservation récente
          </div>
        ) : (
          <div className="overflow-hidden border border-gray-200 rounded-lg">
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
                          <StatusBadge status="info">{reservation.agencyName || 'Agence inconnue'}</StatusBadge>
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
                          <StatusBadge status={reservation.statut === 'confirme' ? 'success' : reservation.statut === 'en_attente' ? 'pending' : reservation.statut === 'verification' ? 'warning' : 'neutral'}>
                            {reservation.statut === 'confirme' ? 'Réservation confirmée' : reservation.statut === 'en_attente' ? 'En attente' : reservation.statut === 'verification' ? 'En attente de validation' : reservation.statut || 'Inconnu'}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default VueGlobale;