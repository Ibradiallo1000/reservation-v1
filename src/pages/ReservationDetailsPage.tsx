import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  ChevronLeft, MapPin, Clock, Calendar, CheckCircle, XCircle, Loader2,
  User, Phone, CreditCard, Ticket, Heart
} from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { motion } from 'framer-motion';
import { hexToRgba, safeTextColor } from '../utils/color';

type ReservationStatus = 'en_attente' | 'paiement_en_cours' | 'preuve_recue' | 'payé' | 'annule';
type PaymentMethod = 'mobile_money' | 'carte_bancaire' | 'espèces' | 'autre';

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
  canal?: PaymentMethod;
  updatedAt?: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  primaryColor?: string;
  couleurPrimaire?: string;
  logoUrl?: string;
}

const STATUS_DISPLAY: Record<ReservationStatus, { 
  text: string; 
  color: string; 
  icon: React.ReactNode;
  bgColor: string;
}> = {
  en_attente: { 
    text: 'En attente', 
    color: 'text-amber-600',
    bgColor: 'bg-amber-50/80',
    icon: <Loader2 className="h-4 w-4 animate-spin" /> 
  },
  paiement_en_cours: { 
    text: 'Paiement en cours', 
    color: 'text-blue-600',
    bgColor: 'bg-blue-50/80',
    icon: <Loader2 className="h-4 w-4 animate-spin" /> 
  },
  preuve_recue: { 
    text: 'Preuve reçue', 
    color: 'text-violet-600',
    bgColor: 'bg-violet-50/80',
    icon: <CheckCircle className="h-4 w-4" /> 
  },
  payé: { 
    text: 'Confirmé', 
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50/80',
    icon: <CheckCircle className="h-4 w-4" /> 
  },
  annule: { 
    text: 'Annulé', 
    color: 'text-red-600',
    bgColor: 'bg-red-50/80',
    icon: <XCircle className="h-4 w-4" /> 
  },
};

const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  mobile_money: 'Mobile Money',
  carte_bancaire: 'Carte bancaire',
  espèces: 'Espèces',
  autre: 'Autre moyen'
};

const formatCompactDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
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
  const primaryColor = companyInfo?.couleurPrimaire || companyInfo?.primaryColor || fallbackColor;
  const textColor = safeTextColor(primaryColor);

  useEffect(() => {
    if (!id) { 
      setError('ID de réservation manquant'); 
      setLoading(false); 
      return; 
    }

    const unsub = onSnapshot(doc(db, 'reservations', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Reservation;
        setReservation({ 
          ...data, 
          id: docSnap.id,
          updatedAt: data.updatedAt || new Date().toISOString()
        });
      } else {
        setError('Réservation introuvable');
      }
      setLoading(false);
    }, (err) => { 
      console.error(err); 
      setError('Erreur de connexion'); 
      setLoading(false); 
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    const fetchCompany = async () => {
      if (locationCompanyInfo || !reservation?.companyId) return;
      
      try {
        const docRef = await getDoc(doc(db, 'companies', reservation.companyId));
        if (docRef.exists()) {
          const data = docRef.data() as CompanyInfo;
          setCompanyInfo({ 
            id: docRef.id, 
            name: data.name, 
            primaryColor: data.primaryColor, 
            logoUrl: data.logoUrl 
          });
        }
      } catch (err) {
        console.error("Erreur entreprise", err);
      }
    };
    
    fetchCompany();
  }, [reservation?.companyId, locationCompanyInfo]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50/50">
      <div className="flex flex-col items-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
        <p className="text-gray-600 text-sm">Chargement de votre réservation...</p>
      </div>
    </div>
  );

  if (error || !reservation) return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50/50">
      <div className="bg-white rounded-xl shadow-sm p-6 max-w-md w-full text-center">
        <XCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Erreur</h3>
        <p className="text-gray-600 mb-5">{error || 'Réservation introuvable'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-5 py-2 rounded-lg text-sm font-medium shadow-sm"
          style={{ backgroundColor: primaryColor, color: textColor }}
        >
          Retour
        </button>
      </div>
    </div>
  );

  const realSlug = slug || reservation.companySlug;
  const statusInfo = STATUS_DISPLAY[reservation.statut] || STATUS_DISPLAY.annule;
  const lastUpdated = reservation.updatedAt 
    ? new Date(reservation.updatedAt).toLocaleString('fr-FR', { timeStyle: 'short' })
    : 'Non disponible';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50/70 to-white">
      {/* Header élégant avec ombre douce */}
      <header
        className="sticky top-0 z-10 px-5 py-1 shadow-sm"
        style={{ 
          backgroundColor: hexToRgba(primaryColor, 0.98),
          color: textColor
        }}
      >
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button 
            onClick={() => navigate(-1)} 
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <h1 className="font-semibold text-base tracking-tight">Détails de réservation</h1>
          
          {companyInfo?.logoUrl ? (
            <LazyLoadImage 
              src={companyInfo.logoUrl} 
              alt="Logo" 
              className="h-8 w-8 rounded-full object-cover border"
              style={{ borderColor: hexToRgba(textColor, 0.2) }}
              effect="blur"
            />
          ) : (
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium border"
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

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Carte de statut élégante */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`p-3.5 rounded-xl ${statusInfo.bgColor} backdrop-blur-sm flex items-center gap-3 shadow-xs border`}
        >
          <div className={`p-2 rounded-lg ${statusInfo.color} bg-white/80`}>
            {statusInfo.icon}
          </div>
          <div>
            <p className="font-medium text-sm" style={{ color: statusInfo.color }}>
              {statusInfo.text}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500 font-mono bg-gray-100/70 px-2 py-0.5 rounded">
                {reservation.referenceCode}
              </span>
              <span className="text-xs text-gray-400">
                {lastUpdated}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Carte d'informations compacte et élégante */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-xs border overflow-hidden"
        >
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Ticket className="h-4 w-4" style={{ color: primaryColor }} />
              Détails du voyage
            </h2>
          </div>
          
          <div className="p-4 space-y-3.5">
            {/* Ligne 1 - Itinéraire et Date */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800">
                  {reservation.depart} → {reservation.arrivee}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-600">
                  {formatCompactDate(reservation.date)}
                </span>
              </div>
            </div>

            {/* Ligne 2 - Heure et Passager */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-600">
                  {reservation.heure}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-600">
                  {reservation.nomClient}
                </span>
              </div>
            </div>

            {/* Ligne 3 - Téléphone */}
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <span className="text-sm text-gray-600">
                {reservation.telephone}
              </span>
            </div>

            {/* Ligne 4 - Paiement */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800">
                  {reservation.montant.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
              {reservation.canal && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {PAYMENT_METHODS[reservation.canal]}
                </span>
              )}
            </div>

            {/* Aller-retour si applicable */}
            {reservation.tripType === 'aller-retour' && (
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg">
                Aller-retour • {reservation.seatsGo} place(s) aller • {reservation.seatsReturn} place(s) retour
              </div>
            )}
          </div>
        </motion.div>

        {/* Bouton avec animation subtile */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => navigate(`/${realSlug}/receipt/${id}`, {
              state: { reservation, companyInfo }
            })}
            className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm transition-all
              ${reservation.statut === 'payé' ? 'hover:opacity-90' : 'opacity-70 cursor-not-allowed'}`}
            style={{ backgroundColor: primaryColor, color: textColor }}
            disabled={reservation.statut !== 'payé'}
          >
            <CheckCircle className="h-4 w-4" />
            {reservation.statut === 'payé' ? 'Voir mon reçu' : 'Reçu disponible après confimation'}
          </button>
        </motion.div>

        {/* Message de remerciement élégant */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center pt-4"
        >
          <div className="flex items-center justify-center gap-1 text-sm text-gray-500">
            <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400" />
            <span>Merci pour votre confiance</span>
          </div>
          <p className="text-sm font-medium mt-1" style={{ color: primaryColor }}>
            {reservation.companyName || companyInfo?.name || 'Votre compagnie'}
          </p>
        </motion.div>
      </main>
    </div>
  );
};

export default ReservationDetailsPage;