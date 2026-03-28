/**
 * Page Caisse escale : affiche la carte caisse (CashSummaryCard) avec sélecteur de date.
 */
import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { CashSummaryCard } from "@/modules/compagnie/cash/CashSummaryCard";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { Wallet } from "lucide-react";
import { OperationalHintRow } from "@/modules/agence/components/OperationalDataHint";
import { DayFilterBar } from "@/shared/date/DayFilterBar";
import { getSelectedDateStr, toLocalDateStr, type DayPreset } from "@/shared/date/dayFilterUtils";

export default function EscaleCaissePage() {
  const { user } = useAuth();
  const money = useFormatCurrency();
  const [dayPreset, setDayPreset] = useState<DayPreset>("today");
  const [customDate, setCustomDate] = useState<string>(() => toLocalDateStr(new Date()));
  const selectedDateStr = getSelectedDateStr(dayPreset, customDate);

  if (!user?.companyId || !user?.agencyId) {
    return (
      <StandardLayoutWrapper>
        <p className="text-amber-600 dark:text-amber-400">Session invalide.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <PageHeader title="Caisse" subtitle="Ventes et clôture par date" icon={Wallet} />
        <DayFilterBar
          preset={dayPreset}
          customDate={customDate}
          onPresetChange={setDayPreset}
          onCustomDateChange={setCustomDate}
        />
      </div>
      <OperationalHintRow>
        La carte ci-dessous mélange <strong>solde espèces ledger</strong> et <strong>liste des transactions caisse terrain</strong>{" "}
        (cashTransactions) — la liste est <strong>opérationnelle / non comptable</strong> seule pour la traçabilité guichet.
      </OperationalHintRow>
      <div className="mt-4">
        <CashSummaryCard
          companyId={user.companyId}
          locationId={user.agencyId}
          locationType="escale"
          canClose={true}
          createdBy={user.uid ?? ""}
          formatCurrency={money}
          date={selectedDateStr}
        />
      </div>
    </StandardLayoutWrapper>
  );
}
