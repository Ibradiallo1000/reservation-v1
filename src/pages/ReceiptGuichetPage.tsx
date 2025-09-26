// src/pages/ReceiptGuichetPage.tsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, collectionGroup, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, Download, Home, MapPin, Printer, User, Ticket, CreditCard, ArrowRight } from 'lucide-react';
import { hexToRgba, safeTextColor } from '@/utils/color';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorMessage from '@/components/ErrorMessage';

type ReservationStatus = 'confirmé' | 'annulé' | 'en attente' | 'payé' | string;
type PaymentMethod = 'espèces' | 'mobile_money' | 'carte' | string;
type BookingChannel = 'en ligne' | 'agence' | 'téléphone' | 'guichet';

interface ReservationData {
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
  canal: BookingChannel;
  createdAt: { seconds: number; nanoseconds: number } | Date | undefined;
  companySlug: string;
  referenceCode?: string;
  qrCode?: string | null;
  guichetierId?: string;
  guichetierCode?: string;
  shiftId?: string | null;
}

interface CompanyData {
  id: string;
  nom: string;
  logoUrl?: string;
  couleurPrimaire: string;
  couleurSecondaire?: string;
  slug: string;
  telephone?: string;
}

interface LocationState {
  companyInfo?: CompanyData;
  reservation?: ReservationData;
  from?: string;
}

const ReceiptGuichetPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyInfo: companyInfoFromState, reservation: reservationFromState, from } =
    (location.state as LocationState) || {};

  const [reservation, setReservation] = useState<ReservationData | null>(reservationFromState || null);
  const [company, setCompany] = useState<CompanyData | null>(companyInfoFromState || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const formatDate = useCallback((dateInput: string | Date | { seconds: number; nanoseconds: number }, formatStr: string) => {
    try {
      let date: Date;
      if (typeof dateInput === 'string') date = parseISO(dateInput);
      else if (dateInput instanceof Date) date = dateInput;
      else date = new Date(dateInput.seconds * 1000);
      return format(date, formatStr, { locale: fr });
    } catch {
      return '--/--/----';
    }
  }, []);

  /** ✅ Fallback: charge la réservation via collectionGroup (refCode d’abord, puis docId) */
  const fetchReservationFallback = useCallback(async () => {
    if (!id) throw new Error('ID manquant');

    // 1) par referenceCode
    let qRef = query(collectionGroup(db, 'reservations'), where('referenceCode', '==', id), limit(1));
    let snap = await getDocs(qRef);

    // 2) sinon par docId
    if (snap.empty) {
      qRef = query(collectionGroup(db, 'reservations'), where('__name__', '==', id), limit(1));
      snap = await getDocs(qRef);
    }

    if (snap.empty) throw new Error('Réservation introuvable');

    const d = snap.docs[0];
    const data = d.data() as any;
    const parts = d.ref.path.split('/'); // companies/{companyId}/agences/{agencyId}/reservations/{resId}
    const companyId = parts[1];
    const agencyId = parts[3];

    return {
      ...data,
      id: d.id,
      compagnieId: data.compagnieId || companyId,
      agencyId: data.agencyId || agencyId,
      createdAt:
        data.createdAt instanceof Date
          ? data.createdAt
          : data.createdAt?.seconds
          ? new Date(data.createdAt.seconds * 1000)
          : undefined,
    } as ReservationData;
  }, [id]);

  const fetchCompany = useCallback(async (companyId: string) => {
    const snap = await getDoc(doc(db, 'companies', companyId));
    if (!snap.exists()) throw new Error('Compagnie non trouvée');
    const raw = snap.data() as any;
    return {
      id: snap.id,
      nom: raw.nom || raw.name,
      logoUrl: raw.logoUrl,
      couleurPrimaire: raw.theme?.primary || raw.couleurPrimaire || '#3b82f6',
      couleurSecondaire: raw.theme?.secondary || raw.couleurSecondaire || '#93c5fd',
      slug: raw.slug,
      telephone: raw.telephone,
    } as CompanyData;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        let res = reservationFromState || null;
        let comp = companyInfoFromState || null;

        if (!res) res = await fetchReservationFallback();
        if (!comp) comp = await fetchCompany(res!.compagnieId);

        setReservation(res!);
        setCompany(comp!);
      } catch (e: any) {
        setError(e?.message || 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchCompany, fetchReservationFallback, reservationFromState, companyInfoFromState]);

  const receiptNumber = useMemo(() => {
    if (!reservation) return 'BIL-000000';
    if (reservation.referenceCode) return reservation.referenceCode;
    const dep = (reservation.depart || 'DEP').slice(0, 3).toUpperCase();
    const arr = (reservation.arrivee || 'ARR').slice(0, 3).toUpperCase();
    const code = reservation.id.slice(-6).toUpperCase();
    return `AGC-${dep}${arr}-${code}`;
  }, [reservation]);

  // ✅ QR cohérent avec scanner (URL publique /r/:reference)
  const qrValue = useMemo(() => {
    const base = window.location.origin;
    const ref = reservation?.referenceCode || reservation?.id;
    return `${base}/r/${encodeURIComponent(ref || '')}`;
  }, [reservation?.referenceCode, reservation?.id]);

  const emissionDate = useMemo(() => {
    const ca = reservation?.createdAt;
    let d: Date | undefined;
    if (!ca) d = new Date();
    else if (ca instanceof Date) d = ca;
    else if (typeof ca === 'object' && (ca as any).seconds) d = new Date((ca as any).seconds * 1000);
    else d = new Date();
    return format(d!, 'dd/MM/yyyy', { locale: fr });
  }, [reservation?.createdAt]);

  const handlePDF = useCallback(() => {
    if (!receiptRef.current) return;
    const opt = {
      margin: 2,
      filename: `recu-${receiptNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 340 },
      jsPDF: { unit: 'mm', format: [81, 200], orientation: 'portrait' }
    };
    // @ts-ignore
    html2pdf().set(opt).from(receiptRef.current).save();
  }, [receiptNumber]);

  const handleBack = useCallback(() => {
    if (from) navigate(from);
    else navigate('/agence/guichet');
  }, [navigate, from]);

  if (loading || !company) return <LoadingSpinner fullScreen />;
  if (error || !reservation || !company)
    return <ErrorMessage message={error || 'Erreur de chargement'} onRetry={() => window.location.reload()} onHome={() => navigate('/')} />;

  const primaryColor = company.couleurPrimaire;
  const secondaryColor = company.couleurSecondaire;
  const textColor = safeTextColor(primaryColor);

  const Slip: React.FC<{ copy: 'Comptabilité' | 'Contrôle' | 'Client'; note: string; }> = ({ copy, note }) => (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ width: '81mm', margin: '0 auto' }}>
      {/* Top */}
      <div className="flex justify-between items-center border-b pb-2 mb-2 px-3" style={{ borderColor: hexToRgba(primaryColor, 0.3) }}>
        <div className="flex items-center gap-2">
          {company.logoUrl && (
            <img
              src={company.logoUrl}
              alt={company.nom}
              className="h-9 w-9 object-contain rounded border"
              style={{ borderColor: primaryColor }}
              onError={(e) => ((e.target as HTMLImageElement).src = '/default-company.png')}
            />
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
          <div className="badge-copy">{copy}</div>
          <p className="text-[11px] font-mono tracking-tight text-gray-700 mt-1">N° {receiptNumber}</p>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-medium"
            style={{ backgroundColor: hexToRgba(primaryColor, 0.15), color: primaryColor }}
          >
            {(reservation.statut || 'payé').toString().toUpperCase()}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 pb-2 space-y-2">
        {/* Client */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <User className="h-3 w-3" style={{ color: primaryColor }} />
            <h3 className="text-xs font-semibold" style={{ color: primaryColor }}>Client</h3>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <div><p className="text-[10px] text-gray-600">Nom</p><p className="truncate">{reservation.nomClient}</p></div>
            <div><p className="text-[10px] text-gray-600">Téléphone</p><p>{reservation.telephone}</p></div>
          </div>
        </div>

        {/* Voyage */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Ticket className="h-3 w-3" style={{ color: primaryColor }} />
            <h3 className="text-xs font-semibold" style={{ color: primaryColor }}>Voyage</h3>
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
            <div><p className="text-[10px] text-gray-600">Date</p><p>{formatDate(reservation.date, 'dd/MM/yyyy')}</p></div>
            <div><p className="text-[10px] text-gray-600">Heure</p><p>{reservation.heure}</p></div>
            <div><p className="text-[10px] text-gray-600">Places</p><p>{reservation.seatsGo}{reservation.seatsReturn ? ` (+${reservation.seatsReturn} retour)` : ''}</p></div>
            <div><p className="text-[10px] text-gray-600">Canal</p><p className="capitalize">{reservation.canal}</p></div>
          </div>
        </div>

        {/* Paiement */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <CreditCard className="h-3 w-3" style={{ color: primaryColor }} />
            <h3 className="text-xs font-semibold" style={{ color: primaryColor }}>Paiement</h3>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <div>
              <p className="text-[10px] text-gray-600">Montant</p>
              <p className="font-bold" style={{ color: primaryColor }}>{reservation.montant?.toLocaleString('fr-FR')} FCFA</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600">Méthode</p>
              <p className="capitalize">{reservation.paiement}</p>
            </div>
          </div>
        </div>

        {/* QR */}
        <div className="mt-2 p-1 rounded border border-gray-200 flex flex-col items-center">
          <h3 className="text-xs font-semibold mb-1" style={{ color: primaryColor }}>Code d'embarquement</h3>
          <div className="bg-white p-1 rounded border" style={{ borderColor: primaryColor }}>
            <QRCode value={qrValue} size={60} fgColor={primaryColor} level="H" />
          </div>
          <p className="mt-2 text-[10px] text-gray-600 text-center">
            Date d’émission : {emissionDate}
          </p>
          <p className="text-[10px] text-gray-600 text-center">
            Validité : 1 mois à compter de la date d’émission.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-2 pt-2 border-t border-gray-200 text-center" style={{ fontSize: '10px', color: '#4b5563' }}>
          <p className="mb-1">Merci d'avoir choisi {company.nom}</p>
          <p className="italic mb-1">Présentez-vous 1H avant le départ</p>
          <p className="font-medium mb-0.5">Infos : {reservation.agenceTelephone || company.telephone || '—'}</p>
          <p className="mt-0.5 text-[9px] text-gray-400">
            Ref {reservation.referenceCode || reservation.id} • Guichetier {reservation.guichetierCode || '—'} • Shift {reservation.shiftId || '—'}
          </p>
          <p className="mt-1 text-[9px] text-gray-500">À découper et conserver selon le volet.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen bg-gray-50 print:bg-white"
      style={{
        ['--primary' as any]: primaryColor,
        ['--secondary' as any]: secondaryColor,
        ['--text-on-primary' as any]: textColor
      }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-receipt, #print-receipt * { visibility: visible !important; }
          #print-receipt {
            position: fixed; inset: 0;
            display: flex; align-items: flex-start; justify-content: center;
            background: white; margin: 0; padding: 0;
          }
          .no-print { display: none !important; }
        }
        @page { size: 80mm auto; margin: 4mm; }
        .perf { border-top: 1px dashed #9ca3af; margin: 8px 0 12px; position: relative; height: 1px; }
        .perf::after { content: "✂︎"; position: absolute; right: -2px; top: -10px; font-size: 10px; color: #9ca3af; }
        .badge-copy { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 6px; border: 1px solid #e5e7eb; background: #f9fafb; }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-50 px-4 py-3 shadow-sm no-print" style={{ backgroundColor: primaryColor, color: textColor }}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <button onClick={handleBack} className="p-2 rounded-full hover:bg-white/10 transition" aria-label="Retour">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            {company.logoUrl && (
              <img
                src={company.logoUrl}
                alt={`Logo ${company.nom}`}
                className="h-10 w-10 rounded-full object-cover border-2"
                style={{ borderColor: textColor }}
                onError={(e) => ((e.target as HTMLImageElement).src = '/default-company.png')}
              />
            )}
            <div className="flex flex-col">
              <h1 className="text-sm font-bold">Reçu de voyage</h1>
              <p className="text-xs opacity-90">{company.nom}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Zone imprimable */}
      <div className="max-w-[81mm] mx-auto p-2 print:p-0" id="print-receipt">
        <div ref={receiptRef} style={{ width: '81mm', margin: '0 auto' }}>
          <Slip copy="Comptabilité" note="À remettre au comptable par le guichetier immédiatement après la vente." />
          <div className="perf" />
          <Slip copy="Contrôle" note="À découper et conserver par le contrôleur lors de l’embarquement." />
          <div className="perf" />
          <Slip copy="Client" note="À conserver par le passager jusqu’à la fin du voyage." />
        </div>

        {/* Actions (écran) */}
        <div className="no-print mt-3 grid grid-cols-1 gap-2" style={{ width: '81mm', margin: '0 auto' }}>
          <button
            onClick={handlePDF}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg shadow text-xs"
            style={{ backgroundColor: primaryColor, color: textColor }}
          >
            <Download className="h-4 w-4" /> Télécharger
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg shadow text-xs"
            style={{ backgroundColor: secondaryColor || hexToRgba(primaryColor, 0.8), color: safeTextColor(secondaryColor || primaryColor) }}
          >
            <Printer className="h-4 w-4" /> Imprimer
          </button>
          <button
            onClick={() => navigate('/agence/guichet')}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg shadow hover:bg-gray-300 text-xs"
          >
            <Home className="h-4 w-4" /> Retour au guichet
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptGuichetPage;
