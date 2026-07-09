import React from "react";
import { ArrowLeft, Building2, Package, Route as RouteIcon, Ticket, TrendingUp } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageHeader, StandardLayoutWrapper } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { NetworkActivityPeriodBar } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkActivityPeriodBar";
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import { parseCommercialActivityLog } from "@/modules/compagnie/networkStats/activityCore";
import { getEndOfDayInBamako, getStartOfDayInBamako } from "@/shared/date/dateUtilsTz";

type RouteRow = {
  trajet: string;
  revenue: number;
  tickets: number;
  parcels: number;
  agencies: Set<string>;
  events: Array<{ label: string; amount: number; agencyId: string; createdAt: Date | null }>;
};

const routeKeyFromData = (data: Record<string, unknown>) => {
  const depart = String(data.depart || data.departure || "").trim();
  const arrivee = String(data.arrivee || data.destination || data.arrival || "").trim();
  if (!depart && !arrivee) return "Trajet non renseigne";
  return `${depart || "?"} -> ${arrivee || "?"}`;
};

const RoutePerformancePage: React.FC = () => {
  const { companyId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const period = useGlobalPeriodContext();
  const selectedRoute = searchParams.get("route") || "";
  const [routes, setRoutes] = React.useState<RouteRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    queryActivityLogsInRange(companyId, getStartOfDayInBamako(period.startDate), getEndOfDayInBamako(period.endDate))
      .then((docs) => {
        if (cancelled) return;
        const map = new Map<string, RouteRow>();
        for (const doc of docs) {
          const data = doc.data() as Record<string, unknown>;
          const parsed = parseCommercialActivityLog(data);
          if (!parsed) continue;
          const trajet = routeKeyFromData(data);
          const current =
            map.get(trajet) ||
            {
              trajet,
              revenue: 0,
              tickets: 0,
              parcels: 0,
              agencies: new Set<string>(),
              events: [],
            };
          current.revenue += parsed.amount;
          current.agencies.add(parsed.agencyId);
          if (parsed.kind === "courier") current.parcels += 1;
          else current.tickets += parsed.seats || 1;
          current.events.push({
            label: parsed.kind === "courier" ? "Colis enregistre" : parsed.kind === "online_ticket" ? "Billet digital" : "Billet guichet",
            amount: parsed.amount,
            agencyId: parsed.agencyId,
            createdAt: (data.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() || null,
          });
          map.set(trajet, current);
        }
        setRoutes(Array.from(map.values()).sort((a, b) => b.revenue - a.revenue));
      })
      .catch(() => {
        if (!cancelled) setRoutes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, period.endDate, period.startDate]);

  const selected = routes.find((row) => row.trajet === selectedRoute) || routes[0] || null;

  React.useEffect(() => {
    if (selectedRoute || !selected) return;
    const next = new URLSearchParams(searchParams);
    next.set("route", selected.trajet);
    setSearchParams(next, { replace: true });
  }, [searchParams, selected, selectedRoute, setSearchParams]);

  const status =
    !selected || selected.revenue <= 0
      ? "A analyser"
      : selected.tickets + selected.parcels >= 50
        ? "Performant"
        : "Sous surveillance";

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Performance Trajet"
        breadcrumb={[{ label: "Performance Trajet" }]}
        subtitle={selected?.trajet || "Analyse trajet"}
        right={
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/reservations-reseau`)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Activite reseau
          </button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <NetworkActivityPeriodBar
          preset={period.preset}
          startDate={period.startDate}
          endDate={period.endDate}
          setPreset={period.setPreset}
          setCustomRange={period.setCustomRange}
        />
        <select
          value={selected?.trajet || ""}
          onChange={(e) => {
            const next = new URLSearchParams(searchParams);
            next.set("route", e.target.value);
            setSearchParams(next);
          }}
          className="min-w-[280px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
        >
          {routes.map((route) => (
            <option key={route.trajet} value={route.trajet}>
              {route.trajet}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-600">
          Chargement de la performance trajet...
        </div>
      ) : !selected ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-sm text-gray-600">
          Aucune activite trajet disponible sur cette periode.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-gray-200 bg-white p-4 xl:col-span-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <RouteIcon className="h-4 w-4" />
                Trajet
              </div>
              <p className="mt-3 break-words text-xl font-semibold text-gray-950">{selected.trajet}</p>
              <p className="mt-1 text-xs text-gray-500">Analyse consolidee de l'axe.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <TrendingUp className="h-4 w-4" />
                CA
              </div>
              <p className="mt-3 text-2xl font-semibold text-gray-950">{money(selected.revenue)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <Ticket className="h-4 w-4" />
                Billets
              </div>
              <p className="mt-3 text-2xl font-semibold text-gray-950">{selected.tickets}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <Package className="h-4 w-4" />
                Colis
              </div>
              <p className="mt-3 text-2xl font-semibold text-gray-950">{selected.parcels}</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.65fr)]">
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-gray-950">Historique recent</h2>
              <div className="mt-4 space-y-3">
                {selected.events
                  .slice()
                  .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
                  .slice(0, 10)
                  .map((event, index) => (
                    <div key={`${event.label}-${index}`} className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{event.label}</p>
                        <p className="text-xs text-gray-500">
                          Agence {event.agencyId} - {event.createdAt ? event.createdAt.toLocaleString("fr-FR") : "date non renseignee"}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-gray-950">{money(event.amount)}</p>
                    </div>
                  ))}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Building2 className="h-4 w-4" />
                  Agences concernees
                </div>
                <p className="mt-3 text-2xl font-semibold text-gray-950">{selected.agencies.size}</p>
                <p className="mt-1 text-sm text-gray-600">Statut: {status}.</p>
              </section>
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-gray-950">Decision</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Utiliser ce detail pour confirmer l'axe depuis Activite reseau. Le remplissage detaille depend des donnees de planning/capacite disponibles dans les agregats existants.
                </p>
              </section>
            </aside>
          </div>
        </div>
      )}
    </StandardLayoutWrapper>
  );
};

export default RoutePerformancePage;
