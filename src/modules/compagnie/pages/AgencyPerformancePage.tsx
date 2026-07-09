import React from "react";
import { collection, getDocs } from "firebase/firestore";
import { ArrowLeft, Building2, Route, TrendingUp, WalletCards } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { db } from "@/firebaseConfig";
import { PageHeader, StandardLayoutWrapper } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { NetworkActivityPeriodBar } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkActivityPeriodBar";
import { getAgencyStats, type AgencyStats } from "@/modules/compagnie/networkStats/networkStatsService";
import { TZ_BAMAKO } from "@/shared/date/dateUtilsTz";

type Agency = {
  id: string;
  nom: string;
  ville?: string;
  pays?: string;
};

const statusFor = (stats: AgencyStats | null) => {
  if (!stats || stats.totalRevenue <= 0) return { label: "A accompagner", tone: "amber" };
  if (stats.totalTickets >= 50 || stats.totalRevenue >= 1_000_000) return { label: "Excellent", tone: "emerald" };
  return { label: "Stable", tone: "blue" };
};

const toneClass: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
};

const AgencyPerformancePage: React.FC = () => {
  const { companyId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const period = useGlobalPeriodContext();

  const agencyId = searchParams.get("agency") || "";
  const [agencies, setAgencies] = React.useState<Agency[]>([]);
  const [stats, setStats] = React.useState<AgencyStats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const snap = await getDocs(collection(db, "companies", companyId, "agences"));
      if (cancelled) return;
      setAgencies(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            nom: String(data.nomAgence || data.nom || data.ville || "Agence"),
            ville: data.ville ? String(data.ville) : undefined,
            pays: data.pays ? String(data.pays) : undefined,
          };
        }),
      );
    })().catch(() => {
      if (!cancelled) setAgencies([]);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  React.useEffect(() => {
    if (!companyId || !agencyId) {
      setStats(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getAgencyStats(companyId, agencyId, period.startDate, period.endDate, TZ_BAMAKO)
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agencyId, companyId, period.endDate, period.startDate]);

  const selectedAgency = agencies.find((a) => a.id === agencyId);
  const status = statusFor(stats);
  const onlineShare = stats?.totalTickets ? Math.round((stats.onlineTickets / stats.totalTickets) * 100) : 0;
  const counterShare = stats?.totalTickets ? Math.round((stats.counterTickets / stats.totalTickets) * 100) : 0;

  const chooseAgency = (nextAgencyId: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextAgencyId) next.set("agency", nextAgencyId);
    else next.delete("agency");
    setSearchParams(next);
  };

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Performance Agence"
        breadcrumb={[{ label: "Performance Agence" }]}
        subtitle={selectedAgency ? `${selectedAgency.nom}${selectedAgency.ville ? ` - ${selectedAgency.ville}` : ""}` : "Analyse agence"}
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
          value={agencyId}
          onChange={(e) => chooseAgency(e.target.value)}
          className="min-w-[260px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
        >
          <option value="">Selectionner une agence</option>
          {agencies.map((agency) => (
            <option key={agency.id} value={agency.id}>
              {agency.nom}
            </option>
          ))}
        </select>
      </div>

      {!agencyId ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-10 text-center text-sm text-gray-600">
          Selectionnez une agence pour consulter sa performance.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <WalletCards className="h-4 w-4" />
                Chiffre d'affaires
              </div>
              <p className="mt-3 text-2xl font-semibold text-gray-950">{loading ? "..." : money(stats?.totalRevenue || 0)}</p>
              <p className="mt-1 text-xs text-gray-500">Activite consolidee de l'agence.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <TrendingUp className="h-4 w-4" />
                Billets
              </div>
              <p className="mt-3 text-2xl font-semibold text-gray-950">{loading ? "..." : stats?.totalTickets || 0}</p>
              <p className="mt-1 text-xs text-gray-500">Guichet {stats?.counterTickets || 0} - Digital {stats?.onlineTickets || 0}.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <Building2 className="h-4 w-4" />
                Canal dominant
              </div>
              <p className="mt-3 text-2xl font-semibold text-gray-950">
                {onlineShare > counterShare ? "Digital" : "Guichet"}
              </p>
              <p className="mt-1 text-xs text-gray-500">Guichet {counterShare}% - Digital {onlineShare}%.</p>
            </div>
            <div className={`rounded-xl border p-4 ${toneClass[status.tone]}`}>
              <div className="text-sm font-medium">Statut</div>
              <p className="mt-3 text-2xl font-semibold">{status.label}</p>
              <p className="mt-1 text-xs">Decision: suivre dans Activite reseau.</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.55fr)]">
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">Activite et historique</h2>
                  <p className="text-sm text-gray-500">Evolution issue des agrégats commerciaux existants.</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(stats?.dailyChartData || []).slice(-6).map((point) => (
                  <div key={point.date} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-800">{point.date}</p>
                    <p className="text-xs text-gray-500">{point.reservations} reservations</p>
                    <p className="mt-1 text-sm font-semibold text-gray-950">{money(point.revenue)}</p>
                  </div>
                ))}
                {!loading && (stats?.dailyChartData || []).length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                    Aucun historique disponible sur la periode.
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-gray-950">Finance</h2>
                <p className="mt-2 text-sm text-gray-600">
                  La synthese financiere detaillee par agence n'est pas exposee ici par un agregat dedie. Les montants affiches restent limites a l'activite commerciale consolidee.
                </p>
              </section>
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-gray-950">Trajets et recommandations</h2>
                <div className="mt-3 flex items-start gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  <Route className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Ouvrir Performance Trajet depuis Activite reseau pour analyser le detail par axe. Decision actuelle: conserver le suivi de cette agence dans le diagnostic reseau.
                  </p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}
    </StandardLayoutWrapper>
  );
};

export default AgencyPerformancePage;
