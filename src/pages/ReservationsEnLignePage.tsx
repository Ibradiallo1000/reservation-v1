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
  deleteDoc,
  onSnapshot,
  Timestamp,
  getDocs,
  getDoc,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { RotateCw, Frown, Search, Bell, BellOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { ReservationCard } from '@/components/ReservationCard';
import { usePageHeader } from '@/contexts/PageHeaderContext';

/* ================= Types ================= */
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
  [key: string]: any;
}

/* ================= Helpers ================= */
const norm = (s = '') =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ITEMS_PER_PAGE = 8;

/* ================= Component ================= */
const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();
  const { setHeader, resetHeader } = usePageHeader();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] =
    useState<ReservationStatus | ''>('preuve_recue');

  /* 🔔 AUDIO */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeenCreatedAtRef = useRef<number>(0);
  const [soundEnabled, setSoundEnabled] = useState(false);

  /* ================= Header ================= */
  useEffect(() => {
    setHeader({
      title: 'Réservations en ligne',
      subtitle: 'Preuves de paiement',
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
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm border ${
            soundEnabled
              ? 'bg-green-100 text-green-700'
              : 'bg-yellow-100 text-yellow-700'
          }`}
        >
          {soundEnabled ? <Bell size={14} /> : <BellOff size={14} />}
          {soundEnabled ? 'Son activé' : 'Activer le son'}
        </button>
      ),
    });

    return () => resetHeader();
  }, [setHeader, resetHeader, soundEnabled]);

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
                'preuve_recue',
                'payé',
                'annulé',
                'refusé',
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
        norm((r as any).referenceCode || '').includes(term)
      );
    });
  }, [reservations, searchTerm]);

  /* ================= Render ================= */
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Réservations en ligne</h1>
          <p className="text-sm text-gray-500">Preuves de paiement</p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              placeholder="Rechercher…"
              className="pl-9 pr-4 py-2 border rounded-lg w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as ReservationStatus | '')
            }
            className="border rounded-lg px-3 py-2"
          >
            <option value="">Tous</option>
            <option value="preuve_recue">Preuve reçue</option>
            <option value="payé">Payé</option>
            <option value="annulé">Annulé</option>
            <option value="refusé">Refusé</option>
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <RotateCw className="h-8 w-8 text-blue-600" />
          </motion.div>
        </div>
      )}

      {!loading && filteredReservations.length === 0 && (
        <div className="bg-white rounded-xl border p-8 text-center">
          <Frown className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium">
            Aucune réservation trouvée
          </h3>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredReservations.map((reservation) => (
          <ReservationCard
            key={`${reservation.agencyId}_${reservation.id}`}
            reservation={reservation}
            isLoading={processingId === reservation.id}
          />
        ))}
      </div>

      {/* 🔊 AUDIO */}
      <audio ref={audioRef} src="/sounds/new.mp3" preload="auto" />
    </div>
  );
};

export default ReservationsEnLignePage;
