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
          "ticket-force-light mx-auto grid w-full max-w-5xl grid-cols-1 rounded-xl border border-gray-200 bg-white shadow-md dark:border-gray-700 sm:grid-cols-2",
          compact ? "gap-2 p-2 sm:gap-2 sm:p-2" : "gap-4 p-3 sm:gap-4 sm:p-4",
          paperType === "a4" ? "print-paper-a4" : "print-paper-thermal"
        )}
      >
        <div className="print-area-ticket page-break flex min-w-0 flex-col items-center md:items-start">
          <span className="mb-2 w-full text-center text-xs font-semibold uppercase tracking-wide text-gray-500 md:text-left">
            Reçu
          </span>
          <div className="flex w-full justify-center md:justify-start">
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
        </div>
        <div className="print-area-label flex min-w-0 flex-col items-center md:items-start">
          <span className="mb-2 w-full text-center text-xs font-semibold uppercase tracking-wide text-gray-500 md:text-left">
            Étiquette colis
          </span>
          <CourierPackageLabelBody
            shipment={shipment}
            destinationAgencyName={destinationAgencyName}
            originAgencyName={originAgencyName}
            trackUrl={trackUrl}
            compact={compact}
            className="bg-white"
          />
        </div>
      </div>
    </>
  );
}
