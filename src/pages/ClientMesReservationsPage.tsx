// ✅ src/pages/ClientMesReservationsPage.tsx

import { useState } from "react";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import ModifierReservationForm from "./ModifierReservationForm";
import { Reservation } from "@/types/reservationTypes";

const ClientMesReservationsPage = () => {
  const [phone, setPhone] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reservationAModifier, setReservationAModifier] = useState<Reservation | null>(null);
  const navigate = useNavigate();

  const chercherReservations = async () => {
    if (!phone) return;
    setLoading(true);
    setError("");
    try {
      const q = query(collection(db, "reservations"), where("telephone", "==", phone));
      const snapshot = await getDocs(q);
      const data: Reservation[] = snapshot.docs.map(doc => ({
        ...(doc.data() as Reservation),
        id: doc.id
      }));
      // ✅ Trie par date la plus récente
      const sorted = data.sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix());
      setReservations(sorted);
    } catch (err) {
      setError("Erreur lors de la recherche.");
    }
    setLoading(false);
  };

  const estModifiable = (date: string) => {
    const maintenant = dayjs();
    const depart = dayjs(date);
    return depart.diff(maintenant, "hour") > 24;
  };

  const annulerReservation = async (id: string) => {
    const confirm = window.confirm("Voulez-vous vraiment annuler cette réservation ?");
    if (!confirm) return;
    try {
      await updateDoc(doc(db, "reservations", id), {
        statut: "annulé"
      });
      alert("Réservation annulée.");
      setReservations(prev =>
        prev.map(r => (r.id === id ? { ...r, statut: "annulé" } : r))
      );
    } catch (err) {
      alert("Erreur lors de l'annulation.");
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Consulter mes réservations</h1>
      <p className="mb-2 text-sm text-gray-600">
        Entrez votre numéro de téléphone pour afficher vos réservations.
      </p>
      <div className="flex space-x-2 mb-6">
        <input
          type="tel"
          placeholder="Numéro de téléphone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border border-gray-300 rounded px-4 py-2 w-full"
        />
        <button
          onClick={chercherReservations}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Rechercher
        </button>
      </div>

      {loading && <p>Chargement...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {reservations.length > 0 && (
        <div className="overflow-auto rounded-lg shadow">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Trajet</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    {dayjs(r.date).format("DD/MM/YYYY")}
                  </td>
                  <td className="p-3">
                    {r.departure} → {r.arrival}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-white text-xs ${
                      r.statut === "payé"
                        ? "bg-green-500"
                        : r.statut === "en_attente"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}>
                      {r.statut}
                    </span>
                  </td>
                  <td className="p-3 space-x-2">
                    <button
                      onClick={() =>
                        navigate(
                          r.statut === "en_attente"
                            ? `/reservation/${r.id}`
                            : `/compagnie/${r.companySlug}/receipt/${r.id}`,
                          { state: { reservation: r } }
                        )
                      }
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Voir billet
                    </button>
                    {estModifiable(r.date) && r.statut === "payé" && (
                      <>
                        <button
                          onClick={() => annulerReservation(r.id)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => setReservationAModifier(r)}
                          className="text-indigo-600 hover:underline text-sm"
                        >
                          ✏️ Modifier
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reservations.length === 0 && !loading && phone && (
        <p className="text-gray-500 text-sm mt-4">
          Aucune réservation trouvée pour ce numéro.
        </p>
      )}

      {reservationAModifier && (
        <ModifierReservationForm
          reservation={reservationAModifier}
          onClose={() => setReservationAModifier(null)}
          onUpdated={chercherReservations}
        />
      )}
    </div>
  );
};

export default ClientMesReservationsPage;
