// Phase 1F/1G — Tableau de bord Garage : KPIs, activité récente, alertes. Thème compagnie.
import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { listVehicles } from "@/modules/compagnie/fleet/vehiclesService";
import { TECHNICAL_STATUS, OPERATIONAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import { useGarageTheme } from "@/modules/compagnie/layout/GarageThemeContext";
import { Truck, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  GARAGE: "Garage",
  EN_SERVICE: "En service",
  EN_TRANSIT: "En transit",
  EN_MAINTENANCE: "Maintenance",
  ACCIDENTE: "Accidenté",
  HORS_SERVICE: "Hors service",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  GARAGE: "bg-slate-200 text-slate-800",
  EN_SERVICE: "bg-emerald-100 text-emerald-800",
  EN_TRANSIT: "bg-blue-100 text-blue-800",
  EN_MAINTENANCE: "bg-amber-100 text-amber-800",
  ACCIDENTE: "bg-red-100 text-red-800",
  HORS_SERVICE: "bg-slate-300 text-slate-700",
};

const ALERT_DAYS = 30;

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof (v as { toDate?: () => Date }).toDate === "function") return (v as { toDate(): Date }).toDate();
  if (v instanceof Date) return v;
  return null;
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const other = new Date(d);
  other.setHours(0, 0, 0, 0);
  return Math.ceil((other.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export default function GarageDashboardHomePage() {
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? "";
  const { setHeader, resetHeader } = usePageHeader();
  const theme = useGarageTheme();

  const [vehicles, setVehicles] = useState<Array<{
    id: string;
    plateNumber: string;
    status: string;
    technicalStatus: string;
    operationalStatus: string;
    updatedAt?: unknown;
    insuranceExpiryDate?: unknown;
    inspectionExpiryDate?: unknown;
    vignetteExpiryDate?: unknown;
  }>>([]);
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
      const list = await listVehicles(companyId);
      setVehicles(
        list.map((v: any) => ({
          id: v.id,
          plateNumber: v.plateNumber ?? "",
          status: v.status ?? "GARAGE",
          technicalStatus: v.technicalStatus ?? TECHNICAL_STATUS.NORMAL,
          operationalStatus: v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE,
          updatedAt: v.updatedAt ?? null,
          insuranceExpiryDate: v.insuranceExpiryDate ?? null,
          inspectionExpiryDate: v.inspectionExpiryDate ?? null,
          vignetteExpiryDate: v.vignetteExpiryDate ?? null,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement flotte.");
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    setHeader({ title: "Tableau de bord — Garage" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  useEffect(() => {
    load();
  }, [load]);

  const total = vehicles.length;
  const available = vehicles.filter(
    (v) => v.operationalStatus === OPERATIONAL_STATUS.GARAGE && v.technicalStatus === TECHNICAL_STATUS.NORMAL
  ).length;
  const inTransit = vehicles.filter((v) => v.operationalStatus === OPERATIONAL_STATUS.EN_TRANSIT).length;
  const maintenance = vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.MAINTENANCE).length;
  const accidented = vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE).length;
  const horsService = vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.HORS_SERVICE).length;

  const recentActivity = [...vehicles]
    .sort((a, b) => {
      const aDate = toDate(a.updatedAt)?.getTime() ?? 0;
      const bDate = toDate(b.updatedAt)?.getTime() ?? 0;
      return bDate - aDate;
    })
    .slice(0, 10);

  const alerts: Array<{ type: "insurance" | "inspection" | "vignette"; plateNumber: string; daysLeft: number; label: string }> = [];
  const now = Date.now();
  vehicles.forEach((v) => {
    const ins = toDate(v.insuranceExpiryDate);
    const insDays = ins != null ? daysUntil(ins) : null;
    if (insDays != null && insDays >= 0 && insDays <= ALERT_DAYS) {
      alerts.push({ type: "insurance", plateNumber: v.plateNumber, daysLeft: insDays, label: "Assurance" });
    }
    const insp = toDate(v.inspectionExpiryDate);
    const inspDays = insp != null ? daysUntil(insp) : null;
    if (inspDays != null && inspDays >= 0 && inspDays <= ALERT_DAYS) {
      alerts.push({ type: "inspection", plateNumber: v.plateNumber, daysLeft: inspDays, label: "Contrôle technique" });
    }
    const vig = toDate(v.vignetteExpiryDate);
    const vigDays = vig != null ? daysUntil(vig) : null;
    if (vigDays != null && vigDays >= 0 && vigDays <= ALERT_DAYS) {
      alerts.push({ type: "vignette", plateNumber: v.plateNumber, daysLeft: vigDays, label: "Vignette" });
    }
  });
  alerts.sort((a, b) => a.daysLeft - b.daysLeft);

  if (!companyId) {
    return <div className="p-6 text-slate-600 bg-slate-50 rounded-lg">Compagnie introuvable.</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto garage-dashboard-home">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      <h1 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
        <Truck className="w-5 h-5 text-slate-600" /> Tableau de bord
      </h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* KPIs uniquement */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Indicateurs</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-lg bg-slate-100">
                <div className="text-xl font-bold text-slate-800">{total}</div>
                <div className="text-xs text-slate-600">Total véhicules</div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50">
                <div className="text-xl font-bold text-emerald-700">{available}</div>
                <div className="text-xs text-emerald-800">Disponibles</div>
              </div>
              <div className="p-3 rounded-lg bg-blue-50">
                <div className="text-xl font-bold text-blue-700">{inTransit}</div>
                <div className="text-xs text-blue-800">En transit</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50">
                <div className="text-xl font-bold text-amber-700">{maintenance}</div>
                <div className="text-xs text-amber-800">Maintenance</div>
              </div>
              <div className="p-3 rounded-lg bg-red-50">
                <div className="text-xl font-bold text-red-700">{accidented}</div>
                <div className="text-xs text-red-800">Accidentés</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-200">
                <div className="text-xl font-bold text-slate-700">{horsService}</div>
                <div className="text-xs text-slate-700">Hors service</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              <Link
                to={`/compagnie/${companyId}/garage/fleet`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
                style={{ backgroundColor: theme.secondary }}
              >
                Voir la liste flotte →
              </Link>
            </p>
          </section>

          {/* Alertes (assurance, contrôle, vignette ≤ 30 jours) */}
          {alerts.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Alertes (expiration sous 30 jours)
              </h2>
              <ul className="space-y-2">
                {alerts.slice(0, 15).map((a, i) => (
                  <li
                    key={`${a.plateNumber}-${a.type}-${i}`}
                    className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900"
                  >
                    <span className="font-medium">{a.plateNumber}</span>
                    <span>{a.label}</span>
                    <span>
                      {a.daysLeft === 0 ? "expire aujourd'hui" : a.daysLeft === 1 ? "expire demain" : `expire dans ${a.daysLeft} jours`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Activité récente */}
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Dernières mises à jour</h2>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune activité récente.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentActivity.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 text-slate-600">
                    <span className="font-medium text-slate-800">{v.plateNumber}</span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs ${STATUS_BADGE_CLASS[v.status] ?? ""}`}>
                      {v.operationalStatus === "EN_TRANSIT" ? "En transit" : v.technicalStatus === "MAINTENANCE" ? "Maintenance" : v.technicalStatus === "ACCIDENTE" ? "Accidenté" : v.technicalStatus === "HORS_SERVICE" ? "Hors service" : "Disponible"}
                    </span>
                    <span>
                      {v.updatedAt && toDate(v.updatedAt)
                        ? format(toDate(v.updatedAt)!, "dd/MM/yyyy HH:mm", { locale: fr })
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              <Link
                to={`/compagnie/${companyId}/garage/fleet`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
                style={{ backgroundColor: theme.secondary }}
              >
                Voir la liste flotte →
              </Link>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
