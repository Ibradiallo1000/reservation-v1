import React from "react";
import { Clock4, Pause, Ticket } from "lucide-react";
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
  <div className="min-w-0 space-y-4">
    <SectionShifts
      title="Service billetterie actif"
      icon={Ticket}
      list={activeShifts}
      usersCache={usersCache}
      liveStats={liveStats}
      theme={theme}
      actions={() => null}
      badgeStatus="success"
      badgeLabel={`${activeShifts.length} guichet${activeShifts.length > 1 ? "s" : ""} actif${activeShifts.length > 1 ? "s" : ""}`}
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
        badgeStatus="pending"
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
        badgeStatus="warning"
      />
    ) : null}
  </div>
);
