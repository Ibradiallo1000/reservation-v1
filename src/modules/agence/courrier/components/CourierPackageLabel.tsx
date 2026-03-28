// Modal aperçu étiquette (impression isolée du bloc étiquette).

import React, { useRef } from "react";
import { CourierPackageLabelBody } from "./CourierPackageLabelBody";
import type { CourierPackageLabelBodyProps } from "./CourierPackageLabelBody";

export type CourierPackageLabelProps = CourierPackageLabelBodyProps & {
  onClose?: () => void;
};

const CourierPackageLabel: React.FC<CourierPackageLabelProps> = ({
  shipment,
  destinationAgencyName,
  originAgencyName,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <style>{`
        @media print {
          body {
            margin: 0 !important;
          }
          body * { visibility: hidden !important; }
          .courier-package-label-modal, .courier-package-label-modal * { visibility: visible !important; }
          .courier-package-label-modal { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .ticket {
            width: 300px !important;
            max-width: 300px !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }
      `}</style>
      <div
        ref={ref}
        className="courier-package-label-modal max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="no-print mb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50"
          >
            Imprimer
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50"
            >
              Fermer
            </button>
          )}
        </div>
        <CourierPackageLabelBody
          shipment={shipment}
          destinationAgencyName={destinationAgencyName}
          originAgencyName={originAgencyName}
        />
      </div>
    </div>
  );
};

export default CourierPackageLabel;
