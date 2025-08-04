import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, Download, Home, MapPin, Phone, Printer, Calendar, User, Ticket, CreditCard, ArrowRight } from 'lucide-react';
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
  agencyNom?: string;
  nomAgence?: string;
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
      if (typeof dateInput === 'string') date = parseISO(dateInput);
      else if (dateInput instanceof Date) date = dateInput;
      else date = new Date(dateInput.seconds * 1000);
      return format(date, formatStr, { locale: fr });
    } catch {
      return '--/--/----';
    }
  }, []);

  const generateReceiptNumber = useCallback(() => {
  if (!reservation) return 'BIL-000000';

  const villeDep = reservation.depart.slice(0, 3).toUpperCase();
  const villeArr = reservation.arrivee.slice(0, 3).toUpperCase();
  const agence = (reservation.agenceNom || reservation.agencyNom || reservation.nomAgence || 'AGC')
    .slice(0, 3)
    .toUpperCase();
  const code = reservation.id.substring(reservation.id.length - 6).toUpperCase();

  return `${agence}-${villeDep}${villeArr}-${code}`;
}, [reservation]);

  const fetchReservation = useCallback(async () => {
    if (!id) {
      setError("ID de réservation manquant");
      setLoading(false);
      return null;
    }

    try {
      if (!reservationFromState) throw new Error("Données de réservation manquantes");

      const companyId = reservationFromState.compagnieId;
      const agencyId = reservationFromState.agencyId;

      if (!companyId || !agencyId) throw new Error("Identifiants manquants");

      const fullRef = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', id);
      const fullSnap = await getDoc(fullRef);

      if (!fullSnap.exists()) throw new Error("Réservation introuvable");

      const data = fullSnap.data();
      return {
        ...data,
        id: fullSnap.id,
        createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt.seconds * 1000),
      } as ReservationData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return null;
    }
  }, [id, reservationFromState]);

  const fetchCompany = useCallback(async (companyId: string) => {
    try {
      const companyRef = doc(db, 'companies', companyId);
      const snap = await getDoc(companyRef);
      if (!snap.exists()) throw new Error("Compagnie non trouvée");
      const raw = snap.data();
      return {
        id: snap.id,
        nom: raw.nom,
        logoUrl: raw.logoUrl,
        couleurPrimaire: raw.theme?.primary || raw.couleurPrimaire || '#3b82f6',
        couleurSecondaire: raw.theme?.secondary || raw.couleurSecondaire || '#93c5fd',
        slug: raw.slug,
        telephone: raw.telephone,
        banniereUrl: raw.banniereUrl
      } as CompanyData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur compagnie');
      return null;
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (!reservationFromState || !companyInfoFromState) {
          throw new Error("Données manquantes. Vous devez accéder à cette page depuis une réservation valide.");
        }

        const res = await fetchReservation();
        if (!res) return;
        
        const comp = await fetchCompany(res.compagnieId);
        if (!comp) return;
        
        setReservation(res);
        setCompany(comp);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inattendue');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [fetchReservation, fetchCompany, reservationFromState, companyInfoFromState]);

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
          format: [81, 200],
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
            width: 81mm !important;
          }
          .receipt-container {
            width: 81mm !important;
            max-width: 81mm !important;
            padding: 3mm !important;
            font-size: 11px !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
            page-break-after: avoid !important;
          }
          .compact-section {
            margin-bottom: 3px !important;
            padding: 2px !important;
          }
          .qr-code-container {
            width: 60px !important;
            height: 60px !important;
            margin: 0 auto !important;
          }
          .print-text-sm {
            font-size: 10px !important;
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

      {/* Header navigation (non imprimé) */}
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

      <div className="max-w-[81mm] mx-auto p-2 print:p-0 print:max-w-none">
        {/* Conteneur principal du reçu */}
        <div 
          ref={receiptRef}
          className="receipt-container bg-white rounded-lg shadow-sm overflow-hidden print-border-top"
          style={{ width: '81mm', margin: '0 auto' }}
        >
          {/* En-tête du reçu */}
<div 
  className="flex justify-between items-center border-b pb-2 mb-2 px-3" 
  style={{ borderColor: hexToRgba(primaryColor, 0.3) }}
>
  {/* Logo + Société + Agence */}
  <div className="flex items-center gap-2">
    {company.logoUrl && (
      <img 
        src={company.logoUrl} 
        alt={company.nom}
        className="h-9 w-9 object-contain rounded border"
        style={{ borderColor: primaryColor }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/default-company.png';
        }}
      />
    )}
    <div className="leading-tight">
      <h2 className="text-sm font-bold" style={{ color: primaryColor }}>
        {company.nom}
      </h2>
      <p className="text-[11px] text-gray-700 flex items-center gap-1">
        <MapPin className="h-3 w-3 text-gray-500" />
        {(reservation.agenceNom || reservation.agencyNom || reservation.nomAgence || "Agence inconnue").trim()}
      </p>
    </div>
  </div>

  {/* Numéro de billet + Statut */}
  <div className="text-right leading-tight pr-2">
    <p className="text-[11px] font-mono tracking-tight text-gray-700">
      N° {generateReceiptNumber()}
    </p>
    <span 
      className="px-2 py-0.5 rounded text-[10px] font-medium"
      style={{ 
        backgroundColor: hexToRgba(primaryColor, 0.15),
        color: primaryColor 
      }}
    >
      {reservation.statut?.toUpperCase() || "EN ATTENTE"}
    </span>
  </div>
</div>

          {/* Corps du reçu */}
          <div className="p-2 print:p-1 space-y-2 print-py-1">
            {/* Section Client */}
            <div className="compact-section">
              <div className="flex items-center gap-1 mb-1">
                <User className="h-3 w-3" style={{ color: primaryColor }} />
                <h3 className="text-xs font-semibold" style={{ color: primaryColor }}>Client</h3>
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
                {reservation.referenceCode && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-600">Référence</p>
                    <p className="font-mono text-[11px]">{reservation.referenceCode}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Section Voyage */}
            <div className="compact-section">
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
                <div>
                  <p className="text-[10px] text-gray-600">Date</p>
                  <p>{formatDate(reservation.date, 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600">Heure</p>
                  <p>{reservation.heure}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600">Places</p>
                  <p>
                    {reservation.seatsGo} {reservation.seatsReturn ? `(+${reservation.seatsReturn} retour)` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600">Canal</p>
                  <p className="capitalize">{reservation.canal}</p>
                </div>
              </div>
            </div>

            {/* Section Paiement */}
            <div className="compact-section">
              <div className="flex items-center gap-1 mb-1">
                <CreditCard className="h-3 w-3" style={{ color: primaryColor }} />
                <h3 className="text-xs font-semibold" style={{ color: primaryColor }}>Paiement</h3>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <div>
                  <p className="text-[10px] text-gray-600">Montant</p>
                  <p className="font-bold" style={{ color: primaryColor }}>
                    {reservation.montant?.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600">Méthode</p>
                  <p className="capitalize">{reservation.paiement}</p>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div className="mt-2 p-1 rounded border border-gray-200 flex flex-col items-center compact-section">
              <h3 className="text-xs font-semibold mb-1" style={{ color: primaryColor }}>
                Code d'embarquement
              </h3>
              <div className="bg-white p-1 rounded border qr-code-container" style={{ borderColor: primaryColor }}> 
                <QRCode 
                  value={qrContent} 
                  size={60} 
                  fgColor={primaryColor}
                  level="H"
                />
              </div>
            </div>

            {/* Footer */}
<div className="mt-2 pt-2 border-t border-gray-200 text-center compact-section"
    style={{ fontSize: "10px", color: "#4b5563" }}>
  
  <p className="mb-1">Merci d'avoir choisi {company.nom}</p>
  <p className="italic mb-1">Présentez-vous 1H avant le départ</p>
  
  <p className="font-medium mb-0.5">Pour plus d'infos, veuillez contacter :</p>
  <div className="flex justify-center items-center gap-1 text-gray-700">
    <Phone className="h-3 w-3 text-gray-500" />
    <span>{reservation.agenceTelephone || company.telephone || "—"}</span>
  </div>
</div>  
          </div>
        </div>

        {/* Boutons d'action (non imprimés) */}
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
            onClick={() => navigate('/agence/guichet')}
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