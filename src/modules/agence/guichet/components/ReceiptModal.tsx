// src/components/ReceiptModal.tsx

import React, { useRef } from 'react';
import QRCode from 'react-qr-code';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import html2pdf from 'html2pdf.js';
import { DEFAULT_TICKET_MESSAGES } from '@/constants/ticketMessages';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';

export interface ReservationData {
  id: string;
  nomClient: string;
  telephone: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;

  paiement?: string;
  statut?: string;
  referenceCode?: string;

  agencyNom?: string;
  agenceTelephone?: string;
  createdAt?: any;

  compagnieId?: string | null;
  agencyId?: string | null;
  companySlug?: string | null;

  guichetierId?: string | null;
  guichetierCode?: string | null;

  shiftId?: string | null;
  email?: string | null;
}

export interface CompanyData {
  nom: string;
  logoUrl?: string;
  telephone?: string;
  couleurPrimaire?: string;   // ✅ AJOUTÉ
  couleurSecondaire?: string; // ✅ AJOUTÉ
  slug?: string;
  id?: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  reservation: ReservationData;
  company: CompanyData;
};

/* 🔥 Capitalisation automatique nom/prénom */
function formatFullName(name: string) {
  return name
    ?.toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/* 🔥 Format date JJ/MM/AAAA */
function formatTripDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: fr });
  } catch {
    return dateStr;
  }
}

const ReceiptModal: React.FC<Props> = ({
  open,
  onClose,
  reservation,
  company
}) => {
  const money = useFormatCurrency();
  const ref = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const receiptNumber =
    reservation.referenceCode || reservation.id;

  const qrValue = `${window.location.origin}/r/${receiptNumber}`;

  const emissionDate = format(
    new Date(reservation.createdAt || new Date()),
    'dd/MM/yyyy HH:mm',
    { locale: fr }
  );

  const handlePDF = () => {
    if (!ref.current) return;

    html2pdf()
      .set({
        margin: 2,
        filename: `ticket-${receiptNumber}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: [80, 200] }
      })
      .from(ref.current)
      .save();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #thermal-ticket, #thermal-ticket * { visibility: visible !important; }
          #thermal-ticket { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        id="thermal-ticket"
        className="ticket-force-light bg-white rounded-xl shadow-xl overflow-hidden"
        style={{
          width: '80mm',
          fontFamily: 'monospace',
          fontSize: '12px',
          lineHeight: '1.5'
        }}
      >

        {/* HEADER ACTIONS */}
        <div className="no-print flex justify-between items-center px-4 py-3 border-b">
          <div className="font-semibold">{company.nom}</div>
          <div className="flex gap-2">
            <button onClick={handlePDF}>PDF</button>
            <button onClick={() => window.print()}>Imprimer</button>
            <button onClick={onClose}>Fermer</button>
          </div>
        </div>

        {/* CONTENU */}
        <div ref={ref} className="p-4 text-black">

          {/* LOGO + NOM */}
          <div className="text-center mb-3">
            {company.logoUrl && (
              <img
                src={company.logoUrl}
                alt="logo"
                style={{
                  width: '60px',
                  height: '60px',
                  objectFit: 'cover',
                  borderRadius: '50%',
                  border: '2px solid #000',
                  margin: '0 auto'
                }}
              />
            )}

            <div style={{ fontWeight: 'bold', fontSize: '14px', marginTop: '6px' }}>
              {company.nom.toUpperCase()}
            </div>

            <div style={{ fontSize: '11px' }}>
              {reservation.agencyNom || 'Agence'}
            </div>
          </div>

          <hr />

          {/* RÉFÉRENCE */}
          <div style={{ textAlign: 'center', margin: '6px 0' }}>
            <div style={{ fontWeight: 'bold' }}>
              N° {receiptNumber}
            </div>
            <div style={{ fontSize: '11px' }}>
              Émis le {emissionDate}
            </div>
          </div>

          <hr />

          {/* PASSAGER ALIGNÉ */}
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Passager :</span>
              <span style={{ fontWeight: 'bold' }}>
                {formatFullName(reservation.nomClient)}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Téléphone :</span>
              <span>{reservation.telephone}</span>
            </div>
          </div>

          <hr />

          {/* TRAJET */}
          <div style={{ textAlign: 'center', margin: '10px 0' }}>
            <div style={{
              fontWeight: 'bold',
              fontSize: '14px',
              letterSpacing: '1px'
            }}>
              {reservation.depart.toUpperCase()} → {reservation.arrivee.toUpperCase()}
            </div>

            <div style={{ marginTop: '4px' }}>
              {formatTripDate(reservation.date)} • {reservation.heure}
            </div>

            <div style={{ fontSize: '11px' }}>
              {reservation.seatsGo} place(s) • guichet
            </div>
          </div>

          <hr />

          {/* MONTANT */}
          <div style={{ textAlign: 'center', margin: '10px 0' }}>
            <div style={{
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              {money(reservation.montant)}
            </div>

            <div style={{ fontSize: '11px' }}>
              Paiement : {(reservation.paiement || 'espèces').toUpperCase()}
            </div>
          </div>

          <hr />

          {/* QR */}
          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              justifyContent: 'center'
            }}
          >
           <QRCode
             value={qrValue}
             size={100}
             level="H"
             fgColor="#000000"
           />
         </div>

         <div
           style={{
             textAlign: 'center',
             fontSize: '10px',
             marginTop: '6px'
           }}
         >
          Validité : 1 mois à compter de la date d’émission.
         </div>

          <hr />

          {/* FOOTER */}
          <div style={{
            textAlign: 'center',
            fontSize: '10px',
            marginTop: '8px'
          }}>

            <div style={{ fontWeight: 'bold' }}>
              {DEFAULT_TICKET_MESSAGES.control}
            </div>

            <div>
              {DEFAULT_TICKET_MESSAGES.validity}
            </div>

            <div>
              Merci d'avoir choisi {company.nom}
            </div>

            <div style={{ fontStyle: 'italic' }}>
              {DEFAULT_TICKET_MESSAGES.arrival}
            </div>

            <div>
              {DEFAULT_TICKET_MESSAGES.keep}
            </div>
         </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
