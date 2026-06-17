import React from "react";
import { CourierReceiptTicket, type CourierReceiptTicketProps } from "./CourierReceipt";
import { CourierPackageLabelBody } from "./CourierPackageLabelBody";
import type { CourierPrintPaper } from "../utils/courierPrintPreferences";
import { COURIER_COMBINED_PRINT_CSS } from "../utils/courierPrintStyles";
import { cn } from "@/lib/utils";

export type CourierPrintCombinedProps = CourierReceiptTicketProps & {
  destinationAgencyName: string;
  originAgencyName: string;
  paperType: CourierPrintPaper;
};

/**
 * Ticket (reçu) + étiquette colis dans #print-root ; à l’impression, saut de page entre les deux (.page-break).
 */
export function CourierPrintCombined({
  shipment,
  companyName,
  companyLogoUrl,
  agencyName,
  agentName,
  agentCode,
  destinationAgencyName,
  originAgencyName,
  trackUrl,
  paperType,
  compact = false,
}: CourierPrintCombinedProps) {
  return (
    <>
      <style>{COURIER_COMBINED_PRINT_CSS}</style>
      <div
        id="print-root"
        className={cn(
          "ticket-force-light mx-auto grid w-full max-w-5xl grid-cols-1 items-start bg-transparent",
          compact ? "gap-3 p-1 sm:gap-3 sm:p-2" : "gap-5 p-2 sm:gap-6 sm:p-4 lg:grid-cols-2",
          paperType === "a4" ? "print-paper-a4" : "print-paper-thermal"
        )}
      >
        <section className="courier-print-document-card print-area-ticket page-break flex min-w-0 flex-col items-center rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="mb-3 w-full border-b border-gray-200 pb-2 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-900">Reçu d'envoi</p>
            <p className="mt-0.5 text-[11px] text-gray-500">Contrôle et suivi client</p>
          </div>
          <div className="flex w-full justify-center">
            <CourierReceiptTicket
              shipment={shipment}
              companyName={companyName}
              companyLogoUrl={companyLogoUrl}
              agencyName={agencyName}
              agentName={agentName}
              agentCode={agentCode}
              trackUrl={trackUrl}
              compact={compact}
            />
          </div>
        </section>
        <section className="courier-print-document-card print-area-label flex min-w-0 flex-col items-center rounded-2xl border border-gray-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="mb-3 w-full border-b border-gray-200 pb-2 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-900">
            Étiquette colis
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500">Scan colis et destination</p>
          </div>
          <CourierPackageLabelBody
            shipment={shipment}
            destinationAgencyName={destinationAgencyName}
            originAgencyName={originAgencyName}
            trackUrl={trackUrl}
            compact={compact}
            className="bg-white"
          />
        </section>
      </div>
    </>
  );
}
