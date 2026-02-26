// =============================================
// src/modules/compagnie/components/parametres/ParametresPlan.tsx
// VERSION MULTI-RÔLE – Dual-revenue model
// =============================================
import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/firebaseConfig";
import { useCurrencySymbol } from "@/shared/currency/CurrencyContext";
import { Button } from "@/shared/ui/button";
import { CheckCircle2, Shield, Star, Zap, Crown } from "lucide-react";
import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

/* ====================================================================
   TYPES
==================================================================== */
type SupportLevel = "basic" | "standard" | "priority" | "premium" | "enterprise";

type Plan = {
  id: string;
  name: string;
  priceMonthly: number;
  quotaReservations?: number;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  supportLevel: SupportLevel;
  isTrial?: boolean;
  trialDurationDays?: number;
  brandingLocked?: boolean;
  features: {
    publicPage: boolean;
    onlineBooking: boolean;
    guichet: boolean;
  };
};

interface Props {
  companyId: string;
}

/* ====================================================================
   CONSTANTS
==================================================================== */
const nf = new Intl.NumberFormat("fr-FR");

const SUPPORT_CONFIG: Record<SupportLevel, { label: string; color: string; icon: React.ReactNode }> = {
  basic: { label: "Basic", color: "bg-gray-100 text-gray-700", icon: <Shield className="h-3.5 w-3.5" /> },
  standard: { label: "Standard", color: "bg-blue-100 text-blue-700", icon: <Shield className="h-3.5 w-3.5" /> },
  priority: { label: "Prioritaire", color: "bg-amber-100 text-amber-700", icon: <Star className="h-3.5 w-3.5" /> },
  premium: { label: "Premium", color: "bg-purple-100 text-purple-700", icon: <Zap className="h-3.5 w-3.5" /> },
  enterprise: { label: "Enterprise", color: "bg-indigo-100 text-indigo-700", icon: <Crown className="h-3.5 w-3.5" /> },
};

