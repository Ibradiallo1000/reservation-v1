import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,     // ✅ Bien ajouté
  updateDoc,   // ✅ Bien ajouté
  doc,         // ✅ Bien ajouté
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Clock, Download, RotateCw, ChevronRight, Frown, Search } from 'lucide-react';
import { motion } from 'framer-motion';

// ✅ Définition forte
type Statut = 'payé' | 'preuve_reçue' | 'en_attente' | 'annulé' | 'paiement_en_cours';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  referenceCode?: string;
  montant?: number;
  agenceId?: string;
  statut: Statut;
  canal: string;
  createdAt?: string;
  preuveUrl?: string;
}

const ITEMS_PER_PAGE = 8;

const statusStyles: Record<Statut, string> = {
  payé: 'bg-emerald-100 text-emerald-800',
  preuve_reçue: 'bg-amber-100 text-amber-800',
  en_attente: 'bg-blue-100 text-blue-800',
  annulé: 'bg-red-100 text-red-800',
  paiement_en_cours: 'bg-purple-100 text-purple-800'
};

const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<Statut | ''>('');

  useEffect(() => {
    if (!user?.companyId) return;
    const loadAgences = async () => {
      const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
      const snap = await getDocs(q);
      setAgences(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    loadAgences();
  }, [user?.companyId]);

  const loadReservations = async (startDoc?: QueryDocumentSnapshot | null) => {
    if (!user?.companyId) return;
    setLoading(true);

    let q = query(
      collection(db, 'reservations'),
      where('companyId', '==', user.companyId),
      where('canal', '==', 'en_ligne'),
      orderBy('createdAt', 'desc'),
      limit(ITEMS_PER_PAGE)
    );

    if (startDoc) q = query(q, startAfter(startDoc));
    if (filterStatus) q = query(q, where('statut', '==', filterStatus));

    const snap = await getDocs(q);
    setReservations(prev =>
      startDoc ? [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation))] : snap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation))
    );
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setLoading(false);
  };

  useEffect(() => {
    loadReservations();
  }, [user?.companyId, filterStatus]);

  const valider = async (id: string) => {
    if (window.confirm('Confirmer la validation de cette réservation ?')) {
      await updateDoc(doc(db, 'reservations', id), {
        statut: 'payé',
        validatedAt: new Date(),
        validatedBy: user?.uid
      });
      loadReservations();
    }
  };

  const filteredReservations = reservations.filter(res =>
    res.nomClient?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.telephone?.includes(searchTerm) ||
    res.referenceCode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString?: string) => {
    if (!dateString) return '--';
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('fr-FR', options);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>Réservations en ligne</span>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              {reservations.length} réservations
            </span>
          </h1>
          <p className="text-gray-500 mt-1">
            Validation centralisée en temps réel • Tri par date récente
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Rechercher client, téléphone..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as Statut | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Tous les statuts</option>
            <option value="preuve_reçue">Preuve reçue</option>
            <option value="payé">Payé</option>
            <option value="en_attente">En attente</option>
            <option value="annulé">Annulé</option>
            <option value="paiement_en_cours">Paiement en cours</option>
          </select>
        </div>
      </div>

      {loading && (
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
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterStatus('');
              loadReservations();
            }}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Réinitialiser les filtres
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredReservations.map((r) => {
          const agence = agences.find((a) => a.id === r.agenceId);

          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-xs hover:shadow-sm transition-shadow"
            >
              <div className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 truncate">{r.nomClient}</h3>
                    <p className="text-sm text-gray-500">{r.telephone}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusStyles[r.statut] || 'bg-gray-100'}`}>
                    {r.statut}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Montant:</span>
                    <span className="font-medium">{r.montant?.toLocaleString()} FCFA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Référence:</span>
                    <span className="font-mono text-blue-600">{r.referenceCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Agence:</span>
                    <span className="text-right">{agence?.nom || '--'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Date:</span>
                    <span>{formatDate(r.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                {r.statut === 'preuve_reçue' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => valider(r.id)}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Valider le paiement
                  </motion.button>
                )}

                {r.preuveUrl && (
                  <a
                    href={r.preuveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium mt-2"
                  >
                    <Download className="h-4 w-4" />
                    Télécharger la preuve
                  </a>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {lastDoc && (
        <div className="flex justify-center mt-8">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => loadReservations(lastDoc)}
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
