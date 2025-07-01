import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

const ITEMS_PER_PAGE = 6;

const ReservationsEnLignePage: React.FC = () => {
  const { user } = useAuth();

  const [reservations, setReservations] = useState<any[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [firstDoc, setFirstDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  // Charger les agences
  useEffect(() => {
    if (!user?.companyId) return;
    const loadAgences = async () => {
      const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
      const snap = await getDocs(q);
      setAgences(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    loadAgences();
  }, [user?.companyId]);

  // Charger les réservations page 1
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
    if (startDoc) {
      q = query(q, startAfter(startDoc));
    }
    const snap = await getDocs(q);
    setReservations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setFirstDoc(snap.docs[0] || null);
    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setLoading(false);
  };

  useEffect(() => {
    loadReservations();
  }, [user?.companyId]);

  // Validation statut
  const valider = async (id: string) => {
    await updateDoc(doc(db, 'reservations', id), { statut: 'payé' });
    alert('✅ Réservation validée !');
    loadReservations(firstDoc);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">📌 Réservations en ligne</h1>
      <p className="text-gray-500 mb-4">
        Validation centralisée en temps réel. Résultats triés par date récente.
      </p>

      {loading && <p className="text-sm text-gray-400">Chargement...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reservations.map((r) => {
          const agence = agences.find((a) => a.id === r.agencyId);
          return (
            <div
              key={r.id}
              className="border rounded shadow-sm p-4 bg-white flex flex-col justify-between"
            >
              <div>
                <h2 className="font-bold text-lg mb-1">
                  {r.nomClient} — {r.telephone}
                </h2>
                <p className="text-sm mb-1">
                  Montant : <strong>{r.montant} FCFA</strong>
                </p>
                <p className="text-sm mb-1">
                  Statut :
                  <span
                    className={`ml-1 px-2 py-1 rounded-full text-xs ${
                      r.statut === 'payé'
                        ? 'bg-green-100 text-green-800'
                        : r.statut === 'preuve_reçue'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {r.statut}
                  </span>
                </p>
                <p className="text-sm mb-2">
                  Agence :{' '}
                  <span className="text-gray-700">
                    {agence?.nom || 'Non trouvée'}
                  </span>
                </p>
                {r.preuveUrl && (
                  <a
                    href={r.preuveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline text-sm mb-2 block"
                  >
                    📎 Voir la preuve
                  </a>
                )}
              </div>
              {r.statut === 'preuve_reçue' && (
                <button
                  onClick={() => valider(r.id)}
                  className="mt-3 bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
                >
                  ✅ Valider & marquer comme PAYÉ
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex justify-center items-center gap-4 mt-6">
        <button
          onClick={() => loadReservations()}
          disabled={loading}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
        >
          🔄 Recharger
        </button>
        {lastDoc && (
          <button
            onClick={() => loadReservations(lastDoc)}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Suivant →
          </button>
        )}
      </div>
    </div>
  );
};

export default ReservationsEnLignePage;
