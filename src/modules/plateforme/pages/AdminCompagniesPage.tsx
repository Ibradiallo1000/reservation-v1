import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Building2, ExternalLink } from "lucide-react";
import { db } from "@/firebaseConfig";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import {
  getCompanyPlanConfig,
  getCompanyUsageRatio,
  mergeAdminPlansConfig,
  normalizeCompanyRecord,
  planLabel,
  type AdminCompanyRecord,
} from "./adminBusinessUtils";
import type { Plan } from "@/core/subscription/plans";
import type { SystemPlansConfig } from "./systemPlansConfig";

export default function AdminCompagniesPage() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [companies, setCompanies] = useState<AdminCompanyRecord[]>([]);
  const [plans, setPlans] = useState<SystemPlansConfig>(mergeAdminPlansConfig(null));
  const [companiesReady, setCompaniesReady] = useState(false);
  const [plansReady, setPlansReady] = useState(false);
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offCompanies = onSnapshot(
      query(collection(db, "companies"), orderBy("nom", "asc")),
      (snap) => {
        setCompanies(snap.docs.map((companyDoc) => normalizeCompanyRecord(companyDoc.id, companyDoc.data())));
        setCompaniesReady(true);
      },
      (snapshotError) => {
        console.error("[AdminCompagniesPage] companies snapshot failed", snapshotError);
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
        console.error("[AdminCompagniesPage] plans snapshot failed", snapshotError);
        setPlans(mergeAdminPlansConfig(null));
        setPlansReady(true);
      }
    );

    return () => {
      offCompanies();
      offPlans();
    };
  }, []);

  const rows = useMemo(() => {
    return companies.map((company) => {
      const planConfig = getCompanyPlanConfig(plans, company.plan);
      return {
        ...company,
        planConfig,
        usageRatio: getCompanyUsageRatio(company, plans),
      };
    });
  }, [companies, plans]);

  const loading = !companiesReady || !plansReady;

  const handlePlanChange = async (companyId: string, nextPlan: Plan) => {
    setSavingCompanyId(companyId);
    try {
      await updateDoc(doc(db, "companies", companyId), {
        plan: nextPlan,
        planId: nextPlan,
        subscriptionStatus: "active",
        updatedAt: serverTimestamp(),
      });
      toast.success(`Plan ${planLabel(nextPlan)} applique.`);
    } catch (updateError) {
      console.error("[AdminCompagniesPage] company plan update failed", updateError);
      toast.error("Impossible de mettre a jour le plan.");
    } finally {
      setSavingCompanyId(null);
    }
  };

  if (loading) {
    return <PageLoadingState blocks={2} />;
  }

  return (
    <div className="space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: certaines donnees peuvent etre incompletes." />
      )}
      {error && <PageErrorState message={error} onRetry={() => window.location.reload()} />}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Compagnies</h1>
          <p className="mt-1 text-sm text-slate-500">
            Suivi des plans, de l'usage mensuel et des changements manuels d'abonnement.
          </p>
        </div>
        <Button onClick={() => navigate("/admin/compagnies/ajouter")}>Ajouter une compagnie</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Portefeuille clients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Aucune compagnie trouvee.
            </div>
          ) : (
            rows.map((company) => {
              const progressWidth = Math.max(4, Math.round(company.usageRatio * 100));
              const progressTone =
                company.usageRatio >= 0.8
                  ? "bg-orange-500"
                  : company.usageRatio >= 0.5
                    ? "bg-sky-500"
                    : "bg-emerald-500";

              return (
                <div
                  key={company.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-slate-950">
                            {company.name}
                          </div>
                          <div className="truncate text-sm text-slate-500">
                            {company.email || company.telephone || company.id}
                          </div>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            company.status === "inactif"
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {company.status === "inactif" ? "Inactive" : "Active"}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-3">
                        <div className="rounded-xl bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Plan actuel
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                company.plan === "premium"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {planLabel(company.plan)}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">
                              {formatCurrency(company.planConfig.price)} / mois
                            </span>
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Usage mensuel
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">
                            {company.currentMonthOperations.toLocaleString("fr-FR")} /{" "}
                            {company.planConfig.includedOperations.toLocaleString("fr-FR")} operations
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-slate-200">
                            <div
                              className={`h-2 rounded-full ${progressTone}`}
                              style={{ width: `${Math.min(progressWidth, 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Hors quota
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">
                            +{company.planConfig.overage.toLocaleString("fr-FR")} FCFA / operation
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            Statut abonnement: {company.subscriptionStatus || "active"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <label className="text-sm font-semibold text-slate-700">
                          Changer le plan
                        </label>
                        <select
                          value={company.plan}
                          disabled={savingCompanyId === company.id}
                          onChange={(event) =>
                            handlePlanChange(company.id, event.target.value as Plan)
                          }
                          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        >
                          <option value="standard">STANDARD</option>
                          <option value="premium">PREMIUM</option>
                        </select>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          variant="secondary"
                          onClick={() => navigate(`/admin/compagnies/${company.id}/modifier`)}
                        >
                          Modifier
                        </Button>
                        <Button
                          onClick={() => navigate(`/admin/compagnies/${company.id}/configurer`)}
                        >
                          Ouvrir
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>

                      {company.slug ? (
                        <a
                          href={`/${company.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Voir le site public
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
