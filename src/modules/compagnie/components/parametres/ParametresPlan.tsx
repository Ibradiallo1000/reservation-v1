import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/firebaseConfig";
import { Button } from "@/shared/ui/button";
import { SectionCard, StatusBadge } from "@/ui";
import { AlertTriangle, CheckCircle2, Crown, Shield } from "lucide-react";
import { normalizePlan, type Plan } from "@/core/subscription/plans";
import { useAuth } from "@/contexts/AuthContext";
import {
  initializeOperationsCounter,
  OPERATION_QUOTA_BLOCKED_HELP,
  OPERATION_QUOTA_BLOCKED_MESSAGE,
  OPERATION_QUOTA_WARNING_MESSAGE,
} from "@/core/subscription/operationQuota";

type PlanValues = {
  price: number;
  includedOperations: number;
  overage: number;
};

type SystemPlan = PlanValues & {
  id: Plan;
  name: "STANDARD" | "PREMIUM";
};

type SystemPlans = Record<Plan, SystemPlan>;

type PlanPresentation = {
  id: Plan;
  title: "STANDARD" | "PREMIUM";
  value: string;
  features: string[];
  warning?: string;
};

interface Props {
  companyId?: string;
}

const nf = new Intl.NumberFormat("fr-FR");

function getCurrentMonthOperations(company: Record<string, unknown> | null): number {
  if (!company) return 0;
  return Math.max(0, Number(company.currentMonthOperations ?? 0) || 0);
}

const DEFAULT_PLANS: Record<Plan, PlanValues> = {
  standard: {
    price: 100000,
    includedOperations: 3000,
    overage: 15,
  },
  premium: {
    price: 300000,
    includedOperations: 10000,
    overage: 10,
  },
};

const DEFAULT_SYSTEM_PLANS: SystemPlans = {
  standard: {
    id: "standard",
    name: "STANDARD",
    ...DEFAULT_PLANS.standard,
  },
  premium: {
    id: "premium",
    name: "PREMIUM",
    ...DEFAULT_PLANS.premium,
  },
};

const PLAN_PRESENTATION: Record<Plan, PlanPresentation> = {
  standard: {
    id: "standard",
    title: "STANDARD",
    value: "Gerez vos ventes quotidiennes sans complexite",
    features: [
      "Vente de billets (guichet + en ligne)",
      "Suivi simple des paiements",
      "Gestion des agences",
      "Gestion basique des colis",
    ],
    warning: "Pas d'analyse avancee",
  },
  premium: {
    id: "premium",
    title: "PREMIUM",
    value: "Controlez vos revenus et developpez votre reseau",
    features: [
      "Analyse financiere complete",
      "Suivi du cash en temps reel",
      "Comparaison entre agences",
      "Detection des pertes",
      "Rapports automatiques",
    ],
  },
};

function normalizePlanValues(raw: unknown, fallback: SystemPlan): SystemPlan {
  const data = raw && typeof raw === "object" ? (raw as Partial<PlanValues>) : {};
  const price = Number(data.price);
  const includedOperations = Number(data.includedOperations);
  const overage = Number(data.overage);

  return {
    ...fallback,
    price: Number.isFinite(price) ? price : fallback.price,
    includedOperations: Number.isFinite(includedOperations)
      ? includedOperations
      : fallback.includedOperations,
    overage: Number.isFinite(overage) ? overage : fallback.overage,
  };
}

function mergePlans(raw: unknown): SystemPlans {
  const data = raw && typeof raw === "object" ? (raw as Partial<Record<Plan, PlanValues>>) : {};

  return {
    standard: normalizePlanValues(data.standard, DEFAULT_SYSTEM_PLANS.standard),
    premium: normalizePlanValues(data.premium, DEFAULT_SYSTEM_PLANS.premium),
  };
}

