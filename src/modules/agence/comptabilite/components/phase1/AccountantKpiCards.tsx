import React from "react";
import type { LucideIcon } from "lucide-react";
import { Banknote, CheckCircle2, Clock4, Play } from "lucide-react";
import { AGENCY_KPI_TIME } from "@/modules/agence/shared/agencyKpiTimeContract";
import type { AccountantTheme } from "./AccountantSharedUi";

type AgencyStatsToday = {
  totalTickets: number;
  totalRevenue: number;
  onlineTickets: number;
  counterTickets: number;
} | null;

export const AccountantKpiCards: React.FC<{
  activeShiftsCount: number;
  pendingPostsCount?: number;
  pendingReceiptsCount?: number;
  dayCashIn?: number;
  agencyStatsToday: AgencyStatsToday;
  money: (amount: number) => string;
  theme: AccountantTheme;
  onNavigate?: (target: "postes" | "receptions" | "caisse") => void;
}> = ({
  activeShiftsCount,
  pendingPostsCount = 0,
  pendingReceiptsCount = 0,
  dayCashIn = 0,
  money,
  theme,
  onNavigate,
}) => {
  const cards: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    hint: string;
    tone: "primary" | "success" | "neutral";
    target: "postes" | "receptions" | "caisse";
  }> = [
    {
      label: "Postes à activer",
      value: pendingPostsCount.toString(),
      icon: Clock4,
      hint: "Services en attente d'ouverture",
      tone: "primary",
      target: "postes",
    },
    {
      label: "Réceptions à valider",
      value: pendingReceiptsCount.toString(),
      icon: CheckCircle2,
      hint: "Service billetterie et service courrier",
      tone: "neutral",
      target: "receptions",
    },
    {
      label: "Service billetterie actif",
      value: activeShiftsCount.toString(),
      icon: Play,
      hint: "Services ouverts maintenant",
      tone: "success",
      target: "postes",
    },
    {
      label: "Encaissements du jour",
      value: money(dayCashIn),
      icon: Banknote,
      hint: AGENCY_KPI_TIME.WORKFLOW_PAIEMENT,
      tone: "neutral",
      target: "caisse",
    },
  ];

  return (
    <section className="accountant-night-surface min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priorités</div>
          <h2 className="text-lg font-bold text-slate-950 sm:text-xl">Points à traiter</h2>
        </div>
        <div className="text-xs text-slate-500">Situation du jour</div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const isPrimary = card.tone === "primary";
          const isSuccess = card.tone === "success";
          return (
            <button
              type="button"
              key={card.label}
              onClick={() => onNavigate?.(card.target)}
              className="accountant-night-card min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left shadow-[inset_0_1px_0_rgb(255_255_255/0.8)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{ outlineColor: theme.primary }}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</div>
                  <div
                    className="mt-2 break-words text-2xl font-bold leading-tight sm:text-3xl"
                    style={{ color: isPrimary || isSuccess ? theme.primary : undefined }}
                  >
                    {card.value}
                  </div>
                </div>
                <div
                  className="accountant-night-card-icon grid h-10 w-10 shrink-0 place-items-center rounded-lg border"
                  style={{
                    borderColor: isPrimary ? `${theme.primary}55` : "#e2e8f0",
                    backgroundColor: isPrimary ? `${theme.secondary}66` : "#ffffff",
                    color: isPrimary || isSuccess ? theme.primary : "#475569",
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{card.hint}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
