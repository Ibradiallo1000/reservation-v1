import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionCard, StatusBadge, EmptyState as UIEmptyState } from "@/ui";
import { typography } from "@/ui/foundation";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";

export type AccountantTheme = { primary: string; secondary: string };
export type ComptaUserCacheEntry = { name?: string; email?: string; code?: string; profileLookupDone?: boolean };
export type ShiftStatus = "pending" | "active" | "paused" | "closed" | "validated_agency" | "validated";

export type AccountantShift = {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userCode?: string;
  status: ShiftStatus;
  startTime?: any;
  endTime?: any;
  totalTickets?: number;
  totalReservations?: number;
  totalAmount?: number;
};

export type AccountantCourierSession = CourierSession & { id: string };

const COMPTA_POST_CARD_3D = cn(
  "accountant-night-card group relative min-w-0 overflow-hidden rounded-xl border p-3 outline-none transition-colors duration-200",
  "bg-white shadow-sm hover:border-slate-300 hover:shadow-md"
);

function comptaPostCardTintStyle(theme: AccountantTheme): React.CSSProperties {
  return {
    borderColor: "#e2e8f0",
    backgroundImage: `linear-gradient(180deg, #ffffff 0%, ${theme.secondary}20 100%)`,
  };
}

const COMPTA_AMOUNT_PANEL_3D = cn(
  "accountant-night-card-detail mb-3 rounded-lg border bg-white/85 p-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.8)]"
);

const courierStatusToBadge: Record<string, "active" | "pending" | "success" | "warning" | "neutral"> = {
  PENDING: "pending",
  ACTIVE: "active",
  CLOSED: "warning",
  VALIDATED: "success",
};

const shiftStatusToBadge: Record<string, "active" | "pending" | "success" | "warning" | "neutral"> = {
  active: "active",
  paused: "pending",
  closed: "warning",
  pending: "pending",
  validated_agency: "success",
  validated: "success",
};

