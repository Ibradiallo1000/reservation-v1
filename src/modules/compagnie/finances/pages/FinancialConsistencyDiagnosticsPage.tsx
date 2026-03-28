import React, { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard } from "@/ui";
import { Button } from "@/shared/ui/button";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getStartOfDayInBamako, getEndOfDayInBamako, getTodayBamako } from "@/shared/date/dateUtilsTz";
import { reconcilePaymentsAndMovements, repairPaymentsAndMovementsInPeriod } from "@/services/reconciliationService";
import { computeCrossPageConsistency, computeDivergenceInPeriod } from "@/services/metricsService";
import { RefreshCw, AlertTriangle, ShieldCheck, Activity } from "lucide-react";

export default function FinancialConsistencyDiagnosticsPage() {
  const { user } = useAuth() as any;
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const money = useFormatCurrency();

  const today = useMemo(() => getTodayBamako(), []);
  const [startDateStr, setStartDateStr] = useState<string>(today);
  const [endDateStr, setEndDateStr] = useState<string>(today);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    missingMovement: string[];
    orphanMovement: string[];
    repaired?: number;
    paymentsTotal?: number;
    movementsTotal?: number;
    difference?: number;
    crossPageCollections?: number;
  } | null>(null);

  const period = useMemo(() => {
    const start = getStartOfDayInBamako(startDateStr);
    const end = getEndOfDayInBamako(endDateStr);
    return { start, end };
  }, [startDateStr, endDateStr]);

  const validatePeriod = useCallback(() => {
    if (!startDateStr || !endDateStr) return "Dates requises.";
    if (period.start.getTime() > period.end.getTime()) return "La date de début doit être <= date de fin.";
    if (!companyId) return "companyId introuvable.";
    return null;
  }, [startDateStr, endDateStr, period, companyId]);

  const runAll = useCallback(async () => {
    const err = validatePeriod();
    if (err) {
      alert(err);
      return;
    }
    setRunning(true);
    try {
      const [reconciliation, divergence, cross] = await Promise.all([
        reconcilePaymentsAndMovements(companyId, period.start, period.end),
        computeDivergenceInPeriod(companyId, period.start, period.end),
        computeCrossPageConsistency(companyId, startDateStr, endDateStr),
      ]);

      setResult({
        missingMovement: reconciliation.missingMovement,
        orphanMovement: reconciliation.orphanMovement,
        paymentsTotal: divergence.paymentsTotal,
        movementsTotal: divergence.movementsTotal,
        difference: divergence.difference,
        crossPageCollections: cross.kpi.collections,
      });
    } finally {
      setRunning(false);
    }
  }, [companyId, period.end, period.start, validatePeriod]);

  const runRepairIfNeeded = useCallback(async () => {
    const err = validatePeriod();
    if (err) {
      alert(err);
      return;
    }
    setRunning(true);
    try {
      const rec = await reconcilePaymentsAndMovements(companyId, period.start, period.end);
      const repairedInfo = rec.missingMovement.length
        ? await repairPaymentsAndMovementsInPeriod(companyId, period.start, period.end)
        : { repaired: 0, missingBefore: 0, orphanMovementCount: rec.orphanMovement.length };

      const divergence = await computeDivergenceInPeriod(companyId, period.start, period.end);
      const reconciliationAfter = await reconcilePaymentsAndMovements(companyId, period.start, period.end);

      setResult({
        missingMovement: reconciliationAfter.missingMovement,
        orphanMovement: reconciliationAfter.orphanMovement,
        repaired: repairedInfo.repaired,
        paymentsTotal: divergence.paymentsTotal,
        movementsTotal: divergence.movementsTotal,
        difference: divergence.difference,
      });
    } finally {
      setRunning(false);
    }
  }, [companyId, period.end, period.start, validatePeriod]);

  const critical = (result?.difference ?? 0) !== 0 || (result?.orphanMovement.length ?? 0) > 0;
  const missingCount = result?.missingMovement.length ?? 0;
  const orphanCount = result?.orphanMovement.length ?? 0;

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-5xl">
      <PageHeader
        title="Diagnostics cohérence financière"
        subtitle="Exécute la réconciliation du journal financier (`financialTransactions`) ↔ mouvements de trésorerie, avec métriques de divergence sur une période. Ne modifie pas les dashboards."
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button
              variant="secondary"
              onClick={runAll}
              disabled={running}
              className="min-h-[40px]"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} />
              Réconciliation + métriques
            </Button>
            <Button
              onClick={runRepairIfNeeded}
              disabled={running}
              className="min-h-[40px]"
              variant={missingCount > 0 ? "danger" : "secondary"}
            >
              <ShieldCheck className="h-4 w-4 mr-1" />
              Réparer les manquants (période)
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Période" help={<span className="text-sm text-gray-500">payments validés + mouvements horodatés (performedAt)</span>}>
          <div className="flex flex-col gap-3">
            <label className="text-sm text-gray-700">
              Date début
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                disabled={running}
              />
            </label>
            <label className="text-sm text-gray-700">
              Date fin
              <input
                type="date"
                value={endDateStr}
                onChange={(e) => setEndDateStr(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                disabled={running}
              />
            </label>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600">
              Conseil : test rapide = <span className="font-medium">{today}</span> → <span className="font-medium">{today}</span>
            </div>
          </div>
        </SectionCard>

        <div className="lg:col-span-2 space-y-4">
          <SectionCard
            title="Synthèse"
            help={
              <span className="text-sm text-gray-500">
                attente : 0 missing, 0 orphan, divergence ≈ 0
              </span>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <MetricCard
                label="Payments confirmés"
                value={result?.paymentsTotal != null ? money(result.paymentsTotal) : "—"}
                icon={Activity}
                critical={false}
              />
              <MetricCard
                label="Mouvements de paiement"
                value={result?.movementsTotal != null ? money(result.movementsTotal) : "—"}
                icon={Activity}
                critical={false}
              />
              <MetricCard
                label="Divergence (|payments - mouvements|)"
                value={result?.difference != null ? money(result.difference) : "—"}
                icon={AlertTriangle}
                critical={critical}
                criticalMessage={critical ? "À vérifier (écart ou orphelins)" : undefined}
              />
              <MetricCard
                label="Encaissements cross-pages"
                value={result?.crossPageCollections != null ? money(result.crossPageCollections) : "—"}
                icon={ShieldCheck}
                critical={false}
              />
            </div>
          </SectionCard>

          <SectionCard title="Anomalies" help={<span className="text-sm text-gray-500">alignement payments ↔ mouvements</span>}>
            {result ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Mouvements manquants</span>
                  <span className={missingCount === 0 ? "text-emerald-700" : "text-amber-700"}>
                    {missingCount}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Mouvements orphelins</span>
                  <span className={orphanCount === 0 ? "text-emerald-700" : "text-red-700"}>{orphanCount}</span>
                </div>

                {result.repaired != null && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
                    Réparation exécutée : <span className="font-medium">{result.repaired}</span> mouvements créés.
                  </div>
                )}

                {(result.missingMovement.length > 0 || result.orphanMovement.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border border-gray-200 p-3 text-sm">
                      <div className="font-medium mb-2">Exemples manquants</div>
                      <div className="font-mono break-all text-xs text-gray-700">
                        {(result.missingMovement ?? []).slice(0, 8).map((id) => (
                          <div key={id}>{id}</div>
                        ))}
                        {result.missingMovement.length > 8 ? <div>…</div> : null}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 p-3 text-sm">
                      <div className="font-medium mb-2">Exemples orphelins</div>
                      <div className="font-mono break-all text-xs text-gray-700">
                        {(result.orphanMovement ?? []).slice(0, 8).map((id) => (
                          <div key={id}>{id}</div>
                        ))}
                        {result.orphanMovement.length > 8 ? <div>…</div> : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                Cliquez sur <span className="font-medium">Réconciliation + métriques</span> pour lancer l’analyse sur la période sélectionnée.
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </StandardLayoutWrapper>
  );
}

