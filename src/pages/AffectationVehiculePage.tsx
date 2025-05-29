// AffectationVehiculePage.tsx
import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../hooks/useAuth';

interface TrajetJour {
  id: string;
  date: string;
  heure: string;
  departure: string;
  arrival: string;
  vehicule?: string;
  chauffeur?: string;
  capacite?: number;
}

const AffectationVehiculePage: React.FC = () => {
  const { user } = useAuth();
  const [trajets, setTrajets] = useState<TrajetJour[]>([]);
  const [selectedTrajet, setSelectedTrajet] = useState<TrajetJour | null>(null);

  const [vehicule, setVehicule] = useState('');
  const [chauffeur, setChauffeur] = useState('');
  const [capacite, setCapacite] = useState<number>(70);

  useEffect(() => {
    const fetchTrajets = async () => {
      if (!user?.uid) return;
      const today = new Date().toISOString().split('T')[0];
      const q = query(
        collection(db, 'trajets_reels'),
        where('compagnieId', '==', user.uid),
        where('date', '>=', today)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TrajetJour));
      setTrajets(data);
    };
    fetchTrajets();
  }, [user]);

  const handleAffect = async () => {
    if (!selectedTrajet) return;
    await updateDoc(doc(db, 'trajets_reels', selectedTrajet.id), {
      vehicule,
      chauffeur,
      capacite,
    });
    alert('Trajet mis à jour avec succès');
    setSelectedTrajet(null);
    setVehicule('');
    setChauffeur('');
    setCapacite(70);
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Affectation de véhicule</h2>
      <div className="space-y-4">
        {trajets.map((t) => (
          <div key={t.id} className="border p-4 rounded shadow">
            <p className="font-semibold">
              {t.date} - {t.heure} : {t.departure} → {t.arrival}
            </p>
            {t.vehicule ? (
              <p className="text-sm text-green-600">Affecté à {t.vehicule} - Chauffeur : {t.chauffeur}</p>
            ) : (
              <button
                onClick={() => setSelectedTrajet(t)}
                className="mt-2 text-sm px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                Affecter
              </button>
            )}
          </div>
        ))}
      </div>

      {selectedTrajet && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-xl">
          <h3 className="font-semibold mb-2">Affectation pour le trajet : {selectedTrajet.departure} → {selectedTrajet.arrival}</h3>
          <div className="flex gap-4 mb-2">
            <input
              className="border p-2 flex-1"
              placeholder="Nom du véhicule / Matricule"
              value={vehicule}
              onChange={(e) => setVehicule(e.target.value)}
            />
            <input
              className="border p-2 flex-1"
              placeholder="Nom du chauffeur"
              value={chauffeur}
              onChange={(e) => setChauffeur(e.target.value)}
            />
            <input
              className="border p-2 w-24"
              type="number"
              placeholder="Capacité"
              value={capacite}
              onChange={(e) => setCapacite(Number(e.target.value))}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAffect}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setSelectedTrajet(null)}
              className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AffectationVehiculePage;
