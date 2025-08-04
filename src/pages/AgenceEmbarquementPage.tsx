import React, { useEffect, useState, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  canal: string;
  montant?: number;
  statut: string;
  statutEmbarquement?: string;
  checkInTime?: any;
  reportInfo?: string;
  tripId?: string; // 🔑 ajouté pour différencier les trajets
}

interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  horaires: { [key: string]: string[] };
  active: boolean;
}

const AgenceEmbarquementPage: React.FC = () => {
  const { user, company } = useAuth();
  const [trajetsDuJour, setTrajetsDuJour] = useState<WeeklyTrip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<{
    id: string;
    departure: string;
    arrival: string;
    heure: string;
  } | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const theme = {
    primary: company?.couleurPrimaire || "#06b6d4",
    secondary: company?.couleurSecondaire || "#8b5cf6",
  };

  // Charger les trajets du jour depuis weeklyTrips
  useEffect(() => {
    const loadTrajets = async () => {
      if (!user?.companyId || !user?.agencyId) return;
      const weeklyTripsRef = collection(
        db,
        `companies/${user.companyId}/agences/${user.agencyId}/weeklyTrips`
      );
      const snapshot = await getDocs(weeklyTripsRef);

      const today = new Date();
      const jourSemaine = today
        .toLocaleDateString("fr-FR", { weekday: "long" })
        .toLowerCase();

      const trips = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as WeeklyTrip))
        .filter((trip) => trip.active && trip.horaires[jourSemaine]);

      setTrajetsDuJour(trips);
    };

    loadTrajets();
  }, [user?.companyId, user?.agencyId]);

  // Charger les réservations en temps réel selon le trajet choisi
  useEffect(() => {
    if (!selectedTrip || !user?.companyId || !user?.agencyId) return;

    setIsLoading(true);
    const q = query(
      collection(
        db,
        `companies/${user.companyId}/agences/${user.agencyId}/reservations`
      ),
      where("date", "==", new Date().toISOString().split("T")[0]),
      where("tripId", "==", selectedTrip.id), // ✅ filtre par tripId
      where("heure", "==", selectedTrip.heure),
      where("statut", "==", "payé")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Reservation)
      );
      setReservations(data);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [selectedTrip, user?.companyId, user?.agencyId]);

  const updateStatut = useCallback(
    async (reservationId: string, statut: string, info?: string) => {
      if (!user?.companyId || !user?.agencyId) return;
      try {
        const ref = doc(
          db,
          `companies/${user.companyId}/agences/${user.agencyId}/reservations`,
          reservationId
        );
        await updateDoc(ref, {
          statutEmbarquement: statut,
          checkInTime:
            statut === "embarqué" ? new Date().toISOString() : null,
          reportInfo: statut === "reporté" ? info || "" : null,
        });
      } catch (error) {
        console.error("Erreur mise à jour statut embarquement:", error);
        alert("Erreur lors de la mise à jour du statut");
      }
    },
    [user?.companyId, user?.agencyId]
  );

  const filteredReservations = reservations.filter(
    (res) =>
      res.nomClient.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.telephone.includes(searchTerm)
  );

  const todayStr = format(new Date(), "dd/MM/yyyy");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 p-6 bg-white rounded-xl shadow-md flex justify-between items-center">
        <h1 className="text-2xl font-bold" style={{ color: theme.primary }}>
          Embarquement – {todayStr}
        </h1>
        <div>
          <input
            type="text"
            placeholder="Rechercher par nom ou téléphone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border rounded-lg shadow-sm"
          />
        </div>
      </div>

      {/* Sélecteur de trajet */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border">
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: theme.secondary }}
        >
          Sélectionner un trajet
        </h2>
        <div className="flex flex-wrap gap-2">
          {trajetsDuJour.length === 0 ? (
            <p className="text-gray-500">Aucun trajet planifié aujourd'hui</p>
          ) : (
            trajetsDuJour.map((trip) =>
              trip.horaires[
                new Date()
                  .toLocaleDateString("fr-FR", { weekday: "long" })
                  .toLowerCase()
              ].map((heure) => (
                <button
                  key={`${trip.id}_${heure}`}
                  onClick={() =>
                    setSelectedTrip({
                      id: trip.id,
                      departure: trip.departure,
                      arrival: trip.arrival,
                      heure,
                    })
                  }
                  className={`px-4 py-2 rounded-lg font-medium shadow-sm ${
                    selectedTrip?.id === trip.id &&
                    selectedTrip?.heure === heure
                      ? "text-white"
                      : "bg-gray-200 text-gray-700"
                  }`}
                  style={
                    selectedTrip?.id === trip.id &&
                    selectedTrip?.heure === heure
                      ? { background: theme.primary }
                      : {}
                  }
                >
                  {trip.departure} → {trip.arrival} à {heure}
                </button>
              ))
            )
          )}
        </div>
      </div>

      {/* Liste des passagers */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2
          className="text-xl font-bold mb-4"
          style={{ color: theme.secondary }}
        >
          Liste des passagers
        </h2>
        {isLoading ? (
          <p>Chargement...</p>
        ) : filteredReservations.length === 0 ? (
          <p className="text-gray-400">Aucun passager trouvé</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-3 text-left">Client</th>
                <th className="p-3 text-left">Téléphone</th>
                <th className="p-3 text-left">Statut</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.map((res) => (
                <tr key={res.id} className="border-t">
                  <td className="p-3">{res.nomClient}</td>
                  <td className="p-3">{res.telephone}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        res.statutEmbarquement === "embarqué"
                          ? "bg-green-100 text-green-700"
                          : res.statutEmbarquement === "absent"
                          ? "bg-red-100 text-red-700"
                          : res.statutEmbarquement === "reporté"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {res.statutEmbarquement || "En attente"}
                    </span>
                  </td>
                  <td className="p-3 flex gap-2">
                    <button
                      onClick={() => updateStatut(res.id, "embarqué")}
                      className="px-3 py-1 text-xs rounded-lg bg-green-500 text-white"
                    >
                      Embarqué
                    </button>
                    <button
                      onClick={() => updateStatut(res.id, "absent")}
                      className="px-3 py-1 text-xs rounded-lg bg-red-500 text-white"
                    >
                      Absent
                    </button>
                    <button
                      onClick={() =>
                        updateStatut(
                          res.id,
                          "reporté",
                          prompt("Raison du report :") || ""
                        )
                      }
                      className="px-3 py-1 text-xs rounded-lg bg-yellow-500 text-white"
                    >
                      Reporté
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AgenceEmbarquementPage;