const ParametresPlan: React.FC<Props> = ({ companyId }) => {
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const { user } = useAuth();
  const resolvedCompanyId = companyId || routeCompanyId || user?.companyId || "";
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [plans, setPlans] = useState<SystemPlans>(DEFAULT_SYSTEM_PLANS);
  const [counts, setCounts] = useState({ agences: 0, users: 0 });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!resolvedCompanyId) {
      setCompany(null);
      setLoading(false);
      return;
    }

    const companyRef = doc(db, "companies", resolvedCompanyId);
    const plansRef = doc(db, "adminSettings", "plans");

    const offCompany = onSnapshot(
      companyRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          if (typeof data.currentMonthOperations !== "number") {
            void initializeOperationsCounter(resolvedCompanyId).catch(() => {});
          }
        }
        setCompany(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      () => {
        setCompany(null);
        setLoading(false);
      }
    );

    const offPlans = onSnapshot(
      plansRef,
      (snap) => setPlans(mergePlans(snap.exists() ? snap.data() : null)),
      () => setPlans(DEFAULT_SYSTEM_PLANS)
    );

    (async () => {
      try {
        const [agencesCount, usersCount] = await Promise.all([
          getCountFromServer(collection(db, "companies", resolvedCompanyId, "agences")),
          getCountFromServer(collection(db, "companies", resolvedCompanyId, "personnel")),
        ]);

        setCounts({
          agences: agencesCount.data().count,
          users: usersCount.data().count,
        });
      } catch {
        setCounts({ agences: 0, users: 0 });
      }
    })();

    return () => {
      offCompany();
      offPlans();
    };
  }, [resolvedCompanyId]);

  const currentPlanId = useMemo(
    () => normalizePlan(String(company?.plan ?? company?.planId ?? "")),
    [company?.plan, company?.planId]
  );

  const activePlan = plans[currentPlanId];
  const usedOperations = getCurrentMonthOperations(company);
  const usagePercent =
    activePlan.includedOperations > 0
      ? Math.min(100, Math.round((usedOperations / activePlan.includedOperations) * 100))
      : 0;
  const upgradePlan = currentPlanId === "standard" ? plans.premium : null;
  const quotaReached =
    activePlan.includedOperations > 0 && usedOperations >= activePlan.includedOperations;
  const quotaWarning = !quotaReached && activePlan.includedOperations > 0 && usagePercent >= 80;

  console.log("🖥 UI PLAN DATA", {
    operations: company?.currentMonthOperations,
    quota: activePlan.includedOperations,
  });

  const requestUpgrade = async (target: SystemPlan) => {
    if (!resolvedCompanyId || sending) return;

    setSending(true);
    try {
      await addDoc(collection(db, "subscriptionRequests"), {
        companyId: resolvedCompanyId,
        companyName: String(company?.nom ?? company?.name ?? resolvedCompanyId),
        currentPlan: currentPlanId,
        requestedPlan: target.id,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success("Demande de mise a niveau envoyee.");
    } catch (error) {
      console.error("[ParametresPlan] subscription request failed", error);
      toast.error("Impossible d'envoyer la demande.");
    } finally {
      setSending(false);
    }
  };

  if (loading || !company) {
    return <div className="p-6">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Plan & abonnement"
        icon={Shield}
        description="Choisissez l'offre qui correspond a votre volume de ventes et au niveau de controle attendu."
      >
        <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {nf.format(usedOperations)} / {nf.format(activePlan.includedOperations)} operations utilisees
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {counts.agences} agence{counts.agences > 1 ? "s" : ""} · {counts.users} utilisateur
                {counts.users > 1 ? "s" : ""}
              </p>
            </div>
            <StatusBadge status={currentPlanId === "premium" ? "active" : "info"}>
              Plan actuel : {activePlan.name}
            </StatusBadge>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[var(--btn-primary,#FF6600)] transition-all duration-300"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {(quotaWarning || quotaReached) && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="whitespace-pre-line text-sm font-bold text-orange-900">
                  {quotaReached ? OPERATION_QUOTA_BLOCKED_MESSAGE : OPERATION_QUOTA_WARNING_MESSAGE}
                </p>
                {quotaReached && (
                  <p className="mt-1 text-xs font-medium text-orange-700">
                    {OPERATION_QUOTA_BLOCKED_HELP}
                  </p>
                )}
              </div>
              {upgradePlan && (
                <Button
                  disabled={sending}
                  onClick={() => requestUpgrade(upgradePlan)}
                  variant="primary"
                  size="sm"
                >
                  Passer en Premium
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {(["standard", "premium"] as Plan[]).map((planId) => {
            const plan = plans[planId];
            const content = PLAN_PRESENTATION[planId];
            const isCurrent = currentPlanId === planId;
            const isPremium = planId === "premium";
            const canUpgradeToPremium = !isCurrent && isPremium;

            return (
              <div
                key={planId}
                className={[
                  "relative flex min-h-[520px] flex-col rounded-xl border p-6 transition-all duration-200",
                  isPremium
                    ? "border-[var(--btn-primary,#FF6600)] bg-white shadow-xl shadow-orange-100/80 lg:scale-[1.02]"
                    : "border-gray-200 bg-white shadow-sm hover:shadow-md",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-bold tracking-normal text-gray-950">
                      {content.title}
                    </h3>
                    <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                      {content.value}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {isPremium && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--btn-primary,#FF6600)] px-3 py-1 text-xs font-semibold text-white">
                        <Crown className="h-3.5 w-3.5" />
                        Recommande
                      </span>
                    )}
                    {isCurrent && <StatusBadge status="success">Plan actuel</StatusBadge>}
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {content.features.map((feature) => (
                    <div key={feature} className="flex gap-3 text-sm text-gray-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {content.warning && (
                  <div className="mt-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {content.warning}
                  </div>
                )}

                <div className="mt-8 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-3xl font-bold text-gray-950">
                    {nf.format(plan.price)}
                    <span className="ml-1 text-sm font-semibold text-gray-500">FCFA / mois</span>
                  </p>
                  <div className="mt-4 space-y-2 text-sm text-gray-700">
                    <p>Jusqu'a {nf.format(plan.includedOperations)} operations</p>
                    <p>Puis +{nf.format(plan.overage)} FCFA / operation</p>
                  </div>
                </div>

                <div className="mt-auto pt-6">
                  {isCurrent ? (
                    <Button className="w-full" disabled variant="secondary">
                      Plan actuel
                    </Button>
                  ) : canUpgradeToPremium ? (
                    <Button
                      className="w-full"
                      disabled={sending}
                      onClick={() => requestUpgrade(plan)}
                      variant="primary"
                    >
                      Passer en Premium
                    </Button>
                  ) : (
                    <Button className="w-full" disabled variant="secondary">
                      Deja couvert par votre plan
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
};

export default ParametresPlan;
