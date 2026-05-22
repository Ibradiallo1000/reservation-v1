import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CreditCard,
  Gauge,
  Layers3,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import {
  formatDate,
  getCompanyPlanConfig,
  getCompanyUsageRatio,
  isCompanyBillable,
  mergeAdminPlansConfig,
  normalizeCompanyRecord,
  planLabel,
  type AdminCompanyRecord,
} from "./adminBusinessUtils";
import type { SystemPlansConfig } from "./systemPlansConfig";

type SubscriptionRequest = {
  id: string;
  companyId: string;
  status: string;
};

type KpiCardProps = {
  title: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

function KpiCard({ title, value, hint, icon: Icon }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{hint}</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const isOnline = useOnlineStatus();
  const [companies, setCompanies] = useState<AdminCompanyRecord[]>([]);
  const [plans, setPlans] = useState<SystemPlansConfig>(mergeAdminPlansConfig(null));
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
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

  const metrics = useMemo(() => {
    const activeCompanies = companies.filter((company) => company.status !== "inactif");
    const billableCompanies = companies.filter((company) => isCompanyBillable(company));
    const premiumCompanies = companies.filter((company) => company.plan === "premium");
    const totalOperations = companies.reduce(
      (sum, company) => sum + company.currentMonthOperations,
      0
    );
    const mrr = billableCompanies.reduce((sum, company) => {
      return sum + getCompanyPlanConfig(plans, company.plan).price;
    }, 0);
    const pendingRequests = requests.filter((request) => request.status === "pending").length;
    const nearLimitCount = companies.filter((company) => getCompanyUsageRatio(company, plans) >= 0.8).length;

    const topUsageCompanies = [...companies]
      .sort((a, b) => b.currentMonthOperations - a.currentMonthOperations)
      .slice(0, 6)
      .map((company) => {
        const planConfig = getCompanyPlanConfig(plans, company.plan);
        const usageRatio = getCompanyUsageRatio(company, plans);
        return {
          ...company,
          usageRatio,
          includedOperations: planConfig.includedOperations,
          monthlyPrice: planConfig.price,
        };
      });

    const recentCompanies = [...companies]
      .filter((company) => company.createdAt)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, 5);

    return {
      totalCompanies: companies.length,
      activeCompanies: activeCompanies.length,
      premiumCompanies: premiumCompanies.length,
      totalOperations,
      mrr,
      pendingRequests,
      nearLimitCount,
      averageOperations:
        activeCompanies.length > 0 ? Math.round(totalOperations / activeCompanies.length) : 0,
      topUsageCompanies,
      recentCompanies,
    };
  }, [companies, plans, requests]);

  if (loading) {
    return <PageLoadingState blocks={3} />;
  }

  return (
    <div className="space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: les indicateurs temps reel peuvent etre incomplets." />
      )}
      {error && <PageErrorState message={error} onRetry={() => window.location.reload()} />}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            Dashboard plateforme
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pilotage global des compagnies, abonnements et operations facturees.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.location.assign("/admin/compagnies")}>
            Gerer les compagnies
          </Button>
          <Button size="sm" onClick={() => window.location.assign("/admin/subscriptions")}>
            Voir les demandes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Compagnies clientes"
          value={metrics.totalCompanies.toLocaleString("fr-FR")}
          hint={`${metrics.activeCompanies.toLocaleString("fr-FR")} actives sur la plateforme`}
          icon={Building2}
        />
        <KpiCard
          title="MRR"
          value={formatCurrency(metrics.mrr)}
          hint={`${metrics.premiumCompanies.toLocaleString("fr-FR")} compagnies en Premium`}
          icon={CreditCard}
        />
        <KpiCard
          title="Operations du mois"
          value={metrics.totalOperations.toLocaleString("fr-FR")}
          hint={`${metrics.averageOperations.toLocaleString("fr-FR")} operations en moyenne par compagnie active`}
          icon={Activity}
        />
        <KpiCard
          title="Quota sous tension"
          value={metrics.nearLimitCount.toLocaleString("fr-FR")}
          hint={`${metrics.pendingRequests.toLocaleString("fr-FR")} demandes d'upgrade en attente`}
          icon={Gauge}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Compagnies a plus forte utilisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {metrics.topUsageCompanies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Aucune compagnie trouvee.
              </div>
            ) : (
              metrics.topUsageCompanies.map((company) => {
                const progress = Math.max(6, Math.round(company.usageRatio * 100));
                const progressTone =
                  company.usageRatio >= 0.8
                    ? "bg-orange-500"
                    : company.usageRatio >= 0.5
                      ? "bg-sky-500"
                      : "bg-emerald-500";

                return (
                  <div
                    key={company.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-950">
                            {company.name}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              company.plan === "premium"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {planLabel(company.plan)}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {company.currentMonthOperations.toLocaleString("fr-FR")} /{" "}
                          {company.includedOperations.toLocaleString("fr-FR")} operations
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatCurrency(company.monthlyPrice)} / mois
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${progressTone}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Mix produit</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm text-slate-500">STANDARD</div>
                <div className="mt-1 text-2xl font-black text-slate-950">
                  {(metrics.totalCompanies - metrics.premiumCompanies).toLocaleString("fr-FR")}
                </div>
              </div>
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="text-sm text-orange-700">PREMIUM</div>
                <div className="mt-1 text-2xl font-black text-orange-700">
                  {metrics.premiumCompanies.toLocaleString("fr-FR")}
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm text-amber-700">Demandes a traiter</div>
                <div className="mt-1 flex items-center gap-2 text-2xl font-black text-amber-700">
                  {metrics.pendingRequests.toLocaleString("fr-FR")}
                  <ArrowUpRight className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nouvelles compagnies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics.recentCompanies.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Aucun onboarding recent.
                </div>
              ) : (
                metrics.recentCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div>
                      <div className="font-semibold text-slate-950">{company.name}</div>
                      <div className="text-sm text-slate-500">{formatDate(company.createdAt)}</div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      <Layers3 className="h-3.5 w-3.5" />
                      {planLabel(company.plan)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
