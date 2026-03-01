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
import { StandardLayoutWrapper, PageHeader, MetricCard, SectionCard } from "@/ui";
import {
  ClipboardList,
  Truck,
  Calendar,
  Users,
  ChevronRight,
} from "lucide-react";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageOfflineState } from "@/shared/ui/PageStates";

function getDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export default function OperationsFlotteLandingPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const [todayBookings, setTodayBookings] = useState<number | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState<number | null>(null);
  const [fleetTotal, setFleetTotal] = useState<number>(0);
  const [fleetAvailable, setFleetAvailable] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
      setError(null);
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
        setError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger la synthèse opérationnelle."
            : "Erreur lors du chargement de la synthèse opérationnelle."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, isOnline, reloadKey]);

  const basePath = `/compagnie/${companyId}`;

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-4xl">
      <PageHeader title="Opérations & Flotte" subtitle="Vue d'ensemble opérationnelle. Accédez aux réservations et à la flotte ci-dessous." />
      {!isOnline && (
        <PageOfflineState message="Connexion instable: certaines métriques peuvent être incomplètes." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}

      <SectionCard title="Synthèse opérationnelle" icon={Calendar}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Réservations aujourd'hui" value={loading ? "—" : (todayBookings ?? "—")} icon={Calendar} />
          <MetricCard label="Sessions ouvertes" value={loading ? "—" : (sessionsOpen ?? "—")} icon={Users} />
          <MetricCard label="Véhicules disponibles" value={loading ? "—" : `${fleetAvailable} / ${fleetTotal}`} icon={Truck} />
          <MetricCard label="Flotte totale" value={fleetTotal} icon={Truck} />
        </div>
      </SectionCard>

      <SectionCard title="Accès rapides" icon={ClipboardList}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/reservations`)}
            className="flex items-center justify-between p-5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Réservations</div>
                <div className="text-sm text-gray-500">Voir et gérer toutes les réservations</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
          </button>

          <button
            type="button"
            onClick={() => navigate(`${basePath}/fleet`)}
            className="flex items-center justify-between p-5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50/50 transition text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                <Truck className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-900">Flotte</div>
                <div className="text-sm text-gray-500">Supervision des véhicules et affectations</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
          </button>
        </div>
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
