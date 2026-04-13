/**
 * Section "Etat des validations" - sessions guichet non terminees (pending/active/paused).
 */
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalMoneyPositions } from "@/contexts/GlobalMoneyPositionsContext";
import { SectionCard, MetricCard } from "@/ui";
import { dashboardKpiMinWidth } from "@/ui/foundation";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { ChevronRight, Users } from "lucide-react";
import { SHIFT_STATUS } from "@/modules/agence/constants/sessionLifecycle";
import {
  liquidityMetricCardBaseClassName,
  liquidityMetricIconClassName,
} from "../financesLiquidityCardStyles";
import InfoTooltip from "@/shared/ui/InfoTooltip";

const OPEN_SHIFT_STATUSES = [SHIFT_STATUS.PENDING, SHIFT_STATUS.ACTIVE, SHIFT_STATUS.PAUSED];

export default function FinancesCaisseTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { companyId: routeId } = useParams<{ companyId: string }>();
  const companyId = routeId ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const positions = useGlobalMoneyPositions();
  const [sessionsNonValidees, setSessionsNonValidees] = useState<number | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    (async () => {
      try {
        const agencesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
        let n = 0;
        for (const d of agencesSnap.docs) {
          const shiftsRef = collection(db, "companies", companyId, "agences", d.id, "shifts");
          const qShifts = query(shiftsRef, where("status", "in", OPEN_SHIFT_STATUSES));
          const shiftsSnap = await getDocs(qShifts);
          n += shiftsSnap.size;
        }
        if (!cancelled) setSessionsNonValidees(n);
      } catch {
        if (!cancelled) setSessionsNonValidees(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const pendingBrut = positions.snapshot.pendingGuichet;
  const mismatchPending = sessionsNonValidees !== null && sessionsNonValidees === 0 && Math.abs(pendingBrut) > 0.01;
  const montantAttente = sessionsNonValidees == null ? "-" : money(pendingBrut);
  const dossiersEnAttente = sessionsNonValidees == null ? "-" : String(sessionsNonValidees);
  const validationScope = ["Billetterie", "Colis", "Guichet"];
  const hasPending = Math.abs(pendingBrut) > 0.01;
  const validationTone =
    sessionsNonValidees == null
      ? "neutral"
      : sessionsNonValidees > 0 || hasPending
        ? "negative"
        : "positive";

  // Masquer seulement quand il n'y a vraiment rien a surveiller.
  const masquerBloc = sessionsNonValidees !== null && sessionsNonValidees === 0 && Math.abs(pendingBrut) <= 0.01;

  if (masquerBloc) {
    return null;
  }

  return (
    <section aria-labelledby="finances-validations" className="space-y-4">
      <SectionCard
        title="Validations en attente"
        icon={Users}
        help={
          <InfoTooltip label="Suivi prioritaire des dossiers de validation en attente." />
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {validationScope.map((scope) => (
            <span
              key={scope}
              className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              {scope}
            </span>
          ))}
        </div>

        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/55">
          <p className="font-medium text-slate-700 dark:text-slate-200">
            {validationTone === "negative"
              ? "Des validations restent a traiter."
              : validationTone === "neutral"
                ? "Etat de validation en verification."
                : "Aucun retard de validation detecte."}
          </p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              validationTone === "negative"
                ? "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-900/45 dark:text-orange-200"
                : validationTone === "positive"
                  ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200"
                  : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {validationTone === "negative" ? "a traiter" : validationTone === "positive" ? "ok" : "neutre"}
          </span>
        </div>
        {validationTone === "negative" ? (
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/comptabilite/validation`)}
            className="mb-3 inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/35 dark:text-orange-100 dark:hover:bg-orange-900/45"
          >
            Valider les guichets
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/comptabilite/validation`)}
            className="text-left"
          >
            <MetricCard
              label="Dossiers en attente"
              value={dossiersEnAttente}
              hint="Acces direct aux validations comptables"
              icon={Users}
              className={`${liquidityMetricCardBaseClassName} ${dashboardKpiMinWidth} cursor-pointer`}
              iconWrapperClassName={liquidityMetricIconClassName}
            />
            <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Ouvrir le detail
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/digital-cash`)}
            className="text-left"
          >
            <MetricCard
              label="Montant total en attente"
              value={montantAttente}
              hint="Acces direct a la validation des paiements"
              icon={Users}
              critical={mismatchPending}
              criticalMessage={mismatchPending ? "A verifier: montant en attente non nul sans poste ouvert." : undefined}
              className={`${liquidityMetricCardBaseClassName} ${dashboardKpiMinWidth} cursor-pointer`}
              iconWrapperClassName={liquidityMetricIconClassName}
            />
            <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Ouvrir le detail
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </div>
          </button>
        </div>
      </SectionCard>
    </section>
  );
}
