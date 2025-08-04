import { db } from "@/firebaseConfig";
import { addDoc, collection } from "firebase/firestore";

interface OfflineReservation {
  id?: string;
  clientName: string;
  clientPhone: string;
  departure: string;
  arrival: string;
  date: string;
  time: string;
  seats: number;
  companyId: string;
  agencyId: string;
  statut: "en_attente_sync" | "en_attente";
}

// Sauvegarde locale
export const saveOfflineReservation = (reservation: OfflineReservation) => {
  const pending = JSON.parse(localStorage.getItem("offlineReservations") || "[]");
  pending.push(reservation);
  localStorage.setItem("offlineReservations", JSON.stringify(pending));
};

// Synchro automatique quand le réseau revient
export const syncOfflineReservations = async () => {
  const pending: OfflineReservation[] = JSON.parse(localStorage.getItem("offlineReservations") || "[]");
  if (pending.length === 0) return;

  for (const r of pending) {
    try {
      await addDoc(collection(db, `companies/${r.companyId}/agences/${r.agencyId}/reservations`), {
        ...r,
        statut: "en_attente",
        createdAt: new Date()
      });
    } catch (err) {
      console.error("Erreur synchro offline:", err);
      return;
    }
  }
  localStorage.removeItem("offlineReservations");
};
