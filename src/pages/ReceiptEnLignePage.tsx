import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  ChevronLeft, Download, Printer, Home, MapPin, Phone,
  ArrowRight, User, Ticket, CreditCard, Hash
} from 'lucide-react';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { hexToRgba, safeTextColor } from '../utils/color';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Reservation {
  agenceNom?: string;
  agenceTelephone?: string;
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  referenceCode?: string;
  companyId: string;
  companySlug: string;
  companyName?: string;
  agencyId?: string;
  statut?: string;
  canal?: string;
  seatsGo: number;
}

interface CompanyInfo {
  id: string;
  name: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  logoUrl?: string;
  telephone?: string;
  slug?: string;
}

const ReceiptEnLignePage: React.FC = () => {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyInfo: locationCompanyInfo, reservation: reservationFromState } = location.state || {};

  const [reservation, setReservation] = useState<Reservation | null>(reservationFromState || null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(locationCompanyInfo || null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const primaryColor = companyInfo?.couleurPrimaire || '#3b82f6';
  const secondaryColor = companyInfo?.couleurSecondaire || '#f97316';
  const textColor = safeTextColor(primaryColor);

  const formattedDate = reservation?.date
    ? format(parseISO(reservation.date), 'dd/MM/yyyy', { locale: fr })
    : '';

  const generateReceiptNumber = useCallback(() => {
    if (!reservation) return 'BIL-000000';
    const villeDep = reservation.depart.slice(0, 3).toUpperCase();
    const villeArr = reservation.arrivee.slice(0, 3).toUpperCase();
    const agence = (reservation.agenceNom || 'ONL').slice(0, 3).toUpperCase();
    const code = reservation.id.substring(reservation.id.length - 6).toUpperCase();
    return `${agence}-${villeDep}${villeArr}-${code}`;
  }, [reservation]);

  useEffect(() => {
    const fetchData = async () => {
      if (!reservation && id) {
        const resRef = doc(db, 'reservations', id);
        const snap = await getDoc(resRef);
        if (snap.exists()) {
          setReservation({ ...(snap.data() as Reservation), id: snap.id });
        }
      }
    };
    fetchData();
  }, [id, reservation]);

  const handlePDF = useCallback(() => {
    if (receiptRef.current) {
      const opt = {
        margin: 2,
        filename: `recu-${generateReceiptNumber()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: [81, 200], orientation: 'portrait' }
      };
      html2pdf().set(opt).from(receiptRef.current).save();
    }
  }, [generateReceiptNumber]);

  if (!reservation || !companyInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Chargement du reçu...</p>
      </div>
    );
  }

  const qrContent = `${window.location.origin}/compagnie/${slug}/receipt/${reservation.id}`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="sticky top-0 z-20 px-4 py-2 shadow-sm"
        style={{ backgroundColor: primaryColor, color: textColor }}
      >
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full">
            <ChevronLeft size={22} />
          </button>
          <h1 className="font-bold text-lg">Reçu de réservation</h1>
          {companyInfo.logoUrl && (
            <img
              src={companyInfo.logoUrl}
              alt="Logo"
              className="h-8 w-8 rounded-full object-cover border"
              style={{ borderColor: textColor }}
            />
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-md mx-auto px-4 py-6">
        <div ref={receiptRef} className="bg-white rounded-lg shadow-sm border p-4">
          {/* Company & ticket number */}
          <div className="flex justify-between items-center border-b pb-2 mb-2"
               style={{ borderColor: hexToRgba(primaryColor, 0.3) }}>
            <div className="flex items-center gap-2">
              {companyInfo.logoUrl && (
                <img
                  src={companyInfo.logoUrl}
                  alt={companyInfo.name}
                  className="h-8 w-8 object-contain rounded border"
                  style={{ borderColor: primaryColor }}
                />
              )}
              <div>
                <h2 className="font-bold text-sm">{companyInfo.name}</h2>
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <MapPin size={12} /> {reservation.agenceNom || "Agence Principale"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono">N° {generateReceiptNumber()}</p>
              <span className="px-1 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: hexToRgba(primaryColor, 0.15),
                  color: primaryColor
                }}>
                {reservation.statut?.toUpperCase() || "EN ATTENTE"}
              </span>
            </div>
          </div>

          {/* Client */}
          <div className="mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1"
                style={{ color: primaryColor }}>
              <User size={14} style={{ color: secondaryColor }} /> Client
            </h3>
            <div className="flex justify-between text-xs text-black">
              <p>Nom : {reservation.nomClient}</p>
              <p>Téléphone : {reservation.telephone}</p>
            </div>
          </div>

          {/* Voyage */}
          <div className="mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1"
                style={{ color: primaryColor }}>
              <Ticket size={14} style={{ color: secondaryColor }} /> Voyage
            </h3>
            <p className="text-sm font-medium flex items-center gap-1 text-black">
              {reservation.depart}
              <ArrowRight size={14} style={{ color: primaryColor }} />
              {reservation.arrivee}
            </p>
            <div className="flex justify-between text-xs text-black">
              <p>Date : {formattedDate}</p>
              <p>Heure : {reservation.heure}</p>
            </div>
            <div className="flex justify-between text-xs text-black">
              <p>Places réservées : {reservation.seatsGo}</p>
              <p>Canal : {reservation.canal || 'en ligne'}</p>
            </div>
          </div>

          {/* Paiement */}
          <div className="mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-1"
                style={{ color: primaryColor }}>
              <CreditCard size={14} style={{ color: secondaryColor }} /> Paiement
            </h3>
            <div className="flex justify-between items-center text-black">
              <p className="font-bold text-lg" style={{ color: primaryColor }}>
                {reservation.montant.toLocaleString()} FCFA
              </p>
              <p className="text-xs">Méthode : {reservation.canal === 'guichet' ? 'Espèces' : 'En ligne'}</p>
            </div>
          </div>

          {/* QR Code centré */}
          <div className="text-center border-t pt-3">
            <h3 className="text-sm font-semibold mb-2" style={{ color: primaryColor }}>
              Code d'embarquement
            </h3>
            <div className="flex justify-center">
              <QRCode value={qrContent} size={80} fgColor={primaryColor} />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 text-center text-xs text-gray-600">
            <p>Merci d'avoir choisi {companyInfo.name} — Bon voyage !</p>
            <p className="italic">Présentez-vous 1H avant le départ</p>
            <p className="mt-1">
              Pour plus d'infos, contactez :
              <a href={`tel:${reservation.telephone}`} className="text-blue-600 underline ml-1">
                {reservation.telephone}
              </a>
            </p>
          </div>
        </div>
      </main>

      {/* Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t py-3 px-4 grid grid-cols-3 gap-2"
           style={{ borderColor: hexToRgba(primaryColor, 0.3) }}>
        <button onClick={handlePDF}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{ backgroundColor: primaryColor, color: textColor }}>
          <Download size={16} /> Télécharger
        </button>
        <button onClick={() => window.print()}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1"
          style={{ backgroundColor: secondaryColor, color: safeTextColor(secondaryColor) }}>
          <Printer size={16} /> Imprimer
        </button>
        <button onClick={() => navigate(`/${slug}`)}
          className="py-2 rounded-lg font-medium flex items-center justify-center gap-1 bg-gray-200 text-gray-800">
          <Home size={16} /> Retour
        </button>
      </div>
    </div>
  );
};

export default ReceiptEnLignePage;