// src/pages/chef-comptable/Finances.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  Timestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
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
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  Smartphone as MobileIcon,
  Globe,
  ChevronRight
} from 'lucide-react';

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
  const [periodType, setPeriodType] = useState<'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('month');
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
      
      // 2. Calculer le chiffre d'affaires par canal et par agence
      const agencyRevenues: AgencyRevenue[] = [];
      let totalRevenue = 0;
      let guichetRevenue = 0;
      let onlineRevenue = 0;
      let cashRevenue = 0;
      let mobileMoneyRevenue = 0;
      
      for (const agency of agenciesList) {
        const reservationsRef = collection(db, 
          `companies/${user.companyId}/agences/${agency.id}/reservations`);
        
        // Filtrer uniquement les réservations confirmées de la période
        const q = query(
          reservationsRef,
          where('statut', '==', 'confirme'),
          where('createdAt', '>=', Timestamp.fromDate(dateRange.start)),
          where('createdAt', '<=', Timestamp.fromDate(dateRange.end))
        );
        
        const snap = await getDocs(q);
        
        let agencyGuichetRevenue = 0;
        let agencyOnlineRevenue = 0;
        let agencyTotalRevenue = 0;
        
        snap.forEach(doc => {
          const data = doc.data();
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
      
      // 3. Charger les dépenses par agence
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
      
      // 4. Calculer les bénéfices par agence (si dépenses disponibles)
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
      
      // 5. Préparer les données finales
      const data: FinancialData = {
        period: dateRange,
        revenue: {
          total: totalRevenue,
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
  const KpiCard: React.FC<{
    icon: React.ReactNode; 
    label: string; 
    value: string; 
    sublabel?: string;
    trend?: number;
    theme: { primary: string; secondary: string };
    emphasis: boolean;
    warning?: boolean;
    info?: boolean;
  }> = ({ icon, label, value, sublabel, trend, theme, emphasis, warning = false, info = false }) => (
    <div
      className={`relative overflow-hidden rounded-xl border p-5 bg-white shadow-sm
        hover:shadow-md transition-all duration-300
        ${emphasis ? 'ring-2 ring-offset-2' : ''}
        ${warning ? 'border-amber-300 bg-amber-50/30' : info ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`}
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
        <div className={`h-10 w-10 rounded-xl grid place-items-center ${
          warning ? 'bg-amber-100' : info ? 'bg-blue-100' : ''
        }`}
             style={!warning && !info ? {background: `linear-gradient(135deg, ${theme.primary}20, ${theme.secondary}20)`} : undefined}>
          <span className={warning ? 'text-amber-600' : info ? 'text-blue-600' : 'text-gray-700'}>{icon}</span>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className={`font-bold ${emphasis ? 'text-3xl' : 'text-2xl'} 
          ${warning ? 'text-amber-700' : info ? 'text-blue-700' : 'text-gray-900'}`}>
          {value}
        </div>
        {sublabel && <div className={`text-xs font-medium ${warning ? 'text-amber-600' : info ? 'text-blue-600' : 'text-gray-500'}`}>
          {sublabel}
        </div>}
        
        {trend !== undefined && trend !== null && (
          <div className={`inline-flex items-center gap-1 text-xs font-medium ${
            trend >= 0 ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}% vs période précédente
          </div>
        )}
      </div>
    </div>
  );

  const PeriodBadge: React.FC<{ period: FinancialData['period'] }> = ({ period }) => (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
      <Calendar className="h-3 w-3 text-blue-600" />
      <span className="text-sm font-medium text-blue-700">{period.label}</span>
      {period.isCurrentMonth && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          En cours
        </span>
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
      <div className="rounded-xl border border-gray-200 shadow-sm p-6 bg-gradient-to-r from-white to-gray-50/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">Finances Compagnie</div>
              <div className="text-sm text-gray-600">Données consolidées pour la prise de décision</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium">
              <Download className="h-4 w-4" />
              Exporter
            </button>
          </div>
        </div>
        
        {/* Période active */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PeriodBadge period={financialData.period} />
            <div className="text-sm text-gray-600">
              Données consolidées de {financialData.revenue.byAgency.length} agences
            </div>
          </div>
          
          <div className="text-xs text-gray-500">
            Dernière mise à jour : {lastUpdated.toLocaleTimeString('fr-FR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </div>
        </div>
      </div>

      {/* ================= FILTRES DE PÉRIODE ================= */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">Période d'analyse</div>
              <div className="text-sm text-gray-600">Sélectionnez la période à analyser</div>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            <span className="font-medium">Période :</span>{' '}
            {financialData.period.start.toLocaleDateString('fr-FR')} → {financialData.period.end.toLocaleDateString('fr-FR')}
          </div>
        </div>
        
        <div className="space-y-4">
          {/* Sélecteur rapide */}
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodType === 'day' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
              onClick={() => setPeriodType('day')}
            >
              Aujourd'hui
            </button>
            <button
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodType === 'week' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
              onClick={() => setPeriodType('week')}
            >
              7 derniers jours
            </button>
            <button
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodType === 'month' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
              onClick={() => setPeriodType('month')}
            >
              Mois en cours
            </button>
            <button
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodType === 'quarter' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
              onClick={() => setPeriodType('quarter')}
            >
              Trimestre
            </button>
            <button
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodType === 'year' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
              onClick={() => setPeriodType('year')}
            >
              Année
            </button>
            <button
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodType === 'custom' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
              onClick={() => setPeriodType('custom')}
            >
              Période personnalisée
            </button>
          </div>
          
          {/* Période personnalisée */}
          {periodType === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border border-blue-200 bg-blue-50">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date de début</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ outlineColor: theme.primary }}
                  value={customDateRange.start?.toISOString().split('T')[0] || ''}
                  onChange={(e) => handleCustomDateChange('start', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date de fin</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
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
      </div>

      {/* ================= KPIs FINANCIERS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <KpiCard 
          icon={<DollarSign className="h-6 w-6" />} 
          label="Chiffre d'affaires" 
          value={fmtMoney(financialData.revenue.total)} 
          sublabel={`${financialData.revenue.byAgency.length} agences actives`}
          theme={theme}
          emphasis={true}
        />
        
        {hasExpensesData ? (
          <KpiCard 
            icon={<TrendingDown className="h-6 w-6" />} 
            label="Dépenses totales" 
            value={fmtMoney(financialData.expenses.total)} 
            sublabel={`${financialData.expenses.byAgency.length} agences renseignées`}
            theme={theme}
            emphasis={false}
          />
        ) : (
          <KpiCard 
            icon={<AlertTriangle className="h-6 w-6" />} 
            label="Dépenses totales" 
            value="Données manquantes" 
            sublabel="À renseigner par les agences"
            theme={theme}
            emphasis={false}
            warning={true}
          />
        )}
        
        {hasExpensesData ? (
          <KpiCard 
            icon={<PieChart className="h-6 w-6" />} 
            label="Bénéfice net" 
            value={fmtMoney(totalProfit)} 
            sublabel={`Marge : ${fmtPercent(profitMargin)}`}
            theme={theme}
            emphasis={false}
          />
        ) : (
          <KpiCard 
            icon={<Calculator className="h-6 w-6" />} 
            label="Bénéfice net" 
            value="Non calculable" 
            sublabel="En attente des données de dépenses"
            theme={theme}
            emphasis={false}
            info={true}
          />
        )}
        
        <KpiCard 
          icon={<BarChart3 className="h-6 w-6" />} 
          label="Transactions" 
          value={fmtShortMoney(financialData.revenue.total)} 
          sublabel={`${financialData.paymentMethods.total > 0 
            ? `${((financialData.paymentMethods.cash / financialData.paymentMethods.total) * 100).toFixed(0)}% espèces`
            : '0 transaction'}`}
          theme={theme}
          emphasis={false}
        />
      </div>

      {/* ================= RÉPARTITION PAR CANAL ================= */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="text-lg font-bold text-gray-900">Répartition du chiffre d'affaires par canal</div>
          <div className="text-sm text-gray-600">Analyse des points de vente</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Guichet */}
          <div className="p-5 rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-white border border-blue-200 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-blue-600" />
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
                          <div className="h-6 w-6 rounded-md bg-blue-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-blue-600">#{index + 1}</span>
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
          <div className="p-5 rounded-xl border border-gray-200 bg-gradient-to-br from-purple-50 to-pink-50">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-white border border-purple-200 flex items-center justify-center">
                <Globe className="h-6 w-6 text-purple-600" />
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
                          <div className="h-6 w-6 rounded-md bg-purple-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-purple-600">#{index + 1}</span>
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
      </div>

      {/* ================= MOYENS DE PAIEMENT ================= */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="text-lg font-bold text-gray-900">Moyens de paiement utilisés</div>
          <div className="text-sm text-gray-600">Répartition des encaissements</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Espèces */}
          <div className="p-5 rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Banknote className="h-6 w-6 text-emerald-600" />
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
          <div className="p-5 rounded-xl border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <MobileIcon className="h-6 w-6 text-blue-600" />
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
            Cette répartition montre comment l'argent est physiquement encaissé.
          </div>
        </div>
      </div>

      {/* ================= PERFORMANCE PAR AGENCE ================= */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="text-lg font-bold text-gray-900">Performance par agence</div>
          <div className="text-sm text-gray-600">
            {financialData.agencies.length} agences
            {!hasExpensesData && ' (bénéfice non calculable - dépenses manquantes)'}
          </div>
        </div>
        
        <div className="overflow-hidden rounded-xl border border-gray-200">
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
              <li>• Chiffre d'affaires = Somme des transactions validées</li>
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
      </div>

      {/* ================= DÉPENSES DÉTAILLÉES ================= */}
      {hasExpensesData && financialData.expenses.detail && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="text-lg font-bold text-gray-900">Détail des dépenses consolidées</div>
            <div className="text-sm text-gray-600">
              {financialData.expenses.byAgency.length} agences ont renseigné leurs dépenses
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Salaires</div>
              <div className="text-2xl font-bold text-gray-900">
                {fmtMoney(financialData.expenses.detail.salaries)}
              </div>
              <div className="text-sm text-gray-500">
                {financialData.expenses.total 
                  ? `${((financialData.expenses.detail.salaries / financialData.expenses.total) * 100).toFixed(1)}% des dépenses`
                  : '0%'}
              </div>
            </div>
            
            <div className="p-4 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Opérations</div>
              <div className="text-2xl font-bold text-gray-900">
                {fmtMoney(financialData.expenses.detail.operations)}
              </div>
              <div className="text-sm text-gray-500">
                {financialData.expenses.total 
                  ? `${((financialData.expenses.detail.operations / financialData.expenses.total) * 100).toFixed(1)}% des dépenses`
                  : '0%'}
              </div>
            </div>
            
            <div className="p-4 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Marketing</div>
              <div className="text-2xl font-bold text-gray-900">
                {fmtMoney(financialData.expenses.detail.marketing)}
              </div>
              <div className="text-sm text-gray-500">
                {financialData.expenses.total 
                  ? `${((financialData.expenses.detail.marketing / financialData.expenses.total) * 100).toFixed(1)}% des dépenses`
                  : '0%'}
              </div>
            </div>
            
            <div className="p-4 rounded-xl border border-gray-200">
              <div className="text-sm text-gray-500 mb-2">Autres</div>
              <div className="text-2xl font-bold text-gray-900">
                {fmtMoney(financialData.expenses.detail.other)}
              </div>
              <div className="text-sm text-gray-500">
                {financialData.expenses.total 
                  ? `${((financialData.expenses.detail.other / financialData.expenses.total) * 100).toFixed(1)}% des dépenses`
                  : '0%'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= INSTRUCTIONS POUR DÉPENSES ================= */}
      {!hasExpensesData && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
            <div className="text-lg font-bold text-amber-800">Données de dépenses incomplètes</div>
          </div>
          
          <div className="text-amber-700">
            <p className="mb-3">
              Pour calculer les bénéfices et marges réelles, les agences doivent renseigner leurs dépenses individuelles.
            </p>
            
            <div className="bg-white p-4 rounded-lg border border-amber-200">
              <h4 className="font-medium text-amber-800 mb-3">Procédure recommandée :</h4>
              <ol className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    1
                  </div>
                  <span>Chaque agence saisit ses dépenses mensuelles dans son espace administratif</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    2
                  </div>
                  <span>Les dépenses sont catégorisées (salaires, opérations, marketing, autres)</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    3
                  </div>
                  <span>Le système consolide automatiquement les données au niveau compagnie</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    4
                  </div>
                  <span>Les bénéfices et marges sont calculés pour chaque agence et globalement</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finances;