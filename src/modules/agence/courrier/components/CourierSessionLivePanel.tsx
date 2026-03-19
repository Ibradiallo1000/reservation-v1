// CourierSessionLivePanel — Live panel: session status, agent code, opening time, shipment counts, totals.
// Uses @/ui SectionCard + MetricCard for visual consistency with other modules.

import React from "react";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Activity, User, Clock, Package, Banknote, Truck, Wallet, Building2 } from "lucide-react";
import { SectionCard, MetricCard } from "@/ui";

export interface CourierSessionLivePanelProps {
  session: CourierSession | null;
  shipments: Shipment[];
  agencyName: string;
  /** Code agent affiché quand la session n'a pas encore agentCode (ex. avant création) ou en fallback. */
  currentAgentCode?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

const DEFAULT_PRIMARY = "#ea580c";
const DEFAULT_SECONDARY = "#f97316";

export default function CourierSessionLivePanel({
  session,
  shipments,
  agencyName,
  currentAgentCode,
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

  const primaryVar = "var(--courier-primary, #ea580c)";
  const secondaryVar = "var(--courier-secondary, #f97316)";

  return (
    <SectionCard title="Session en direct" className="mb-6 print:hidden">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Statut" value={statusLabel} icon={Activity} valueColorVar={primaryVar} decorative />
        <MetricCard label="Code agent" value={session?.agentCode ?? currentAgentCode ?? "GUEST"} icon={User} valueColorVar={primaryVar} className="font-mono" decorative />
        <MetricCard label="Ouverture" value={openingTime} icon={Clock} valueColorVar={primaryVar} decorative />
        <MetricCard label="Envois créés" value={createdInSession.length} icon={Package} valueColorVar={primaryVar} decorative />
        <MetricCard label="Total encaissé origine" value={money(originTotal)} icon={Banknote} valueColorVar={primaryVar} className="teliya-monetary" decorative />
        <MetricCard label="Envois livrés" value={deliveredFromSession.length} icon={Truck} valueColorVar={secondaryVar} decorative />
        <MetricCard label="Total encaissé destination" value={money(destinationTotal)} icon={Wallet} valueColorVar={secondaryVar} className="teliya-monetary" decorative />
        <MetricCard label="Total global" value={money(globalTotal)} icon={Wallet} valueColorVar={primaryVar} className="teliya-monetary" decorative />
      </div>
      {agencyName && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
          <Building2 className="h-4 w-4" />
          Agence : {agencyName}
        </p>
      )}
    </SectionCard>
  );
}
