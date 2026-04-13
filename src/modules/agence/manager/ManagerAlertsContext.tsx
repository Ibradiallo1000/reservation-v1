import React from "react";
import type { AlertModule, ManagerAlert, ManagerAlertsResult } from "./useManagerAlerts";

const EMPTY_ALERTS_BY_MODULE: Record<AlertModule, ManagerAlert[]> = {
  dashboard: [],
  operations: [],
  finances: [],
  team: [],
  reports: [],
};

const EMPTY_BADGE_BY_MODULE: Record<AlertModule, number> = {
  dashboard: 0,
  operations: 0,
  finances: 0,
  team: 0,
  reports: 0,
};

const EMPTY_MANAGER_ALERTS: ManagerAlertsResult = {
  alerts: [],
  totalAlertCount: 0,
  alertsByModule: EMPTY_ALERTS_BY_MODULE,
  badgeByModule: EMPTY_BADGE_BY_MODULE,
  dismissAlert: () => {},
  markAllAlertsRead: () => {},
  loading: false,
  cashVariance: 0,
};

const ManagerAlertsContext = React.createContext<ManagerAlertsResult>(EMPTY_MANAGER_ALERTS);

export function ManagerAlertsProvider({
  value,
  children,
}: {
  value: ManagerAlertsResult;
  children: React.ReactNode;
}) {
  return <ManagerAlertsContext.Provider value={value}>{children}</ManagerAlertsContext.Provider>;
}

export function useManagerAlertsContext(): ManagerAlertsResult {
  return React.useContext(ManagerAlertsContext);
}
