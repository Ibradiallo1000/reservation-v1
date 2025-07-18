import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  ChevronLeft, MapPin, Clock, Calendar, CheckCircle, XCircle, Loader2,
  User, Phone, CreditCard, Ticket, Heart, ChevronRight, AlertCircle
} from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import { useWindowSize } from '@react-hook/window-size';
import { hexToRgba, safeTextColor } from '../utils/color';

type ReservationStatus = 'en_attente' | 'paiement_en_cours' | 'preuve_recue' | 'payé' | 'annule';
type PaymentMethod = 'mobile_money' | 'carte_bancaire' | 'espèces' | 'autre' | string;

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
  secondaryColor?: string;
}

const STATUS_DISPLAY: Record<ReservationStatus, { 
  text: string; 
  color: string; 
  icon: React.ReactNode;
  bgColor: string;
  description: string;
}> = {
  en_attente: { 
    text: 'En attente', 
    color: 'text-amber-600',
    bgColor: 'bg-amber-50/80',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    description: 'Votre réservation est en attente de traitement'
  },
  paiement_en_cours: { 
    text: 'Paiement en cours', 
    color: 'text-blue-600',
    bgColor: 'bg-blue-50/80',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    description: 'Votre paiement est en cours de vérification'
  },
  preuve_recue: { 
    text: 'Preuve reçue', 
    color: 'text-violet-600',
    bgColor: 'bg-violet-50/80',
    icon: <CheckCircle className="h-4 w-4" />,
    description: 'Preuve reçue - confirmation en cours (moins de 1h)'
  },
  payé: { 
    text: 'Confirmé', 
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50/80',
    icon: <CheckCircle className="h-4 w-4" />,
    description: '🎉 Votre réservation a été confirmée avec succès !'
  },
  annule: { 
    text: 'Annulé', 
    color: 'text-red-600',
    bgColor: 'bg-red-50/80',
    icon: <XCircle className="h-4 w-4" />,
    description: 'Cette réservation a été annulée'
  },
};

const PAYMENT_METHODS = {
  mobile_money: { 
    text: 'Mobile Money', 
    icon: <CreditCard className="h-4 w-4" /> 
  },
  carte_bancaire: { 
    text: 'Carte bancaire', 
    icon: <CreditCard className="h-4 w-4" /> 
  },
  espèces: { 
    text: 'Espèces', 
    icon: <CreditCard className="h-4 w-4" /> 
  },
  autre: { 
    text: 'Autre moyen', 
    icon: <CreditCard className="h-4 w-4" /> 
  }
} as const;

const getPaymentMethod = (method?: PaymentMethod) => {
  if (!method) return { text: 'Non précisé', icon: <CreditCard className="h-4 w-4" /> };
  return PAYMENT_METHODS[method as keyof typeof PAYMENT_METHODS] || 
         { text: method, icon: <CreditCard className="h-4 w-4" /> };
};

