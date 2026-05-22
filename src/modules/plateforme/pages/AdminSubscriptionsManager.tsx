import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { normalizePlan, type Plan } from "@/core/subscription/plans";
import {
  formatDateTime,
  getCompanyPlanConfig,
  isCompanyBillable,
  mergeAdminPlansConfig,
  normalizeCompanyRecord,
  planLabel,
  type AdminCompanyRecord,
} from "./adminBusinessUtils";
import type { SystemPlansConfig } from "./systemPlansConfig";

type RequestStatus = "pending" | "approved" | "rejected";

type SubscriptionRequestRow = {
  id: string;
  companyId: string;
  companyName: string;
  currentPlan: Plan;
  requestedPlan: Plan;
  status: RequestStatus;
  createdAt: Date | null;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const timestampLike = value as { toDate?: () => Date };
    if (typeof timestampLike.toDate === "function") return timestampLike.toDate();
  }
  return null;
}

function requestStatusClasses(status: RequestStatus): string {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-700";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "pending":
    default:
      return "bg-amber-100 text-amber-700";
  }
}

function subscriptionStatusClasses(status: string): string {
  switch (status) {
    case "trial":
      return "bg-sky-100 text-sky-700";
    case "grace":
      return "bg-amber-100 text-amber-700";
    case "restricted":
      return "bg-orange-100 text-orange-700";
    case "suspended":
      return "bg-red-100 text-red-700";
    case "active":
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}

function subscriptionStatusLabel(status: string): string {
  switch (status) {
    case "trial":
      return "Essai";
    case "grace":
      return "Grace";
    case "restricted":
      return "Restreint";
    case "suspended":
      return "Suspendu";
    case "active":
    default:
      return "Actif";
  }
}

export default function AdminSubscriptionsManager() {
  const [requests, setRequests] = useState<SubscriptionRequestRow[]>([]);
  const [companies, setCompanies] = useState<AdminCompanyRecord[]>([]);
  const [plans, setPlans] = useState<SystemPlansConfig>(mergeAdminPlansConfig(null));
  const [requestsReady, setRequestsReady] = useState(false);
  const [companiesReady, setCompaniesReady] = useState(false);
  const [plansReady, setPlansReady] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    const offRequests = onSnapshot(
      query(collection(db, "subscriptionRequests"), orderBy("createdAt", "desc")),
      (snap) => {
        setRequests(
          snap.docs.map((requestDoc) => {
            const data = requestDoc.data() as Record<string, unknown>;
            return {
              id: requestDoc.id,
              companyId: String(data.companyId ?? ""),
              companyName: String(data.companyName ?? ""),
              currentPlan: normalizePlan(String(data.currentPlan ?? "")),
              requestedPlan: normalizePlan(String(data.requestedPlan ?? "")),
              status:
                data.status === "approved" || data.status === "rejected"
                  ? data.status
                  : "pending",
              createdAt: toDate(data.createdAt),
            } satisfies SubscriptionRequestRow;
          })
        );
        setRequestsReady(true);
      },
      (error) => {
        console.error("[AdminSubscriptionsManager] requests snapshot failed", error);
        toast.error("Impossible de charger les demandes.");
        setRequests([]);
        setRequestsReady(true);
      }
    );

    const offCompanies = onSnapshot(
      query(collection(db, "companies"), orderBy("nom", "asc")),
      (snap) => {
        setCompanies(snap.docs.map((companyDoc) => normalizeCompanyRecord(companyDoc.id, companyDoc.data())));
        setCompaniesReady(true);
      },
      (error) => {
        console.error("[AdminSubscriptionsManager] companies snapshot failed", error);
        toast.error("Impossible de charger les abonnements.");
        setCompanies([]);
        setCompaniesReady(true);
      }
    );

    const offPlans = onSnapshot(
      doc(db, "adminSettings", "plans"),
      (snap) => {
        setPlans(mergeAdminPlansConfig(snap.exists() ? snap.data() : null));
        setPlansReady(true);
      },
      (error) => {
        console.error("[AdminSubscriptionsManager] plans snapshot failed", error);
        setPlans(mergeAdminPlansConfig(null));
        setPlansReady(true);
      }
    );

    return () => {
      offRequests();
      offCompanies();
      offPlans();
    };
  }, []);

  const loading = !requestsReady || !companiesReady || !plansReady;

  const pendingRequests = useMemo(() => {
    return requests.filter((request) => request.status === "pending");
  }, [requests]);

  const companiesById = useMemo(() => {
    return new Map(companies.map((company) => [company.id, company]));
  }, [companies]);

  const activeSubscriptions = useMemo(() => {
    return companies.map((company) => {
      const planConfig = getCompanyPlanConfig(plans, company.plan);
      return {
        ...company,
        monthlyPrice: planConfig.price,
      };
    });
  }, [companies, plans]);

  const metrics = useMemo(() => {
    const mrr = activeSubscriptions
      .filter((company) => isCompanyBillable(company))
      .reduce((sum, company) => sum + company.monthlyPrice, 0);

    return {
      pendingCount: pendingRequests.length,
      premiumCount: activeSubscriptions.filter((company) => company.plan === "premium").length,
      activeCount: activeSubscriptions.filter((company) => company.subscriptionStatus !== "suspended")
        .length,
      mrr,
    };
  }, [activeSubscriptions, pendingRequests]);

  const approveRequest = async (request: SubscriptionRequestRow) => {
    if (!request.companyId) {
      toast.error("Compagnie introuvable.");
      return;
    }

    setActionId(request.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "companies", request.companyId), {
        plan: request.requestedPlan,
        planId: request.requestedPlan,
        subscriptionStatus: "active",
        "subscription.status": "active",
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, "subscriptionRequests", request.id), {
        status: "approved",
      });
      await batch.commit();
      toast.success("Demande approuvee.");
    } catch (error) {
      console.error("[AdminSubscriptionsManager] approve failed", error);
      toast.error("Impossible d'approuver la demande.");
    } finally {
      setActionId(null);
    }
  };

  const rejectRequest = async (request: SubscriptionRequestRow) => {
    setActionId(request.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "subscriptionRequests", request.id), {
        status: "rejected",
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      toast.success("Demande refusee.");
    } catch (error) {
      console.error("[AdminSubscriptionsManager] reject failed", error);
      toast.error("Impossible de refuser la demande.");
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Chargement des abonnements...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Abonnements</h1>
          <p className="mt-1 text-sm text-slate-500">
            Demandes d'upgrade en temps reel, validation admin et suivi des plans actifs.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          <RefreshCcw className="h-4 w-4" />
          Actualiser
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-slate-500">Demandes en attente</div>
            <div className="mt-2 flex items-center gap-2 text-3xl font-black text-slate-950">
              <Clock3 className="h-6 w-6 text-amber-500" />
              {metrics.pendingCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-slate-500">Abonnements actifs</div>
            <div className="mt-2 flex items-center gap-2 text-3xl font-black text-slate-950">
              <CreditCard className="h-6 w-6 text-sky-500" />
              {metrics.activeCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-slate-500">Plans Premium</div>
            <div className="mt-2 text-3xl font-black text-orange-700">{metrics.premiumCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-slate-500">MRR courant</div>
            <div className="mt-2 text-3xl font-black text-emerald-700">
              {formatCurrency(metrics.mrr)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demandes en attente</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Aucune demande en attente.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => {
                const company = companiesById.get(request.companyId);
                const requestedPlanConfig = getCompanyPlanConfig(plans, request.requestedPlan);
                const busy = actionId === request.id;

                return (
                  <div
                    key={request.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-950">
                            {request.companyName || company?.name || request.companyId}
                          </span>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                              requestStatusClasses(request.status)
                            )}
                          >
                            En attente
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                            {planLabel(request.currentPlan)}
                          </span>
                          <span>vers</span>
                          <span className="rounded-full bg-orange-100 px-2.5 py-1 font-medium text-orange-700">
                            {planLabel(request.requestedPlan)}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span>{formatCurrency(requestedPlanConfig.price)} / mois</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Envoyee le {formatDateTime(request.createdAt)}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          disabled={busy}
                          onClick={() => approveRequest(request)}
                          size="sm"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approuver
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => rejectRequest(request)}
                          size="sm"
                          variant="secondary"
                          className="border-red-200 text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Refuser
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abonnements actifs</CardTitle>
        </CardHeader>
        <CardContent>
          {activeSubscriptions.length === 0 ? (
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
                    <th className="pb-3 pr-4 font-semibold">Montant</th>
                    <th className="pb-3 pr-4 font-semibold">Statut</th>
                    <th className="pb-3 pr-4 font-semibold">Paiements recus</th>
                    <th className="pb-3 font-semibold">Demande en cours</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSubscriptions.map((company) => {
                    const pendingRequest = pendingRequests.find(
                      (request) => request.companyId === company.id
                    );

                    return (
                      <tr key={company.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-4 pr-4">
                          <div className="font-medium text-slate-950">{company.name}</div>
                          <div className="text-xs text-slate-500">{company.id}</div>
                        </td>
                        <td className="py-4 pr-4">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                              company.plan === "premium"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {planLabel(company.plan)}
                          </span>
                        </td>
                        <td className="py-4 pr-4 font-semibold text-slate-900">
                          {formatCurrency(company.monthlyPrice)}
                        </td>
                        <td className="py-4 pr-4">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                              subscriptionStatusClasses(company.subscriptionStatus)
                            )}
                          >
                            {subscriptionStatusLabel(company.subscriptionStatus)}
                          </span>
                        </td>
                        <td className="py-4 pr-4 font-medium text-emerald-700">
                          {formatCurrency(company.totalPaymentsReceived)}
                        </td>
                        <td className="py-4">
                          {pendingRequest ? (
                            <span className="text-xs font-medium text-amber-700">
                              {planLabel(pendingRequest.currentPlan)} vers{" "}
                              {planLabel(pendingRequest.requestedPlan)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Aucune</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
