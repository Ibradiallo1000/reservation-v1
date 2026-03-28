import React from "react";
import { QRCodeCanvas } from "qrcode.react";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { formatFrenchDateTime } from "@/shared/date/fmtFrench";
import { cn } from "@/lib/utils";

/** Référence QR : `shipmentNumber` métier (ex. ENV-48227436, COL-48227436) ou repli `shipmentId`. */
function getShipmentReferenceForQr(shipment: Shipment): string {
  const num = String(shipment.shipmentNumber ?? "").trim();
  if (num) return num;
  return String(shipment.shipmentId ?? "").trim();
}

export interface CourierPackageLabelBodyProps {
  shipment: Shipment;
  destinationAgencyName: string;
  originAgencyName: string;
  className?: string;
  trackUrl?: string | null;
  /** UI preview compacte (marges légèrement réduites). */
  compact?: boolean;
}

const QR_FG = "#000000";
const QR_BG = "#ffffff";
const THERMAL_QR_PX = 80;

const thermalText = "text-sm text-black";
const thermalLabel = "text-sm font-normal text-black";

/** Corps étiquette colis — format ticket thermique (~300px), noir sur blanc. */
export function CourierPackageLabelBody({
  shipment,
  destinationAgencyName,
  originAgencyName,
  className,
  trackUrl: _trackUrl,
  compact = false,
}: CourierPackageLabelBodyProps) {
  const displayRef = shipment.shipmentNumber ?? shipment.shipmentId;
  const referenceForQr = getShipmentReferenceForQr(shipment);
  const formattedDate = formatFrenchDateTime(shipment.createdAt);

  return (
    <div
      className={cn(
        "ticket courier-package-label-body mx-auto box-border w-full max-w-[300px] bg-white text-black",
        "border border-dashed border-black/25",
        compact ? "px-2 py-2" : "px-2.5 py-2.5",
        className
      )}
      style={{ color: "#000000" }}
    >
      {/* 1. Référence */}
      <div className={cn("text-center font-mono font-bold leading-tight text-black", "text-lg")}>
        {displayRef}
      </div>

      {/* 2. Infos envoi */}
      <div className={cn("mt-2 space-y-0.5 text-center", thermalText)}>
        <div>Date : {formattedDate}</div>
        {shipment.agentCode ? <div>Agent : {shipment.agentCode}</div> : null}
      </div>

      {/* 3–6. Bloc détail */}
      <div className={cn("mt-3 space-y-1.5", thermalText)}>
        <div>
          <span className={thermalLabel}>Destination : </span>
          <span className="font-medium text-black">{destinationAgencyName}</span>
        </div>
        <div>
          <span className={thermalLabel}>Destinataire : </span>
          <span className="font-medium text-black">{shipment.receiver?.name ?? "—"}</span>
        </div>
        <div>
          <span className={thermalLabel}>Tél. : </span>
          <span className="font-medium text-black">{shipment.receiver?.phone ?? "—"}</span>
        </div>
        <div>
          <span className={thermalLabel}>Agence origine : </span>
          <span className="font-medium text-black">{originAgencyName}</span>
        </div>
      </div>

      {/* 7. QR */}
      <div className="mt-4 flex flex-col items-center justify-center gap-1">
        {referenceForQr ? (
          <>
            <div
              className="inline-flex shrink-0 bg-white p-0.5"
              style={{ backgroundColor: QR_BG }}
            >
              <QRCodeCanvas
                value={referenceForQr}
                size={THERMAL_QR_PX}
                level="M"
                fgColor={QR_FG}
                bgColor={QR_BG}
                className="block"
                style={{ display: "block" }}
              />
            </div>
            <span className="max-w-[280px] text-center text-xs leading-tight text-black">Réf. colis (scan)</span>
          </>
        ) : (
          <div
            className="flex items-center justify-center border border-dashed border-black/25 bg-white text-xs text-black"
            style={{ width: THERMAL_QR_PX, height: THERMAL_QR_PX }}
          >
            QR indisponible
          </div>
        )}
      </div>
    </div>
  );
}
