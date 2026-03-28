// src/pages/chef-comptable/Finances.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  collectionGroup,
  query, 
  where, 
  getDocs, 
  Timestamp,
  doc,
  getDoc,
  limit
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { canonicalStatut } from "@/utils/reservationStatusUtils";
import {
  TrendingUp,
  BarChart3,
  DollarSign,
  CreditCard,
  Smartphone,
  Wallet,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  TrendingDown,
  PieChart,
  AlertTriangle,
  Building2,
  Info,
  Calculator,
  Banknote,
  Smartphone as MobileIcon,
  Globe,
  ChevronRight
} from 'lucide-react';
import { MetricCard, SectionCard, StatusBadge } from '@/ui';

// Types
interface AgencyRevenue {
  id: string;
  name: string;
  revenue: number;
  guichetRevenue: number;
  onlineRevenue: number;
}

interface AgencyExpenses {
  id: string;
  name: string;
  total: number;
  salaries: number;
  operations: number;
  marketing: number;
  other: number;
}

interface FinancialData {
  period: {
    start: Date;
    end: Date;
    label: string;
    isCurrentMonth: boolean;
  };
  revenue: {
    total: number;
    ticketRevenue: number;
    courierRevenue: number;
    guichet: number;
    online: number;
    byAgency: AgencyRevenue[];
  };
  paymentMethods: {
    cash: number;
    mobileMoney: number;
    total: number;
  };
  expenses: {
    total: number | null;
    byAgency: AgencyExpenses[];
    detail: {
      salaries: number;
      operations: number;
      marketing: number;
      other: number;
    } | null;
  };
  agencies: {
    id: string;
    name: string;
    revenue: number;
    expenses: number | null;
    profit: number | null;
    margin: number | null;
  }[];
}

