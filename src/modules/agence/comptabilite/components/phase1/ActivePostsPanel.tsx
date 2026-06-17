import React from "react";
import { Clock4, Pause, Play } from "lucide-react";
import { SectionShifts, type AccountantShift, type AccountantTheme, type ComptaUserCacheEntry } from "./AccountantSharedUi";

export const ActivePostsPanel: React.FC<{
  activeShifts: AccountantShift[];
  pendingShifts: AccountantShift[];
  pausedShifts: AccountantShift[];
  usersCache: Record<string, ComptaUserCacheEntry>;
  liveStats: Record<string, { reservations: number; tickets: number; amount: number }>;
  theme: AccountantTheme;
  renderPendingAction: (shift: AccountantShift) => React.ReactNode;
  renderPausedAction: (shift: AccountantShift) => React.ReactNode;
}> = ({
  activeShifts,
  pendingShifts,
  pausedShifts,
  usersCache,
  liveStats,
  theme,
  renderPendingAction,
  renderPausedAction,
}) => (
  <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Postes à surveiller</div>
        <h2 className="text-lg font-bold text-slate-950 sm:text-xl">Postes en service</h2>
        <p className="mt-1 text-sm text-slate-500">
          Suivi des services ouverts, en attente d'activation ou temporairement en pause.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2 text-center">
        <div className="min-w-0 rounded-lg bg-white px-3 py-2">
          <div className="text-lg font-bold leading-tight" style={{ color: theme.primary }}>{activeShifts.length}</div>
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">Service</div>
        </div>
        <div className="min-w-0 rounded-lg bg-white px-3 py-2">
          <div className="text-lg font-bold leading-tight text-amber-700">{pendingShifts.length}</div>
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">Attente</div>
        </div>
        <div className="min-w-0 rounded-lg bg-white px-3 py-2">
          <div className="text-lg font-bold leading-tight text-slate-700">{pausedShifts.length}</div>
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">Pause</div>
        </div>
      </div>
    </div>

    <div className="min-w-0 space-y-4">
      <SectionShifts
        title="Postes en service"
        icon={Play}
        list={activeShifts}
        usersCache={usersCache}
        liveStats={liveStats}
        theme={theme}
        actions={() => null}
      />

      {pendingShifts.length > 0 ? (
        <SectionShifts
          title="Postes en attente d'activation"
          hint="Le service est prêt et attend l'activation."
          icon={Clock4}
          list={pendingShifts}
          usersCache={usersCache}
          liveStats={{}}
          theme={theme}
          actions={renderPendingAction}
        />
      ) : null}

      {pausedShifts.length > 0 ? (
        <SectionShifts
          title="Postes en pause"
          hint="Peuvent être remis en service. Clôture par le vendeur uniquement."
          icon={Pause}
          list={pausedShifts}
          usersCache={usersCache}
          liveStats={liveStats}
          theme={theme}
          actions={renderPausedAction}
        />
      ) : null}
    </div>
  </section>
);
