import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { AlertTriangle, CreditCard, DollarSign, Wallet } from "lucide-react";
import { db } from "@/firebaseConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import {
  formatDate,
  getCompanyPlanConfig,
  isCompanyBillable,
  mergeAdminPlansConfig,
  normalizeCompanyRecord,
  planLabel,
  type AdminCompanyRecord,
} from "./adminBusinessUtils";
import type { SystemPlansConfig } from "./systemPlansConfig";

type MetricTileProps = {
  title: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
};

function MetricTile({ title, value, hint, icon: Icon }: MetricTileProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-slate-500">{title}</div>
            <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</div>
            <div className="mt-2 text-sm text-slate-500">{hint}</div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminFinancesPage() {
  const isOnline = useOnlineStatus();
  const [companies, setCompanies] = useState<AdminCompanyRecord[]>([]);
  const [plans, setPlans] = useState<SystemPlansConfig>(mergeAdminPlansConfig(null));
  const [companiesReady, setCompaniesReady] = useState(false);
  const [plansReady, setPlansReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offCompanies = onSnapshot(
      query(collection(db, "companies"), orderBy("nom", "asc")),
      (snap) => {
        setCompanies(snap.docs.map((companyDoc) => normalizeCompanyRecord(companyDoc.id, companyDoc.data())));
        setCompaniesReady(true);
      },
      (snapshotError) => {
        console.error("[AdminFinancesPage] companies snapshot failed", snapshotError);
        setCompanies([]);
        setCompaniesReady(true);
        setError("Impossible de charger les abonnements.");
      }
    );

    const offPlans = onSnapshot(
      doc(db, "adminSettings", "plans"),
      (snap) => {
        setPlans(mergeAdminPlansConfig(snap.exists() ? snap.data() : null));
        setPlansReady(true);
      },
      (snapshotError) => {
        console.error("[AdminFinancesPage] plans snapshot failed", snapshotError);
        setPlans(mergeAdminPlansConfig(null));
        setPlansReady(true);
      }
    );

    return () => {
      offCompanies();
      offPlans();
    };
  }, []);

  const loading = !companiesReady || !plansReady;

  const billing = useMemo(() => {
    const rows = companies.map((company) => {
      const planConfig = getCompanyPlanConfig(plans, company.plan);
      return {
        ...company,
        monthlyAmount: planConfig.price,
      };
    });

    const billableRows = rows.filter((company) => isCompanyBillable(company));
    const mrr = billableRows.reduce((sum, company) => sum + company.monthlyAmount, 0);
    const totalPaymentsReceived = rows.reduce(
      (sum, company) => sum + company.totalPaymentsReceived,
      0
    );
    const standardMrr = billableRows
      .filter((company) => company.plan === "standard")
      .reduce((sum, company) => sum + company.monthlyAmount, 0);
    const premiumMrr = billableRows
      .filter((company) => company.plan === "premium")
      .reduce((sum, company) => sum + company.monthlyAmount, 0);
    const attentionCount = rows.filter((company) =>
      ["grace", "restricted", "suspended"].includes(company.subscriptionStatus)
    ).length;

    return {
      rows,
      mrr,
      totalPaymentsReceived,
      standardMrr,
      premiumMrr,
      activeSubscriptions: billableRows.length,
      attentionCount,
    };
  }, [companies, plans]);

  if (loading) {
    return <PageLoadingState blocks={3} />;
  }

  return (
    <div className="space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: les chiffres de facturation peuvent etre incomplets." />
      )}
      {error && <PageErrorState message={error} onRetry={() => window.location.reload()} />}

      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950">Facturation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pilotage des abonnements, MRR et paiements recus. Aucun revenu operationnel ici.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          title="MRR"
          value={formatCurrency(billing.mrr)}
          hint={`${billing.activeSubscriptions.toLocaleString("fr-FR")} abonnements facturables`}
          icon={DollarSign}
        />
        <MetricTile
          title="Paiements recus"
          value={formatCurrency(billing.totalPaymentsReceived)}
          hint="Cumul des paiements d'abonnement enregistres"
          icon={Wallet}
        />
        <MetricTile
          title="MRR Standard"
          value={formatCurrency(billing.standardMrr)}
          hint="Base recurrente STANDARD"
          icon={CreditCard}
        />
        <MetricTile
          title="Comptes a suivre"
          value={billing.attentionCount.toLocaleString("fr-FR")}
          hint="Grace, restreint ou suspendu"
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Repartition du MRR</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">STANDARD</div>
              <div className="mt-2 text-2xl font-black text-slate-950">
                {formatCurrency(billing.standardMrr)}
              </div>
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
              <div className="text-sm text-orange-700">PREMIUM</div>
              <div className="mt-2 text-2xl font-black text-orange-700">
                {formatCurrency(billing.premiumMrr)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-500">Paiement moyen cumule</div>
              <div className="mt-2 text-2xl font-black text-slate-950">
                {formatCurrency(
                  billing.rows.length > 0
                    ? Math.round(billing.totalPaymentsReceived / billing.rows.length)
                    : 0
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Abonnements par compagnie</CardTitle>
          </CardHeader>
          <CardContent>
            {billing.rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Aucune compagnie trouvee.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-3 pr-4 font-semibold">Compagnie</th>
                      <th className="pb-3 pr-4 font-semibold">Plan</th>
                      <th className="pb-3 pr-4 font-semibold">Montant mensuel</th>
                      <th className="pb-3 pr-4 font-semibold">Paiements recus</th>
                      <th className="pb-3 pr-4 font-semibold">Dernier paiement</th>
                      <th className="pb-3 font-semibold">Prochaine echeance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.rows.map((company) => (
                      <tr key={company.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-4 pr-4">
                          <div className="font-medium text-slate-950">{company.name}</div>
                          <div className="text-xs text-slate-500">{company.id}</div>
                        </td>
                        <td className="py-4 pr-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              company.plan === "premium"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {planLabel(company.plan)}
                          </span>
                        </td>
                        <td className="py-4 pr-4 font-semibold text-slate-900">
                          {formatCurrency(company.monthlyAmount)}
                        </td>
                        <td className="py-4 pr-4 font-semibold text-emerald-700">
                          {formatCurrency(company.totalPaymentsReceived)}
                        </td>
                        <td className="py-4 pr-4 text-slate-700">
                          {formatDate(company.lastPaymentAt)}
                        </td>
                        <td className="py-4 text-slate-700">{formatDate(company.nextBillingDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
