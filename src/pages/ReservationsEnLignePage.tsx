// src/pages/ReservationsEnLignePage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  doc,
  onSnapshot,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { RotateCw, Frown, Search, Bell, BellOff, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePageHeader } from '@/contexts/PageHeaderContext';
import { toast } from 'sonner';

// Note: Modifié pour importer les composants avec la bonne casse
// Si tes fichiers sont en minuscules, utilise:
// import { Badge } from '@/components/ui/badge';
// import { Button } from '@/components/ui/button';

// Pour l'instant, on va créer des composants inline pour éviter les erreurs

/* ================= Types ================= */
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
  createdAt?: Timestamp | Date | null;
  validatedAt?: Timestamp | Date | null;
  refusedAt?: Timestamp | Date | null;
  [key: string]: any;
}

/* ================= Helpers ================= */
const norm = (s = '') =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ITEMS_PER_PAGE = 12;

/* ================= Status Colors ================= */
const getStatusConfig = (status?: ReservationStatus) => {
  switch (status) {
    case 'verification':
      return {
        label: 'À vérifier',
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
    case 'en_attente':
      return {
        label: 'En attente',
        color: 'bg-blue-100 text-blue-800 border-blue-300',
        icon: <Clock className="h-3 w-3" />,
        priority: 0,
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

/* ================= Composants inline ================= */
// Badge inline pour éviter l'import
const Badge: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${className}`}>
    {children}
  </span>
);

// Button inline pour éviter l'import
const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'outline';
}> = ({ children, onClick, disabled = false, className = '', variant = 'default' }) => {
  const baseClasses = 'px-4 py-2 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
  
  const variantClasses = variant === 'outline' 
    ? 'border bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed';
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${className}`}
    >
      {children}
    </button>
  );
};

/* ================= Component ================= */
const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();
  const { setHeader, resetHeader } = usePageHeader();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('verification');

  /* 🔔 AUDIO */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeenCreatedAtRef = useRef<number>(0);
  const [soundEnabled, setSoundEnabled] = useState(false);

  /* ================= Header ================= */
  useEffect(() => {
    setHeader({
      title: 'Réservations en ligne',
      subtitle: 'Validation des preuves de paiement',
      actions: (
        <button
          onClick={() => {
            if (!audioRef.current) return;
            audioRef.current
              .play()
              .then(() => {
                audioRef.current?.pause();
                audioRef.current!.currentTime = 0;
                setSoundEnabled(true);
              })
              .catch((err) => {
                console.warn('Audio bloqué par le navigateur', err);
              });
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            soundEnabled
              ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
              : 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
          }`}
        >
          {soundEnabled ? <Bell size={14} /> : <BellOff size={14} />}
          {soundEnabled ? '🔔 Activé' : '🔕 Activer le son'}
        </button>
      ),
    });

    return () => resetHeader();
  }, [setHeader, resetHeader, soundEnabled]);

  /* ================= Actions Admin ================= */
  const handleValidate = async (reservation: Reservation) => {
    if (!user?.companyId || !reservation.agencyId) return;
    
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
    if (!user?.companyId || !reservation.agencyId) return;
    
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
          statut: 'refuse',
          refusedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
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

  /* ================= Temps réel ================= */
  useEffect(() => {
    if (!user?.companyId) return;

    setLoading(true);
    let unsubs: Array<() => void> = [];
    let firstPacket = true;

    (async () => {
      const agencesSnap = await getDocs(
        collection(db, 'companies', user.companyId, 'agences')
      );
      const agenceIds = agencesSnap.docs.map((d) => d.id);
      const buffer = new Map<string, Reservation>();

      agenceIds.forEach((agencyId) => {
        const qRef = query(
          collection(
            db,
            'companies',
            user.companyId!,
            'agences',
            agencyId,
            'reservations'
          ),
          filterStatus
            ? where('statut', '==', filterStatus)
            : where('statut', 'in', [
                'en_attente',
                'verification',
                'confirme',
                'refuse',
                'annule',
              ]),
          orderBy('createdAt', 'desc'),
          limit(ITEMS_PER_PAGE)
        );

        const unsub = onSnapshot(qRef, (snap) => {
          let newest = lastSeenCreatedAtRef.current;

          snap.docChanges().forEach((chg) => {
            const d = chg.doc.data() as any;
            const row: Reservation = {
              id: chg.doc.id,
              ...d,
              agencyId: d.agencyId || agencyId,
            };

            const key = `${row.agencyId}_${row.id}`;

            if (chg.type === 'removed') {
              buffer.delete(key);
            } else {
              buffer.set(key, row);
              const ts =
                d.createdAt instanceof Timestamp
                  ? d.createdAt.toMillis()
                  : 0;
              if (ts > newest) newest = ts;
            }
          });

          /* 🔔 SON */
          if (
            soundEnabled &&
            newest > lastSeenCreatedAtRef.current &&
            Date.now() - newest < 10_000 &&
            audioRef.current
          ) {
            audioRef.current.play().catch((err) => {
              console.warn('Erreur audio', err);
            });
          }

          lastSeenCreatedAtRef.current = newest;

          const merged = Array.from(buffer.values())
            .sort((a, b) => {
              const ta =
                a.createdAt instanceof Timestamp
                  ? a.createdAt.toMillis()
                  : new Date(a.createdAt || 0).getTime();
              const tb =
                b.createdAt instanceof Timestamp
                  ? b.createdAt.toMillis()
                  : new Date(b.createdAt || 0).getTime();
              return tb - ta;
            })
            .slice(0, ITEMS_PER_PAGE);

          setReservations(merged);
          if (firstPacket) {
            setLoading(false);
            firstPacket = false;
          }
        });

        unsubs.push(unsub);
      });
    })();

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user?.companyId, filterStatus, soundEnabled]);

  /* ================= Recherche ================= */
  const filteredReservations = useMemo(() => {
    const term = norm(searchTerm);
    if (!term) return reservations;
    return reservations.filter((r) => {
      return (
        norm(r.nomClient || '').includes(term) ||
        (r.telephone || '').includes(term) ||
        norm(r.referenceCode || '').includes(term) ||
        norm(r.depart || '').includes(term) ||
        norm(r.arrivee || '').includes(term)
      );
    });
  }, [reservations, searchTerm]);

  /* ================= Formatage ================= */
  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatAmount = (amount?: number) => {
    if (!amount) return '0 FCFA';
    return `${amount.toLocaleString('fr-FR')} FCFA`;
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
              <option value="verification">À vérifier</option>
              <option value="confirme">Confirmés</option>
              <option value="refuse">Refusés</option>
              <option value="annule">Annulés</option>
              <option value="en_attente">En attente</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">À vérifier</div>
          <div className="text-2xl font-bold text-amber-600">
            {reservations.filter(r => r.statut === 'verification').length}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Confirmés</div>
          <div className="text-2xl font-bold text-emerald-600">
            {reservations.filter(r => r.statut === 'confirme').length}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Refusés</div>
          <div className="text-2xl font-bold text-red-600">
            {reservations.filter(r => r.statut === 'refuse').length}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-1">Total</div>
          <div className="text-2xl font-bold text-gray-900">
            {reservations.length}
          </div>
        </div>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredReservations.map((reservation) => {
          const statusConfig = getStatusConfig(reservation.statut);
          const isProcessing = processingId === reservation.id;
          
          return (
            <div
              key={`${reservation.agencyId}_${reservation.id}`}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 truncate">
                      {reservation.nomClient || 'Sans nom'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
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
                  <div className="text-xs font-mono text-gray-600 bg-gray-50 px-2 py-1 rounded">
                    #{reservation.referenceCode}
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Trajet</span>
                  <span className="text-sm font-medium text-gray-900">
                    {reservation.depart} → {reservation.arrivee}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Date</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatDate(reservation.date)} à {reservation.heure}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Montant</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatAmount(reservation.montant)}
                  </span>
                </div>

                {reservation.tripType === 'aller-retour' && (
                  <div className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded">
                    <span className="font-medium">Aller-retour</span>
                    <div className="flex justify-between mt-1">
                      <span>Aller: {reservation.seatsGo} place(s)</span>
                      <span>Retour: {reservation.seatsReturn} place(s)</span>
                    </div>
                  </div>
                )}

                {reservation.paymentProofUrl && (
                  <div className="pt-2">
                    <a
                      href={reservation.paymentProofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Voir la preuve de paiement
                    </a>
                  </div>
                )}
              </div>

              {/* Actions */}
              {reservation.statut === 'verification' && (
                <div className="p-4 border-t border-gray-100 bg-gray-50">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleValidate(reservation)}
                      disabled={isProcessing}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isProcessing ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="h-4 w-4"
                        >
                          <RotateCw className="h-4 w-4" />
                        </motion.div>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Valider
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => handleRefuse(reservation)}
                      disabled={isProcessing}
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Refuser
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 🔊 AUDIO */}
      <audio ref={audioRef} src="/sounds/new.mp3" preload="auto" />
    </div>
  );
};

export default ReservationsEnLignePage;