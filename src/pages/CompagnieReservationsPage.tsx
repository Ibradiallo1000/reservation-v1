// ✅ src/pages/CompagnieReservationsPage.tsx (corrigé complet)

import React, { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  canal: string;
  statut: string;
  seatsGo?: number;
  montant?: number;
}

interface Agence {
  id: string;
  nom: string;
}

const CompagnieReservationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [agences, setAgences] = useState<Agence[]>([]);
  const [agencyId, setAgencyId] = useState('');
  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [datesDisponibles, setDatesDisponibles] = useState<string[]>([]);
  const [horaires, setHoraires] = useState<string[]>([]);
  const [selectedHoraire, setSelectedHoraire] = useState('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [companyName, setCompanyName] = useState('');

  const normalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  const generateNext8Days = (): string[] => {
    const today = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  };

  const loadAgences = async () => {
    if (!user?.companyId) return;
    const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => ({ id: doc.id, nom: doc.data().ville }));
    setAgences(data);
  };

  const handleSearch = async () => {
    if (!agencyId || !depart || !arrivee || !user?.companyId) return;
    const q = query(
      collection(db, 'dailyTrips'),
      where('agencyId', '==', agencyId),
      where('departure', '==', normalize(depart)),
      where('arrival', '==', normalize(arrivee))
    );
    const snap = await getDocs(q);
    const foundDates = new Set<string>();
    snap.forEach(doc => {
      const data = doc.data();
      if (data.date) foundDates.add(data.date);
    });
    const filteredDates = Array.from(foundDates).filter(d => generateNext8Days().includes(d)).sort();
    setDatesDisponibles(filteredDates);
    setSelectedDate(filteredDates[0] || '');
    setHoraires([]);
    setSelectedHoraire('');
    setReservations([]);
  };

  const loadHoraires = async () => {
    if (!selectedDate || !agencyId || !depart || !arrivee) return;
    const q = query(
      collection(db, 'dailyTrips'),
      where('agencyId', '==', agencyId),
      where('departure', '==', normalize(depart)),
      where('arrival', '==', normalize(arrivee)),
      where('date', '==', selectedDate)
    );
    const snap = await getDocs(q);
    const times: string[] = [];
    snap.forEach(doc => times.push(doc.data().time));
    setHoraires(times);
    setSelectedHoraire(times[0] || '');
  };

  const fetchReservations = async () => {
    if (!selectedHoraire || !selectedDate) return;
    const qTrip = query(
      collection(db, 'dailyTrips'),
      where('agencyId', '==', agencyId),
      where('departure', '==', normalize(depart)),
      where('arrival', '==', normalize(arrivee)),
      where('date', '==', selectedDate),
      where('time', '==', selectedHoraire)
    );
    const tripSnap = await getDocs(qTrip);
    if (tripSnap.empty) return;
    const tripId = tripSnap.docs[0].id;

    const qRes = query(
      collection(db, 'reservations'),
      where('trajetId', '==', tripId),
      where('statut', '==', 'payé')
    );
    const resSnap = await getDocs(qRes);
    const data = resSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[];
    setReservations(data);
  };

  useEffect(() => {
    if (selectedDate) loadHoraires();
  }, [selectedDate]);

  useEffect(() => {
    if (selectedHoraire) fetchReservations();
  }, [selectedHoraire]);

  useEffect(() => {
    loadAgences();
    if (user?.companyId) {
      getDoc(doc(db, 'companies', user.companyId)).then(snap => {
        if (snap.exists()) setCompanyName(snap.data().nom);
      });
    }
  }, []);

  const totalPlaces = reservations.reduce((total, r) => total + (r.seatsGo || 1), 0);
  const totalEncaisse = reservations.reduce((total, r) => total + (r.montant || 0), 0);

  if (!user) return <div className="p-6">Chargement des données...</div>;

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Toutes les réservations de la compagnie</h1>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <select value={agencyId} onChange={e => setAgencyId(e.target.value)} className="border p-2 rounded">
          <option value="">Sélectionner une agence</option>
          {agences.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
        </select>
        <input value={depart} onChange={e => setDepart(e.target.value)} placeholder="Départ" className="border p-2 rounded" />
        <input value={arrivee} onChange={e => setArrivee(e.target.value)} placeholder="Arrivée" className="border p-2 rounded" />
        <button onClick={handleSearch} className="bg-yellow-500 text-white rounded px-4">Rechercher</button>
      </div>

      {datesDisponibles.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {datesDisponibles.map(date => (
            <button key={date} onClick={() => setSelectedDate(date)}
              className={`px-3 py-1 rounded-full text-sm border ${selectedDate === date ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-800'}`}>{date}</button>
          ))}
        </div>
      )}

      {horaires.length > 0 && (
        <div className="mb-4">
          <label className="text-sm">Choisir une heure :</label>
          <select value={selectedHoraire} onChange={e => setSelectedHoraire(e.target.value)} className="border p-2 rounded">
            {horaires.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      )}

      <div className="mb-4 flex justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-blue-500 underline">← Retour</button>
        <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded">Imprimer</button>
      </div>

      <div className="border rounded-xl p-4">
        <h2 className="text-center font-bold text-lg mb-2">{(companyName || 'COMPAGNIE').toUpperCase()} - LISTE GLOBALE DES RÉSERVATIONS</h2>
        <div className="text-center text-sm text-gray-600 mb-4">
          {selectedDate && selectedHoraire && (
            <span>{selectedDate} • {selectedHoraire} • {depart} → {arrivee}</span>
          )}<br />
          <span>{reservations.length} réservations — {totalPlaces} passagers — {totalEncaisse} FCFA</span>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">#</th>
              <th className="border p-2">Nom</th>
              <th className="border p-2">Téléphone</th>
              <th className="border p-2">Trajet</th>
              <th className="border p-2">Date</th>
              <th className="border p-2">Heure</th>
              <th className="border p-2">Canal</th>
            </tr>
          </thead>
          <tbody>
            {reservations.length === 0 ? (
              <tr><td colSpan={7} className="text-center p-4 text-gray-500">Aucune réservation trouvée.</td></tr>
            ) : (
              reservations.map((r, i) => (
                <tr key={r.id}>
                  <td className="border p-2 text-center">{i + 1}</td>
                  <td className="border p-2">{r.nomClient}</td>
                  <td className="border p-2">{r.telephone}</td>
                  <td className="border p-2">{r.depart} → {r.arrivee}</td>
                  <td className="border p-2">{r.date}</td>
                  <td className="border p-2">{r.heure}</td>
                  <td className="border p-2 text-center">{r.canal === 'guichet' ? '🧾 Guichet' : '🌐 En ligne'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-6 text-right text-sm italic">Signature et cachet de la compagnie</div>
      </div>
    </div>
  );
};

export default CompagnieReservationsPage;
