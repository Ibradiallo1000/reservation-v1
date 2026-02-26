// src/modules/agence/courrier/components/CourierReceipt.tsx
// Phase 1: Reçu envoi — logo, agence, expéditeur/destinataire, montants, impression.

import React, { useRef } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import html2pdf from "html2pdf.js";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

export interface CourierReceiptProps {
  shipment: Shipment;
  companyName: string;
  companyLogoUrl?: string | null;
  agencyName: string;
  agentName: string;
  /** Agent code (e.g. staff code) for receipt footer */
  agentCode?: string;
  onClose: () => void;
}

const CourierReceipt: React.FC<CourierReceiptProps> = ({
  shipment,
  companyName,
  companyLogoUrl,
  agencyName,
  agentName,
  agentCode: agentCodeProp,
  onClose,
}) => {
  const agentCode = agentCodeProp ?? shipment.agentCode ?? "—";
  const money = useFormatCurrency();
  const ref = useRef<HTMLDivElement>(null);

  const displayRef = shipment.shipmentNumber ?? shipment.shipmentId;
  const totalPaid = shipment.transportFee + (shipment.insuranceAmount ?? 0);
  const dateStr = shipment.createdAt
    ? typeof (shipment.createdAt as { toDate?: () => Date }).toDate === "function"
      ? (shipment.createdAt as { toDate: () => Date }).toDate()
      : new Date(shipment.createdAt as string | number)
    : new Date();
  const emissionDate = format(dateStr, "dd/MM/yyyy HH:mm", { locale: fr });

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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
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
        className="ticket-force-light bg-white rounded-xl shadow-xl overflow-hidden"
        style={{
          width: "80mm",
          fontFamily: "monospace",
          fontSize: "12px",
          lineHeight: "1.5",
        }}
      >
        <div className="no-print flex justify-between items-center px-4 py-3 border-b">
          <div className="font-semibold">{companyName}</div>
          <div className="flex gap-2">
            <button type="button" onClick={handlePDF} className="px-2 py-1 rounded border text-sm">
              PDF
            </button>
            <button type="button" onClick={() => window.print()} className="px-2 py-1 rounded border text-sm">
              Imprimer
            </button>
            <button type="button" onClick={onClose} className="px-2 py-1 rounded border text-sm">
              Fermer
            </button>
          </div>
        </div>

        <div ref={ref} className="p-4 text-black">
          <div className="text-center mb-3">
            {companyLogoUrl && (
              <img
                src={companyLogoUrl}
                alt="logo"
                style={{
                  width: "60px",
                  height: "60px",
                  objectFit: "cover",
                  borderRadius: "50%",
                  border: "2px solid #000",
                  margin: "0 auto",
                }}
              />
            )}
            <div style={{ fontWeight: "bold", fontSize: "14px", marginTop: "6px" }}>
              {companyName.toUpperCase()}
            </div>
            <div style={{ fontSize: "11px" }}>{agencyName}</div>
          </div>

          <hr />

          <div style={{ textAlign: "center", margin: "6px 0" }}>
            <div style={{ fontWeight: "bold", fontSize: "14px", letterSpacing: "0.05em" }}>
              Envoi N° {displayRef}
            </div>
            <div style={{ fontSize: "10px", color: "#666" }}>Réf. complète : {displayRef}</div>
            <div style={{ fontSize: "11px" }}>Émis le {emissionDate}</div>
          </div>

          <hr />

          <div style={{ marginTop: "8px" }}>
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

          <div style={{ marginTop: "8px" }}>
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

          <div style={{ textAlign: "center", margin: "10px 0" }}>
            <div style={{ fontSize: "16px", fontWeight: "bold" }}>Total payé : {money(totalPaid)}</div>
          </div>

          <hr />

          <div style={{ fontSize: "11px", textAlign: "center", marginTop: "8px", fontWeight: "bold" }}>
            Code agent : {agentCode}
          </div>
          <div style={{ fontSize: "10px", textAlign: "center" }}>Agent : {agentName}</div>
          <div style={{ fontSize: "10px", textAlign: "center" }}>Agence : {agencyName}</div>
          <div style={{ fontSize: "10px", textAlign: "center" }}>Date : {emissionDate}</div>
        </div>
      </div>
    </div>
  );
};

export default CourierReceipt;
