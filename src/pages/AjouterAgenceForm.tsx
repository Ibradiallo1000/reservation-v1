// ✅ src/pages/AjouterAgenceForm.tsx
import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

// Corrige l’icône de Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
});

interface AjouterAgenceFormProps {
  onAdd: () => void;
}

const AjouterAgenceForm: React.FC<AjouterAgenceFormProps> = ({ onAdd }) => {
  const { user } = useAuth();
  const [nomAgence, setNomAgence] = useState('');
  const [pays, setPays] = useState('');
  const [ville, setVille] = useState('');
  const [quartier, setQuartier] = useState('');
  const [type, setType] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.companyId) {
      alert("Erreur : utilisateur non autorisé ou ID compagnie manquant.");
      return;
    }

    if (!nomAgence || !pays || !ville) {
      alert('Veuillez remplir au moins : nom, pays et ville.');
      return;
    }

    const nouvelleAgence = {
      nomAgence,
      pays,
      ville,
      quartier,
      type,
      latitude,
      longitude,
      companyId: user.companyId,
      status: 'active',
      createdAt: new Date(),
      estSiege: false,
    };

    try {
      await addDoc(collection(db, 'agences'), nouvelleAgence);
      alert('✅ Agence ajoutée avec succès.');
      setNomAgence('');
      setPays('');
      setVille('');
      setQuartier('');
      setType('');
      setLatitude(null);
      setLongitude(null);
      onAdd();
    } catch (error) {
      console.error('❌ Erreur lors de l’ajout :', error);
      alert('Une erreur est survenue lors de l’ajout.');
    }
  };

  const MapClickHandler = () => {
    useMapEvents({
      click(e) {
        setLatitude(e.latlng.lat);
        setLongitude(e.latlng.lng);
      },
    });
    return null;
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-100 p-4 rounded mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1">Nom de l’agence</label>
          <input type="text" value={nomAgence} onChange={(e) => setNomAgence(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div>
          <label className="block mb-1">Pays</label>
          <input type="text" value={pays} onChange={(e) => setPays(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div>
          <label className="block mb-1">Ville</label>
          <input type="text" value={ville} onChange={(e) => setVille(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div>
          <label className="block mb-1">Quartier (optionnel)</label>
          <input type="text" value={quartier} onChange={(e) => setQuartier(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block mb-1">Type (optionnel)</label>
          <input type="text" value={type} onChange={(e) => setType(e.target.value)} className="w-full border p-2 rounded" />
        </div>
      </div>

      <div className="my-4">
        <label className="block mb-2 font-semibold">📍 Cliquez sur la carte pour définir l’emplacement</label>
        <MapContainer center={[12.6392, -8.0029]} zoom={12} className="h-64 rounded">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapClickHandler />
          {latitude && longitude && <Marker position={[latitude, longitude]} />}
        </MapContainer>
        {latitude && longitude && (
          <p className="text-sm mt-2 text-gray-600">
            Latitude : {latitude.toFixed(5)} — Longitude : {longitude.toFixed(5)}
          </p>
        )}
      </div>

      <button type="submit" className="mt-4 bg-green-600 text-white px-4 py-2 rounded">
        Ajouter l’agence
      </button>
    </form>
  );
};

export default AjouterAgenceForm;
