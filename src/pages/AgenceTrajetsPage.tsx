// ✅ src/pages/AgenceTrajetsPage.tsx
console.log("🚍 AgenceTrajetsPage affichée !");

import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { generateWeeklyTrips } from '../services/generateWeeklyTrips';
import { generateDailyTripsForWeeklyTrip } from '../services/generateDailyTripsForWeeklyTrip';
import { useAuth } from '@/contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import VilleInput from '../components/form/VilleInput';
import { ajouterVillesDepuisTrajet } from '../utils/updateVilles';

const joursDeLaSemaine = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  price: number;
  places?: number;
  horaires: { [key: string]: string[] };
  active: boolean;
  createdAt?: Timestamp;
}

const AgenceTrajetsPage: React.FC = () => {
  const { user } = useAuth();
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [price, setPrice] = useState('');
  const [places, setPlaces] = useState('');
  const [horaires, setHoraires] = useState<{ [key: string]: string[] }>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [trajets, setTrajets] = useState<WeeklyTrip[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modifierId, setModifierId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtreJour, setFiltreJour] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchTrajets();
  }, [user, page, search, filtreJour]);

  const fetchTrajets = async () => {
    if (!user?.agencyId) return;

    const q = query(collection(db, 'weeklyTrips'), where('agencyId', '==', user.agencyId));
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as WeeklyTrip[];
    const sorted = data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const filtered = sorted.filter(t =>
      (t.departure.toLowerCase().includes(search.toLowerCase()) ||
        t.arrival.toLowerCase().includes(search.toLowerCase())) &&
      (filtreJour === '' || (t.horaires?.[filtreJour]?.length > 0))
    );
    const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
    setTrajets(paginated);
  };

  const supprimerTrajet = async (id: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce trajet ?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'weeklyTrips', id));
      const snap = await getDocs(query(collection(db, 'dailyTrips'), where('weeklyTripId', '==', id)));
      for (const d of snap.docs) await deleteDoc(doc(db, 'dailyTrips', d.id));
      fetchTrajets();
      setMessage('🗑️ Trajet supprimé avec succès.');
    } catch (err) {
      console.error(err);
      setMessage("❌ Erreur lors de la suppression du trajet.");
    } finally {
      setLoading(false);
    }
  };

  const handleHoraireChange = (day: string, index: number, value: string) => {
    setHoraires(prev => {
      const copy = { ...prev };
      if (!copy[day]) copy[day] = [];
      copy[day][index] = value;
      return copy;
    });
  };

  const addHoraire = (day: string) => {
    setHoraires(prev => ({ ...prev, [day]: [...(prev[day] || []), ''] }));
  };

  const removeHoraire = (day: string, index: number) => {
    setHoraires(prev => {
      const copy = { ...prev };
      if (!copy[day]) return prev;
      copy[day].splice(index, 1);
      return copy;
    });
  };

  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

  const resetForm = () => {
    setDeparture('');
    setArrival('');
    setPrice('');
    setPlaces('');
    setHoraires({});
    setModifierId(null);
  };

  const exporterPDF = () => {
    const doc = new jsPDF();
    doc.text('Liste des trajets', 14, 14);
    autoTable(doc, {
      head: [['Départ', 'Arrivée', 'Prix', 'Places']],
      body: trajets.map(t => [t.departure, t.arrival, `${t.price} FCFA`, t.places || '']),
    });
    doc.save('trajets_agence.pdf');
  };

  const handleSubmit = async () => {
    if (!user?.agencyId || !user?.companyId) return setMessage('Agence ou compagnie non reconnue.');
    setLoading(true);
    setMessage('');

    const horairesFiltres: { [key: string]: string[] } = {};
    for (const jour in horaires) {
      const heuresValides = horaires[jour].filter(h => h && h.trim() !== '');
      if (heuresValides.length > 0) horairesFiltres[jour] = heuresValides;
    }

    const dep = capitalize(departure.trim());
    const arr = capitalize(arrival.trim());

    if (!dep || !arr || !price.trim() || !places.trim() || Object.keys(horairesFiltres).length === 0) {
      setLoading(false);
      return setMessage('Merci de remplir tous les champs y compris le nombre de places.');
    }

    try {
      if (modifierId) {
        const tripRef = doc(db, 'weeklyTrips', modifierId);
        await updateDoc(tripRef, {
          departure: dep,
          arrival: arr,
          price: parseInt(price),
          places: parseInt(places),
          horaires: horairesFiltres,
        });
        await generateDailyTripsForWeeklyTrip(modifierId);
        setMessage('✅ Trajet modifié avec succès.');
      } else {
        await generateWeeklyTrips(
          user.companyId,
          dep,
          arr,
          parseInt(price),
          horairesFiltres,
          parseInt(places),
          user.agencyId
        );
        await ajouterVillesDepuisTrajet(dep, arr);
        const snapshot = await getDocs(query(collection(db, 'weeklyTrips'), where('agencyId', '==', user.agencyId)));
        const latestTrip = snapshot.docs
          .filter(doc => doc.data().departure === dep && doc.data().arrival === arr)
          .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))[0];
        if (latestTrip) await generateDailyTripsForWeeklyTrip(latestTrip.id);
        setMessage('✅ Trajet ajouté avec succès !');
      }
      resetForm();
      fetchTrajets();
    } catch (error) {
      console.error(error);
      setMessage("❌ Erreur lors de l'enregistrement du trajet.");
    } finally {
      setLoading(false);
    }
  };

  const toggleActif = async (id: string, current: boolean) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'weeklyTrips', id), { active: !current });
      const snap = await getDocs(query(collection(db, 'dailyTrips'), where('weeklyTripId', '==', id)));
      for (const d of snap.docs) {
        await updateDoc(doc(db, 'dailyTrips', d.id), { active: !current });
      }
      fetchTrajets();
      setMessage(current ? '🚫 Trajet désactivé.' : '✅ Trajet activé.');
    } catch (error) {
      console.error(error);
      setMessage("❌ Erreur lors du changement d'état.");
    } finally {
      setLoading(false);
    }
  };

  const modifierTrajet = (trip: WeeklyTrip) => {
    setDeparture(trip.departure);
    setArrival(trip.arrival);
    setPrice(trip.price.toString());
    setPlaces((trip.places || '').toString());
    setHoraires(trip.horaires);
    setModifierId(trip.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="p-4 grid md:grid-cols-2 gap-6">
      <div>
        <h2 className="text-xl font-bold mb-4">{modifierId ? 'Modifier le trajet' : 'Ajouter un trajet'}</h2>
        <div className="mb-4 flex flex-col gap-2">
          <VilleInput label="Ville de départ" value={departure} onChange={setDeparture} />
          <VilleInput label="Ville d'arrivée" value={arrival} onChange={setArrival} />
          <input type="number" placeholder="Prix" value={price} onChange={e => setPrice(e.target.value)} className="border p-2" />
          <input type="number" placeholder="Nombre de places" value={places} onChange={e => setPlaces(e.target.value)} className="border p-2" />
        </div>

        {joursDeLaSemaine.map(jour => (
          <div key={jour} className="mb-2">
            <p className="font-semibold">{jour} :</p>
            {(horaires[jour] || []).map((h, i) => (
              <div key={i} className="flex gap-2 my-1">
                <input type="time" value={h} onChange={e => handleHoraireChange(jour, i, e.target.value)} className="border p-1" />
                <button type="button" onClick={() => removeHoraire(jour, i)} className="text-red-600">Supprimer</button>
              </div>
            ))}
            <button type="button" onClick={() => addHoraire(jour)} className="bg-blue-500 text-white px-2 py-1 rounded mt-1">+ Ajouter une heure</button>
          </div>
        ))}

        <button onClick={handleSubmit} disabled={loading} className="mt-4 bg-green-600 text-white px-4 py-2 rounded">
          {loading ? 'Traitement en cours...' : modifierId ? 'Mettre à jour' : 'Ajouter le trajet'}
        </button>

        {message && <p className="mt-2 text-sm text-blue-700 font-semibold">{message}</p>}
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Liste des trajets</h2>
          <button onClick={exporterPDF} className="bg-purple-600 text-white px-3 py-1 rounded">📄 Exporter en PDF</button>
        </div>

        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border mb-4 p-2 w-full"
        />

        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setFiltreJour('')} className={`px-3 py-1 rounded ${filtreJour === '' ? 'bg-blue-700 text-white' : 'bg-gray-200'}`}>Tous</button>
          {joursDeLaSemaine.map(jour => (
            <button key={jour} onClick={() => setFiltreJour(jour)} className={`px-3 py-1 rounded ${filtreJour === jour ? 'bg-blue-700 text-white' : 'bg-gray-200'}`}>{jour}</button>
          ))}
        </div>

        {trajets.map(t => (
          <div key={t.id} className="border rounded p-3 mb-2 shadow">
            <div className={`cursor-pointer font-semibold ${t.active ? 'text-green-700' : 'text-red-500'}`} onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
              {t.departure} → {t.arrival} ({t.active ? 'Actif' : 'Inactif'})
            </div>

            {expandedId === t.id && (
              <div className="mt-2 text-sm">
                <p>Prix : {t.price} FCFA</p>
                <p>Places : {t.places || 'NC'}</p>
                {joursDeLaSemaine.map(jour => {
                  const heures = t.horaires?.[jour];
                  if (!heures || heures.length === 0) return null;
                  const heuresTriees = [...heures].sort();
                  return <p key={jour}><strong>{jour} :</strong> {heuresTriees.join(', ')}</p>;
                })}
                <div className="mt-2 flex gap-2 flex-wrap">
                  <button onClick={() => supprimerTrajet(t.id)} disabled={loading} className="bg-red-600 text-white px-2 py-1 rounded">Supprimer</button>
                  <button onClick={() => modifierTrajet(t)} disabled={loading} className="bg-yellow-500 text-white px-2 py-1 rounded">Modifier</button>
                  <button onClick={() => toggleActif(t.id, t.active)} disabled={loading} className={`px-2 py-1 rounded text-white ${t.active ? 'bg-gray-600' : 'bg-green-600'}`}>
                    {t.active ? 'Désactiver' : 'Activer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {!loading && trajets.length === 0 && (
          <div className="text-gray-600 text-sm text-center mt-4">Aucun trajet enregistré pour cette agence.</div>
        )}

        <div className="flex justify-between mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="bg-gray-300 px-3 py-1 rounded">Précédent</button>
          <button onClick={() => setPage(p => p + 1)} className="bg-gray-300 px-3 py-1 rounded">Suivant</button>
        </div>
      </div>
    </div>
  );
};

export default AgenceTrajetsPage;
