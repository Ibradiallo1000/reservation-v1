import React, { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';
import ModifierReservationForm from './ModifierReservationForm';

const style = document.createElement('style');
style.innerHTML = `
@media print {
  body * { visibility: hidden !important; }
  #receipt, #receipt * { visibility: visible !important; }
  #receipt {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 1cm;
    font-size: 12px;
  }
}`;
document.head.appendChild(style);

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
  seatsReturn?: number;
  montant?: number;
  agencyId?: string;
}

interface Trajet {
  id: string;
  departure: string;
  arrival: string;
  date: string;
  time: string;
  companyId: string;
}

const AgenceReservationPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const receiptRef = useRef<HTMLDivElement>(null);

  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [datesDisponibles, setDatesDisponibles] = useState<string[]>([]);
  const [horaires, setHoraires] = useState<string[]>([]);
  const [selectedHoraire, setSelectedHoraire] = useState('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [reservationAModifier, setReservationAModifier] = useState<Reservation | null>(null);

  const normalize = (str: string) =>
    str.trim().charAt(0).toUpperCase() + str.trim().slice(1).toLowerCase();

  const handleSearch = async () => {
    if (!depart || !arrivee || !user?.companyId) return;
    const snapshot = await getDocs(collection(db, 'dailyTrips'));
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trajet));
    const trajetsFiltres = results.filter((t: Trajet) =>
      normalize(t.departure) === normalize(depart) &&
      normalize(t.arrival) === normalize(arrivee) &&
      t.companyId === user.companyId
    );
    const dates = Array.from(new Set(trajetsFiltres.map((t: Trajet) => t.date)));
    setDatesDisponibles(dates);
    setSelectedDate(dates[0] || '');
    setHoraires([]);
    setSelectedHoraire('');
    setReservations([]);
  };

  const loadHoraires = async () => {
    if (!selectedDate || !user?.companyId) return;
    const snapshot = await getDocs(collection(db, 'dailyTrips'));
    const trajetsFiltres = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trajet))
      .filter(t =>
        normalize(t.departure) === normalize(depart) &&
        normalize(t.arrival) === normalize(arrivee) &&
        t.date === selectedDate &&
        t.companyId === user.companyId
      );
    const heures = trajetsFiltres.map(t => t.time);
    setHoraires(heures);
    setSelectedHoraire(heures[0] || '');
  };

  const fetchReservations = async () => {
    if (!selectedHoraire || !user?.companyId) return;
    const snapshot = await getDocs(collection(db, 'dailyTrips'));
    const trajetsFiltres = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Trajet))
      .filter((t: Trajet) =>
        normalize(t.departure) === normalize(depart) &&
        normalize(t.arrival) === normalize(arrivee) &&
        t.date === selectedDate &&
        t.time === selectedHoraire &&
        t.companyId === user.companyId
      );
    if (trajetsFiltres.length === 0) return;
    const tripId = trajetsFiltres[0].id;

    const resQuery = query(
      collection(db, 'reservations'),
      where('trajetId', '==', tripId),
      where('statut', '==', 'payé'),
      where('agencyId', '==', user.agencyId)
    );
    const resSnap = await getDocs(resQuery);
    const list = resSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[];
    setReservations(list);
  };

  const filteredReservations = reservations.filter(res =>
    res.nomClient.toLowerCase().includes(searchTerm.toLowerCase()) ||
    res.telephone.includes(searchTerm)
  );

  useEffect(() => {
    if (selectedDate) loadHoraires();
  }, [selectedDate]);

  useEffect(() => {
    if (selectedHoraire) fetchReservations();
  }, [selectedHoraire]);

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Liste de Réservations</h1>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input value={depart} onChange={e => setDepart(e.target.value)} placeholder="Départ" className="border p-2 rounded" />
        <input value={arrivee} onChange={e => setArrivee(e.target.value)} placeholder="Arrivée" className="border p-2 rounded" />
        <button onClick={handleSearch} className="bg-yellow-500 text-white px-4 py-2 rounded">Rechercher</button>
        <input type="text" placeholder="Recherche nom ou téléphone" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border p-2 rounded flex-1" />
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
          <label className="block text-sm mb-1">Choisir une heure :</label>
          <select value={selectedHoraire} onChange={e => setSelectedHoraire(e.target.value)} className="border p-2 rounded">
            {horaires.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      )}

      <div className="mb-4 flex justify-between items-center flex-wrap gap-3">
        <button onClick={() => navigate(-1)} className="text-sm text-blue-500 underline">← Retour</button>
        <div className="flex gap-2">
          <button onClick={() => html2pdf().from(receiptRef.current).save()} className="bg-green-600 text-white px-4 py-2 rounded">📄 PDF</button>
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded">🖨️ Imprimer</button>
          <button onClick={() => {
            const data = filteredReservations.map((res, i) => ({
              '#': i + 1,
              Nom: res.nomClient,
              Téléphone: res.telephone,
              Lieux: `${res.depart} → ${res.arrivee}`,
              Référence: res.id,
              Type: res.canal
            }));
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Réservations');
            XLSX.writeFile(workbook, 'Reservations.xlsx');
          }} className="bg-purple-600 text-white px-4 py-2 rounded">📊 Excel</button>
        </div>
      </div>

      <div id="receipt" className="border rounded-xl p-4 shadow" ref={receiptRef}>
        <h2 className="text-center font-bold text-lg mb-2">LISTE DE RÉSERVATION</h2>
        {selectedDate && selectedHoraire && (
          <div className="text-center text-sm text-gray-600 mb-4">
            <div>{selectedDate} • {selectedHoraire} • {depart} → {arrivee}</div>
          </div>
        )}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">#</th>
              <th className="border p-2">Nom</th>
              <th className="border p-2">Téléphone</th>
              <th className="border p-2">Lieux</th>
              <th className="border p-2">Référence</th>
              <th className="border p-2">Type</th>
            </tr>
          </thead>
          <tbody>
            {filteredReservations.length === 0 ? (
              <tr><td colSpan={6} className="text-center p-4 text-gray-500">Aucune réservation pour ce trajet.</td></tr>
            ) : (
              filteredReservations.map((res, i) => (
                <tr key={res.id} className="hover:bg-yellow-50">
                  <td className="border p-2 text-center">{i + 1}</td>
                  <td className="border p-2">{res.nomClient}</td>
                  <td className="border p-2">{res.telephone}</td>
                  <td className="border p-2">{res.depart} → {res.arrivee}</td>
                  <td className="border p-2">{res.id.slice(0, 6)}</td>
                  <td className="border p-2 text-center">
                    {res.canal === 'guichet' ? '🧾 Guichet' : '🌐 En ligne'}
                    <br />
                    <button
                      onClick={() => setReservationAModifier(res)}
                      className="text-indigo-600 hover:underline text-xs mt-1"
                    >
                      ✏️ Modifier
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-6 text-right text-sm italic">Signature et cachet de la compagnie</div>
      </div>

      {reservationAModifier && (
        <ModifierReservationForm
          reservation={reservationAModifier}
          onClose={() => setReservationAModifier(null)}
          onUpdated={fetchReservations}
        />
      )}
    </div>
  );
};

export default AgenceReservationPage;
