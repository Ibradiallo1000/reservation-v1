import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  ChevronLeft, MapPin, Clock, Calendar, CheckCircle, XCircle, Loader2, 
  Users, User, Upload, CreditCard, Wallet, Phone, Navigation, Ticket
} from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { motion } from 'framer-motion';
import { hexToRgba, safeTextColor } from '../utils/color';
import { fadeIn } from '@/utils/animations';

type ReservationStatus = 'en_attente' | 'paiement_en_cours' | 'preuve_recue' | 'payé' | 'annule';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  seatsGo: number;
  seatsReturn: number;
  tripType: string;
  statut: ReservationStatus;
  referenceCode: string;
  companyId: string;
  companySlug: string;
  companyName?: string;
  primaryColor?: string;
  tripData?: any;
}

interface CompanyInfo {
  id: string;
  name: string;
  primaryColor?: string;
  logoUrl?: string;
}

const STATUS_DISPLAY: Record<ReservationStatus, { 
  text: string; 
  color: string; 
  icon: React.ReactNode;
  bgColor: string;
}> = {
  en_attente: { 
    text: 'En attente de paiement', 
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    icon: <Loader2 className="h-5 w-5 animate-spin" /> 
  },
  paiement_en_cours: { 
    text: 'Paiement en cours', 
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    icon: <Loader2 className="h-5 w-5 animate-spin" /> 
  },
  preuve_recue: { 
    text: 'Preuve reçue', 
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    icon: <Upload className="h-5 w-5" /> 
  },
  payé: { 
    text: 'Paiement confirmé', 
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    icon: <CheckCircle className="h-5 w-5" /> 
  },
  annule: { 
    text: 'Annulé', 
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: <XCircle className="h-5 w-5" /> 
  },
};

const ReservationDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { slug, companyInfo: locationCompanyInfo } = location.state || {};

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(locationCompanyInfo || null);
  const [error, setError] = useState<string | null>(null);

  const fallbackColor = '#3b82f6';
  const primaryColor = companyInfo?.primaryColor || fallbackColor;
  const textColor = safeTextColor(primaryColor);

  useEffect(() => {
    if (!id) { setError('ID manquant'); setLoading(false); return; }

    const unsub = onSnapshot(doc(db, 'reservations', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setReservation({ ...(data as Reservation), id: docSnap.id });
      } else {
        setError('Réservation introuvable');
      }
      setLoading(false);
    }, err => { console.error(err); setError('Erreur Firestore'); setLoading(false); });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    const fetchCompany = async () => {
      if (locationCompanyInfo || !reservation?.companyId) return;
      const docRef = await getDoc(doc(db, 'companies', reservation.companyId));
      if (docRef.exists()) {
        const data = docRef.data() as CompanyInfo;
        setCompanyInfo({ id: docRef.id, name: data.name, primaryColor: data.primaryColor, logoUrl: data.logoUrl });
      }
    };
    fetchCompany();
  }, [reservation?.companyId, locationCompanyInfo]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin" style={{ color: primaryColor }} />
        <p className="text-gray-600">Chargement de votre réservation...</p>
      </div>
    </div>
  );

  if (error || !reservation) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Erreur</h3>
        <p className="text-gray-600 mb-6">{error || 'Réservation introuvable'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 rounded-lg font-medium"
          style={{ backgroundColor: primaryColor, color: textColor }}
        >
          Retour
        </button>
      </div>
    </div>
  );

  const realSlug = slug || reservation.companySlug;
  const statusInfo = STATUS_DISPLAY[reservation.statut] || STATUS_DISPLAY.annule;
  const formattedDate = new Date(reservation.date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header avec effet glassmorphism */}
      <header
        className="sticky top-0 z-20 px-6 py-4 backdrop-blur-sm border-b"
        style={{ 
          backgroundColor: hexToRgba(primaryColor, 0.9),
          borderColor: hexToRgba(primaryColor, 0.2),
          color: textColor
        }}
      >
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <h1 className="font-bold text-xl">Détails de réservation</h1>
          
          {companyInfo?.logoUrl ? (
            <LazyLoadImage 
              src={companyInfo.logoUrl} 
              alt="Logo compagnie" 
              className="h-10 w-10 rounded-full object-cover border-2"
              style={{ borderColor: hexToRgba(textColor, 0.2) }}
              effect="blur"
            />
          ) : (
            <div className="h-10 w-10 rounded-full flex items-center justify-center font-semibold border-2"
              style={{ 
                backgroundColor: hexToRgba(textColor, 0.1),
                borderColor: hexToRgba(textColor, 0.2),
                color: textColor
              }}
            >
              {companyInfo?.name?.charAt(0) || 'C'}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Carte de statut */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`p-4 rounded-xl ${statusInfo.bgColor} flex items-center gap-3 shadow-sm`}
        >
          <div className={`p-2 rounded-full ${statusInfo.color}`}>
            {statusInfo.icon}
          </div>
          <div>
            <p className="font-semibold" style={{ color: statusInfo.color }}>
              {statusInfo.text}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Référence: <span className="font-mono">{reservation.referenceCode}</span>
            </p>
          </div>
        </motion.div>

        {/* Carte d'informations */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-sm overflow-hidden"
        >
          <div className="p-5 border-b">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Ticket className="h-5 w-5" style={{ color: primaryColor }} />
              Informations du voyage
            </h2>
          </div>
          
          <div className="divide-y divide-gray-100">
            <div className="p-5 flex items-start gap-4">
              <div className="p-2 rounded-full bg-gray-100 mt-0.5">
                <MapPin className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Itinéraire</h3>
                <p className="text-gray-600">
                  {reservation.depart} → {reservation.arrivee}
                </p>
              </div>
            </div>
            
            <div className="p-5 flex items-start gap-4">
              <div className="p-2 rounded-full bg-gray-100 mt-0.5">
                <Calendar className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Date</h3>
                <p className="text-gray-600">{formattedDate}</p>
                <p className="text-gray-600 flex items-center gap-1 mt-1">
                  <Clock className="h-4 w-4" /> {reservation.heure}
                </p>
              </div>
            </div>
            
            <div className="p-5 flex items-start gap-4">
              <div className="p-2 rounded-full bg-gray-100 mt-0.5">
                <User className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Passager</h3>
                <p className="text-gray-600">{reservation.nomClient}</p>
                <p className="text-gray-600 flex items-center gap-1 mt-1">
                  <Phone className="h-4 w-4" /> {reservation.telephone}
                </p>
              </div>
            </div>
            
            <div className="p-5 flex items-start gap-4">
              <div className="p-2 rounded-full bg-gray-100 mt-0.5">
                <CreditCard className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Paiement</h3>
                <p className="text-gray-600">
                  {reservation.montant.toLocaleString('fr-FR')} FCFA
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bouton d'action */}
        {reservation.statut === 'payé' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="pt-2"
          >
            <button
              onClick={() => navigate(`/compagnie/${realSlug}/receipt/${id}`, {
                state: { reservation, tripData: reservation.tripData || null, companyInfo }
              })}
              className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
              style={{ backgroundColor: primaryColor, color: textColor }}
            >
              <CheckCircle className="h-5 w-5" />
              Voir mon reçu
            </button>
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-sm text-gray-400 pt-6"
        >
          <p>Merci pour votre confiance</p>
          <p className="font-medium mt-1" style={{ color: primaryColor }}>
            {reservation.companyName}
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default ReservationDetailsPage;