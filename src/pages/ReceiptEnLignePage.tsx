import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, Download, Printer, Home, MapPin } from 'lucide-react';
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
  compagnieLogo: string;
  compagnieCouleur: string;
  agencyId?: string;
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
  agenceNom?: string;
  telephone?: string;
  banniereUrl?: string;
}

interface LocationState {
  companyInfo?: CompanyData;
  reservation?: ReservationData;
  from?: string;
}

const ReceiptEnLignePage: React.FC = () => {
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
    if (!reservation) return 'ONL-000000';
    const date = reservation.createdAt instanceof Date ? 
      reservation.createdAt : 
      new Date(reservation.createdAt.seconds * 1000);
    const year = date.getFullYear();
    const num = reservation.id.slice(0, 6).toUpperCase();
    return `ONL-${year}-${num}`;
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

      // Fetch agency data if exists
      let agenceNom = '';
      let agenceTelephone = '';
      let latitude: number | undefined;
      let longitude: number | undefined;
      
      if (reservationData.agencyId) {
        const agencySnap = await getDoc(doc(db, 'agences', reservationData.agencyId));
        if (agencySnap.exists()) {
          const agencyData = agencySnap.data();
          agenceNom = agencyData.nomAgence || '';
          agenceTelephone = agencyData.telephone || '';
          latitude = agencyData.latitude;
          longitude = agencyData.longitude;
        }
      }

      return {
        ...reservationData,
        id: reservationSnap.id,
        createdAt: reservationData.createdAt instanceof Date ? 
          reservationData.createdAt : 
          new Date(reservationData.createdAt.seconds * 1000),
        latitude,
        longitude
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return null;
    }
  }, [id, slug]);

  const fetchCompany = useCallback(async (companySlug: string) => {
    try {
      const companyQuery = query(collection(db, 'companies'), where('slug', '==', companySlug));
      const companySnapshot = await getDocs(companyQuery);
      
      if (companySnapshot.empty) {
        throw new Error("Compagnie non trouvée");
      }
      
      const companyDoc = companySnapshot.docs[0];
      return {
        id: companyDoc.id,
        ...companyDoc.data()
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
        // 1. Vérifier si on a déjà les données dans le state
        if (reservationFromState && companyInfoFromState) {
          setReservation(reservationFromState);
          setCompany(companyInfoFromState);
          setLoading(false);
          return;
        }

        // 2. Si non, charger depuis Firestore
        const reservationData = await fetchReservation();
        if (!reservationData) return;

        // Si on a companyInfoFromState mais pas reservationFromState
        if (companyInfoFromState) {
          setReservation(reservationData);
          setCompany(companyInfoFromState);
          setLoading(false);
          return;
        }

        // Sinon, charger la compagnie depuis Firestore
        const companySlug = slug || reservationData.companySlug;
        if (!companySlug) {
          throw new Error("Impossible de déterminer la compagnie");
        }

        const companyData = await fetchCompany(companySlug);
        if (!companyData) return;

        // Mettre à jour les données d'agence si nécessaire
        if (reservationData.agencyId) {
          const agencySnap = await getDoc(doc(db, 'agences', reservationData.agencyId));
          if (agencySnap.exists()) {
            const agencyData = agencySnap.data();
            companyData.agenceNom = agencyData.nomAgence || '';
            companyData.telephone = agencyData.telephone || companyData.telephone;
          }
        }

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
          scale: 1.5,
          useCORS: true,
          letterRendering: true,
          width: 340
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a6',
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

  if (loading) {
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
  const primaryColor = company.couleurPrimaire || '#3b82f6';
  const secondaryColor = company.couleurSecondaire || '#93c5fd';
  const textColor = safeTextColor(primaryColor);

  return (
    <div 
      className="min-h-screen bg-gray-50 print:bg-white"
      style={{ '--primary': primaryColor, '--secondary': secondaryColor } as React.CSSProperties}
    >
      {/* Styles d'impression */}
      <style>{`
        @media print {
          body, html {
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .receipt-container {
            padding: 2mm !important;
            font-size: 11px !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
          }
          .compact-section {
            margin-bottom: 2px !important;
            padding: 2px !important;
          }
          .qr-code-container {
            width: 90px !important;
            height: 90px !important;
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
            border-top: 4px solid ${primaryColor} !important;
          }
        }
      `}</style>

      {/* Header */}
      <header 
        className="sticky top-0 z-50 px-4 py-3 shadow-sm no-print"
        style={{
          backgroundColor: hexToRgba(primaryColor, 0.95),
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
          
          <div className="flex items-center gap-2">
            {company.logoUrl && (
              <img 
                src={company.logoUrl} 
                alt={`Logo ${company.nom}`}
                className="h-8 w-8 rounded-full object-cover border-2"
                style={{ 
                  borderColor: textColor,
                  backgroundColor: hexToRgba(primaryColor, 0.2)
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-company.png';
                }}
              />
            )}
            <h1 className="text-lg font-bold">
              Reçu de voyage
            </h1>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <div className="max-w-lg mx-auto p-4 print:p-0 print:max-w-none">
        {/* Reçu */}
        <div 
          ref={receiptRef}
          className="receipt-container bg-white rounded-xl shadow-sm overflow-hidden print:shadow-none print:rounded-none print-border-top"
        >
          {/* En-tête du reçu */}
          <div 
            className="p-3 print:p-2 flex justify-between items-center print-py-1"
            style={{ backgroundColor: primaryColor, color: textColor }}
          >
            <div>
              <h1 className="text-lg font-bold print-text-sm">{company.nom}</h1>
              {company.agenceNom && (
                <p className="text-xs opacity-90 mt-1 print-text-sm">
                  Agence: {company.agenceNom}
                </p>
              )}
              {company.telephone && (
                <p className="text-xs opacity-90 mt-1 print-text-sm">
                  Tel: {company.telephone}
                </p>
              )}
            </div>
            {company.logoUrl && (
              <img 
                src={company.logoUrl} 
                alt={company.nom}
                className="h-10 w-10 object-contain bg-white p-1 rounded-full print:h-8 print:w-8"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-company.png';
                }}
              />
            )}
          </div>

          {/* Corps du reçu */}
          <div className="p-3 print:p-2 print-py-1">
            {/* Numéro et statut */}
            <div className="flex justify-between items-start mb-3 pb-1 border-b border-gray-200 compact-section">
              <div>
                <p className="text-sm text-gray-500 print-text-sm">
                  N° {generateReceiptNumber()}
                </p>
                <p className="text-xs text-gray-500 print-text-sm">
                  Émis le {formatDate(reservation.createdAt, 'dd/MM/yyyy à HH:mm')}
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium print-text-sm ${
                  reservation.statut === 'confirmé' 
                    ? 'bg-green-100 text-green-800' 
                    : reservation.statut === 'annulé' 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {reservation.statut}
                </span>
              </div>
            </div>

            {/* Informations client */}
            <div className="mb-3 compact-section">
              <h3 className="text-sm font-semibold mb-1 print-text-sm" style={{ color: primaryColor }}>
                Client
              </h3>
              <div className="grid grid-cols-2 gap-1 text-sm print-text-sm">
                <div>
                  <p className="text-xs text-gray-600 print-text-sm">Nom</p>
                  <p>{reservation.nomClient}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 print-text-sm">Téléphone</p>
                  <p>{reservation.telephone}</p>
                </div>
                {reservation.email && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-600 print-text-sm">Email</p>
                    <p>{reservation.email}</p>
                  </div>
                )}
                {reservation.referenceCode && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-600 print-text-sm">Référence</p>
                    <p className="font-mono">{reservation.referenceCode}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Détails du voyage */}
            <div className="mb-3 compact-section">
              <h3 className="text-sm font-semibold mb-1 print-text-sm" style={{ color: primaryColor }}>
                Voyage
              </h3>
              <div className="grid grid-cols-2 gap-1 text-sm print-text-sm">
                <div className="col-span-2">
                  <p className="text-xs text-gray-600 print-text-sm">Trajet</p>
                  <p className="font-medium">
                    {reservation.depart} → {reservation.arrivee}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 print-text-sm">Date</p>
                  <p>{formatDate(reservation.date, 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 print-text-sm">Heure</p>
                  <p>{reservation.heure}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 print-text-sm">Places</p>
                  <p>
                    {reservation.seatsGo} {reservation.seatsReturn ? `(+${reservation.seatsReturn} retour)` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 print-text-sm">Canal</p>
                  <p className="capitalize">{reservation.canal}</p>
                </div>
              </div>
            </div>

            {/* Paiement */}
            <div className="mb-3 compact-section">
              <h3 className="text-sm font-semibold mb-1 print-text-sm" style={{ color: primaryColor }}>
                Paiement
              </h3>
              <div className="grid grid-cols-2 gap-1 text-sm print-text-sm">
                <div>
                  <p className="text-xs text-gray-600 print-text-sm">Montant</p>
                  <p className="font-bold" style={{ color: primaryColor }}>
                    {reservation.montant?.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 print-text-sm">Méthode</p>
                  <p className="capitalize">{reservation.paiement}</p>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div className="mt-3 p-2 rounded border border-gray-200 flex flex-col items-center compact-section">
              <h3 className="text-sm font-semibold mb-1 print-text-sm" style={{ color: primaryColor }}>
                Code d'embarquement
              </h3>
              <div className="bg-white p-1 rounded border qr-code-container" style={{ borderColor: primaryColor }}>
                <QRCode 
                  value={qrContent} 
                  size={90} 
                  fgColor={primaryColor}
                  level="H"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1 text-center print-text-sm">
                Présentez ce code QR au chauffeur ou à l'agent d'embarquement
              </p>
            </div>

            {/* Footer */}
            <div className="mt-2 pt-1 border-t border-gray-200 text-center text-xs text-gray-500 compact-section print-text-sm">
              <p>Reçu valable uniquement pour le trajet indiqué</p>
              <p className="mt-1">Merci d'avoir choisi {company.nom}</p>
            </div>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="no-print mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
          <button
            onClick={handlePDF}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg shadow transition-colors text-sm"
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
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition-colors text-sm"
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </button>

          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg shadow hover:bg-gray-300 transition-colors text-sm"
          >
            <Home className="h-4 w-4" />
            Accueil
          </button>

          {reservation.latitude && reservation.longitude && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${reservation.latitude},${reservation.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors text-sm"
            >
              <MapPin className="h-4 w-4" />
              Itinéraire
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiptEnLignePage;