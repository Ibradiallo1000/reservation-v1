// Opérations & Flotte — hub CEO : synthèse opérationnelle + accès Réservations et Flotte.
import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import {
  ClipboardList,
  Truck,
  Calendar,
  Users,
  ChevronRight,
} from "lucide-react";

function getDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export default function OperationsFlotteLandingPage() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const { setHeader, resetHeader } = usePageHeader();
  useEffect(() => {
    setHeader({ title: "Opérations & Flotte" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  const [todayBookings, setTodayBookings] = useState<number | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState<number | null>(null);
  const [fleetTotal, setFleetTotal] = useState<number>(0);
  const [fleetAvailable, setFleetAvailable] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const today = getDateKey(new Date());
    const startTs = Timestamp.fromDate(new Date(`${today}T00:00:00`));
    const endTs = Timestamp.fromDate(new Date(`${today}T23:59:59`));

    (async () => {
      setLoading(true);
      try {
        const agencesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
        const agencyIds = agencesSnap.docs.map((d) => d.id);

        let bookingsCount = 0;
        let openSessionsCount = 0;

        for (const agencyId of agencyIds) {
          const resRef = collection(db, "companies", companyId, "agences", agencyId, "reservations");
          const qRes = query(
            resRef,
            where("createdAt", ">=", startTs),
            where("createdAt", "<=", endTs),
            limit(500)
          );
          const resSnap = await getDocs(qRes);
          bookingsCount += resSnap.size;

          const shiftsRef = collection(db, "companies", companyId, "agences", agencyId, "shifts");
          const qShifts = query(shiftsRef, where("status", "in", ["active", "paused"]), limit(20));
          const shiftsSnap = await getDocs(qShifts);
          openSessionsCount += shiftsSnap.size;
        }

        setTodayBookings(bookingsCount);
        setSessionsOpen(openSessionsCount);

        const fleetRef = collection(db, "companies", companyId, "fleetVehicles");
        const fleetSnap = await getDocs(query(fleetRef, limit(500)));
        const vehicles = fleetSnap.docs.map((d) => d.data());
        const total = vehicles.length;
        const available = vehicles.filter(
          (v) =>
            (v.status === "garage" || v.status === "arrived" || v.status === "assigned") &&
            v.status !== "maintenance"
        ).length;
        setFleetTotal(total);
        setFleetAvailable(available);
      } catch (e) {
        console.error("OperationsFlotteLandingPage load:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const basePath = `/compagnie/${companyId}`;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <p className="text-sm text-gray-600">
        Vue d&apos;ensemble opérationnelle. Accédez aux réservations et à la flotte ci-dessous.
      </p>

      {/* Synthèse opérationnelle */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-medium">Réservations aujourd&apos;hui</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {loading ? "—" : todayBookings ?? "—"}
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium">Sessions ouvertes</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {loading ? "—" : sessionsOpen ?? "—"}
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Truck className="w-4 h-4" />
            <span className="text-xs font-medium">Véhicules disponibles</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {loading ? "—" : `${fleetAvailable} / ${fleetTotal}`}
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="text-xs text-gray-500">
            Flotte totale : <strong>{fleetTotal}</strong> véhicules
          </div>
        </div>
      </section>

      {/* Accès rapides */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => navigate(`${basePath}/reservations`)}
          className="flex items-center justify-between p-5 rounded-xl border-2 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">Réservations</div>
              <div className="text-sm text-gray-500">Voir et gérer toutes les réservations</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600" />
        </button>

        <button
          type="button"
          onClick={() => navigate(`${basePath}/fleet`)}
          className="flex items-center justify-between p-5 rounded-xl border-2 border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-teal-100 flex items-center justify-center">
              <Truck className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <div className="font-semibold text-gray-900">Flotte</div>
              <div className="text-sm text-gray-500">Supervision des véhicules et affectations</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600" />
        </button>
      </section>
    </div>
  );
}
