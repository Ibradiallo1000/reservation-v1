import React from "react";
import { EmptyState as UIEmptyState } from "@/ui";

export type CashDayRow = { dateISO: string; entrees: number; sorties: number; solde: number };

export const TodayHistoryTimeline: React.FC<{
  days: CashDayRow[];
  loadingCash: boolean;
  totIn: number;
  totOut: number;
  money: (amount: number) => string;
  eyebrow?: string;
  title?: string;
  unavailable?: boolean;
}> = ({
  days,
  loadingCash,
  totIn,
  totOut,
  money,
  eyebrow = "Historique",
  title = "Mouvements de caisse",
  unavailable = false,
}) => (
  <section className="accountant-night-surface min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-5 flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</div>
        <h2 className="text-lg font-bold text-slate-950 sm:text-xl">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {unavailable
            ? "Les mouvements de la période ne sont pas disponibles."
            : `${days.length} jour${days.length > 1 ? "s" : ""} avec activité sur la période sélectionnée.`}
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:min-w-[30rem]">
        <div className="min-w-0 rounded-xl bg-emerald-50 px-3 py-2">
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">Entrées</div>
          <div className="break-words text-sm font-bold text-emerald-800 sm:text-base">
            {unavailable ? "Indisponible" : money(totIn)}
          </div>
        </div>
        <div className="min-w-0 rounded-xl bg-rose-50 px-3 py-2">
          <div className="text-xs font-medium uppercase tracking-wide text-rose-700">Sorties</div>
          <div className="break-words text-sm font-bold text-rose-800 sm:text-base">
            {unavailable ? "Indisponible" : money(totOut)}
          </div>
        </div>
        <div className="accountant-night-card min-w-0 rounded-xl bg-slate-50 px-3 py-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Net période</div>
          <div className="break-words text-sm font-bold text-slate-900 sm:text-base">
            {unavailable ? "Indisponible" : money(totIn - totOut)}
          </div>
        </div>
      </div>
    </div>

    {loadingCash ? (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="h-12 w-12 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-gray-600">Chargement des données de caisse…</div>
        </div>
      </div>
    ) : unavailable ? (
      <UIEmptyState message="Mouvements de caisse indisponibles pour la période sélectionnée" />
    ) : days.length === 0 ? (
      <UIEmptyState message="Aucun mouvement enregistré sur la période sélectionnée" />
    ) : (
      <div className="min-w-0 space-y-3">
        {days.map((d) => (
          <article key={d.dateISO} className="accountant-night-card min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="break-words text-sm font-semibold text-slate-900">
                  {new Date(d.dateISO).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <div className="mt-1 text-xs text-slate-500">Net jour sur la période</div>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[34rem]">
                <div className="accountant-night-card-detail min-w-0 rounded-lg bg-white px-3 py-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Entrées</div>
                  <div className="break-words text-sm font-semibold text-emerald-700">{money(d.entrees)}</div>
                </div>
                <div className="accountant-night-card-detail min-w-0 rounded-lg bg-white px-3 py-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Sorties</div>
                  <div className="break-words text-sm font-semibold text-rose-700">{money(d.sorties)}</div>
                </div>
                <div className="accountant-night-card-detail min-w-0 rounded-lg bg-white px-3 py-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Net</div>
                  <div className={`break-words text-sm font-bold ${d.solde >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {money(d.solde)}
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
);
