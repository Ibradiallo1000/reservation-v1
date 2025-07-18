import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  ChevronLeft, Download, Printer, Home, MapPin, Phone,
  Hash,
  ArrowRight
} from 'lucide-react';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { hexToRgba, safeTextColor } from '../utils/color';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  referenceCode: string;
  companyId: string;
  companySlug: string;
  companyName?: string;
  agencyId?: string;
  statut?: string;
  canal?: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  primaryColor?: string;
  couleurPrimaire?: string;
  logoUrl?: string;
  telephone?: string;
}

interface AgencyInfo {
  id: string;
  nomAgence: string;
  telephone: string;
  latitude?: number;
  longitude?: number;
}

const ReceiptEnLignePage: React.FC = () => {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyInfo: locationCompanyInfo, reservation: reservationFromState } = location.state || {};

  const [reservation, setReservation] = useState<Reservation | null>(reservationFromState || null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(locationCompanyInfo || null);
  const [agencyInfo, setAgencyInfo] = useState<AgencyInfo | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const formattedDate = reservation?.date
    ? format(parseISO(reservation.date), 'dd/MM/yyyy', { locale: fr })
    : '';
  const fallbackColor = '#3b82f6';
  const primaryColor = companyInfo?.couleurPrimaire || fallbackColor;
  const themeConfig = {
    colors: {
      primary: primaryColor,
      text: safeTextColor(primaryColor),
    },
  };
  const nomCompagnieAffiche = companyInfo?.name || reservation?.companyName || 'Votre compagnie';

  useEffect(() => {
    const fetchData = async () => {
      let res = reservation;

      if (!res && id) {
        const snap = await getDoc(doc(db, 'reservations', id));
        if (snap.exists()) {
          res = { ...(snap.data() as Reservation), id: snap.id };
          setReservation(res);
        }
      }

      if (res?.companyId && !companyInfo) {
        const companySnap = await getDoc(doc(db, 'companies', res.companyId));
        if (companySnap.exists()) {
          const data = companySnap.data();
          const loadedCompanyInfo = {
            id: companySnap.id,
            name: data.name || data.nom || res.companyName || 'Nom Compagnie',
            couleurPrimaire: data.couleurPrimaire,
            logoUrl: data.logoUrl,
            telephone: data.telephone,
          };
          setCompanyInfo(loadedCompanyInfo);
          sessionStorage.setItem('companyInfo', JSON.stringify(loadedCompanyInfo));
        }
      }

      if (res?.agencyId) {
        const agencySnap = await getDoc(doc(db, 'agences', res.agencyId));
        if (agencySnap.exists()) {
          const data = agencySnap.data();
          setAgencyInfo({
            id: agencySnap.id,
            nomAgence: data.nomAgence || 'Agence',
            telephone: data.telephone || '',
            latitude: data.latitude,
            longitude: data.longitude,
          });
        }
      }
    };

    fetchData();
  }, [id, reservation, companyInfo]);

  const handlePDF = useCallback(() => {
    if (receiptRef.current) {
      const opt = {
        margin: 10,
        filename: `reçu-${reservation?.referenceCode}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(receiptRef.current).save();
    }
  }, [reservation]);

  if (!reservation || !companyInfo) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-pulse h-12 w-12 mx-auto rounded-full mb-4" 
             style={{ backgroundColor: hexToRgba(primaryColor, 0.1) }} />
        <p className="text-gray-600">Chargement du reçu...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <header
        className="sticky top-0 z-20 px-4 py-1 shadow-sm"
        style={{
          backgroundColor: primaryColor,
          color: '#ffffff',
          borderBottom: `1px solid ${hexToRgba(primaryColor, 0.2)}`,
        }}
      >
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 rounded-full"
            style={{ color: '#ffffff' }}
          >
            <ChevronLeft size={24} />
          </button>
          
          <h1 className="font-bold text-lg">
            Reçu de réservation
          </h1>
          
          {companyInfo.logoUrl ? (
            <img 
              src={companyInfo.logoUrl} 
              alt="Logo" 
              className="h-8 w-8 rounded-full object-cover border"
              style={{ borderColor: hexToRgba(primaryColor, 0.2) }}
            />
          ) : (
            <div className="h-8 w-8 rounded-full" style={{ backgroundColor: hexToRgba(primaryColor, 0.1) }} />
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Receipt Card */}
        <div 
          ref={receiptRef} 
          className="bg-white rounded-lg shadow-sm overflow-hidden border"
          style={{ borderColor: hexToRgba(primaryColor, 0.3) }}
        >
          {/* Company Header - Version contractée */}
          <div className="p-4 border-b" style={{ borderColor: hexToRgba(primaryColor, 0.2) }}>
            <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between sm:text-left gap-2">
              {/* Logo + Nom compagnie */}
              <div className="flex items-center gap-3">
                {companyInfo.logoUrl && (
                  <img 
                    src={companyInfo.logoUrl} 
                    alt="Logo" 
                    className="h-12 w-12 rounded-full object-cover border-2"
                    style={{ borderColor: 'white' }}
                  />
                )}
                <h2 className="font-bold text-lg" style={{ color: primaryColor }}>
                  {nomCompagnieAffiche}
                </h2>
              </div>

              {/* Agence + téléphone */}
              <div className="flex items-center gap-4 text-sm text-gray-700">
                {agencyInfo?.nomAgence && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <span>{agencyInfo.nomAgence}</span>
                  </div>
                )}
                {(agencyInfo?.telephone || companyInfo.telephone) && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span>{agencyInfo?.telephone || companyInfo.telephone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reference & QR Code */}
          <div className="p-3 flex justify-between items-center border-b text-sm"
               style={{ borderColor: hexToRgba(primaryColor, 0.2) }}>
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100">
              <Hash size={14} className="text-gray-500" />
              <span className="font-mono">{reservation.referenceCode}</span>
            </div>
            <QRCode
              value={`${window.location.origin}/${slug}/receipt/${id}`}
              size={70}
              fgColor={primaryColor}
              level="H"
            />
          </div>

          {/* Client Info */}
          <div className="p-3 border-b grid grid-cols-2 gap-2 text-sm"
               style={{ borderColor: hexToRgba(primaryColor, 0.2) }}>
            <div>
              <p className="text-gray-500 text-xs">Client</p>
              <p className="font-medium">{reservation.nomClient}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Téléphone</p>
              <p className="font-medium">{reservation.telephone}</p>
            </div>
          </div>

          {/* Trip Details */}
          <div className="p-3 border-b text-sm"
               style={{ borderColor: hexToRgba(primaryColor, 0.2) }}>
            <div className="grid grid-cols-2 gap-2 items-center mb-2">
              <div>
                <p className="font-bold">{reservation.depart}</p>
                <p className="text-xs text-gray-500">Départ</p>
              </div>
              <div className="text-right">
                <p className="font-bold">{reservation.arrivee}</p>
                <p className="text-xs text-gray-500">Destination</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-gray-500 text-xs">Date</p>
                <p>{formattedDate}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Heure</p>
                <p>{reservation.heure}</p>
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="p-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-gray-600 text-sm">Montant payé</p>
              <p className="font-bold text-xl" style={{ color: primaryColor }}>
                {reservation.montant.toLocaleString()} FCFA
              </p>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span
                className="px-2 py-1 rounded-full font-medium"
                style={{
                  backgroundColor: hexToRgba(primaryColor, 0.1),
                  color: primaryColor
                }}
              >
                {reservation.statut || 'Non défini'}
              </span>
              <span className="font-medium">{reservation.canal || 'Non défini'}</span>
            </div>
          </div>

          {/* FOOTER */}
          <div className="p-4 text-center text-sm border-t"
            style={{ backgroundColor: hexToRgba(primaryColor, 0.05), borderColor: hexToRgba(primaryColor, 0.2) }}>
            <p className="text-gray-600 mb-1">
              Merci d'avoir choisi <strong>{nomCompagnieAffiche}</strong> — Bon voyage !
            </p>
            <p className="text-xs italic text-gray-500">
              Veuillez vous présenter à l'agence au moins 1 heure avant le départ.
            </p>
          </div>
        </div>
      </main>

      {/* Action Buttons - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t py-4 px-4 shadow-lg grid grid-cols-2 gap-3"
           style={{ borderColor: hexToRgba(primaryColor, 0.2) }}>
        <button
          onClick={handlePDF}
          className="py-3 rounded-lg font-medium flex items-center justify-center gap-2"
          style={{ backgroundColor: primaryColor, color: themeConfig.colors.text }}
        >
          <Download size={18} />
          <span>Télécharger</span>
        </button>
        
        {agencyInfo?.latitude && agencyInfo?.longitude ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${agencyInfo.latitude},${agencyInfo.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-3 rounded-lg font-medium flex items-center justify-center gap-2"
            style={{ backgroundColor: primaryColor, color: themeConfig.colors.text }}
          >
            <MapPin size={18} />
            <span>Itinéraire</span>
          </a>
        ) : (
          <button
            onClick={() => window.print()}
            className="py-3 rounded-lg font-medium flex items-center justify-center gap-2"
            style={{ backgroundColor: primaryColor, color: themeConfig.colors.text }}
          >
            <Printer size={18} />
            <span>Imprimer</span>
          </button>
        )}
        
        <button
          onClick={() => navigate(`/${slug}`)}
          className="py-3 rounded-lg font-medium flex items-center justify-center gap-2 col-span-2"
          style={{ backgroundColor: primaryColor, color: themeConfig.colors.text }}
        >
          <Home size={18} />
          <span>Retour à l'accueil</span>
        </button>
      </div>
    </div>
  );
};

export default ReceiptEnLignePage;