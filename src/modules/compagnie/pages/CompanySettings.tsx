// src/modules/compagnie/pages/CompanySettings.tsx
// Updated for dual-revenue model
import React, { useEffect, useState, useMemo } from "react";
import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/shared/ui/button";
import { SectionCard, StatusBadge } from "@/ui";
import type { StatusVariant } from "@/ui";
import { CheckCircle2, CreditCard, Settings } from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";

type SupportLevel = "basic" | "standard" | "priority" | "premium" | "enterprise";

type Company = {
  id: string;
  nom?: string;
  plan?: string;
  maxAgences?: number;
  maxUsers?: number;
  digitalFeePercent?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  guichetEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  publicPageEnabled?: boolean;
  supportLevel?: SupportLevel;
  planType?: "trial" | "paid";
};

type PlanDef = {
  id: string;
  label: string;
  description?: string;
  maxAgences: number;
  maxUsers: number;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  supportLevel: SupportLevel;
  isTrial?: boolean;
};

const SUPPORT_LABELS: Record<SupportLevel, string> = {
  basic: "Basic",
  standard: "Standard",
  priority: "Prioritaire",
  premium: "Premium",
  enterprise: "Enterprise",
};

function supportToVariant(s: SupportLevel): StatusVariant {
  switch (s) {
    case "standard": return "info";
    case "priority": return "warning";
    case "premium": return "active";
    case "enterprise": return "completed";
    default: return "neutral";
  }
}

