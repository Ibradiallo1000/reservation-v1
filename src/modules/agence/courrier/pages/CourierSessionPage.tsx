/**
 * Hub courrier (comptoir ouvert) : actions principales — état session dans le header (context).
 */

import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCourierWorkspace } from "../context/CourierWorkspaceContext";
import { Package, Inbox, Truck } from "lucide-react";
import { ActionButton, StatusBadge } from "@/ui";

export default function CourierSessionPage() {
  const { primaryColor, secondaryColor, session, counterUiStatus, isOnline, shipments, agencyId, openComptoir, hubLoading } =
    useCourierWorkspace();

  const active = session?.status === "ACTIVE";
  const gradient = `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`;

  const baseBtn =
    "flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl px-6 text-base font-bold shadow-md transition hover:opacity-95 active:scale-[0.99] sm:min-h-[64px]";

  const disabledCls = "pointer-events-none opacity-45 grayscale-[0.3]";
  const pendingSendCount = useMemo(
    () =>
      shipments.filter(
        (row) => row.currentStatus === "CREATED" && String(row.originAgencyId ?? "") === String(agencyId ?? "")
      ).length,
    [agencyId, shipments]
  );
  const readyPickupCount = useMemo(
    () =>
      shipments.filter(
        (row) => row.currentStatus === "READY_FOR_PICKUP" && String(row.currentAgencyId ?? "") === String(agencyId ?? "")
      ).length,
    [agencyId, shipments]
  );

  const courierPriorityItems = useMemo(() => {
    const rows: Array<{
      id: string;
      level: "critical" | "todo" | "info";
      title: string;
      detail: string;
      actionLabel?: string;
      action?: () => void;
    }> = [];

    if (!isOnline) {
      rows.push({
        id: "offline",
        level: "critical",
        title: "Réseau instable",
        detail: "Risque de retard de synchronisation des envois et des scans.",
      });
    }

    if (counterUiStatus === "closed") {
      rows.push({
        id: "counter-closed",
        level: "todo",
        title: "Comptoir fermé",
        detail: "Ouvrir la session courrier pour traiter les envois.",
        actionLabel: "Ouvrir le comptoir",
        action: () => {
          void openComptoir();
        },
      });
    } else if (counterUiStatus === "pending") {
      rows.push({
        id: "counter-pending",
        level: "todo",
        title: "Session en attente d'activation",
        detail: "Le comptable doit activer la session avant les actions courrier.",
      });
    }

    if (pendingSendCount > 0) {
      rows.push({
        id: "pending-send",
        level: "todo",
        title: `${pendingSendCount} envoi(s) à finaliser`,
        detail: "Terminer les envois incomplets depuis l'onglet Envoi.",
      });
    }

    if (readyPickupCount > 0) {
      rows.push({
        id: "ready-pickup",
        level: "info",
        title: `${readyPickupCount} colis prêt(s) pour remise`,
        detail: "Confirmer la remise au destinataire dans l'onglet Remise.",
      });
    }

    if (rows.length === 0) {
      rows.push({
        id: "ok",
        level: "info",
        title: "Aucun blocage immédiat",
        detail: "Le flux courrier peut être traité normalement.",
      });
    }

    return rows.slice(0, 4);
  }, [counterUiStatus, isOnline, openComptoir, pendingSendCount, readyPickupCount]);

  const cardPrimary = useMemo(
    () => `${baseBtn} text-white ${!active ? disabledCls : ""}`,
    [active]
  );

  const cardOutline = `${baseBtn} border-2 border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100`;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10 lg:max-w-2xl lg:px-6">
      <section className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">À traiter maintenant</h2>
          <StatusBadge
            status={courierPriorityItems.some((item) => item.level === "critical" || item.level === "todo") ? "warning" : "success"}
          >
            {courierPriorityItems.some((item) => item.level === "critical" || item.level === "todo")
              ? "Action requise"
              : "Rien d'urgent"}
          </StatusBadge>
        </div>
        <div className="space-y-2">
          {courierPriorityItems.map((item) => {
            const badgeStatus = item.level === "critical" ? "danger" : item.level === "todo" ? "warning" : "info";
            const badgeLabel = item.level === "critical" ? "Critique" : item.level === "todo" ? "À traiter" : "Info";
            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800/50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={badgeStatus}>{badgeLabel}</StatusBadge>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</div>
                  </div>
                  <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{item.detail}</div>
                </div>
                {item.action && item.actionLabel ? (
                  <ActionButton size="sm" variant="secondary" disabled={hubLoading} onClick={item.action}>
                    {item.actionLabel}
                  </ActionButton>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4">
        <Link
          to="/agence/courrier/nouveau"
          className={`${cardPrimary} ${!active ? "!bg-gray-400 dark:!bg-gray-600" : ""}`}
          style={active ? { background: gradient } : undefined}
          aria-disabled={!active}
          onClick={(e) => {
            if (!active) e.preventDefault();
          }}
        >
          <Package className="h-7 w-7 shrink-0" />
          Envoi
        </Link>
        <Link
          to="/agence/courrier/arrivages"
          className={`${cardOutline} ${!active ? disabledCls : ""}`}
          aria-disabled={!active}
          onClick={(e) => {
            if (!active) e.preventDefault();
          }}
        >
          <Inbox className="h-7 w-7 shrink-0" style={{ color: primaryColor }} />
          Arrivages
        </Link>
        <Link
          to="/agence/courrier/remise"
          className={`${cardOutline} ${!active ? disabledCls : ""}`}
          aria-disabled={!active}
          onClick={(e) => {
            if (!active) e.preventDefault();
          }}
        >
          <Truck className="h-7 w-7 shrink-0" style={{ color: primaryColor }} />
          Remise
        </Link>
      </div>
    </div>
  );
}
