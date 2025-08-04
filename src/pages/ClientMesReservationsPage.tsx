// ✅ src/pages/ClientMesReservationsPage.tsx

import { useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import dayjs from "dayjs";
import { useNavigate, useParams } from "react-router-dom";
import ModifierReservationForm from "./ModifierReservationForm";
import { Reservation } from "@/types/reservationTypes";
import { ChevronLeft } from "lucide-react";
import { hexToRgba, safeTextColor } from "../utils/color";

// Normalisation de la date Firestore (string ou timestamp)
const normalizeDate = (date: string | { seconds: number; nanoseconds: number }) => {
  if (!date) return null;
  if (typeof date === "string") {
    return dayjs(date);
  }
  if (typeof date === "object" && "seconds" in date) {
    return dayjs(new Date(date.seconds * 1000));
  }
  return null;
};

const ClientMesReservationsPage = () => {
  const [phone, setPhone] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reservationAModifier, setReservationAModifier] = useState<Reservation | null>(null);
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();

  const chercherReservations = async () => {
    if (!phone) return;
    setLoading(true);
    setError("");
    try {
      let allReservations: Reservation[] = [];

      // Parcours toutes les compagnies
      const companiesSnap = await getDocs(collection(db, "companies"));
      for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;
        const companyData = companyDoc.data();

        // Parcours les agences
        const agencesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
        for (const agenceDoc of agencesSnap.docs) {
          const agencyId = agenceDoc.id;

          // Recherche des réservations
          const q = query(
            collection(db, "companies", companyId, "agences", agencyId, "reservations"),
            where("telephone", "==", phone)
          );
          const snapshot = await getDocs(q);

          const data: Reservation[] = snapshot.docs.map((docSnap) => ({
            ...(docSnap.data() as Reservation),
            id: docSnap.id,
            companyId,
            agencyId,
            companySlug: companyData.slug ?? "compagnie", // ✅ Fix: valeur par défaut
            couleurPrimaire: companyData.couleurPrimaire || "#3b82f6",
            couleurSecondaire: companyData.couleurSecondaire || "#f97316",
          }));

          allReservations = [...allReservations, ...data];
        }
      }

      if (allReservations.length === 0) {
        setError("Aucune réservation trouvée pour ce numéro.");
      }

      const sorted = allReservations.sort(
        (a, b) =>
          (normalizeDate(b.date)?.unix() || 0) - (normalizeDate(a.date)?.unix() || 0)
      );
      setReservations(sorted);
    } catch (err) {
      console.error("Erreur recherche réservations :", err);
      setError("Erreur lors de la recherche.");
    }
    setLoading(false);
  };

  const estModifiable = (date: string | { seconds: number; nanoseconds: number }) => {
    const maintenant = dayjs();
    const depart = normalizeDate(date);
    return depart ? depart.diff(maintenant, "hour") > 24 : false;
  };

  // Couleurs du thème
  const couleurPrimaire = reservations[0]?.couleurPrimaire || "#3b82f6";
  const couleurSecondaire = reservations[0]?.couleurSecondaire || "#f97316";
  const textColor = safeTextColor(couleurPrimaire);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="sticky top-0 z-20 px-4 py-3 shadow-sm"
        style={{
          backgroundColor: couleurPrimaire,
          color: textColor,
        }}
      >
        <div className="flex items-center max-w-3xl mx-auto">
          <button
            onClick={() => navigate(`/${slug}`)} // ✅ Retour à la vitrine publique
            className="p-2 rounded-full hover:bg-white/10"
          >
            <ChevronLeft size={22} />
          </button>
          <h1 className="ml-4 font-bold text-lg">Mes réservations</h1>
        </div>
      </header>

      {/* Contenu */}
      <div className="p-4 max-w-3xl mx-auto">
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
            className="px-4 py-2 rounded"
            style={{
              backgroundColor: couleurSecondaire,
              color: safeTextColor(couleurSecondaire),
            }}
          >
            Rechercher
          </button>
        </div>

        {loading && <p>Chargement...</p>}
        {error && <p className="text-red-500">{error}</p>}

        {reservations.length > 0 && (
          <div className="overflow-auto rounded-lg shadow">
            <table className="min-w-full bg-white text-sm">
              <thead
                style={{ backgroundColor: hexToRgba(couleurPrimaire, 0.1) }}
                className="text-left"
              >
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
                      {normalizeDate(r.date)?.format("DD/MM/YYYY") || "--/--/----"}
                    </td>
                    <td className="p-3">
                      {r.departure} → {r.arrival}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-white text-xs`}
                        style={{
                          backgroundColor:
                            r.statut === "payé"
                              ? "#16a34a"
                              : r.statut === "en_attente"
                              ? "#eab308"
                              : "#dc2626",
                        }}
                      >
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
                            { state: { reservation: r, companyInfo: r } }
                          )
                        }
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Voir billet
                      </button>
                      {estModifiable(r.date) && r.statut === "payé" && (
                        <button
                          onClick={() => alert("Fonction annuler à implémenter")}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Annuler
                        </button>
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
    </div>
  );
};

export default ClientMesReservationsPage;
