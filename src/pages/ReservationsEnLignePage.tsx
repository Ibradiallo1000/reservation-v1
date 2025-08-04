import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  doc,
  deleteDoc,
  onSnapshot,
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { RotateCw, ChevronRight, Frown, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { ReservationCard } from '../components/ReservationCard';
import type { Reservation, ReservationStatus } from '../types/index';

const ITEMS_PER_PAGE = 8;

const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('preuve_recue');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeenRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!user?.companyId) return;
    setLoading(true);

    const unsubscribe = async () => {
      const agencesSnap = await getDocs(
        collection(db, 'companies', user.companyId, 'agences')
      );
      const agenceIds = agencesSnap.docs.map(doc => doc.id);

      const queries = agenceIds.map(id =>
        query(
          collection(db, 'companies', user.companyId, 'agences', id, 'reservations'),
          filterStatus
            ? where('statut', '==', filterStatus)
            : where('statut', 'in', ['preuve_recue', 'payé', 'annulé', 'refusé']),
          orderBy('createdAt', 'desc'),
          limit(ITEMS_PER_PAGE)
        )
      );

      const unsubscribes = queries.map(q =>
        onSnapshot(q, snap => {
          const allReservations = snap.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              agenceId: data.agenceId || data.agencyId || '',
            } as Reservation;
          });

          const newOnes = allReservations.filter(res => {
            if (res.createdAt instanceof Timestamp) {
              const now = Timestamp.now();
              return now.seconds - res.createdAt.seconds < 10;
            }
            return false;
          });

          if (newOnes.length > 0 && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }

          setReservations(allReservations);
          setLoading(false);
        })
      );

      return () => unsubscribes.forEach(unsub => unsub());
    };

    unsubscribe();
  }, [user?.companyId, filterStatus]);

  const validerReservation = async (id: string, agenceId?: string) => {
    if (!agenceId || !user?.companyId) return alert("Aucune agence associée à cette réservation");
    try {
      setProcessingId(id);
      await updateDoc(doc(db, 'companies', user.companyId, 'agences', agenceId, 'reservations', id), {
        statut: 'payé',
        validatedAt: new Date(),
        validatedBy: user.uid
      });
      alert("Réservation validée ✅");
      setReservations(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error("Erreur validation:", error);
      alert("Une erreur est survenue lors de la validation ❌");
    } finally {
      setProcessingId(null);
    }
  };

  const refuserReservation = async (id: string, agenceId?: string) => {
    if (!agenceId || !user?.companyId) return alert("Aucune agence associée à cette réservation");
    const reason = window.prompt('Raison du refus ?') || 'Non spécifié';
    try {
      setProcessingId(id);
      await updateDoc(doc(db, 'companies', user.companyId, 'agences', agenceId, 'reservations', id), {
        statut: 'refusé',
        refusalReason: reason,
        refusedAt: new Date(),
        refusedBy: user.uid
      });
      alert("Réservation refusée ❌");
      setReservations(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error("Erreur refus:", error);
      alert("Erreur lors du refus");
    } finally {
      setProcessingId(null);
    }
  };

  const supprimerReservation = async (id: string, agenceId?: string) => {
    if (!agenceId || !user?.companyId) return alert("Aucune agence associée à cette réservation");
    if (!window.confirm("Supprimer cette réservation ?")) return;
    try {
      await deleteDoc(doc(db, 'companies', user.companyId, 'agences', agenceId, 'reservations', id));
      setReservations(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      alert("Erreur lors de la suppression ❌");
    }
  };

  const filteredReservations = reservations.filter(res =>
    res.nomClient?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.telephone?.includes(searchTerm) ||
    res.referenceCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          {user?.companyLogo && (
            <LazyLoadImage src={user.companyLogo} alt="Logo" effect="blur" className="h-10 w-10 rounded border object-cover" />
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Réservations en ligne</h1>
            <p className="text-sm text-gray-500">Preuves de paiement</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Rechercher..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as ReservationStatus | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 min-w-[180px]"
          >
            <option value="">Tous les statuts</option>
            <option value="preuve_recue">Preuve reçue</option>
            <option value="payé">Payé</option>
            <option value="annulé">Annulé</option>
            <option value="refusé">Refusé</option>
          </select>
        </div>
      </div>

      {loading && reservations.length === 0 && (
        <div className="flex justify-center py-8">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
            <RotateCw className="h-8 w-8 text-blue-600" />
          </motion.div>
        </div>
      )}

      {!loading && filteredReservations.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-xl border p-8 text-center">
          <Frown className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Aucune réservation trouvée</h3>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredReservations.map((reservation) => (
          <ReservationCard
            key={reservation.id}
            reservation={reservation}
            onValider={() => validerReservation(reservation.id, reservation.agenceId)}
            onRefuser={() => refuserReservation(reservation.id, reservation.agenceId)}
            onSupprimer={() => supprimerReservation(reservation.id, reservation.agenceId)}
            isLoading={processingId === reservation.id}
          />
        ))}
      </div>
    </div>
  );
};

export default ReservationsEnLignePage;
