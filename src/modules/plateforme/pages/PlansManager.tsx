import React, { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { CheckCircle2, Loader2, Pencil, Save, Star, X } from "lucide-react";
import { db, dbReady } from "@/firebaseConfig";
import {
  PLAN_KEYS,
  SYSTEM_PLANS_DEFAULTS,
  type SystemPlanId,
  type SystemPlansConfig,
  type SystemPlanValues,
} from "./systemPlansConfig";

const PLANS_SETTINGS_REF = doc(db, "adminSettings", "plans");
const numberFormatter = new Intl.NumberFormat("fr-FR");

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white";

const PLAN_CONTENT: Record<
  SystemPlanId,
  {
    subtitle: string;
    features: string[];
    painPoint?: string;
    socialProof?: string;
    extraLine?: string;
    decisionTrigger?: {
      title: string;
      detail: string;
    };
  }
> = {
  standard: {
    subtitle: "Gérez vos ventes et opérations au quotidien",
    features: [
      "Vente de billets (guichet + en ligne)",
      "Gestion des agences",
      "Suivi des paiements",
      "Gestion des colis basique",
    ],
    painPoint: "⚠️ Pas de visibilité financière avancée",
  },
  premium: {
    subtitle: "Prenez le contrôle total de vos revenus et de vos agences",
    features: [
      "Analyse financière avancée",
      "Suivi du cash en temps réel",
      "Performance multi-agences",
      "Détection des pertes et anomalies",
      "Rapports automatiques",
    ],
    socialProof: "⭐ Le plus utilisé par les compagnies en croissance",
    extraLine: "Idéal à partir de 7 000 opérations / mois",
    decisionTrigger: {
      title: "💡 Vous avez plus de 7 000 opérations / mois ?",
      detail: "→ Le plan Premium devient plus rentable pour vous.",
    },
  },
};

function normalizePlanValues(
  raw: unknown,
  fallback: SystemPlanValues
): SystemPlanValues {
  const data = raw && typeof raw === "object" ? (raw as Partial<SystemPlanValues>) : {};

  return {
    price: Number.isFinite(Number(data.price)) ? Number(data.price) : fallback.price,
    includedOperations: Number.isFinite(Number(data.includedOperations))
      ? Number(data.includedOperations)
      : fallback.includedOperations,
    overage: Number.isFinite(Number(data.overage)) ? Number(data.overage) : fallback.overage,
  };
}

function mergeWithDefaults(raw: unknown): SystemPlansConfig {
  const data = raw && typeof raw === "object" ? (raw as Partial<SystemPlansConfig>) : {};

  return {
    standard: {
      ...SYSTEM_PLANS_DEFAULTS.standard,
      ...normalizePlanValues(data.standard, SYSTEM_PLANS_DEFAULTS.standard),
    },
    premium: {
      ...SYSTEM_PLANS_DEFAULTS.premium,
      ...normalizePlanValues(data.premium, SYSTEM_PLANS_DEFAULTS.premium),
    },
  };
}

function isCompletePlansSettings(raw: unknown): boolean {
  const data = raw && typeof raw === "object" ? (raw as Partial<Record<SystemPlanId, Partial<SystemPlanValues>>>) : {};
  return PLAN_KEYS.every((planId) => {
    const plan = data[planId];
    return (
      plan != null &&
      Number.isFinite(Number(plan.price)) &&
      Number.isFinite(Number(plan.includedOperations)) &&
      Number.isFinite(Number(plan.overage))
    );
  });
}

function editablePayload(plans: SystemPlansConfig) {
  return {
    standard: {
      price: plans.standard.price,
      includedOperations: plans.standard.includedOperations,
      overage: plans.standard.overage,
    },
    premium: {
      price: plans.premium.price,
      includedOperations: plans.premium.includedOperations,
      overage: plans.premium.overage,
    },
  };
}

function PlanCard({
  planId,
  plan,
  highlighted,
  saving,
  onChange,
  onSave,
}: {
  planId: SystemPlanId;
  plan: SystemPlansConfig[SystemPlanId];
  highlighted?: boolean;
  saving: boolean;
  onChange: (planId: SystemPlanId, field: keyof SystemPlanValues, value: number) => void;
  onSave: (planId: SystemPlanId) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const content = PLAN_CONTENT[planId];
  const cardTone = highlighted
    ? "border-2 border-orange-500 bg-white shadow-xl shadow-orange-900/15 ring-2 ring-orange-100 lg:scale-[1.04] lg:hover:scale-[1.06] dark:border-orange-500 dark:bg-slate-900 dark:ring-orange-900/40"
    : "border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600";
  const accentText = highlighted ? "text-orange-700 dark:text-orange-300" : "text-slate-900 dark:text-white";
  const accentBg = highlighted
    ? "bg-orange-600 hover:bg-orange-700"
    : "bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600";

  return (
    <section
      className={[
        "relative flex flex-col rounded-xl border p-6 transition-all duration-200 hover:-translate-y-1 md:p-8",
        cardTone,
      ].join(" ")}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className={["text-3xl font-black", accentText].join(" ")}>
            {plan.name}
          </h2>
          <p className="mt-2 max-w-sm text-base font-medium leading-6 text-slate-600 dark:text-slate-300">
            {content.subtitle}
          </p>
          {content.socialProof && (
            <p className="mt-3 inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-100 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900/60">
              {content.socialProof}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {highlighted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
              <Star className="h-3.5 w-3.5" />
              Recommandé
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditMode((value) => !value)}
            aria-label={editMode ? "Fermer l'édition" : `Modifier ${plan.name}`}
            title={editMode ? "Fermer" : "Modifier"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-orange-800 dark:hover:bg-orange-950/60 dark:hover:text-orange-300"
          >
            {editMode ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <ul className="mb-7 grid gap-3">
        {content.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-3 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <span
              className={[
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                highlighted ? "bg-orange-50 text-orange-600 dark:bg-orange-950" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
              ].join(" ")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {content.painPoint && (
        <p className="mb-6 inline-flex items-center rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900/50">
          {content.painPoint}
        </p>
      )}

      <div className="mt-auto border-t border-slate-100 pt-6 dark:border-slate-800">
        <div className="flex flex-col gap-1">
          <div className="text-4xl font-black text-slate-950 dark:text-white">
            {numberFormatter.format(plan.price)} FCFA
          </div>
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">/ mois</div>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {numberFormatter.format(plan.includedOperations)} opérations incluses
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            +{numberFormatter.format(plan.overage)} FCFA / opération supplémentaire
          </p>
          {content.extraLine && (
            <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
              {content.extraLine}
            </p>
          )}
          {content.decisionTrigger && (
            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/80 p-4 text-sm text-orange-900 shadow-sm dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-200">
              <p className="font-black">{content.decisionTrigger.title}</p>
              <p className="mt-1 font-semibold">{content.decisionTrigger.detail}</p>
            </div>
          )}
        </div>
      </div>

      {editMode && (
        <div className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Prix mensuel
            </span>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={plan.price}
              onChange={(event) => onChange(planId, "price", Number(event.target.value))}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Opérations incluses
            </span>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={plan.includedOperations}
              onChange={(event) => onChange(planId, "includedOperations", Number(event.target.value))}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Coût après le quota
            </span>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={plan.overage}
              onChange={(event) => onChange(planId, "overage", Number(event.target.value))}
            />
          </label>
        </div>
      )}

      {editMode && (
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(planId)}
          className={[
            "mt-6 inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60",
            accentBg,
          ].join(" ")}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </button>
      )}
    </section>
  );
}

export default function PlansManager() {
  const [plans, setPlans] = useState<SystemPlansConfig>(SYSTEM_PLANS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState<SystemPlanId | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      setLoading(true);
      try {
        await dbReady;
        const snap = await getDoc(PLANS_SETTINGS_REF);
        const nextPlans = mergeWithDefaults(snap.exists() ? snap.data() : null);
        if (!snap.exists() || !isCompletePlansSettings(snap.data())) {
          await setDoc(PLANS_SETTINGS_REF, editablePayload(nextPlans));
        }
        if (!cancelled) {
          setPlans(nextPlans);
          if (!snap.exists()) {
            setStatusMessage("Configuration initialisee dans Firestore.");
          }
        }
      } catch (error) {
        console.error("[PlansManager] load plans failed", error);
        if (!cancelled) {
          setPlans(SYSTEM_PLANS_DEFAULTS);
          setStatusMessage("Valeurs par défaut chargées. Firestore indisponible.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPlans();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasInvalidValue = useMemo(
    () =>
      PLAN_KEYS.some((key) => {
        const plan = plans[key];
        return plan.price < 0 || plan.includedOperations < 0 || plan.overage < 0;
      }),
    [plans]
  );

  const updateField = (
    planId: SystemPlanId,
    field: keyof SystemPlanValues,
    value: number
  ) => {
    setStatusMessage(null);
    setPlans((current) => ({
      ...current,
      [planId]: {
        ...current[planId],
        [field]: Number.isFinite(value) ? value : 0,
      },
    }));
  };

  const savePlan = async (planId: SystemPlanId) => {
    if (hasInvalidValue) {
      setStatusMessage("Les valeurs doivent être positives.");
      return;
    }

    setSavingPlan(planId);
    setStatusMessage(null);
    try {
      await setDoc(PLANS_SETTINGS_REF, editablePayload(plans));
      setStatusMessage(`${plans[planId].name} enregistré.`);
    } catch (error) {
      console.error("[PlansManager] save plan failed", error);
      setStatusMessage("Enregistrement impossible. Réessayez.");
    } finally {
      setSavingPlan(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            Plans & Tarifs
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Deux offres claires pour vendre, contrôler et faire grandir les compagnies de transport.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" />
          STANDARD + PREMIUM uniquement
        </div>
      </header>

      {statusMessage && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {statusMessage}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Chargement des plans...
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
          <PlanCard
            planId="standard"
            plan={plans.standard}
            saving={savingPlan === "standard"}
            onChange={updateField}
            onSave={savePlan}
          />
          <PlanCard
            planId="premium"
            plan={plans.premium}
            highlighted
            saving={savingPlan === "premium"}
            onChange={updateField}
            onSave={savePlan}
          />
        </div>
      )}
    </div>
  );
}
