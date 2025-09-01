// src/pages/ReceiptEnLignePage.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { ChevronLeft, Download, Printer, Home, MapPin, User, Ticket, CreditCard, ArrowRight } from 'lucide-react';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { hexToRgba, safeTextColor } from '@/utils/color';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

// ---------- Types ----------
type ReservationStatus = 'confirmé' | 'annulé' | 'en attente' | 'payé' | string;

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  referenceCode?: string;          // ex: "MT-AP-WEB-0016"
  companyId: string;
  companySlug: string;
  companyName?: string;
  agencyId?: string;
  nomAgence?: string;              // <- PRIORITÉ 1
  agencyNom?: string;              // <- alias
  agenceNom?: string;              // <- alias ancien
  statut?: ReservationStatus;
  canal?: string;
  seatsGo: number;
  createdAt?: any;
}

interface CompanyInfo {
  id: string;
  name: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  logoUrl?: string;
  telephone?: string;
  slug?: string;
  code?: string;
}

// ---------- Page ----------
const ReceiptEnLignePage: React.FC = () => {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyInfo: locationCompanyInfo, reservation: reservationFromState } =
    (location.state || {}) as { companyInfo?: CompanyInfo; reservation?: Reservation };

  const [reservation, setReservation] = useState<Reservation | null>(reservationFromState || null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(locationCompanyInfo || null);
  const [agencyName, setAgencyName] = useState<string>('Agence'); // sera remplacé si trouvé
  const receiptRef = useRef<HTMLDivElement>(null);

  const primaryColor = companyInfo?.couleurPrimaire || '#8b3a2f';
  const secondaryColor = companyInfo?.couleurSecondaire || '#f59e0b';
  const textColor = safeTextColor(primaryColor);

  // Pré-remplir nom d’agence depuis l'état de navigation
  useEffect(() => {
    const inline = reservationFromState?.nomAgence || reservationFromState?.agencyNom || reservationFromState?.agenceNom;
    if (inline) setAgencyName(inline);
  }, [reservationFromState?.nomAgence, reservationFromState?.agencyNom, reservationFromState?.agenceNom]);

  // Fallback : charger la réservation si l’accès est direct
  useEffect(() => {
    const load = async () => {
      if (!reservation && id) {
        const snap = await getDoc(doc(db, 'reservations', id)).catch(() => null as any);
        if (snap && snap.exists()) setReservation({ ...(snap.data() as Reservation), id: snap.id });
      }
    };
    load();
  }, [id, reservation]);

  // Charger les infos compagnie si absentes
  useEffect(() => {
    const fetchCompany = async () => {
      if (companyInfo || !reservation?.companyId) return;
      const cs = await getDoc(doc(db, 'companies', reservation.companyId));
      if (cs.exists()) {
        const d = cs.data() as any;
        setCompanyInfo({
          id: cs.id,
          name: d?.name || d?.nom || 'Votre compagnie',
          couleurPrimaire: d?.couleurPrimaire || d?.primaryColor,
          couleurSecondaire: d?.couleurSecondaire || d?.secondaryColor,
          logoUrl: d?.logoUrl,
          telephone: d?.telephone,
          slug: d?.slug,
          code: d?.code
        });
      }
    };
    fetchCompany();
  }, [companyInfo, reservation?.companyId]);

  // Récupérer le vrai nom d’agence si nécessaire
  useEffect(() => {
    // si déjà fourni par la réservation (nomAgence / agencyNom / agenceNom) → on l'affiche
    const inline = reservation?.nomAgence || reservation?.agencyNom || reservation?.agenceNom;
    if (inline) {
      setAgencyName(inline);
      return;
    }
    // sinon on va lire l'agence dans Firestore
    if (!reservation?.companyId || !reservation?.agencyId) return;

    // ---- Narrowing explicite pour TypeScript ----
    const companyId: string = reservation.companyId;
    const agencyId: string = reservation.agencyId;

    (async () => {
      try {
        const agRef = doc(db, 'companies', companyId, 'agences', agencyId);
        const ag = await getDoc(agRef);
        if (ag.exists()) {
          const a = ag.data() as any;
          setAgencyName(a?.nom || a?.name || 'Agence');
        }
      } catch {
        /* ignore */
      }
    })();
  }, [reservation?.companyId, reservation?.agencyId, reservation?.nomAgence, reservation?.agencyNom, reservation?.agenceNom]);

  const emissionDate =
    reservation?.createdAt?.seconds
      ? format(new Date(reservation.createdAt.seconds * 1000), 'dd/MM/yyyy', { locale: fr })
      : format(new Date(), 'dd/MM/yyyy', { locale: fr });

  const formattedDate = reservation?.date
    ? format(parseISO(reservation.date), 'dd/MM/yyyy', { locale: fr })
    : '';

  // Export PDF
  const handlePDF = useCallback(() => {
    if (!receiptRef.current) return;
    const filename = `recu-${reservation?.referenceCode || reservation?.id || 'billet'}.pdf`;
    const opt = {
      margin: 2,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: [81, 200], orientation: 'portrait' }
    };
    // @ts-ignore
    html2pdf().set(opt).from(receiptRef.current).save();
  }, [reservation?.referenceCode, reservation?.id]);

  if (!reservation || !companyInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Chargement du reçu...</p>
      </div>
    );
  }

  // On affiche la référence déjà enregistrée
  const receiptNumber = reservation.referenceCode || '—';
  const qrValue = `${window.location.origin}/r/${encodeURIComponent(receiptNumber)}`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header avec couleur primaire */}
      <header className="sticky top-0 z-20 px-4 py-2 shadow-sm" style={{ backgroundColor: primaryColor, color: textColor }}>
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full" aria-label="Retour">
            <ChevronLeft size={22} />
          </button>
          <h1 className="font-bold text-lg">Reçu de réservation</h1>
          {companyInfo.logoUrl ? (
            <img
              src={companyInfo.logoUrl}
              alt="Logo"
              className="h-8 w-8 rounded-full object-cover border"
              style={{ borderColor: textColor }}
            />
          ) : (
            <div className="h-8 w-8 rounded-full grid place-items-center font-bold" style={{ background: hexToRgba(textColor, 0.15) }}>
              {(companyInfo.name || 'C').slice(0, 1)}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        <div ref={receiptRef} className="bg-white rounded-lg shadow-sm border p-4">
          {/* En-tête société + agence + n° reçu */}
          <div className="flex justify-between items-center border-b pb-2 mb-2" style={{ borderColor: hexToRgba(primaryColor, 0.3) }}>
            <div className="flex items-center gap-2">
              {companyInfo.logoUrl && (
                <img
                  src={companyInfo.logoUrl}
                  alt={companyInfo.name}
                  className="h-8 w-8 object-contain rounded border"
                  style={{ borderColor: primaryColor }}
                  onError={(e) => ((e.target as HTMLImageElement).src = '/default-company.png')}
                />
              )}
              <div>
                <h2 className="font-bold text-sm">{companyInfo.name}</h2>
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <MapPin size={12} /> {agencyName}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono">N° {receiptNumber}</p>
              <span
                className="px-1 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: hexToRgba(primaryColor, 0.15), color: primaryColor }}
              >
                {(reservation.statut || 'payé').toString().toUpperCase()}
              </span>
            </div>
          </div>

          {/* Client */}
          <div className="mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1" style={{ color: primaryColor }}>
              <User size={14} style={{ color: secondaryColor }} /> Client
            </h3>
            <div className="flex justify-between text-xs text-black">
              <p>Nom : {reservation.nomClient}</p>
              <p>Téléphone : {reservation.telephone}</p>
            </div>
          </div>

          {/* Voyage */}
          <div className="mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1" style={{ color: primaryColor }}>
              <Ticket size={14} style={{ color: secondaryColor }} /> Voyage
            </h3>
            <p className="text-sm font-medium flex items-center gap-1 text-black">
              {reservation.depart} <ArrowRight size={14} style={{ color: primaryColor }} /> {reservation.arrivee}
            </p>
            <div className="flex justify-between text-xs text-black">
              <p>Date : {formattedDate}</p>
              <p>Heure : {reservation.heure}</p>
            </div>
            <div className="flex justify-between text-xs text-black">
              <p>Places réservées : {reservation.seatsGo}</p>
              <p>Canal : en_ligne</p>
            </div>
          </div>

          {/* Paiement */}
          <div className="mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1" style={{ color: primaryColor }}>
              <CreditCard size={14} style={{ color: secondaryColor }} /> Paiement
            </h3>
            <div className="flex justify-between items-center text-black">
              <p className="font-bold text-lg" style={{ color: primaryColor }}>
                {reservation.montant.toLocaleString('fr-FR')} FCFA
              </p>
              <p className="text-xs">Méthode : En ligne</p>
            </div>
          </div>

          {/* QR – Code d’embarquement */}
          <div className="text-center border-t pt-3">
            <h3 className="text-sm font-semibold mb-2" style={{ color: primaryColor }}>
              Code d'embarquement
            </h3>
            <div className="flex justify-center">
              <QRCode value={qrValue} size={80} fgColor={primaryColor} />
            </div>
            <p className="text-xs text-gray-600 mt-2">Date d’émission : {emissionDate}</p>
            <p className="text-xs text-gray-600">Validité : 1 mois à compter de la date d’émission</p>
          </div>

          <div className="mt-3 text-center text-xs text-gray-600">
            <p>Merci d'avoir choisi {companyInfo.name} — Bon voyage !</p>
            <p className="italic">Présentez-vous 1H avant le départ</p>
          </div>
        </div>
      </main>

      {/* Actions fixes */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white border-t py-3 px-4 grid grid-cols-3 gap-2"
        style={{ borderColor: hexToRgba(primaryColor, 0.3) }}
      >
        <button
          onClick={handlePDF}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{ backgroundColor: primaryColor, color: textColor }}
        >
          <Download size={16} /> Télécharger
        </button>
        <button
          onClick={() => window.print()}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{ backgroundColor: secondaryColor, color: safeTextColor(secondaryColor) }}
        >
          <Printer size={16} /> Imprimer
        </button>
        <button
          onClick={() => navigate(`/${slug}`)}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1 bg-gray-200 text-gray-800"
        >
          <Home size={16} /> Retour
        </button>
      </div>
    </div>
  );
};

export default ReceiptEnLignePage;
