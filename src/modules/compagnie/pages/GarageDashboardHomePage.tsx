// Phase 1F/1G — Tableau de bord Garage : KPIs, activité récente, alertes. Thème compagnie.
import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { StandardLayoutWrapper, PageHeader, MetricCard, SectionCard, StatusBadge } from "@/ui";
import type { StatusVariant } from "@/ui";
import { listVehicles } from "@/modules/compagnie/fleet/vehiclesService";
import { TECHNICAL_STATUS, OPERATIONAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import { useGarageTheme } from "@/modules/compagnie/layout/GarageThemeContext";
import { Truck, Loader2, AlertTriangle, Car, Wrench, AlertCircle, Ban } from "lucide-react";
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

function statusToVariant(status: string): StatusVariant {
  switch (status) {
    case "EN_SERVICE": return "success";
    case "EN_TRANSIT": return "info";
    case "EN_MAINTENANCE": return "warning";
    case "ACCIDENTE": return "danger";
    case "HORS_SERVICE": return "neutral";
    default: return "neutral";
  }
}

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
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Tableau de bord — Garage" />
        <p className="text-slate-600">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper className="garage-dashboard-home">
      <PageHeader title="Tableau de bord — Garage" icon={Truck} />
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <SectionCard title="Indicateurs" icon={Truck}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard label="Total véhicules" value={total} icon={Truck} />
              <MetricCard label="Disponibles" value={available} icon={Car} valueColorVar="#047857" />
              <MetricCard label="En transit" value={inTransit} icon={Truck} valueColorVar="#1d4ed8" />
              <MetricCard label="Maintenance" value={maintenance} icon={Wrench} valueColorVar="#b45309" />
              <MetricCard label="Accidentés" value={accidented} icon={AlertCircle} critical />
              <MetricCard label="Hors service" value={horsService} icon={Ban} valueColorVar="#475569" />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              <Link
                to={`/compagnie/${companyId}/garage/fleet`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
                style={{ backgroundColor: theme.secondary }}
              >
                Voir la liste flotte →
              </Link>
            </p>
          </SectionCard>

          {alerts.length > 0 && (
            <SectionCard title="Alertes (expiration sous 30 jours)" icon={AlertTriangle}>
              <ul className="space-y-2">
                {alerts.slice(0, 15).map((a, i) => (
                  <li key={`${a.plateNumber}-${a.type}-${i}`} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 text-sm text-gray-800 dark:text-slate-200">
                    <span className="font-medium">{a.plateNumber}</span>
                    <span>{a.label}</span>
                    <StatusBadge status={a.daysLeft <= 1 ? "danger" : "warning"}>
                      {a.daysLeft === 0 ? "expire aujourd'hui" : a.daysLeft === 1 ? "expire demain" : `expire dans ${a.daysLeft} jours`}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <SectionCard title="Dernières mises à jour" icon={Car}>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune activité récente.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentActivity.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 text-slate-600">
                    <span className="font-medium text-slate-800">{v.plateNumber}</span>
                    <StatusBadge status={statusToVariant(v.status)}>
                      {v.operationalStatus === "EN_TRANSIT" ? "En transit" : v.technicalStatus === "MAINTENANCE" ? "Maintenance" : v.technicalStatus === "ACCIDENTE" ? "Accidenté" : v.technicalStatus === "HORS_SERVICE" ? "Hors service" : "Disponible"}
                    </StatusBadge>
                    <span>
                      {v.updatedAt && toDate(v.updatedAt)
                        ? format(toDate(v.updatedAt)!, "dd/MM/yyyy HH:mm", { locale: fr })
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-slate-500">
              <Link
                to={`/compagnie/${companyId}/garage/fleet`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90 transition"
                style={{ backgroundColor: theme.secondary }}
              >
                Voir la liste flotte →
              </Link>
            </p>
          </SectionCard>
        </>
      )}
    </StandardLayoutWrapper>
  );
}
