// src/components/Receipt80mm.tsx
import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { MapPin, Phone, User, Ticket, CreditCard, ArrowRight, Download, Printer, X } from 'lucide-react';
import { hexToRgba, safeTextColor } from '@/utils/color';

export type ReservationData = {
  id: string; nomClient: string; telephone: string; email?: string;
  date: string; heure: string; depart: string; arrivee: string;
  seatsGo: number; seatsReturn?: number; montant: number;
  statut: string; paiement: string; compagnieId: string; compagnieNom: string;
  agencyNom?: string; nomAgence?: string; agenceTelephone?: string;
  canal: string; createdAt?: any; companySlug?: string;
  referenceCode?: string; qrCode?: string | null;
};

export type CompanyData = {
  id: string; nom: string; logoUrl?: string;
  couleurPrimaire: string; couleurSecondaire?: string; telephone?: string;
};

type Props = {
  reservation: ReservationData;
  company: CompanyData;
  onClose?: () => void;           // pour bouton "Fermer" dans la modal
  autoPrint?: boolean;            // imprime automatiquement à l'ouverture
  showActions?: boolean;          // afficher boutons Télécharger/Imprimer
};

export default function Receipt80mm({ reservation, company, onClose, autoPrint = false, showActions = true }: Props) {
  const primaryColor = company.couleurPrimaire || '#3b82f6';
  const secondaryColor = company.couleurSecondaire || '#93c5fd';
  const textOnPrimary = safeTextColor(primaryColor);
  const receiptRef = useRef<HTMLDivElement>(null);

  const formatDate = useCallback((val: string, f: string) => {
    try { return format(parseISO(val), f, { locale: fr }); } catch { return val; }
  }, []);

  const receiptNumber = useMemo(() => {
    if (reservation.referenceCode) return reservation.referenceCode;
    const dep = (reservation.depart || 'DEP').slice(0,3).toUpperCase();
    const arr = (reservation.arrivee || 'ARR').slice(0,3).toUpperCase();
    return `AGC-${dep}${arr}-${reservation.id.slice(-6).toUpperCase()}`;
  }, [reservation]);

  const qrValue = useMemo(() => {
    const base = window.location.origin;
    const ref = reservation.referenceCode || reservation.id;
    return `${base}/r/${encodeURIComponent(ref)}`;
  }, [reservation]);

  const handlePDF = useCallback(() => {
    if (!receiptRef.current) return;
    const opt = {
      margin: 2,
      filename: `recu-${receiptNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 340 },
      jsPDF: { unit: 'mm', format: [81, 200], orientation: 'portrait' }
    };
    html2pdf().set(opt).from(receiptRef.current).save();
  }, [receiptNumber]);

  useEffect(() => {
    if (autoPrint) {
      // petit délai pour laisser le DOM s’afficher
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  return (
    <div className="w-[81mm] mx-auto text-[11px]">
      {/* barre d’actions (optionnelle) */}
      {showActions && (
        <div className="flex items-center justify-between px-2 py-2 border-b">
          <div className="flex items-center gap-2">
            {company.logoUrl && <img src={company.logoUrl} className="h-6 w-6 object-contain rounded" />}
            <div className="text-xs font-semibold">{company.nom}</div>
          </div>
          <div className="flex gap-2">
            <button className="px-2 py-1 rounded border flex items-center gap-1" onClick={handlePDF}>
              <Download className="h-4 w-4" /> PDF
            </button>
            <button className="px-2 py-1 rounded border flex items-center gap-1" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimer
            </button>
            {onClose && (
              <button className="px-2 py-1 rounded border flex items-center gap-1" onClick={onClose}>
                <X className="h-4 w-4" /> Fermer
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={receiptRef} className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ width: '81mm', margin: '0 auto' }}>
        {/* entête */}
        <div className="flex justify-between items-center border-b pb-2 mb-2 px-3" style={{ borderColor: hexToRgba(primaryColor, 0.3) }}>
          <div className="flex items-center gap-2">
            {company.logoUrl && (
              <img src={company.logoUrl} alt={company.nom} className="h-9 w-9 object-contain rounded border" style={{ borderColor: primaryColor }} />
            )}
            <div className="leading-tight">
              <h2 className="text-sm font-bold" style={{ color: primaryColor }}>{company.nom}</h2>
              <p className="text-[11px] text-gray-700 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-gray-500" />
                {(reservation.agencyNom || reservation.nomAgence || 'Agence').trim()}
              </p>
            </div>
          </div>
          <div className="text-right leading-tight pr-2">
            <p className="text-[11px] font-mono tracking-tight text-gray-700">N° {receiptNumber}</p>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: hexToRgba(primaryColor, 0.15), color: primaryColor }}>
              {(reservation.statut || 'payé').toString().toUpperCase()}
            </span>
          </div>
        </div>

        {/* client */}
        <div className="px-3">
          <div className="flex items-center gap-1 mb-1">
            <User className="h-3 w-3" style={{ color: primaryColor }} />
            <h3 className="text-xs font-semibold" style={{ color: primaryColor }}>Client</h3>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div><p className="text-[10px] text-gray-600">Nom</p><p className="truncate">{reservation.nomClient}</p></div>
            <div><p className="text-[10px] text-gray-600">Téléphone</p><p>{reservation.telephone}</p></div>
          </div>
        </div>

        {/* voyage */}
        <div className="px-3 mt-2">
          <div className="flex items-center gap-1 mb-1">
            <Ticket className="h-3 w-3" style={{ color: primaryColor }} />
            <h3 className="text-xs font-semibold" style={{ color: primaryColor }}>Voyage</h3>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div className="col-span-2">
              <p className="text-[10px] text-gray-600">Trajet</p>
              <div className="flex items-center gap-1">
                <p className="font-medium">{reservation.depart}</p>
                <ArrowRight className="h-3 w-3 text-gray-500" />
                <p className="font-medium">{reservation.arrivee}</p>
              </div>
            </div>
            <div><p className="text-[10px] text-gray-600">Date</p><p>{formatDate(reservation.date, 'dd/MM/yyyy')}</p></div>
            <div><p className="text-[10px] text-gray-600">Heure</p><p>{reservation.heure}</p></div>
            <div><p className="text-[10px] text-gray-600">Places</p><p>{reservation.seatsGo}{reservation.seatsReturn ? ` (+${reservation.seatsReturn} retour)` : ''}</p></div>
            <div><p className="text-[10px] text-gray-600">Canal</p><p className="capitalize">{reservation.canal}</p></div>
          </div>
        </div>

        {/* paiement */}
        <div className="px-3 mt-2">
          <div className="flex items-center gap-1 mb-1">
            <CreditCard className="h-3 w-3" style={{ color: primaryColor }} />
            <h3 className="text-xs font-semibold" style={{ color: primaryColor }}>Paiement</h3>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <p className="text-[10px] text-gray-600">Montant</p>
              <p className="font-bold" style={{ color: primaryColor }}>
                {reservation.montant?.toLocaleString('fr-FR')} FCFA
              </p>
            </div>
            <div><p className="text-[10px] text-gray-600">Méthode</p><p className="capitalize">{reservation.paiement}</p></div>
          </div>
        </div>

        {/* QR + validité */}
        <div className="m-3 p-2 rounded border border-gray-200 flex flex-col items-center">
          <h3 className="text-xs font-semibold mb-1" style={{ color: primaryColor }}>Code d'embarquement</h3>
          <div className="bg-white p-1 rounded border" style={{ borderColor: primaryColor }}>
            <QRCode value={qrValue} size={60} fgColor={primaryColor} level="H" />
          </div>
          <p className="mt-2 text-[10px] text-gray-600 text-center">
            Validité : 1 mois à compter de la date d’émission.
          </p>
        </div>

        {/* footer */}
        <div className="px-3 pb-3 border-t border-gray-200 text-center" style={{ fontSize: '10px', color: '#4b5563' }}>
          <p className="mb-1">Merci d'avoir choisi {company.nom}</p>
          <p className="italic mb-1">Présentez-vous 1H avant le départ</p>
          <div className="flex justify-center items-center gap-1 text-gray-700">
            <Phone className="h-3 w-3 text-gray-500" />
            <span>{reservation.agenceTelephone || company.telephone || '—'}</span>
          </div>
        </div>
      </div>

      {/* styles impression 80mm */}
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 4mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
