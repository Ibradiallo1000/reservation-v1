// src/components/ticket/TicketOnline.tsx

import React, { useCallback, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  ArrowRight,
  User,
  Phone,
  Download,
  MapPin,
  CheckCircle,
  Lock
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { safeTextColor } from '@/utils/color';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { isTicketValidForQR } from '@/utils/reservationStatusUtils';

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
  canal?: string;
  montant: number;
  qrValue: string;
  emissionDate: string;
  paymentMethod?: string;
  statusLabel?: string;
  agencyLatitude?: number | null;
  agencyLongitude?: number | null;
}

function getPaymentDisplayLabel(canal?: string, paymentMethod?: string) {
  const c = (canal ?? '').toLowerCase();
  if (c === 'guichet') return 'Paiement en espèces';
  if (paymentMethod && paymentMethod.trim()) return paymentMethod.trim();
  if (c === 'en_ligne') return 'Paiement en ligne';
  return 'Paiement';
}

const TicketOnline: React.FC<TicketOnlineProps> = ({
  companyName,
  logoUrl,
  primaryColor,
  secondaryColor,
  agencyName,
  receiptNumber,
  statut = 'confirme',
  nomClient,
  telephone,
  depart,
  arrivee,
  date,
  heure,
  seats,
  canal = 'en_ligne',
  montant,
  qrValue,
  paymentMethod,
  agencyLatitude,
  agencyLongitude
}) => {
  const money = useFormatCurrency();
  const accent = secondaryColor || primaryColor;
  const textOnPrimary = safeTextColor(primaryColor);
  const [pdfLoading, setPdfLoading] = useState(false);

  const isConfirmed = statut?.toLowerCase() === 'confirme';
  const isTicketValid = isTicketValidForQR(statut);
  const paymentLabel = getPaymentDisplayLabel(canal, paymentMethod);

  const handleDownloadPDF = useCallback(async () => {
    const element = document.getElementById('ticket-content');
    if (!element) return;
    setPdfLoading(true);
    try {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const imgW = 190;
      const imgH = (canvas.height * imgW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgW, Math.min(imgH, 270));
      pdf.save(`billet-${receiptNumber}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [receiptNumber]);

  const handleItineraire = useCallback(() => {
    if (agencyLatitude == null || agencyLongitude == null) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${agencyLatitude},${agencyLongitude}`,
      '_blank'
    );
  }, [agencyLatitude, agencyLongitude]);

  const formatName = (name: string) =>
    name
      .toLowerCase()
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  return (
    <div className="w-full flex justify-center bg-gray-100 px-3 py-4">
      <div
        id="ticket-content"
        className="w-full max-w-md rounded-3xl bg-[#f9f9f9] shadow-2xl border border-gray-200 overflow-hidden"
      >

        {/* HEADER */}
        <div
          className="px-4 pt-4 pb-3"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${accent})`,
            color: textOnPrimary
          }}
        >
          <div className="flex justify-between items-start">
            <div>
              <h1 className="font-bold text-lg uppercase tracking-wide">
                {companyName}
              </h1>
              {agencyName && (
                <p className="text-xs opacity-80">{agencyName}</p>
              )}
            </div>

            <div className="text-right">
              <p className="text-[10px] uppercase opacity-80">Référence</p>
              <p className="font-mono text-sm font-semibold">
                {receiptNumber}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <span className="inline-flex items-center gap-2 bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold">
              <CheckCircle size={14} />
              {isConfirmed ? "PAIEMENT VALIDÉ" : "EN ATTENTE DE VALIDATION"}
            </span>
          </div>
        </div>

        {/* BODY */}
        <div className="px-4 py-4 space-y-4">

          {/* PASSAGER */}
          <div className="border border-dashed border-gray-300 rounded-xl p-3">
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <User size={16} />
                <span className="font-semibold">
                  {formatName(nomClient)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={16} />
                <span>{telephone}</span>
              </div>
            </div>
          </div>

          {/* TRAJET */}
          <div className="text-center">
            <div className="text-xl font-bold uppercase tracking-wide">
              {depart}
              <ArrowRight className="inline mx-2" size={18} />
              {arrivee}
            </div>

            <div className="mt-3 bg-white rounded-2xl shadow-sm border border-gray-200 grid grid-cols-3 text-center text-xs py-3">
              <div>
                <p className="uppercase text-gray-400">Date</p>
                <p className="font-semibold text-sm">{date}</p>
              </div>
              <div>
                <p className="uppercase text-gray-400">Heure</p>
                <p className="font-semibold text-sm">{heure}</p>
              </div>
              <div>
                <p className="uppercase text-gray-400">Passager</p>
                <p className="font-semibold text-sm">{seats}</p>
              </div>
            </div>
          </div>

          {/* PRIX */}
          <div
            className="rounded-full px-5 py-4 flex justify-between items-center shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${accent})`,
              color: textOnPrimary
            }}
          >
            <div>
              <p className="text-[10px] uppercase opacity-80">Prix</p>
              <p className="text-2xl font-extrabold">
                {money(montant)}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Lock size={14} />
              <span>{paymentLabel}</span>
            </div>
          </div>

          {/* QR */}
          <div className="text-center">
            <p className="text-[10px] uppercase text-gray-400 mb-2">
              Code d'embarquement
            </p>

            <div className="inline-block bg-white p-3 rounded-2xl shadow-md border border-gray-200">
              <div className={!isTicketValid ? "opacity-40 blur-sm" : ""}>
                <QRCode value={qrValue} size={110} level="H" />
              </div>
            </div>

            <p className="font-mono text-xs mt-2 text-gray-600">
              {receiptNumber}
            </p>
          </div>

          {/* ACTIONS */}
          <div className="flex gap-3">
            {isConfirmed && (
              <button
                onClick={handleDownloadPDF}
                disabled={pdfLoading}
                className="flex-1 bg-white border border-gray-200 rounded-xl py-2 text-sm font-semibold shadow-sm hover:shadow-md transition"
              >
                <Download size={14} className="inline mr-1" />
                PDF
              </button>
            )}

            {agencyLatitude != null && agencyLongitude != null && (
              <button
                onClick={handleItineraire}
                className="flex-1 bg-white border border-gray-200 rounded-xl py-2 text-sm font-semibold shadow-sm hover:shadow-md transition"
              >
                <MapPin size={14} className="inline mr-1" />
                Itinéraire
              </button>
            )}
          </div>

          {/* FOOTER */}
          <div className="text-center text-xs text-gray-500 space-y-1 pt-2">
            <p>Présentez ce code au contrôle.</p>
            <p>Valide : 1 mois à compter de la date d’émission.</p>
            <p className="font-medium" style={{ color: primaryColor }}>
              Merci d’avoir choisi {companyName}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TicketOnline;