import React, { useEffect, useState, useRef } from 'react';
import {
  collection, query, where, orderBy, limit, updateDoc, doc,
  deleteDoc, onSnapshot, Timestamp, getDocs, getDoc, runTransaction
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { RotateCw, Frown, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { ReservationCard } from '../components/ReservationCard';
import type { Reservation, ReservationStatus } from '../types/index';

/** ================= Helpers référence ================ **/

/** abréviation “compagnie” : jusqu’à 3 lettres (initiales) */
const abbrCompany = (name = '', fallback = 'CMP') => {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  if (!n) return fallback;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase(); // “MANITRANS” -> “MAN”
  return parts.slice(0, 3).map(p => p[0]).join('').toUpperCase();     // “Mani Trans” -> “MT”
};

/** initiale d’agence : toujours 1 lettre, quel que soit le nombre de mots */
const initialAgency = (name = '', fallback = 'A') => {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').trim();
  return (n[0] || fallback).toUpperCase();
};

/**
 * Pose le referenceCode une seule fois si manquant, au format: COMP-Agc-WEB-0001
 * - Lit les noms (compagnie/agence) hors transaction
 * - Incrémente le compteur et écrit referenceCode dans UNE transaction
 */
async function ensureReferenceCode(companyId: string, agencyId: string, reservationId: string) {
  // 1) Lire noms (hors transaction)
  const compSnap = await getDoc(doc(db, 'companies', companyId));
  const companyName = (compSnap.data()?.name || compSnap.data()?.nom || '') as string;

  const agSnap = await getDoc(doc(db, 'companies', companyId, 'agences', agencyId));
  const agencyName = (agSnap.data()?.nom || agSnap.data()?.name || '') as string;

  const comp = abbrCompany(companyName, 'CMP');
  const agc = initialAgency(agencyName, 'A');
  const channelKey = 'WEB';

  // 2) Transaction : incrément séquence + set referenceCode si manquant
  const seqRef = doc(db, 'companies', companyId, 'agences', agencyId, 'sequences', channelKey);
  const resRef = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId);

  const finalRef = await runTransaction(db, async (tx) => {
    const resSnap = await tx.get(resRef);
    if (!resSnap.exists()) throw new Error('Reservation not found');

    const already = resSnap.data()?.referenceCode as string | undefined;
    if (already) {
      console.log('[ensureReferenceCode] already set →', already);
      return already;
    }

    const seqSnap = await tx.get(seqRef);
    let last = 0;
    if (!seqSnap.exists()) {
      tx.set(seqRef, { last: 0, updatedAt: new Date() });
    } else {
      last = (seqSnap.data()?.last as number) || 0;
    }
    const next = last + 1;
    tx.set(seqRef, { last: next, updatedAt: new Date() }, { merge: true });

    const serial = String(next).padStart(4, '0'); // 0001, 0002, ...
    const refCode = `${comp}-${agc}-WEB-${serial}`;

    tx.update(resRef, { referenceCode: refCode });
    console.log('[ensureReferenceCode] set →', refCode);
    return refCode;
  });

  return finalRef;
}

/** ===================================================== **/

const ITEMS_PER_PAGE = 8;

const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('preuve_recue');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!user?.companyId) return;
    setLoading(true);

    (async () => {
      // On récupère toutes les agences de la compagnie
      const agencesSnap = await getDocs(collection(db, 'companies', user.companyId, 'agences'));
      const agenceIds = agencesSnap.docs.map(d => d.id);

      // Pour chaque agence : requête + listener
      const unsubscribers = agenceIds.map((agencyId) => {
        const q = query(
          collection(db, 'companies', user.companyId!, 'agences', agencyId, 'reservations'),
          filterStatus
            ? where('statut', '==', filterStatus)
            : where('statut', 'in', ['preuve_recue', 'payé', 'annulé', 'refusé']),
          orderBy('createdAt', 'desc'),
          limit(ITEMS_PER_PAGE)
        );

        return onSnapshot(q, (snap) => {
          const rows = snap.docs.map(docSnap => {
            const data = docSnap.data() as any;
            const row: Reservation = {
              id: docSnap.id,
              ...data,
              // ✅ on attache l’agence à la ligne
              agencyId: data.agencyId || data.agenceId || agencyId,
            };
            return row;
          });

          // “ding” si nouvelles résas (<10s)
          const newOnes = rows.filter(r => r.createdAt instanceof Timestamp
            ? (Timestamp.now().seconds - r.createdAt.seconds) < 10
            : false);
          if (newOnes.length > 0 && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }

          // NOTE: si tu veux merger toutes les agences, combine ici avec setReservations(prev => merge(prev, rows))
          setReservations(rows);
          setLoading(false);
        });
      });

      return () => unsubscribers.forEach(u => u());
    })();
  }, [user?.companyId, filterStatus]);

  /** Valider = assurer referenceCode + passer en payé */
  const validerReservation = async (id: string, agencyId?: string) => {
    if (!agencyId || !user?.companyId) {
      alert("Aucune agence associée à cette réservation");
      return;
    }
    try {
      setProcessingId(id);
      console.log('[validate] start →', { id, agencyId });

      // 1) Assurer la référence (si absente) avec initiale agence (1 lettre)
      await ensureReferenceCode(user.companyId, agencyId, id);

      // 2) statut → payé
      await updateDoc(doc(db, 'companies', user.companyId, 'agences', agencyId, 'reservations', id), {
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

  const refuserReservation = async (id: string, agencyId?: string) => {
    if (!agencyId || !user?.companyId) return alert("Aucune agence associée à cette réservation");
    const reason = window.prompt('Raison du refus ?') || 'Non spécifié';
    try {
      setProcessingId(id);
      await updateDoc(doc(db, 'companies', user.companyId, 'agences', agencyId, 'reservations', id), {
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

  const supprimerReservation = async (id: string, agencyId?: string) => {
    if (!agencyId || !user?.companyId) return alert("Aucune agence associée à cette réservation");
    if (!window.confirm("Supprimer cette réservation ?")) return;
    try {
      await deleteDoc(doc(db, 'companies', user.companyId, 'agences', agencyId, 'reservations', id));
      setReservations(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      alert("Erreur lors de la suppression ❌");
    }
  };

  const filteredReservations = reservations.filter(res =>
    res.nomClient?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.telephone?.includes(searchTerm) ||
    res.referenceCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (res as any).email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          {user?.companyLogo && (
            <LazyLoadImage src={user.companyLogo} alt="Logo" effect="blur"
              className="h-10 w-10 rounded border object-cover" />
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-white rounded-xl border p-8 text-center">
          <Frown className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Aucune réservation trouvée</h3>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredReservations.map((reservation) => (
          <ReservationCard
            key={reservation.id}
            reservation={reservation}
            onValider={() => validerReservation(reservation.id, (reservation as any).agencyId)}
            onRefuser={() => refuserReservation(reservation.id, (reservation as any).agencyId)}
            onSupprimer={() => supprimerReservation(reservation.id, (reservation as any).agencyId)}
            isLoading={processingId === reservation.id}
          />
        ))}
      </div>

      {/* son optionnel */}
      <audio ref={audioRef} src="/sounds/new.mp3" preload="auto" />
    </div>
  );
};

export default ReservationsEnLignePage;
