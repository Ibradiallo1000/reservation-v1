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
import { motion } from 'framer-motion';

interface CreatedAt {
  seconds: number;
  nanoseconds: number;
}

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
  statut: string;
  paiement: string;
  compagnieId: string;
  companySlug: string;
  agencyId?: string;
  agenceNom?: string;
  agenceTelephone?: string;
  canal: string;
  createdAt: Date | CreatedAt | string;
  referenceCode?: string;
  latitude?: number;
  longitude?: number;
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

  const formatDate = useCallback((dateInput: Date | CreatedAt | string, formatStr: string): string => {
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
    const date = reservation.createdAt instanceof Date 
      ? reservation.createdAt 
      : new Date((reservation.createdAt as CreatedAt).seconds * 1000);
    return `ONL-${date.getFullYear()}-${reservation.id.slice(0, 6).toUpperCase()}`;
  }, [reservation]);

  const fetchReservation = useCallback(async (): Promise<ReservationData | null> => {
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
        agenceNom,
        agenceTelephone,
        latitude,
        longitude,
        createdAt: reservationData.createdAt instanceof Date
          ? reservationData.createdAt
          : new Date((reservationData.createdAt as CreatedAt).seconds * 1000),
      };
    } catch (err) {
      console.error("Erreur fetchReservation:", err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      return null;
    }
  }, [id]);

  const fetchCompany = useCallback(async (companySlug: string): Promise<CompanyData | null> => {
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
      console.error("Erreur fetchCompany:", err);
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

        if (companyInfoFromState) {
          setReservation(reservationData);
          setCompany(companyInfoFromState);
          setLoading(false);
          return;
        }

        const companySlug = slug || reservationData.companySlug;
        if (!companySlug) {
          throw new Error("Impossible de déterminer la compagnie");
        }

        const companyData = await fetchCompany(companySlug);
        if (!companyData) return;

        setReservation(reservationData);
        setCompany(companyData);
      } catch (err) {
        console.error("Erreur loadData:", err);
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

  const handlePrint = useCallback(() => {
    const printWindow = window.open('', '_blank');
    if (printWindow && receiptRef.current) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Reçu de voyage</title>
            <style>
              body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
              .receipt { width: 100mm; padding: 5mm; }
            </style>
          </head>
          <body>
            <div class="receipt">${receiptRef.current.innerHTML}</div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 200);
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  }, []);

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
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 px-4 py-3 shadow-sm no-print"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${hexToRgba(primaryColor, 0.8)} 100%)`,
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
          
          <h1 className="text-lg font-bold">Reçu de voyage</h1>
        </div>
      </motion.header>

      {/* Main content */}
      <div className="max-w-md mx-auto p-4 print:p-0 print:max-w-none">
        {/* Receipt card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          ref={receiptRef}
          className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4"
          style={{ 
            borderColor: primaryColor,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
        >
          {/* Receipt header */}
          <div 
            className="p-4 print:p-3 flex justify-between items-center"
            style={{ 
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${hexToRgba(primaryColor, 0.9)} 100%)`,
              color: textColor
            }}
          >
            <div>
              <h1 className="text-xl font-bold">{company.nom}</h1>
              {(reservation.agenceNom || company.agenceNom) && (
                <p className="text-sm opacity-90 mt-1">
                  Agence: {reservation.agenceNom || company.agenceNom}
                </p>
              )}
              {(reservation.agenceTelephone || company.telephone) && (
                <p className="text-sm opacity-90 mt-1">
                  Tel: {reservation.agenceTelephone || company.telephone}
                </p>
              )}
            </div>
            {company.logoUrl && (
              <img 
                src={company.logoUrl} 
                alt={company.nom}
                className="h-12 w-12 object-contain bg-white p-1 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-company.png';
                  (e.target as HTMLImageElement).classList.add('default-logo');
                }}
              />
            )}
          </div>

          {/* Receipt body */}
          <div className="p-4 print:p-3">
            {/* Reference and status */}
            <div className="flex justify-between items-start mb-4 pb-2 border-b border-gray-100">
              <div>
                <p className="text-sm text-gray-500">N° {generateReceiptNumber()}</p>
                <p className="text-xs text-gray-500">
                  Émis le {formatDate(reservation.createdAt, 'dd/MM/yyyy à HH:mm')}
                </p>
              </div>
              <div className="text-right">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: hexToRgba(primaryColor, 0.15),
                    color: primaryColor
                  }}
                >
                  {reservation.statut}
                </span>
              </div>
            </div>

            {/* Client info */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2" style={{ color: primaryColor }}>
                Informations client
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-600">Nom</p>
                  <p>{reservation.nomClient}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Téléphone</p>
                  <p>{reservation.telephone}</p>
                </div>
                {reservation.email && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-600">Email</p>
                    <p>{reservation.email}</p>
                  </div>
                )}
                {reservation.referenceCode && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-600">Référence</p>
                    <p className="font-mono">{reservation.referenceCode}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Trip details */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2" style={{ color: primaryColor }}>
                Détails du voyage
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="col-span-2">
                  <p className="text-xs text-gray-600">Trajet</p>
                  <p className="font-medium">
                    {reservation.depart} → {reservation.arrivee}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Date</p>
                  <p>{formatDate(reservation.date, 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Heure</p>
                  <p>{reservation.heure}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Places</p>
                  <p>
                    {reservation.seatsGo} {reservation.seatsReturn ? `(+${reservation.seatsReturn} retour)` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Canal</p>
                  <p className="capitalize">{reservation.canal}</p>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2" style={{ color: primaryColor }}>
                Paiement
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-600">Montant</p>
                  <p className="font-bold" style={{ color: primaryColor }}>
                    {reservation.montant?.toLocaleString('fr-FR')} FCFA
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Méthode</p>
                  <p className="capitalize">{reservation.paiement}</p>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div className="mt-4 p-3 rounded border border-gray-200 flex flex-col items-center">
              <h3 className="text-sm font-semibold mb-2" style={{ color: primaryColor }}>
                Code d'embarquement
              </h3>
              <div className="bg-white p-1 rounded border" style={{ borderColor: primaryColor }}>
                <QRCode 
                  value={qrContent} 
                  size={90} 
                  fgColor={primaryColor}
                  level="H"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Présentez ce code QR au chauffeur ou à l'agent d'embarquement
              </p>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-2 border-t border-gray-200 text-center text-xs text-gray-500">
              <p>Reçu valable uniquement pour le trajet indiqué</p>
              <p className="mt-1">Merci d'avoir choisi {company.nom}</p>
            </div>
          </div>
        </motion.div>

        {/* Action buttons */}
        <div className="no-print mt-4 grid grid-cols-2 gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePDF}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg shadow transition-colors text-sm"
            style={{
              backgroundColor: primaryColor,
              color: textColor
            }}
          >
            <Download className="h-4 w-4" />
            Télécharger
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition-colors text-sm"
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/')}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg shadow hover:bg-gray-300 transition-colors text-sm col-span-2"
          >
            <Home className="h-4 w-4" />
            Retour à l'accueil
          </motion.button>

          {reservation.latitude && reservation.longitude && (
            <motion.a
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              href={`https://www.google.com/maps/dir/?api=1&destination=${reservation.latitude},${reservation.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors text-sm col-span-2"
            >
              <MapPin className="h-4 w-4" />
              Itinéraire vers l'agence
            </motion.a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiptEnLignePage;