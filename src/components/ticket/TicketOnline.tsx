// src/components/ticket/TicketOnline.tsx

import React from 'react';
import QRCode from 'react-qr-code';
import {
  ArrowRight,
  User,
  Phone,
  Calendar,
  Clock,
  Users
} from 'lucide-react';
import { safeTextColor } from '@/utils/color';
import { DEFAULT_TICKET_MESSAGES } from '@/constants/ticketMessages';

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
}

const TicketOnline: React.FC<TicketOnlineProps> = ({
  companyName,
  logoUrl,
  primaryColor,
  secondaryColor,
  agencyName,
  receiptNumber,
  statut = 'CONFIRMÉ',
  nomClient,
  telephone,
  depart,
  arrivee,
  date,
  heure,
  seats,
  canal = 'EN LIGNE',
  montant,
  qrValue,
  emissionDate,
  paymentMethod = 'PAIEMENT MOBILE'
}) => {

  const textOnPrimary = safeTextColor(primaryColor);
  const accent = secondaryColor || primaryColor;

  /* ==============================
     FORMAT NOM (Majuscules auto)
  ============================== */
  const formatName = (name: string) => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join(' ');
  };

  const formattedName = formatName(nomClient);

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden text-sm">

      {/* ================= HEADER ================= */}
      <div
        className="px-4 py-3"
        style={{
          backgroundColor: primaryColor,
          color: textOnPrimary
        }}
      >
        <div className="flex items-center justify-between">

          <div className="flex items-center gap-2">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={companyName}
                className="h-8 w-8 rounded-full object-cover border"
                style={{ borderColor: textOnPrimary }}
              />
            )}
            <div>
              <h1 className="font-bold uppercase text-sm leading-tight">
                {companyName}
              </h1>
              {agencyName && (
                <p className="text-[10px] opacity-90">
                  {agencyName}
                </p>
              )}
            </div>
          </div>

          <div className="text-right text-[10px] font-mono">
            <p>{receiptNumber}</p>
            <p>{emissionDate}</p>
          </div>

        </div>
      </div>

      {/* ================= STATUS ================= */}
      <div className="px-4 py-1.5 flex justify-between items-center bg-gray-50 border-b text-[10px]">
        <span
          className="font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: accent,
            color: safeTextColor(accent)
          }}
        >
          {statut}
        </span>

        <span className="uppercase tracking-wide text-gray-600">
          {canal}
        </span>
      </div>

      {/* ================= CLIENT (compact aligné) ================= */}
      <div className="px-4 py-3 border-b">

        <div className="flex justify-between items-center">

          <div className="flex items-center gap-2">
            <User size={14} style={{ color: accent }} />
            <span className="font-semibold">
              {formattedName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Phone size={14} style={{ color: accent }} />
            <span>{telephone}</span>
          </div>

        </div>

      </div>

      {/* ================= TRAJET ================= */}
      <div className="px-4 py-4">

        <div className="flex items-center justify-center gap-2 text-base font-bold uppercase mb-3">
          <span>{depart}</span>
          <ArrowRight size={16} style={{ color: accent }} />
          <span>{arrivee}</span>
        </div>

        <div
          className="grid grid-cols-3 gap-2 text-[11px] rounded-xl p-2"
          style={{
            backgroundColor: `${accent}15`
          }}
        >
          <div className="flex flex-col items-center gap-1">
            <Calendar size={14} style={{ color: accent }} />
            <span className="font-semibold">{date}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <Clock size={14} style={{ color: accent }} />
            <span className="font-semibold">{heure}</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <Users size={14} style={{ color: accent }} />
            <span className="font-semibold">{seats}</span>
          </div>
        </div>

      </div>

      {/* ================= PAIEMENT ================= */}
      <div className="px-4 py-3 border-t border-b bg-gray-50">

        <div className="flex justify-between items-center">

          <p
            className="text-lg font-bold"
            style={{ color: primaryColor }}
          >
            {montant.toLocaleString('fr-FR')} FCFA
          </p>

          <span className="text-[10px] text-gray-600 uppercase">
            {paymentMethod}
          </span>

        </div>

      </div>

      {/* ================= QR ================= */}
      <div className="px-4 py-4 text-center">

        <p
          className="text-[10px] uppercase mb-2 font-semibold"
          style={{ color: accent }}
        >
          Code d’embarquement
        </p>

        <div className="inline-block bg-white p-2 rounded-xl shadow">
          <QRCode
            value={qrValue}
            size={95}
            fgColor="#000000"
            bgColor="#ffffff"
            level="H"
          />
        </div>

        <p className="text-[10px] font-mono mt-2 font-semibold">
          {receiptNumber}
        </p>

      </div>

      {/* ================= MESSAGES OFFICIELS ================= */}
      <div className="px-4 py-3 text-center text-[10px] text-gray-600 border-t space-y-1">

       <p className="font-semibold">
         {DEFAULT_TICKET_MESSAGES.control}
       </p>

       <p>
         {DEFAULT_TICKET_MESSAGES.validity}
       </p>

       <p>
         Merci d’avoir choisi {companyName}
       </p>

       <p className="italic">
         {DEFAULT_TICKET_MESSAGES.arrival}
       </p>

       <p>
         {DEFAULT_TICKET_MESSAGES.keep}
       </p>

     </div>

    </div>
  );
};

export default TicketOnline;
