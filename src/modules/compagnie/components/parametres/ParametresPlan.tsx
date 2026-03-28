// =============================================
// src/modules/compagnie/components/parametres/ParametresPlan.tsx
// VERSION MULTI-RÔLE – Dual-revenue model
// =============================================
import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/firebaseConfig";
import { useCurrencySymbol } from "@/shared/currency/CurrencyContext";
import { Button } from "@/shared/ui/button";
import { SectionCard, StatusBadge } from "@/ui";
import type { StatusVariant } from "@/ui";
import { CheckCircle2, Shield, Star, Zap, Crown } from "lucide-react";
import GenerateTripInstancesPlanningCard from "@/modules/compagnie/components/parametres/GenerateTripInstancesPlanningCard";
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

  return (
    <div className="space-y-6">
      <SectionCard title="Votre plan" icon={Shield}>
        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={supportToVariant(companySupport)}>
            Support {SUPPORT_LABELS[companySupport]}
          </StatusBadge>
        </div>

        {activePlan ? (
          <>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{activePlan.name}</h3>
                  {activePlan.isTrial && (
                    <StatusBadge status="warning">Essai</StatusBadge>
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

            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
              <StatusBadge status="success"><CheckCircle2 className="h-3 w-3 inline mr-1" /> Gestion interne</StatusBadge>
              <StatusBadge status="success"><CheckCircle2 className="h-3 w-3 inline mr-1" /> Page publique</StatusBadge>
              <StatusBadge status="success"><CheckCircle2 className="h-3 w-3 inline mr-1" /> Réservation en ligne</StatusBadge>
              <StatusBadge status="success"><CheckCircle2 className="h-3 w-3 inline mr-1" /> Guichet</StatusBadge>
              <StatusBadge status="success"><CheckCircle2 className="h-3 w-3 inline mr-1" /> Tableau de bord</StatusBadge>
            </div>
          </>
        ) : (
          <p className="text-gray-500">Aucun plan actif.</p>
        )}
      </SectionCard>

      {otherPlans.length > 0 && (
        <SectionCard title="Autres plans disponibles" icon={Star}>
          <div className="grid md:grid-cols-3 gap-4">
            {otherPlans.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-gray-200 p-4 flex flex-col"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900">{p.name}</h4>
                      {p.isTrial && (
                        <StatusBadge status="warning" className="mt-1">Essai</StatusBadge>
                      )}
                    </div>
                    <StatusBadge status={supportToVariant(p.supportLevel)}>
                      {SUPPORT_LABELS[p.supportLevel]}
                    </StatusBadge>
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
            ))}
          </div>
        </SectionCard>
      )}

      <GenerateTripInstancesPlanningCard companyId={companyId} />
    </div>
  );
};

export default ParametresPlan;
