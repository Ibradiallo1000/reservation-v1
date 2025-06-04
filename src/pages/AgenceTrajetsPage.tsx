import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { generateWeeklyTrips } from '../services/generateWeeklyTrips';
import { generateDailyTripsForWeeklyTrip } from '../services/generateDailyTripsForWeeklyTrip';
import { useAuth } from '@/contexts/AuthContext';
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
  console.log('👤 Utilisateur connecté :', user);

  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [price, setPrice] = useState('');
  const [places, setPlaces] = useState('');
  const [horaires, setHoraires] = useState<{ [key: string]: string[] }>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [trajets, setTrajets] = useState<WeeklyTrip[]>([]);
  const [modifierId, setModifierId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.agencyId) {
      fetchTrajets();
    }
  }, [user]);

  const fetchTrajets = async () => {
    try {
      const q = query(collection(db, 'weeklyTrips'), where('agencyId', '==', user?.agencyId));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as WeeklyTrip[];
      const sorted = data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTrajets(sorted);
      console.log('✅ Trajets actuels à afficher :', sorted);
    } catch (error) {
      console.error('❌ Erreur fetchTrajets :', error);
    }
  };

  const handleSubmit = async () => {
    if (!user?.agencyId || !user?.companyId) {
      setMessage('Agence ou compagnie inconnue.');
      return;
    }

    setLoading(true);
    setMessage('');

    const horairesFiltres: { [key: string]: string[] } = {};
    for (const jour in horaires) {
      const heuresValides = horaires[jour].filter(h => h && h.trim() !== '');
      if (heuresValides.length > 0) horairesFiltres[jour] = heuresValides;
    }

    const dep = departure.trim();
    const arr = arrival.trim();
    if (!dep || !arr || !price.trim() || !places.trim() || Object.keys(horairesFiltres).length === 0) {
      setLoading(false);
      return setMessage('Veuillez remplir tous les champs');
    }

    try {
      if (modifierId) {
        await updateDoc(doc(db, 'weeklyTrips', modifierId), {
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
        setMessage('✅ Trajet ajouté avec succès.');
      }

      setDeparture('');
      setArrival('');
      setPrice('');
      setPlaces('');
      setHoraires({});
      setModifierId(null);
      fetchTrajets();
    } catch (error) {
      console.error('❌ Erreur ajout/modif trajet :', error);
      setMessage("Erreur lors de l'enregistrement du trajet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">{modifierId ? 'Modifier un trajet' : 'Ajouter un trajet'}</h2>
      {message && <div className="text-blue-600 mb-2">{message}</div>}

      <VilleInput label="Départ" value={departure} onChange={setDeparture} />
      <VilleInput label="Arrivée" value={arrival} onChange={setArrival} />
      <input type="number" placeholder="Prix" value={price} onChange={e => setPrice(e.target.value)} className="border p-2 w-full my-2" />
      <input type="number" placeholder="Places" value={places} onChange={e => setPlaces(e.target.value)} className="border p-2 w-full mb-4" />

      {joursDeLaSemaine.map(jour => (
        <div key={jour} className="mb-2">
          <p className="font-semibold">{jour}</p>
          {(horaires[jour] || []).map((h, i) => (
            <div key={i} className="flex gap-2 my-1">
              <input
                type="time"
                value={h}
                onChange={e => {
                  const newHoraires = { ...horaires };
                  newHoraires[jour][i] = e.target.value;
                  setHoraires(newHoraires);
                }}
                className="border p-1"
              />
              <button
                onClick={() => {
                  const newHoraires = { ...horaires };
                  newHoraires[jour].splice(i, 1);
                  setHoraires(newHoraires);
                }}
                className="text-red-500"
              >
                Supprimer
              </button>
            </div>
          ))}
          <button
            onClick={() => setHoraires(prev => ({ ...prev, [jour]: [...(prev[jour] || []), ''] }))}
            className="bg-blue-500 text-white px-2 py-1 rounded"
          >
            + Ajouter une heure
          </button>
        </div>
      ))}

      <button onClick={handleSubmit} disabled={loading} className="bg-green-600 text-white px-4 py-2 mt-4 rounded">
        {loading ? 'Traitement...' : modifierId ? 'Modifier' : 'Ajouter'}
      </button>

      {Array.isArray(trajets) && trajets.length === 0 ? (
        <p className="text-gray-500 mt-4">Aucun trajet pour le moment.</p>
      ) : (
        <table className="w-full table-auto border text-sm mt-4">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 border">Départ</th>
              <th className="p-2 border">Arrivée</th>
              <th className="p-2 border">Prix</th>
              <th className="p-2 border">Places</th>
              <th className="p-2 border">Jours actifs</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(trajets) &&
              trajets.map((trajet, index) => (
                <tr key={trajet?.id || index}>
                  <td className="p-2 border">{trajet?.departure}</td>
                  <td className="p-2 border">{trajet?.arrival}</td>
                  <td className="p-2 border">{trajet?.price ?? '-'} FCFA</td>
                  <td className="p-2 border">{trajet?.places ?? '-'}</td>
                  <td className="p-2 border">
                    {trajet?.horaires ? Object.keys(trajet.horaires).join(', ') : ''}
                  </td>
                  <td className="p-2 border">
                    <button
                      onClick={() => {
                        setDeparture(trajet?.departure || '');
                        setArrival(trajet?.arrival || '');
                        setPrice(trajet?.price?.toString() || '');
                        setPlaces((trajet?.places ?? '').toString());
                        setHoraires(trajet?.horaires || {});
                        setModifierId(trajet?.id || null);
                      }}
                      className="text-blue-600 hover:underline mr-2"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      <pre className="mt-6 text-sm bg-gray-100 p-2">
        <strong>Debug user:</strong>
        {JSON.stringify(user, null, 2)}
      </pre>
    </div>
  );
};

export default AgenceTrajetsPage;
