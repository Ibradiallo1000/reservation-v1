import React, { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";

// =====================
// Fix icône Leaflet
// =====================
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

interface AjouterAgenceFormProps {
  onAdd: () => void;
}

const AjouterAgenceForm: React.FC<AjouterAgenceFormProps> = ({ onAdd }) => {
  const { user } = useAuth();

  const [nomAgence, setNomAgence] = useState("");
  const [pays, setPays] = useState("");
  const [ville, setVille] = useState("");
  const [quartier, setQuartier] = useState("");
  const [type, setType] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // =====================
  // Submit
  // =====================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.companyId) {
      alert("Utilisateur non autorisé.");
      return;
    }

    if (!nomAgence || !pays || !ville) {
      alert("Nom, pays et ville sont obligatoires.");
      return;
    }

    setLoading(true);

    try {
      // 1️⃣ Création de l’agence
      const agencesRef = collection(db, "companies", user.companyId, "agences");
      const agenceDoc = await addDoc(agencesRef, {
        nomAgence,
        pays,
        ville,
        quartier: quartier || null,
        type: type || null,
        latitude,
        longitude,
        status: "active",
        estSiege: false,
        createdAt: serverTimestamp(),
      });

      // 2️⃣ Création AUTOMATIQUE de l’invitation
      await addDoc(collection(db, "invitations"), {
        email: null, // sera renseigné plus tard
        role: "chefAgence",
        companyId: user.companyId,
        agencyId: agenceDoc.id,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // 3️⃣ Reset
      setNomAgence("");
      setPays("");
      setVille("");
      setQuartier("");
      setType("");
      setLatitude(null);
      setLongitude(null);

      onAdd();
      alert("✅ Agence créée + invitation générée.");

    } catch (error) {
      console.error("Erreur création agence :", error);
      alert("❌ Erreur lors de la création.");
    } finally {
      setLoading(false);
    }
  };

  // =====================
  // Map click handler
  // =====================
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
          <label>Nom de l’agence *</label>
          <input
            value={nomAgence}
            onChange={(e) => setNomAgence(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label>Pays *</label>
          <input
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label>Ville *</label>
          <input
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label>Quartier</label>
          <input
            value={quartier}
            onChange={(e) => setQuartier(e.target.value)}
            className="w-full border p-2 rounded"
          />
        </div>
      </div>

      {/* MAP */}
      <div className="my-4">
        <label className="font-semibold block mb-2">
          📍 Cliquez sur la carte pour localiser l’agence
        </label>

        <MapContainer
          center={[12.6392, -8.0029]}
          zoom={12}
          className="h-64 rounded"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapClickHandler />
          {latitude && longitude && (
            <Marker position={[latitude, longitude]} />
          )}
        </MapContainer>

        {latitude && longitude && (
          <p className="text-sm text-gray-600 mt-2">
            Lat: {latitude.toFixed(5)} | Lng: {longitude.toFixed(5)}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? "Création…" : "Ajouter l’agence"}
      </button>
    </form>
  );
};

export default AjouterAgenceForm;
