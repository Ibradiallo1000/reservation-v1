// src/pages/chef-comptable/ReservationsEnLigne.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, orderBy, limit, updateDoc, doc,
  deleteDoc, onSnapshot, Timestamp, getDocs, getDoc, runTransaction
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import { 
  RotateCw, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Eye, 
  Filter, 
  Download,
  Building2,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  FileText,
  Users,
  Smartphone,
  Wallet,
  Info
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

/* ================= TYPES ================= */
export type ReservationStatus =
  | 'en_attente'
  | 'verification'
  | 'confirme'
  | 'refuse'
  | 'annule';

export interface Reservation {
  id: string;
  agencyId?: string;
  nomClient?: string;
  telephone?: string;
  email?: string;
  referenceCode?: string;
  statut?: ReservationStatus;
  canal?: string;
  depart?: string;
  arrivee?: string;
  montant?: number;
  seatsGo?: number;
  seatsReturn?: number;
  tripType?: string;
  date?: string;
  heure?: string;
  paymentProofUrl?: string;
  paymentMethodLabel?: string;
  companyId?: string;
  companySlug?: string;
  createdAt: Timestamp | Date | string;
  validatedAt?: Timestamp | Date | null;
  refusedAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
  reason?: string;
  [key: string]: any;
}

/* ================= NORMALISATION DES STATUTS ================= */
const normalizeStatut = (raw?: string): ReservationStatus => {
  if (!raw) return 'en_attente';

  const s = raw.toLowerCase().trim();

  if (s.includes('preuve')) return 'verification';
  if (s.includes('verif')) return 'verification';
  if (s.includes('pay')) return 'confirme';
  if (s.includes('confirm')) return 'confirme';
  if (s.includes('valid')) return 'confirme';
  if (s.includes('refus')) return 'refuse';
  if (s.includes('annul')) return 'annule';
  if (s.includes('cancel')) return 'annule';
  if (s.includes('attente')) return 'en_attente';
  if (s === 'pending') return 'en_attente';

  return 'en_attente';
};

const ITEMS_PER_PAGE = 12;

/* ================= COMPOSANTS UI ================= */
const Badge: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${className}`}>
    {children}
  </span>
);

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
  theme: { primary: string; secondary: string };
}> = ({ theme, className = '', children, ...props }) => (
  <button
    {...props}
    className={`
      inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-white font-medium 
      shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200
      disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
      ${className}
    `}
    style={{ 
      background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
      boxShadow: `0 4px 12px ${theme.primary}40`
    }}
  >
    {children}
  </button>
);

const SecondaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ 
  className = '', 
  children, 
  ...props 
}) => (
  <button
    {...props}
    className={`
      inline-flex items-center justify-center px-4 py-2.5 rounded-xl border-2 border-gray-200 
      bg-white text-gray-700 font-medium shadow-sm hover:shadow-md hover:border-gray-300 
      hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
      ${className}
    `}
  >
    {children}
  </button>
);

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

const StatCard: React.FC<{
  tone: 'blue'|'amber'|'emerald'|'red'|'gray'; 
  label: string; 
  value: string;
  icon: React.ReactNode;
}> = ({ tone, label, value, icon }) => {
  const styles = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
    red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100' },
  }[tone];

  return (
    <div className={`rounded-2xl border ${styles.border} p-4 bg-white shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`px-2.5 py-1 rounded-lg text-xs font-medium ${styles.bg} ${styles.text}`}>
          {label}
        </div>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${styles.bg}`}>
          <span className={styles.text}>{icon}</span>
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
};

/* ================= CONFIGURATION DES STATUTS ================= */
const getStatusConfig = (status?: ReservationStatus) => {
  switch (status) {
    case 'en_attente':
      return {
        label: 'En attente',
        color: 'bg-blue-100 text-blue-800 border-blue-300',
        icon: <Clock className="h-3 w-3" />,
        priority: 0,
      };
    case 'verification':
      return {
        label: 'Preuve reçue',
        color: 'bg-amber-100 text-amber-800 border-amber-300',
        icon: <AlertCircle className="h-3 w-3" />,
        priority: 1,
      };
    case 'confirme':
      return {
        label: 'Confirmé',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        icon: <CheckCircle className="h-3 w-3" />,
        priority: 2,
      };
    case 'refuse':
      return {
        label: 'Refusé',
        color: 'bg-red-100 text-red-800 border-red-300',
        icon: <XCircle className="h-3 w-3" />,
        priority: 3,
      };
    case 'annule':
      return {
        label: 'Annulé',
        color: 'bg-gray-100 text-gray-800 border-gray-300',
        icon: <XCircle className="h-3 w-3" />,
        priority: 4,
      };
    default:
      return {
        label: 'Inconnu',
        color: 'bg-gray-100 text-gray-800 border-gray-300',
        icon: <AlertCircle className="h-3 w-3" />,
        priority: 5,
      };
  }
};

/* ================= COMPOSANT PRINCIPAL ================= */
const ReservationsEnLigne: React.FC = () => {
  const { user, company } = useAuth() as any;
  const navigate = useNavigate();
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#3b82f6' };

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [agencies, setAgencies] = useState<Record<string, {name: string, ville: string}>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('');
  const [dateRange, setDateRange] = useState<{start: Date, end: Date}>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start, end };
  });

  /* ================= CHARGEMENT DES AGENCES ================= */
  useEffect(() => {
    if (!user?.companyId) return;

    (async () => {
      try {
        const agenciesSnap = await getDocs(
          collection(db, 'companies', user.companyId, 'agences')
        );
        
        const agenciesMap: Record<string, {name: string, ville: string}> = {};
        agenciesSnap.forEach(doc => {
          const data = doc.data() as any;
          agenciesMap[doc.id] = {
            name: data.nomAgence || data.nom || data.ville || 'Agence',
            ville: data.ville || data.city || ''
          };
        });
        
        setAgencies(agenciesMap);
      } catch (error) {
        console.error('Erreur chargement agences:', error);
        toast.error('Erreur', { description: 'Impossible de charger les agences' });
      }
    })();
  }, [user?.companyId]);

  /* ================= CHARGEMENT EN TEMPS RÉEL ================= */
  useEffect(() => {
    if (!user?.companyId) {
      setLoading(false);
      return;
    }

    let unsubs: Array<() => void> = [];
    let isInitialLoad = true;

    (async () => {
      try {
        const agencesSnap = await getDocs(
          collection(db, 'companies', user.companyId, 'agences')
        );
        
        if (agencesSnap.empty) {
          setLoading(false);
          return;
        }
        
        const agenceIds = agencesSnap.docs.map((d) => d.id);
        const buffer = new Map<string, Reservation>();

        agenceIds.forEach((agencyId) => {
          const constraints = [
            orderBy('createdAt', 'desc'),
            limit(ITEMS_PER_PAGE * 2)
          ];

          const qRef = query(
            collection(db, 'companies', user.companyId!, 'agences', agencyId, 'reservations'),
            ...constraints
          );

          const unsub = onSnapshot(qRef, (snap) => {
            let hasNewReservation = false;

            snap.docChanges().forEach((chg) => {
              const d = chg.doc.data() as any;
              
              const row: Reservation = {
                id: chg.doc.id,
                ...d,
                statut: normalizeStatut(d.statut),
                agencyId: d.agencyId || agencyId,
                createdAt: d.createdAt || Timestamp.now(),
              };

              const key = `${row.agencyId}_${row.id}`;

              if (chg.type === 'removed') {
                buffer.delete(key);
              } else {
                buffer.set(key, row);
                
                if (!isInitialLoad && chg.type === 'added') {
                  hasNewReservation = true;
                  toast('🆕 Nouvelle réservation', {
                    description: `${row.nomClient || 'Client'} a envoyé une réservation`,
                    duration: 4000,
                  });
                }
              }
            });

            const merged = Array.from(buffer.values())
              .sort((a, b) => {
                const ta = a.createdAt instanceof Timestamp 
                  ? a.createdAt.toMillis() 
                  : new Date(a.createdAt).getTime();
                const tb = b.createdAt instanceof Timestamp 
                  ? b.createdAt.toMillis() 
                  : new Date(b.createdAt).getTime();
                return tb - ta;
              })
              .slice(0, ITEMS_PER_PAGE * agenceIds.length);

            setReservations(merged);
            
            if (isInitialLoad) {
              setLoading(false);
              isInitialLoad = false;
            }
          }, (error) => {
            console.error('Erreur Firestore:', error);
            setLoading(false);
            toast.error('Erreur de connexion', {
              description: 'Impossible de charger les réservations',
            });
          });

          unsubs.push(unsub);
        });
      } catch (error) {
        console.error('Erreur initiale:', error);
        setLoading(false);
        toast.error('Erreur', {
          description: 'Impossible de charger les agences',
        });
      }
    })();

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user?.companyId]);

  /* ================= ACTIONS ================= */
  const handleValidate = async (reservation: Reservation) => {
    if (!user?.companyId || !reservation.agencyId) {
      toast.error('Erreur', { description: 'Informations manquantes' });
      return;
    }
    
    setProcessingId(reservation.id);
    try {
      await updateDoc(
        doc(
          db,
          'companies',
          user.companyId,
          'agences',
          reservation.agencyId,
          'reservations',
          reservation.id
        ),
        {
          statut: 'confirme',
          validatedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        }
      );
      
      toast.success('Réservation confirmée', {
        description: `Le billet est maintenant disponible pour ${reservation.nomClient}`,
      });
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
      toast.error('Erreur', {
        description: 'Impossible de confirmer la réservation',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRefuse = async (reservation: Reservation) => {
    if (!user?.companyId || !reservation.agencyId) {
      toast.error('Erreur', { description: 'Informations manquantes' });
      return;
    }
    
    setProcessingId(reservation.id);
    try {
      const reason = window.prompt('Raison du refus ?') || 'Raison non spécifiée';
      
      await updateDoc(
        doc(
          db,
          'companies',
          user.companyId,
          'agences',
          reservation.agencyId,
          'reservations',
          reservation.id
        ),
        {
          statut: 'refuse',
          refusedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          reason: reason,
        }
      );
      
      toast.info('Réservation refusée', {
        description: `La réservation de ${reservation.nomClient} a été refusée`,
      });
    } catch (error) {
      console.error('Erreur lors du refus:', error);
      toast.error('Erreur', {
        description: 'Impossible de refuser la réservation',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (reservation: Reservation) => {
    if (!user?.companyId || !reservation.agencyId) {
      toast.error('Erreur', { description: 'Informations manquantes' });
      return;
    }
    
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette réservation ?')) {
      return;
    }
    
    setProcessingId(reservation.id);
    try {
      await deleteDoc(
        doc(
          db,
          'companies',
          user.companyId,
          'agences',
          reservation.agencyId,
          'reservations',
          reservation.id
        )
      );
      
      toast.success('Réservation supprimée', {
        description: 'La réservation a été supprimée avec succès',
      });
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Erreur', {
        description: 'Impossible de supprimer la réservation',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleViewDetails = (reservation: Reservation) => {
    if (!reservation.companySlug) {
      toast.error('Erreur', { description: 'Impossible d\'afficher les détails' });
      return;
    }
    
    navigate(`/${reservation.companySlug}/reservation/${reservation.id}`, {
      state: { 
        companyId: user?.companyId,
        agencyId: reservation.agencyId,
        companyInfo: { id: user?.companyId }
      }
    });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    // Simuler un rechargement
    setTimeout(() => setRefreshing(false), 1000);
  };

  /* ================= FILTRES & STATISTIQUES ================= */
  const filteredReservations = useMemo(() => {
    const term = searchTerm.toLowerCase();
    let result = reservations;
    
    if (filterStatus) {
      result = result.filter(r => r.statut === filterStatus);
    }
    
    if (!term) return result;
    
    return result.filter((r) => {
      const searchable = [
        r.nomClient || '',
        r.telephone || '',
        r.referenceCode || '',
        r.depart || '',
        r.arrivee || '',
        r.email || '',
      ].join(' ').toLowerCase();
      
      return searchable.includes(term);
    });
  }, [reservations, searchTerm, filterStatus]);

  const stats = {
    enAttente: reservations.filter(r => r.statut === 'en_attente').length,
    verification: reservations.filter(r => r.statut === 'verification').length,
    confirme: reservations.filter(r => r.statut === 'confirme').length,
    refuse: reservations.filter(r => r.statut === 'refuse').length,
    annule: reservations.filter(r => r.statut === 'annule').length,
    total: reservations.length,
    totalAmount: reservations.reduce((sum, r) => sum + (r.montant || 0), 0)
  };

  const topAgencies = useMemo(() => {
    const agencyStats: Record<string, { count: number, amount: number }> = {};
    
    reservations.forEach(r => {
      if (r.agencyId && agencies[r.agencyId]) {
        if (!agencyStats[r.agencyId]) {
          agencyStats[r.agencyId] = { count: 0, amount: 0 };
        }
        agencyStats[r.agencyId].count++;
        agencyStats[r.agencyId].amount += r.montant || 0;
      }
    });
    
    return Object.entries(agencyStats)
      .map(([id, stats]) => ({
        id,
        name: agencies[id]?.name || 'Agence inconnue',
        ville: agencies[id]?.ville || '',
        count: stats.count,
        amount: stats.amount
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [reservations, agencies]);

  /* ================= FORMATTERS ================= */
  const fmtMoney = (n: number) => `${(n || 0).toLocaleString('fr-FR')} FCFA`;
  const fmtDate = (date?: string | Date | Timestamp | null) => {
    if (!date) return 'N/A';
    
    let jsDate: Date;
    if (date instanceof Timestamp) {
      jsDate = date.toDate();
    } else if (typeof date === 'string') {
      jsDate = new Date(date);
    } else if (date instanceof Date) {
      jsDate = date;
    } else {
      return 'N/A';
    }
    
    return jsDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getProofUrl = (reservation: Reservation) => {
    return reservation.paymentProofUrl || 
           (reservation as any).preuveUrl || 
           (reservation as any).paiementPreuveUrl || 
           (reservation as any).proofUrl || 
           (reservation as any).receiptUrl;
  };

  /* ================= RENDU ================= */
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ================= EN-TÊTE ================= */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-6 bg-gradient-to-r from-white to-gray-50/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">Réservations en ligne</div>
              <div className="text-sm text-gray-600">Validation des preuves de paiement pour toutes les agences</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <SecondaryButton onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualisation...' : 'Actualiser'}
            </SecondaryButton>
            <PrimaryButton theme={theme}>
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </PrimaryButton>
          </div>
        </div>
      </div>

      {/* ================= KPIs CONTEXTUELS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <KpiCard 
          icon={<CreditCard className="h-6 w-6" />} 
          label="Réservations affichées" 
          value={stats.total.toString()} 
          sublabel={`${topAgencies.length} agences visibles`}
          theme={theme}
          emphasis={false}
        />
        <KpiCard 
          icon={<TrendingUp className="h-6 w-6" />} 
          label="Montant affiché" 
          value={fmtMoney(stats.totalAmount)} 
          sublabel="Sur les réservations chargées"
          theme={theme}
          emphasis={true}
        />
        <KpiCard 
          icon={<AlertTriangle className="h-6 w-6" />} 
          label="À vérifier (affichées)" 
          value={stats.verification.toString()} 
          sublabel="Dans la vue actuelle"
          theme={theme}
          emphasis={false}
        />
        <KpiCard 
          icon={<Building2 className="h-6 w-6" />} 
          label="Agences visibles" 
          value={topAgencies.length.toString()} 
          sublabel="Avec réservations chargées"
          theme={theme}
          emphasis={false}
        />
      </div>

      {/* ================= INFORMATION CONTEXTE ================= */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-700 font-medium">Information :</span>
        </div>
        <p className="text-sm text-blue-600 mt-1">
          Les chiffres affichés concernent uniquement les {ITEMS_PER_PAGE} dernières réservations par agence.
          Pour les statistiques financières complètes, consultez la page <strong>Finances</strong>.
        </p>
      </div>

      {/* ================= STATISTIQUES DÉTAILLÉES ================= */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        <StatCard tone="blue" label="En attente" value={stats.enAttente.toString()} icon={<Clock className="h-4 w-4" />} />
        <StatCard tone="amber" label="À vérifier" value={stats.verification.toString()} icon={<AlertCircle className="h-4 w-4" />} />
        <StatCard tone="emerald" label="Confirmées" value={stats.confirme.toString()} icon={<CheckCircle className="h-4 w-4" />} />
        <StatCard tone="red" label="Refusées" value={stats.refuse.toString()} icon={<XCircle className="h-4 w-4" />} />
        <StatCard tone="gray" label="Annulées" value={stats.annule.toString()} icon={<XCircle className="h-4 w-4" />} />
      </div>

      {/* ================= FILTRES ================= */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <Filter className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">Filtres de recherche</div>
              <div className="text-sm text-gray-600">{filteredReservations.length} résultat(s)</div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Période */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Période:</span>
              <select className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white">
                <option>30 derniers jours</option>
                <option>7 derniers jours</option>
                <option>Aujourd'hui</option>
                <option>Personnalisé</option>
              </select>
            </div>
            
            {/* Agence */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Agence:</span>
              <select className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white min-w-[150px]">
                <option value="">Toutes les agences</option>
                {Object.entries(agencies).map(([id, agency]) => (
                  <option key={id} value={id}>{agency.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Recherche */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recherche</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ outlineColor: theme.primary }}
                placeholder="Nom, téléphone, référence..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as ReservationStatus | '')}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ outlineColor: theme.primary }}
            >
              <option value="">Tous les statuts</option>
              <option value="verification">Preuve reçue</option>
              <option value="en_attente">En attente</option>
              <option value="confirme">Confirmées</option>
              <option value="refuse">Refusées</option>
              <option value="annule">Annulées</option>
            </select>
          </div>
          
          {/* Actions */}
          <div className="flex items-end">
            <PrimaryButton theme={theme} className="w-full">
              <Filter className="h-4 w-4 mr-2" />
              Appliquer les filtres
            </PrimaryButton>
          </div>
        </div>
      </div>

      {/* ================= TOP AGENCES ================= */}
      {topAgencies.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="text-lg font-bold text-gray-900">Top 5 Agences (affichées)</div>
            <div className="text-sm text-gray-600">Par nombre de réservations chargées</div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {topAgencies.map((agency, index) => (
              <div key={agency.id} className="p-4 rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                    <div className="text-sm font-bold text-blue-600">#{index + 1}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{agency.name}</div>
                    <div className="text-xs text-gray-500 truncate">{agency.ville}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Réservations</span>
                    <span className="font-bold text-gray-900">{agency.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Montant affiché</span>
                    <span className="font-bold text-gray-900">{fmtMoney(agency.amount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= LISTE DES RÉSERVATIONS ================= */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div className="text-lg font-bold text-gray-900">Liste des réservations</div>
          <div className="text-sm text-gray-600">
            {filteredReservations.length} réservation{filteredReservations.length > 1 ? 's' : ''} (affichées)
          </div>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="h-12 w-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
              <div className="text-gray-600">Chargement des réservations...</div>
            </div>
          </div>
        ) : filteredReservations.length === 0 ? (
          <div className="text-center py-12">
            <AlertTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <div className="text-lg font-medium text-gray-900 mb-2">Aucune réservation trouvée</div>
            <div className="text-gray-500">
              {searchTerm 
                ? "Essayez avec d'autres termes de recherche."
                : filterStatus
                  ? `Aucune réservation avec le statut "${getStatusConfig(filterStatus as ReservationStatus).label}".`
                  : "Aucune réservation en ligne pour le moment."
              }
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReservations.map((reservation) => {
              const statusConfig = getStatusConfig(reservation.statut);
              const isProcessing = processingId === reservation.id;
              const canValidate = reservation.statut === 'verification';
              const proofUrl = getProofUrl(reservation);
              const agencyInfo = reservation.agencyId ? agencies[reservation.agencyId] : null;
              
              return (
                <div
                  key={`${reservation.agencyId}_${reservation.id}`}
                  className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300"
                >
                  {/* Header avec agence */}
                  <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100/50 border-b">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-blue-100 flex items-center justify-center">
                          <Building2 className="h-3 w-3 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {agencyInfo?.name || 'Agence inconnue'}
                        </span>
                      </div>
                      <Badge className={statusConfig.color}>
                        {statusConfig.icon}
                        <span className="ml-1">{statusConfig.label}</span>
                      </Badge>
                    </div>
                    
                    {reservation.referenceCode && (
                      <div className="text-xs font-mono text-gray-600">
                        #{reservation.referenceCode}
                      </div>
                    )}
                  </div>
                  
                  {/* Détails de la réservation */}
                  <div className="p-4 space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Client</span>
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[150px] text-right">
                          {reservation.nomClient || 'Sans nom'}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Téléphone</span>
                        <span className="text-sm font-medium text-gray-900">
                          {reservation.telephone || 'N/A'}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Trajet</span>
                        <span className="text-sm font-medium text-gray-900 text-right">
                          {reservation.depart || 'N/A'} → {reservation.arrivee || 'N/A'}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Date/Heure</span>
                        <span className="text-sm font-medium text-gray-900">
                          {reservation.date} {reservation.heure}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Montant</span>
                        <span className="text-sm font-bold text-gray-900">
                          {fmtMoney(reservation.montant || 0)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Preuve de paiement */}
                    {proofUrl && (
                      <a
                        href={proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <FileText className="h-4 w-4" />
                        Voir la preuve de paiement
                      </a>
                    )}
                    
                    {/* Date de création */}
                    <div className="text-xs text-gray-400">
                      Créé le: {fmtDate(reservation.createdAt)}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="p-4 border-t bg-gray-50 space-y-2">
                    {/* Bouton Voir détails */}
                    <SecondaryButton 
                      onClick={() => handleViewDetails(reservation)}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Voir détails
                    </SecondaryButton>
                    
                    {/* Actions de validation */}
                    {canValidate && (
                      <div className="grid grid-cols-2 gap-2">
                        <PrimaryButton 
                          onClick={() => handleValidate(reservation)}
                          disabled={isProcessing}
                          theme={theme}
                          className="flex items-center justify-center gap-2"
                        >
                          {isProcessing ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <RotateCw className="h-4 w-4" />
                            </motion.div>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Valider
                            </>
                          )}
                        </PrimaryButton>
                        <SecondaryButton 
                          onClick={() => handleRefuse(reservation)}
                          disabled={isProcessing}
                          className="border-red-300 text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Refuser
                        </SecondaryButton>
                      </div>
                    )}
                    
                    {/* Bouton Supprimer */}
                    <SecondaryButton 
                      onClick={() => handleDelete(reservation)}
                      disabled={isProcessing}
                      className="w-full"
                    >
                      Supprimer
                    </SecondaryButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReservationsEnLigne;