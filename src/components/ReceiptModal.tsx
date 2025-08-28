import React, { useEffect, useMemo, useRef } from 'react';
import QRCode from 'react-qr-code';
import { MapPin, Phone, Ticket as TicketIcon, User, CreditCard, ArrowRight, Printer, X, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import html2pdf from 'html2pdf.js';
import { hexToRgba, safeTextColor } from '@/utils/color';

/** -----------------------
 * Types
 * ----------------------*/
export type ReservationStatus = 'confirmé' | 'annulé' | 'en attente' | 'payé' | string;
export type PaymentMethod = 'espèces' | 'mobile_money' | 'carte' | string;
export type BookingChannel = 'en ligne' | 'en_ligne' | 'agence' | 'téléphone' | 'guichet';

export interface ReservationData {
  id: string;
  nomClient: string;
  telephone: string;
  email?: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  statut: ReservationStatus;
  paiement: PaymentMethod;
  compagnieId: string;
  compagnieNom: string;
  agencyId?: string;
  agencyNom?: string;
  nomAgence?: string;
  agenceTelephone?: string;
  canal: BookingChannel | string;
  createdAt?: any;
  companySlug?: string;
  /** ✅ Numéro officiel stocké en base (ne jamais regénérer côté UI) */
  referenceCode?: string;
  qrCode?: string | null;
  guichetierId?: string;
  guichetierCode?: string;
  shiftId?: string | null;
}

export interface CompanyData {
  id?: string;
  nom: string;
  logoUrl?: string;
  couleurPrimaire: string;
  couleurSecondaire?: string;
  slug?: string;
  telephone?: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  reservation: ReservationData;
  company: CompanyData;
  autoPrint?: boolean;
};

/** -----------------------
 * Helpers
 * ----------------------*/
function formatDateSafe(d: string | Date | { seconds: number; nanoseconds: number } | undefined, fmt: string) {
  try {
    let date: Date;
    if (!d) date = new Date();
    else if (typeof d === 'string') date = parseISO(d);
    else if (d instanceof Date) date = d;
    else date = new Date(d.seconds * 1000);
    return format(date, fmt, { locale: fr });
  } catch {
    return '--/--/----';
  }
}

function makeShortCode(name?: string, fallback = 'XXX') {
  const n = (name || '').trim();
  if (!n) return fallback;
  const parts = n
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.slice(0, 3).map(p => p[0]).join('').toUpperCase();
}

function prettyChannel(c: string | undefined) {
  const v = (c || '').toLowerCase();
  if (v === 'en_ligne') return 'en ligne';
  return v || '—';
}

/** -----------------------
 * Composant
 * ----------------------*/
const ReceiptModal: React.FC<Props> = ({ open, onClose, reservation, company, autoPrint = false }) => {
  const ref = useRef<HTMLDivElement>(null);

  // 🔒 Numéro d’affichage : on utilise toujours referenceCode s’il existe.
  //    On garde un fallback lisible pour le développement, mais en prod
  //    referenceCode doit être présent.
  const receiptNumber = useMemo(() => {
    if (reservation?.referenceCode) return reservation.referenceCode;
    const comp = makeShortCode(company?.nom, 'CMP');
    const agc = makeShortCode(reservation?.agencyNom || reservation?.nomAgence, 'AGC');
    const id = (reservation?.id || '000').slice(-3).toUpperCase();
    const fallback = `${comp}-${agc}-WEB-${id}`;
    console.warn('[ReceiptModal] referenceCode manquant → fallback utilisé:', fallback);
    return fallback;
  }, [reservation?.referenceCode, reservation?.agencyNom, reservation?.nomAgence, reservation?.id, company?.nom]);

  const qrValue = useMemo(() => {
    const base = window.location.origin;
    const refVal = reservation?.referenceCode || reservation?.id || '';
    return `${base}/r/${encodeURIComponent(refVal)}`;
  }, [reservation?.referenceCode, reservation?.id]);

  const primary = company.couleurPrimaire || '#3b82f6';
  const secondary = company.couleurSecondaire || '#93c5fd';
  const textOnPrimary = safeTextColor(primary);

  // Logs utiles
  useEffect(() => {
    if (!open) return;
    console.log('[ReceiptModal] open with:', { reservation, company, receiptNumber, qrValue });
  }, [open, reservation, company, receiptNumber, qrValue]);

  // Auto print si demandé
  useEffect(() => {
    if (!open) return;
    ref.current?.scrollTo?.({ top: 0 });
    if (autoPrint) setTimeout(() => window.print(), 200);
  }, [open, autoPrint]);

  const handlePDF = () => {
    if (!ref.current) return;
    const opt = {
      margin: 2,
      filename: `recu-${receiptNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 340 },
      jsPDF: { unit: 'mm', format: [81, 200], orientation: 'portrait' }
    };
    // @ts-ignore
    html2pdf().set(opt).from(ref.current).save();
  };

  const emittedOn = useMemo(() => formatDateSafe(reservation?.createdAt, 'dd/MM/yyyy HH:mm'), [reservation?.createdAt]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Styles impression */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-receipt, #print-receipt * { visibility: visible !important; }
          #print-receipt {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            background: white;
            padding: 0;
            margin: 0;
          }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 5mm; }
      `}</style>

      {/* Modal */}
      <div className="relative mx-auto my-6 w[760px] max-w-[95vw] bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header actions */}
        <div className="no-print flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-3">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt="logo" className="h-6 w-6 object-contain rounded" />
            ) : (
              <div className="h-6 w-6 rounded bg-gray-200" />
            )}
            <div className="font-semibold">{company.nom}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePDF} className="px-3 py-2 rounded-lg border flex items-center gap-1">
              <Download className="h-4 w-4" /> PDF
            </button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-lg border flex items-center gap-1">
              <Printer className="h-4 w-4" /> Imprimer
            </button>
            <button onClick={onClose} className="px-3 py-2 rounded-lg border flex items-center gap-1">
              <X className="h-4 w-4" /> Fermer
            </button>
          </div>
        </div>

        {/* Zone imprimable */}
        <div id="print-receipt" className="p-3">
          <div
            ref={ref}
            className="bg-white rounded-lg shadow-sm overflow-hidden"
            style={{
              width: '81mm',
              margin: '0 auto',
              ['--primary' as any]: primary,
              ['--secondary' as any]: secondary,
              ['--text-on-primary' as any]: textOnPrimary
            }}
          >
            {/* En-tête */}
            <div className="flex justify-between items-start border-b pb-2 mb-2 px-3" style={{ borderColor: hexToRgba(primary, 0.3) }}>
              <div className="flex items-center gap-2">
                {company.logoUrl && (
                  <img
                    src={company.logoUrl}
                    alt={company.nom}
                    className="h-9 w-9 object-contain rounded border"
                    style={{ borderColor: primary }}
                    onError={(e) => ((e.target as HTMLImageElement).src = '/default-company.png')}
                  />
                )}
                <div className="leading-tight">
                  <h2 className="text-sm font-bold" style={{ color: primary }}>{company.nom}</h2>
                  <p className="text-[11px] text-gray-700 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-gray-500" />
                    {(reservation.agencyNom || reservation.nomAgence || 'Agence').trim()}
                  </p>
                </div>
              </div>
              <div className="text-right leading-tight pr-2">
                {/* ✅ N° officiel affiché */}
                <p className="text-[11px] font-mono tracking-tight text-gray-700">N° {receiptNumber}</p>
                <p className="text-[10px] text-gray-600">Émis le {emittedOn}</p>
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: hexToRgba(primary, 0.15), color: primary }}>
                  {(reservation.statut || 'payé').toString().toUpperCase()}
                </span>
              </div>
            </div>

            {/* Corps */}
            <div className="p-2 space-y-2">
              {/* Client */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <User className="h-3 w-3" style={{ color: primary }} />
                  <h3 className="text-xs font-semibold" style={{ color: primary }}>Client</h3>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div>
                    <p className="text-[10px] text-gray-600">Nom</p>
                    <p className="truncate">{reservation.nomClient}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600">Téléphone</p>
                    <p>{reservation.telephone}</p>
                  </div>
                </div>
              </div>

              {/* Voyage */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <TicketIcon className="h-3 w-3" style={{ color: primary }} />
                  <h3 className="text-xs font-semibold" style={{ color: primary }}>Voyage</h3>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-600">Trajet</p>
                    <div className="flex items-center gap-1">
                      <p className="font-medium">{reservation.depart}</p>
                      <ArrowRight className="h-3 w-3 text-gray-500" />
                      <p className="font-medium">{reservation.arrivee}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600">Date</p>
                    <p>{formatDateSafe(reservation.date, 'dd/MM/yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600">Heure</p>
                    <p>{reservation.heure}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600">Places</p>
                    <p>
                      {reservation.seatsGo}
                      {reservation.seatsReturn ? ` (+${reservation.seatsReturn} retour)` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600">Canal</p>
                    <p className="capitalize">{prettyChannel(reservation.canal as string)}</p>
                  </div>
                </div>
              </div>

              {/* Paiement */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <CreditCard className="h-3 w-3" style={{ color: primary }} />
                  <h3 className="text-xs font-semibold" style={{ color: primary }}>Paiement</h3>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <div>
                    <p className="text-[10px] text-gray-600">Montant</p>
                    <p className="font-bold" style={{ color: primary }}>
                      {reservation.montant?.toLocaleString('fr-FR')} FCFA
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600">Méthode</p>
                    <p className="capitalize">{reservation.paiement}</p>
                  </div>
                </div>
              </div>

              {/* QR */}
              <div className="mt-2 p-1 rounded border border-gray-200 flex flex-col items-center">
                <h3 className="text-xs font-semibold mb-1" style={{ color: primary }}>Code d'embarquement</h3>
                <div className="bg-white p-1 rounded border" style={{ borderColor: primary }}>
                  <QRCode value={qrValue} size={60} fgColor={primary} level="H" />
                </div>
                <p className="mt-2 text-[10px] text-gray-600 text-center">
                  Validité : 1 mois à compter de la date d’émission.
                </p>
              </div>

              {/* Footer */}
              <div className="mt-2 pt-2 border-t border-gray-200 text-center" style={{ fontSize: '10px', color: '#4b5563' }}>
                <p className="mb-1">Merci d'avoir choisi {company.nom}</p>
                <p className="italic mb-1">Présentez-vous 1H avant le départ</p>
                <p className="font-medium mb-0.5">Pour plus d'infos, contactez :</p>
                <div className="flex justify-center items-center gap-1 text-gray-700">
                  <Phone className="h-3 w-3 text-gray-500" />
                  <span>{reservation.agenceTelephone || company.telephone || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="no-print px-4 pb-4 flex items-center justify-end gap-2">
          <button onClick={handlePDF} className="px-3 py-2 rounded-lg border flex items-center gap-1">
            <Download className="h-4 w-4" /> PDF
          </button>
          <button onClick={() => window.print()} className="px-3 py-2 rounded-lg border flex items-center gap-1">
            <Printer className="h-4 w-4" /> Imprimer
          </button>
          <button onClick={onClose} className="px-3 py-2 rounded-lg border flex items-center gap-1">
            <X className="h-4 w-4" /> Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
