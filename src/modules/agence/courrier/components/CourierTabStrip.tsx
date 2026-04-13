import React from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarDays, History, Inbox, ScanLine, SendHorizontal, Truck } from "lucide-react";
import { useCourierWorkspace } from "../context/CourierWorkspaceContext";

/** Ordre d’affichage (priorité guichet). `shortLabel` = libellé mobile ultra-compact. */
const tabs = [
  { to: "/agence/courrier/nouveau", label: "Envoi", shortLabel: "Envoi", icon: SendHorizontal },
  { to: "/agence/courrier/remise", label: "Remise", shortLabel: "Remise", icon: Truck },
  { to: "/scan", label: "Scan colis", shortLabel: "Scan", icon: ScanLine },
  { to: "/agence/courrier/arrivages", label: "Réceptions", shortLabel: "Récep.", icon: Inbox },
  { to: "/agence/courrier/rapport", label: "Rapport de session", shortLabel: "Rapport", icon: CalendarDays },
  { to: "/agence/courrier/historique", label: "Historique", shortLabel: "Hist.", icon: History },
] as const;

export const CourierTabStrip: React.FC = () => {
  const { pathname } = useLocation();
  const { soundEnabled, setSoundEnabled, shipments, agencyId, counterUiStatus } = useCourierWorkspace();

  const pendingSendCount = shipments.filter(
    (row) => row.currentStatus === "CREATED" && String(row.originAgencyId ?? "") === String(agencyId ?? "")
  ).length;
  const readyPickupCount = shipments.filter(
    (row) => row.currentStatus === "READY_FOR_PICKUP" && String(row.currentAgencyId ?? "") === String(agencyId ?? "")
  ).length;

  return (
    <div
      className="border-b border-gray-200/70 px-2 dark:border-gray-600/50 lg:px-6"
      style={{ backgroundImage: "var(--agency-gradient-subheader)" }}
    >
      <div className="mx-auto flex max-w-[1600px] items-stretch gap-2">
        <nav
          className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto pb-px"
          aria-label="Navigation courrier"
        >
          <div className="flex flex-nowrap items-stretch gap-2 lg:gap-1">
            {tabs.map(({ to, label, shortLabel, icon: Icon }) => {
              const isArrivages = to === "/agence/courrier/arrivages";
              const isScan = to === "/scan";
              const badgeCount =
                to === "/agence/courrier/nouveau"
                  ? pendingSendCount
                  : to === "/agence/courrier/remise"
                    ? readyPickupCount
                    : to === "/agence/courrier/rapport" && counterUiStatus === "pending"
                      ? 1
                      : 0;
              const active =
                pathname === to ||
                (isArrivages && pathname.startsWith("/agence/courrier/reception")) ||
                (isScan && pathname.startsWith("/scan/"));
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 py-2 text-xs font-medium transition-colors lg:gap-2 lg:px-4 lg:py-3 lg:text-sm ${
                    active
                      ? "border-current font-semibold"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                  style={
                    active
                      ? {
                          color: "var(--courier-primary, #ea580c)",
                          borderBottomColor: "var(--courier-secondary, #f97316)",
                        }
                      : undefined
                  }
                  >
                  <Icon className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" aria-hidden />
                  <span className="lg:hidden">{shortLabel}</span>
                  <span className="hidden lg:inline">{label}</span>
                  {badgeCount > 0 ? (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="flex shrink-0 items-center self-center py-1 pr-0.5">
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`rounded-md px-2 py-1 text-xs transition ${
              soundEnabled ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" : "text-gray-400"
            }`}
            title={soundEnabled ? "Son activé" : "Son désactivé"}
          >
            {soundEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </div>
    </div>
  );
};
