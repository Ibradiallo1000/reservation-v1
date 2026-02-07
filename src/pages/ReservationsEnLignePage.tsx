// src/pages/ReservationsEnLignePage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, limit, updateDoc, doc,
  deleteDoc, onSnapshot, Timestamp, getDocs, getDoc, runTransaction
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { RotateCw, Frown, Search, CheckCircle, XCircle, Clock, AlertCircle, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { usePageHeader } from '@/contexts/PageHeaderContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

/* ================= NOMENCLATURE UNIFIÉE ================= */
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

/* ================= NORMALISATION DES STATUTS (CLÉ POUR AFFICHER TOUT) ================= */
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

/* ================= Helpers ================= */
const norm = (s = '') =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ITEMS_PER_PAGE = 12;

/* ================= Composants inline ================= */
const Badge: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${className}`}>
    {children}
  </span>
);

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'md';
}> = ({ children, onClick, disabled = false, className = '', variant = 'default', size = 'md' }) => {
  const baseClasses = 'px-3 py-1.5 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
  
  const sizeClasses = size === 'sm' ? 'text-xs px-2.5 py-1' : '';
  
  const variantClasses = variant === 'outline' 
    ? 'border bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed';
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`}
    >
      {children}
    </button>
  );
};

/* ================= Status Colors ================= */
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

