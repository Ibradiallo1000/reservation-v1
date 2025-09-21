// src/pages/ReservationsEnLignePage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, query, where, orderBy, limit, updateDoc, doc,
  deleteDoc, onSnapshot, Timestamp, getDocs, getDoc, runTransaction
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { RotateCw, Frown, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { ReservationCard } from '@/components/ReservationCard';
import { usePageHeader } from '@/contexts/PageHeaderContext';

/* ================= Types locaux (corrige l'erreur 2305) ================ */
export type ReservationStatus =
  | 'preuve_recue'
  | 'payé'
  | 'annulé'
  | 'refusé'
  | string;

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
  createdAt?: Timestamp | Date | null;

  // Champs potentiels pour la preuve (on tolère plusieurs noms)
  preuve?: { url?: string; status?: string; filename?: string; message?: string; via?: string };
  preuveUrl?: string;
  paymentProofUrl?: string;
  paiementPreuveUrl?: string;
  proofUrl?: string;
  receiptUrl?: string;

  [key: string]: any;
}

/* ================= Helpers ================ */

const norm = (s = '') =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const abbrCompany = (name = '', fallback = 'CMP') => {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  if (!n) return fallback;
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 3).map(p => p[0]).join('').toUpperCase();
};

const initialAgency = (name = '', fallback = 'A') => {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').trim();
  return (n[0] || fallback).toUpperCase();
};

/** Pose referenceCode une seule fois si manquant: COMP-A-WEB-0001 */
async function ensureReferenceCode(companyId: string, agencyId: string, reservationId: string) {
  const compSnap = await getDoc(doc(db, 'companies', companyId));
  const companyName = (compSnap.data()?.name || compSnap.data()?.nom || '') as string;

  const agSnap = await getDoc(doc(db, 'companies', companyId, 'agences', agencyId));
  const agencyName = (agSnap.data()?.nomAgence || agSnap.data()?.nom || agSnap.data()?.name || '') as string;

  const comp = abbrCompany(companyName, 'CMP');
  const agc = initialAgency(agencyName, 'A');
  const channelKey = 'WEB';

  const seqRef = doc(db, 'companies', companyId, 'agences', agencyId, 'sequences', channelKey);
  const resRef = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId);

  const finalRef = await runTransaction(db, async (tx) => {
    const resSnap = await tx.get(resRef);
    if (!resSnap.exists()) throw new Error('Reservation not found');
    const already = resSnap.data()?.referenceCode as string | undefined;
    if (already) return already;

    const seqSnap = await tx.get(seqRef);
    let last = 0;
    if (!seqSnap.exists()) {
      tx.set(seqRef, { last: 0, updatedAt: new Date() });
    } else {
      last = (seqSnap.data()?.last as number) || 0;
    }
    const next = last + 1;
    tx.set(seqRef, { last: next, updatedAt: new Date() }, { merge: true });

    const serial = String(next).padStart(4, '0');
    const refCode = `${comp}-${agc}-WEB-${serial}`;
    tx.update(resRef, { referenceCode: refCode });
    return refCode;
  });

  return finalRef;
}

/* ========================================= */

const ITEMS_PER_PAGE = 8;

