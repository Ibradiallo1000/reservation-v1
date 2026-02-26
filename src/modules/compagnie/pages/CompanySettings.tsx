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
import { CheckCircle2 } from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

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

const CompanySettingsPlan: React.FC = () => {
  const { companyId, user } = useAuth();
  const money = useFormatCurrency();
  const [company, setCompany] = useState<Company | null>(null);
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      setPlans([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
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
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const currentPlan = useMemo(
    () => plans.find((p) => p.id === company?.plan) || null,
    [plans, company?.plan]
  );

  if (!companyId) {
    return <p className="text-sm text-gray-600">Aucune compagnie active.</p>;
  }
  if (loading) {
    return <p className="text-sm text-gray-600">Chargement…</p>;
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
      {/* Current plan card */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Plan actuel</h3>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 capitalize">
            Support {SUPPORT_LABELS[companySupport]}
          </span>
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
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                <CheckCircle2 className="h-3 w-3" /> Tous
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Plan catalog */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Changer de plan</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.id === company.plan;
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-4 ${
                  isCurrent
                    ? "ring-2 ring-[var(--btn-primary,#FF6600)] border-orange-200"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <h4 className="font-semibold text-gray-900">{p.label}</h4>
                  <span className="text-xs text-gray-500 capitalize">
                    {SUPPORT_LABELS[p.supportLevel]}
                  </span>
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

                {/* All features included */}
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Tous modules inclus
                  </span>
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
      </div>
    </div>
  );
};

export default CompanySettingsPlan;
