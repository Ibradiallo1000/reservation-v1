// src/hooks/useReservations.ts
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit as limitDocs,
  startAfter,
  onSnapshot,
  QueryDocumentSnapshot,
  getDocs
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { Reservation, ReservationStatus, Canal } from '@/types/index';

interface UseReservationsOptions {
  companyId: string;
  statuses: ReservationStatus[];
  channel: Canal;            // <- Channel => Canal
  limit: number;
  realtime?: boolean;
  playSound?: boolean;
}

interface UseReservationsReturn {
  reservations: Reservation[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => void;
  newReservationCount: number;
  resetNewReservationCount: () => void;
}

export const useReservations = ({
  companyId,
  statuses,
  channel,
  limit,
  realtime = true,
  playSound = true
}: UseReservationsOptions): UseReservationsReturn => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [newReservationCount, setNewReservationCount] = useState(0);

  // ✅ Son de notification
  const playNotificationSound = () => {
    if (!playSound) return;
    const audio = new Audio('/notification.mp3'); // Mets ton fichier ici
    audio.volume = 0.3;
    audio.play().catch(e => console.warn('Audio play error:', e));
  };

  // ✅ Chargement initial + temps réel
  useEffect(() => {
    if (!companyId) return;

    const baseQuery = query(
      collection(db, 'reservations'),
      where('companyId', '==', companyId),
      where('statut', 'in', statuses),
      where('canal', '==', channel),
      orderBy('createdAt', 'desc'),
      limitDocs(limit)
    );

    setLoading(true);

    let unsubscribe = () => {};

    if (realtime) {
      unsubscribe = onSnapshot(
        baseQuery,
        (snapshot) => {
          const docs: Reservation[] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as Omit<Reservation, 'id'>)
          }));

          if (reservations.length > 0) {
            const newItems = docs.filter(doc => !reservations.some(r => r.id === doc.id));
            if (newItems.length > 0) {
              playNotificationSound();
              setNewReservationCount(prev => prev + newItems.length);
            }
          }

          setReservations(docs);
          setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
          setHasMore(docs.length === limit);
          setLoading(false);
        },
        (err) => {
          console.error(err);
          setError(err);
          setLoading(false);
        }
      );
    } else {
      getDocs(baseQuery)
        .then(snapshot => {
          const docs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as Omit<Reservation, 'id'>)
          }));
          setReservations(docs);
          setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
          setHasMore(docs.length === limit);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError(err);
          setLoading(false);
        });
    }

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, JSON.stringify(statuses), channel, limit, realtime]);

  // ✅ Pagination « charger plus »
  const loadMore = async () => {
    if (!lastVisible) return;
    setLoading(true);

    const nextQuery = query(
      collection(db, 'reservations'),
      where('companyId', '==', companyId),
      where('statut', 'in', statuses),
      where('canal', '==', channel),
      orderBy('createdAt', 'desc'),
      startAfter(lastVisible),
      limitDocs(limit)
    );

    try {
      const snapshot = await getDocs(nextQuery);
      const newDocs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Omit<Reservation, 'id'>)
      }));

      setReservations(prev => [...prev, ...newDocs]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(newDocs.length === limit);
    } catch (err) {
      console.error(err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const resetNewReservationCount = () => setNewReservationCount(0);

  return {
    reservations,
    loading,
    error,
    hasMore,
    loadMore,
    newReservationCount,
    resetNewReservationCount
  };
};
