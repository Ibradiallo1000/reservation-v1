// CourierSessionLivePanel — Live panel: session status, agent code, opening time, shipment counts, totals.
// Visual: KPI cards with icons, primary/secondary colors for origin/destination revenue.

import React from "react";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Activity, User, Clock, Package, Banknote, Truck, Wallet, Building2 } from "lucide-react";

export interface CourierSessionLivePanelProps {
  session: CourierSession | null;
  shipments: Shipment[];
  agencyName: string;
  primaryColor?: string;
  secondaryColor?: string;
}

const DEFAULT_PRIMARY = "#ea580c";
const DEFAULT_SECONDARY = "#f97316";

export default function CourierSessionLivePanel({
  session,
  shipments,
  agencyName,
  primaryColor = DEFAULT_PRIMARY,
  secondaryColor = DEFAULT_SECONDARY,
}: CourierSessionLivePanelProps) {
  const money = useFormatCurrency();

  const openingTime =
    session?.openedAt && typeof (session.openedAt as { toDate?: () => Date }).toDate === "function"
      ? format((session.openedAt as { toDate: () => Date }).toDate(), "dd/MM/yyyy HH:mm", { locale: fr })
      : "—";

  const createdInSession = shipments.filter((s) => s.sessionId === session?.sessionId);
  const originTotal = createdInSession.reduce((sum, s) => sum + (s.transportFee ?? 0) + (s.insuranceAmount ?? 0), 0);
  const deliveredFromSession = shipments.filter(
    (s) => s.sessionId === session?.sessionId && (s.currentStatus === "DELIVERED" || s.currentStatus === "CLOSED")
  );
  const destinationTotal = deliveredFromSession.reduce((sum, s) => sum + (s.destinationCollectedAmount ?? 0), 0);
  const globalTotal = originTotal + destinationTotal;

  const statusLabel = session
    ? session.status === "PENDING"
      ? "En attente"
      : session.status === "ACTIVE"
        ? "Active"
        : session.status === "CLOSED"
          ? "Clôturée"
          : "Validée"
    : "—";

  return (
    <section
      className="mb-6 rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm print:hidden sm:p-6"
      aria-label="Session courrier en direct"
    >
      <h2 className="mb-4 text-2xl font-bold" style={{ color: "var(--courier-primary, #ea580c)" }}>
        Session en direct
      </h2>
      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow"
          style={{ borderColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 6%, transparent)" }}
        >
          <Activity className="mb-1 h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} aria-hidden />
          <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Statut</span>
          <span className="mt-1 text-xl font-semibold" style={{ color: "var(--courier-primary, #ea580c)" }}>{statusLabel}</span>
        </div>
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow"
          style={{ borderColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 6%, transparent)" }}
        >
          <User className="mb-1 h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} aria-hidden />
          <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Code agent</span>
          <span className="mt-1 font-mono text-xl font-semibold" style={{ color: "var(--courier-primary, #ea580c)" }}>{session?.agentCode ?? "—"}</span>
        </div>
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow"
          style={{ borderColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 6%, transparent)" }}
        >
          <Clock className="mb-1 h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} aria-hidden />
          <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Ouverture</span>
          <span className="mt-1 text-lg font-medium" style={{ color: "var(--courier-primary, #ea580c)" }}>{openingTime}</span>
        </div>
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow"
          style={{ borderColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 6%, transparent)" }}
        >
          <Package className="mb-1 h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} aria-hidden />
          <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Envois créés</span>
          <span className="mt-1 text-2xl font-bold" style={{ color: "var(--courier-primary, #ea580c)" }}>{createdInSession.length}</span>
        </div>
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow courier-kpi-origin"
          style={{ borderColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 25%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 5%, transparent)" }}
        >
          <Banknote className="mb-1 h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} aria-hidden />
          <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Total encaissé origine</span>
          <span className="mt-1 text-xl font-bold teliya-monetary">{money(originTotal)}</span>
        </div>
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow"
          style={{ borderColor: "color-mix(in srgb, var(--courier-secondary, #f97316) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-secondary, #f97316) 6%, transparent)" }}
        >
          <Truck className="mb-1 h-5 w-5" style={{ color: "var(--courier-secondary, #f97316)" }} aria-hidden />
          <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Envois livrés</span>
          <span className="mt-1 text-2xl font-bold" style={{ color: "var(--courier-secondary, #f97316)" }}>{deliveredFromSession.length}</span>
        </div>
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow courier-kpi-dest"
          style={{ borderColor: "color-mix(in srgb, var(--courier-secondary, #f97316) 25%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-secondary, #f97316) 5%, transparent)" }}
        >
          <Wallet className="mb-1 h-5 w-5" style={{ color: "var(--courier-secondary, #f97316)" }} aria-hidden />
          <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Total encaissé destination</span>
          <span className="mt-1 text-xl font-bold teliya-monetary">{money(destinationTotal)}</span>
        </div>
        <div
          className="flex flex-col rounded-xl border p-4 shadow-sm transition-shadow hover:shadow"
          style={{ borderColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 50%, var(--courier-secondary, #f97316))", backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 8%, transparent)" }}
        >
          <Wallet className="mb-1 h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} aria-hidden />
          <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Total global</span>
          <span className="mt-1 text-2xl font-bold teliya-monetary">{money(globalTotal)}</span>
        </div>
      </div>
      {agencyName && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
          <Building2 className="h-4 w-4" />
          Agence : {agencyName}
        </p>
      )}
    </section>
  );
}
