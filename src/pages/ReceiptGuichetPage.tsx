import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, Download, Home, MapPin, Phone, Printer, Calendar } from 'lucide-react';
import { hexToRgba, safeTextColor } from '../utils/color';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

type ReservationStatus = 'confirmé' | 'annulé' | 'en attente';
type PaymentMethod = 'espèces' | 'mobile_money' | 'carte' | string;
type BookingChannel = 'en ligne' | 'agence' | 'téléphone';

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
  compagnieLogo?: string;
  compagnieCouleur?: string;
  agencyId?: string;
  agenceNom?: string;
  agenceTelephone?: string;
  canal: BookingChannel;
  createdAt: { seconds: number; nanoseconds: number } | Date;
  companySlug: string;
  latitude?: number;
  longitude?: number;
  referenceCode?: string;
}

interface CompanyData {
  id: string;
  nom: string;
  logoUrl: string;
  couleurPrimaire: string;
  couleurSecondaire?: string;
  slug: string;
  telephone?: string;
  banniereUrl?: string;
  theme?: {
    primary?: string;
    secondary?: string;
    text?: string;
  };
}

interface LocationState {
  companyInfo?: CompanyData;
  reservation?: ReservationData;
  from?: string;
}

const ReceiptGuichetPage: React.FC = () => {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyInfo: companyInfoFromState, reservation: reservationFromState, from } = location.state as LocationState || {};
  
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const formatDate = useCallback((dateInput: string | Date | { seconds: number; nanoseconds: number }, formatStr: string) => {
    try {
      let date: Date;
      if (typeof dateInput === 'string') {
        date = parseISO(dateInput);
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else {
        date = new Date(dateInput.seconds * 1000);
      }
      return format(date, formatStr, { locale: fr });
    } catch {
      return 'Date invalide';
    }
  }, []);

  const generateReceiptNumber = useCallback(() => {
    if (!reservation) return 'AGC-000000';
    const date = reservation.createdAt instanceof Date ? 
      reservation.createdAt : 
      new Date(reservation.createdAt.seconds * 1000);
    const year = date.getFullYear();
    const num = reservation.id.slice(0, 6).toUpperCase();
    return `AGC-${year}-${num}`;
  }, [reservation]);

  const fetchReservation = useCallback(async () => {
    if (!id) {
      setError("ID de réservation manquant");
      setLoading(false);
      return null;
    }

    try {
      const reservationRef = doc(db, 'reservations', id);
      const reservationSnap = await getDoc(reservationRef);
      
      if (!reservationSnap.exists()) {
        throw new Error("Réservation introuvable");
      }
      
      const reservationData = reservationSnap.data() as Omit<ReservationData, 'id'>;
      
      if (slug && reservationData.companySlug !== slug) {
        throw new Error("URL invalide pour cette réservation");
      }

      return {
        ...reservationData,
        id: reservationSnap.id,
        createdAt: reservationData.createdAt instanceof Date ? 
          reservationData.createdAt : 
          new Date(reservationData.createdAt.seconds * 1000),
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return null;
    }
  }, [id, slug]);

  const fetchCompany = useCallback(async (companyId: string) => {
    try {
      const companyRef = doc(db, 'companies', companyId);
      const companySnap = await getDoc(companyRef);
      
      if (!companySnap.exists()) {
        throw new Error("Compagnie non trouvée");
      }

      const companyData = companySnap.data();
      
      return {
        id: companySnap.id,
        nom: companyData.nom,
        logoUrl: companyData.logoUrl,
        couleurPrimaire: companyData.theme?.primary || companyData.couleurPrimaire || '#3b82f6',
        couleurSecondaire: companyData.theme?.secondary || companyData.couleurSecondaire || '#93c5fd',
        slug: companyData.slug,
        telephone: companyData.telephone,
        banniereUrl: companyData.banniereUrl
      } as CompanyData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement de la compagnie');
      return null;
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        if (reservationFromState && companyInfoFromState) {
          setReservation(reservationFromState);
          setCompany(companyInfoFromState);
          setLoading(false);
          return;
        }

        const reservationData = await fetchReservation();
        if (!reservationData) return;

        const companyData = await fetchCompany(reservationData.compagnieId);
        if (!companyData) return;

        setReservation(reservationData);
        setCompany(companyData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, slug, companyInfoFromState, reservationFromState, fetchReservation, fetchCompany]);

  const handlePDF = useCallback(() => {
    if (receiptRef.current) {
      const opt = {
        margin: 2,
        filename: `recu-${generateReceiptNumber()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          width: 340
        },
        jsPDF: { 
          unit: 'mm', 
          format: [58, 200], // Format ticket 58mm de large
          orientation: 'portrait' 
        }
      };
      
      html2pdf()
        .set(opt)
        .from(receiptRef.current)
        .save();
    }
  }, [generateReceiptNumber]);

  const handleBack = useCallback(() => {
    if (from) {
      navigate(from);
    } else {
      navigate(-1);
    }
  }, [from, navigate]);

  if (loading || !company) {
    return <LoadingSpinner fullScreen />;
  }

  if (error || !reservation || !company) {
    return (
      <ErrorMessage 
        message={error || 'Erreur de chargement'} 
        onRetry={() => window.location.reload()}
        onHome={() => navigate('/')}
      />
    );
  }

  const qrContent = `${window.location.origin}/compagnie/${company.slug}/receipt/${reservation.id}`;
  const primaryColor = company.couleurPrimaire;
  const secondaryColor = company.couleurSecondaire;
  const textColor = safeTextColor(primaryColor);

  return (
    <div 
      className="min-h-screen bg-gray-50 print:bg-white"
      style={{ 
        '--primary': primaryColor,
        '--secondary': secondaryColor,
        '--text-on-primary': textColor
      } as React.CSSProperties}
    >
      <style>{`
        @media print {
          body, html {
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            width: 58mm !important;
          }
          .receipt-container {
            width: 58mm !important;
            max-width: 58mm !important;
            padding: 2mm !important;
            font-size: 10px !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
            page-break-after: avoid !important;
          }
          .compact-section {
            margin-bottom: 2px !important;
            padding: 2px !important;
          }
          .qr-code-container {
            width: 70px !important;
            height: 70px !important;
            margin: 0 auto !important;
          }
          .print-text-sm {
            font-size: 9px !important;
          }
          .print-py-1 {
            padding-top: 1px !important;
            padding-bottom: 1px !important;
          }
          .no-print {
            display: none !important;
          }
          .print-border-top {
            border-top: 4px solid var(--primary) !important;
          }
        }
      `}</style>

      <header 
        className="sticky top-0 z-50 px-4 py-3 shadow-sm no-print"
        style={{
          backgroundColor: primaryColor,
          color: textColor
        }}
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <button 
            onClick={handleBack}
            className="p-2 rounded-full hover:bg-white/10 transition"
            aria-label="Retour"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-3">
            {company.logoUrl && (
              <img 
                src={company.logoUrl} 
                alt={`Logo ${company.nom}`}
                className="h-10 w-10 rounded-full object-cover border-2"
                style={{ 
                  borderColor: textColor,
                  backgroundColor: hexToRgba(primaryColor, 0.2)
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-company.png';
                }}
              />
            )}
            <div className="flex flex-col">
              <h1 className="text-sm font-bold">Reçu de voyage</h1>
              <p className="text-xs opacity-90">{company.nom}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-xs mx-auto p-2 print:p-0 print:max-w-none">
        <div 
          ref={receiptRef}
          className="receipt-container bg-white rounded-lg shadow-sm overflow-hidden print-border-top"
          style={{ width: '58mm', margin: '0 auto' }}
        >
          <div 
            className="p-2 print:p-1 flex justify-between items-center print-py-1"
            style={{ backgroundColor: primaryColor, color: textColor }}
          >
            <div>
              <h1 className="text-sm font-bold print-text-sm">{company.nom}</h1>
              {reservation.agenceNom && (
                <div className="flex items-center gap-1 text-xs opacity-90 print-text-sm">
                  <MapPin className="h-3 w-3" />
                  <span>{reservation.agenceNom}</span>
                </div>
              )}
              {(reservation.agenceTelephone || company.telephone) && (
                <div className="flex items-center gap-1 text-xs opacity-90 print-text-sm">
                  <Phone className="h-3 w-3" />
                  <span>{reservation.agenceTelephone || company.telephone}</span>
                </div>
              )}
            </div>
            {company.logoUrl && (
              <img 
                src={company.logoUrl} 
                alt={company.nom}
                className="h-8 w-8 object-contain bg-white p-1 rounded-full print:h-6 print:w-6"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-company.png';
                }}
              />
            )}
          </div>

          <div className="p-2 print:p-1 print-py-1">
            <div className="flex justify-between items-start mb-2 pb-1 border-b border-gray-200 compact-section">
              <div>
                <p className="text-xs text-gray-500 print-text-sm">
                  N° {generateReceiptNumber()}
                </p>
                <div className="flex items-center gap-1 text-xs text-gray-500 print-text-sm">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(reservation.createdAt, 'dd/MM/yyyy à HH:mm')}</span>
                </div>
              </div>
              <div className="text-right">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium print-text-sm"
                  style={{
                    backgroundColor: hexToRgba(primaryColor, 0.15),
                    color: primaryColor
                  }}
                >
                  {reservation.statut}
                </span>
              </div>
            </div>

            <div className="mb-2 compact-section">
              <h3 className="text-xs font-semibold mb-1" style={{ color: primaryColor }}>
                Client
              </h3>
              <div className="grid grid-cols-2 gap-1 text-xs print-text-sm">
                <div>
                  <p className="text-2xs text-gray-600 print-text-sm">Nom</p>
                  <p className="truncate">{reservation.nomClient}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-600 print-text-sm">Téléphone</p>
                  <p>{reservation.telephone}</p>
                </div>
                {reservation.email && (
                  <div className="col-span-2">
                    <p className="text-2xs text-gray-600 print-text-sm">Email</p>
                    <p className="truncate">{reservation.email}</p>
                  </div>
                )}
                {reservation.referenceCode && (
                  <div className="col-span-2">
                    <p className="text-2xs text-gray-600 print-text-sm">Référence</p>
                    <p className="font-mono text-xs">{reservation.referenceCode}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-2 compact-section">
              <h3 className="text-xs font-semibold mb-1 print-text-sm" style={{ color: primaryColor }}>
                Voyage
              </h3>
              <div className="grid grid-cols-2 gap-1 text-xs print-text-sm">
                <div className="col-span-2">
                  <p className="text-2xs text-gray-600 print-text-sm">Trajet</p>
                  <p className="font-medium">
                    {reservation.depart} → {reservation.arrivee}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-gray-600 print-text-sm">Date</p>
                  <p>{formatDate(reservation.date, 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-600 print-text-sm">Heure</p>
                  <p>{reservation.heure}</p>
                </div>
                <div>
                  <p className="text-2xs text-gray-600 print-text-sm">Places</p>
                  <p>
                    {reservation.seatsGo} {reservation.seatsReturn ? `(+${reservation.seatsReturn} retour)` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-gray-600 print-text-sm">Canal</p>
                  <p className="capitalize">{reservation.canal}</p>
                </div>
              </div>
            </div>

            <div className="mb-2 compact-section">
              <h3 className="text-xs font-semibold mb-1 print-text-sm" style={{ color: primaryColor }}>
                Paiement
              </h3>
              <div className="grid grid-cols-2 gap-1 text-xs print-text-sm">
                <div>
                  <p className="text-2xs text-gray-600 print-text-sm">Montant</p>
                  <p className="font-bold" style={{ color: primaryColor }}>
                    {reservation.montant?.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>
                <div>
                  <p className="text-2xs text-gray-600 print-text-sm">Méthode</p>
                  <p className="capitalize">{reservation.paiement}</p>
                </div>
              </div>
            </div>

            <div className="mt-2 p-1 rounded border border-gray-200 flex flex-col items-center compact-section">
              <h3 className="text-xs font-semibold mb-1 print-text-sm" style={{ color: primaryColor }}>
                Code d'embarquement
              </h3>
              <div className="bg-white p-1 rounded border qr-code-container" style={{ borderColor: primaryColor }}> 
                <QRCode 
                  value={qrContent} 
                  size={70} 
                  fgColor={primaryColor}
                  level="H"
                />
              </div>
              <p className="text-2xs text-gray-500 mt-1 text-center print-text-sm">
                Présentez ce code QR au chauffeur
              </p>
            </div>

            <div className="mt-1 pt-1 border-t border-gray-200 text-center text-2xs text-gray-500 compact-section print-text-sm">
              <p>Reçu valable uniquement pour le trajet indiqué</p>
              <p className="mt-0.5">Merci d'avoir choisi {company.nom}</p>
            </div>
          </div>
        </div>

        <div className="no-print mt-3 grid grid-cols-1 gap-2">
          <button
            onClick={handlePDF}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg shadow transition-colors text-xs"
            style={{
              backgroundColor: primaryColor,
              color: textColor
            }}
          >
            <Download className="h-4 w-4" />
            Télécharger
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg shadow transition-colors text-xs"
            style={{
              backgroundColor: secondaryColor || hexToRgba(primaryColor, 0.8),
              color: safeTextColor(secondaryColor || primaryColor)
            }}
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </button>

          <button
            onClick={() => navigate(`/compagnie/${company.slug}`)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg shadow hover:bg-gray-300 transition-colors text-xs"
          >
            <Home className="h-4 w-4" />
            Retour à la compagnie
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptGuichetPage;