/* ================= Component ================= */
const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();
  const { setHeader, resetHeader } = usePageHeader();
  const navigate = useNavigate();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('');

  /* ================= Header ================= */
  useEffect(() => {
    setHeader({
      title: 'Réservations en ligne',
      subtitle: 'Validation des preuves de paiement',
      actions: null // Pas de cloche visible
    });

    return () => resetHeader();
  }, [setHeader, resetHeader]);

  /* ================= Actions Admin ================= */
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

  /* ================= Temps réel ================= */
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
          // 🔴 ON NE FILTRE PAS DU TOUT POUR RECEVOIR TOUT
          const constraints = [
            orderBy('createdAt', 'desc'),
            limit(ITEMS_PER_PAGE * 2) // Un peu plus pour buffer
          ];

          const qRef = query(
            collection(db, 'companies', user.companyId!, 'agences', agencyId, 'reservations'),
            ...constraints
          );

          const unsub = onSnapshot(qRef, (snap) => {
            let hasNewReservation = false;

            snap.docChanges().forEach((chg) => {
              const d = chg.doc.data() as any;
              
              // 🔴 CORRECTION CRITIQUE: NORMALISATION DES STATUTS
              const row: Reservation = {
                id: chg.doc.id,
                ...d,
                statut: normalizeStatut(d.statut), // 🔥 NORMALISATION ICI
                agencyId: d.agencyId || agencyId,
                createdAt: d.createdAt || Timestamp.now(),
              };

              const key = `${row.agencyId}_${row.id}`;

              if (chg.type === 'removed') {
                buffer.delete(key);
              } else {
                buffer.set(key, row);
                
                // 🔔 NOTIFICATION AUTOMATIQUE SANS SON
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

  /* ================= Recherche ================= */
  const filteredReservations = useMemo(() => {
    const term = norm(searchTerm);
    let result = reservations;
    
    // 🔴 FILTRE PAR STATUT APRÈS RÉCEPTION (pas avant)
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
      
      return searchable.includes(term.toLowerCase());
    });
  }, [reservations, searchTerm, filterStatus]);

  /* ================= Formatage ================= */
  const formatDate = (date?: string | Date | Timestamp | null) => { 
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
    });
  };

  const formatDateTime = (date?: string | Date | Timestamp | null) => {
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
    
    return jsDate.toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount?: number) => {
    if (!amount) return '0 FCFA';
    return `${amount.toLocaleString('fr-FR')} FCFA`;
  };

  const formatTime = (time?: string) => {
    if (!time) return '';
    if (time.includes(':')) return time;
    return time;
  };

  const getProofUrl = (reservation: Reservation) => {
    return reservation.paymentProofUrl || 
           (reservation as any).preuveUrl || 
           (reservation as any).paiementPreuveUrl || 
           (reservation as any).proofUrl || 
           (reservation as any).receiptUrl;
  };

  /* ================= Statistiques ================= */
  const stats = {
    enAttente: reservations.filter(r => r.statut === 'en_attente').length,
    verification: reservations.filter(r => r.statut === 'verification').length,
    confirme: reservations.filter(r => r.statut === 'confirme').length,
    refuse: reservations.filter(r => r.statut === 'refuse').length,
    total: reservations.length
  };

  /* ================= Render ================= */
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Réservations en ligne</h1>
          <p className="text-sm text-gray-500 mt-1">
            Validation des preuves de paiement
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              placeholder="Rechercher (nom, téléphone, référence…)"
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as ReservationStatus | '')
              }
              className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Tous les statuts</option>
              <option value="verification">Preuve reçue</option>
              <option value="en_attente">En attente</option>
              <option value="confirme">Confirmées</option>
              <option value="refuse">Refusées</option>
              <option value="annule">Annulées</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats - TOUJOURS basées sur reservations (pas filteredReservations) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">En attente</div>
          <div className="text-2xl font-bold text-blue-600">
            {stats.enAttente}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">À vérifier</div>
          <div className="text-2xl font-bold text-amber-600">
            {stats.verification}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Confirmés</div>
          <div className="text-2xl font-bold text-emerald-600">
            {stats.confirme}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Refusés</div>
          <div className="text-2xl font-bold text-red-600">
            {stats.refuse}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Total</div>
          <div className="text-2xl font-bold text-gray-900">
            {stats.total}
          </div>
        </div>
      </div>

      {/* Chargement */}
      {loading && (
        <div className="flex justify-center py-12">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <RotateCw className="h-8 w-8 text-blue-600" />
          </motion.div>
          <span className="ml-3 text-gray-600">Chargement des réservations...</span>
        </div>
      )}

      {/* Résultats vides */}
      {!loading && filteredReservations.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Frown className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Aucune réservation trouvée
          </h3>
          <p className="text-gray-500">
            {searchTerm 
              ? "Essayez avec d'autres termes de recherche."
              : filterStatus
                ? `Aucune réservation avec le statut "${getStatusConfig(filterStatus as ReservationStatus).label}".`
                : "Aucune réservation en ligne pour le moment."
            }
          </p>
        </div>
      )}

      {/* Liste des réservations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredReservations.map((reservation) => {
          const statusConfig = getStatusConfig(reservation.statut);
          const isProcessing = processingId === reservation.id;
          const canValidate = reservation.statut === 'verification';
          const isConfirmed = reservation.statut === 'confirme';
          const proofUrl = getProofUrl(reservation);
          
          return (
            <div
              key={`${reservation.agencyId}_${reservation.id}`}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {reservation.nomClient || 'Sans nom'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1 truncate">
                      {reservation.telephone || 'N/A'}
                    </p>
                  </div>
                  <Badge className={statusConfig.color}>
                    <span className="flex items-center gap-1">
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </Badge>
                </div>
                
                {reservation.referenceCode && (
                  <div className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded truncate">
                    #{reservation.referenceCode}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Trajet</span>
                  <span className="text-sm font-medium text-gray-900 text-right">
                    {reservation.depart || 'N/A'} → {reservation.arrivee || 'N/A'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Date</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(reservation.date)} à {formatTime(reservation.heure)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Montant</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatAmount(reservation.montant)}
                  </span>
                </div>

                {proofUrl && (
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    📸 Voir la preuve de paiement
                  </a>
                )}

                {/* Canal de paiement */}
                {reservation.canal && (
                  <div className="text-xs text-gray-500">
                    Canal: {reservation.canal === 'en_ligne' ? 'En ligne' : reservation.canal}
                  </div>
                )}

                {/* Date de création */}
                {reservation.createdAt && (
                  <div className="text-xs text-gray-400">
                    Créé le: {formatDateTime(reservation.createdAt)}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <div className="flex flex-col gap-2">
                  {/* Bouton Voir détails */}
                  <Button
                    onClick={() => handleViewDetails(reservation)}
                    variant="outline"
                    size="sm"
                    className="flex items-center justify-center gap-1"
                  >
                    <Eye className="h-3 w-3" />
                    Voir détails
                  </Button>

                  {/* Actions de validation (uniquement pour vérification) */}
                  {canValidate && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleValidate(reservation)}
                        disabled={isProcessing}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1"
                      >
                        {isProcessing ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="h-3 w-3"
                          >
                            <RotateCw className="h-3 w-3" />
                          </motion.div>
                        ) : (
                          <>
                            <CheckCircle className="h-3 w-3" />
                            Valider
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => handleRefuse(reservation)}
                        disabled={isProcessing}
                        variant="outline"
                        size="sm"
                        className="border-red-300 text-red-700 hover:bg-red-50 flex items-center justify-center gap-1"
                      >
                        <XCircle className="h-3 w-3" />
                        Refuser
                      </Button>
                    </div>
                  )}

                  {/* Bouton Supprimer pour tous les statuts */}
                  <Button
                    onClick={() => handleDelete(reservation)}
                    disabled={isProcessing}
                    variant="outline"
                    size="sm"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Supprimer
                  </Button>

                  {/* Message pour réservations confirmées */}
                  {isConfirmed && reservation.validatedAt && (
                    <div className="text-xs text-emerald-600 font-medium text-center py-1">
                      ✅ Confirmé le {formatDate(reservation.validatedAt)}
                    </div>
                  )}

                  {/* Message pour réservations refusées */}
                  {reservation.statut === 'refuse' && reservation.refusedAt && (
                    <div className="text-xs text-red-600 font-medium text-center py-1">
                      ❌ Refusé le {formatDate(reservation.refusedAt)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination/info */}
      {filteredReservations.length > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          {filteredReservations.length} réservation(s) affichée(s)
          {searchTerm && ' (filtrées)'}
          {filterStatus && ` (statut: ${getStatusConfig(filterStatus as ReservationStatus).label})`}
        </div>
      )}
    </div>
  );
};

export default ReservationsEnLignePage;