const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();
  const { setHeader, resetHeader } = usePageHeader();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ReservationStatus | ''>('preuve_recue');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeenCreatedAtRef = useRef<number>(0); // pour ding unique

  /* --- Header dynamique du layout --- */
  useEffect(() => {
    setHeader({ title: 'Réservations en ligne', subtitle: 'Preuves de paiement' });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  /* --- Temps réel multi-agences fusionné --- */
  useEffect(() => {
    if (!user?.companyId) return;
    setLoading(true);

    let unsubs: Array<() => void> = [];
    let firstPacketReceived = false;

    (async () => {
      const agencesSnap = await getDocs(collection(db, 'companies', user.companyId, 'agences'));
      const agenceIds = agencesSnap.docs.map(d => d.id);

      // Map interne: key = `${agencyId}_${reservationId}`
      const buffer = new Map<string, Reservation>();

      agenceIds.forEach((agencyId) => {
        const qRef = query(
          collection(db, 'companies', user.companyId!, 'agences', agencyId, 'reservations'),
          filterStatus
            ? where('statut', '==', filterStatus)
            : where('statut', 'in', ['preuve_recue', 'payé', 'annulé', 'refusé']),
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
              agencyId: d.agencyId || d.agenceId || agencyId,
            };

            const key = `${row.agencyId}_${row.id}`;
            if (chg.type === 'removed') {
              buffer.delete(key);
            } else {
              buffer.set(key, row);

              const ts = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : 0;
              if (ts && ts > newest) newest = ts;
            }
          });

          // “ding” si nouvelles (<10s)
          if (newest > 0 && newest > lastSeenCreatedAtRef.current) {
            const now = Date.now();
            if (now - newest < 10_000 && audioRef.current) {
              audioRef.current.play().catch(() => {});
            }
            lastSeenCreatedAtRef.current = newest;
          }

          // Fusion globale triée + coupe à ITEMS_PER_PAGE
          const merged = Array.from(buffer.values())
            .sort((a, b) => {
              const ta = a.createdAt instanceof Timestamp ? a.createdAt.toMillis()
                : a.createdAt ? (a.createdAt as any).toMillis?.() ?? new Date(a.createdAt).getTime() : 0;
              const tb = b.createdAt instanceof Timestamp ? b.createdAt.toMillis()
                : b.createdAt ? (b.createdAt as any).toMillis?.() ?? new Date(b.createdAt).getTime() : 0;
              return tb - ta;
            })
            .slice(0, ITEMS_PER_PAGE);

          setReservations(merged);
          if (!firstPacketReceived) {
            firstPacketReceived = true;
            setLoading(false);
          }
        });

        unsubs.push(unsub);
      });
    })();

    return () => {
      unsubs.forEach(u => u());
    };
  }, [user?.companyId, filterStatus]);

  /* --- Actions --- */
  const validerReservation = async (id: string, agencyId?: string) => {
    if (!agencyId || !user?.companyId) return alert("Aucune agence associée à cette réservation");
    try {
      setProcessingId(id);
      await ensureReferenceCode(user.companyId, agencyId, id);
      await updateDoc(doc(db, 'companies', user.companyId, 'agences', agencyId, 'reservations', id), {
        statut: 'payé',
        validatedAt: new Date(),
        validatedBy: user.uid
      });
      setReservations(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
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
      setReservations(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
      alert("Erreur lors du refus ❌");
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
    } catch {
      alert("Erreur lors de la suppression ❌");
    }
  };

  /* --- Recherche normalisée (sans accents) --- */
  const filteredReservations = useMemo(() => {
    const term = norm(searchTerm);
    if (!term) return reservations;
    return reservations.filter((res) => {
      const nom = norm(res.nomClient || '');
      const tel = (res.telephone || '').toLowerCase();
      const ref = norm((res as any).referenceCode || '');
      const mail = norm((res as any).email || '');
      return nom.includes(term) || tel.includes(term) || ref.includes(term) || mail.includes(term);
    });
  }, [reservations, searchTerm]);

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
              placeholder="Rechercher par nom, téléphone, référence…"
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

      {loading && filteredReservations.length === 0 && (
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
            key={`${(reservation as any).agencyId || 'ag'}_${reservation.id}`}
            reservation={reservation}
            onValider={() => validerReservation(reservation.id, (reservation as any).agencyId)}
            onRefuser={() => refuserReservation(reservation.id, (reservation as any).agencyId)}
            onSupprimer={() => supprimerReservation(reservation.id, (reservation as any).agencyId)}
            isLoading={processingId === reservation.id}
          />
        ))}
      </div>

      <audio ref={audioRef} src="/sounds/new.mp3" preload="auto" />
    </div>
  );
};

export default ReservationsEnLignePage;
