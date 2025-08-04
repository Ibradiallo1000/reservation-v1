import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

const AdminModifierCompagniePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [pays, setPays] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        if (!id) return;
        const snap = await getDoc(doc(db, "companies", id));
        if (snap.exists()) {
          const data = snap.data();
          setNom(data.nom || "");
          setEmail(data.email || "");
          setTelephone(data.telephone || "");
          setPays(data.pays || "");
        }
      } catch (err) {
        console.error("Erreur chargement compagnie:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCompany();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await updateDoc(doc(db, "companies", id), {
        nom,
        email,
        telephone,
        pays,
      });
      setMessage("✅ Compagnie mise à jour avec succès !");
      setTimeout(() => navigate("/compagnies"), 1500);
    } catch (err) {
      console.error("Erreur mise à jour:", err);
      setMessage("❌ Erreur lors de la mise à jour");
    }
  };

  if (loading) return <p className="p-6">Chargement...</p>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Modifier la compagnie</h1>
      {message && <p className="mb-4 text-blue-600">{message}</p>}
      <form onSubmit={handleSubmit} className="grid gap-4">
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom de la compagnie"
          className="border p-2 rounded"
          required
        />
        <input
          value={email}
          type="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="border p-2 rounded"
          required
        />
        <input
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="Téléphone"
          className="border p-2 rounded"
          required
        />
        <input
          value={pays}
          onChange={(e) => setPays(e.target.value)}
          placeholder="Pays"
          className="border p-2 rounded"
          required
        />
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Sauvegarder
        </button>
      </form>
    </div>
  );
};

export default AdminModifierCompagniePage;
