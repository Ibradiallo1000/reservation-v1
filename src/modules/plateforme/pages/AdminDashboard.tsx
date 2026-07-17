import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import {
  Activity,
  Building2,
  CreditCard,
  Gauge,
  AlertTriangle,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { PageErrorState, PageOfflineState } from "@/shared/ui/PageStates";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import {
  formatDate,
  getCompanyUsageRatio,
  mergeAdminPlansConfig,
  normalizeCompanyRecord,
  planLabel,
  type AdminCompanyRecord,
} from "./adminBusinessUtils";
import type { SystemPlansConfig } from "./systemPlansConfig";
import {
  DashboardEmptyState,
  DashboardKpi,
  DashboardSection,
  DashboardSkeleton,
} from "@/components/dashboard/DashboardPrimitives";
import {
  selectPlatformDashboard,
  type PlatformSubscriptionRequest,
} from "@/modules/plateforme/dashboard/platformDashboardSelectors";

export default function AdminDashboard() {
  const isOnline = useOnlineStatus();
  const [companies, setCompanies] = useState<AdminCompanyRecord[]>([]);
  const [plans, setPlans] = useState<SystemPlansConfig>(mergeAdminPlansConfig(null));
  const [requests, setRequests] = useState<PlatformSubscriptionRequest[]>([]);
  const [companiesReady, setCompaniesReady] = useState(false);
  const [plansReady, setPlansReady] = useState(false);
  const [requestsReady, setRequestsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offCompanies = onSnapshot(
      query(collection(db, "companies"), orderBy("nom", "asc")),
      (snap) => {
        setCompanies(snap.docs.map((companyDoc) => normalizeCompanyRecord(companyDoc.id, companyDoc.data())));
        setCompaniesReady(true);
      },
      (snapshotError) => {
        console.error("[AdminDashboard] companies snapshot failed", snapshotError);
        setCompanies([]);
        setCompaniesReady(true);
        setError("Impossible de charger les compagnies.");
      }
    );

    const offPlans = onSnapshot(
      doc(db, "adminSettings", "plans"),
      (snap) => {
        setPlans(mergeAdminPlansConfig(snap.exists() ? snap.data() : null));
        setPlansReady(true);
      },
      (snapshotError) => {
        console.error("[AdminDashboard] plans snapshot failed", snapshotError);
        setPlans(mergeAdminPlansConfig(null));
        setPlansReady(true);
      }
    );

    const offRequests = onSnapshot(
      collection(db, "subscriptionRequests"),
      (snap) => {
        setRequests(
          snap.docs.map((requestDoc) => {
            const data = requestDoc.data() as Record<string, unknown>;
            return {
              id: requestDoc.id,
              companyId: String(data.companyId ?? ""),
              status: String(data.status ?? "pending"),
            };
          })
        );
        setRequestsReady(true);
      },
      (snapshotError) => {
        console.error("[AdminDashboard] requests snapshot failed", snapshotError);
        setRequests([]);
        setRequestsReady(true);
      }
    );

    return () => {
      offCompanies();
      offPlans();
      offRequests();
    };
  }, []);

  const loading = !companiesReady || !plansReady || !requestsReady;

  const metrics = useMemo(() => selectPlatformDashboard(companies, plans, requests), [companies, plans, requests]);

  if (loading) {
    return <DashboardSkeleton label="Chargement de la vue d’ensemble de la plateforme" />;
  }

  return (
    <main className="space-y-4 pb-5">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: les indicateurs temps reel peuvent etre incomplets." />
      )}
      {error && <PageErrorState message={error} onRetry={() => window.location.reload()} />}

      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            Vue d’ensemble de la plateforme
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            État des compagnies, abonnements et volumes réellement enregistrés.
          </p>
        </div>
        <Link to="/admin/compagnies" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
          Voir les compagnies
        </Link>
      </header>

      <section aria-label="Indicateurs essentiels" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <DashboardKpi
          label="Compagnies"
          value={metrics.totalCompanies.toLocaleString("fr-FR")}
          context={`${metrics.activeCompanies.toLocaleString("fr-FR")} actives`}
          icon={Building2}
        />
        <DashboardKpi
          label="Revenu mensuel"
          value={formatCurrency(metrics.mrr)}
          context="Plans facturables configurés"
          icon={CreditCard}
        />
        <DashboardKpi
          label="Opérations du mois"
          value={metrics.totalOperations.toLocaleString("fr-FR")}
          context="Compteurs déclarés par les compagnies"
          icon={Activity}
        />
        <DashboardKpi
          label="À surveiller"
          value={metrics.companiesNearLimit.length.toLocaleString("fr-FR")}
          context={`${metrics.pendingRequests.toLocaleString("fr-FR")} demande(s) d’abonnement en attente`}
          icon={Gauge}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <DashboardSection title="Compagnies" description="Utilisation mensuelle des six compagnies les plus actives.">
          {metrics.companiesByUsage.length === 0 ? (
            <DashboardEmptyState title="Aucune compagnie" description="Aucune compagnie n’est enregistrée sur la plateforme." />
          ) : (
            <div className="divide-y divide-slate-100">
              {metrics.companiesByUsage.map((company) => {
                const ratio = getCompanyUsageRatio(company, plans);
                return (
                  <Link key={company.id} to={`/admin/compagnies/${company.id}/modifier`} className="grid min-h-16 gap-2 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-950">{company.name}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{planLabel(company.plan)}</span>
                        {company.status.toLowerCase() === "inactif" ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Inactive</span> : null}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label={`${Math.round(ratio * 100)} % du quota utilisé`}>
                        <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-slate-600">{company.currentMonthOperations.toLocaleString("fr-FR")} opérations</span>
                  </Link>
                );
              })}
            </div>
          )}
        </DashboardSection>

        <div className="space-y-4">
          <DashboardSection title="Points d’attention" description="Signaux administratifs issus des données existantes.">
            {metrics.inactiveCompanies.length === 0 && metrics.companiesNearLimit.length === 0 && metrics.pendingRequests === 0 ? (
              <DashboardEmptyState title="Aucun signal actif" description="Aucune compagnie inactive, quota sous tension ou demande en attente." />
            ) : (
              <ul className="space-y-2 text-sm">
                {metrics.inactiveCompanies.map((company) => <li key={company.id} className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><strong>{company.name}</strong> est inactive.</span></li>)}
                {metrics.companiesNearLimit.slice(0, 3).map((company) => <li key={company.id} className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"><Gauge className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span><strong>{company.name}</strong> approche son quota.</span></li>)}
                {metrics.pendingRequests > 0 ? <li className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-orange-900"><Link to="/admin/subscriptions" className="font-semibold underline underline-offset-2">{metrics.pendingRequests} demande(s) d’abonnement à consulter</Link></li> : null}
              </ul>
            )}
          </DashboardSection>

          <DashboardSection title="Nouvelles compagnies" description="Créations les plus récentes.">
            {metrics.recentCompanies.length === 0 ? <DashboardEmptyState title="Aucun onboarding récent" description="La date de création n’est disponible pour aucune compagnie." /> : (
              <ul className="divide-y divide-slate-100">
                {metrics.recentCompanies.map((company) => <li key={company.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="truncate font-semibold text-slate-900">{company.name}</span><time className="shrink-0 text-xs text-slate-500">{formatDate(company.createdAt)}</time></li>)}
              </ul>
            )}
          </DashboardSection>
        </div>
      </div>
    </main>
  );
}
