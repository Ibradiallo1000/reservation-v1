/**
 * Onglet Liquidités — soldes ledger + détail comptes mobile money + volume encaissements numériques (période).
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getDocs } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { SectionCard, MetricCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getLedgerBalances, listFinancialTransactionsByPeriod } from "@/modules/compagnie/treasury/financialTransactions";
import { ledgerAccountsRef } from "@/modules/compagnie/treasury/ledgerAccounts";
import { sumConfirmedDigitalPaymentReceived } from "@/modules/finance/services/liquidityDisplayHelpers";
import { getStartOfDayForDate, getEndOfDayForDate, DEFAULT_AGENCY_TIMEZONE } from "@/shared/date/dateUtilsTz";
import { Wallet, Smartphone } from "lucide-react";

export default function FinancesLiquiditesTab() {
  const { user } = useAuth();
  const { companyId: routeId } = useParams<{ companyId: string }>();
  const companyId = routeId ?? user?.companyId ?? "";
  const globalPeriod = useGlobalPeriodContext();
  const money = useFormatCurrency();
  const [ledger, setLedger] = useState<{ total: number; cash: number; mobileMoney: number; bank: number } | null>(null);
  const [mobileAccounts, setMobileAccounts] = useState<{ id: string; label: string; balance: number }[]>([]);
  const [digitalPeriod, setDigitalPeriod] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const start = Timestamp.fromDate(
          getStartOfDayForDate(globalPeriod.startDate, DEFAULT_AGENCY_TIMEZONE)
        );
        const end = Timestamp.fromDate(getEndOfDayForDate(globalPeriod.endDate, DEFAULT_AGENCY_TIMEZONE));
        const [bal, snap, txRows] = await Promise.all([
          getLedgerBalances(companyId),
          getDocs(ledgerAccountsRef(companyId)),
          listFinancialTransactionsByPeriod(companyId, start, end),
        ]);
        if (cancelled) return;
        setLedger({
          total: bal.total,
          cash: bal.cash,
          mobileMoney: bal.mobileMoney,
          bank: bal.bank,
        });
        const mm: { id: string; label: string; balance: number }[] = [];
        snap.docs.forEach((d) => {
          const data = d.data() as { type?: string; label?: string; balance?: number };
          const t = String(data.type ?? "");
          if (t !== "mobile_money") return;
          mm.push({
            id: d.id,
            label: String(data.label ?? d.id),
            balance: Number(data.balance ?? 0),
          });
        });
        mm.sort((a, b) => b.balance - a.balance);
        setMobileAccounts(mm);
        setDigitalPeriod(sumConfirmedDigitalPaymentReceived(txRows));
      } catch (e) {
        console.error("[FinancesLiquiditesTab]", e);
        setLedger(null);
        setMobileAccounts([]);
        setDigitalPeriod(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, globalPeriod.startDate, globalPeriod.endDate]);

  return (
    <div className="space-y-6">
      <SectionCard title="Liquidité totale" icon={Wallet}>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Uniquement les soldes du grand livre (comptes réels). Les sessions guichet en attente ne sont pas incluses ici.
        </p>
        {loading && !ledger ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Total" value={money(ledger?.total ?? 0)} icon={Wallet} />
            <MetricCard label="Caisse agences" value={money(ledger?.cash ?? 0)} icon={Wallet} />
            <MetricCard label="Mobile money" value={money(ledger?.mobileMoney ?? 0)} icon={Smartphone} />
            <MetricCard label="Banque" value={money(ledger?.bank ?? 0)} icon={Wallet} />
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
          Encaissements numériques confirmés sur la période (Wave, Orange, carte, etc.) :{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{money(digitalPeriod)}</span>
          . Ce montant alimente les comptes mobile money au fil des validations — il sert de contrôle, pas de double total
          ci-dessus.
        </p>
      </SectionCard>

      <SectionCard title="Comptes mobile money" icon={Smartphone}>
        {mobileAccounts.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun compte mobile money paramétré.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mobileAccounts.map((a) => (
              <MetricCard key={a.id} label={a.label} value={money(a.balance)} icon={Smartphone} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
