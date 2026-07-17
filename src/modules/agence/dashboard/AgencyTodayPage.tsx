import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Bus, Radio, Ticket } from "lucide-react";
import { normalizeRole } from "@/authorization/roles";
import { hasCapability } from "@/authorization/capabilities";
import { useAuth } from "@/contexts/AuthContext";
import AuthorizationStatePage from "@/modules/auth/components/AuthorizationStatePage";
import { useAgencyActionCockpit } from "@/modules/agence/manager/domains/useAgencyActionCockpit";
import {
  DashboardEmptyState,
  DashboardKpi,
  DashboardSection,
  DashboardSkeleton,
} from "@/components/dashboard/DashboardPrimitives";
import { StandardLayoutWrapper } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  formatAgencyTodayDate,
  getAgencyQuickAccess,
  selectTodayDepartures,
} from "./agencyTodaySelectors";

type AgencyDashboardUser = {
  role?: unknown;
  companyId?: string;
  agencyId?: string;
  agencyName?: string;
  agencyNom?: string;
  agencyTimezone?: string;
};

function AgencyTodayContent({ user, role }: { user: AgencyDashboardUser; role: NonNullable<ReturnType<typeof normalizeRole>> }) {
  const money = useFormatCurrency();
  const { loading, liveActivity, liveTrips, alerts, operations, activePosts, summary } = useAgencyActionCockpit();
  const departures = useMemo(() => selectTodayDepartures(liveTrips), [liveTrips]);
  const quickAccess = useMemo(() => getAgencyQuickAccess(role), [role]);
  const guichetPosts = activePosts.filter((post) => post.kind === "guichet");
  const courierPosts = activePosts.filter((post) => post.kind === "courrier");
  const delayedDepartures = departures.filter((trip) => trip.attention);
  const timeZone = user.agencyTimezone || "Africa/Bamako";
  const agencyLabel = user.agencyName || user.agencyNom || "Agence";

  if (loading) return <DashboardSkeleton label="Chargement de l’activité de l’agence" />;

  return (
    <main className="space-y-4 pb-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">{agencyLabel}</p>
        <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">Aujourd’hui</h1>
        <p className="mt-1 text-sm text-slate-500">{formatAgencyTodayDate(new Date(), timeZone)}</p>
      </header>

      <section aria-label="Indicateurs du jour" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <DashboardKpi label="Départs" value={operations.departuresToday} context={`${operations.arrivalsExpected} arrivée(s) attendue(s)`} icon={Bus} />
        <DashboardKpi label="Billets" value={liveActivity.total.count} context="Ventes du jour consolidées" icon={Ticket} />
        <DashboardKpi label="Postes ouverts" value={activePosts.length} context={`${guichetPosts.length} guichet(s), ${courierPosts.length} courrier`} icon={Radio} />
        <DashboardKpi label="Points d’attention" value={alerts.length} context="Signaux calculés par les sources existantes" icon={AlertTriangle} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <DashboardSection title="Départs du jour" description="Consultation uniquement — les opérations restent dans leur module.">
          {departures.length === 0 ? (
            <DashboardEmptyState title="Aucun départ aujourd’hui" description="Le planning ne contient aucun départ pour cette agence et cette date." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {departures.slice(0, 8).map((trip) => (
                <li key={trip.id} className="grid gap-2 py-3 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center">
                  <time className="text-sm font-black tabular-nums text-slate-950">{trip.departureTime}</time>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{trip.routeLabel}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{trip.reservedSeats} / {trip.capacity} place(s) · {trip.statusLabel}</p>
                  </div>
                  <span className={`w-fit rounded-full px-2 py-1 text-[11px] font-semibold ${trip.attention ? "bg-rose-50 text-rose-700" : trip.confirmed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {trip.attention ? "En retard" : trip.confirmed ? "Confirmé" : "À suivre"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hasCapability(role, "agency.departures.manage") ? <Link to="/agence/validation-departs" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">Voir tous les départs <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link> : null}
        </DashboardSection>

        <DashboardSection title="Points d’attention" description="Alertes réelles de l’agence courante.">
          {alerts.length === 0 && delayedDepartures.length === 0 ? (
            <DashboardEmptyState title="Aucune anomalie" description="Aucun signal prioritaire n’est remonté actuellement." />
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 5).map((alert) => <li key={alert.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-950">{alert.title}</p><p className="mt-1 text-xs leading-5 text-amber-800">{alert.detail}</p></li>)}
            </ul>
          )}
        </DashboardSection>
      </div>

      <DashboardSection title="Activité opérationnelle" description="Synthèses en lecture seule des modules de l’agence.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Guichets</p><p className="mt-2 text-lg font-black text-slate-950">{guichetPosts.length} actif(s)</p><p className="mt-1 text-xs text-slate-500">{liveActivity.guichet.count} billet(s) aujourd’hui</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Réservations en ligne</p><p className="mt-2 text-lg font-black text-slate-950">{liveActivity.online.count}</p><p className="mt-1 text-xs text-slate-500">Confirmées ou payées selon le calcul existant</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Embarquement</p><p className="mt-2 text-sm font-bold text-slate-500">Donnée indisponible</p><p className="mt-1 text-xs text-slate-500">Aucun indicateur d’embarquement distinct n’est chargé par cette synthèse</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Courrier</p><p className="mt-2 text-lg font-black text-slate-950">{liveActivity.parcels.count}</p><p className="mt-1 text-xs text-slate-500">{courierPosts.length} session(s) ouverte(s)</p></div>
        </div>
        {hasCapability(role, "agency.cash.read") ? <p className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">Activité commerciale visible en synthèse : <strong className="text-slate-900">{money(summary.totalSales)}</strong>. Les validations et mutations restent réservées au module comptable.</p> : null}
      </DashboardSection>

      <DashboardSection title="Accès rapides" description="Destinations canoniques autorisées par les capacités Phase 4.">
        <nav aria-label="Accès rapides agence" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {quickAccess.map((item) => <Link key={item.to} to={item.to} className="inline-flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"><span>{item.label}</span><ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>)}
        </nav>
      </DashboardSection>
    </main>
  );
}

export default function AgencyTodayPage() {
  const { user } = useAuth() as { user?: AgencyDashboardUser | null };
  const role = normalizeRole(Array.isArray(user?.role) ? user?.role[0] : user?.role);
  if (!user) return <AuthorizationStatePage state="access_denied" />;
  if (!role) return <AuthorizationStatePage state="unknown_role" />;
  if (!user.companyId) return <AuthorizationStatePage state="missing_company" />;
  if (!user.agencyId) return <AuthorizationStatePage state="missing_agency" />;
  if (!hasCapability(role, "agency.dashboard.view")) return <AuthorizationStatePage state="access_denied" />;

  return <StandardLayoutWrapper><AgencyTodayContent user={user} role={role} /></StandardLayoutWrapper>;
}
