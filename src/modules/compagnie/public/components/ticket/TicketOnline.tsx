import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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
    if (s === "en_attente_paiement") return t("ticketStatusAwaitingPayment");
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
    <div className="flex justify-center p-6 bg-[#f4f5f7]">
      <div
        id="ticket-content"
        className="w-full max-w-md bg-white rounded-2xl shadow-md overflow-hidden"
      >
        {/* Ligne branding */}
        <div
          style={{
            height: 5,
            background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor || primaryColor})`
          }}
        />

        <div className="p-5 space-y-4">

          {/* HEADER */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  className="h-8 w-8 object-contain"
                />
              )}
              <div>
                <h1 className="text-sm font-bold uppercase tracking-wide">
                  {companyName}
                </h1>
                {agencyName && (
                  <p
                    className="text-xs"
                    style={{ color: secondaryColor || "#6c757d" }}
                  >
                    {agencyName}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right">
              <p
                className="text-[10px] uppercase"
                style={{ color: secondaryColor || "#6c757d" }}
              >
                REF
              </p>
              <p className="font-mono text-xs font-semibold">
                {receiptNumber}
              </p>
            </div>
          </div>

          {/* PASSAGER */}
          <div
            className="flex justify-between text-sm border-b pb-3"
            style={{ borderColor: secondaryColor + "40" }}
          >
            <div className="flex items-center gap-2">
              <User size={15} style={{ color: secondaryColor }} />
              <span>{nomClient}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone size={15} style={{ color: secondaryColor }} />
              <span>{telephone}</span>
            </div>
          </div>

          {/* TRAJET */}
          <div className="text-center">
            <div className="text-lg font-semibold uppercase">
              {depart}
              <ArrowRight
                className="inline mx-2"
                size={14}
                style={{ color: secondaryColor }}
              />
              {arrivee}
            </div>

            <div
              className="mt-3 text-xs grid grid-cols-3 text-center"
              style={{ color: secondaryColor || "#6c757d" }}
            >
              <div>
                <p>Date départ</p>
                <p className="font-semibold text-gray-800">{date}</p>
              </div>
              <div>
                <p>Heure départ</p>
                <p className="font-semibold text-gray-800">{heure}</p>
              </div>
              <div>
                <p>Passager</p>
                <p className="font-semibold text-gray-800">{seats}</p>
              </div>
            </div>
          </div>

          {/* PRIX + STATUT */}
          <div
            className="flex justify-between items-center border-t pt-4"
            style={{ borderColor: secondaryColor + "40" }}
          >
            <div
              className="text-xl font-bold"
              style={{ color: primaryColor }}
            >
              {money(montant)}
            </div>

            <div
              className="px-3 py-1 rounded-md text-xs font-semibold"
              style={{
                backgroundColor:
                  statut === "confirme"
                    ? primaryColor + "15"
                    : secondaryColor + "15",
                color:
                  statut === "confirme"
                    ? primaryColor
                    : secondaryColor,
                border: `1px solid ${
                  statut === "confirme"
                    ? primaryColor + "40"
                    : secondaryColor + "40"
                }`
              }}
            >
              {getStatusLabel()}
            </div>
          </div>

          {/* QR */}
          <div className="text-center pt-2">
            <p
              className="text-[10px] uppercase mb-2"
              style={{ color: secondaryColor || "#6c757d" }}
            >
              Code d'embarquement
            </p>

            <div
              className="inline-block p-3 rounded-lg"
              style={{
                border: `1px solid ${secondaryColor}30`
              }}
            >
              <div className={!isValidQR ? "opacity-40 blur-sm" : ""}>
                <QRCode value={qrValue} size={110} />
              </div>
            </div>

            <p className="font-mono text-xs mt-2 text-gray-500">
              {receiptNumber}
            </p>
          </div>

          {/* DATE EMISSION */}
          <div
            className="text-xs text-center"
            style={{ color: secondaryColor || "#6c757d" }}
          >
            Date d’émission :           {emissionDate ?? '—'}
            </div>

          {/* ACTIONS */}
          <div className="flex justify-between text-sm pt-3">
            {isConfirmed && (
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 font-medium hover:opacity-80 transition"
                style={{ color: secondaryColor }}
              >
                <Download size={15} />
                PDF
              </button>
            )}

            {agencyLatitude && agencyLongitude && (
              <button
                onClick={handleItineraire}
                className="flex items-center gap-2 font-medium hover:opacity-80 transition"
                style={{ color: secondaryColor }}
              >
                <MapPin size={15} />
                Itinéraire
              </button>
            )}
          </div>

          {/* FOOTER */}
          <div className="text-center text-xs text-gray-600 pt-3">
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