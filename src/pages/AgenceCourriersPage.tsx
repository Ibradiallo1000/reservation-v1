// ✅ AgenceCourriersPage.tsx – Liste imprimable des courriers pour un trajet précis
import React, { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';

interface Courrier {
  id: string;
  expediteur: string;
  telephone: string;
  destinataire: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  canal: string;
  statut: string;
  trajetId: string;
}

interface Trajet {
  id: string;
  departure: string;
  arrival: string;
  date: string;
  time: string;
  companyId: string;
}

const AgenceCourriersPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const receiptRef = useRef<HTMLDivElement>(null);

  const [depart, setDepart] = useState('');
  const [arrivee, setArrivee] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [datesDisponibles, setDatesDisponibles] = useState<string[]>([]);
  const [horaires, setHoraires] = useState<string[]>([]);
  const [selectedHoraire, setSelectedHoraire] = useState('');
  const [courriers, setCourriers] = useState<Courrier[]>([]);
  const [trajetDetails, setTrajetDetails] = useState<Trajet | null>(null);

  const normalize = (str: string) => str.trim().toLowerCase();

  const generateNext8Days = (): string[] => {
    const today = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  };

  const handleSearch = async () => {
    if (!depart || !arrivee || !user?.companyId) return;
    const snapshot = await getDocs(collection(db, 'dailyTrips'));
    const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trajet));
    const trajetsFiltres = results.filter(t =>
      normalize(t.departure) === normalize(depart) &&
      normalize(t.arrival) === normalize(arrivee) &&
      t.companyId === user.companyId
    );
    const dates = Array.from(new Set(trajetsFiltres.map(t => t.date))).filter(d => generateNext8Days().includes(d));
    setDatesDisponibles(dates);
    if (dates.length > 0) setSelectedDate(dates[0]);
    else {
      setSelectedDate('');
      setHoraires([]);
      setSelectedHoraire('');
      setCourriers([]);
    }
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
    const heures = trajetsFiltres.filter(t => t.time).map(t => t.time);
    setHoraires(heures);
    if (heures.length > 0) setSelectedHoraire(heures[0]);
    else {
      setSelectedHoraire('');
      setCourriers([]);
    }
  };

  const fetchCourriers = async () => {
    if (!selectedHoraire || !user?.companyId) return;
    const snapshot = await getDocs(collection(db, 'dailyTrips'));
    const trajetsFiltres = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trajet))
      .filter(t =>
        normalize(t.departure) === normalize(depart) &&
        normalize(t.arrival) === normalize(arrivee) &&
        t.date === selectedDate &&
        t.time === selectedHoraire &&
        t.companyId === user.companyId
      );
    if (trajetsFiltres.length === 0) return;
    const tripId = trajetsFiltres[0].id;
    setTrajetDetails(trajetsFiltres[0]);

    const resQuery = query(
      collection(db, 'courriers'),
      where('trajetId', '==', tripId),
      where('statut', '==', 'payé')
    );
    const resSnap = await getDocs(resQuery);
    const list = resSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Courrier[];
    setCourriers(list);
  };

  const exportToPDF = () => {
    if (!receiptRef.current) return;
    html2pdf().from(receiptRef.current).save(`Courriers_${selectedDate}_${selectedHoraire}.pdf`);
  };

  const exportToExcel = () => {
    const data = courriers.map((c, i) => ({
      '#': i + 1,
      Expéditeur: c.expediteur,
      Téléphone: c.telephone,
      Destinataire: c.destinataire,
      Lieux: `${c.depart} → ${c.arrivee}`,
      Référence: c.id,
      Type: c.canal === 'guichet' ? 'Guichet' : 'En ligne'
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Courriers');
    XLSX.writeFile(workbook, `Courriers_${selectedDate}_${selectedHoraire}.xlsx`);
  };

  useEffect(() => {
    if (selectedDate) loadHoraires();
  }, [selectedDate]);

  useEffect(() => {
    if (selectedHoraire) fetchCourriers();
  }, [selectedHoraire]);

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Liste de Courriers</h1>

      <div className="flex gap-3 mb-4">
        <input type="text" value={depart} onChange={e => setDepart(e.target.value)} placeholder="Départ" className="border p-2 rounded" />
        <input type="text" value={arrivee} onChange={e => setArrivee(e.target.value)} placeholder="Arrivée" className="border p-2 rounded" />
        <button onClick={handleSearch} className="bg-yellow-500 text-white px-4 py-2 rounded">Rechercher</button>
      </div>

      {datesDisponibles.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {datesDisponibles.map(date => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`px-3 py-1 rounded-full text-sm border ${selectedDate === date ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-800'}`}
            >
              {date}
            </button>
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

      <div className="mb-4 flex justify-between gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="text-sm text-blue-500 underline">← Retour</button>
        <div className="flex gap-2">
          <button onClick={exportToPDF} className="bg-green-600 text-white px-4 py-2 rounded">📄 Télécharger PDF</button>
          <button onClick={exportToExcel} className="bg-purple-600 text-white px-4 py-2 rounded">📊 Exporter Excel</button>
        </div>
      </div>

      <div className="border rounded-xl p-4" ref={receiptRef}>
        <h2 className="text-center font-bold text-lg mb-2">LISTE DE COLIS / COURRIERS</h2>
        <div className="text-center text-sm text-gray-600 mb-4">
          {selectedDate && selectedHoraire && (
            <span>{selectedDate} • {selectedHoraire} • {depart} → {arrivee}</span>
          )}<br />
          <span>{courriers.length} colis</span>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">#</th>
              <th className="border p-2">Expéditeur</th>
              <th className="border p-2">Téléphone</th>
              <th className="border p-2">Destinataire</th>
              <th className="border p-2">Référence</th>
              <th className="border p-2">Type</th>
            </tr>
          </thead>
          <tbody>
            {courriers.length === 0 ? (
              <tr><td colSpan={6} className="text-center p-4 text-gray-500">Aucun courrier pour ce trajet.</td></tr>
            ) : (
              courriers.map((c, i) => (
                <tr key={c.id}>
                  <td className="border p-2 text-center">{i + 1}</td>
                  <td className="border p-2">{c.expediteur}</td>
                  <td className="border p-2">{c.telephone}</td>
                  <td className="border p-2">{c.destinataire}</td>
                  <td className="border p-2">{c.id.slice(0, 6)}</td>
                  <td className="border p-2 text-center">{c.canal === 'guichet' ? '🧾 Guichet' : '🌐 En ligne'}</td>
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

export default AgenceCourriersPage;