/* ====================================================================
   COMPONENT
==================================================================== */
const ParametresPlan: React.FC<Props> = ({ companyId }) => {
  const currencySymbol = useCurrencySymbol();
  const [cmp, setCmp] = useState<Record<string, unknown> | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [counts, setCounts] = useState({ agences: 0, users: 0 });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  /* =========================
     LOAD DATA
  ========================= */
  useEffect(() => {
    if (!companyId) return;

    const unsubs: Array<() => void> = [];

    // Company realtime
    const companyRef = doc(db, "companies", companyId);
    const offCompany = onSnapshot(companyRef, (snap) => {
      if (snap.exists()) {
        setCmp({ id: snap.id, ...snap.data() });
      } else {
        setCmp(null);
      }
      setLoading(false);
    });
    unsubs.push(offCompany);

    // Plans realtime
    const plansQuery = query(
      collection(db, "plans"),
      orderBy("priceMonthly", "asc")
    );

    const offPlans = onSnapshot(plansQuery, (snap) => {
      setPlans(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            name: (data.name as string) ?? "",
            priceMonthly: Number(data.priceMonthly) || 0,
            quotaReservations: Number(data.quotaReservations) || 0,
            digitalFeePercent: Number(data.digitalFeePercent) || 0,
            feeGuichet: Number(data.feeGuichet) || 0,
            minimumMonthly: Number(data.minimumMonthly) || 0,
            maxAgences: Number(data.maxAgences) || 1,
            supportLevel: (data.supportLevel as SupportLevel) || "basic",
            isTrial: Boolean(data.isTrial),
            trialDurationDays: Number(data.trialDurationDays) || 0,
            brandingLocked: Boolean(data.brandingLocked),
            features: {
              publicPage: true,
              onlineBooking: true,
              guichet: true,
            },
          } satisfies Plan;
        })
      );
    });
    unsubs.push(offPlans);

    // Counts
    (async () => {
      try {
        const agencesRef = collection(db, `companies/${companyId}/agences`);
        const staffRef = collection(db, `companies/${companyId}/personnel`);

        const [ag, us] = await Promise.all([
          getCountFromServer(agencesRef),
          getCountFromServer(staffRef),
        ]);

        setCounts({
          agences: ag.data().count,
          users: us.data().count,
        });
      } catch {
        // silent
      }
    })();

    return () => unsubs.forEach((u) => u());
  }, [companyId]);

  const planById = useMemo(() => {
    const map: Record<string, Plan> = {};
    plans.forEach((p) => (map[p.id] = p));
    return map;
  }, [plans]);

  const activePlan = useMemo(() => {
    if (!cmp) return null;
    const planId = cmp.planId as string | undefined;
    if (planId && planById[planId]) return planById[planId];
    const planName = cmp.plan as string | undefined;
    return plans.find((p) => p.name === planName) || null;
  }, [cmp, planById, plans]);

  const otherPlans = useMemo(() => {
    if (!cmp) return plans;
    const planId = cmp.planId as string | undefined;
    const planName = cmp.plan as string | undefined;
    return plans.filter((p) =>
      planId ? p.id !== planId : p.name !== planName
    );
  }, [plans, cmp]);

  const requestUpgrade = async (target: Plan) => {
    if (!companyId) return;

    setSending(true);
    try {
      const reqRef = doc(
        collection(db, `companies/${companyId}/billingRequests`)
      );

      await setDoc(reqRef, {
        type: "planUpgrade",
        companyId,
        fromPlanId: (cmp?.planId as string) || null,
        toPlanId: target.id,
        toPlanName: target.name,
        createdAt: serverTimestamp(),
        status: "pending",
      });

      alert("Demande envoyée avec succès.");
    } finally {
      setSending(false);
    }
  };

  if (loading || !cmp)
    return <div className="p-6">Chargement…</div>;

  const companySupport = (cmp.supportLevel as SupportLevel) || activePlan?.supportLevel || "basic";
  const supportInfo = SUPPORT_CONFIG[companySupport] ?? SUPPORT_CONFIG.basic;

  return (
    <div className="space-y-6">
      {/* CURRENT PLAN */}
      <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Votre plan</h2>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${supportInfo.color}`}>
            {supportInfo.icon}
            Support {supportInfo.label}
          </span>
        </div>

        {activePlan ? (
          <>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{activePlan.name}</h3>
                  {activePlan.isTrial && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Essai
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold mt-1">
                  {activePlan.priceMonthly === 0 ? (
                    <span className="text-green-600">Gratuit</span>
                  ) : (
                    <>
                      {nf.format(activePlan.priceMonthly)}
                      <span className="text-sm font-normal text-gray-500"> {currencySymbol}/mois</span>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Agences</p>
                <p className="text-xl font-bold">
                  {counts.agences} /{" "}
                  {(activePlan.maxAgences ?? 0) === 0 ? "∞" : activePlan.maxAgences}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Frais canal digital</p>
                <p className="text-xl font-bold text-[var(--btn-primary,#FF6600)]">
                  {activePlan.digitalFeePercent}%
                </p>
                <p className="text-xs text-gray-400 mt-1">sur réservations en ligne</p>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Quota réservations</p>
                <p className="text-xl font-bold">
                  {(activePlan.quotaReservations ?? 0) === 0
                    ? "Illimité"
                    : nf.format(activePlan.quotaReservations ?? 0)}
                </p>
                <p className="text-xs text-gray-400 mt-1">par mois</p>
              </div>
            </div>

            {/* All features included */}
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                <CheckCircle2 className="h-3 w-3" /> Gestion interne
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                <CheckCircle2 className="h-3 w-3" /> Page publique
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                <CheckCircle2 className="h-3 w-3" /> Réservation en ligne
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                <CheckCircle2 className="h-3 w-3" /> Guichet
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                <CheckCircle2 className="h-3 w-3" /> Tableau de bord
              </span>
            </div>
          </>
        ) : (
          <p className="text-gray-500">Aucun plan actif.</p>
        )}
      </section>

      {/* OTHER PLANS */}
      {otherPlans.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Autres plans disponibles</h3>

          <div className="grid md:grid-cols-3 gap-4">
            {otherPlans.map((p) => {
              const pSupport = SUPPORT_CONFIG[p.supportLevel] ?? SUPPORT_CONFIG.basic;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-gray-200 p-4 flex flex-col"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900">{p.name}</h4>
                      {p.isTrial && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 mt-1">
                          Essai
                        </span>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pSupport.color}`}>
                      {pSupport.icon}
                      {pSupport.label}
                    </span>
                  </div>

                  <div className="text-xl font-bold">
                    {p.priceMonthly === 0 ? (
                      <span className="text-green-600">Gratuit</span>
                    ) : (
                      <>
                        {nf.format(p.priceMonthly)}
                        <span className="text-sm font-normal text-gray-500"> {currencySymbol}/mois</span>
                      </>
                    )}
                  </div>

                  <div className="text-sm text-gray-600 space-y-1 mt-2 flex-1">
                    <div className="flex justify-between">
                      <span>Max agences</span>
                      <strong>{p.maxAgences === 0 ? "∞" : p.maxAgences}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Frais digital</span>
                      <strong className="text-[var(--btn-primary,#FF6600)]">{p.digitalFeePercent}%</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Quota</span>
                      <strong>
                        {(p.quotaReservations ?? 0) === 0
                          ? "Illimité"
                          : nf.format(p.quotaReservations ?? 0)}
                      </strong>
                    </div>
                  </div>

                  <Button
                    className="mt-3"
                    disabled={sending}
                    onClick={() => requestUpgrade(p)}
                    variant="primary"
                    size="sm"
                  >
                    Demander ce plan
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default ParametresPlan;