const STATUS_STEPS = [
  { id: 'en_attente', label: 'Enregistrée' },
  { id: 'paiement_en_cours', label: 'Paiement' },
  { id: 'preuve_recue', label: 'Vérification' },
  { id: 'payé', label: 'Confirmée' }
];

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
  const [showConfetti, setShowConfetti] = useState(false);
  const [width, height] = useWindowSize();

  const fallbackColor = '#3b82f6';
  const primaryColor = companyInfo?.couleurPrimaire || companyInfo?.primaryColor || fallbackColor;
  const secondaryColor = companyInfo?.secondaryColor || '#e0f2fe';
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
            secondaryColor: data.secondaryColor,
            couleurPrimaire: data.couleurPrimaire,
            logoUrl: data.logoUrl 
          });
        }
      } catch (err) {
        console.error("Erreur entreprise", err);
      }
    };
    
    fetchCompany();
  }, [reservation?.companyId, locationCompanyInfo]);

  useEffect(() => {
    if (reservation?.statut === 'payé') {
      const alreadyCelebrated = localStorage.getItem(`celebrated-${reservation.id}`);
      if (!alreadyCelebrated) {
        setShowConfetti(true);
        localStorage.setItem(`celebrated-${reservation.id}`, 'true');
        const timer = setTimeout(() => setShowConfetti(false), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [reservation?.statut, reservation?.id]);

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
  const lastUpdated = reservation.updatedAt && !isNaN(new Date(reservation.updatedAt).getTime())
  ? new Date(reservation.updatedAt).toLocaleString('fr-FR', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  : null;

  const currentStepIndex = STATUS_STEPS.findIndex(step => step.id === reservation.statut);
  const isConfirmed = reservation.statut === 'payé';
  const paymentMethod = getPaymentMethod(reservation.canal);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50/70 to-white pb-32">
      <AnimatePresence>
        {showConfetti && (
          <Confetti 
            width={width} 
            height={height}
            recycle={false}
            numberOfPieces={200}
            colors={[primaryColor, secondaryColor, '#ffffff']}
          />
        )}
      </AnimatePresence>

      {/* Header élégant avec ombre portée */}
      <header
        className="sticky top-0 z-10 px-5 py-3 shadow-sm"
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
        {/* Barre de progression du statut */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-4 shadow-xs border"
        >
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Statut de votre réservation</h2>
            <span className="text-xs text-gray-500">{lastUpdated}</span>
          </div>

          <div className="relative">
            {/* Ligne de progression */}
            <div className="absolute top-3 left-0 right-0 h-1 bg-gray-200 rounded-full z-0">
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${(currentStepIndex + 1) * 25}%`,
                  backgroundColor: primaryColor
                }}
              />
            </div>

            {/* Étapes */}
            <div className="relative z-10 flex justify-between">
              {STATUS_STEPS.map((step, index) => {
                const isActive = index <= currentStepIndex;
                const isCurrent = reservation.statut === step.id;
                const isVerificationInProgress = reservation.statut === 'preuve_recue' && step.id === 'preuve_recue';
                
                return (
                  <div key={step.id} className="flex flex-col items-center w-1/4">
                    <div 
                      className={`h-6 w-6 rounded-full flex items-center justify-center mb-1 transition-colors ${
                        isActive ? 'ring-4 ring-opacity-30' : ''
                      } ${isVerificationInProgress ? 'animate-pulse' : ''}`}
                      style={{
                        backgroundColor: isActive ? primaryColor : '#e5e7eb',
                        color: isActive ? textColor : '#6b7280',
                        border: isCurrent ? `2px solid ${textColor}` : 'none',
                      }}
                    >
                      {isActive ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-gray-400" />
                      )}
                    </div>
                    <span 
                      className={`text-xs text-center ${isActive ? 'font-medium text-gray-900' : 'text-gray-500'}`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Message de statut */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`p-4 rounded-xl flex items-start gap-3 ${statusInfo.bgColor}`}
        >
          <div className={`p-2 rounded-lg ${statusInfo.color} bg-white/80 flex-shrink-0`}>
            {statusInfo.icon}
          </div>
          <div>
            <p className="font-medium text-sm mb-1" style={{ color: statusInfo.color }}>
              {statusInfo.text}
            </p>
            <p className="text-xs text-gray-600">
              {statusInfo.description}
              {reservation.statut === 'preuve_recue' && (
                <span className="block mt-1 text-amber-600 text-xs flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Vérifiez vos SMS/email pour le reçu
                </span>
              )}
            </p>
          </div>
        </motion.div>

        {/* Carte d'informations */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-xs border overflow-hidden"
        >
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Ticket className="h-4 w-4" style={{ color: primaryColor }} />
              Détails du voyage
            </h2>
          </div>
          
          <div className="p-4 space-y-4">
            {/* Itinéraire */}
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                <MapPin className="h-4 w-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Itinéraire</p>
                <p className="text-sm font-medium text-gray-900">
                  {reservation.depart} <ChevronRight className="inline h-3 w-3 mx-1 text-gray-400" /> {reservation.arrivee}
                </p>
              </div>
            </div>

            {/* Date et heure */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                  <Calendar className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Date</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatCompactDate(reservation.date)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                  <Clock className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Heure</p>
                  <p className="text-sm font-medium text-gray-900">
                    {reservation.heure}
                  </p>
                </div>
              </div>
            </div>

            {/* Passager */}
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                <User className="h-4 w-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Passager</p>
                <p className="text-sm font-medium text-gray-900">
                  {reservation.nomClient}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {reservation.telephone}
                </p>
              </div>
            </div>

            {/* Paiement */}
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                {paymentMethod.icon}
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Paiement</p>
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-900">
                    {reservation.montant.toLocaleString('fr-FR')} FCFA
                  </p>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {paymentMethod.text}
                  </span>
                </div>
              </div>
            </div>

            {/* Détails supplémentaires */}
            {reservation.tripType === 'aller-retour' && (
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                <p className="font-medium text-gray-700 mb-1">Aller-retour</p>
                <div className="flex justify-between">
                  <span>Aller: {reservation.seatsGo} place(s)</span>
                  <span>Retour: {reservation.seatsReturn} place(s)</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Message de remerciement */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
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

      {/* Boutons d'action FIXÉS en bas */}
      <div 
        className="fixed bottom-0 left-0 w-full z-40 bg-white border-t border-gray-200 px-4 py-3 shadow-md"
      >
        <div className="max-w-md mx-auto space-y-2">
          <button
            onClick={() => navigate(`/${realSlug}/receipt/${id}`, {
              state: { reservation, companyInfo }
            })}
            className={`w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm transition-all
              ${isConfirmed ? 'hover:opacity-90' : 'opacity-70 cursor-not-allowed'}`}
            style={{ backgroundColor: primaryColor, color: textColor }}
            disabled={!isConfirmed}
          >
            <CheckCircle className="h-4 w-4" />
            {isConfirmed ? 'Voir mon billet' : 'Billet disponible après confirmation'}
          </button>

          {reservation.statut === 'annule' && (
            <button
              onClick={() => navigate(`/${realSlug}`)}
              className="w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm border transition-all"
              style={{ 
                borderColor: primaryColor,
                color: primaryColor
              }}
            >
              <Ticket className="h-4 w-4" />
              Nouvelle réservation
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReservationDetailsPage;