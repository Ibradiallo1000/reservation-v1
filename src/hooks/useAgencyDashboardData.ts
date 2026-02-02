import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";

/* =========================
   Types
========================= */
interface Reservation {
  id: string;
  statut: string;
  canal?: "en_ligne" | "guichet";
  montant?: number;
  createdAt?: Timestamp;
}

/* =========================
   Hook
========================= */
export const useAgencyDashboardData = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    enLigne: 0,
    guichet: 0,
    revenus: 0,
  });

  useEffect(() => {
    // 🔒 Sécurité absolue
    if (!user?.companyId || !user?.agencyId) {
      setLoading(false);
      return;
    }

    const reservationsRef = collection(
      db,
      "companies",
      user.companyId,
      "agences",
      user.agencyId,
      "reservations"
    );

    const q = query(
      reservationsRef,
      where("statut", "in", ["payé", "preuve_recue"])
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: Reservation[] = [];
        let total = 0;
        let enLigne = 0;
        let guichet = 0;
        let revenus = 0;

        snap.forEach((doc) => {
          const data = doc.data() as any;
          list.push({ id: doc.id, ...data });

          total += 1;

          if (data.canal === "en_ligne") enLigne += 1;
          if (data.canal === "guichet") guichet += 1;

          if (typeof data.montant === "number") {
            revenus += data.montant;
          }
        });

        setReservations(list);
        setStats({
          total,
          enLigne,
          guichet,
          revenus,
        });

        setLoading(false);
      },
      (error) => {
        // 🚨 IMPORTANT : NE PAS DÉCONNECTER
        console.error(
          "Firestore agence (non bloquant):",
          error.code,
          error.message
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.companyId, user?.agencyId]);

  return {
    loading,
    reservations,
    stats,
  };
};
