/**
 * Section « État des validations » — uniquement sessions guichet non terminées (pending / active / paused).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalMoneyPositions } from "@/contexts/GlobalMoneyPositionsContext";
import { SectionCard, MetricCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { Users } from "lucide-react";
import { SHIFT_STATUS } from "@/modules/agence/constants/sessionLifecycle";
import {
  resolveLiquidCompanyColors,
  liquidityMetricCardBaseClassName,
  liquidityMetricIconClassName,
  liquidMetricCardStyle,
  liquidMetricValueColor,
  liquidMetricAccentForVariant,
} from "../financesLiquidityCardStyles";
import { useHtmlDarkClass } from "@/shared/hooks/useHtmlDarkClass";
import InfoTooltip from "@/shared/ui/InfoTooltip";

const OPEN_SHIFT_STATUSES = [SHIFT_STATUS.PENDING, SHIFT_STATUS.ACTIVE, SHIFT_STATUS.PAUSED];

export default function FinancesCaisseTab() {
  const { user, company } = useAuth();
  const { primary, secondary } = useMemo(() => resolveLiquidCompanyColors(company ?? undefined), [company]);
  const isDark = useHtmlDarkClass();
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
          const qShifts = query(shiftsRef, where("status", "in", OPEN_SHIFT_STATUSES), limit(80));
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

  const montantAttente =
    sessionsNonValidees == null
      ? "—"
      : sessionsNonValidees === 0
        ? Math.abs(pendingBrut) <= 0.01
          ? money(0)
          : null
        : money(pendingBrut);

  /** Rien à signaler : aucun poste ouvert et aucun montant en attente. */
  const masquerBloc =
    sessionsNonValidees !== null &&
    sessionsNonValidees === 0 &&
    Math.abs(pendingBrut) <= 0.01 &&
    montantAttente !== null;

  if (masquerBloc) {
    return null;
  }

  return (
    <section aria-labelledby="finances-validations" className="space-y-4">
      <SectionCard title="État des validations (guichet)" icon={Users}>
        <div className="mb-3 flex justify-end">
          <InfoTooltip label="Compte uniquement les postes ouverts ou en attente d'activation. Les sessions validées sont exclues." />
        </div>
        <div className="grid grid-cols-2 gap-2 min-w-0 sm:gap-4">
          <MetricCard
            label="Postes en cours (non validés)"
            value={sessionsNonValidees == null ? "—" : String(sessionsNonValidees)}
            icon={Users}
            className={liquidityMetricCardBaseClassName}
            style={liquidMetricCardStyle({ variant: "total", primary, secondary, isDark })}
            valueColorVar={liquidMetricValueColor(
              liquidMetricAccentForVariant("total", primary, secondary),
              isDark
            )}
            iconWrapperClassName={liquidityMetricIconClassName}
          />
          {montantAttente != null ? (
            <MetricCard
              label="Montant en attente de validation"
              value={montantAttente}
              icon={Users}
              className={liquidityMetricCardBaseClassName}
              style={liquidMetricCardStyle({ variant: "cash", primary, secondary, isDark })}
              valueColorVar={liquidMetricValueColor(
                liquidMetricAccentForVariant("cash", primary, secondary),
                isDark
              )}
              iconWrapperClassName={liquidityMetricIconClassName}
            />
          ) : null}
        </div>
      </SectionCard>
    </section>
  );
}
