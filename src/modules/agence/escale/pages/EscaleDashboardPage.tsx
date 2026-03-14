/**
 * Tableau de bord escale — Agent d'escale (escale_agent).
 * Affiche les bus à venir aujourd'hui, heure de passage à l'escale, places restantes, bouton vente billet.
 */
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, EmptyState, table } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getRoute } from "@/modules/compagnie/routes/routesService";
import { CashSummaryCard } from "@/modules/compagnie/cash/CashSummaryCard";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import { listTripInstancesByRouteIdAndDate } from "@/modules/compagnie/tripInstances/tripInstanceService";
import type { RouteDocWithId } from "@/modules/compagnie/routes/routesTypes";
import type { RouteStopDocWithId } from "@/modules/compagnie/routes/routesTypes";
import type { TripInstanceDocWithId } from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import { Bus, Ticket, Loader2, MapPin, Users } from "lucide-react";

function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutesToAdd;
  const h2 = Math.floor(total / 60) % 24;
  const m2 = total % 60;
  return `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
}

export default function EscaleDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const [agencyType, setAgencyType] = useState<string | null>(null);
  const [agencyRouteId, setAgencyRouteId] = useState<string | null>(null);
  const [agencyStopOrder, setAgencyStopOrder] = useState<number | null>(null);
  const [route, setRoute] = useState<RouteDocWithId | null>(null);
  const [stop, setStop] = useState<RouteStopDocWithId | null>(null);
  const [instances, setInstances] = useState<TripInstanceDocWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const load = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) {
      setLoading(false);
      setError("Session invalide.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const agencyRef = doc(db, "companies", user.companyId, "agences", user.agencyId);
      const agencySnap = await getDoc(agencyRef);
      if (!agencySnap.exists()) {
        setError("Agence introuvable.");
        setLoading(false);
        return;
      }
      const ad = agencySnap.data() as { type?: string; routeId?: string; stopOrder?: number; stopId?: string };
      const typ = (ad.type ?? "principale").toLowerCase();
      setAgencyType(typ);
      const routeId = ad.routeId ?? null;
      const stopOrder = ad.stopOrder ?? null;
      setAgencyRouteId(routeId);
      setAgencyStopOrder(stopOrder);

      if (typ !== "escale" || !routeId) {
        setError("Cette agence n'est pas configurée en escale (type=escale, routeId et stopOrder requis).");
        setLoading(false);
        return;
      }

      const routeDoc = await getRoute(user.companyId, routeId);
      setRoute(routeDoc ?? null);
      if (!routeDoc) {
        setError("Route introuvable.");
        setLoading(false);
        return;
      }

      const stops = await getRouteStops(user.companyId, routeId);
      const myStop = stopOrder != null ? stops.find((s) => s.order === stopOrder) : null;
      setStop(myStop ?? null);
      if (!myStop) {
        setError("Escale (stopOrder) introuvable sur cette route.");
        setLoading(false);
        return;
      }

      const list = await listTripInstancesByRouteIdAndDate(user.companyId, routeId, today);
      setInstances(list);
    } catch (e: any) {
      setError(e?.message ?? "Erreur de chargement.");
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId, today]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = instances.map((ti) => {
    const capacity = (ti as any).seatCapacity ?? (ti as any).capacitySeats ?? 0;
    const reserved = (ti as any).reservedSeats ?? 0;
    const remaining = capacity - reserved;
    const departureTime = (ti as any).departureTime ?? "";
    const offsetMin = stop?.estimatedArrivalOffsetMinutes ?? 0;
    const timeAtStop = addMinutesToTime(departureTime, offsetMin);
    const origin = (ti as any).departureCity ?? (ti as any).routeDeparture ?? "";
    const dest = (ti as any).arrivalCity ?? (ti as any).routeArrival ?? "";
    return {
      id: ti.id,
      origin,
      dest,
      departureTime,
      timeAtStop,
      remaining,
      capacity,
      status: (ti as any).status,
    };
  });

  const handleVendreBillet = (tripInstanceId: string) => {
    navigate("/agence/guichet", {
      state: {
        fromEscale: true,
        tripInstanceId,
        routeId: agencyRouteId,
        stopOrder: agencyStopOrder,
        originEscaleCity: stop?.city ?? undefined,
      },
    });
  };

  if (loading) {
    return (
      <StandardLayoutWrapper>
        <div className="flex items-center justify-center gap-2 text-gray-500 py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
          Chargement…
        </div>
      </StandardLayoutWrapper>
    );
  }

  if (error) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Tableau de bord escale" icon={MapPin} />
        <SectionCard title="Configuration">
          <p className="text-amber-600 dark:text-amber-400">{error}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Une agence de type &quot;escale&quot; doit avoir les champs routeId et stopOrder (ordre de l&apos;escale sur la route).
          </p>
        </SectionCard>
      </StandardLayoutWrapper>
    );
  }

  const canManageTeam = (user?.role === "escale_manager" || user?.role === "chefAgence") && user?.companyId && user?.agencyId;

  return (
    <StandardLayoutWrapper>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <PageHeader
          title="Tableau de bord escale"
          subtitle={stop ? `${stop.city} (ordre ${stop.order}) — ${route?.origin ?? ""} → ${route?.destination ?? ""}` : "Escale"}
          icon={Bus}
        />
        {canManageTeam && (
          <Link
            to="/agence/team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            <Users className="w-4 h-4" />
            Équipe
          </Link>
        )}
      </div>

      {user?.companyId && user?.agencyId && (
        <div className="mb-6">
          <CashSummaryCard
            companyId={user.companyId}
            locationId={user.agencyId}
            locationType="escale"
            canClose={true}
            createdBy={user?.uid ?? ""}
            formatCurrency={money}
          />
        </div>
      )}

      <SectionCard title={`Bus à venir aujourd'hui (${today})`} noPad>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState message="Aucun bus prévu aujourd'hui pour cette escale." />
          </div>
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Trajet</th>
                  <th className={table.th}>Départ origine</th>
                  <th className={table.th}>Passage escale</th>
                  <th className={table.th}>Places restantes</th>
                  <th className={table.th + " w-32 text-right"}>Action</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className={table.td}>
                      {r.origin} → {r.dest}
                    </td>
                    <td className={table.td}>{r.departureTime}</td>
                    <td className={table.td}>{r.timeAtStop}</td>
                    <td className={table.td}>
                      <span className={r.remaining <= 0 ? "text-red-600" : r.remaining <= 10 ? "text-amber-600" : "text-gray-700 dark:text-gray-300"}>
                        {r.remaining} / {r.capacity}
                      </span>
                    </td>
                    <td className={table.td + " text-right"}>
                      <ActionButton
                        onClick={() => handleVendreBillet(r.id)}
                        disabled={r.remaining <= 0 || r.status === "cancelled"}
                        title={r.remaining <= 0 ? "Complet" : "Vendre un billet"}
                      >
                        <Ticket className="w-4 h-4" />
                        Vendre billet
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
