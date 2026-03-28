// ✅ src/pages/AgenceFinancesPage.tsx — version compatible structure imbriquée Firestore

import React, { useEffect, useState, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, MetricCard } from "@/ui";
import { Wallet } from "lucide-react";
import { getAgencyStats } from "@/modules/compagnie/networkStats/networkStatsService";
import { getAgencyLedgerPaymentReceivedTotalForPeriod } from "@/modules/agence/comptabilite/agencyCashAuditService";
import {
  getEndOfDayForDate,
  getStartOfDayForDate,
  resolveAgencyTimezone,
} from "@/shared/date/dateUtilsTz";
import { AGENCY_KPI_TIME } from "@/modules/agence/shared/agencyKpiTimeContract";

dayjs.extend(utc);
dayjs.extend(timezone);

function periodKeysAgency(periode: "jour" | "semaine" | "mois", ianaTimezone: string): { startKey: string; endKey: string } {
  const end = dayjs().tz(ianaTimezone);
  const endKey = end.format("YYYY-MM-DD");
  let start = end;
  if (periode === "semaine") start = end.subtract(6, "day");
  else if (periode === "mois") start = end.subtract(29, "day");
  return { startKey: start.format("YYYY-MM-DD"), endKey };
}

const AgenceFinancesPage: React.FC = () => {
  const { user } = useAuth();
  const money = useFormatCurrency();
  const agencyTz = useMemo(
    () => resolveAgencyTimezone({ timezone: user?.agencyTimezone }),
    [user?.agencyTimezone]
  );
  const [periode, setPeriode] = useState<"jour" | "semaine" | "mois">("jour");
  const [revenu, setRevenu] = useState(0);
  const [nombre, setNombre] = useState(0);
  const [encaissementsLedger, setEncaissementsLedger] = useState(0);

  const fetchStats = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) return;

    const { startKey, endKey } = periodKeysAgency(periode, agencyTz);
    const rangeFrom = getStartOfDayForDate(startKey, agencyTz);
    const rangeToExclusive = new Date(getEndOfDayForDate(endKey, agencyTz).getTime() + 1);

    const [stats, ledger] = await Promise.all([
      getAgencyStats(user.companyId, user.agencyId, startKey, endKey, agencyTz),
      getAgencyLedgerPaymentReceivedTotalForPeriod(
        user.companyId,
        user.agencyId,
        rangeFrom,
        rangeToExclusive
      ).catch(() => ({ total: 0, capped: false })),
    ]);
    setRevenu(stats.totalRevenue);
    setNombre(stats.totalTickets);
    setEncaissementsLedger(ledger.total);
  }, [periode, user?.companyId, user?.agencyId, agencyTz]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return (
    <StandardLayoutWrapper>
      <PageHeader title="État financier de l'agence" icon={Wallet} />
      <SectionCard title="Période">
        <div className="mb-4">
          <select
            value={periode}
            onChange={(e) => setPeriode(e.target.value as typeof periode)}
            className="h-9 min-w-[190px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
          >
            <option value="jour">Aujourd&apos;hui (fuseau agence)</option>
            <option value="semaine">7 jours (fuseau agence)</option>
            <option value="mois">30 jours (fuseau agence)</option>
          </select>
        </div>
      </SectionCard>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
        Les blocs ci-dessous ne sont <strong>pas comparables entre eux</strong> : ventes enregistrées au moment de la réservation
        d’un côté, encaissements rattachés au jour comptable de l’agence de l’autre. Aucun écart n’est calculé ici.
      </div>

      <SectionCard title="Réservations vendues (opérationnel)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard
            label="CA réservations"
            value={money(revenu)}
            icon={Wallet}
            valueColorVar="#15803d"
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
          <MetricCard
            label="Nombre de réservations vendues"
            value={nombre}
            icon={Wallet}
            valueColorVar="#1d4ed8"
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
        </div>
      </SectionCard>

      <SectionCard title="Encaissements enregistrés (période agence)">
        <MetricCard
          label="Total encaissements"
          value={money(encaissementsLedger)}
          icon={Wallet}
          valueColorVar="#0f766e"
          hint={AGENCY_KPI_TIME.LEDGER_BAMAKO}
        />
        <p className="mt-3 text-xs text-gray-500">
          Paiements confirmés sur la période, selon la date d’enregistrement utilisée en comptabilité (fuseau de l’agence sur les bornes).
        </p>
      </SectionCard>

      <SectionCard title="Impression">
        <ActionButton onClick={() => window.print()}>Imprimer le résumé</ActionButton>
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default AgenceFinancesPage;
