// src/modules/agence/courrier/components/CourierReceipt.tsx
// Reçu envoi — logo, agence, expéditeur/destinataire, montants, impression.

import React, { forwardRef, useRef } from "react";
import QRCode from "react-qr-code";
import html2pdf from "html2pdf.js";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { formatFrenchDateTime } from "@/shared/date/fmtFrench";
import { cn } from "@/lib/utils";

export type CourierReceiptTicketProps = {
  shipment: Shipment;
  companyName: string;
  companyLogoUrl?: string | null;
  agencyName: string;
  agentName: string;
  agentCode?: string;
  /** URL complète suivi client (QR). */
  trackUrl?: string | null;
  className?: string;
  /** UI preview compacte (sans impact sur la logique métier). */
  compact?: boolean;
};

/** Corps du ticket (aperçu embarqué ou impression). */
export const CourierReceiptTicket = forwardRef<HTMLDivElement, CourierReceiptTicketProps>(
  function CourierReceiptTicket(
    {
      shipment,
      companyName,
      companyLogoUrl,
      agencyName,
      agentName,
      agentCode: agentCodeProp,
      trackUrl,
      className,
      compact = false,
    },
    ref
  ) {
    const money = useFormatCurrency();
    const agentCode = agentCodeProp ?? shipment.agentCode ?? "GUEST";
    const displayRef = shipment.shipmentNumber ?? shipment.shipmentId;
    const totalPaid = shipment.transportFee + (shipment.insuranceAmount ?? 0);
    const emissionDate = formatFrenchDateTime(shipment.createdAt ?? new Date());

    const ticketFontSize = compact ? "11px" : "12px";
    const ticketLineHeight = compact ? "1.35" : "1.5";
    const totalFontPx = compact ? "14px" : "16px";
    const trackQrSize = compact ? 62 : 72;
    const trackHrMarginTop = compact ? 6 : 10;
    const trackBlockMarginTop = compact ? 6 : 8;

    return (
      <div
        ref={ref}
        className={cn(
          "shrink-0 rounded-lg border border-gray-200 bg-white text-black shadow-sm",
          compact ? "p-2" : "p-4",
          className
        )}
        style={{
          width: "80mm",
          maxWidth: "100%",
          fontFamily: "monospace",
          fontSize: ticketFontSize,
          lineHeight: ticketLineHeight,
        }}
      >
        <div
          className={cn(
            "flex items-center gap-3",
            compact ? "mb-2" : "mb-3",
            !companyLogoUrl && "min-h-12"
          )}
        >
          {companyLogoUrl ? (
            <img
              src={companyLogoUrl}
              alt=""
              className="h-12 w-12 shrink-0 object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate font-bold uppercase leading-tight text-gray-900">{companyName}</div>
            <div className="truncate text-sm leading-tight text-gray-500">{agencyName}</div>
          </div>
        </div>

        <hr />

        <div style={{ textAlign: "center", margin: compact ? "4px 0" : "6px 0" }}>
          <div
            style={{
              fontWeight: "bold",
              fontSize: compact ? "12px" : "14px",
              letterSpacing: "0.05em",
            }}
          >
            Envoi N° {displayRef}
          </div>
          <div style={{ fontSize: compact ? "9px" : "10px", color: "#666" }}>Réf. complète : {displayRef}</div>
          <div style={{ fontSize: compact ? "10px" : "11px" }}>Émis le {emissionDate}</div>
        </div>

        <hr />

        <div style={{ marginTop: compact ? "6px" : "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Expéditeur :</span>
            <span style={{ fontWeight: "bold" }}>{shipment.sender?.name ?? "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Tél. exp. :</span>
            <span>{shipment.sender?.phone ?? "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Destinataire :</span>
            <span style={{ fontWeight: "bold" }}>{shipment.receiver?.name ?? "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Tél. dest. :</span>
            <span>{shipment.receiver?.phone ?? "—"}</span>
          </div>
          {shipment.nature && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              <span>Nature :</span>
              <span>{shipment.nature}</span>
            </div>
          )}
        </div>

        <hr />

        <div style={{ marginTop: compact ? "6px" : "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Valeur déclarée :</span>
            <span>{money(shipment.declaredValue ?? 0)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Frais transport :</span>
            <span>{money(shipment.transportFee ?? 0)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <span>Assurance :</span>
            <span>{money(shipment.insuranceAmount ?? 0)}</span>
          </div>
        </div>

        <hr />

        <div style={{ textAlign: "center", margin: compact ? "8px 0" : "10px 0" }}>
          <div style={{ fontSize: totalFontPx, fontWeight: "bold" }}>Total payé : {money(totalPaid)}</div>
        </div>

        <hr />

        <div style={{ fontSize: compact ? "10px" : "11px", textAlign: "center", marginTop: compact ? "6px" : "8px", fontWeight: "bold" }}>
          Code agent : {agentCode}
        </div>
        <div style={{ fontSize: compact ? "9px" : "10px", textAlign: "center" }}>Agent : {agentName}</div>
        <div style={{ fontSize: compact ? "9px" : "10px", textAlign: "center" }}>Agence : {agencyName}</div>
        <div style={{ fontSize: compact ? "9px" : "10px", textAlign: "center" }}>Date : {emissionDate}</div>

        {trackUrl ? (
          <>
            <hr style={{ marginTop: trackHrMarginTop }} />
            <div style={{ textAlign: "center", marginTop: trackBlockMarginTop }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <QRCode
                  value={trackUrl}
                  size={trackQrSize}
                  style={{ height: "auto", maxWidth: "100%", width: trackQrSize }}
                />
              </div>
              <div style={{ fontSize: compact ? 7 : 8, marginTop: compact ? 3 : 4, lineHeight: 1.25 }}>
                Scannez pour suivre votre colis
                <br />
                <span style={{ fontSize: compact ? 6 : 7, opacity: 0.85 }}>suivi en ligne</span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }
);

export interface CourierReceiptProps extends CourierReceiptTicketProps {
  onClose: () => void;
}

const CourierReceipt: React.FC<CourierReceiptProps> = ({
  shipment,
  companyName,
  companyLogoUrl,
  agencyName,
  agentName,
  agentCode,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const displayRef = shipment.shipmentNumber ?? shipment.shipmentId;

  const handlePDF = () => {
    if (!ref.current) return;
    html2pdf()
      .set({
        margin: 2,
        filename: `envoi-${displayRef}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: [80, 200] },
      })
      .from(ref.current)
      .save();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #thermal-ticket-courrier, #thermal-ticket-courrier * { visibility: visible !important; }
          #thermal-ticket-courrier { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        id="thermal-ticket-courrier"
        className="ticket-force-light overflow-hidden rounded-xl bg-white shadow-xl"
        style={{
          width: "80mm",
          fontFamily: "monospace",
          fontSize: "12px",
          lineHeight: "1.5",
        }}
      >
        <div className="no-print flex items-center justify-between border-b px-4 py-3">
          <div className="font-semibold">{companyName}</div>
          <div className="flex gap-2">
            <button type="button" onClick={handlePDF} className="rounded border px-2 py-1 text-sm">
              PDF
            </button>
            <button type="button" onClick={() => window.print()} className="rounded border px-2 py-1 text-sm">
              Imprimer
            </button>
            <button type="button" onClick={onClose} className="rounded border px-2 py-1 text-sm">
              Fermer
            </button>
          </div>
        </div>

        <CourierReceiptTicket
          ref={ref}
          shipment={shipment}
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
          agencyName={agencyName}
          agentName={agentName}
          agentCode={agentCode}
        />
      </div>
    </div>
  );
};

export default CourierReceipt;