const Finances: React.FC = () => {
  const { user, company } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#3b82f6' };
  const money = useFormatCurrency();
  
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('day');
  const [customDateRange, setCustomDateRange] = useState<{start: Date | null, end: Date | null}>({start: null, end: null});
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // ==================== PÉRIODE PAR DÉFAUT : MOIS EN COURS ====================
  const getCurrentMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    return {
      start,
      end,
      label: start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
      isCurrentMonth: true
    };
  };

  const getDateRange = (type: typeof periodType, customStart?: Date, customEnd?: Date) => {
    const now = new Date();
    
    if (type === 'custom' && customStart && customEnd) {
      const end = new Date(customEnd);
      end.setHours(23, 59, 59);
      
      return {
        start: customStart,
        end,
        label: `${customStart.toLocaleDateString('fr-FR')} → ${customEnd.toLocaleDateString('fr-FR')}`,
        isCurrentMonth: false
      };
    }
    
    let start = new Date();
    let label = '';
    
    switch (type) {
      case 'day':
        start.setHours(0, 0, 0, 0);
        label = 'Aujourd\'hui';
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        label = '7 derniers jours';
        break;
      case 'month':
        const currentMonth = getCurrentMonthRange();
        return currentMonth;
      case 'quarter':
        start.setMonth(now.getMonth() - 3);
        start.setHours(0, 0, 0, 0);
        label = 'Trimestre écoulé';
        break;
      case 'year':
        start.setFullYear(now.getFullYear() - 1);
        start.setHours(0, 0, 0, 0);
        label = 'Année écoulée';
        break;
    }
    
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    return {
      start,
      end,
      label,
      isCurrentMonth: false
    };
  };

  // ==================== CHARGEMENT DES DONNÉES RÉELLES ====================
  useEffect(() => {
    if (!user?.companyId) return;
    
    loadFinancialData();
  }, [user?.companyId, periodType, customDateRange]);

  const loadFinancialData = async () => {
    setLoading(true);
    
    try {
      const dateRange = periodType === 'custom' && customDateRange.start && customDateRange.end
        ? getDateRange('custom', customDateRange.start, customDateRange.end)
        : getDateRange(periodType);
      
      // 1. Charger toutes les agences
      const agenciesRef = collection(db, `companies/${user.companyId}/agences`);
      const agenciesSnap = await getDocs(agenciesRef);
      const agenciesList = agenciesSnap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().nomAgence || doc.data().nom || doc.data().ville || 'Agence',
        ville: doc.data().ville || ''
      }));
      
      // 2. Charger dailyStats pour revenus globaux (billets + courrier)
      const startStr = dateRange.start.toISOString().slice(0, 10);
      const endStr = dateRange.end.toISOString().slice(0, 10);
      let ticketRevenueFromStats = 0;
      let courierRevenueFromStats = 0;
      try {
        const qDaily = query(
          collectionGroup(db, 'dailyStats'),
          where('companyId', '==', user.companyId),
          where('date', '>=', startStr),
          where('date', '<=', endStr),
          limit(2000)
        );
        const dailySnap = await getDocs(qDaily);
        dailySnap.docs.forEach(d => {
          const data = d.data();
          const ticket = Number(data.ticketRevenue ?? data.totalRevenue ?? 0);
          const courier = Number(data.courierRevenue ?? 0);
          ticketRevenueFromStats += ticket;
          courierRevenueFromStats += courier;
        });
      } catch (_) {
        // fallback: use reservation-based total only
      }

      // 3. Calculer le chiffre d'affaires par canal et par agence (réservations)
      const agencyRevenues: AgencyRevenue[] = [];
      let totalRevenue = 0;
      let guichetRevenue = 0;
      let onlineRevenue = 0;
      let cashRevenue = 0;
      let mobileMoneyRevenue = 0;
      
      for (const agency of agenciesList) {
        const reservationsRef = collection(db, 
          `companies/${user.companyId}/agences/${agency.id}/reservations`);
        
        // Récupérer les réservations de la période puis filtrer localement
        // pour accepter les variantes métier de statut (confirmé / payé).
        const q = query(
          reservationsRef,
          where('createdAt', '>=', Timestamp.fromDate(dateRange.start)),
          where('createdAt', '<=', Timestamp.fromDate(dateRange.end))
        );
        
        const snap = await getDocs(q);
        
        let agencyGuichetRevenue = 0;
        let agencyOnlineRevenue = 0;
        let agencyTotalRevenue = 0;
        
        snap.forEach(doc => {
          const data = doc.data();
          const statut = String(data.statut ?? '').toLowerCase();
          const normalized = canonicalStatut(statut);
          if (normalized !== 'paye' && statut !== 'confirme') return;
          const montant = data.montant || 0;
          agencyTotalRevenue += montant;
          
          // Classification par CANAL (guichet vs en ligne)
          const canal = String(data.canal || '').toLowerCase();
          if (canal === 'en_ligne') {
            agencyOnlineRevenue += montant;
            onlineRevenue += montant;
          } else {
            agencyGuichetRevenue += montant;
            guichetRevenue += montant;
          }
          
          // Classification par MOYEN DE PAIEMENT (pour répartition ultérieure)
          const paiement = String(data.paiement || '').toLowerCase();
          if (paiement.includes('cash') || paiement.includes('esp')) {
            cashRevenue += montant;
          } else if (paiement.includes('mobile') || paiement.includes('mtn') || 
                     paiement.includes('orange') || paiement.includes('wave')) {
            mobileMoneyRevenue += montant;
          }
        });
        
        totalRevenue += agencyTotalRevenue;
        
        agencyRevenues.push({
          id: agency.id,
          name: agency.name,
          revenue: agencyTotalRevenue,
          guichetRevenue: agencyGuichetRevenue,
          onlineRevenue: agencyOnlineRevenue
        });
      }
      
      // 4. Charger les dépenses par agence
      const agencyExpenses: AgencyExpenses[] = [];
      let totalExpenses: number | null = null;
      let expensesDetail = null;
      
      try {
        // Pour chaque agence, chercher les dépenses
        for (const agency of agenciesList) {
          const expensesRef = doc(db, 
            `companies/${user.companyId}/agences/${agency.id}/expenses/current`);
          const expensesSnap = await getDoc(expensesRef);
          
          if (expensesSnap.exists()) {
            const data = expensesSnap.data();
            const expenseDate = data.lastUpdated?.toDate();
            
            // Vérifier si les dépenses sont dans la période
            if (!expenseDate || (expenseDate >= dateRange.start && expenseDate <= dateRange.end)) {
              const agencyExpense = {
                id: agency.id,
                name: agency.name,
                total: data.total || 0,
                salaries: data.salaries || 0,
                operations: data.operations || 0,
                marketing: data.marketing || 0,
                other: data.other || 0
              };
              
              agencyExpenses.push(agencyExpense);
              
              // Mise à jour des totaux
              totalExpenses = (totalExpenses || 0) + agencyExpense.total;
              
              if (!expensesDetail) {
                expensesDetail = {
                  salaries: 0,
                  operations: 0,
                  marketing: 0,
                  other: 0
                };
              }
              
              expensesDetail.salaries += agencyExpense.salaries;
              expensesDetail.operations += agencyExpense.operations;
              expensesDetail.marketing += agencyExpense.marketing;
              expensesDetail.other += agencyExpense.other;
            }
          }
        }
      } catch (error) {
        console.warn('Aucune donnée de dépenses disponible');
      }
      
      // 5. Calculer les bénéfices par agence (si dépenses disponibles)
      const agenciesWithProfit = agencyRevenues.map(agencyRev => {
        const agencyExp = agencyExpenses.find(e => e.id === agencyRev.id);
        const expenses = agencyExp?.total || null;
        const profit = expenses !== null ? agencyRev.revenue - expenses : null;
        const margin = profit !== null && agencyRev.revenue > 0 
          ? (profit / agencyRev.revenue) * 100 
          : null;
        
        return {
          id: agencyRev.id,
          name: agencyRev.name,
          revenue: agencyRev.revenue,
          expenses,
          profit,
          margin
        };
      }).sort((a, b) => b.revenue - a.revenue);
      
      // 6. Préparer les données finales (total = billets + courrier depuis dailyStats si dispo)
      const globalTotal = (ticketRevenueFromStats + courierRevenueFromStats) > 0
        ? ticketRevenueFromStats + courierRevenueFromStats
        : totalRevenue;
      const data: FinancialData = {
        period: dateRange,
        revenue: {
          total: globalTotal,
          ticketRevenue: ticketRevenueFromStats > 0 ? ticketRevenueFromStats : totalRevenue,
          courierRevenue: courierRevenueFromStats,
          guichet: guichetRevenue,
          online: onlineRevenue,
          byAgency: agencyRevenues.sort((a, b) => b.revenue - a.revenue)
        },
        paymentMethods: {
          cash: cashRevenue,
          mobileMoney: mobileMoneyRevenue,
          total: cashRevenue + mobileMoneyRevenue
        },
        expenses: {
          total: totalExpenses,
          byAgency: agencyExpenses,
          detail: expensesDetail
        },
        agencies: agenciesWithProfit
      };
      
      setFinancialData(data);
      setLastUpdated(new Date());
      
    } catch (error) {
      console.error('[Finances] Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadFinancialData();
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    const date = value ? new Date(value) : null;
    setCustomDateRange(prev => ({
      ...prev,
      [type]: date
    }));
  };

  // ==================== FORMATTERS ====================
  const fmtMoney = (n: number | null | undefined) => {
    if (n === null || n === undefined) return 'N/A';
    return money(n);
  };
  
  const fmtPercent = (n: number | null | undefined) => {
    if (n === null || n === undefined) return 'N/A';
    return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  };

  const fmtShortMoney = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  };

  // ==================== COMPOSANTS UI ====================
  const PeriodBadge: React.FC<{ period: FinancialData['period'] }> = ({ period }) => (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm font-medium text-blue-700">{period.label}</span>
      {period.isCurrentMonth && (
        <StatusBadge status="success">En cours</StatusBadge>
      )}
    </div>
  );

  // ==================== RENDU PRINCIPAL ====================
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-gray-600">Calcul des données financières...</div>
        </div>
      </div>
    );
  }

  if (!financialData) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <div className="text-lg font-medium text-gray-900 mb-2">Données non disponibles</div>
        <div className="text-gray-600">Impossible de charger les données financières</div>
      </div>
    );
  }

  const hasExpensesData = financialData.expenses.total !== null;
  const totalProfit = hasExpensesData && financialData.expenses.total !== null 
    ? financialData.revenue.total - financialData.expenses.total 
    : null;
  const profitMargin = totalProfit !== null && financialData.revenue.total > 0 
    ? (totalProfit / financialData.revenue.total) * 100 
    : null;

  return (
    <div className="space-y-6">
      {/* ================= EN-TÊTE ================= */}
      <SectionCard
        title="Finances consolidées"
        icon={TrendingUp}
        help={<span className="text-sm font-normal text-gray-500">Vue consolidée : activité opérationnelle + indicateurs de tendance</span>}
        right={
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium">
              <RefreshCw className="h-4 w-4" /> Actualiser
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium">
              <Download className="h-4 w-4" /> Exporter
            </button>
          </div>
        }
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PeriodBadge period={financialData.period} />
            <span className="text-sm text-gray-600">Données consolidées de {financialData.revenue.byAgency.length} agences</span>
          </div>
          <span className="text-xs text-gray-500">
            Dernière mise à jour : {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </SectionCard>

      {/* ================= FILTRES DE PÉRIODE ================= */}
      <SectionCard
        title="Période d'analyse"
        icon={Calendar}
        help={<span className="text-sm font-normal text-gray-500">Sélectionnez la période à analyser</span>}
        right={
          <span className="text-sm text-gray-600">
            {financialData.period.start.toLocaleDateString('fr-FR')} → {financialData.period.end.toLocaleDateString('fr-FR')}
          </span>
        }
      >
        
        <div className="space-y-4">
          {/* Sélecteur rapide */}
          <div>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as typeof periodType)}
              className="h-9 min-w-[210px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
            >
              <option value="day">Aujourd'hui</option>
              <option value="week">7 derniers jours</option>
              <option value="month">Mois en cours</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Année</option>
              <option value="custom">Période personnalisée</option>
            </select>
          </div>
          
          {/* Période personnalisée */}
          {periodType === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date de début</label>
                <input
                  type="date"
                  className="w-full h-9 border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ outlineColor: theme.primary }}
                  value={customDateRange.start?.toISOString().split('T')[0] || ''}
                  onChange={(e) => handleCustomDateChange('start', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date de fin</label>
                <input
                  type="date"
                  className="w-full h-9 border border-gray-300 rounded-lg px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ outlineColor: theme.primary }}
                  value={customDateRange.end?.toISOString().split('T')[0] || ''}
                  onChange={(e) => handleCustomDateChange('end', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  onClick={() => {
                    if (customDateRange.start && customDateRange.end) {
                      loadFinancialData();
                    }
                  }}
                  disabled={!customDateRange.start || !customDateRange.end}
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-white font-medium disabled:opacity-50"
                  style={{ 
                    background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                  }}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Appliquer la période
                </button>
              </div>
            </div>
          )}
          
          {/* Information sur la période */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <Info className="h-5 w-5 text-gray-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-600">
              <span className="font-medium">Mois en cours par défaut :</span> 
              La période d'analyse est automatiquement définie sur le mois civil en cours pour correspondre aux pratiques comptables standards.
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ================= KPIs FINANCIERS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <MetricCard
          label="Chiffre d'affaires total"
          value={fmtMoney(financialData.revenue.total)}
          icon={DollarSign}
          valueColorVar={theme.primary}
        />
        <MetricCard
          label="Revenus billets"
          value={fmtMoney(financialData.revenue.ticketRevenue ?? financialData.revenue.total)}
          icon={DollarSign}
        />
        <MetricCard
          label="Revenus courrier"
          value={fmtMoney(financialData.revenue.courierRevenue ?? 0)}
          icon={DollarSign}
        />
        {hasExpensesData ? (
          <MetricCard
            label="Dépenses totales"
            value={fmtMoney(financialData.expenses.total)}
            icon={TrendingDown}
          />
        ) : (
          <MetricCard
            label="Dépenses totales"
            value="Données manquantes"
            icon={AlertTriangle}
            critical
            criticalMessage="À renseigner par les agences"
          />
        )}
        {hasExpensesData ? (
          <MetricCard
            label="Bénéfice net"
            value={fmtMoney(totalProfit)}
            icon={PieChart}
          />
        ) : (
          <MetricCard
            label="Bénéfice net"
            value="Non calculable"
            icon={Calculator}
            critical
            criticalMessage="En attente des données de dépenses"
          />
        )}
        <MetricCard
          label="Transactions"
          value={fmtShortMoney(financialData.revenue.total)}
          icon={BarChart3}
        />
      </div>

      {/* ================= RÉPARTITION PAR CANAL ================= */}
      <SectionCard
        title="Répartition du chiffre d'affaires par canal"
        icon={BarChart3}
        help={<span className="text-sm font-normal text-gray-500">Analyse des points de vente</span>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Guichet */}
          <div className="p-5 rounded-lg border border-gray-200 bg-gray-50/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-lg border border-gray-200 bg-white flex items-center justify-center">
                <Building2 className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <div className="font-bold text-gray-900">Guichet</div>
                <div className="text-sm text-gray-600">Ventes en agence</div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="text-3xl font-bold text-gray-900">
                {fmtMoney(financialData.revenue.guichet)}
              </div>
              <div className="text-sm text-gray-500">
                {financialData.revenue.total > 0 
                  ? `${((financialData.revenue.guichet / financialData.revenue.total) * 100).toFixed(1)}% du chiffre d'affaires total`
                  : 'Aucune vente'}
              </div>
              <div className="pt-4 border-t border-blue-200">
                <div className="text-sm font-medium text-gray-700 mb-2">Top agences guichet :</div>
                <div className="space-y-2">
                  {financialData.revenue.byAgency
                    .filter(a => a.guichetRevenue > 0)
                    .sort((a, b) => b.guichetRevenue - a.guichetRevenue)
                    .slice(0, 3)
                    .map((agency, index) => (
                      <div key={agency.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-gray-200 flex items-center justify-center">
                            <span className="text-xs font-bold text-gray-700">#{index + 1}</span>
                          </div>
                          <span className="text-sm text-gray-700 truncate">{agency.name}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {fmtShortMoney(agency.guichetRevenue)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* En ligne */}
          <div className="p-5 rounded-lg border border-gray-200 bg-gray-50/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-lg border border-gray-200 bg-white flex items-center justify-center">
                <Globe className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <div className="font-bold text-gray-900">En ligne</div>
                <div className="text-sm text-gray-600">Réservations web</div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="text-3xl font-bold text-gray-900">
                {fmtMoney(financialData.revenue.online)}
              </div>
              <div className="text-sm text-gray-500">
                {financialData.revenue.total > 0 
                  ? `${((financialData.revenue.online / financialData.revenue.total) * 100).toFixed(1)}% du chiffre d'affaires total`
                  : 'Aucune vente'}
              </div>
              <div className="pt-4 border-t border-purple-200">
                <div className="text-sm font-medium text-gray-700 mb-2">Top agences en ligne :</div>
                <div className="space-y-2">
                  {financialData.revenue.byAgency
                    .filter(a => a.onlineRevenue > 0)
                    .sort((a, b) => b.onlineRevenue - a.onlineRevenue)
                    .slice(0, 3)
                    .map((agency, index) => (
                      <div key={agency.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md bg-gray-200 flex items-center justify-center">
                            <span className="text-xs font-bold text-gray-700">#{index + 1}</span>
                          </div>
                          <span className="text-sm text-gray-700 truncate">{agency.name}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {fmtShortMoney(agency.onlineRevenue)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ================= MOYENS DE PAIEMENT ================= */}
      <SectionCard
        title="Moyens de paiement utilisés"
        icon={CreditCard}
        help={<span className="text-sm font-normal text-gray-500">Répartition des encaissements</span>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Espèces */}
          <div className="p-5 rounded-lg border border-gray-200 bg-gray-50/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-lg border border-gray-200 bg-white flex items-center justify-center">
                <Banknote className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <div className="font-bold text-gray-900">Espèces</div>
                <div className="text-sm text-gray-600">Paiements en cash</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-gray-900">
                {fmtMoney(financialData.paymentMethods.cash)}
              </div>
              <div className="text-sm text-gray-500">
                {financialData.paymentMethods.total > 0 
                  ? `${((financialData.paymentMethods.cash / financialData.paymentMethods.total) * 100).toFixed(1)}% des encaissements`
                  : 'Aucun paiement'}
              </div>
              <div className="mt-4">
                <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ 
                      width: `${financialData.paymentMethods.total > 0 
                        ? (financialData.paymentMethods.cash / financialData.paymentMethods.total) * 100 
                        : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Mobile Money */}
          <div className="p-5 rounded-lg border border-gray-200 bg-gray-50/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-lg border border-gray-200 bg-white flex items-center justify-center">
                <MobileIcon className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <div className="font-bold text-gray-900">Mobile Money</div>
                <div className="text-sm text-gray-600">Paiements mobiles</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-gray-900">
                {fmtMoney(financialData.paymentMethods.mobileMoney)}
              </div>
              <div className="text-sm text-gray-500">
                {financialData.paymentMethods.total > 0 
                  ? `${((financialData.paymentMethods.mobileMoney / financialData.paymentMethods.total) * 100).toFixed(1)}% des encaissements`
                  : 'Aucun paiement'}
              </div>
              <div className="mt-4">
                <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ 
                      width: `${financialData.paymentMethods.total > 0 
                        ? (financialData.paymentMethods.mobileMoney / financialData.paymentMethods.total) * 100 
                        : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
          <div className="text-sm text-gray-600">
            <span className="font-medium">Note :</span> 
            Les moyens de paiement (espèces, mobile money) peuvent être utilisés dans les deux canaux (guichet et en ligne).
            Cette répartition décrit l'activité d'encaissement (source opérationnelle), pas le solde des comptes ledger.
          </div>
        </div>
      </SectionCard>

      {/* ================= PERFORMANCE PAR AGENCE ================= */}
      <SectionCard
        title="Performance par agence"
        icon={Building2}
        right={
          <span className="text-sm text-gray-600">
            {financialData.agencies.length} agences
            {!hasExpensesData && ' (bénéfice non calculable - dépenses manquantes)'}
          </span>
        }
        noPad
      >
        <div className="overflow-hidden border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Agence
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Chiffre d'affaires
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Dépenses
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Bénéfice
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Marge
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Détail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {financialData.agencies.map((agency) => {
                const hasAgencyExpenses = agency.expenses !== null;
                
                return (
                  <tr key={agency.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{agency.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-gray-900">{fmtMoney(agency.revenue)}</div>
                    </td>
                    
                    <td className="px-4 py-3">
                      {hasAgencyExpenses ? (
                        <div className="font-medium text-gray-700">{fmtMoney(agency.expenses)}</div>
                      ) : (
                        <div className="text-amber-600 text-sm bg-amber-50 px-2 py-1 rounded inline-block">
                          Non renseignées
                        </div>
                      )}
                    </td>
                    
                    <td className="px-4 py-3">
                      {hasAgencyExpenses && agency.profit !== null ? (
                        <div className={`font-bold ${agency.profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {fmtMoney(agency.profit)}
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">-</div>
                      )}
                    </td>
                    
                    <td className="px-4 py-3">
                      {hasAgencyExpenses && agency.margin !== null ? (
                        <div className={`font-medium ${agency.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {fmtPercent(agency.margin)}
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">-</div>
                      )}
                    </td>
                    
                    <td className="px-4 py-3">
                      <button className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">
                        Voir détail
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Information sur le calcul */}
        <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
          <div className="text-sm text-gray-700">
            <strong>Mode de calcul :</strong>
            <ul className="mt-2 space-y-1">
              <li>• Chiffre d'affaires = agrégat opérationnel (dailyStats, avec fallback réservations payées)</li>
              <li>• Dépenses = Saisies individuelles par chaque agence</li>
              <li>• Bénéfice = CA - Dépenses (calculé uniquement si dépenses renseignées)</li>
              <li>• Marge = (Bénéfice / CA) × 100</li>
            </ul>
            <div className="mt-3 text-amber-600">
              {!hasExpensesData && (
                <>
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  <strong>Action requise :</strong> Demandez aux agences de renseigner leurs dépenses pour calculer les bénéfices.
                </>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ================= DÉPENSES DÉTAILLÉES ================= */}
      {hasExpensesData && financialData.expenses.detail && (
        <SectionCard
          title="Détail des dépenses consolidées"
          icon={PieChart}
          right={<span className="text-sm text-gray-600">{financialData.expenses.byAgency.length} agences ont renseigné leurs dépenses</span>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Salaires"
              value={fmtMoney(financialData.expenses.detail.salaries)}
              help={financialData.expenses.total ? (
                <span className="text-xs text-gray-500">
                  {((financialData.expenses.detail.salaries / financialData.expenses.total) * 100).toFixed(1)}% des dépenses
                </span>
              ) : undefined}
            />
            <MetricCard
              label="Opérations"
              value={fmtMoney(financialData.expenses.detail.operations)}
              help={financialData.expenses.total ? (
                <span className="text-xs text-gray-500">
                  {((financialData.expenses.detail.operations / financialData.expenses.total) * 100).toFixed(1)}% des dépenses
                </span>
              ) : undefined}
            />
            <MetricCard
              label="Marketing"
              value={fmtMoney(financialData.expenses.detail.marketing)}
              help={financialData.expenses.total ? (
                <span className="text-xs text-gray-500">
                  {((financialData.expenses.detail.marketing / financialData.expenses.total) * 100).toFixed(1)}% des dépenses
                </span>
              ) : undefined}
            />
            <MetricCard
              label="Autres"
              value={fmtMoney(financialData.expenses.detail.other)}
              help={financialData.expenses.total ? (
                <span className="text-xs text-gray-500">
                  {((financialData.expenses.detail.other / financialData.expenses.total) * 100).toFixed(1)}% des dépenses
                </span>
              ) : undefined}
            />
          </div>
        </SectionCard>
      )}

      {/* ================= INSTRUCTIONS POUR DÉPENSES ================= */}
      {!hasExpensesData && (
        <SectionCard title="Données de dépenses incomplètes" icon={AlertTriangle}>
          <div className="text-gray-700">
            <p className="mb-3">
              Pour calculer les bénéfices et marges réelles, les agences doivent renseigner leurs dépenses individuelles.
            </p>
            
            <div className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <h4 className="font-medium text-gray-800 mb-3">Procédure recommandée :</h4>
              <ol className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-medium">
                    1
                  </div>
                  <span>Chaque agence saisit ses dépenses mensuelles dans son espace administratif</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-medium">
                    2
                  </div>
                  <span>Les dépenses sont catégorisées (salaires, opérations, marketing, autres)</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-medium">
                    3
                  </div>
                  <span>Le système consolide automatiquement les données au niveau compagnie</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center flex-shrink-0 text-xs font-medium">
                    4
                  </div>
                  <span>Les bénéfices et marges sont calculés pour chaque agence et globalement</span>
                </li>
              </ol>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
};

export default Finances;