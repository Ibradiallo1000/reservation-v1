// src/modules/plateforme/pages/AdminCompanyPlan.tsx
// Updated for dual-revenue model: monthly subscription + digital channel fee
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "@/firebaseConfig";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { Button } from "@/shared/ui/button";
import { CheckCircle2 } from "lucide-react";
import { formatCurrency, getCurrencySymbol } from "@/shared/utils/formatCurrency";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";

/* ====================================================================
   TYPES
==================================================================== */
type SupportLevel = "basic" | "standard" | "priority" | "premium" | "enterprise";

type PlanDoc = {
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
  features: { publicPage: boolean; onlineBooking: boolean; guichet: boolean };
};

type CompanyDoc = {
  id: string;
  nom?: string;
  planId?: string;
  plan?: string;
  publicPageEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  guichetEnabled?: boolean;
  digitalFeePercent?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  maxAgences?: number;
  supportLevel?: SupportLevel;
  planType?: "trial" | "paid";
};

const nf = new Intl.NumberFormat("fr-FR");

const SUPPORT_LABELS: Record<SupportLevel, string> = {
  basic: "Basic",
  standard: "Standard",
  priority: "Prioritaire",
  premium: "Premium",
  enterprise: "Enterprise",
};

/* ====================================================================
   COMPONENT
==================================================================== */
export default function AdminCompanyPlan() {
  const isOnline = useOnlineStatus();
  const { companyId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [company, setCompany] = useState<CompanyDoc | null>(null);

  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  const [plansById, setPlansById] = useState<Record<string, PlanDoc>>({});

  const [chosenPlanId, setChosenPlanId] = useState<string>("");

  const chosenPlan = useMemo<PlanDoc | null>(
    () => (chosenPlanId ? plansById[chosenPlanId] ?? null : null),
    [chosenPlanId, plansById]
  );

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    const unsub: Array<() => void> = [];

    const offCompany = onSnapshot(
      doc(db, "companies", companyId),
      (snap) => {
        if (snap.exists()) {
          const c = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as CompanyDoc;
          setCompany(c);
          setChosenPlanId((curr) => (curr ? curr : c.planId || ""));
        } else {
          setCompany(null);
        }
        setLoading(false);
      },
      () => {
        setLoadError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger la compagnie."
            : "Erreur lors du chargement de la compagnie."
        );
        setLoading(false);
      }
    );
    unsub.push(offCompany);

    const q = query(collection(db, "plans"), orderBy("priceMonthly", "asc"));
    const offPlans = onSnapshot(
      q,
      (qs) => {
        const list: Array<{ id: string; name: string }> = [];
        const map: Record<string, PlanDoc> = {};
        qs.docs.forEach((d) => {
          const data = d.data() as PlanDoc;
          list.push({ id: d.id, name: data.name || d.id });
          map[d.id] = data;
        });
        setPlans(list);
        setPlansById(map);
      },
      () => {
        setLoadError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger les plans."
            : "Erreur lors du chargement des plans."
        );
      }
    );
    unsub.push(offPlans);

    return () => unsub.forEach((u) => u());
  }, [companyId, isOnline, reloadKey]);

  async function applySelectedPlan() {
    if (!companyId || !chosenPlanId) return;
    const p = plansById[chosenPlanId];
    if (!p) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "companies", companyId), {
        planId: chosenPlanId,
        plan: p.name,
        // All features always enabled
        publicPageEnabled: true,
        onlineBookingEnabled: true,
        guichetEnabled: true,
        // New dual-revenue fields
        digitalFeePercent: Number(p.digitalFeePercent || 0),
        supportLevel: p.supportLevel || "basic",
        planType: p.isTrial ? "trial" : "paid",
        feeGuichet: Number(p.feeGuichet || 0),
        minimumMonthly: Number(p.minimumMonthly || 0),
        maxAgences: Number(p.maxAgences || 0),
        updatedAt: serverTimestamp(),
      });

      alert("Plan appliqué à la compagnie ✅");
      navigate(-1);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !company) {
    return <PageLoadingState />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: les données de plan peuvent être incomplètes." />
      )}
      {loadError && (
        <PageErrorState message={loadError} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      <h1 className="text-2xl font-bold text-gray-900">
        Plan & options — {company.nom || "Compagnie"}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Plan (modèle)</label>
          <select
            value={chosenPlanId}
            onChange={(e) => setChosenPlanId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--btn-primary,#FF6600)] focus:outline-none focus:ring-2 focus:ring-[var(--btn-primary,#FF6600)]/20"
          >
            <option value="">— Sélectionner —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Plan actuel</label>
          <div className="mt-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm">
            {company.plan ? company.plan : "—"}
          </div>
        </div>
      </div>

      {/* Plan preview */}
      {chosenPlan && (
        <div className="rounded-xl border border-gray-200 shadow-sm p-5 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Aperçu : {chosenPlan.name}
            </h3>
            <div className="flex items-center gap-2">
              {chosenPlan.isTrial && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Essai
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 capitalize">
                {SUPPORT_LABELS[chosenPlan.supportLevel] ?? "Basic"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-gray-500">Prix mensuel</div>
              <div className="text-xl font-bold">
                {chosenPlan.priceMonthly === 0 ? (
                  <span className="text-green-600">Gratuit</span>
                ) : (
                  <>{formatCurrency(chosenPlan.priceMonthly)}</>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-gray-500">Agences max</div>
              <div className="font-bold text-lg">
                {(chosenPlan.maxAgences ?? 0) === 0 ? "Illimité" : chosenPlan.maxAgences}
              </div>
              <div className="text-gray-500 mt-2">Quota réservations</div>
              <div className="font-bold">
                {(chosenPlan.quotaReservations ?? 0) === 0
                  ? "Illimité"
                  : nf.format(chosenPlan.quotaReservations ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="text-gray-500">Frais canal digital</div>
              <div className="font-bold text-lg text-[var(--btn-primary,#FF6600)]">
                {chosenPlan.digitalFeePercent ?? 0}%
              </div>
              {(chosenPlan.feeGuichet ?? 0) > 0 && (
                <>
                  <div className="text-gray-500 mt-2">Frais guichet</div>
                  <div className="font-bold">{formatCurrency(chosenPlan.feeGuichet)}/billet</div>
                </>
              )}
            </div>
          </div>

          {/* All features included */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              <CheckCircle2 className="h-3 w-3" /> Page publique
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              <CheckCircle2 className="h-3 w-3" /> Réservation en ligne
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              <CheckCircle2 className="h-3 w-3" /> Guichet
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Annuler
        </Button>
        <Button
          onClick={applySelectedPlan}
          disabled={!chosenPlanId || saving}
          variant="primary"
        >
          {saving ? "Application…" : "Appliquer ce plan"}
        </Button>
      </div>
    </div>
  );
}
