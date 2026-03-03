import React, { useCallback, useState } from "react";
import QRCode from "react-qr-code";
import {
  ArrowRight,
  User,
  Phone,
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
  receiptNumber: string;
  statut?: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  seats: number;
  montant: number;
  qrValue: string;
  agencyLatitude?: number | null;
  agencyLongitude?: number | null;
  /** Passed by ReceiptEnLignePage / ReservationDetailsPage, accepted for compatibility */
  canal?: string;
  emissionDate?: string;
  paymentMethod?: string;
  statusLabel?: string;
}

const TicketOnline: React.FC<TicketOnlineProps> = ({
  companyName,
  logoUrl,
  primaryColor,
  secondaryColor,
  agencyName,
  receiptNumber,
  statut = "confirme",
  nomClient,
  telephone,
  depart,
  arrivee,
  date,
  heure,
  seats,
  montant,
  qrValue,
  agencyLatitude,
  agencyLongitude
}) => {
  const money = useFormatCurrency();
  const [pdfLoading, setPdfLoading] = useState(false);

  const isConfirmed = statut?.toLowerCase() === "confirme";
  const isValidQR = isTicketValidForQR(statut);

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
    <div
      className="flex justify-center p-6"
      style={{
        background: `linear-gradient(
          135deg,
          ${primaryColor}66 0%,
          ${secondaryColor || primaryColor}55 100%
        )`
      }}
    >
      <div
        id="ticket-content"
        className="w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
        style={{
          background: "#ffffff"
        }}
      >
        {/* TOP BRAND LINE */}
        <div
          style={{
            height: 6,
            background: primaryColor
          }}
        />

        <div className="p-5 space-y-5">

          {/* HEADER */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  className="h-10 w-10 object-contain"
                />
              )}
              <div>
                <h1 className="text-sm font-bold uppercase tracking-wide">
                  {companyName}
                </h1>
                {agencyName && (
                  <p className="text-xs text-gray-500">
                    {agencyName}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right">
              <p className="text-[10px] uppercase text-gray-400">
                REF
              </p>
              <p className="font-mono text-xs font-semibold">
                {receiptNumber}
              </p>
            </div>
          </div>

          {/* PASSAGER */}
          <div className="flex justify-between text-sm border-b pb-3">
            <div className="flex items-center gap-2">
              <User size={16} />
              <span className="font-medium">{nomClient}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone size={16} />
              <span>{telephone}</span>
            </div>
          </div>

          {/* TRAJET */}
          <div className="text-center">
            <div className="text-lg font-semibold uppercase tracking-wide">
              {depart}
              <ArrowRight className="inline mx-3" size={16} />
              {arrivee}
            </div>

            <div className="mt-3 text-xs grid grid-cols-3 text-center text-gray-600">
              <div>
                <p>Date</p>
                <p className="font-semibold text-gray-800">{date}</p>
              </div>
              <div>
                <p>Heure</p>
                <p className="font-semibold text-gray-800">{heure}</p>
              </div>
              <div>
                <p>Passager</p>
                <p className="font-semibold text-gray-800">{seats}</p>
              </div>
            </div>
          </div>

          {/* PRIX + STATUT */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div
              className="text-xl font-bold"
              style={{ color: primaryColor }}
            >
              {money(montant)}
            </div>

            {isConfirmed && (
              <div
                className="px-4 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: primaryColor,
                  color: "#ffffff"
                }}
              >
                Paiement validé
              </div>
            )}
          </div>

          {/* QR */}
          <div className="text-center pt-3">
            <p className="text-[10px] uppercase text-gray-400 mb-2">
              Code d'embarquement
            </p>

            <div className="inline-block p-4 rounded-xl border border-gray-200 shadow-sm">
              <div className={!isValidQR ? "opacity-40 blur-sm" : ""}>
                <QRCode value={qrValue} size={120} level="H" />
              </div>
            </div>

            <p className="font-mono text-xs mt-3 text-gray-500">
              {receiptNumber}
            </p>
          </div>

          {/* ACTIONS */}
          <div className="flex justify-between text-sm pt-2">
            {isConfirmed && (
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 font-medium text-gray-700 hover:opacity-80 transition"
              >
                <Download size={16} />
                PDF
              </button>
            )}

            {agencyLatitude && agencyLongitude && (
              <button
                onClick={handleItineraire}
                className="flex items-center gap-2 font-medium hover:opacity-80 transition"
                style={{ color: primaryColor }}
              >
                <MapPin size={16} />
                Itinéraire
              </button>
            )}
          </div>

          {/* FOOTER */}
          <div className="text-center text-xs text-gray-600 pt-2">
            <p>Présentez ce code au contrôle.</p>
            <p>Valide : 1 mois à compter de la date d’émission.</p>
            <p
              className="font-semibold mt-2"
              style={{ color: primaryColor }}
            >
              Merci d’avoir choisi {companyName}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TicketOnline;