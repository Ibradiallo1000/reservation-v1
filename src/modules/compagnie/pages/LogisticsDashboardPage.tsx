// Logistics dashboard — responsable_logistique & CEO.
// Fleet overview, trip monitoring, maintenance alerts, courier visibility (read-only).
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard } from "@/ui";
import { listVehicles } from "@/modules/compagnie/fleet/vehiclesService";
import { TECHNICAL_STATUS, OPERATIONAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { db } from "@/firebaseConfig";
import { getDocs, collection } from "firebase/firestore";
import {
  Truck,
  Package,
  Wrench,
  MapPin,
  Car,
  AlertTriangle,
  Loader2,
  ClipboardList,
} from "lucide-react";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";

export default function LogisticsDashboardPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const theme = useCompanyTheme(user?.companyId ? undefined : null);

  const [vehicles, setVehicles] = useState<Array<{
    id: string;
    plateNumber: string;
    technicalStatus: string;
    operationalStatus: string;
    currentCity?: string;
    currentTripId?: string | null;
    canonicalStatus?: string;
  }>>([]);
  const [shipmentsCount, setShipmentsCount] = useState<{ today: number; inTransit: number }>({ today: 0, inTransit: 0 });
  const [weeklyTripsCount, setWeeklyTripsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [vehicleList, agencesSnap] = await Promise.all([
        listVehicles(companyId),
        getDocs(collection(db, "companies", companyId, "agences")),
      ]);
      const list = vehicleList.map((v: any) => ({
        id: v.id,
        plateNumber: v.plateNumber ?? "",
        technicalStatus: v.technicalStatus ?? TECHNICAL_STATUS.NORMAL,
        operationalStatus: v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE,
        currentCity: v.currentCity ?? "",
        currentTripId: (v as any).currentTripId ?? null,
        canonicalStatus: (v as any).canonicalStatus ?? "",
      }));
      setVehicles(list);

      let tripsTotal = 0;
      for (const ag of agencesSnap.docs) {
        const tripsSnap = await getDocs(
          collection(db, "companies", companyId, "agences", ag.id, "weeklyTrips")
        );
        tripsTotal += tripsSnap.size;
      }
      setWeeklyTripsCount(tripsTotal);

      const shipRef = shipmentsRef(db, companyId);
      const shipSnap = await getDocs(shipRef);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let today = 0;
      let inTransit = 0;
      shipSnap.docs.forEach((d) => {
        const data = d.data() as { createdAt?: { toDate?: () => Date }; currentStatus?: string };
        const created = data.createdAt?.toDate?.();
        if (created && created >= todayStart) today++;
        const status = (data.currentStatus ?? "").toLowerCase();
        if (status.includes("transit") || status.includes("en_route") || status === "in_transit") inTransit++;
      });
      setShipmentsCount({ today, inTransit });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const totalVehicles = vehicles.length;
  const available = vehicles.filter(
    (v) =>
      (v as any).canonicalStatus === "AVAILABLE" ||
      ((v.operationalStatus === OPERATIONAL_STATUS.GARAGE) && (v.technicalStatus === TECHNICAL_STATUS.NORMAL))
  ).length;
  const onTrip = vehicles.filter(
    (v) =>
      (v as any).canonicalStatus === "ON_TRIP" || v.operationalStatus === OPERATIONAL_STATUS.EN_TRANSIT
  ).length;
  const inMaintenance = vehicles.filter(
    (v) => (v as any).canonicalStatus === "MAINTENANCE" || v.technicalStatus === TECHNICAL_STATUS.MAINTENANCE
  ).length;
  const inAccident = vehicles.filter(
    (v) => (v as any).canonicalStatus === "ACCIDENT" || v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE
  ).length;
  const outOfService = vehicles.filter(
    (v) =>
      (v as any).canonicalStatus === "OUT_OF_SERVICE" || v.technicalStatus === TECHNICAL_STATUS.HORS_SERVICE
  ).length;
  const maintenanceAlerts = vehicles.filter(
    (v) =>
      v.technicalStatus === TECHNICAL_STATUS.MAINTENANCE ||
      v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE ||
      v.technicalStatus === TECHNICAL_STATUS.HORS_SERVICE
  );
  const byCity = React.useMemo(() => {
    const map = new Map<string, number>();
    vehicles.forEach((v) => {
      const city = (v.currentCity ?? "").trim() || "(sans ville)";
      map.set(city, (map.get(city) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [vehicles]);
  const activeTripsCount = vehicles.filter((v) => v.currentTripId).length;

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Logistique"
        subtitle="Vue d’ensemble flotte, trajets et courrier (lecture seule)"
        icon={Truck}
        primaryColorVar={theme?.colors?.primary ? "var(--teliya-primary)" : undefined}
      />

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Fleet overview */}
          <SectionCard title="Résumé flotte">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <MetricCard label="Total véhicules" value={String(totalVehicles)} icon={Car} />
              <MetricCard label="Disponibles" value={String(available)} icon={Car} />
              <MetricCard label="En trajet" value={String(onTrip)} icon={MapPin} />
              <MetricCard label="En maintenance" value={String(inMaintenance)} icon={Wrench} />
              <MetricCard label="Accident" value={String(inAccident)} icon={AlertTriangle} />
            </div>
            {(outOfService > 0) && (
              <p className="mt-2 text-sm text-gray-500">Hors service : {outOfService}</p>
            )}
          </SectionCard>

          {/* Fleet distribution by city */}
          {byCity.length > 0 && (
            <SectionCard title="Répartition par ville">
              <ul className="space-y-1">
                {byCity.slice(0, 15).map(([city, count]) => (
                  <li key={city} className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{city}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                  </li>
                ))}
              </ul>
              {byCity.length > 15 && (
                <p className="mt-2 text-xs text-gray-500">+ {byCity.length - 15} autres villes</p>
              )}
            </SectionCard>
          )}

          {/* Trip monitoring */}
          <SectionCard title="Trajets">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-4">
                <ClipboardList className="h-8 w-8 text-gray-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Trajets hebdomadaires configurés</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">{weeklyTripsCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <MapPin className="h-8 w-8 text-gray-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Véhicules en trajet actif</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">{activeTripsCount}</p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Données : weeklyTrips par agence ; véhicules avec currentTripId. Détail sur le tableau de bord Garage.
            </p>
          </SectionCard>

          {/* Maintenance alerts */}
          <SectionCard title="Alertes maintenance">
            {maintenanceAlerts.length === 0 ? (
              <p className="text-gray-500 text-sm">Aucun véhicule en maintenance ou incident.</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {maintenanceAlerts.slice(0, 10).map((v) => (
                  <li key={v.id} className="py-2 flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {v.plateNumber || v.id}
                    </span>
                    <span className="text-sm text-amber-600 dark:text-amber-400">
                      {v.technicalStatus === TECHNICAL_STATUS.MAINTENANCE
                        ? "Maintenance"
                        : v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE
                          ? "Accidenté"
                          : "Hors service"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Courier visibility (read-only) */}
          <SectionCard title="Courrier (lecture seule)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <Package className="h-8 w-8 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Envois aujourd’hui</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">
                    {shipmentsCount.today}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <MapPin className="h-8 w-8 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">En transit</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">
                    {shipmentsCount.inTransit}
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Données : logistics/data/shipments. La gestion courrier et les finances restent dans les espaces dédiés.
            </p>
          </SectionCard>
        </div>
      )}
    </StandardLayoutWrapper>
  );
}
