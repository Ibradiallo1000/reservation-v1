// Logistics dashboard — responsable_logistique & CEO.
// Fleet overview, trip monitoring, maintenance alerts, courier visibility (read-only).
import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard } from "@/ui";
import { listVehicles, emergencyReplaceVehicleOnTrip } from "@/modules/compagnie/fleet/vehiclesService";
import { getActiveAffectationByVehicle } from "@/modules/compagnie/fleet/affectationService";
import { TECHNICAL_STATUS, OPERATIONAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import { getVehicleFinancialStats, type VehicleFinancialStats } from "@/modules/compagnie/fleet/fleetFinanceService";
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
  ShieldAlert,
  Wallet,
} from "lucide-react";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { toast } from "sonner";

type DateLike = Date | { toDate?: () => Date } | null | undefined;

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value;
  return null;
}

function daysUntil(dateValue: DateLike): number | null {
  const d = toDate(dateValue);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function LogisticsDashboardPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const location = useLocation();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const theme = useCompanyTheme(user?.companyId ? undefined : null);
  const path = location.pathname.toLowerCase();
  const pageMode: "overview" | "compliance" | "emergency" = path.endsWith("/logistics/compliance")
    ? "compliance"
    : path.endsWith("/logistics/emergency")
      ? "emergency"
      : "overview";

  const [vehicles, setVehicles] = useState<Array<{
    id: string;
    busNumber?: string;
    plateNumber: string;
    model?: string;
    technicalStatus: string;
    operationalStatus: string;
    currentCity?: string;
    currentTripId?: string | null;
    canonicalStatus?: string;
    insuranceExpiryDate?: DateLike;
    inspectionExpiryDate?: DateLike;
    vignetteExpiryDate?: DateLike;
    updatedAt?: DateLike;
  }>>([]);
  const [financialStats, setFinancialStats] = useState<VehicleFinancialStats[]>([]);
  const [shipmentsCount, setShipmentsCount] = useState<{ today: number; inTransit: number }>({ today: 0, inTransit: 0 });
  const [weeklyTripsCount, setWeeklyTripsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emergencyIncidentVehicleId, setEmergencyIncidentVehicleId] = useState("");
  const [emergencyReplacementVehicleId, setEmergencyReplacementVehicleId] = useState("");
  const [emergencySubmitting, setEmergencySubmitting] = useState(false);
  const [emergencyRoutePreview, setEmergencyRoutePreview] = useState<string>("");

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [vehicleList, agencesSnap, finance] = await Promise.all([
        listVehicles(companyId),
        getDocs(collection(db, "companies", companyId, "agences")),
        getVehicleFinancialStats(companyId).catch(() => [] as VehicleFinancialStats[]),
      ]);
      const list = vehicleList.map((v: any) => ({
        id: v.id,
        busNumber: (v as any).busNumber ?? (v as any).fleetNumber ?? "",
        plateNumber: v.plateNumber ?? "",
        model: v.model ?? "",
        technicalStatus: v.technicalStatus ?? TECHNICAL_STATUS.NORMAL,
        operationalStatus: v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE,
        currentCity: v.currentCity ?? "",
        currentTripId: (v as any).currentTripId ?? null,
        canonicalStatus: (v as any).canonicalStatus ?? "",
        insuranceExpiryDate: (v as any).insuranceExpiryDate ?? null,
        inspectionExpiryDate: (v as any).inspectionExpiryDate ?? null,
        vignetteExpiryDate: (v as any).vignetteExpiryDate ?? null,
        updatedAt: (v as any).updatedAt ?? null,
      }));
      setVehicles(list);
      setFinancialStats(finance);

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
  const incidentVehicles = vehicles.filter(
    (v) =>
      (v as any).canonicalStatus === "ACCIDENT" ||
      v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE ||
      v.technicalStatus === TECHNICAL_STATUS.HORS_SERVICE
  );
  const complianceRows = vehicles.map((v) => {
    const insuranceDays = daysUntil(v.insuranceExpiryDate);
    const inspectionDays = daysUntil(v.inspectionExpiryDate);
    const vignetteDays = daysUntil(v.vignetteExpiryDate);
    const minDays = [insuranceDays, inspectionDays, vignetteDays].filter((d): d is number => d !== null).sort((a, b) => a - b)[0] ?? null;
    const missing = [insuranceDays, inspectionDays, vignetteDays].some((d) => d === null);
    return {
      ...v,
      insuranceDays,
      inspectionDays,
      vignetteDays,
      minDays,
      missing,
    };
  });
  const complianceExpired = complianceRows.filter((v) => (v.minDays ?? 9999) < 0 || v.missing);
  const complianceDueSoon = complianceRows.filter((v) => !v.missing && (v.minDays ?? 9999) >= 0 && (v.minDays ?? 9999) <= 30);
  const topCostVehicles = [...financialStats].sort((a, b) => b.vehicleCosts - a.vehicleCosts).slice(0, 5);
  const lowProfitVehicles = [...financialStats].sort((a, b) => a.vehicleProfit - b.vehicleProfit).slice(0, 5);
  const showOverview = pageMode === "overview";
  const showCompliance = pageMode === "overview" || pageMode === "compliance";
  const showEmergency = pageMode === "overview" || pageMode === "emergency";
  const showIncident = pageMode === "overview" || pageMode === "emergency";
  const incidentTransitVehicles = vehicles.filter(
    (v) =>
      v.operationalStatus === OPERATIONAL_STATUS.EN_TRANSIT &&
      (v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE ||
        v.technicalStatus === TECHNICAL_STATUS.HORS_SERVICE ||
        v.canonicalStatus === "ACCIDENT" ||
        v.canonicalStatus === "OUT_OF_SERVICE")
  );
  const replacementCandidates = vehicles.filter(
    (v) =>
      v.id !== emergencyIncidentVehicleId &&
      v.operationalStatus === OPERATIONAL_STATUS.GARAGE &&
      v.technicalStatus === TECHNICAL_STATUS.NORMAL
  );

  useEffect(() => {
    let cancelled = false;
    const loadRoutePreview = async () => {
      if (!companyId || !emergencyIncidentVehicleId) {
        setEmergencyRoutePreview("");
        return;
      }
      try {
        const active = await getActiveAffectationByVehicle(companyId, emergencyIncidentVehicleId);
        if (!active || cancelled) {
          if (!cancelled) setEmergencyRoutePreview("");
          return;
        }
        const dep = active.data.departureCity || "N/A";
        const arr = active.data.arrivalCity || "N/A";
        const trip = active.data.tripId || "N/A";
        const slot = active.data.departureTime || "N/A";
        if (!cancelled) {
          setEmergencyRoutePreview(`${dep} -> ${arr} | Trip: ${trip} | Depart: ${slot}`);
        }
      } catch {
        if (!cancelled) setEmergencyRoutePreview("");
      }
    };
    loadRoutePreview();
    return () => {
      cancelled = true;
    };
  }, [companyId, emergencyIncidentVehicleId]);

  const handleEmergencyReplacement = async () => {
    if (!companyId || !user?.uid) return;
    if (!emergencyIncidentVehicleId || !emergencyReplacementVehicleId) {
      toast.error("Selectionnez le vehicule en incident et le vehicule de remplacement.");
      return;
    }
    setEmergencySubmitting(true);
    try {
      const affectationId = await emergencyReplaceVehicleOnTrip(
        companyId,
        emergencyIncidentVehicleId,
        emergencyReplacementVehicleId,
        user.uid,
        String((user as any)?.role ?? "responsable_logistique")
      );
      toast.success(`Remplacement d'urgence lance. Affectation: ${affectationId.slice(0, 8)}...`);
      setEmergencyIncidentVehicleId("");
      setEmergencyReplacementVehicleId("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur remplacement d'urgence.");
    } finally {
      setEmergencySubmitting(false);
    }
  };

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title={pageMode === "compliance" ? "Conformite bus" : pageMode === "emergency" ? "Urgence trajet" : "Logistique"}
        subtitle={
          pageMode === "compliance"
            ? "Controle conformite documentaire flotte (assurance, controle technique, vignette)."
            : pageMode === "emergency"
              ? "Remplacement d'urgence d'un vehicule en transit (cas exceptionnel)."
              : "Pilotage flotte siege (lecture/supervision). Affectation trajets: Chef d'agence."
        }
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
          {showOverview && (
          <>
          {/* Fleet overview */}
          <SectionCard title="Resume flotte">
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
          </>
          )}

          {showCompliance && (
          <>
          {/* Compliance center */}
          <SectionCard title="Centre conformite bus">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <MetricCard label="Non conformes / expirés" value={String(complianceExpired.length)} icon={ShieldAlert} />
              <MetricCard label="A renouveler (30 jours)" value={String(complianceDueSoon.length)} icon={AlertTriangle} />
              <MetricCard label="Conformes" value={String(Math.max(0, vehicles.length - complianceExpired.length - complianceDueSoon.length))} icon={Car} />
            </div>
            {complianceExpired.length === 0 && complianceDueSoon.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune alerte conformité détectée.</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {[...complianceExpired, ...complianceDueSoon].slice(0, 10).map((v) => (
                  <li key={v.id} className="py-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {v.busNumber ? `#${v.busNumber} - ` : ""}{v.plateNumber || v.id}
                      </p>
                      <p className="text-xs text-gray-500">
                        Assurance: {v.insuranceDays ?? "ND"}j · Controle: {v.inspectionDays ?? "ND"}j · Vignette: {v.vignetteDays ?? "ND"}j
                      </p>
                    </div>
                    <span className={`text-xs font-medium ${v.missing || (v.minDays ?? 9999) < 0 ? "text-red-600" : "text-amber-600"}`}>
                      {v.missing ? "Donnees manquantes" : (v.minDays ?? 0) < 0 ? "Expire" : "A renouveler"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          </>
          )}

          {/* Fleet distribution by city */}
          {showOverview && byCity.length > 0 && (
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

          {showOverview && (
          <>
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
          </>
          )}

          {showOverview && (
          <>
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
          </>
          )}

          {showIncident && (
          <>
          {/* Incident monitor */}
          <SectionCard title="Incidents critiques (siege)">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
              <MetricCard label="Accidentes" value={String(inAccident)} icon={AlertTriangle} />
              <MetricCard label="Hors service" value={String(outOfService)} icon={Wrench} />
              <MetricCard label="Total critiques" value={String(incidentVehicles.length)} icon={ShieldAlert} />
            </div>
            {incidentVehicles.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun véhicule critique signalé.</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {incidentVehicles.slice(0, 10).map((v) => (
                  <li key={v.id} className="py-2 flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {v.busNumber ? `#${v.busNumber} - ` : ""}{v.plateNumber || v.id}
                    </span>
                    <span className="text-sm text-red-600 dark:text-red-400">
                      {v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE ? "Accidente" : "Hors service"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          </>
          )}

          {showEmergency && (
          <>
          {/* Emergency reassignment by logistics manager (HQ) */}
          <SectionCard title="Intervention d'urgence (remplacement trajet)">
            <p className="mb-3 text-sm text-gray-600">
              Cas exceptionnel: vehicule en transit accidente/en panne. Le responsable logistique peut declencher un vehicule de remplacement.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vehicule en incident (en transit)</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={emergencyIncidentVehicleId}
                  onChange={(e) => setEmergencyIncidentVehicleId(e.target.value)}
                >
                  <option value="">Selectionner</option>
                  {incidentTransitVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {(v.busNumber ? `#${v.busNumber} - ` : "") + (v.plateNumber || v.id)} ({v.currentCity || "Ville inconnue"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vehicule de remplacement (disponible)</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={emergencyReplacementVehicleId}
                  onChange={(e) => setEmergencyReplacementVehicleId(e.target.value)}
                >
                  <option value="">Selectionner</option>
                  {replacementCandidates.map((v) => (
                    <option key={v.id} value={v.id}>
                      {(v.busNumber ? `#${v.busNumber} - ` : "") + (v.plateNumber || v.id)} ({v.currentCity || "Ville inconnue"})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={handleEmergencyReplacement}
                disabled={emergencySubmitting}
                className="rounded-lg px-4 py-2 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: theme?.colors?.primary ?? "#2563eb" }}
              >
                {emergencySubmitting ? "Traitement..." : "Affecter un remplacement d'urgence"}
              </button>
            </div>
            {emergencyRoutePreview && (
              <p className="mt-2 text-xs text-gray-600">
                Trajet de remplacement applique: {emergencyRoutePreview}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              L'affectation normale reste geree par les chefs d'agence. Cette action est reservee aux incidents en transit.
            </p>
          </SectionCard>
          </>
          )}

          {showOverview && (
          <>
          {/* Fleet cost / profitability */}
          <SectionCard title="Couts & performance flotte (12 mois)">
            {financialStats.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune statistique financiere disponible.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Top couts vehicules</p>
                  <ul className="space-y-2">
                    {topCostVehicles.map((v) => (
                      <li key={v.vehicleId} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{v.plateNumber || v.vehicleId}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{Math.round(v.vehicleCosts).toLocaleString("fr-FR")} XOF</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Vehicules faible rentabilite</p>
                  <ul className="space-y-2">
                    {lowProfitVehicles.map((v) => (
                      <li key={v.vehicleId} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{v.plateNumber || v.vehicleId}</span>
                        <span className={`font-semibold ${v.vehicleProfit < 0 ? "text-red-600" : "text-amber-600"}`}>
                          {Math.round(v.vehicleProfit).toLocaleString("fr-FR")} XOF
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Lecture pilotage siege uniquement. Les affectations trajets restent gerées par les chefs d'agence.
            </p>
          </SectionCard>
          </>
          )}

          {/* Courier visibility (read-only) */}
          {showOverview && (
          <>
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
          </>
          )}
        </div>
      )}
    </StandardLayoutWrapper>
  );
}
