// src/modules/agence/courrier/components/CourierPackageLabel.tsx
// Package label: large shipment code, destination, receiver, agency origin, QR placeholder. Printable.

import React, { useRef } from "react";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";

export interface CourierPackageLabelProps {
  shipment: Shipment;
  destinationAgencyName: string;
  originAgencyName: string;
  onClose?: () => void;
}

const CourierPackageLabel: React.FC<CourierPackageLabelProps> = ({
  shipment,
  destinationAgencyName,
  originAgencyName,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const displayRef = shipment.shipmentNumber ?? shipment.shipmentId;
  const dateStr = shipment.createdAt
    ? typeof (shipment.createdAt as { toDate?: () => Date }).toDate === "function"
      ? (shipment.createdAt as { toDate: () => Date }).toDate()
      : new Date(shipment.createdAt as string | number)
    : null;
  const formattedDate = dateStr ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(dateStr) : "—";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .courier-package-label, .courier-package-label * { visibility: visible !important; }
          .courier-package-label { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div
        ref={ref}
        className="courier-package-label bg-white rounded-xl shadow-xl p-6 max-w-md w-full"
      >
        <div className="no-print flex justify-end gap-2 mb-4">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
          >
            Imprimer
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              Fermer
            </button>
          )}
        </div>
        <div className="border-2 border-dashed border-gray-400 p-4 rounded-lg">
          <div className="text-center mb-4">
            <div className="text-2xl font-mono font-bold tracking-widest text-gray-900">
              {displayRef}
            </div>
            <div className="text-xs text-gray-500 mt-1">Réf. complète : {displayRef}</div>
            {shipment.agentCode && (
              <div className="text-xs text-gray-500 mt-0.5">Agent : {shipment.agentCode}</div>
            )}
            <div className="text-xs text-gray-500">Agence : {originAgencyName} · Date : {formattedDate}</div>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500">Destination : </span>
              <span className="font-medium">{destinationAgencyName}</span>
            </div>
            <div>
              <span className="text-gray-500">Destinataire : </span>
              <span className="font-medium">{shipment.receiver?.name ?? "—"}</span>
            </div>
            <div>
              <span className="text-gray-500">Tél. destinataire : </span>
              <span className="font-medium">{shipment.receiver?.phone ?? "—"}</span>
            </div>
            <div>
              <span className="text-gray-500">Agence origine : </span>
              <span className="font-medium">{originAgencyName}</span>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <div className="w-24 h-24 border-2 border-gray-300 rounded flex items-center justify-center text-gray-400 text-xs">
              QR code
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourierPackageLabel;
