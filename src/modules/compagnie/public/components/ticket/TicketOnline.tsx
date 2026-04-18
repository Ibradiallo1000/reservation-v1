import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import {
  Download,
  MapPin
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { isTicketValidForQR } from "@/utils/reservationStatusUtils";

interface TicketOnlineProps {
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor?: string;
  agencyName?: string;
  agencyNom?: string;
  agencyTelephone?: string;
  receiptNumber: string;
  statut?: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  emissionDate?: string;
  seats: number;
  montant: number;
  qrValue: string;
  agencyLatitude?: number | null;
  agencyLongitude?: number | null;
  canal?: string;
  paymentMethod?: string;
}

const TicketOnline: React.FC<TicketOnlineProps> = ({
  companyName,
  logoUrl,
  primaryColor,
  secondaryColor,
  agencyName,
  agencyNom,
  agencyTelephone,
  receiptNumber,
  statut = "en_attente",
  nomClient,
  telephone,
  depart,
  arrivee,
  date,
  heure,
  emissionDate,
  seats,
  montant,
  qrValue,
  agencyLatitude,
  agencyLongitude
}) => {
  const { t } = useTranslation();
  const money = useFormatCurrency();
  const [pdfLoading, setPdfLoading] = useState(false);

  const isConfirmed = statut === "confirme";
  const isValidQR = isTicketValidForQR(statut);

  const getStatusLabel = () => {
    const s = (statut || "").toLowerCase();
    if (s === "confirme" || s === "paye") return t("ticketStatusPaymentValidated");
    if (s === "preuve_recue") return t("ticketStatusAwaitingValidation");
    if (s === "en_attente_paiement" || s === "en_attente") return t("ticketStatusAwaitingPayment");
    return t("ticketStatusAwaitingPayment");
  };

  const handleDownloadPDF = useCallback(async () => {
    const element = document.getElementById("ticket-content");
    if (!element) return;
    setPdfLoading(true);
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      pdf.addImage(imgData, "PNG", 10, 10, 190, 260);
      pdf.save(`billet-${receiptNumber}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  }, [receiptNumber]);

  const handleItineraire = () => {
    if (!agencyLatitude || !agencyLongitude) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${agencyLatitude},${agencyLongitude}`,
      "_blank"
    );
  };

  return (
    <div className="flex flex-col items-center gap-6 p-4 bg-white">
      
      {/* TICKET THERMIQUE */}
      <div
        id="ticket-content"
        className="w-full max-w-xs bg-white border-2 border-black shadow-none"
      >
        <div className="p-3 space-y-2 text-center text-black">

          {/* 1. LOGO */}
          <div className="pb-1">
            {logoUrl && (
              <img
                src={logoUrl}
                className="h-12 w-12 object-contain mx-auto"
              />
            )}
          </div>

          {/* 2. NOM COMPAGNIE */}
          <div className="font-bold text-xs uppercase tracking-widest font-mono">
            {companyName}
          </div>

          {/* 3. AGENCE + TÉLÉPHONE */}
          {(agencyName || agencyNom) && (
            <div className="text-xs">
              <p className="font-semibold">{agencyName || agencyNom}</p>
              {agencyTelephone && (
                <p className="font-mono text-gray-700">{agencyTelephone}</p>
              )}
            </div>
          )}

          {/* 4. SÉPARATEUR */}
          <div className="border-t border-dashed border-black my-1"></div>

          {/* 5. CLIENT */}
          <div className="text-xs">
            <p className="font-semibold uppercase">{nomClient}</p>
            <p className="font-mono text-gray-800">{telephone}</p>
          </div>

          {/* 6. NUMÉRO BILLET */}
          <p className="text-xs font-mono font-bold">N° {receiptNumber}</p>

          {/* 7. SÉPARATEUR */}
          <div className="border-t border-dashed border-black my-1"></div>

          {/* 8. TRAJET */}
          <div className="text-sm font-bold uppercase tracking-wider py-1">
            {depart} → {arrivee}
          </div>

          {/* 9. INFOS COMPACTÉES */}
          <div className="text-xs font-semibold">
            {date} • {heure} • {seats} passager{seats > 1 ? 's' : ''}
          </div>

          {/* 10. SÉPARATEUR */}
          <div className="border-t border-dashed border-black my-1"></div>

          {/* 11. PRIX */}
          <div className="text-lg font-bold font-mono py-1">
            {money(montant)}
          </div>

          {/* 12. STATUT */}
          <div className="text-xs font-semibold text-gray-800">
            {getStatusLabel()}
          </div>

          {/* 13. SÉPARATEUR */}
          <div className="border-t border-dashed border-black my-1"></div>

          {/* 14. QR CODE */}
          <div className="py-3 flex justify-center">
            <div className="p-2 border-2 border-black bg-white">
              <div className={!isValidQR ? "opacity-50" : ""}>
                <QRCode value={qrValue} size={120} level="H" />
              </div>
            </div>
          </div>

          {/* 15. CODE BILLET */}
          <p className="text-xs font-mono font-bold">{receiptNumber}</p>

          {/* 16. SÉPARATEUR */}
          <div className="border-t border-dashed border-black my-1"></div>

          {/* 17. MENTIONS */}
          <div className="text-xs leading-snug space-y-0.5">
            <p className="font-bold">Présentez ce code au contrôle</p>
            <p className="text-gray-700">Valide 1 mois</p>
            {emissionDate && (
              <p className="text-gray-700 font-mono">Émis: {emissionDate}</p>
            )}
          </div>

        </div>
      </div>

      {/* ACTIONS (HORS TICKET) */}
      <div className="flex gap-2 justify-center flex-wrap">
        {isConfirmed && (
          <button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 text-black text-xs font-semibold hover:bg-gray-300 transition rounded"
          >
            <Download size={14} />
            {pdfLoading ? 'En cours...' : 'PDF'}
          </button>
        )}

        {agencyLatitude && agencyLongitude && (
          <button
            onClick={handleItineraire}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 text-black text-xs font-semibold hover:bg-gray-300 transition rounded"
          >
            <MapPin size={14} />
            Itinéraire
          </button>
        )}
      </div>

    </div>
  );
};

export default TicketOnline;