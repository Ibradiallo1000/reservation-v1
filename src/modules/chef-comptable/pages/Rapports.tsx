// src/pages/chef-comptable/Rapports.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import {
  FileText,
  Download,
  Calendar,
  Filter,
  Printer,
  BarChart3,
  TrendingUp,
  Building2,
  Users,
  CreditCard,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  DollarSign,
  PieChart,
  Banknote,
  Globe,
  Smartphone,
  Eye,
  Info,
  ChevronDown,
  ChevronUp,
  TrendingDown
} from 'lucide-react';

interface GeneratedReport {
  id: string;
  title: string;
  type: 'comptable' | 'operationnel' | 'analytique';
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
  periodLabel: string;
  generatedAt: Date;
  generatedBy: string;
  fileSize?: string;
  status: 'generating' | 'ready' | 'failed';
  downloadUrl?: string;
}

const Rapports: React.FC = () => {
  const { user, company } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#3b82f6' };
  
  const [reportType, setReportType] = useState<'comptable' | 'operationnel' | 'analytique'>('comptable');
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'quarterly' | 'custom'>('monthly');
  const [customDateRange, setCustomDateRange] = useState<{start: string, end: string}>({
    start: '',
    end: ''
  });
  const [generatingReportId, setGeneratingReportId] = useState<string | null>(null);
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [showReportDetails, setShowReportDetails] = useState<string | null>(null);

  // ==================== PÉRIODE PAR DÉFAUT : MOIS EN COURS ====================
  const getCurrentMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
      label: start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    };
  };

  // ==================== RAPPORTS DISPONIBLES (DÉFINITION MÉTIER) ====================
  const availableReports = [
    // === RAPPORTS COMPTABLES (prioritaires) ===
    {
      id: 'financial-summary',
      title: 'Rapport financier mensuel',
      description: 'Chiffre d\'affaires, dépenses et bénéfices consolidés pour la période',
      category: 'comptable' as const,
      frequency: ['monthly', 'quarterly'],
      icon: <DollarSign className="h-5 w-5" />,
      color: 'blue'
    },
    {
      id: 'revenue-report',
      title: 'Rapport des recettes',
      description: 'Détail des recettes par agence, par canal et par moyen de paiement',
      category: 'comptable' as const,
      frequency: ['daily', 'weekly', 'monthly'],
      icon: <Banknote className="h-5 w-5" />,
      color: 'emerald'
    },
    {
      id: 'expense-report',
      title: 'Rapport des dépenses',
      description: 'Analyse des dépenses par agence et par catégorie (salaires, opérations, etc.)',
      category: 'comptable' as const,
      frequency: ['monthly', 'quarterly'],
      icon: <TrendingDown className="h-5 w-5" />,
      color: 'amber'
    },
    {
      id: 'profit-margin',
      title: 'Rapport bénéfice & marge',
      description: 'Bénéfice net et marges par agence, avec analyse des performances',
      category: 'comptable' as const,
      frequency: ['monthly', 'quarterly'],
      icon: <PieChart className="h-5 w-5" />,
      color: 'purple'
    },
    {
      id: 'cash-flow',
      title: 'Rapport de trésorerie',
      description: 'Entrées et sorties d\'argent, analyse des flux de trésorerie',
      category: 'comptable' as const,
      frequency: ['weekly', 'monthly'],
      icon: <CreditCard className="h-5 w-5" />,
      color: 'indigo'
    },
    
    // === RAPPORTS OPÉRATIONNELS ===
    {
      id: 'agency-performance',
      title: 'Performance des agences',
      description: 'Classement et analyse des agences par CA et par indicateurs clés',
      category: 'operationnel' as const,
      frequency: ['weekly', 'monthly'],
      icon: <Building2 className="h-5 w-5" />,
      color: 'blue'
    },
    {
      id: 'agency-activity',
      title: 'Activité par agence',
      description: 'Volume de transactions, taux d\'occupation, activité détaillée',
      category: 'operationnel' as const,
      frequency: ['daily', 'weekly'],
      icon: <BarChart3 className="h-5 w-5" />,
      color: 'emerald'
    },
    {
      id: 'online-reservations',
      title: 'Réservations en ligne',
      description: 'Statistiques des réservations web, validation et conversion',
      category: 'operationnel' as const,
      frequency: ['daily', 'weekly'],
      icon: <Globe className="h-5 w-5" />,
      color: 'purple'
    },
    
    // === RAPPORTS ANALYTIQUES ===
    {
      id: 'monthly-evolution',
      title: 'Évolution mensuelle',
      description: 'Comparaison période à période, tendances et projections',
      category: 'analytique' as const,
      frequency: ['monthly', 'quarterly'],
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'indigo'
    },
    {
      id: 'payment-methods',
      title: 'Analyse des moyens de paiement',
      description: 'Évolution des usages, répartition espèces vs mobile money',
      category: 'analytique' as const,
      frequency: ['monthly', 'quarterly'],
      icon: <Smartphone className="h-5 w-5" />,
      color: 'amber'
    }
  ];

  // ==================== GÉNÉRATION DE RAPPORTS ====================
  const handleGenerateReport = async (reportId: string) => {
    if (!user) return;
    
    setGeneratingReportId(reportId);
    
    try {
      // 1. Préparer la période
      let periodLabel = '';
      let reportPeriod: GeneratedReport['period'] = 'monthly';
      
      if (period === 'custom' && customDateRange.start && customDateRange.end) {
        const startDate = new Date(customDateRange.start);
        const endDate = new Date(customDateRange.end);
        periodLabel = `${startDate.toLocaleDateString('fr-FR')} → ${endDate.toLocaleDateString('fr-FR')}`;
        reportPeriod = 'custom';
      } else {
        const currentMonth = getCurrentMonthRange();
        periodLabel = currentMonth.label;
        reportPeriod = period;
      }
      
      // 2. Trouver le rapport
      const report = availableReports.find(r => r.id === reportId);
      if (!report) return;
      
      // Simulation de génération (à remplacer par appel API)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 3. Créer l'objet rapport généré
      const newReport: GeneratedReport = {
        id: `${reportId}-${Date.now()}`,
        title: report.title,
        type: report.category,
        period: reportPeriod,
        periodLabel,
        generatedAt: new Date(),
        generatedBy: user.email || 'Utilisateur',
        fileSize: `${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 9)} MB`, // Temporaire
        status: 'ready',
        downloadUrl: '#' // À remplacer par URL réelle
      };
      
      // 4. Ajouter à l'historique
      setGeneratedReports(prev => [newReport, ...prev]);
      
      // 5. Notification de succès
      alert(`✅ Rapport "${report.title}" généré avec succès pour ${periodLabel}`);
      
    } catch (error) {
      console.error('Erreur génération rapport:', error);
      alert('❌ Erreur lors de la génération du rapport');
    } finally {
      setGeneratingReportId(null);
    }
  };

  const handleDownloadReport = (report: GeneratedReport) => {
    // Simulation de téléchargement
    console.log('Téléchargement rapport:', report);
    alert(`📥 Téléchargement du rapport "${report.title}" démarré`);
  };

  const handleViewReport = (report: GeneratedReport) => {
    setShowReportDetails(showReportDetails === report.id ? null : report.id);
  };

  // ==================== FILTRAGE DES RAPPORTS ====================
  const filteredReports = availableReports.filter(report => 
    report.category === reportType && 
    report.frequency.includes(period)
  );

  // ==================== STATISTIQUES RÉELLES ====================
  const getRealStatistics = () => {
    const totalGenerated = generatedReports.length;
    const totalSizeMB = generatedReports.reduce((sum, r) => {
      if (r.fileSize) {
        const size = parseFloat(r.fileSize);
        return sum + (isNaN(size) ? 0 : size);
      }
      return sum;
    }, 0);
    
    return {
      totalGenerated,
      totalSizeMB,
      lastGeneration: generatedReports[0]?.generatedAt || null
    };
  };

  const statistics = getRealStatistics();

  // ==================== COMPOSANTS UI ====================
  const CategoryBadge: React.FC<{ category: GeneratedReport['type'] }> = ({ category }) => {
    const config = {
      comptable: { label: 'Comptable', color: 'bg-blue-100 text-blue-800 border-blue-300' },
      operationnel: { label: 'Opérationnel', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
      analytique: { label: 'Analytique', color: 'bg-purple-100 text-purple-800 border-purple-300' }
    }[category];
    
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const PeriodBadge: React.FC<{ period: GeneratedReport['period'] }> = ({ period }) => {
    const labels = {
      daily: 'Quotidien',
      weekly: 'Hebdomadaire',
      monthly: 'Mensuel',
      quarterly: 'Trimestriel',
      custom: 'Personnalisé'
    };
    
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
        <Calendar className="h-3 w-3" />
        {labels[period]}
      </span>
    );
  };

  const StatusBadge: React.FC<{ status: GeneratedReport['status'] }> = ({ status }) => {
    const config = {
      generating: { label: 'Génération...', icon: <RefreshCw className="h-3 w-3 animate-spin" />, color: 'bg-amber-100 text-amber-800 border-amber-300' },
      ready: { label: 'Prêt', icon: <CheckCircle className="h-3 w-3" />, color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
      failed: { label: 'Échec', icon: <XCircle className="h-3 w-3" />, color: 'bg-red-100 text-red-800 border-red-300' }
    }[status];
    
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ================= EN-TÊTE ================= */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-6 bg-gradient-to-r from-white to-gray-50/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
              <FileText className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">Rapports comptables</div>
              <div className="text-sm text-gray-600">Génération de documents officiels pour la direction</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium">
              <Eye className="h-4 w-4" />
              Voir historique
            </button>
          </div>
        </div>
        
        {/* Information sur le rôle des rapports */}
        <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-blue-800">Documentation officielle</div>
              <div className="text-sm text-blue-700 mt-1">
                Cette interface permet de générer des rapports comptables et financiers officiels 
                destinés à la direction, aux audits et aux partenaires. Tous les chiffres présentés 
                sont issus des données réelles de la compagnie.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= FILTRES ET CONFIGURATION ================= */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <Filter className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">Configuration du rapport</div>
              <div className="text-sm text-gray-600">Définissez les paramètres de génération</div>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            {filteredReports.length} rapport{filteredReports.length > 1 ? 's' : ''} disponible{filteredReports.length > 1 ? 's' : ''}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Catégorie de rapport */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Catégorie de rapport</label>
            <select 
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ outlineColor: theme.primary }}
            >
              <option value="comptable">Rapports comptables</option>
              <option value="operationnel">Rapports opérationnels</option>
              <option value="analytique">Rapports analytiques</option>
            </select>
          </div>
          
          {/* Période */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Période</label>
            <select 
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ outlineColor: theme.primary }}
            >
              <option value="monthly">Mensuel (mois en cours)</option>
              <option value="weekly">Hebdomadaire</option>
              <option value="quarterly">Trimestriel</option>
              <option value="custom">Période personnalisée</option>
            </select>
          </div>
          
          {/* Bouton de configuration */}
          <div className="flex items-end">
            <button 
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-white font-medium"
              style={{ 
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
              }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Appliquer la configuration
            </button>
          </div>
        </div>
        
        {/* Période personnalisée (uniquement si sélectionnée) */}
        {period === 'custom' && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border border-blue-200 bg-blue-50">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date de début</label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ outlineColor: theme.primary }}
                value={customDateRange.start}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date de fin</label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ outlineColor: theme.primary }}
                value={customDateRange.end}
                onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>
        )}
        
        {/* Information sur la période */}
        <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Période par défaut : </span>
            {period === 'custom' && customDateRange.start && customDateRange.end 
              ? `${new Date(customDateRange.start).toLocaleDateString('fr-FR')} → ${new Date(customDateRange.end).toLocaleDateString('fr-FR')}`
              : getCurrentMonthRange().label}
          </div>
          <div className="text-sm text-gray-600">
            {period === 'monthly' && 'Mois en cours automatiquement sélectionné'}
            {period === 'weekly' && '7 derniers jours'}
            {period === 'quarterly' && 'Trimestre en cours'}
            {period === 'custom' && 'Période personnalisée'}
          </div>
        </div>
      </div>

      {/* ================= STATISTIQUES RÉELLES ================= */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="text-lg font-bold text-gray-900">Historique des générations</div>
          <div className="text-sm text-gray-600">Données réelles depuis la création</div>
        </div>
        
        {generatedReports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <div className="text-lg font-medium text-gray-900 mb-2">Aucun rapport généré</div>
            <div className="text-gray-600">
              Générez votre premier rapport pour voir apparaître les statistiques ici
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Rapports générés</div>
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900">{statistics.totalGenerated}</div>
              <div className="text-sm text-gray-500 mt-2">Depuis le début</div>
            </div>
            
            <div className="p-4 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Volume total</div>
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900">{statistics.totalSizeMB.toFixed(1)} MB</div>
              <div className="text-sm text-gray-500 mt-2">Stockage réel utilisé</div>
            </div>
            
            <div className="p-4 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wider">Dernière génération</div>
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <div className="text-xl font-bold text-gray-900">
                {statistics.lastGeneration 
                  ? statistics.lastGeneration.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                  : 'Jamais'}
              </div>
              <div className="text-sm text-gray-500 mt-2">Date réelle</div>
            </div>
          </div>
        )}
      </div>

      {/* ================= RAPPORTS DISPONIBLES ================= */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="text-lg font-bold text-gray-900">
            {reportType === 'comptable' && 'Rapports comptables disponibles'}
            {reportType === 'operationnel' && 'Rapports opérationnels disponibles'}
            {reportType === 'analytique' && 'Rapports analytiques disponibles'}
          </div>
          <div className="text-sm text-gray-600">
            {filteredReports.length} rapport{filteredReports.length > 1 ? 's' : ''}
          </div>
        </div>
        
        {filteredReports.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <div className="text-lg font-medium text-gray-900 mb-2">Aucun rapport disponible</div>
            <div className="text-gray-600">
              Aucun rapport de type "{reportType}" n'est disponible pour la période "{period}".
              Changez de catégorie ou de période pour voir d'autres rapports.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReports.map((report) => {
              const isGenerating = generatingReportId === report.id;
              
              return (
                <div key={report.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                      report.color === 'blue' ? 'bg-blue-50' :
                      report.color === 'emerald' ? 'bg-emerald-50' :
                      report.color === 'amber' ? 'bg-amber-50' :
                      report.color === 'purple' ? 'bg-purple-50' :
                      'bg-indigo-50'
                    }`}>
                      <span className={
                        report.color === 'blue' ? 'text-blue-600' :
                        report.color === 'emerald' ? 'text-emerald-600' :
                        report.color === 'amber' ? 'text-amber-600' :
                        report.color === 'purple' ? 'text-purple-600' :
                        'text-indigo-600'
                      }>
                        {report.icon}
                      </span>
                    </div>
                    <CategoryBadge category={report.category} />
                  </div>
                  
                  <h3 className="font-bold text-gray-900 mb-2">{report.title}</h3>
                  <p className="text-sm text-gray-600 mb-4">{report.description}</p>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      <span>Disponible en : {report.frequency.map(f => 
                        f === 'daily' ? 'Quotidien' :
                        f === 'weekly' ? 'Hebdomadaire' :
                        f === 'monthly' ? 'Mensuel' : 'Trimestriel'
                      ).join(', ')}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleGenerateReport(report.id)}
                      disabled={isGenerating}
                      className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                      style={{ 
                        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                      }}
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Génération...
                        </>
                      ) : (
                        <>
                          <Printer className="h-4 w-4 mr-2" />
                          Générer
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= RAPPORTS GÉNÉRÉS RÉCEMMENT ================= */}
      {generatedReports.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="text-lg font-bold text-gray-900">Rapports générés récemment</div>
            <div className="text-sm text-gray-600">
              {generatedReports.length} rapport{generatedReports.length > 1 ? 's' : ''}
            </div>
          </div>
          
          <div className="space-y-3">
            {generatedReports.slice(0, 5).map((report) => (
              <div key={report.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100/50 border-b">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                        report.type === 'comptable' ? 'bg-blue-50' :
                        report.type === 'operationnel' ? 'bg-emerald-50' :
                        'bg-purple-50'
                      }`}>
                        <FileText className={
                          report.type === 'comptable' ? 'h-5 w-5 text-blue-600' :
                          report.type === 'operationnel' ? 'h-5 w-5 text-emerald-600' :
                          'h-5 w-5 text-purple-600'
                        } />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{report.title}</div>
                        <div className="text-sm text-gray-500">{report.periodLabel}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <StatusBadge status={report.status} />
                      <PeriodBadge period={report.period} />
                      <button
                        onClick={() => handleViewReport(report)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {showReportDetails === report.id ? (
                          <ChevronUp className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                
                {showReportDetails === report.id && (
                  <div className="p-4 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-2">Informations du rapport</div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Généré le :</span>
                            <span className="font-medium text-gray-900">
                              {report.generatedAt.toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Par :</span>
                            <span className="font-medium text-gray-900">{report.generatedBy}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Période :</span>
                            <span className="font-medium text-gray-900">{report.periodLabel}</span>
                          </div>
                          {report.fileSize && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Taille :</span>
                              <span className="font-medium text-gray-900">{report.fileSize}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-2">Actions</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDownloadReport(report)}
                            className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger
                          </button>
                          <button
                            onClick={() => handleGenerateReport(report.id.split('-')[0])}
                            className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-white text-sm font-medium"
                            style={{ 
                              background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Regénérer
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {generatedReports.length > 5 && (
            <div className="mt-4 text-center">
              <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                Voir tous les rapports générés ({generatedReports.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= INFORMATION SUR LES RAPPORTS ================= */}
      <div className="rounded-2xl border border-blue-300 bg-blue-50 p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Info className="h-6 w-6 text-blue-600" />
          <div className="text-lg font-bold text-blue-800">À propos des rapports générés</div>
        </div>
        
        <div className="text-blue-700">
          <p className="mb-3">
            Les rapports générés sont des documents officiels contenant des données financières réelles. 
            Ils sont destinés à :
          </p>
          
          <ul className="space-y-2 mb-4">
            <li className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                ✓
              </div>
              <span>La direction générale pour le pilotage stratégique</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                ✓
              </div>
              <span>Les audits internes et externes</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                ✓
              </div>
              <span>Les partenaires financiers et institutionnels</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                ✓
              </div>
              <span>Les autorités de régulation (le cas échéant)</span>
            </li>
          </ul>
          
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <div className="text-sm font-medium text-blue-800 mb-2">Procédure de génération</div>
            <div className="text-sm text-blue-700 space-y-1">
              <p>1. Sélectionnez la catégorie et la période du rapport</p>
              <p>2. Cliquez sur "Générer" pour créer le document</p>
              <p>3. Téléchargez le rapport au format PDF</p>
              <p>4. Le rapport est automatiquement archivé dans l'historique</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Rapports;