const CompanySettingsPlan: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { companyId, user } = useAuth();
  const money = useFormatCurrency();
  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      setPlans([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDoc(doc(db, "companies", companyId));
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          setCompany({
            id: snap.id,
            nom: data.nom as string,
            plan: data.plan as string,
            maxAgences: Number(data.maxAgences) || 0,
            maxUsers: Number(data.maxUsers) || 0,
            digitalFeePercent: Number(data.digitalFeePercent) || 0,
            feeGuichet: Number(data.feeGuichet) || 0,
            minimumMonthly: Number(data.minimumMonthly) || 0,
            guichetEnabled: true,
            onlineBookingEnabled: true,
            publicPageEnabled: true,
            supportLevel: (data.supportLevel as SupportLevel) || "basic",
            planType: (data.planType as "trial" | "paid") || "paid",
          });
        } else {
          setCompany(null);
        }

        const plansSnap = await getDoc(doc(db, "_meta", "plansCatalog"));
        if (plansSnap.exists()) {
          const items = (plansSnap.data()?.items || []) as PlanDef[];
          setPlans(items.map(p => ({
            ...p,
            digitalFeePercent: p.digitalFeePercent ?? 0,
            supportLevel: p.supportLevel ?? "basic",
          })));
        } else {
          // Fallback with new model
          setPlans([
            {
              id: "starter",
              label: "Starter",
              description: "Petites structures — 1 agence.",
              maxAgences: 1,
              maxUsers: 10,
              digitalFeePercent: 2,
              feeGuichet: 0,
              minimumMonthly: 0,
              supportLevel: "standard",
            },
            {
              id: "growth",
              label: "Growth",
              description: "Multi-agences + support prioritaire.",
              maxAgences: 3,
              maxUsers: 25,
              digitalFeePercent: 1.5,
              feeGuichet: 0,
              minimumMonthly: 0,
              supportLevel: "priority",
            },
            {
              id: "pro",
              label: "Pro",
              description: "Croissance + API + support premium.",
              maxAgences: 5,
              maxUsers: 50,
              digitalFeePercent: 1,
              feeGuichet: 0,
              minimumMonthly: 0,
              supportLevel: "premium",
            },
          ]);
        }
      } catch (err) {
        console.error("Erreur chargement plan compagnie:", err);
        setCompany(null);
        setPlans([]);
        setError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger les paramètres de plan."
            : "Erreur lors du chargement des paramètres de plan."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, isOnline, reloadKey]);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === company?.plan) || null,
    [plans, company?.plan]
  );

  if (!companyId) {
    return <p className="text-sm text-gray-600">Aucune compagnie active.</p>;
  }
  if (loading) {
    return <PageLoadingState />;
  }
  if (!company) {
    return <p className="text-sm text-gray-600">Compagnie introuvable.</p>;
  }

  async function requestUpgrade(planId: string) {
    if (!companyId) return;
    if (sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, "companies", companyId, "planRequests"), {
        from: company!.plan || null,
        planWanted: planId,
        status: "pending",
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });
      alert("Demande envoyée. L'équipe validera la mise à niveau.");
    } catch (e: unknown) {
      console.error(e);
      alert("Erreur lors de l'envoi de la demande.");
    } finally {
      setSending(false);
    }
  }

  const digitalFee = company.digitalFeePercent ?? 0;
  const companySupport = company.supportLevel || "basic";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: les données de plan peuvent être incomplètes." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      <SectionCard title="Plan actuel" icon={CreditCard}>
        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={supportToVariant(companySupport)}>
            Support {SUPPORT_LABELS[companySupport]}
          </StatusBadge>
        </div>
        <p className="text-gray-600 mb-4">
          {currentPlan
            ? `${currentPlan.label} (${company.plan})`
            : company.plan || "non défini"}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Agences</p>
            <p className="font-semibold">
              {(company.maxAgences ?? 0) === 0 ? "Illimité" : `${company.maxAgences} max`}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Utilisateurs</p>
            <p className="font-semibold">{company.maxUsers ?? "—"} max</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Frais canal digital</p>
            <p className="font-semibold text-[var(--btn-primary,#FF6600)]">
              {digitalFee}%
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Frais guichet</p>
            <p className="font-semibold">{money(company.feeGuichet ?? 0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Minimum mensuel</p>
            <p className="font-semibold">{money(company.minimumMonthly ?? 0)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-gray-500">Modules inclus</p>
            <div className="flex flex-wrap gap-1 mt-1">
              <StatusBadge status="success">
                <CheckCircle2 className="h-3 w-3 inline mr-1" /> Tous
              </StatusBadge>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Changer de plan" icon={Settings}>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.id === company.plan;
            return (
              <div
                key={p.id}
                className={`rounded-lg border p-4 ${
                  isCurrent
                    ? "ring-2 ring-[var(--btn-primary,#FF6600)] border-orange-200"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <h4 className="font-semibold text-gray-900">{p.label}</h4>
                  <StatusBadge status={supportToVariant(p.supportLevel)}>
                    {SUPPORT_LABELS[p.supportLevel]}
                  </StatusBadge>
                </div>
                {p.description && (
                  <p className="text-sm text-gray-600 mt-1">{p.description}</p>
                )}

                <ul className="mt-3 text-sm text-gray-700 space-y-1">
                  <li>Agences max : <b>{p.maxAgences === 0 ? "Illimité" : p.maxAgences}</b></li>
                  <li>Utilisateurs max : <b>{p.maxUsers}</b></li>
                  <li>
                    Frais canal digital :{" "}
                    <b className="text-[var(--btn-primary,#FF6600)]">{p.digitalFeePercent}%</b>
                  </li>
                  <li>Frais guichet : <b>{money(p.feeGuichet)}</b></li>
                  <li>Minimum mensuel : <b>{money(p.minimumMonthly)}</b></li>
                </ul>

                <div className="flex flex-wrap gap-1 mt-2">
                  <StatusBadge status="success">
                    <CheckCircle2 className="h-3 w-3 inline mr-1" /> Tous modules inclus
                  </StatusBadge>
                </div>

                <Button
                  disabled={isCurrent || sending}
                  onClick={() => requestUpgrade(p.id)}
                  variant={isCurrent ? "secondary" : "primary"}
                  className="mt-4 w-full"
                >
                  {isCurrent ? "Plan actuel" : "Demander ce plan"}
                </Button>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
};

export default CompanySettingsPlan;
