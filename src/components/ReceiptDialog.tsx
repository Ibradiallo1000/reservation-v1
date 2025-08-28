import React, { useEffect, useMemo } from 'react';
import QRCode from 'react-qr-code';

export interface CompanyData {
  nom: string;
  logoUrl?: string;
  couleurPrimaire: string;
  couleurSecondaire?: string;
  telephone?: string;
}

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
  qrCode?: string | null;
  agencyNom?: string;
  nomAgence?: string;
  agenceTelephone?: string;
  canal?: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  reservation: ReservationData;
  company: CompanyData;
  autoPrint?: boolean;
};

const ReceiptModal: React.FC<Props> = ({ open, onClose, reservation, company, autoPrint }) => {
  const primary = company.couleurPrimaire || '#3b82f6';

  // N° reçu (réf pro si dispo)
  const receiptNumber = useMemo(() => {
    if (reservation.referenceCode) return reservation.referenceCode;
    const dep = (reservation.depart || 'DEP').slice(0,3).toUpperCase();
    const arr = (reservation.arrivee || 'ARR').slice(0,3).toUpperCase();
    return `AGC-${dep}${arr}-${reservation.id.slice(-6).toUpperCase()}`;
  }, [reservation]);

  // QR: basé sur la référence/id
  const qrValue = useMemo(() => {
    const base = window.location.origin;
    const ref = reservation.referenceCode || reservation.id;
    return `${base}/r/${encodeURIComponent(ref)}`;
  }, [reservation.referenceCode, reservation.id]);

  // Impression automatique + fermeture après impression
  useEffect(() => {
    if (!open || !autoPrint) return;

    const closeAfter = () => setTimeout(onClose, 150);
    window.addEventListener('afterprint', closeAfter);

    const mql = window.matchMedia?.('print');
    const handleChange = (e: MediaQueryListEvent) => { if (!e.matches) closeAfter(); };
    mql?.addEventListener?.('change', handleChange);

    const t = setTimeout(() => window.print(), 200);

    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', closeAfter);
      mql?.removeEventListener?.('change', handleChange);
    };
  }, [open, autoPrint, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      {/* Styles impression : ne sortir que la carte du reçu */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-print, #receipt-print * { visibility: visible !important; }
          #receipt-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        id="receipt-print"
        className="bg-white w-[720px] max-w-full rounded-2xl shadow-xl overflow-hidden"
        style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            {company.logoUrl
              ? <img src={company.logoUrl} alt="logo" className="h-6 w-6 object-contain" />
              : <div className="h-6 w-6 bg-gray-200 rounded" />
            }
            <div className="font-semibold">{company.nom}</div>
          </div>
          <div className="flex gap-2 no-print">
            <button className="px-3 py-2 rounded-lg border" onClick={() => window.print()}>Imprimer</button>
            <button className="px-3 py-2 rounded-lg border" onClick={onClose}>Fermer</button>
          </div>
        </div>

        {/* Corps */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-lg mb-1">
                {reservation.depart} → {reservation.arrivee}
              </div>
              <div className="text-sm text-gray-600 mb-3">
                {reservation.date} • {reservation.heure}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-mono tracking-tight text-gray-700">
                N° {receiptNumber}
              </div>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium inline-block mt-1"
                style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: primary }}
              >
                {(reservation.statut || 'payé').toString().toUpperCase()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <div className="text-gray-500">Passager</div>
              <div className="font-medium">{reservation.nomClient}</div>
              <div className="text-gray-600">{reservation.telephone || ''}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-500">Billets</div>
              <div className="font-medium">
                {(reservation.seatsGo || 0) + (reservation.seatsReturn || 0)} • {reservation.montant?.toLocaleString('fr-FR')} FCFA
              </div>
              <div className="text-gray-600">{reservation.paiement || ''}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <div className="text-gray-500">Agence</div>
              <div className="font-medium">{reservation.agencyNom || reservation.nomAgence || '—'}</div>
              <div className="text-gray-600">{reservation.agenceTelephone || company.telephone || '—'}</div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <div className="bg-white p-1 rounded border">
                <QRCode value={qrValue} size={64} fgColor={primary} level="H" />
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Référence : <span className="font-mono">{reservation.referenceCode || reservation.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