const toDateSafe = (v: unknown): Date | null => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in (v as object) && typeof (v as { toDate: () => Date }).toDate === "function") {
    try {
      return (v as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
};

const fmtClockFr = (v: unknown) => {
  const d = toDateSafe(v);
  return d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
};

export const InfoCard: React.FC<{ label: string; value: string; emphasis?: boolean }> = ({
  label,
  value,
  emphasis = false,
}) => (
  <div className="accountant-night-card-detail min-w-0 rounded-lg bg-slate-50 px-2.5 py-2">
    <div className={cn(typography.mutedSm, "mb-0.5 truncate text-[11px]")}>{label}</div>
    <div className={cn("break-words text-sm font-semibold leading-tight", emphasis ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")}>{value}</div>
  </div>
);

export const Th: React.FC<{
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number;
}> = ({ children, align = "left", className = "", colSpan }) => (
  <th
    colSpan={colSpan}
    className={`px-4 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wider
      ${align === "right" ? "text-right" : "text-left"}
      ${className}`}
  >
    {children}
  </th>
);

export const Td: React.FC<{
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number;
}> = ({ children, align = "left", className = "", colSpan }) => (
  <td
    colSpan={colSpan}
    className={`px-4 py-3
      ${align === "right" ? "text-right" : "text-left"}
      ${className}`}
  >
    {children}
  </td>
);

export const CourierComptaSessionCard: React.FC<{
  session: AccountantCourierSession;
  theme: AccountantTheme;
  usersCache: Record<string, ComptaUserCacheEntry>;
  stats: { total: number; paid: number };
  ledgerAmount?: number;
  statusLabel: string;
  startField: unknown;
  endField: unknown;
  footer?: React.ReactNode;
  afterAmountBlock?: React.ReactNode;
}> = ({
  session,
  theme,
  usersCache,
  stats,
  ledgerAmount,
  statusLabel,
  startField,
  endField,
  footer,
  afterAmountBlock,
}) => {
  const money = useFormatCurrency();
  const ui = usersCache[session.agentId] || {};
  const name = (ui.name && ui.name.trim()) || session.agentId;
  const codeRaw = String(ui.code || session.agentCode || "").trim();
  const code = codeRaw || "—";
  const badgeStatus = courierStatusToBadge[session.status] ?? "neutral";
  const amount = Number(ledgerAmount ?? 0);
  const courierAccent = "#2563eb";

  return (
    <div className={COMPTA_POST_CARD_3D} style={comptaPostCardTintStyle(theme)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${courierAccent}, #bfdbfe)`,
        }}
      />
      <div className="relative">
        <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</div>
            <div className="font-semibold text-gray-900 truncate">
              {name} <span className="text-gray-500 text-sm ml-2">({code})</span>
            </div>
          </div>
          <StatusBadge status={badgeStatus}>{statusLabel}</StatusBadge>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <InfoCard label="Service" value="Service courrier" />
          <InfoCard label="Colis payés" value={String(stats.paid)} />
          <InfoCard label="Début" value={fmtClockFr(startField)} />
          <InfoCard label="Fin" value={fmtClockFr(endField)} />
        </div>
        <div className={COMPTA_AMOUNT_PANEL_3D} style={{ borderColor: `${courierAccent}55` }}>
          <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">Montant attendu</div>
          <div className="break-words text-xl font-bold leading-tight" style={{ color: courierAccent }}>
            {ledgerAmount === undefined ? "…" : money(amount)}
          </div>
        </div>
        {afterAmountBlock}
        {footer != null && footer !== false ? (
          <div className="flex justify-end w-full flex-col sm:flex-row sm:items-center gap-2">{footer}</div>
        ) : null}
      </div>
    </div>
  );
};

export const SectionShifts: React.FC<{
  title: string;
  hint?: string;
  icon: LucideIcon;
  list: AccountantShift[];
  usersCache: Record<string, ComptaUserCacheEntry>;
  liveStats: Record<string, { reservations: number; tickets: number; amount: number }>;
  actions: (s: AccountantShift) => React.ReactNode;
  theme: AccountantTheme;
  badgeLabel?: string;
  badgeStatus?: "active" | "pending" | "success" | "warning" | "neutral";
}> = ({
  title,
  hint,
  icon,
  list,
  usersCache,
  liveStats,
  actions,
  theme,
  badgeLabel,
  badgeStatus = "neutral",
}) => {
  const money = useFormatCurrency();
  const statusLabels: Record<string, string> = {
    active: "En service",
    paused: "En pause",
    closed: "Clôturé",
    pending: "En attente",
    validated_agency: "Validé comptable",
    validated: "Validé",
  };
  return (
    <SectionCard
      title={title}
      icon={icon}
      description={hint}
      right={
        <StatusBadge status={badgeStatus}>
          {badgeLabel ?? `${list.length} poste${list.length > 1 ? "s" : ""}`}
        </StatusBadge>
      }
    >
      {list.length === 0 ? (
        <UIEmptyState message={`Aucun ${title.toLowerCase()} — Aucun poste dans cet état pour le moment`} />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {list.map((s) => {
            const ui = usersCache[s.userId] || {};
            const name = ui.name || s.userName || s.userEmail || s.userId;
            const code = ui.code || s.userCode || "GUEST";
            const live = liveStats[s.id];
            const reservations = live?.reservations ?? s.totalReservations ?? 0;
            const tickets = live?.tickets ?? s.totalTickets ?? 0;
            const amount = live?.amount ?? s.totalAmount ?? 0;
            const badgeStatus = shiftStatusToBadge[s.status] ?? "neutral";

            return (
              <div key={s.id} className={COMPTA_POST_CARD_3D} style={comptaPostCardTintStyle(theme)}>
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1"
                  style={{
                    background: `linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`,
                  }}
                />
                <div className="relative">
                  <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</div>
                      <div className="font-semibold text-gray-900 truncate">
                        {name} <span className="text-gray-500 text-sm ml-2">({code})</span>
                      </div>
                    </div>
                    <StatusBadge status={badgeStatus}>{statusLabels[s.status] ?? s.status}</StatusBadge>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <InfoCard label="Service" value="Service billetterie" />
                    <InfoCard label="Billets" value={tickets.toString()} />
                    <InfoCard label="Début" value={s.startTime ? new Date(s.startTime.toDate?.() ?? s.startTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"} />
                    <InfoCard label="Fin" value={s.endTime ? new Date(s.endTime.toDate?.() ?? s.endTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"} />
                  </div>
                  <div className={COMPTA_AMOUNT_PANEL_3D} style={{ borderColor: `${theme.primary}55` }}>
                    <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">Montant encaissé</div>
                    <div className="break-words text-xl font-bold leading-tight" style={{ color: theme.primary }}>
                      {money(amount)}
                    </div>
                  </div>
                  <div className="flex min-w-0 justify-end">{actions(s)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};
