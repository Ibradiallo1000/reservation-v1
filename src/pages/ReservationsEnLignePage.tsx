import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  doc,
  startAfter,
  deleteDoc,
  QueryDocumentSnapshot,
  onSnapshot,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Download, RotateCw, ChevronRight, Frown, Search, Bell, Trash2, Clock, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

type Statut = 'payé' | 'preuve_recue' | 'annulé' | 'refusé';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  email?: string;
  referenceCode: string;
  montant: number;
  statut: Statut;
  canal: string;
  createdAt: any;
  preuveUrl?: string;
  preuveMessage?: string;
  validatedBy?: string;
  validatedAt?: any;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  seatsGo: number;
  seatsReturn?: number;
  companyName?: string;
}

const ITEMS_PER_PAGE = 8;
const NOTIFICATION_SOUND = '/son.mp3';

const statusStyles: Record<Statut, string> = {
  payé: 'bg-emerald-100 text-emerald-800',
  preuve_recue: 'bg-amber-100 text-amber-800',
  annulé: 'bg-red-100 text-red-800',
  refusé: 'bg-red-100 text-red-800'
};

const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<Statut | ''>('');
  const [hasMore, setHasMore] = useState(true);
  const [newNotification, setNewNotification] = useState(false);
  const reservationsRef = useRef<Reservation[]>([]);

  useEffect(() => {
    reservationsRef.current = reservations;
  }, [reservations]);

  // Écoute temps réel des réservations confirmées (statut preuve_recue ou payé)
  useEffect(() => {
    if (!user?.companyId) return;

    setLoading(true);
    
    let q = query(
      collection(db, 'reservations'),
      where('companyId', '==', user.companyId),
      where('statut', 'in', ['preuve_recue', 'payé', 'annulé', 'refusé']),
      orderBy('statut'), // Tri pour avoir preuve_recue en premier
      orderBy('createdAt', 'desc'),
      limit(ITEMS_PER_PAGE)
    );

    if (filterStatus) {
      q = query(q, where('statut', '==', filterStatus));
    }

    const unsubscribe = onSnapshot(q, (snap) => {
      const newReservations = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Reservation));

      // Notification seulement si nouvelle réservation valide
      if (reservationsRef.current.length > 0 && 
          newReservations.length > 0 && 
          newReservations[0].id !== reservationsRef.current[0]?.id) {
        playNotificationSound();
        setNewNotification(true);
        setTimeout(() => setNewNotification(false), 5000);
      }

      setReservations(newReservations);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(newReservations.length === ITEMS_PER_PAGE);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.companyId, filterStatus]);

  const playNotificationSound = () => {
    try {
      const audio = new Audio(NOTIFICATION_SOUND);
      audio.volume = 0.3;
      audio.play().catch(e => console.warn("Lecture du son bloquée:", e));
    } catch (error) {
      console.error("Erreur avec le son:", error);
    }
  };

  const loadMoreReservations = async () => {
    if (!user?.companyId || !lastDoc || !hasMore) return;

    setLoading(true);

    let q = query(
      collection(db, 'reservations'),
      where('companyId', '==', user.companyId),
      where('statut', 'in', ['preuve_recue', 'payé', 'annulé', 'refusé']),
      orderBy('statut'),
      orderBy('createdAt', 'desc'),
      startAfter(lastDoc),
      limit(ITEMS_PER_PAGE)
    );

    if (filterStatus) {
      q = query(q, where('statut', '==', filterStatus));
    }

    const snap = await getDocs(q);
    const newReservations = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Reservation));

    setReservations(prev => [...prev, ...newReservations]);
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setHasMore(newReservations.length === ITEMS_PER_PAGE);
    setLoading(false);
  };

  const validerReservation = async (id: string) => {
    if (window.confirm('Confirmer la validation de cette réservation ? Le client sera notifié.')) {
      try {
        await updateDoc(doc(db, 'reservations', id), {
          statut: 'payé',
          validatedAt: new Date(),
          validatedBy: user?.uid
        });
      } catch (error) {
        console.error("Erreur lors de la validation:", error);
        alert("Erreur lors de la validation");
      }
    }
  };

  const refuserReservation = async (id: string) => {
    const reason = window.prompt('Raison du refus (optionnel) :');
    if (reason !== null) { // Annulation si l'utilisateur clique sur "Annuler"
      try {
        await updateDoc(doc(db, 'reservations', id), {
          statut: 'refusé',
          refusedAt: new Date(),
          refusedBy: user?.uid,
          refusalReason: reason || 'Non spécifié'
        });
      } catch (error) {
        console.error("Erreur lors du refus:", error);
        alert("Erreur lors du refus");
      }
    }
  };

  const supprimerReservation = async (id: string) => {
    if (window.confirm('Supprimer définitivement cette réservation ? Cette action est irréversible.')) {
      try {
        await deleteDoc(doc(db, 'reservations', id));
      } catch (error) {
        console.error("Erreur lors de la suppression:", error);
        alert("Erreur lors de la suppression");
      }
    }
  };

  const filteredReservations = reservations.filter(res =>
    res.nomClient?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.telephone?.includes(searchTerm) ||
    res.referenceCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateValue?: any) => {
    if (!dateValue) return '--';
    try {
      const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '--';
    }
  };

  const formatLongDate = (dateValue?: any) => {
    if (!dateValue) return '--';
    try {
      const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
      return date.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '--';
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          {user?.companyLogo && (
            <LazyLoadImage 
              src={user.companyLogo} 
              alt="Logo compagnie"
              effect="blur"
              className="h-10 w-10 rounded-lg object-cover border"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Réservations en ligne
            </h1>
            <p className="text-sm text-gray-500">
              Gestion des preuves de paiement et validations
            </p>
          </div>
          {newNotification && (
            <motion.div
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              className="relative"
            >
              <Bell className="h-5 w-5 text-amber-500 fill-amber-100 animate-ring" />
              <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
            </motion.div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Rechercher client, téléphone, email..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as Statut | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px]"
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
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <RotateCw className="h-8 w-8 text-blue-600" />
          </motion.div>
        </div>
      )}

      {!loading && filteredReservations.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-xl border border-gray-200 p-8 text-center"
        >
          <Frown className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Aucune réservation trouvée
          </h3>
          <p className="mt-2 text-gray-500">
            {searchTerm || filterStatus
              ? "Aucun résultat pour votre recherche"
              : "Aucune réservation en ligne pour le moment"}
          </p>
        </motion.div>
      )}

      <div className="space-y-4">
        {filteredReservations.map((reservation) => (
          <motion.div
            key={reservation.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:shadow-sm transition-shadow"
          >
            <div className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900">{reservation.nomClient}</h3>
                      <p className="text-sm text-gray-500">{reservation.telephone}</p>
                      {reservation.email && (
                        <p className="text-sm text-gray-500">{reservation.email}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${statusStyles[reservation.statut] || 'bg-gray-100'}`}>
                      {reservation.statut.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Trajet</p>
                      <p className="font-medium">{reservation.depart} → {reservation.arrivee}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Date</p>
                      <p className="font-medium">{reservation.date} à {reservation.heure}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Places</p>
                      <p className="font-medium">
                        {reservation.seatsGo} aller
                        {reservation.seatsReturn ? ` + ${reservation.seatsReturn} retour` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Montant</p>
                      <p className="font-medium">{reservation.montant?.toLocaleString()} FCFA</p>
                    </div>
                  </div>
                </div>

                <div className="sm:w-48 space-y-2">
                  <div className="text-sm">
                    <p className="text-gray-500">Référence</p>
                    <p className="font-mono text-blue-600">{reservation.referenceCode}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-gray-500">Créée le</p>
                    <p>{formatLongDate(reservation.createdAt)}</p>
                  </div>
                  {reservation.validatedAt && (
                    <div className="text-sm">
                      <p className="text-gray-500">Validée le</p>
                      <p>{formatLongDate(reservation.validatedAt)}</p>
                    </div>
                  )}
                </div>
              </div>

              {reservation.preuveMessage && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-1">Message du client :</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{reservation.preuveMessage}</p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 flex flex-wrap gap-3">
              {reservation.statut === 'preuve_recue' && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => validerReservation(reservation.id)}
                    className="flex-1 sm:flex-none items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Valider
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => refuserReservation(reservation.id)}
                    className="flex-1 sm:flex-none items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition"
                  >
                    <AlertCircle className="h-4 w-4" />
                    Refuser
                  </motion.button>
                </>
              )}

              {reservation.preuveUrl && (
                <a
                  href={reservation.preuveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  <Download className="h-4 w-4" />
                  Voir la preuve
                </a>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => supprimerReservation(reservation.id)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-red-600 hover:text-red-800 text-sm font-medium"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>

      {hasMore && filteredReservations.length > 0 && (
        <div className="flex justify-center mt-8">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={loadMoreReservations}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium shadow-xs"
          >
            {loading ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" />
                Chargement...
              </>
            ) : (
              <>
                Afficher plus
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </motion.button>
        </div>
      )}
    </div>
  );
};

export default ReservationsEnLignePage;
