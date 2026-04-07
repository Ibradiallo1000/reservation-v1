/**
 * Section « Argent disponible » — liquidité ledger (total, caisse, banque) +
 * encaissements en ligne par moyen (agrégation réservations payées, clé preuveVia).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, getDoc, getDocs, doc, limit, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { SectionCard, MetricCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getLedgerBalances } from "@/modules/compagnie/treasury/financialTransactions";
import { Wallet, Landmark, Smartphone } from "lucide-react";
import {
  aggregateOnlinePaidByPreuveVia,
  mergePaymentMethodDisplayKeys,
  type ReservationLike,
} from "../financesCeoPaymentAggregation";
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

type ConfiguredMethod = { id: string; name: string };

export default function FinancesLiquiditesTab() {
  const { user, company } = useAuth();
  const { primary, secondary } = useMemo(() => resolveLiquidCompanyColors(company ?? undefined), [company]);
  const isDark = useHtmlDarkClass();
  const { companyId: routeId } = useParams<{ companyId: string }>();
  const companyId = routeId ?? user?.companyId ?? "";
  const money = useFormatCurrency();

  const [ledger, setLedger] = useState<{ total: number; cash: number; mobileMoney: number; bank: number } | null>(null);
  const [methods, setMethods] = useState<ConfiguredMethod[]>([]);
  const [companyPaymentMethodKeys, setCompanyPaymentMethodKeys] = useState<string[]>([]);
  const [reservationRows, setReservationRows] = useState<ReservationLike[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const companyRef = doc(db, "companies", companyId);
        const [bal, pmSnap, companySnap, agencesSnap] = await Promise.all([
          getLedgerBalances(companyId),
          getDocs(query(collection(db, "paymentMethods"), where("companyId", "==", companyId))),
          getDoc(companyRef),
          getDocs(collection(db, "companies", companyId, "agences")),
        ]);
        if (cancelled) return;

        const pmRoot = companySnap.exists() ? (companySnap.data() as { paymentMethods?: Record<string, unknown> }).paymentMethods : undefined;
        const mirrorKeys = pmRoot && typeof pmRoot === "object" ? Object.keys(pmRoot) : [];

        const mth: ConfiguredMethod[] = pmSnap.docs.map((d) => {
          const x = d.data() as { name?: string };
          return { id: d.id, name: String(x.name ?? "").trim() };
        });
        mth.sort((a, b) => a.name.localeCompare(b.name, "fr"));

        const resRows: ReservationLike[] = [];
        for (const ag of agencesSnap.docs) {
          const rRef = collection(db, "companies", companyId, "agences", ag.id, "reservations");
          const rSnap = await getDocs(query(rRef, limit(4000)));
          rSnap.docs.forEach((d) => {
            resRows.push({ ...d.data(), companyId, agencyId: ag.id });
          });
        }

        if (cancelled) return;
        setLedger({
          total: bal.total,
          cash: bal.cash,
          mobileMoney: bal.mobileMoney,
          bank: bal.bank,
        });
        setMethods(mth);
        setCompanyPaymentMethodKeys(mirrorKeys);
        setReservationRows(resRows);
      } catch (e) {
        console.error("[FinancesLiquiditesTab]", e);
        setLedger(null);
        setMethods([]);
        setCompanyPaymentMethodKeys([]);
        setReservationRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const { paymentTotals, reservationsAmountSum, includedCount } = useMemo(
    () => aggregateOnlinePaidByPreuveVia(reservationRows),
    [reservationRows]
  );

  const displayKeys = useMemo(
    () =>
      mergePaymentMethodDisplayKeys({
        paymentTotals,
        configuredMethodNames: methods.map((m) => m.name).filter(Boolean),
        companyPaymentMethodFieldKeys: companyPaymentMethodKeys,
      }),
    [paymentTotals, methods, companyPaymentMethodKeys]
  );

  useEffect(() => {
    const shownSum = displayKeys.reduce((s, k) => s + (paymentTotals.get(k) ?? 0), 0);
    if (Math.abs(shownSum - reservationsAmountSum) > 0.01) {
      console.error("[Finances] Total affiché (moyens) ≠ somme réservations payées en ligne", {
        shownSum,
        reservationsAmountSum,
        displayKeysCount: displayKeys.length,
      });
    }
  }, [displayKeys, paymentTotals, reservationsAmountSum]);

  const totalsCoherent = useMemo(() => {
    if (!ledger) return false;
    const recomputed = ledger.cash + ledger.mobileMoney + ledger.bank;
    return Math.abs(ledger.total - recomputed) <= 1;
  }, [ledger]);

  const totalDisplay = useMemo(() => {
    if (loading && !ledger) return null;
    if (!ledger) return "unavailable" as const;
    if (!totalsCoherent) return "unavailable" as const;
    return "ok" as const;
  }, [loading, ledger, totalsCoherent]);

  return (
    <section aria-labelledby="finances-argent-disponible" className="space-y-4">
      <SectionCard title="Argent disponible" icon={Wallet}>
        <div className="mb-3 flex items-center justify-end">
          <InfoTooltip label="Solde réel consolidé (caisse agences + banque). Répartition calculée depuis les paiements effectivement reçus." />
        </div>
        {loading && !ledger ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 min-w-0 sm:gap-4">
              <MetricCard
                label="Total disponible"
                value={totalDisplay === "ok" && ledger ? money(ledger.total) : "Donnée non disponible"}
                icon={Wallet}
                className={liquidityMetricCardBaseClassName}
                style={liquidMetricCardStyle({ variant: "total", primary, secondary, isDark })}
                valueColorVar={liquidMetricValueColor(
                  liquidMetricAccentForVariant("total", primary, secondary),
                  isDark
                )}
                iconWrapperClassName={liquidityMetricIconClassName}
              />
              <MetricCard
                label="Caisse (agences)"
                value={ledger ? money(ledger.cash) : "Donnée non disponible"}
                icon={Wallet}
                className={liquidityMetricCardBaseClassName}
                style={liquidMetricCardStyle({ variant: "cash", primary, secondary, isDark })}
                valueColorVar={liquidMetricValueColor(
                  liquidMetricAccentForVariant("cash", primary, secondary),
                  isDark
                )}
                iconWrapperClassName={liquidityMetricIconClassName}
              />
              <MetricCard
                label="Banque (entreprise)"
                value={ledger ? money(ledger.bank) : "Donnée non disponible"}
                icon={Landmark}
                className={liquidityMetricCardBaseClassName}
                style={liquidMetricCardStyle({ variant: "bank", primary, secondary, isDark })}
                valueColorVar={liquidMetricValueColor(
                  liquidMetricAccentForVariant("bank", primary, secondary),
                  isDark
                )}
                iconWrapperClassName={liquidityMetricIconClassName}
              />
            </div>

            <div className="mt-4 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Paiements en ligne par moyen
              </h3>
              <InfoTooltip label="Liste dynamique des moyens réellement vus dans les réservations en ligne payées (champ preuve)." />
              </div>
              {displayKeys.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun moyen à afficher (configurez les moyens de paiement).</p>
              ) : (
                <ul className="space-y-2">
                  {displayKeys.map((key, i) => (
                    <li
                      key={key}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
                          <Smartphone className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{key}</span>
                      </div>
                      <span
                        className="font-semibold tabular-nums"
                        style={{
                          color: liquidMetricValueColor(
                            liquidMetricAccentForVariant("payment", primary, secondary, i),
                            isDark
                          ),
                        }}
                      >
                        {money(paymentTotals.get(key) ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {includedCount > 0 ? (
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                  {includedCount} réservation{includedCount > 1 ? "s" : ""} · total {money(reservationsAmountSum)}
                </p>
              ) : null}
            </div>
          </>
        )}
      </SectionCard>
    </section>
  );
}
