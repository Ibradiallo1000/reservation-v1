import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { ArrowRight } from "lucide-react";
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

  void secondaryColor;
  void pdfLoading;
  void handleDownloadPDF;
  void handleItineraire;

  return (
    <div className="online-thermal-ticket-shell">
      <article id="ticket-content" className="online-thermal-ticket ticket-force-light">
        <div className="online-thermal-ticket__content">
          <header className="online-thermal-ticket__header">
            {logoUrl && <img src={logoUrl} alt="" className="online-thermal-ticket__logo" />}
            <h1 className="online-thermal-ticket__company" title={companyName}>{companyName}</h1>
            {agencyName && <p className="online-thermal-ticket__agency">{agencyName}</p>}
          </header>

          <div className="online-thermal-ticket__rule" />

          <section className="online-thermal-ticket__reference-block">
            <span className="online-thermal-ticket__reference-label">N° BILLET</span>
            <strong className="online-thermal-ticket__reference">{receiptNumber}</strong>
            <span className="online-thermal-ticket__emission">
              Date d&apos;émission : {emissionDate ?? "—"}
            </span>
          </section>

          <div className="online-thermal-ticket__rule" />

          <section className="online-thermal-ticket__rows">
            <div className="online-thermal-ticket__row"><span>Passager</span><strong>{nomClient}</strong></div>
            <div className="online-thermal-ticket__row"><span>Téléphone</span><span>{telephone}</span></div>
          </section>

          <div className="online-thermal-ticket__rule" />

          <section className="online-thermal-ticket__route">
            <span className="online-thermal-ticket__section-title">TRAJET</span>
            <strong className="online-thermal-ticket__route-line">
              <span>{depart}</span><ArrowRight size={14} aria-hidden="true" /><span>{arrivee}</span>
            </strong>
            <span>{date} • {heure}</span>
            <span>{seats} billet</span>
          </section>

          <div className="online-thermal-ticket__rule" />

          <section className="online-thermal-ticket__payment">
            <strong className="online-thermal-ticket__amount">{money(montant)}</strong>
            <span>Paiement : {getStatusLabel()}</span>
          </section>

          <div className="online-thermal-ticket__rule" />

          <section className="online-thermal-ticket__qr-section">
            <div className="online-thermal-ticket__qr">
              <div className={!isValidQR ? "opacity-40 blur-sm" : ""}>
                <QRCode value={qrValue} size={126} />
              </div>
            </div>
          </section>

          <div className="online-thermal-ticket__rule" />

          <section className="online-thermal-ticket__mentions">
            <p>Présentez ce code au contrôle.</p>
            <p>Valide : 1 mois à compter de la date d&apos;émission.</p>
          </section>

          <div className="online-thermal-ticket__rule" />

          <footer className="online-thermal-ticket__thanks" style={{ color: primaryColor }}>
            Merci d&apos;avoir choisi {companyName}
          </footer>
        </div>
      </article>
    </div>
  );
};

export default TicketOnline;
