// ✅ src/pages/ReservationsEnLignePage.tsx

import React, { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, limit,
  updateDoc, doc, startAfter, deleteDoc, QueryDocumentSnapshot, onSnapshot, getDocs
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
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('preuve_recue');
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!user?.companyId) return;
    setLoading(true);

    const q = query(
      collection(db, 'reservations'),
      where('companyId', '==', user.companyId),
      filterStatus
        ? where('statut', '==', filterStatus)
        : where('statut', 'in', ['preuve_recue', 'payé', 'annulé', 'refusé']),
      orderBy('createdAt', 'desc'),
      limit(ITEMS_PER_PAGE)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const newReservations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reservation));
      setReservations(newReservations);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(newReservations.length === ITEMS_PER_PAGE);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.companyId, filterStatus]);

  const loadMoreReservations = async () => {
    if (!user?.companyId || !lastDoc || !hasMore) return;
    setLoading(true);
    const q = query(
      collection(db, 'reservations'),
      where('companyId', '==', user.companyId),
      filterStatus
        ? where('statut', '==', filterStatus)
        : where('statut', 'in', ['preuve_recue', 'payé', 'annulé', 'refusé']),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(ITEMS_PER_PAGE)
    );
    const snap = await getDocs(q);
    const newReservations = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reservation));
    setReservations(prev => [...prev, ...newReservations]);
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setHasMore(newReservations.length === ITEMS_PER_PAGE);
    setLoading(false);
  };

  const validerReservation = async (id: string) => { await updateDoc(doc(db, 'reservations', id), { statut: 'payé', validatedAt: new Date(), validatedBy: user?.uid }); };
  const refuserReservation = async (id: string) => { const reason = window.prompt('Raison ?') || 'Non spécifié'; await updateDoc(doc(db, 'reservations', id), { statut: 'refusé', refusalReason: reason, refusedAt: new Date(), refusedBy: user?.uid }); };
  const supprimerReservation = async (id: string) => { await deleteDoc(doc(db, 'reservations', id)); };

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
          {user?.companyLogo && <LazyLoadImage src={user.companyLogo} alt="Logo" effect="blur" className="h-10 w-10 rounded border object-cover" />}
          <div><h1 className="text-2xl font-bold text-gray-900">Réservations en ligne</h1><p className="text-sm text-gray-500">Preuves de paiement</p></div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="w-4 h-4 text-gray-400" /></div>
            <input type="text" placeholder="Rechercher..." className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ReservationStatus | '')} className="border border-gray-300 rounded-lg px-3 py-2 min-w-[180px]">
            <option value="">Tous les statuts</option>
            <option value="preuve_recue">Preuve reçue</option>
            <option value="payé">Payé</option>
            <option value="annulé">Annulé</option>
            <option value="refusé">Refusé</option>
          </select>
        </div>
      </div>

      {loading && reservations.length === 0 && <div className="flex justify-center py-8"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RotateCw className="h-8 w-8 text-blue-600" /></motion.div></div>}
      {!loading && filteredReservations.length === 0 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-xl border p-8 text-center"><Frown className="mx-auto h-12 w-12 text-gray-400" /><h3 className="mt-4 text-lg font-medium text-gray-900">Aucune réservation trouvée</h3></motion.div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredReservations.map((reservation) => (
          <ReservationCard key={reservation.id} reservation={reservation} onValider={validerReservation} onRefuser={refuserReservation} onSupprimer={supprimerReservation} />
        ))}
      </div>

      {hasMore && filteredReservations.length > 0 && (
        <div className="flex justify-center mt-8">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={loadMoreReservations} disabled={loading} className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
            {loading ? <><RotateCw className="h-4 w-4 animate-spin" /> Chargement...</> : <>Afficher plus <ChevronRight className="h-4 w-4" /></>}
          </motion.button>
        </div>
      )}
    </div>
  );
};

export default ReservationsEnLignePage;
